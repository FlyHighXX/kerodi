import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LOCATION_FILTERS_KEY,
  NOTIFIED_ROUTES_KEY,
  NOTIFICATIONS_ENABLED_KEY,
  POLL_SECONDS_KEY,
  SEEN_ROUTES_KEY,
} from '@/lib/freerider';

export type LocationFilters = {
  from: string;
  to: string;
};

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function readNumberSet(key: string): Promise<Set<number>> {
  const parsed = await readJson(key);
  return new Set(
    Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [],
  );
}

export async function writeNumberSet(key: string, ids: Iterable<number>) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify([...ids]));
  } catch {}
}

export async function readSeenRouteIds() {
  return readNumberSet(SEEN_ROUTES_KEY);
}

export async function writeSeenRouteIds(ids: Iterable<number>) {
  await writeNumberSet(SEEN_ROUTES_KEY, ids);
}

export async function readNotifiedRouteIds() {
  return readNumberSet(NOTIFIED_ROUTES_KEY);
}

export async function writeNotifiedRouteIds(ids: Iterable<number>) {
  await writeNumberSet(NOTIFIED_ROUTES_KEY, ids);
}

export async function readLocationFilters(): Promise<LocationFilters> {
  const parsed = await readJson(LOCATION_FILTERS_KEY);
  if (parsed && typeof parsed === 'object') {
    const value = parsed as { from?: unknown; to?: unknown };
    return {
      from: typeof value.from === 'string' ? value.from : '',
      to: typeof value.to === 'string' ? value.to : '',
    };
  }
  return { from: '', to: '' };
}

export async function readPollSeconds(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(POLL_SECONDS_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function writePollSeconds(seconds: number) {
  try {
    await AsyncStorage.setItem(POLL_SECONDS_KEY, String(seconds));
  } catch {}
}

export async function writeLocationFilters({ from, to }: LocationFilters) {
  try {
    await AsyncStorage.setItem(LOCATION_FILTERS_KEY, JSON.stringify({ from, to }));
  } catch {}
}

export async function isNotificationsEnabled() {
  try {
    return (await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setNotificationsEnabled(enabled: boolean) {
  try {
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {}
}
