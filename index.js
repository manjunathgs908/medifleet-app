import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidCategory, AndroidFlags, AndroidVisibility } from 'react-native-notify-kit';

import App from './App';

// Same channelId App.js creates via expo-notifications' setNotificationChannelAsync —
// Android channels are an OS-level concept keyed purely by this string, not
// scoped to whichever library created them, so notify-kit's displayNotification
// can post to a channel expo-notifications set up. createChannel is called
// again below anyway (idempotent — Android treats a repeat call with the
// same id as a safe update, not an error) purely so this handler is
// self-sufficient even if it somehow runs before App.js's own channel setup
// has resolved (a real, if narrow, race: this handler can fire in a fully
// headless launch, and setNotificationChannelAsync there is async/unawaited).
const TRIP_ALERTS_CHANNEL_ID = 'trip-alerts';

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

// Registered as a plain top-level statement (not inside any component),
// per react-native-firebase's own documented pattern — Android can invoke
// this handler while the app is fully killed, so it must be registered
// during initial module evaluation, before control returns to native code.
// (Module evaluation order, not statement order, is what matters here — by
// the time this line runs, App.js's own module-level setup, including
// expo-notifications' setNotificationHandler/setNotificationChannelAsync,
// has already run too. The two are independent pipelines with no ordering
// dependency on each other.)
//
// Wrapped defensively: the native Firebase Messaging / notify-kit modules
// don't exist in the currently-shipped APK (ship only after the next EAS
// Build). A throw here must never take down the app or the already-working
// expo-notifications push path. Also important: this handler only reacts
// to the SEPARATE raw-FCM full-screen send (utils/fcmService.js on the
// backend) — the existing Expo push is a completely independent delivery
// sent via a different service (Expo's own relay) and displayed by
// expo-notifications' own native code, not this handler at all. A failure
// here has no way to affect whether that Expo push arrives.
try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('[fcm] Background message received:', JSON.stringify(remoteMessage));
    try {
      await displayFullScreenTripCard(remoteMessage);
    } catch (err) {
      console.log('[fcm] Could not display full-screen trip card:', err?.message);
    }
  });
} catch (err) {
  console.log('[fcm] Could not register background message handler:', err?.message);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
