import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidCategory, AndroidFlags, AndroidVisibility } from 'react-native-notify-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';

import App from './App';

// TEMPORARY diagnostic key (remove once the full-screen path is confirmed
// working end-to-end) — read by DriverDashboard.js. Console logs are
// useless for this handler: it runs while the app is killed, with no
// debugger attached, so this is the only way to see what actually happened
// after the fact. Stores a JSON ARRAY, one short entry per message the
// handler was invoked for — a single overwritten value couldn't tell us
// whether the handler fired once or twice for one dispatch (Expo's push
// and our own raw FCM send are two separate messages); appending can.
const FCM_DEBUG_KEY = 'lastFcmDebug';
const FCM_DEBUG_MAX_ENTRIES = 10;

async function appendFcmDebugEntry(entry) {
  try {
    const raw = await AsyncStorage.getItem(FCM_DEBUG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push(entry);
    while (list.length > FCM_DEBUG_MAX_ENTRIES) list.shift();
    await AsyncStorage.setItem(FCM_DEBUG_KEY, JSON.stringify(list));
    return list.length - 1; // index of the entry just added
  } catch (storageErr) {
    return -1;
  }
}

async function setFcmDebugEntryError(index, message) {
  if (index < 0) return;
  try {
    const raw = await AsyncStorage.getItem(FCM_DEBUG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (list[index]) list[index].displayError = message;
    await AsyncStorage.setItem(FCM_DEBUG_KEY, JSON.stringify(list));
  } catch (storageErr) {
    // Nothing more we can do if AsyncStorage itself is unavailable.
  }
}

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
    // Very first statement, before any notify-kit call — must record even
    // if displayFullScreenTripCard throws below, since that's exactly the
    // "handler fires but display fails" case that needs to be
    // distinguished from "handler never fires at all". appendFcmDebugEntry
    // has its own try/catch internally.
    const entryIndex = await appendFcmDebugEntry({
      at: new Date().toISOString(),
      dataKeys: Object.keys(remoteMessage?.data || {}),
    });

    console.log('[fcm] Background message received:', JSON.stringify(remoteMessage));
    try {
      await displayFullScreenTripCard(remoteMessage);
    } catch (err) {
      console.log('[fcm] Could not display full-screen trip card:', err?.message);
      await setFcmDebugEntryError(entryIndex, err?.message || String(err));
    }
  });
} catch (err) {
  console.log('[fcm] Could not register background message handler:', err?.message);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
