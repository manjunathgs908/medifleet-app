import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import notifee, { AndroidImportance, AndroidCategory, AndroidFlags, AndroidVisibility } from 'react-native-notify-kit';

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
    vibrationPattern: [0, 250, 250, 250],
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
// Option (b) from the FCM-conflict investigation: react-native-firebase's
// messaging().setBackgroundMessageHandler provably never fired — Android
// only delivers an incoming FCM message to ONE registered
// FirebaseMessagingService (first one declared in the merged manifest
// wins; expo-notifications' ExpoFirebaseMessagingService wins that race
// here), so RNFirebase's handler was structurally unreachable no matter
// what we did on the JS side.
//
// expo-notifications' own native code (FirebaseMessagingDelegate.
// onMessageReceived, read directly from its Kotlin source) already
// forwards EVERY incoming FCM message — regardless of who sent it — to
// any task registered via expo-notifications' registerTaskAsync/
// expo-task-manager, in addition to displaying Expo's own notifications.
// So instead of fighting for FCM delivery, this hooks into that existing,
// always-running pipeline. expo-notifications' own service, manifest, and
// display behavior are completely untouched by this — Expo's push keeps
// working exactly as it does today regardless of anything below.
// ============================================================
const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

try {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error) {
      console.log('[notif-task] Task error:', error.message);
      return;
    }

    // Our own raw FCM data-only message (utils/fcmService.js on the
    // backend) spreads every field directly onto `data` — verified against
    // expo-notifications' actual native serializer (RemoteMessageSerializer
    // .java), not assumed. `dataString` is a separate, unrelated field in
    // that same serializer (only ever set from a `body` key) — handled
    // here anyway, defensively, per the driving concern that our payload
    // comes from a raw firebase-admin send, not Expo's own relay, so its
    // exact shape on arrival isn't a documented contract either way.
    let payload = data || {};
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

    try {
      await displayFullScreenTripCard({ data: payload });
    } catch (err) {
      console.log('[notif-task] Could not display full-screen trip card:', err?.message);
    }
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

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
