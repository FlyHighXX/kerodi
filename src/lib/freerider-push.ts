import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const PUSH_TOKEN_KEY = 'kerodi.freerider.push-token.v1';
export const FREERIDER_NOTIFICATION_CHANNEL = 'freerider';
const COOLDOWN_NOTIFICATION_CHANNEL = 'freerider-cooldown';
const COOLDOWN_NOTIFICATION_KIND = 'freerider-cooldown-ready';

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

async function cancelPendingCooldownNotifications() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending
      .filter((request) => request.content.data?.kind === COOLDOWN_NOTIFICATION_KIND)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

/**
 * Replace the one-shot "cooldown finished" reminder. It uses a TIME_INTERVAL
 * trigger, so it does not require exact-alarm permission. If notifications are
 * not enabled yet, the in-app countdown still shows when a check is allowed.
 */
export async function replaceFreeriderCooldownNotification(
  atMs: number,
  title: string,
  body: string,
) {
  if (Platform.OS === 'web') return;

  const seconds = Math.ceil((atMs - Date.now()) / 1000);
  if (seconds <= 0) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(COOLDOWN_NOTIFICATION_CHANNEL, {
      name: 'Freerider update readiness',
      description: 'Reminder when a new Freerider check is allowed',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  await cancelPendingCooldownNotifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: false,
      data: { kind: COOLDOWN_NOTIFICATION_KIND },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: COOLDOWN_NOTIFICATION_CHANNEL,
    },
  });
}

export async function clearFreeriderCooldownNotification() {
  if (Platform.OS === 'web') return;
  await cancelPendingCooldownNotifications();
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
