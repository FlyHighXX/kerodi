import AsyncStorage from '@react-native-async-storage/async-storage';

import { WORKER_URL_KEY } from '@/lib/freerider';

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

/** Build-time fallback. There is no baked-in LAN address by default. */
export function defaultWorkerUrl() {
  return normalizeWorkerUrl(configuredEndpoint ?? '');
}

export async function readStoredWorkerUrl() {
  try {
    return normalizeWorkerUrl((await AsyncStorage.getItem(WORKER_URL_KEY)) ?? '');
  } catch {
    return '';
  }
}

/** Saved address wins; otherwise use the build-time endpoint, if any. */
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
