import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import notifee, { AndroidImportance, AndroidCategory, AndroidFlags, AndroidVisibility } from 'react-native-notify-kit';
import messaging from '@react-native-firebase/messaging';
import * as TripCall from 'trip-call';

import App from './App';

// Same channelId App.js creates via expo-notifications' setNotificationChannelAsync —
// Android channels are an OS-level concept keyed purely by this string, not
// scoped to whichever library created them, so notify-kit's displayNotification
// can post to a channel expo-notifications set up. createChannel is called
// again below anyway (idempotent — Android treats a repeat call with the
// same id as a safe update, not an error) purely so this task is
// self-sufficient even if it somehow runs before App.js's own channel setup
// has resolved (a real, if narrow, race: this task can fire in a fully
// headless launch, and setNotificationChannelAsync there is async/unawaited).
const TRIP_ALERTS_CHANNEL_ID = 'trip-alerts';

// Unchanged from the previous (react-native-firebase-based) approach — still
// takes an object shaped like a RemoteMessage ({ data: {...} }) and reads
// remoteMessage.data directly, so it works the same way regardless of which
// mechanism handed it the payload.
async function displayFullScreenTripCard(remoteMessage) {
  const data = remoteMessage?.data || {};
  if (!data.tripId) return; // not a trip-alert message — nothing to show

  await notifee.createChannel({
    id: TRIP_ALERTS_CHANNEL_ID,
    name: 'Trip Alerts',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [250, 250, 250, 250],
    vibration: true,
  });

  await notifee.displayNotification({
    title: '🚨 New Trip Assigned',
    body: `${data.patientName || 'Patient'} — ${data.pickupAddress || ''}`,
    data,
    android: {
      channelId: TRIP_ALERTS_CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      category: AndroidCategory.CALL,
      visibility: AndroidVisibility.PUBLIC,
      // Both default to opening the app's main Activity — the same one
      // plugins/withFullScreenIntent.js set showWhenLocked/turnScreenOn on
      // — so no launchActivity override is needed, no separate native
      // Activity required.
      pressAction: { id: 'default', launchActivity: 'default' },
      fullScreenAction: { id: 'default', launchActivity: 'default' },
      // Insistent + looping — repeats sound/vibration until the driver
      // actually interacts with it, per the "Ola-style" requirement that
      // this must be impossible to sleep through.
      loopSound: true,
      flags: [AndroidFlags.FLAG_INSISTENT],
      autoCancel: false,
    },
  });
}

// ============================================================
// Registered on BOTH possible delivery paths — expo-notifications'
// TaskManager pipeline AND react-native-firebase's own background handler.
//
// Earlier assumption (now known wrong on this device/build) was that only
// one native FirebaseMessagingService can receive a given message, that
// expo-notifications' own service always wins that race, and that RNFirebase's
// setBackgroundMessageHandler was therefore structurally unreachable — so
// only the TaskManager path was wired up.
//
// Real-device evidence contradicts that: sending a test push produced
// RNFirebase's own "No background message handler has been set" warning
// 108ms after send, with zero TaskManager/TripCall activity anywhere in
// logcat. That means RNFirebase's native receiver got the message and
// dropped it — the opposite of the original assumption. Which service wins
// is apparently not reliably predictable (may vary by build/OEM/manifest-
// merge order), so instead of re-verifying that per build, both paths are
// now registered. Whichever one the OS actually invokes, handleTripCallMessage
// runs — the dedup guard below stops a double-fire if some future build
// somehow delivers to both.
// ============================================================
const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

// tripId -> handled, evicted after DEDUP_WINDOW_MS. Only needed if a
// message is ever delivered to both paths for the same trip — normally
// exactly one of the two fires.
const recentlyHandledTripIds = new Set();
const DEDUP_WINDOW_MS = 60000;

// Shared by both delivery paths — do not duplicate this logic per-path.
// `source` is only for the diagnostic log, to see in Metro which native
// path actually fired.
async function handleTripCallMessage(rawData, source) {
  console.log(`[trip-call] ${source} fired`);

  // Our own raw FCM data-only message (utils/fcmService.js on the
  // backend) spreads every field directly onto `data` — verified against
  // expo-notifications' actual native serializer (RemoteMessageSerializer
  // .java), not assumed. `dataString` is a separate, unrelated field in
  // that same serializer (only ever set from a `body` key) — handled
  // here anyway, defensively, per the driving concern that our payload
  // comes from a raw firebase-admin send, not Expo's own relay, so its
  // exact shape on arrival isn't a documented contract either way.
  let payload = rawData || {};
  if (!payload.tripId && typeof payload.dataString === 'string') {
    try {
      const parsed = JSON.parse(payload.dataString);
      payload = { ...payload, ...parsed };
    } catch (parseErr) {
      // Not JSON, or not our shape — ignore, fall through below.
    }
  }

  // Expo's own messages (channelId/projectId/scopeKey/experienceId, no
  // tripId) must do nothing here — expo-notifications displays those
  // itself via its own independent pipeline, same as always.
  if (!payload.tripId) return;

  if (recentlyHandledTripIds.has(payload.tripId)) {
    console.log(`[trip-call] ${source}: tripId ${payload.tripId} already handled via the other path, skipping.`);
    return;
  }
  recentlyHandledTripIds.add(payload.tripId);
  setTimeout(() => recentlyHandledTripIds.delete(payload.tripId), DEDUP_WINDOW_MS);

  // Primary path: self-managed Telecom ConnectionService — rings/wakes
  // the device and opens the incoming-call UI independent of Android's
  // per-app full-screen-intent authorization gate (see modules/trip-call).
  let telecomCallStarted = false;
  try {
    telecomCallStarted = await TripCall.startIncomingCall(payload);
  } catch (err) {
    console.log('[notif-task] Could not start native incoming call:', err?.message);
  }

  // Fallback: notify-kit full-screen notification — only when Telecom
  // confirmed it did NOT create the connection (native-side confirmation,
  // not a JS event race — see modules/trip-call). Previously ran
  // unconditionally, which is why every booking showed both prompts and
  // the driver had to reject twice; a failed/timed-out native call must
  // still never mean silence, which is why this stays as a real fallback
  // rather than being removed outright.
  if (telecomCallStarted) return;
  try {
    await displayFullScreenTripCard({ data: payload });
  } catch (err) {
    console.log('[notif-task] Could not display full-screen trip card:', err?.message);
  }
}

try {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error) {
      console.log('[notif-task] Task error:', error.message);
      return;
    }
    await handleTripCallMessage(data, 'expo-task-manager');
  });

  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((err) => {
    console.log('[notif-task] Could not register task:', err?.message);
  });
} catch (err) {
  // The native task-manager/notify-kit modules don't exist in the
  // currently-shipped APK (ship only after the next EAS Build). A throw
  // here must never take down the app or the already-working
  // expo-notifications push path.
  console.log('[notif-task] Could not define background notification task:', err?.message);
}

try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    await handleTripCallMessage(remoteMessage?.data, 'rnfirebase-background-handler');
  });
} catch (err) {
  console.log('[notif-task] Could not set RNFirebase background handler:', err?.message);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
