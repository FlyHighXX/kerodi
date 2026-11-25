import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FreeriderHistorySheet } from '@/components/freerider-history-sheet';
import { FreeriderRouteLink } from '@/components/freerider-route-link';
import { FreeriderWatchControl } from '@/components/freerider-watch-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFreeriderFilters } from '@/hooks/use-freerider-filters';
import { useFreeriderRoutes } from '@/hooks/use-freerider-routes';
import { useFreeriderViewSettings } from '@/hooks/use-freerider-view-settings';
import {
  FREERIDER_SITE_URL,
  filterRoutes,
  formatDuration,
  formatLocalDateTime,
  type RouteOffer,
} from '@/lib/freerider';
import {
  formatDetectionText,
  formatHistoryClock,
  routeFromHistory,
  type RouteHistoryRecord,
} from '@/lib/freerider-history';

function formatClock(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FreeriderScreen() {
  const theme = useTheme();
  const { fromQuery, toQuery } = useFreeriderFilters();
  const { showUnavailable, showExpired, excludeNorway } = useFreeriderViewSettings();
  const [newOnly, setNewOnly] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);

  const {
    routes,
    loading,
    refreshing,
    error,
    lastUpdated,
    newIds,
    history,
    refresh,
    markAllSeen,
  } = useFreeriderRoutes();

  const newIdSet = useMemo(() => new Set(newIds), [newIds]);
  const isExcludedCountry = useCallback(
    (country?: string | null) => excludeNorway && (country ?? '').trim().toUpperCase() === 'NO',
    [excludeNorway],
  );

  const visibleHistory = useMemo(
    () =>
      history.filter(
        (record) => !isExcludedCountry(record.country) && !isExcludedCountry(record.returnCountry),
      ),
    [history, isExcludedCountry],
  );
  const historyById = useMemo(
    () => new Map(visibleHistory.map((record) => [record.id, record])),
    [visibleHistory],
  );
  const activeRoutes = useMemo(
    () =>
      routes.filter(
        (route) =>
          !isExcludedCountry(route.pickupLocation.country) &&
          !isExcludedCountry(route.returnLocation.country),
      ),
    [isExcludedCountry, routes],
  );
  const activeIds = useMemo(() => new Set(activeRoutes.map((route) => route.id)), [activeRoutes]);
  const inactiveRoutes = useMemo(() => {
    if (!showUnavailable && !showExpired) return [];
    return visibleHistory
      .filter((record) => {
        if (activeIds.has(record.id) || record.status === 'active') return false;
        if (record.status === 'unavailable') return showUnavailable;
        if (record.status === 'expired') return showExpired;
        return false;
      })
      .map(routeFromHistory);
  }, [activeIds, showExpired, showUnavailable, visibleHistory]);
  const filtered = useMemo(
    () => [
      ...filterRoutes(activeRoutes, fromQuery, toQuery, newOnly, newIdSet, newIds, 'location'),
      ...filterRoutes(inactiveRoutes, fromQuery, toQuery, newOnly, newIdSet, newIds),
    ],
    [activeRoutes, fromQuery, inactiveRoutes, newIdSet, newIds, newOnly, toQuery],
  );
  const hiddenInactive = useMemo(() => {
    let unavailable = 0;
    let expired = 0;
    for (const record of visibleHistory) {
      if (activeIds.has(record.id) || record.status === 'active') continue;
      if (record.status === 'unavailable' && !showUnavailable) unavailable += 1;
      if (record.status === 'expired' && !showExpired) expired += 1;
    }
    return { unavailable, expired };
  }, [activeIds, showExpired, showUnavailable, visibleHistory]);

  const renderItem = useCallback(
    ({ item }: { item: RouteOffer }) => (
      <RouteCard
        route={item}
        isNew={newIdSet.has(item.id)}
        record={historyById.get(item.id)}
      />
    ),
    [historyById, newIdSet],
  );

  const filterSummary = [
    fromQuery ? `From ${fromQuery}` : null,
    toQuery ? `To ${toQuery}` : null,
    excludeNorway ? 'NO excluded' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const listHeader = (
    <View style={styles.listHeader}>
      <FreeriderWatchControl from={fromQuery} to={toQuery} />

      <ThemedView type="backgroundElement" style={styles.statusCard}>
        <View style={styles.rowBetween}>
          <ThemedText type="small" themeColor="textSecondary">
            {lastUpdated ? `Updated ${formatClock(lastUpdated)}` : 'Not loaded yet'}
          </ThemedText>
          <View style={styles.statusActions}>
            <Pressable onPress={() => setHistoryVisible(true)} hitSlop={8}>
              <ThemedText type="link">History</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => void refresh({ force: true })}
              disabled={refreshing}
              hitSlop={8}>
              <ThemedText type="link" themeColor={refreshing ? 'textSecondary' : undefined}>
                {refreshing ? 'Checking…' : 'Check now'}
              </ThemedText>
            </Pressable>
            {newIds.length > 0 ? (
              <Pressable onPress={markAllSeen} hitSlop={8}>
                <ThemedText type="link">{newIds.length} new · Mark seen</ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>
        {filterSummary ? (
          <ThemedText type="small" themeColor="textSecondary">
            {filterSummary}
          </ThemedText>
        ) : null}
        {hiddenInactive.unavailable + hiddenInactive.expired > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Hidden: {hiddenInactive.unavailable} unavailable · {hiddenInactive.expired} expired
          </ThemedText>
        ) : null}
        {error ? (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
            {Platform.OS === 'web'
              ? ' The site does not allow browser requests from other origins — try the native app.'
              : ''}
          </ThemedText>
        ) : null}
      </ThemedView>

      <View style={styles.routesHeader}>
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
            Hertz routes. Alerts are sent by the worker.
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

      {historyVisible ? (
        <FreeriderHistorySheet
          key={`${fromQuery}|${toQuery}`}
          records={visibleHistory}
          from={fromQuery}
          to={toQuery}
          now={lastUpdated ?? 0}
          onClose={() => setHistoryVisible(false)}
        />
      ) : null}
    </ThemedView>
  );
}

function RouteCard({
  route,
  isNew,
  record,
}: {
  route: RouteOffer;
  isNew: boolean;
  record?: RouteHistoryRecord;
}) {
  const inactive = record?.status === 'unavailable' || record?.status === 'expired';
  const badgeLabel = inactive ? record.status.toUpperCase() : isNew ? 'NEW' : null;

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
        {badgeLabel ? (
          <View
            style={[
              styles.badge,
              record?.status === 'unavailable' && styles.badgeUnavailable,
              record?.status === 'expired' && styles.badgeExpired,
            ]}>
            <ThemedText type="smallBold">{badgeLabel}</ThemedText>
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
      <ThemedText type="small" themeColor="textSecondary">
        Expires {formatLocalDateTime(route.expireTime)}
      </ThemedText>
      {record ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDetectionText(record)}
            {record.status === 'active' || !record.disappearedAt
              ? ''
              : ` · Gone ${formatHistoryClock(record.disappearedAt)}`}
          </ThemedText>
          {record.reappearanceCount ? (
            <ThemedText type="small" themeColor="textSecondary">
              Seen again {record.reappearanceCount}×
              {record.lastReappearedAt ? ` · Last ${formatHistoryClock(record.lastReappearedAt)}` : ''}
            </ThemedText>
          ) : null}
        </>
      ) : null}

      <FreeriderRouteLink
        url={FREERIDER_SITE_URL}
        pickupName={route.pickupName}
        returnName={route.returnName}
        carModel={route.carModel}
        style={styles.siteLink}>
        <ThemedText type="linkPrimary">Book on hertzfreerider.se</ThemedText>
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
    gap: Spacing.two,
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
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  statusCard: {
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: Spacing.three,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  statusActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  routesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
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
  badgeUnavailable: {
    backgroundColor: '#E8A33D',
  },
  badgeExpired: {
    backgroundColor: '#8E8E93',
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
  pressed: {
    opacity: 0.7,
  },
});
