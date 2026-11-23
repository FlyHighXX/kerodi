import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  buildRoutePairs,
  fetchFreeriderRoutes,
  type RouteOffer,
  type RoutePair,
} from '@/lib/freerider';

const SEEN_KEY = 'kerodi.freerider.seen.v1';
export const DEFAULT_POLL_SECONDS = 120;
const MIN_POLL_MS = 1000;
const STALE_AFTER_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;

type Options = {
  /** How often to check for new routes while the tab is visible. */
  pollIntervalMs?: number;
};

/**
 * Fetches the Hertz Freerider feed while the tab is visible, polls for changes,
 * and remembers which offer ids were already seen so new ones can be highlighted.
 */
export function useFreeriderRoutes({
  pollIntervalMs = DEFAULT_POLL_SECONDS * 1000,
}: Options = {}) {
  const intervalMs = Math.max(MIN_POLL_MS, pollIntervalMs);
  const [routes, setRoutes] = useState<RouteOffer[]>([]);
  const [pairs, setPairs] = useState<RoutePair[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [newIds, setNewIds] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const seenRef = useRef<Set<number> | null>(null);
  const lastUpdatedRef = useRef(0);
  const lastAttemptRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          seenRef.current = new Set(parsed.filter((id): id is number => typeof id === 'number'));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(
    async (options?: { force?: boolean }) => {
      // Use the shorter of the feed's stale window and the chosen poll interval,
      // so focusing the tab never delays a fast polling schedule.
      const staleAfter = Math.min(STALE_AFTER_MS, intervalMs);
      if (inFlightRef.current) return;
      if (!options?.force && Date.now() - lastAttemptRef.current < staleAfter) return;

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
        setPairs(buildRoutePairs(next));
        setNewIds((current) => [
          ...new Set([...current, ...appeared.map((route) => route.id)]),
        ]);

        const now = Date.now();
        lastUpdatedRef.current = now;
        setLastUpdated(now);
        AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current])).catch(() => {});
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
    },
    [intervalMs],
  );

  const markAllSeen = useCallback(() => {
    seenRef.current = new Set(routes.map((route) => route.id));
    setNewIds([]);
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current])).catch(() => {});
  }, [routes]);

  // Refresh on focus, then poll while the tab stays in the foreground.
  useFocusEffect(
    useCallback(() => {
      if (!hydrated) return;

      void refresh();
      const interval = setInterval(() => void refresh({ force: true }), intervalMs);
      const onAppState = (state: AppStateStatus) => {
        if (state === 'active') void refresh();
      };
      const subscription = AppState.addEventListener('change', onAppState);

      return () => {
        clearInterval(interval);
        subscription.remove();
      };
    }, [hydrated, intervalMs, refresh]),
  );

  return {
    routes,
    pairs,
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
