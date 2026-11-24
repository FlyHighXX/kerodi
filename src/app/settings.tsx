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
  BACKGROUND_MIN_INTERVAL_MINUTES,
  disableFreeriderNotifications,
  enableFreeriderNotifications,
  syncFreeriderNotificationState,
} from '@/lib/freerider-background-task';
import {
  fetchFreeriderLocations,
  matchesLocationQuery,
  type FreerideLocation,
} from '@/lib/freerider';
import {
  FREERIDER_PUSH_ENDPOINT,
  readStoredFreeriderPushToken,
  registerFreeriderPushToken,
  syncFreeriderPushPreferences,
  uploadFreeriderPushPreferences,
} from '@/lib/freerider-push';

const POLL_PRESETS = [5, 15, 60, 120];

export default function SettingsScreen() {
  const theme = useTheme();
  const {
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
  } = useFreeriderFilters();

  const [locations, setLocations] = useState<FreerideLocation[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);

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
    syncFreeriderNotificationState()
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
    readStoredFreeriderPushToken()
      .then((token) => {
        if (!active || !token) return;
        setPushToken(token);
        if (FREERIDER_PUSH_ENDPOINT) void syncFreeriderPushPreferences();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Keep the worker's filters in sync with the saved From/To search.
  useEffect(() => {
    if (!alertsEnabled || !pushToken || !FREERIDER_PUSH_ENDPOINT) return;
    const timer = setTimeout(() => {
      void uploadFreeriderPushPreferences(pushToken).then((ok) => {
        setAlertsError(ok ? null : 'Could not reach the push worker. Check its URL.');
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [alertsEnabled, fromQuery, pushToken, toQuery]);

  const toggleAlerts = useCallback(async () => {
    if (alertsBusy || Platform.OS === 'web') return;
    setAlertsBusy(true);
    setAlertsError(null);
    try {
      if (alertsEnabled) {
        await disableFreeriderNotifications();
        setAlertsEnabled(false);
      } else {
        const enabled = await enableFreeriderNotifications();
        setAlertsEnabled(enabled);
        if (!enabled) {
          setAlertsError(
            'Allow notifications and background activity for Kerodi in system settings, then try again.',
          );
          return;
        }

        try {
          const token = await registerFreeriderPushToken();
          setPushToken(token);
          if (token && FREERIDER_PUSH_ENDPOINT) {
            const ok = await uploadFreeriderPushPreferences(token);
            setAlertsError(ok ? null : 'Push alerts enabled, but the worker could not be reached.');
          }
        } catch {
          setAlertsError('Push alerts enabled, but this device could not register a token.');
        }
      }
    } catch {
      setAlertsError('Could not change notification settings on this device.');
    } finally {
      setAlertsBusy(false);
    }
  }, [alertsBusy, alertsEnabled]);

  const choosePreset = useCallback(
    (seconds: number) => setPollSeconds(seconds),
    [setPollSeconds],
  );

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
            <ThemedText type="smallBold" themeColor="textSecondary">
              AUTO REFRESH
            </ThemedText>
            <View style={styles.pollRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Poll every
              </ThemedText>
              <TextInput
                value={pollDraft}
                onChangeText={setPollDraft}
                onBlur={commitPollDraft}
                onSubmitEditing={commitPollDraft}
                keyboardType="number-pad"
                returnKeyType="done"
                maxLength={4}
                accessibilityLabel="Polling interval in seconds"
                style={[styles.secondsInput, { backgroundColor: theme.background, color: theme.text }]}
              />
              <ThemedText type="small" themeColor="textSecondary">
                seconds while the Freerider tab is open
              </ThemedText>
            </View>
            <View style={styles.chipRow}>
              {POLL_PRESETS.map((seconds) => {
                const active = seconds === pollSeconds;
                return (
                  <Pressable
                    key={seconds}
                    onPress={() => choosePreset(seconds)}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: active ? theme.backgroundSelected : theme.background },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
                      {seconds}s
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {pollSeconds < 15
                ? 'Short intervals send more requests to hertzfreerider.se.'
                : 'New offers are marked as they appear.'}
            </ThemedText>
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
                ? FREERIDER_PUSH_ENDPOINT
                  ? 'Fast push alerts follow your From/To search. A slow background check is kept as a fallback.'
                  : `Background checks follow your From/To search (about every ${BACKGROUND_MIN_INTERVAL_MINUTES} min). Add a worker URL for second-level push alerts.`
                : 'Get a notification when a new route matches your From/To search.'}
            </ThemedText>
            {alertsEnabled && pushToken && !FREERIDER_PUSH_ENDPOINT ? (
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
  pollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  secondsInput: {
    width: 64,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 15,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
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
