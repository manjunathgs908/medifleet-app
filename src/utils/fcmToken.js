// src/utils/fcmToken.js
// ============================================================
// Raw FCM device token (Phase 1 of the full-screen incoming-trip card —
// see plugins/withFullScreenIntent.js and index.js's background handler).
// Deliberately a SEPARATE token/cache from src/utils/pushToken.js's Expo
// push token — different delivery pipeline (raw FCM, for the planned
// full-screen path), different backend field (fcmToken, not pushToken).
// Neither reads nor writes the other's cache; the existing Expo push path
// must keep working completely unaffected by this file existing.
// ============================================================
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'driverFcmToken';

let cachedToken = null;

// Synchronous — whatever's in memory right now. null until the first
// refreshFcmToken() call resolves; same "just retry on a later location
// update" tolerance as getCachedPushToken().
export function getCachedFcmToken() {
  return cachedToken;
}

// Best-effort, never throws. Leaves cachedToken exactly as it was (from a
// previous successful call, or null) if the native module isn't present
// yet (current APK, pre-rebuild), there's no network, or messaging().getToken()
// otherwise fails — next scheduled call retries. No permission prerequisite
// needed on Android (react-native-firebase's own docs: requestPermission()
// is a no-op there; getToken() can be called directly).
export async function refreshFcmToken() {
  try {
    if (!cachedToken) {
      const stored = await AsyncStorage.getItem(CACHE_KEY);
      if (stored) cachedToken = stored;
    }

    const token = await messaging().getToken();
    if (token && token !== cachedToken) {
      cachedToken = token;
      AsyncStorage.setItem(CACHE_KEY, token).catch(() => {});
    }
  } catch {
    // Silent — see comment above.
  }
  return cachedToken;
}
