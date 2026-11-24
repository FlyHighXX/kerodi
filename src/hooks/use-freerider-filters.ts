import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { DEFAULT_POLL_SECONDS } from '@/hooks/use-freerider-routes';
import {
  readLocationFilters,
  readPollSeconds,
  writeLocationFilters,
  writePollSeconds,
} from '@/lib/freerider-storage';

export function clampPollSeconds(value: number) {
  return Math.min(3600, Math.max(1, Math.round(value)));
}

/**
 * Shared, persisted Freerider search settings. Both the routes tab and the
 * settings tab use this hook, reloading whenever a tab gains focus so changes
 * made in Settings appear immediately on the routes screen.
 */
export function useFreeriderFilters() {
  const [pollSeconds, setPollSecondsState] = useState(DEFAULT_POLL_SECONDS);
  const [pollDraft, setPollDraft] = useState(String(DEFAULT_POLL_SECONDS));
  const [fromQuery, setFromQueryState] = useState('');
  const [toQuery, setToQueryState] = useState('');
  const [ready, setReady] = useState(false);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const [filters, storedSeconds] = await Promise.all([
      readLocationFilters(),
      readPollSeconds(),
    ]);
    if (!mounted.current) return;

    setFromQueryState(filters.from);
    setToQueryState(filters.to);
    const seconds = clampPollSeconds(storedSeconds ?? DEFAULT_POLL_SECONDS);
    setPollSecondsState(seconds);
    setPollDraft(String(seconds));
    setReady(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      mounted.current = true;
      void reload();
      return () => {
        mounted.current = false;
      };
    }, [reload]),
  );

  const setPollSeconds = useCallback(
    (value: number) => {
      const seconds = clampPollSeconds(value);
      setPollSecondsState(seconds);
      setPollDraft(String(seconds));
      if (ready) void writePollSeconds(seconds);
    },
    [ready],
  );

  const commitPollDraft = useCallback(() => {
    const value = Number(pollDraft);
    if (!Number.isFinite(value) || value <= 0) {
      setPollDraft(String(pollSeconds));
      return;
    }
    setPollSeconds(value);
  }, [pollDraft, pollSeconds, setPollSeconds]);

  const setFromQuery = useCallback(
    (value: string) => {
      setFromQueryState(value);
      if (ready) void writeLocationFilters({ from: value, to: toQuery });
    },
    [ready, toQuery],
  );

  const setToQuery = useCallback(
    (value: string) => {
      setToQueryState(value);
      if (ready) void writeLocationFilters({ from: fromQuery, to: value });
    },
    [fromQuery, ready],
  );

  const clearLocations = useCallback(() => {
    setFromQueryState('');
    setToQueryState('');
    if (ready) void writeLocationFilters({ from: '', to: '' });
  }, [ready]);

  return {
    ready,
    pollSeconds,
    pollDraft,
    setPollDraft,
    setPollSeconds,
    commitPollDraft,
    fromQuery,
    setFromQuery,
    toQuery,
    setToQuery,
    clearLocations,
  };
}
