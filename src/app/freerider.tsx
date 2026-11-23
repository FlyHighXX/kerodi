import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FreeriderRouteLink } from '@/components/freerider-route-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_POLL_SECONDS, useFreeriderRoutes } from '@/hooks/use-freerider-routes';
import {
  BACKGROUND_MIN_INTERVAL_MINUTES,
  disableFreeriderNotifications,
  enableFreeriderNotifications,
  syncFreeriderNotificationState,
} from '@/lib/freerider-background-task';
import {
  buildFreeriderRouteUrl,
  filterRoutes,
  formatDuration,
  formatLocalDateTime,
  matchesLocationQuery,
  type FreerideLocation,
  type RouteOffer,
} from '@/lib/freerider';
import {
  readLocationFilters,
  readPollSeconds,
  writeLocationFilters,
  writePollSeconds,
} from '@/lib/freerider-storage';

const POLL_PRESETS = [5, 15, 60, 120];

function clampPollSeconds(value: number) {
  return Math.min(3600, Math.max(1, Math.round(value)));
}

function formatClock(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FreeriderScreen() {
  const theme = useTheme();
  const [pollSeconds, setPollSeconds] = useState(DEFAULT_POLL_SECONDS);
  const [pollDraft, setPollDraft] = useState(String(DEFAULT_POLL_SECONDS));
  const [pollReady, setPollReady] = useState(false);
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [filtersReady, setFiltersReady] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const {
    routes,
    locations,
    loading,
    refreshing,
    error,
    lastUpdated,
    newIds,
    refresh,
    markAllSeen,
  } = useFreeriderRoutes({ pollIntervalMs: pollSeconds * 1000 });

  // Restore the from/to search once, on mount. The background task reads the
  // same keys so notifications follow these filters.
  useEffect(() => {
    let active = true;
    readLocationFilters()
      .then((filters) => {
        if (!active) return;
        setFromQuery(filters.from);
        setToQuery(filters.to);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setFiltersReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    void writeLocationFilters({ from: fromQuery, to: toQuery });
  }, [filtersReady, fromQuery, toQuery]);

  // Restore the polling interval once, on mount.
  useEffect(() => {
    let active = true;
    readPollSeconds()
      .then((value) => {
        if (!active || value === null) return;
        const seconds = clampPollSeconds(value);
        setPollSeconds(seconds);
        setPollDraft(String(seconds));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setPollReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!pollReady) return;
    void writePollSeconds(pollSeconds);
  }, [pollReady, pollSeconds]);

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
        }
      }
    } catch {
      setAlertsError('Could not change notification settings on this device.');
    } finally {
      setAlertsBusy(false);
    }
  }, [alertsBusy, alertsEnabled]);

  const commitPollDraft = useCallback(() => {
    const value = Number(pollDraft);
    if (!Number.isFinite(value) || value <= 0) {
      setPollDraft(String(pollSeconds));
      return;
    }
    const seconds = clampPollSeconds(value);
    setPollSeconds(seconds);
    setPollDraft(String(seconds));
  }, [pollDraft, pollSeconds]);

  const choosePreset = useCallback((seconds: number) => {
    setPollSeconds(seconds);
    setPollDraft(String(seconds));
  }, []);

  const newIdSet = useMemo(() => new Set(newIds), [newIds]);
  const filtered = useMemo(
    () => filterRoutes(routes, fromQuery, toQuery, newOnly, newIdSet, newIds),
    [fromQuery, newIdSet, newIds, newOnly, routes, toQuery],
  );

  const renderItem = useCallback(
    ({ item }: { item: RouteOffer }) => (
      <RouteCard route={item} isNew={newIdSet.has(item.id)} />
    ),
    [newIdSet],
  );

  const listHeader = (
    <View style={styles.listHeader}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.rowBetween}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            AUTO REFRESH
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {lastUpdated ? `Updated ${formatClock(lastUpdated)}` : 'Not loaded yet'}
          </ThemedText>
        </View>
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
            seconds while this tab is open
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
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => void refresh({ force: true })}
            disabled={refreshing}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.backgroundSelected },
              refreshing && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold">
              {refreshing ? 'Checking…' : 'Check now'}
            </ThemedText>
          </Pressable>
          {newIds.length > 0 ? (
            <Pressable onPress={markAllSeen} hitSlop={8} style={styles.markSeen}>
              <ThemedText type="small" themeColor="textSecondary">
                {newIds.length} new · Mark seen
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.notificationRow}>
          <View style={styles.notificationCopy}>
            <ThemedText type="smallBold">New-route alerts</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {alertsEnabled
                ? `Background checks follow your From/To search (about every ${BACKGROUND_MIN_INTERVAL_MINUTES} min, OS permitting).`
                : 'Get a notification when a new route matches your From/To search.'}
            </ThemedText>
            {alertsError ? (
              <ThemedText type="small" themeColor="textSecondary">
                {alertsError}
              </ThemedText>
            ) : null}
          </View>
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
        {error ? (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
            {Platform.OS === 'web'
              ? ' The site does not allow browser requests from other origins — try the native app.'
              : ''}
          </ThemedText>
        ) : null}
      </ThemedView>

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

        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setNewOnly((value) => !value)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: newOnly ? theme.backgroundSelected : theme.background },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="small" themeColor={newOnly ? 'text' : 'textSecondary'}>
              New only
            </ThemedText>
          </Pressable>
          {fromQuery.length > 0 || toQuery.length > 0 ? (
            <Pressable
              onPress={() => {
                setFromQuery('');
                setToQuery('');
              }}
              hitSlop={8}>
              <ThemedText type="link">Clear places</ThemedText>
            </Pressable>
          ) : null}
        </View>
      </ThemedView>

      <View style={styles.rowBetween}>
        <ThemedText type="smallBold">AVAILABLE ROUTES</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {filtered.length} shown
        </ThemedText>
      </View>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Freerider</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Hertz routes, filtered and watched for changes
          </ThemedText>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh({ force: true })} />
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={theme.textSecondary} />
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {error
                  ? 'No routes could be loaded.'
                  : routes.length === 0
                    ? 'No routes are available right now.'
                    : 'No routes match these filters.'}
              </ThemedText>
            )
          }
          showsVerticalScrollIndicator={false}
        />
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

function RouteCard({ route, isNew }: { route: RouteOffer; isNew: boolean }) {
  return (
    <ThemedView type="backgroundElement" style={styles.routeCard}>
      <View style={styles.routeTop}>
        <View style={styles.routeTitle}>
          <ThemedText type="smallBold">
            {route.pickupName} → {route.returnName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {route.carModel || 'Car on request'}
          </ThemedText>
        </View>
        {isNew ? (
          <View style={styles.badge}>
            <ThemedText type="smallBold">NEW</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.facts}>
        <ThemedText type="small">{route.distance} km</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          ·
        </ThemedText>
        <ThemedText type="small">{formatDuration(route.travelTime)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          · {route.pickupLocation.country.toUpperCase()}
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        Available {formatLocalDateTime(route.availableAt)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Return by {formatLocalDateTime(route.latestReturn)}
      </ThemedText>

      <FreeriderRouteLink url={buildFreeriderRouteUrl(route)} style={styles.siteLink}>
        <ThemedText type="linkPrimary">Open route on hertzfreerider.se</ThemedText>
      </FreeriderRouteLink>
    </ThemedView>
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
  listContent: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  listHeader: {
    gap: Spacing.three,
    paddingBottom: Spacing.one,
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  markSeen: {
    paddingVertical: Spacing.one,
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  notificationCopy: {
    flex: 1,
    gap: Spacing.half,
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
  routeCard: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  routeTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  routeTitle: {
    flex: 1,
    gap: Spacing.half,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
    backgroundColor: '#FFCC00',
  },
  facts: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  siteLink: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  center: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
  },
  empty: {
    textAlign: 'center',
    paddingTop: Spacing.five,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
