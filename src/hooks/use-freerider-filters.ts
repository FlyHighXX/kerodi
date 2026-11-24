import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { readLocationFilters, writeLocationFilters } from '@/lib/freerider-storage';

/**
 * Shared, persisted Freerider search settings. Both the routes tab and the
 * settings tab use this hook, reloading whenever a tab gains focus so changes
 * made in Settings appear immediately on the routes screen.
 */
export function useFreeriderFilters() {
  const [fromQuery, setFromQueryState] = useState('');
  const [toQuery, setToQueryState] = useState('');
  const [ready, setReady] = useState(false);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const filters = await readLocationFilters();
    if (!mounted.current) return;
    setFromQueryState(filters.from);
    setToQueryState(filters.to);
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
    fromQuery,
    setFromQuery,
    toQuery,
    setToQuery,
    clearLocations,
  };
}
