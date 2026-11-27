import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFreeriderFilters } from '@/hooks/use-freerider-filters';
import { useFreeriderViewSettings } from '@/hooks/use-freerider-view-settings';
import {
  fetchFreeriderLocations,
  matchesLocationQuery,
  type FreerideLocation,
} from '@/lib/freerider';
import { checkWorkerHealth } from '@/lib/freerider-sessions';
import {
  defaultWorkerUrl,
  isValidWorkerUrl,
  readWorkerUrl,
  writeWorkerUrl,
} from '@/lib/freerider-worker-url';
import { useI18n } from '@/providers/locale-provider';

export default function SettingsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { fromQuery, setFromQuery, toQuery, setToQuery, clearLocations } =
    useFreeriderFilters();
  const {
    showUnavailable,
    setShowUnavailable,
    showExpired,
    setShowExpired,
    excludeNorway,
    setExcludeNorway,
  } = useFreeriderViewSettings();

  const [locations, setLocations] = useState<FreerideLocation[]>([]);
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
    void readWorkerUrl().then((url) => {
      if (!active) return;
      setWorkerUrlDraft(url);
      setWorkerUrlSaved(url);
    });
    return () => {
      active = false;
    };
  }, []);

  const saveWorkerUrl = useCallback(async () => {
    if (!isValidWorkerUrl(workerUrlDraft)) {
      setWorkerUrlError(t('Enter a full URL, for example http://10.0.0.8:8787'));
      return;
    }
    setWorkerUrlBusy(true);
    setWorkerUrlError(null);
    setWorkerTestResult(null);
    try {
      const saved = await writeWorkerUrl(workerUrlDraft);
      setWorkerUrlDraft(saved);
      setWorkerUrlSaved(saved);
    } catch {
      setWorkerUrlError(t('Could not save the worker URL.'));
    } finally {
      setWorkerUrlBusy(false);
    }
  }, [workerUrlDraft, t]);

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
      setWorkerUrlError(t('Could not reset the worker URL.'));
    } finally {
      setWorkerUrlBusy(false);
    }
  }, [t]);

  const testWorkerUrl = useCallback(async () => {
    setWorkerUrlError(null);
    if (workerUrlDraft !== workerUrlSaved) {
      setWorkerTestResult(t('Save the URL before testing it.'));
      return;
    }
    setWorkerUrlBusy(true);
    setWorkerTestResult(null);
    try {
      const ok = await checkWorkerHealth();
      setWorkerTestResult(
        ok
          ? t('Worker reachable.')
          : t('Could not reach the worker. Check the URL and network.'),
      );
    } finally {
      setWorkerUrlBusy(false);
    }
  }, [workerUrlDraft, workerUrlSaved, t]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">{t('Freerider settings')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Used by the routes tab and the new-route watcher.')}
          </ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.rowBetween}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('SEARCH LOCATIONS')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {locations.length > 0
                  ? t('{{count}} stores', { count: locations.length })
                  : t('Loading stores…')}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {t('Type a city or part of a name. “Stockholm” matches every Stockholm store.')}
            </ThemedText>

            <LocationField
              label={t('FROM')}
              value={fromQuery}
              onChangeValue={setFromQuery}
              locations={locations}
              placeholder={t('e.g. Stockholm')}
            />
            <LocationField
              label={t('TO')}
              value={toQuery}
              onChangeValue={setToQuery}
              locations={locations}
              placeholder={t('e.g. Göteborg')}
            />

            {fromQuery.length > 0 || toQuery.length > 0 ? (
              <Pressable onPress={clearLocations} hitSlop={8}>
                <ThemedText type="link">{t('Clear places')}</ThemedText>
              </Pressable>
            ) : null}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{t('Route list')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t(
                'Available routes are sorted A–Z by pickup location, then return location. New detections stay pinned to the top.',
              )}
            </ThemedText>
            <ToggleRow
              label={t('Show unavailable routes')}
              value={showUnavailable}
              onChange={setShowUnavailable}
            />
            <ToggleRow
              label={t('Show expired routes')}
              value={showExpired}
              onChange={setShowExpired}
            />
            <ToggleRow
              label={t('Exclude Norway (NO)')}
              value={excludeNorway}
              onChange={setExcludeNorway}
            />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{t('Worker connection')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t(
                'Address of the machine running the Freerider worker. Fresh installs are pre-filled with http://10.0.0.8:8787 and saved per device. Tailscale must be connected; no worker token is needed. Notifications are set up automatically the first time you start a listener on the Freerider tab.',
              )}
            </ThemedText>
            <TextInput
              value={workerUrlDraft}
              onChangeText={setWorkerUrlDraft}
              placeholder="http://10.0.0.8:8787"
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
                <ThemedText type="smallBold">{workerUrlBusy ? '…' : t('Save')}</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => void testWorkerUrl()}
                disabled={workerUrlBusy || workerUrlDraft !== workerUrlSaved}
                hitSlop={8}>
                <ThemedText type="link">{t('Test')}</ThemedText>
              </Pressable>
              <Pressable onPress={() => void resetWorkerUrl()} disabled={workerUrlBusy} hitSlop={8}>
                <ThemedText type="link">{t('Reset')}</ThemedText>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {workerUrlSaved
                ? t('Saved: {{url}}', { url: workerUrlSaved })
                : t('No worker URL saved yet.')}
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

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.toggleRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Pressable
        onPress={() => onChange(!value)}
        style={({ pressed }) => [
          styles.toggleButton,
          { backgroundColor: value ? theme.backgroundSelected : theme.background },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold" themeColor={value ? 'text' : 'textSecondary'}>
          {t(value ? 'On' : 'Off')}
        </ThemedText>
      </Pressable>
    </View>
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
  const { t } = useI18n();
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
                {[location.city ? t(location.city) : location.city, location.country?.toUpperCase()]
                  .filter(Boolean)
                  .join(', ')}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {totalMatches > 10 || showAll ? (
        <Pressable onPress={() => setShowAll((current) => !current)} hitSlop={8}>
          <ThemedText type="link">
            {showAll ? t('Show fewer') : t('Show all {{count}} stores', { count: totalMatches })}
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  toggleButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
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
