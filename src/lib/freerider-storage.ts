import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LOCATION_FILTERS_KEY,
  NEW_ROUTES_KEY,
  NOTIFIED_ROUTES_KEY,
  POLL_SECONDS_KEY,
  SEEN_ROUTES_KEY,
  VIEW_SETTINGS_KEY,
} from '@/lib/freerider';

export type LocationFilters = {
  from: string;
  to: string;
};

export type FreeriderViewSettings = {
  showUnavailable: boolean;
  showExpired: boolean;
  excludeNorway: boolean;
};

export const DEFAULT_VIEW_SETTINGS: FreeriderViewSettings = {
  showUnavailable: false,
  showExpired: false,
  excludeNorway: true,
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

export async function readNumberList(key: string): Promise<number[]> {
  const parsed = await readJson(key);
  return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [];
}

export async function readSeenRouteIds() {
  return readNumberSet(SEEN_ROUTES_KEY);
}

export async function writeSeenRouteIds(ids: Iterable<number>) {
  await writeNumberSet(SEEN_ROUTES_KEY, ids);
}

export async function readNewRouteIds() {
  return readNumberList(NEW_ROUTES_KEY);
}

export async function writeNewRouteIds(ids: Iterable<number>) {
  await writeNumberSet(NEW_ROUTES_KEY, ids);
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

export async function readViewSettings(): Promise<FreeriderViewSettings> {
  const parsed = await readJson(VIEW_SETTINGS_KEY);
  if (!parsed || typeof parsed !== 'object') return DEFAULT_VIEW_SETTINGS;
  const value = parsed as Partial<FreeriderViewSettings>;
  return {
    showUnavailable:
      typeof value.showUnavailable === 'boolean'
        ? value.showUnavailable
        : DEFAULT_VIEW_SETTINGS.showUnavailable,
    showExpired:
      typeof value.showExpired === 'boolean'
        ? value.showExpired
        : DEFAULT_VIEW_SETTINGS.showExpired,
    excludeNorway:
      typeof value.excludeNorway === 'boolean'
        ? value.excludeNorway
        : DEFAULT_VIEW_SETTINGS.excludeNorway,
  };
}

export async function writeViewSettings(settings: FreeriderViewSettings) {
  try {
    await AsyncStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
