import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchFreeriderLocations, type FreerideLocation, type RouteOffer } from '@/lib/freerider';
import {
  clearLocalRouteHistory,
  latestHistoryUpdatedAt,
  mergeWorkerHistory,
  type RouteHistoryRecord,
} from '@/lib/freerider-history';
import { fetchWorkerRouteHistory, fetchWorkerRoutes } from '@/lib/freerider-sessions';
import {
  LOCATIONS_CACHE_TTL_MS,
  readCachedLocations,
  readNewRouteIds,
  readSeenRouteIds,
  writeCachedLocations,
  writeNewRouteIds,
  writeSeenRouteIds,
} from '@/lib/freerider-storage';
import { translate } from '@/lib/i18n';

const STALE_AFTER_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;

/**
 * Reads the worker's cached Hertz Freerider feed when the tab is opened or
 * refreshed. The app never polls hertzfreerider directly; the worker throttles
 * refreshes and serves all listeners from one fetch. The displayed update time
 * comes from the worker's last real hertz fetch, not from local cache reads.
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
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());
  const [newIds, setNewIds] = useState<number[]>([]);
  const [history, setHistory] = useState<RouteHistoryRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const seenRef = useRef<Set<number> | null>(null);
  const newIdsRef = useRef<number[]>([]);
  const historyRef = useRef<RouteHistoryRecord[]>([]);
  const historyUpdatedAtRef = useRef(0);
  const lastUpdatedRef = useRef<number | null>(null);
  const cooldownUntilRef = useRef<number | null>(null);
  const baselineRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let active = true;

    Promise.all([readSeenRouteIds(), readNewRouteIds()])
      .then(([ids, storedNewIds]) => {
        if (!active) return;
        seenRef.current = ids;
        newIdsRef.current = storedNewIds;
        baselineRef.current = ids.size === 0;
        setNewIds(storedNewIds);
        void clearLocalRouteHistory();
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
  // active route right now. Cache it for a week to avoid repeat public calls.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    void (async () => {
      const cached = await readCachedLocations();
      if (cached?.locations.length && active) setLocations(cached.locations);
      if (cached && Date.now() - cached.fetchedAt < LOCATIONS_CACHE_TTL_MS) return;

      try {
        const list = await fetchFreeriderLocations(controller.signal);
        await writeCachedLocations(list);
        if (active) setLocations(list);
      } catch {
        // Keep the cached list if the location endpoint is unavailable.
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setCooldownNow(now);
      if (now >= (cooldownUntilRef.current ?? 0)) {
        cooldownUntilRef.current = null;
        setCooldownUntil(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

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
      const [routesResult, historyResult] = await Promise.allSettled([
        fetchWorkerRoutes({ force: options?.force, signal: controller.signal }),
        fetchWorkerRouteHistory(historyUpdatedAtRef.current, controller.signal),
      ]);
      if (routesResult.status === 'rejected') throw routesResult.reason;
      const { routes: next, fetchedAt, nextAllowedAt } = routesResult.value;
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

      if (historyResult.status === 'fulfilled') {
        const incoming = historyResult.value;
        const merged = mergeWorkerHistory(historyRef.current, incoming);
        historyRef.current = merged;
        historyUpdatedAtRef.current = Math.max(
          historyUpdatedAtRef.current,
          latestHistoryUpdatedAt(incoming),
        );
        setHistory(merged);
      }

      // Only move the visible timestamp when the worker reports a newer real
      // hertz fetch. Cache reads and throttled checks leave it untouched.
      if (fetchedAt && (lastUpdatedRef.current === null || fetchedAt > lastUpdatedRef.current)) {
        lastUpdatedRef.current = fetchedAt;
        setLastUpdated(fetchedAt);
      }
      const nextCooldown = nextAllowedAt && nextAllowedAt > Date.now() ? nextAllowedAt : null;
      cooldownUntilRef.current = nextCooldown;
      setCooldownNow(Date.now());
      setCooldownUntil(nextCooldown);
      void writeSeenRouteIds(seenRef.current);
    } catch (cause) {
      setError(
        controller.signal.aborted
          ? translate('The request timed out. Check your connection and try again.')
          : cause instanceof Error
            ? cause.message
            : translate('Could not load routes.'),
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

  // Fetch once when the tab becomes visible. Pull-to-refresh remains the only
  // manual check.
  useFocusEffect(
    useCallback(() => {
      if (hydrated) void refresh();
    }, [hydrated, refresh]),
  );

  const cooldownSeconds = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - cooldownNow) / 1000))
    : 0;

  return {
    routes,
    locations,
    loading,
    refreshing,
    error,
    lastUpdated,
    cooldownSeconds,
    newIds,
    history,
    hydrated,
    refresh,
    markAllSeen,
  };
}
