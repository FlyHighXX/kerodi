import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFreeriderFilters } from '@/hooks/use-freerider-filters';
import {
  fetchFreeriderLocations,
  matchesLocationQuery,
  type FreerideLocation,
} from '@/lib/freerider';
import {
  disableFreeriderPushAlerts,
  enableFreeriderPushAlerts,
  readStoredFreeriderPushToken,
  syncFreeriderPushAlertState,
  syncFreeriderPushPreferences,
  uploadFreeriderPushPreferences,
} from '@/lib/freerider-push';
import { checkWorkerHealth } from '@/lib/freerider-sessions';
import {
  defaultWorkerUrl,
  isValidWorkerUrl,
  readWorkerUrl,
  writeWorkerUrl,
} from '@/lib/freerider-worker-url';

export default function SettingsScreen() {
  const theme = useTheme();
  const { fromQuery, setFromQuery, toQuery, setToQuery, clearLocations } =
    useFreeriderFilters();

  const [locations, setLocations] = useState<FreerideLocation[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [workerUrlDraft, setWorkerUrlDraft] = useState('');
  const [workerUrlSaved, setWorkerUrlSaved] = useState('');
  const [workerUrlBusy, setWorkerUrlBusy] = useState(false);
  const [workerUrlError, setWorkerUrlError] = useState<string | null>(null);
  const [workerTestResult, setWorkerTestResult] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchFreeriderLocations()
      .then((result) => {
        if (active) setLocations(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    syncFreeriderPushAlertState()
      .then((enabled) => {
        if (active) setAlertsEnabled(enabled);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void readWorkerUrl().then((url) => {
      if (!active) return;
      setWorkerUrlDraft(url);
      setWorkerUrlSaved(url);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    readStoredFreeriderPushToken()
      .then((token) => {
        if (!active || !token) return;
        setPushToken(token);
        void syncFreeriderPushPreferences();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Keep the worker's filters in sync with the saved From/To search.
  useEffect(() => {
    if (!alertsEnabled || !pushToken || !workerUrlSaved) return;
    const timer = setTimeout(() => {
      void uploadFreeriderPushPreferences(pushToken).then((ok) => {
        setAlertsError(ok ? null : 'Could not reach the push worker. Check its URL.');
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [alertsEnabled, fromQuery, pushToken, toQuery, workerUrlSaved]);

  const toggleAlerts = useCallback(async () => {
    if (alertsBusy || Platform.OS === 'web') return;
    setAlertsBusy(true);
    setAlertsError(null);
    try {
      if (alertsEnabled) {
        await disableFreeriderPushAlerts();
        setAlertsEnabled(false);
      } else {
        const token = await enableFreeriderPushAlerts();
        setAlertsEnabled(Boolean(token));
        if (!token) {
          setAlertsError(
            'Allow notifications for Kerodi in system settings, then try again.',
          );
          return;
        }

        setPushToken(token);
        const ok = await uploadFreeriderPushPreferences(token);
        setAlertsError(
          ok
            ? null
            : workerUrlSaved
              ? 'Push alerts enabled, but the worker could not be reached.'
              : 'Push alerts enabled. Set the worker URL below to send them to the worker.',
        );
      }
    } catch {
      setAlertsError('Could not change notification settings on this device.');
    } finally {
      setAlertsBusy(false);
    }
  }, [alertsBusy, alertsEnabled, workerUrlSaved]);

  const saveWorkerUrl = useCallback(async () => {
    if (!isValidWorkerUrl(workerUrlDraft)) {
      setWorkerUrlError('Enter a full URL, for example http://192.168.1.171:8787');
      return;
    }
    setWorkerUrlBusy(true);
    setWorkerUrlError(null);
    setWorkerTestResult(null);
    try {
      const saved = await writeWorkerUrl(workerUrlDraft);
      setWorkerUrlDraft(saved);
      setWorkerUrlSaved(saved);
      if (pushToken) void syncFreeriderPushPreferences();
    } catch {
      setWorkerUrlError('Could not save the worker URL.');
    } finally {
      setWorkerUrlBusy(false);
    }
  }, [pushToken, workerUrlDraft]);

  const resetWorkerUrl = useCallback(async () => {
    setWorkerUrlBusy(true);
    setWorkerUrlError(null);
    setWorkerTestResult(null);
    try {
      await writeWorkerUrl('');
      const fallback = defaultWorkerUrl();
      setWorkerUrlDraft(fallback);
      setWorkerUrlSaved(fallback);
    } catch {
      setWorkerUrlError('Could not reset the worker URL.');
    } finally {
      setWorkerUrlBusy(false);
    }
  }, []);

  const testWorkerUrl = useCallback(async () => {
    setWorkerUrlError(null);
    if (workerUrlDraft !== workerUrlSaved) {
      setWorkerTestResult('Save the URL before testing it.');
      return;
    }
    setWorkerUrlBusy(true);
    setWorkerTestResult(null);
    try {
      const ok = await checkWorkerHealth();
      setWorkerTestResult(
        ok ? 'Worker reachable.' : 'Could not reach the worker. Check the URL and network.',
      );
    } finally {
      setWorkerUrlBusy(false);
    }
  }, [workerUrlDraft, workerUrlSaved]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Freerider settings</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Used by the routes tab and the new-route watcher.
          </ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.rowBetween}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                SEARCH LOCATIONS
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {locations.length > 0 ? `${locations.length} stores` : 'Loading stores…'}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Type a city or part of a name. “Stockholm” matches every Stockholm store.
            </ThemedText>

            <LocationField
              label="FROM"
              value={fromQuery}
              onChangeValue={setFromQuery}
              locations={locations}
              placeholder="e.g. Stockholm"
            />
            <LocationField
              label="TO"
              value={toQuery}
              onChangeValue={setToQuery}
              locations={locations}
              placeholder="e.g. Göteborg"
            />

            {fromQuery.length > 0 || toQuery.length > 0 ? (
              <Pressable onPress={clearLocations} hitSlop={8}>
                <ThemedText type="link">Clear places</ThemedText>
              </Pressable>
            ) : null}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.rowBetween}>
              <ThemedText type="smallBold">New-route alerts</ThemedText>
              <Pressable
                onPress={() => void toggleAlerts()}
                disabled={alertsBusy || Platform.OS === 'web'}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.backgroundSelected },
                  (alertsBusy || Platform.OS === 'web') && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold">
                  {alertsBusy ? '…' : alertsEnabled ? 'Turn off' : 'Turn on'}
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {alertsEnabled
                ? 'Push alerts are sent by the worker whenever a new route matches your From/To search.'
                : 'Get a notification when a new route matches your From/To search.'}
            </ThemedText>
            {alertsEnabled && pushToken && !workerUrlSaved ? (
              <View style={styles.tokenBlock}>
                <ThemedText type="small" themeColor="textSecondary">
                  Push token for the worker:
                </ThemedText>
                <ThemedText type="code" selectable>
                  {pushToken}
                </ThemedText>
              </View>
            ) : null}
            {alertsError ? (
              <ThemedText type="small" themeColor="textSecondary">
                {alertsError}
              </ThemedText>
            ) : null}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Worker connection</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Address of the machine running the Freerider worker. Use its LAN address at home or
              its VPN address when you are away.
            </ThemedText>
            <TextInput
              value={workerUrlDraft}
              onChangeText={setWorkerUrlDraft}
              placeholder="http://192.168.1.171:8787"
              placeholderTextColor={theme.textSecondary}
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="url"
              style={[styles.searchInput, { backgroundColor: theme.background, color: theme.text }]}
            />
            <View style={styles.workerActions}>
              <Pressable
                onPress={() => void saveWorkerUrl()}
                disabled={workerUrlBusy}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.backgroundSelected },
                  workerUrlBusy && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold">{workerUrlBusy ? '…' : 'Save'}</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => void testWorkerUrl()}
                disabled={workerUrlBusy || workerUrlDraft !== workerUrlSaved}
                hitSlop={8}>
                <ThemedText type="link">Test</ThemedText>
              </Pressable>
              <Pressable onPress={() => void resetWorkerUrl()} disabled={workerUrlBusy} hitSlop={8}>
                <ThemedText type="link">Reset</ThemedText>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {workerUrlSaved ? `Saved: ${workerUrlSaved}` : 'No worker URL saved yet.'}
            </ThemedText>
            {workerUrlError ? (
              <ThemedText type="small" themeColor="textSecondary">
                {workerUrlError}
              </ThemedText>
            ) : null}
            {workerTestResult ? (
              <ThemedText type="small" themeColor="textSecondary">
                {workerTestResult}
              </ThemedText>
            ) : null}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

type LocationFieldProps = {
  label: string;
  value: string;
  onChangeValue: (value: string) => void;
  locations: FreerideLocation[];
  placeholder: string;
};

function LocationField({
  label,
  value,
  onChangeValue,
  locations,
  placeholder,
}: LocationFieldProps) {
  const theme = useTheme();
  const [showAll, setShowAll] = useState(false);

  const { suggestions, totalMatches } = useMemo(() => {
    const matches = value.trim()
      ? locations.filter((location) => matchesLocationQuery(location, value))
      : locations;
    return {
      totalMatches: matches.length,
      suggestions:
        !value.trim() && !showAll ? [] : showAll ? matches : matches.slice(0, 10),
    };
  }, [locations, showAll, value]);

  return (
    <View style={styles.locationField}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeValue}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoCorrect={false}
        autoCapitalize="none"
        style={[styles.searchInput, { backgroundColor: theme.background, color: theme.text }]}
      />

      {suggestions.length > 0 ? (
        <ScrollView style={styles.suggestionList} nestedScrollEnabled showsVerticalScrollIndicator>
          {suggestions.map((location) => (
            <Pressable
              key={location.tracCode}
              onPress={() => {
                onChangeValue(location.name);
                setShowAll(false);
              }}
              style={({ pressed }) => [
                styles.suggestionRow,
                pressed && styles.pressed,
              ]}>
              <ThemedText type="small" style={styles.suggestionName}>
                {location.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[location.city, location.country?.toUpperCase()].filter(Boolean).join(', ')}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {totalMatches > 10 || showAll ? (
        <Pressable onPress={() => setShowAll((current) => !current)} hitSlop={8}>
          <ThemedText type="link">
            {showAll ? 'Show fewer' : `Show all ${totalMatches} stores`}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
  },
  header: {
    paddingTop: Spacing.four,
    gap: Spacing.half,
  },
  content: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  workerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  tokenBlock: {
    gap: Spacing.half,
  },
  searchInput: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  locationField: {
    gap: Spacing.one,
  },
  suggestionList: {
    maxHeight: 180,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  suggestionName: {
    flex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
