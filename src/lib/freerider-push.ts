import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  isNotificationsEnabled,
  readLocationFilters,
  setNotificationsEnabled,
} from '@/lib/freerider-storage';

const PUSH_TOKEN_KEY = 'kerodi.freerider.push-token.v1';
export const FREERIDER_NOTIFICATION_CHANNEL = 'freerider';

/** Optional endpoint that receives { token, from, to } when filters change. */
export const FREERIDER_PUSH_ENDPOINT = process.env.EXPO_PUBLIC_FREERIDER_PUSH_ENDPOINT?.trim() ?? '';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerFreeriderPushToken() {
  if (Platform.OS === 'web') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(FREERIDER_NOTIFICATION_CHANNEL, {
      name: 'New Freerider routes',
      description: 'Alerts for new routes matching your From/To search',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFCC00',
      sound: 'default',
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  const finalStatus =
    status === 'granted' ? status : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  return token;
}

export async function readStoredFreeriderPushToken() {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Enables push alerts only. All feed checks happen in the external worker;
 * the app no longer schedules local background notifications.
 */
export async function enableFreeriderPushAlerts() {
  const token = await registerFreeriderPushToken();
  if (!token) return null;
  await setNotificationsEnabled(true);
  return token;
}

export async function disableFreeriderPushAlerts() {
  await setNotificationsEnabled(false);
}

export async function syncFreeriderPushAlertState() {
  const [enabled, token] = await Promise.all([
    isNotificationsEnabled(),
    readStoredFreeriderPushToken(),
  ]);
  return enabled && Boolean(token);
}

/** Sends the token and current filters to the worker endpoint, if configured. */
export async function uploadFreeriderPushPreferences(token: string) {
  if (!FREERIDER_PUSH_ENDPOINT) return false;

  const filters = await readLocationFilters();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 1000);

  try {
    const response = await fetch(FREERIDER_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        from: filters.from,
        to: filters.to,
      }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncFreeriderPushPreferences() {
  const token = await readStoredFreeriderPushToken();
  if (!token) return false;
  return uploadFreeriderPushPreferences(token);
}

export function addFreeriderNotificationOpenListener(onOpen: () => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener(() => onOpen());
  return () => subscription.remove();
}
