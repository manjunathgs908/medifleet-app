import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';

import App from './App';

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
// Wrapped defensively: the native Firebase Messaging module doesn't exist
// in the currently-shipped APK (ships only after the next EAS Build — see
// Phase 1 report). A throw here must never take down the app or the
// already-working expo-notifications push path, hence try/catch. Log-only
// for now — no notification display yet, that's Phase 2.
try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('[fcm] Background message received:', JSON.stringify(remoteMessage));
  });
} catch (err) {
  console.log('[fcm] Could not register background message handler:', err?.message);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
