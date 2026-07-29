import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from 'react-native';

/**
 * Android-only, same structural pattern as BatteryOptimizationScreen.js
 * (icon, title, explanation, Settings button, Skip). One real difference,
 * flagged rather than hidden: BatteryOptimizationScreen can ask the OS for
 * a definite granted/not-granted answer (BatteryOptEnabled()) and show a
 * status box + re-check on return. No installed library here exposes an
 * equivalent for Android 14's USE_FULL_SCREEN_INTENT permission —
 * react-native-notify-kit's own NotificationSettings only covers the
 * separate exact-alarm permission, and expo-notifications' Android
 * permission fields only cover importance/interruptionFilter. There is no
 * pure-JS `canUseFullScreenIntent()` equivalent to call. Rather than fake a
 * status this screen can't actually verify, it's always shown once
 * (Android only) with a clear explanation and a direct Settings link, no
 * status box, no false "granted"/"denied" claim.
 *
 * The specific "Manage full screen intents" sub-screen
 * (Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT_SETTINGS) is attempted
 * first; if that action doesn't exist on the device (pre-Android-14, or an
 * OEM variant) it falls back to this app's general Settings page via
 * Linking.openSettings(), which is guaranteed to exist. Whether the direct
 * action correctly lands on this app's specific row (rather than a general
 * list) hasn't been verified on a real device — worth confirming on an
 * actual Android 14+ handset.
 */
export default function FullScreenIntentPermissionScreen({ onDone }) {
  if (Platform.OS !== 'android') {
    onDone?.();
    return null;
  }

  async function openFullScreenIntentSettings() {
    try {
      await Linking.sendIntent('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT_SETTINGS');
    } catch {
      // Action doesn't exist on this device/OS version — fall back to the
      // app's general Settings page rather than leaving the driver stuck.
      Linking.openSettings().catch(() => {});
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>🚨</Text>
        <Text style={styles.title}>Full-Screen Trip Alerts</Text>
        <Text style={styles.subtitle}>
          So a new trip alert can wake your screen and show up even when MediFleet is closed —
          like an incoming call — Android needs permission to show full-screen alerts for this app.
          Look for "Full screen notifications" or "Display over other apps" in the screen that opens.
        </Text>

        <TouchableOpacity style={styles.button} onPress={openFullScreenIntentSettings}>
          <Text style={styles.buttonText}>Open Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onDone} style={{ marginTop: 14 }}>
          <Text style={styles.skipText}>Continue →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0a0f1e',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 30, width: '100%', maxWidth: 400, alignItems: 'center' },
  icon: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginBottom: 18, lineHeight: 19 },
  button: { backgroundColor: '#10b981', borderRadius: 10, padding: 16, alignItems: 'center', width: '100%' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  skipText: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
});
