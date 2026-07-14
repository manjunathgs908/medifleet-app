import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, AppState } from 'react-native';
import { BatteryOptEnabled, OpenOptimizationSettings } from 'react-native-battery-optimization-check';

/**
 * Android-only — iOS has no equivalent battery-optimization/Doze concept,
 * so this screen skips itself immediately there. Uses OpenOptimizationSettings
 * (opens the OS whitelist screen) rather than RequestDisableOptimization —
 * the library's own README flags that direct-exemption prompts violate
 * Play Store policy unless the app's core function requires it; routing the
 * user through Settings is the compliant path.
 */
export default function BatteryOptimizationScreen({ onDone }) {
  const [optimized, setOptimized] = useState(null);
  const [checking, setChecking] = useState(true);

  const checkStatus = useCallback(async () => {
    if (Platform.OS !== 'android') {
      onDone?.();
      return;
    }
    setChecking(true);
    try {
      const isEnabled = await BatteryOptEnabled();
      setOptimized(isEnabled);
    } catch {
      setOptimized(false);
    } finally {
      setChecking(false);
    }
  }, [onDone]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Re-check when the user comes back from the OS Settings screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkStatus();
    });
    return () => sub.remove();
  }, [checkStatus]);

  if (Platform.OS !== 'android') return null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>🔋</Text>
        <Text style={styles.title}>Battery Optimization</Text>
        <Text style={styles.subtitle}>
          MediFleet needs to run in the background to track your location and receive trip
          assignments while you're on duty. Please disable battery optimization for this app.
        </Text>

        {!checking && (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>
              {optimized ? '⛔ Battery optimization is ON' : '✅ Battery optimization is OFF'}
            </Text>
          </View>
        )}

        {optimized ? (
          <TouchableOpacity style={styles.button} onPress={OpenOptimizationSettings} disabled={checking}>
            <Text style={styles.buttonText}>Open Settings</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.button} onPress={onDone} disabled={checking}>
            <Text style={styles.buttonText}>Continue →</Text>
          </TouchableOpacity>
        )}

        {optimized && (
          <TouchableOpacity onPress={onDone} style={{ marginTop: 14 }}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        )}
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
  statusBox: {
    backgroundColor: '#1f2937', borderRadius: 12, padding: 14,
    width: '100%', alignItems: 'center', marginBottom: 18,
  },
  statusText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  button: { backgroundColor: '#10b981', borderRadius: 10, padding: 16, alignItems: 'center', width: '100%' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  skipText: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
});
