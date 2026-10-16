/**
 * Storage for the user's own AI provider key (BYOK).
 *
 * On native (Android/iOS) the key is kept in expo-secure-store, backed by the
 * Android Keystore / iOS Keychain. expo-secure-store has no web implementation
 * (its web module is an empty object), so on web we fall back to AsyncStorage —
 * acceptable for local development only; the web build is not a supported target
 * for storing real keys.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { isProviderId, type ProviderId } from './ai-providers';

const SECURE_KEY = 'kerodi_ai_key';
const WEB_KEY = 'kerodi.ai.key.web.v1';
const PROVIDER_KEY = 'kerodi.ai.provider.v1';

const useSecureStore = Platform.OS !== 'web';

export async function getStoredApiKey(): Promise<string | null> {
  try {
    if (useSecureStore) return await SecureStore.getItemAsync(SECURE_KEY);
    return await AsyncStorage.getItem(WEB_KEY);
  } catch {
    return null;
  }
}

export async function setStoredApiKey(value: string): Promise<void> {
  if (useSecureStore) {
    await SecureStore.setItemAsync(SECURE_KEY, value);
    return;
  }
  await AsyncStorage.setItem(WEB_KEY, value);
}

export async function clearStoredApiKey(): Promise<void> {
  if (useSecureStore) {
    await SecureStore.deleteItemAsync(SECURE_KEY);
    return;
  }
  await AsyncStorage.removeItem(WEB_KEY);
}

export async function getStoredProvider(): Promise<ProviderId | null> {
  try {
    const value = await AsyncStorage.getItem(PROVIDER_KEY);
    return isProviderId(value) ? value : null;
  } catch {
    return null;
  }
}

export async function setStoredProvider(id: ProviderId): Promise<void> {
  await AsyncStorage.setItem(PROVIDER_KEY, id);
}

export async function clearStoredProvider(): Promise<void> {
  await AsyncStorage.removeItem(PROVIDER_KEY);
}
