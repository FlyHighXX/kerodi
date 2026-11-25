import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchFreeriderLocations,
  fetchFreeriderRoutes,
  type FreerideLocation,
  type RouteOffer,
} from '@/lib/freerider';
import {
  historyRecords,
  readRouteHistory,
  reconcileRouteHistory,
  type RouteHistoryRecord,
} from '@/lib/freerider-history';
import { syncWorkerRouteHistory } from '@/lib/freerider-sessions';
import {
  readNewRouteIds,
  readSeenRouteIds,
  writeNewRouteIds,
  writeSeenRouteIds,
} from '@/lib/freerider-storage';

const STALE_AFTER_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;

/**
 * Fetches the Hertz Freerider feed when the tab is opened or refreshed.
 *
 * New-route alerts are handled by the external push worker, not by this hook.
 * This hook only loads data for display and highlights routes that appeared
 * since the app last stored its seen list.
 */
export function useFreeriderRoutes() {
  const [routes, setRoutes] = useState<RouteOffer[]>([]);
  const [locations, setLocations] = useState<FreerideLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [newIds, setNewIds] = useState<number[]>([]);
  const [history, setHistory] = useState<RouteHistoryRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const seenRef = useRef<Set<number> | null>(null);
  const newIdsRef = useRef<number[]>([]);
  const baselineRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let active = true;

    Promise.all([readSeenRouteIds(), readRouteHistory(), readNewRouteIds()])
      .then(([ids, storedHistory, storedNewIds]) => {
        if (!active) return;
        seenRef.current = ids;
        newIdsRef.current = storedNewIds;
        baselineRef.current = storedHistory.length === 0;
        setNewIds(storedNewIds);
        setHistory(storedHistory);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  // The full store list powers from/to suggestions even for places with no
  // active route right now. It only needs loading once per mount.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetchFreeriderLocations(controller.signal)
      .then((list) => {
        if (active) setLocations(list);
      })
      .catch(() => {});

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (inFlightRef.current) return;
    if (!options?.force && Date.now() - lastAttemptRef.current < STALE_AFTER_MS) return;

    inFlightRef.current = true;
    lastAttemptRef.current = Date.now();
    setRefreshing(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const next = await fetchFreeriderRoutes(controller.signal);
      const now = Date.now();
      const previous = seenRef.current;
      // The first feed load is a baseline; routes present then are not "new".
      const appeared =
        previous && !baselineRef.current
          ? next.filter((route) => !previous.has(route.id))
          : [];
      baselineRef.current = false;
      const currentIds = new Set(next.map((route) => route.id));

      seenRef.current = new Set(currentIds);
      setRoutes(next);
      // Prepend so `newIds` doubles as a newest-first detection order for the UI.
      // Keep unread ids across app updates, but drop routes that left the feed.
      const appearedIds = appeared.map((route) => route.id);
      const mergedNewIds = [
        ...appearedIds,
        ...newIdsRef.current.filter((id) => currentIds.has(id) && !appearedIds.includes(id)),
      ];
      newIdsRef.current = mergedNewIds;
      setNewIds(mergedNewIds);
      void writeNewRouteIds(mergedNewIds);

      const localHistory = await reconcileRouteHistory(next, now);
      setHistory(historyRecords(localHistory));
      void syncWorkerRouteHistory()
        .then(setHistory)
        .catch(() => {});

      setLastUpdated(now);
      void writeSeenRouteIds(seenRef.current);
    } catch (cause) {
      setError(
        controller.signal.aborted
          ? 'The request timed out. Check your connection and try again.'
          : cause instanceof Error
            ? cause.message
            : 'Could not load routes.',
      );
    } finally {
      clearTimeout(timeout);
      inFlightRef.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const markAllSeen = useCallback(() => {
    seenRef.current = new Set(routes.map((route) => route.id));
    newIdsRef.current = [];
    setNewIds([]);
    void writeSeenRouteIds(seenRef.current);
    void writeNewRouteIds([]);
  }, [routes]);

  // Fetch once when the tab becomes visible. Pull-to-refresh and "Check now"
  // remain available for manual checks.
  useFocusEffect(
    useCallback(() => {
      if (hydrated) void refresh();
    }, [hydrated, refresh]),
  );

  return {
    routes,
    locations,
    loading,
    refreshing,
    error,
    lastUpdated,
    newIds,
    history,
    hydrated,
    refresh,
    markAllSeen,
  };
}
