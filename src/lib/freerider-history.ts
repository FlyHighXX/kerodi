import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  foldText,
  ROUTE_HISTORY_KEY,
  type FreerideLocation,
  type RouteOffer,
} from '@/lib/freerider';
import { translate } from '@/lib/i18n';

export type RouteStatus = 'active' | 'unavailable' | 'expired';

export type RouteTransitionKind = 'detected' | 'unavailable' | 'expired' | 'available-again';

export type RouteTransition = {
  at: number;
  status: RouteStatus;
  kind: RouteTransitionKind;
};

export type RouteHistoryRecord = {
  id: number;
  transportOfferId: number;
  pickupName: string;
  returnName: string;
  fromCity: string;
  toCity: string;
  fromSearchText: string;
  toSearchText: string;
  country: string;
  /** Older stored records predate this field. */
  returnCountry?: string;
  distance: number;
  travelTime: number;
  availableAt: string;
  latestReturn: string;
  expireTime: string;
  carModel: string;
  discoveredAt: number;
  firstSeenAt: number;
  lastSeenAt: number;
  disappearedAt?: number;
  updatedAt: number;
  status: RouteStatus;
  /** Existing routes at first launch are baseline rows, not posting events. */
  countsTowardPatterns: boolean;
  /** Status changes, newest last. All recorded changes are kept. */
  transitions: RouteTransition[];
  reappearanceCount: number;
  totalUnavailableMs: number;
  lastUnavailableAt?: number;
  lastReappearedAt?: number;
};

export type PatternBucket = {
  label: string;
  count: number;
  share: number;
};

export type PairPatternSummary = {
  from: string;
  to: string;
  total: number;
  reappearances: number;
  firstAt: number | null;
  lastAt: number | null;
  perWeek: number;
  busiestWeekday: PatternBucket | null;
  busiestHour: PatternBucket | null;
};

export type PairTotal = {
  from: string;
  to: string;
  fromKey: string;
  toKey: string;
  count: number;
  lastAt: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Remove the old device-owned history copy; the worker is authoritative. */
export async function clearLocalRouteHistory() {
  try {
    await AsyncStorage.removeItem(ROUTE_HISTORY_KEY);
  } catch {}
}

export function historyRecords(records: RouteHistoryRecord[]) {
  return [...records].sort((a, b) => b.discoveredAt - a.discoveredAt);
}

/** Merge worker deltas into the current in-memory snapshot. */
export function mergeWorkerHistory(
  current: RouteHistoryRecord[],
  incoming: RouteHistoryRecord[],
) {
  const byId = new Map(current.map((record) => [record.id, record]));
  for (const record of incoming) {
    if (typeof record.id !== 'number') continue;
    const existing = byId.get(record.id);
    if (!existing || (record.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      byId.set(record.id, record);
    }
  }
  return historyRecords([...byId.values()]);
}

export function latestHistoryUpdatedAt(records: RouteHistoryRecord[]) {
  return records.reduce((latest, record) => Math.max(latest, record.updatedAt ?? 0), 0);
}

export function routeFromHistory(record: RouteHistoryRecord): RouteOffer {
  const pickupLocation: FreerideLocation = {
    name: record.pickupName,
    tracCode: '',
    country: record.country || 'se',
    city: record.fromCity,
  };
  const returnLocation: FreerideLocation = {
    name: record.returnName,
    tracCode: '',
    country: record.country || 'se',
    city: record.toCity,
  };

  return {
    id: record.id,
    transportOfferId: record.transportOfferId,
    pickupLocation,
    returnLocation,
    priorityOrder: 0,
    distance: record.distance,
    originalDistance: record.distance,
    travelTime: record.travelTime,
    originalTravelTime: record.travelTime,
    availableAt: record.availableAt,
    latestReturn: record.latestReturn,
    expireTime: record.expireTime,
    carModel: record.carModel,
    publicDescription: '',
    publicInformation: '',
    pickupName: record.pickupName,
    returnName: record.returnName,
  };
}

function bucketCounts(values: number[], label: (value: number) => string, total: number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = label(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function buildPairPatternSummary(
  records: RouteHistoryRecord[],
  fromQuery: string,
  toQuery: string,
  now: number,
): PairPatternSummary {
  const from = foldText(fromQuery);
  const to = foldText(toQuery);
  const matching = records.filter(
    (record) =>
      record.countsTowardPatterns !== false &&
      (!from || record.fromSearchText.includes(from)) &&
      (!to || record.toSearchText.includes(to)),
  );
  const discovered = matching.map((record) => record.discoveredAt);
  const total = discovered.length;
  const firstAt = total ? Math.min(...discovered) : null;
  const lastAt = total ? Math.max(...discovered) : null;
  const weeks = firstAt ? Math.max(1, (now - firstAt) / WEEK_MS) : 1;
  const weekdays = bucketCounts(
    discovered,
    (value) => translate(WEEKDAYS[new Date(value).getDay()]),
    total,
  );
  const hours = bucketCounts(
    discovered,
    (value) => `${String(new Date(value).getHours()).padStart(2, '0')}:00`,
    total,
  );

  return {
    from: fromQuery.trim(),
    to: toQuery.trim(),
    total,
    reappearances: matching.reduce((sum, record) => sum + (record.reappearanceCount ?? 0), 0),
    firstAt,
    lastAt,
    perWeek: total / weeks,
    busiestWeekday: weekdays[0] ?? null,
    busiestHour: hours[0] ?? null,
  };
}

export function listTopPairs(records: RouteHistoryRecord[]): PairTotal[] {
  const pairs = new Map<string, PairTotal>();

  for (const record of records) {
    if (record.countsTowardPatterns === false) continue;
    const fromKey = foldText(record.fromCity);
    const toKey = foldText(record.toCity);
    const key = `${fromKey}|${toKey}`;
    const existing = pairs.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastAt = Math.max(existing.lastAt, record.discoveredAt);
    } else {
      pairs.set(key, {
        from: record.fromCity,
        to: record.toCity,
        fromKey,
        toKey,
        count: 1,
        lastAt: record.discoveredAt,
      });
    }
  }

  return [...pairs.values()].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
}

export function formatHistoryClock(timestamp: number | null | undefined) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Baseline rows existed at first launch, so their detection time is unknown. */
export function formatDetectionText(record: RouteHistoryRecord) {
  if (record.countsTowardPatterns === false) return translate('Baseline · time unknown');
  return translate('Detected {{time}}', { time: formatHistoryClock(record.discoveredAt) });
}

export function formatHistoryDateClock(timestamp: number | null | undefined) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDurationMs(duration: number | null | undefined) {
  if (!duration || duration <= 0) return translate('0m');
  const minutes = Math.round(duration / 60_000);
  if (minutes < 60) return translate('{{count}}m', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) {
    return remainder
      ? translate('{{hours}}h {{minutes}}m', { hours, minutes: remainder })
      : translate('{{count}}h', { count: hours });
  }
  const days = Math.floor(hours / 24);
  const dayHours = hours % 24;
  return dayHours
    ? translate('{{days}}d {{hours}}h', { days, hours: dayHours })
    : translate('{{count}}d', { count: days });
}

export function formatTransitionText(transition: RouteTransition) {
  const key =
    transition.kind === 'available-again'
      ? 'Available again {{time}}'
      : transition.kind === 'detected'
        ? 'Detected {{time}}'
        : transition.status === 'unavailable'
          ? 'Unavailable {{time}}'
          : 'Expired {{time}}';
  return translate(key, { time: formatHistoryClock(transition.at) });
}
