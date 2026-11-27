import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RouteOffer } from '@/lib/freerider';
import { historyRecords, type RouteHistoryRecord } from '@/lib/freerider-history';
import { readWorkerUrl } from '@/lib/freerider-worker-url';
import { translate } from '@/lib/i18n';

const CACHE_KEY = 'kerodi.freerider.sessions.v1';
const DURATION_KEY = 'kerodi.freerider.watch-duration-minutes.v1';

/** Low-traffic worker interval for on-demand listeners. */
export const SESSION_POLL_SECONDS = 60;
export const DEFAULT_DURATION_MINUTES = 60;
export const DURATION_PRESETS = [15, 60, 240, 480, 1440];

export type FreeriderSession = {
  id: string;
  from: string;
  to: string;
  excludeCountry: string;
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
  excludeCountry?: string;
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

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const endpoint = await readWorkerUrl();
  if (!endpoint) throw new Error(translate('Set the worker URL in Settings first.'));

  const response = await fetch(`${endpoint}${path}`, { signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(
      payload.error || translate('Worker returned {{status}}', { status: response.status }),
    );
  }
  return payload as T;
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const endpoint = await readWorkerUrl();
  if (!endpoint) throw new Error(translate('Set the worker URL in Settings first.'));

  const response = await fetch(`${endpoint}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(
      payload.error || translate('Worker returned {{status}}', { status: response.status }),
    );
  }
  return payload as T;
}

type WorkerRoutesPayload = {
  routes?: unknown;
  fetchedAt?: unknown;
  backedOffUntil?: unknown;
};

function isRouteOffer(value: unknown): value is RouteOffer {
  if (!value || typeof value !== 'object') return false;
  const route = value as Partial<RouteOffer>;
  return (
    typeof route.id === 'number' &&
    !!route.pickupLocation &&
    !!route.returnLocation &&
    typeof route.availableAt === 'string'
  );
}

/**
 * Read the worker's cached feed. Manual checks hit the worker's throttled
 * /poll-now endpoint; no hertzfreerider request is made from the device.
 */
export async function fetchWorkerRoutes(options?: {
  force?: boolean;
  signal?: AbortSignal;
}): Promise<RouteOffer[]> {
  const payload = options?.force
    ? await post<WorkerRoutesPayload>('/poll-now', {}, options?.signal)
    : await get<WorkerRoutesPayload>('/routes', options?.signal);

  const routes = Array.isArray(payload.routes) ? payload.routes.filter(isRouteOffer) : [];
  return routes.sort((a, b) => a.availableAt.localeCompare(b.availableAt));
}

/** Read worker-owned history deltas. No history is stored on the device. */
export async function fetchWorkerRouteHistory(
  since = 0,
  signal?: AbortSignal,
): Promise<RouteHistoryRecord[]> {
  const endpoint = await readWorkerUrl();
  if (!endpoint) return [];

  const query = since > 0 ? `?since=${Math.floor(since)}` : '';
  const response = await fetch(`${endpoint}/history${query}`, { signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(
      payload.error || translate('Worker returned {{status}}', { status: response.status }),
    );
  }

  const records = Array.isArray(payload.history)
    ? payload.history.filter(
        (record: RouteHistoryRecord) => record && typeof record.id === 'number',
      )
    : [];
  return historyRecords(records);
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
    const payload = await post<{ sessions: FreeriderSession[] }>('/status', { token });
    const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
    await writeCachedSessions(sessions);
    return sessions.filter((session) => session.expiresAt > Date.now());
  } catch {
    const cached = await readCachedSessions();
    return cached.filter((session) => session.expiresAt > Date.now());
  }
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
  if (minutes < 60) return translate('{{duration}} left', { duration: `${minutes}m` });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const duration = rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  return translate('{{duration}} left', { duration });
}
