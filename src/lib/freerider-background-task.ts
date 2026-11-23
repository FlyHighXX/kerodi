import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import {
  buildFreeriderRouteUrl,
  fetchFreeriderRoutes,
  filterRoutes,
  formatLocalDateTime,
} from '@/lib/freerider';
import {
  readLocationFilters,
  isNotificationsEnabled,
  readNotifiedRouteIds,
  readSeenRouteIds,
  setNotificationsEnabled,
  writeNotifiedRouteIds,
} from '@/lib/freerider-storage';

export const FREERIDER_BACKGROUND_TASK = 'kerodi.freerider.new-routes';
export const FREERIDER_NOTIFICATION_CHANNEL = 'freerider';
/** Android WorkManager minimum; iOS treats it as a hint and may run later. */
export const BACKGROUND_MIN_INTERVAL_MINUTES = 15;

const REQUEST_TIMEOUT_MS = 15 * 1000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Defined at module scope and imported from the root layout so it is available
 * when the OS launches the app in the background.
 */
TaskManager.defineTask(FREERIDER_BACKGROUND_TASK, async () => {
  try {
    await checkForNewFreeriderMatches();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Fetch the feed and notify once about new routes that match saved From/To filters. */
export async function checkForNewFreeriderMatches() {
  const [filters, seen, notified] = await Promise.all([
    readLocationFilters(),
    readSeenRouteIds(),
    readNotifiedRouteIds(),
  ]);

  // An empty seen set means the feed has never been loaded yet, so there is no
  // baseline to compare against. Avoid notifying about every current route.
  if (seen.size === 0) return 0;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let routes;
  try {
    routes = await fetchFreeriderRoutes(controller.signal);
  } finally {
    clearTimeout(timeout);
  }

  const currentIds = new Set(routes.map((route) => route.id));
  const matches = filterRoutes(routes, filters.from, filters.to, false, new Set(), [])
    .filter((route) => !seen.has(route.id) && !notified.has(route.id));

  // Keep the notified set from growing forever.
  const retainedNotified = [...notified].filter((id) => currentIds.has(id));
  await writeNotifiedRouteIds(retainedNotified);

  if (matches.length === 0) return 0;

  const first = matches[0];
  const title = matches.length === 1 ? 'New Freerider route' : `${matches.length} new Freerider routes`;
  const body =
    matches.length === 1
      ? `${first.pickupName} → ${first.returnName} · ${formatLocalDateTime(first.availableAt)}`
      : `${first.pickupName} → ${first.returnName} and ${matches.length - 1} more`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      data: {
        routeId: first.id,
        url: buildFreeriderRouteUrl(first),
      },
    },
    trigger: { channelId: FREERIDER_NOTIFICATION_CHANNEL },
  });

  await writeNotifiedRouteIds(new Set([...retainedNotified, ...matches.map((route) => route.id)]));
  return matches.length;
}

export async function isFreeriderBackgroundTaskRegistered() {
  return TaskManager.isTaskRegisteredAsync(FREERIDER_BACKGROUND_TASK);
}

export async function enableFreeriderNotifications() {
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
  if (finalStatus !== 'granted') return false;

  const backgroundStatus = await BackgroundTask.getStatusAsync();
  if (backgroundStatus !== BackgroundTask.BackgroundTaskStatus.Available) return false;

  await BackgroundTask.registerTaskAsync(FREERIDER_BACKGROUND_TASK, {
    minimumInterval: BACKGROUND_MIN_INTERVAL_MINUTES,
  });
  await setNotificationsEnabled(true);
  return true;
}

export async function disableFreeriderNotifications() {
  if (await isFreeriderBackgroundTaskRegistered()) {
    await BackgroundTask.unregisterTaskAsync(FREERIDER_BACKGROUND_TASK);
  }
  await setNotificationsEnabled(false);
}

/** Defensive cleanup when the stored flag and OS registration drift apart. */
export async function syncFreeriderNotificationState() {
  const enabled = await isNotificationsEnabled();
  const registered = await isFreeriderBackgroundTaskRegistered();
  if (enabled && !registered) {
    await disableFreeriderNotifications();
    return false;
  }
  return enabled && registered;
}
