import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  foldText,
  locationSearchText,
  ROUTE_HISTORY_KEY,
  type FreerideLocation,
  type RouteOffer,
} from '@/lib/freerider';

export type RouteStatus = 'active' | 'unavailable' | 'expired';

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

function cityName(location: FreerideLocation) {
  return location.city?.trim() || location.name?.trim() || 'Unknown';
}

function isExpired(expireTime: string, now: number) {
  const timestamp = Date.parse(expireTime);
  return Number.isFinite(timestamp) && now >= timestamp;
}

function makeRecord(route: RouteOffer, now: number, countsTowardPatterns: boolean): RouteHistoryRecord {
  return {
    id: route.id,
    transportOfferId: route.transportOfferId,
    pickupName: route.pickupName,
    returnName: route.returnName,
    fromCity: cityName(route.pickupLocation),
    toCity: cityName(route.returnLocation),
    fromSearchText: locationSearchText(route.pickupLocation),
    toSearchText: locationSearchText(route.returnLocation),
    country: route.pickupLocation.country ?? '',
    distance: route.distance,
    travelTime: route.travelTime,
    availableAt: route.availableAt,
    latestReturn: route.latestReturn,
    expireTime: route.expireTime,
    carModel: route.carModel,
    discoveredAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    updatedAt: now,
    status: 'active',
    countsTowardPatterns,
  };
}

async function readHistoryMap(): Promise<Record<string, RouteHistoryRecord>> {
  try {
    const raw = await AsyncStorage.getItem(ROUTE_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, RouteHistoryRecord>;
  } catch {
    return {};
  }
}

async function writeHistoryMap(history: Record<string, RouteHistoryRecord>) {
  try {
    await AsyncStorage.setItem(ROUTE_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

export function historyRecords(history: Record<string, RouteHistoryRecord>) {
  return Object.values(history).sort((a, b) => b.discoveredAt - a.discoveredAt);
}

/** Reconcile the current feed with local history. No records are ever pruned. */
export async function reconcileRouteHistory(routes: RouteOffer[], now: number) {
  const history = await readHistoryMap();
  const baseline = Object.keys(history).length === 0;
  const currentIds = new Set(routes.map((route) => route.id));
  let changed = false;

  for (const route of routes) {
    const key = String(route.id);
    const existing = history[key];
    if (!existing) {
      history[key] = makeRecord(route, now, !baseline);
      changed = true;
      continue;
    }

    history[key] = {
      ...existing,
      ...makeRecord(route, existing.discoveredAt, existing.countsTowardPatterns),
      firstSeenAt: existing.firstSeenAt,
      discoveredAt: existing.discoveredAt,
      lastSeenAt: now,
      disappearedAt: undefined,
      updatedAt: now,
      status: 'active',
    };
    changed = true;
  }

  for (const record of Object.values(history)) {
    if (record.status !== 'active' || currentIds.has(record.id)) continue;
    record.status = isExpired(record.expireTime, now) ? 'expired' : 'unavailable';
    record.disappearedAt = now;
    record.updatedAt = now;
    changed = true;
  }

  if (changed) await writeHistoryMap(history);
  return history;
}

export async function readRouteHistory() {
  return historyRecords(await readHistoryMap());
}

export async function latestHistoryUpdatedAt() {
  const records = historyRecords(await readHistoryMap());
  return records.reduce((latest, record) => Math.max(latest, record.updatedAt ?? 0), 0);
}

/** Worker records win when both sides have a row for the same route ID. */
export async function mergeRouteHistory(incoming: RouteHistoryRecord[]) {
  if (!Array.isArray(incoming) || incoming.length === 0) return readRouteHistory();
  const history = await readHistoryMap();

  for (const record of incoming) {
    if (!record || typeof record.id !== 'number') continue;
    const key = String(record.id);
    const existing = history[key];
    if (!existing || (record.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      history[key] = record;
    }
  }

  await writeHistoryMap(history);
  return historyRecords(history);
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
  const weekdays = bucketCounts(discovered, (value) => WEEKDAYS[new Date(value).getDay()], total);
  const hours = bucketCounts(
    discovered,
    (value) => `${String(new Date(value).getHours()).padStart(2, '0')}:00`,
    total,
  );

  return {
    from: fromQuery.trim(),
    to: toQuery.trim(),
    total,
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

export function formatHistoryDateClock(timestamp: number | null | undefined) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
