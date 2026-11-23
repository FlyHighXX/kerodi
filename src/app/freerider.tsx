import AsyncStorage from '@react-native-async-storage/async-storage';
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

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_POLL_SECONDS, useFreeriderRoutes } from '@/hooks/use-freerider-routes';
import {
  FREERIDER_SITE_URL,
  filterRoutes,
  formatDuration,
  formatLocalDateTime,
  type RouteOffer,
} from '@/lib/freerider';

const FILTERS_KEY = 'kerodi.freerider.filters.v1';
const POLL_KEY = 'kerodi.freerider.poll-seconds.v1';
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
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());
  const [filtersReady, setFiltersReady] = useState(false);
  const [pairQuery, setPairQuery] = useState('');
  const [showPairs, setShowPairs] = useState(false);
  const [newOnly, setNewOnly] = useState(false);

  const {
    routes,
    pairs,
    loading,
    refreshing,
    error,
    lastUpdated,
    newIds,
    refresh,
    markAllSeen,
  } = useFreeriderRoutes({ pollIntervalMs: pollSeconds * 1000 });

  // Restore the chosen location pairs once, on mount.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(FILTERS_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSelectedPairs(new Set(parsed.filter((key): key is string => typeof key === 'string')));
        }
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
    AsyncStorage.setItem(FILTERS_KEY, JSON.stringify([...selectedPairs])).catch(() => {});
  }, [filtersReady, selectedPairs]);

  // Restore the polling interval once, on mount.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(POLL_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const value = Number(raw);
        if (Number.isFinite(value) && value > 0) {
          const seconds = clampPollSeconds(value);
          setPollSeconds(seconds);
          setPollDraft(String(seconds));
        }
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
    AsyncStorage.setItem(POLL_KEY, String(pollSeconds)).catch(() => {});
  }, [pollReady, pollSeconds]);

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
    () => filterRoutes(routes, selectedPairs, newOnly, newIdSet),
    [newIdSet, newOnly, routes, selectedPairs],
  );

  const visiblePairs = useMemo(() => {
    const query = pairQuery.trim().toLowerCase();
    if (!query) return pairs;
    return pairs.filter((pair) =>
      `${pair.pickupName} ${pair.returnName} ${pair.country}`.toLowerCase().includes(query),
    );
  }, [pairQuery, pairs]);

  const togglePair = useCallback((key: string) => {
    setSelectedPairs((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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
            LOCATION PAIRS
          </ThemedText>
          <Pressable onPress={() => setShowPairs((open) => !open)} hitSlop={8}>
            <ThemedText type="link">{showPairs ? 'Hide' : 'Choose'}</ThemedText>
          </Pressable>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {selectedPairs.size === 0
            ? `All ${pairs.length} pairs`
            : `${selectedPairs.size} pair${selectedPairs.size === 1 ? '' : 's'} selected`}
        </ThemedText>

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
          {selectedPairs.size > 0 ? (
            <Pressable onPress={() => setSelectedPairs(new Set())} hitSlop={8}>
              <ThemedText type="link">Clear pairs</ThemedText>
            </Pressable>
          ) : null}
        </View>

        {showPairs ? (
          <>
            <TextInput
              value={pairQuery}
              onChangeText={setPairQuery}
              placeholder="Search pickup or return location"
              placeholderTextColor={theme.textSecondary}
              autoCorrect={false}
              style={[styles.searchInput, { backgroundColor: theme.background, color: theme.text }]}
            />
            <ScrollView style={styles.pairList} nestedScrollEnabled showsVerticalScrollIndicator>
              {visiblePairs.map((pair) => {
                const selected = selectedPairs.has(pair.key);
                return (
                  <Pressable
                    key={pair.key}
                    onPress={() => togglePair(pair.key)}
                    style={({ pressed }) => [
                      styles.pairRow,
                      { backgroundColor: selected ? theme.backgroundSelected : theme.background },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="small" style={styles.pairCheck}>
                      {selected ? '✓' : ''}
                    </ThemedText>
                    <ThemedText type="small" style={styles.pairLabel}>
                      {pair.pickupName} → {pair.returnName}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {pair.count}
                    </ThemedText>
                  </Pressable>
                );
              })}
              {visiblePairs.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.noPairs}>
                  No matching location pairs.
                </ThemedText>
              ) : null}
            </ScrollView>
          </>
        ) : null}
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

      <ExternalLink href={FREERIDER_SITE_URL} style={styles.siteLink}>
        <ThemedText type="linkPrimary">Open on hertzfreerider.se</ThemedText>
      </ExternalLink>
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
  pairList: {
    maxHeight: 220,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  pairCheck: {
    width: 16,
  },
  pairLabel: {
    flex: 1,
  },
  noPairs: {
    paddingVertical: Spacing.two,
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
