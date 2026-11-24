import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchFreeriderLocations,
  fetchFreeriderRoutes,
  type FreerideLocation,
  type RouteOffer,
} from '@/lib/freerider';
import { readSeenRouteIds, writeSeenRouteIds } from '@/lib/freerider-storage';

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
  const [hydrated, setHydrated] = useState(false);

  const seenRef = useRef<Set<number> | null>(null);
  const lastAttemptRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let active = true;

    readSeenRouteIds()
      .then((ids) => {
        if (!active) return;
        seenRef.current = ids;
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
      const previous = seenRef.current;
      const appeared = previous ? next.filter((route) => !previous.has(route.id)) : [];

      seenRef.current = new Set(next.map((route) => route.id));
      setRoutes(next);
      // Prepend so `newIds` doubles as a newest-first discovery order for the UI.
      const appearedIds = appeared.map((route) => route.id);
      setNewIds((current) => [
        ...appearedIds,
        ...current.filter((id) => !appearedIds.includes(id)),
      ]);

      const now = Date.now();
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
    setNewIds([]);
    void writeSeenRouteIds(seenRef.current);
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
    hydrated,
    refresh,
    markAllSeen,
  };
}
