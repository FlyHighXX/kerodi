import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  latestHistoryUpdatedAt,
  mergeRouteHistory,
  type RouteHistoryRecord,
} from '@/lib/freerider-history';
import { readWorkerUrl } from '@/lib/freerider-worker-url';

const CACHE_KEY = 'kerodi.freerider.sessions.v1';
const DURATION_KEY = 'kerodi.freerider.watch-duration-minutes.v1';

/** Fixed worker interval for on-demand listeners. */
export const SESSION_POLL_SECONDS = 10;
export const DEFAULT_DURATION_MINUTES = 60;
export const DURATION_PRESETS = [15, 60, 240, 480, 1440];

export type FreeriderSession = {
  id: string;
  from: string;
  to: string;
  pollSeconds: number;
  durationMinutes: number;
  createdAt: number;
  expiresAt: number;
};

type StartInput = {
  token: string;
  from: string;
  to: string;
  durationMinutes: number;
};

export async function checkWorkerHealth() {
  const endpoint = await readWorkerUrl();
  if (!endpoint) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${endpoint}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const endpoint = await readWorkerUrl();
  if (!endpoint) throw new Error('Set the worker URL in Settings first.');

  const response = await fetch(`${endpoint}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Worker returned ${response.status}`);
  }
  return payload as T;
}

async function readCachedSessions(): Promise<FreeriderSession[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as FreeriderSession[]) : [];
  } catch {
    return [];
  }
}

async function writeCachedSessions(sessions: FreeriderSession[]) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(sessions));
  } catch {}
}

export async function loadFreeriderSessions(token: string): Promise<FreeriderSession[]> {
  try {
    const since = await latestHistoryUpdatedAt();
    const payload = await post<{ sessions: FreeriderSession[]; history?: RouteHistoryRecord[] }>(
      '/status',
      { token, since },
    );
    if (Array.isArray(payload.history)) await mergeRouteHistory(payload.history);
    const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
    await writeCachedSessions(sessions);
    return sessions.filter((session) => session.expiresAt > Date.now());
  } catch {
    const cached = await readCachedSessions();
    return cached.filter((session) => session.expiresAt > Date.now());
  }
}

/** Sync worker-owned route history without needing a push token. */
export async function syncWorkerRouteHistory(): Promise<RouteHistoryRecord[]> {
  const since = await latestHistoryUpdatedAt();
  const payload = await post<{ history?: RouteHistoryRecord[] }>('/status', { token: '', since });
  return mergeRouteHistory(payload.history ?? []);
}

export async function startFreeriderSession(input: StartInput): Promise<FreeriderSession> {
  const payload = await post<{ session: FreeriderSession }>('/start', {
    ...input,
    pollSeconds: SESSION_POLL_SECONDS,
  });
  const sessions = await readCachedSessions();
  await writeCachedSessions([...sessions.filter((s) => s.id !== payload.session.id), payload.session]);
  return payload.session;
}

export async function stopFreeriderSession(token: string, id: string): Promise<void> {
  await post('/stop', { token, id });
  const sessions = await readCachedSessions();
  await writeCachedSessions(sessions.filter((session) => session.id !== id));
}

export async function readSelectedDuration() {
  try {
    const raw = await AsyncStorage.getItem(DURATION_KEY);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_DURATION_MINUTES;
  } catch {
    return DEFAULT_DURATION_MINUTES;
  }
}

export async function writeSelectedDuration(minutes: number) {
  try {
    await AsyncStorage.setItem(DURATION_KEY, String(minutes));
  } catch {}
}

export function formatDurationLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours}h`;
}

export function formatRemaining(expiresAt: number, now: number) {
  const minutes = Math.max(0, Math.ceil((expiresAt - now) / 60_000));
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h left` : `${hours}h ${rest}m left`;
}
