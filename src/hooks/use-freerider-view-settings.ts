import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_VIEW_SETTINGS,
  readViewSettings,
  writeViewSettings,
  type FreeriderViewSettings,
} from '@/lib/freerider-storage';

/**
 * Local display preferences for the Freerider route list. These are separate
 * from the From/To search sent to the worker, so changing them does not affect
 * alerts.
 */
export function useFreeriderViewSettings() {
  const [settings, setSettings] = useState<FreeriderViewSettings>(DEFAULT_VIEW_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const stored = await readViewSettings();
    if (!mounted.current) return;
    setSettings(stored);
    setHydrated(true);
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

  useEffect(() => {
    if (hydrated) void writeViewSettings(settings);
  }, [hydrated, settings]);

  const update = useCallback((patch: Partial<FreeriderViewSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  return {
    ...settings,
    setShowUnavailable: (showUnavailable: boolean) => update({ showUnavailable }),
    setShowExpired: (showExpired: boolean) => update({ showExpired }),
    setExcludeNorway: (excludeNorway: boolean) => update({ excludeNorway }),
  };
}
