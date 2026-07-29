// plugins/withFullScreenIntent.js
// ============================================================
// Native Android setup for the planned Ola-style full-screen incoming-trip
// card (Phase 1 — native plumbing only, no UI wired to this yet). Adds the
// two things neither expo-notifications nor react-native-notify-kit's own
// config plugin add automatically:
//   - USE_FULL_SCREEN_INTENT permission — lets a notification launch an
//     Activity directly over the lock screen.
//   - android:showWhenLocked + android:turnScreenOn on the main Activity —
//     lets that Activity actually display/wake the screen when launched.
// Purely additive to the manifest; does not touch anything expo-notifications
// already relies on (its own channel/permission setup is untouched).
// ============================================================
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const withFullScreenIntent = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;

    AndroidConfig.Permissions.ensurePermission(
      androidManifest,
      'android.permission.USE_FULL_SCREEN_INTENT'
    );

    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
    mainActivity.$['android:showWhenLocked'] = 'true';
    mainActivity.$['android:turnScreenOn'] = 'true';

    return config;
  });
};

module.exports = withFullScreenIntent;
