// src/utils/pushToken.js
// ============================================================
// Driver Expo push token — obtained client-side, sent to the backend via
// the existing PUT /driver-auth/location call (already accepts an
// optional pushToken field; see authController.updateLocation). Nothing
// here is native/OTA-unsafe: expo-notifications is already compiled into
// the current build (PermissionsScreen.js already uses it to request the
// permission), this module only calls its existing JS API.
// ============================================================
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Copied directly from app.json's extra.eas.projectId. Passed explicitly
// per Expo's own recommendation, rather than relying on auto-detection via
// expo-constants (not used anywhere else in this app, so hardcoding the
// known-correct value avoids taking on a dependency whose native-linking
// status in the current build isn't already proven the way
// expo-notifications's is).
const EAS_PROJECT_ID = 'ac9791f2-e3ba-4cc8-ae0c-20d342625903';

const CACHE_KEY = 'driverPushToken';

let cachedToken = null;

// Synchronous — whatever's in memory right now. null until the first
// refreshPushToken() call resolves; callers must tolerate that (the
// driver-location loop already retries every 10s regardless, so a token
// that isn't ready yet on the very first tick just goes out on a later one).
export function getCachedPushToken() {
  return cachedToken;
}

// Best-effort, never throws. Leaves cachedToken exactly as it was (from a
// previous successful call, or null) if:
//  - notification permission isn't granted (skip silently — location
//    updates must still work regardless of push being set up),
//  - there's no network, this is a simulator/emulator without push
//    support, or Expo's push service is unreachable (skip silently, next
//    scheduled call retries).
// A token can change over time (per Expo's own docs), so this is meant to
// be called periodically, not just once on app start.
export async function refreshPushToken() {
  try {
    if (!cachedToken) {
      const stored = await AsyncStorage.getItem(CACHE_KEY);
      if (stored) cachedToken = stored;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return cachedToken;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    if (data && data !== cachedToken) {
      cachedToken = data;
      AsyncStorage.setItem(CACHE_KEY, data).catch(() => {});
    }
  } catch {
    // Silent — see comment above.
  }
  return cachedToken;
}
