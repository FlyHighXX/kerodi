import AsyncStorage from '@react-native-async-storage/async-storage';

import { WORKER_URL_KEY } from '@/lib/freerider';

const DEFAULT_WORKER_URL = 'http://100.77.0.70:8787';
const configuredEndpoint = process.env.EXPO_PUBLIC_FREERIDER_PUSH_ENDPOINT?.trim();

export function normalizeWorkerUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

export function isValidWorkerUrl(value: string) {
  const normalized = normalizeWorkerUrl(value);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Tailnet worker by default; Tailscale must be connected. A build-time endpoint can override it. */
export function defaultWorkerUrl() {
  return normalizeWorkerUrl(configuredEndpoint || DEFAULT_WORKER_URL);
}

export async function readStoredWorkerUrl() {
  try {
    return normalizeWorkerUrl((await AsyncStorage.getItem(WORKER_URL_KEY)) ?? '');
  } catch {
    return '';
  }
}

/** Saved address wins; otherwise use the default LAN worker. */
export async function readWorkerUrl() {
  return (await readStoredWorkerUrl()) || defaultWorkerUrl();
}

export async function writeWorkerUrl(value: string) {
  const normalized = normalizeWorkerUrl(value);
  try {
    if (normalized) {
      await AsyncStorage.setItem(WORKER_URL_KEY, normalized);
    } else {
      await AsyncStorage.removeItem(WORKER_URL_KEY);
    }
  } catch {}
  return normalized;
}
