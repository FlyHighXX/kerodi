import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  foldText,
  locationSearchText,
  ROUTE_HISTORY_KEY,
  type FreerideLocation,
  type RouteOffer,
} from '@/lib/freerider';

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
  /** Status changes, newest last. Capped; reappearanceCount keeps the full tally. */
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
const MAX_TRANSITIONS = 50;
const TRANSITION_MERGE_WINDOW_MS = 5 * 60 * 1000;

function cityName(location: FreerideLocation) {
  return location.city?.trim() || location.name?.trim() || 'Unknown';
}

function isExpired(expireTime: string, now: number) {
  const timestamp = Date.parse(expireTime);
  return Number.isFinite(timestamp) && now >= timestamp;
}

function routeFields(route: RouteOffer) {
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
    returnCountry: route.returnLocation.country ?? '',
    distance: route.distance,
    travelTime: route.travelTime,
    availableAt: route.availableAt,
    latestReturn: route.latestReturn,
    expireTime: route.expireTime,
    carModel: route.carModel,
  };
}

function makeRecord(route: RouteOffer, now: number, countsTowardPatterns: boolean): RouteHistoryRecord {
  return {
    ...routeFields(route),
    discoveredAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    updatedAt: now,
    status: 'active',
    countsTowardPatterns,
    transitions: countsTowardPatterns
      ? [{ at: now, status: 'active', kind: 'detected' }]
      : [],
    reappearanceCount: 0,
    totalUnavailableMs: 0,
  };
}

function historyStatusFor(present: boolean, expireTime: string, now: number): RouteStatus {
  if (present) return 'active';
  return isExpired(expireTime, now) ? 'expired' : 'unavailable';
}

/** Append a transition only when the status actually changes. */
function applyTransition(
  record: RouteHistoryRecord,
  status: RouteStatus,
  now: number,
): RouteHistoryRecord {
  if (record.status === status) return record;

  const kind: RouteTransitionKind =
    status === 'active'
      ? record.transitions?.length
        ? 'available-again'
        : 'detected'
      : status;

  let reappearanceCount = record.reappearanceCount ?? 0;
  let totalUnavailableMs = record.totalUnavailableMs ?? 0;
  let lastUnavailableAt = record.lastUnavailableAt;
  let lastReappearedAt = record.lastReappearedAt;

  if (status === 'active') {
    if (lastUnavailableAt) {
      totalUnavailableMs += Math.max(0, now - lastUnavailableAt);
      lastUnavailableAt = undefined;
    }
    if (kind === 'available-again') {
      reappearanceCount += 1;
      lastReappearedAt = now;
    }
  } else if (record.status === 'active') {
    lastUnavailableAt = now;
  }

  const transitions = [
    ...(Array.isArray(record.transitions) ? record.transitions : []),
    { at: now, status, kind },
  ].slice(-MAX_TRANSITIONS);

  return {
    ...record,
    status,
    disappearedAt: status === 'active' ? undefined : record.disappearedAt ?? now,
    transitions,
    reappearanceCount,
    totalUnavailableMs,
    lastUnavailableAt,
    lastReappearedAt,
    updatedAt: now,
  };
}

function dedupeTransitions(transitions: RouteTransition[]) {
  const sorted = [...transitions].sort((a, b) => a.at - b.at);
  const merged: RouteTransition[] = [];

  for (const transition of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.status === transition.status &&
      Math.abs(transition.at - previous.at) <= TRANSITION_MERGE_WINDOW_MS
    ) {
      continue;
    }
    merged.push(transition);
  }

  return merged.slice(-MAX_TRANSITIONS);
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

    const refreshed: RouteHistoryRecord = {
      ...existing,
      ...routeFields(route),
      firstSeenAt: existing.firstSeenAt ?? existing.discoveredAt ?? now,
      discoveredAt: existing.discoveredAt ?? now,
      lastSeenAt: now,
      updatedAt: now,
    };
    history[key] = applyTransition(refreshed, 'active', now);
    changed = true;
  }

  // Re-check inactive rows too, so unavailable becomes expired once expireTime passes.
  for (const [key, record] of Object.entries(history)) {
    const nextStatus = historyStatusFor(currentIds.has(record.id), record.expireTime, now);
    const updated = applyTransition(record, nextStatus, now);
    if (updated !== record) {
      history[key] = updated;
      changed = true;
    }
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

function mergeRecord(existing: RouteHistoryRecord, incoming: RouteHistoryRecord): RouteHistoryRecord {
  const winner = (incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0) ? incoming : existing;
  return {
    ...winner,
    transitions: dedupeTransitions([
      ...(Array.isArray(existing.transitions) ? existing.transitions : []),
      ...(Array.isArray(incoming.transitions) ? incoming.transitions : []),
    ]),
  };
}

/** Worker records win when both sides have a row for the same route ID. */
export async function mergeRouteHistory(incoming: RouteHistoryRecord[]) {
  if (!Array.isArray(incoming) || incoming.length === 0) return readRouteHistory();
  const history = await readHistoryMap();

  for (const record of incoming) {
    if (!record || typeof record.id !== 'number') continue;
    const key = String(record.id);
    const existing = history[key];
    history[key] = existing ? mergeRecord(existing, record) : record;
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
  if (record.countsTowardPatterns === false) return 'Baseline · time unknown';
  return `Detected ${formatHistoryClock(record.discoveredAt)}`;
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
  if (!duration || duration <= 0) return '0m';
  const minutes = Math.round(duration / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const dayHours = hours % 24;
  return dayHours ? `${days}d ${dayHours}h` : `${days}d`;
}

export function formatTransitionText(transition: RouteTransition) {
  const label =
    transition.kind === 'available-again'
      ? 'Available again'
      : transition.kind === 'detected'
        ? 'Detected'
        : transition.status === 'unavailable'
          ? 'Unavailable'
          : 'Expired';
  return `${label} ${formatHistoryClock(transition.at)}`;
}
