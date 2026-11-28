import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const PUSH_TOKEN_KEY = 'kerodi.freerider.push-token.v1';
export const FREERIDER_NOTIFICATION_CHANNEL = 'freerider';

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
 * Returns the saved push token, asking for notification permission on first
 * use. Feed checks happen in the external worker; the app only registers the
 * token used by listeners started on the Freerider tab.
 */
export async function ensureFreeriderPushToken() {
  const stored = await readStoredFreeriderPushToken();
  if (stored) return stored;
  return registerFreeriderPushToken();
}

export function addFreeriderNotificationOpenListener(onOpen: () => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener(() => onOpen());
  return () => subscription.remove();
}
