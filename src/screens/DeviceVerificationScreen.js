import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import * as Application from 'expo-application';
import { useAuth } from '../context/AuthContext';
import { getDeviceId, checkInternet } from '../utils/device';

const CHECK_DEFS = [
  { key: 'device', label: 'Registered device' },
  { key: 'internet', label: 'Internet connection' },
  { key: 'gps', label: 'GPS enabled' },
  { key: 'version', label: 'App version' },
];

/**
 * Runs once, right after login (User already has deviceId bound server-side
 * at this point — this screen re-verifies the same identity locally, not a
 * fake progress bar).
 */
export default function DeviceVerificationScreen({ onDone }) {
  const { user } = useAuth();
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(true);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setResults({});

    const localDeviceId = await getDeviceId();
    setResults(r => ({ ...r, device: !!localDeviceId && localDeviceId === user?.deviceId }));

    const internetOk = await checkInternet();
    setResults(r => ({ ...r, internet: internetOk }));

    const gpsOk = await Location.hasServicesEnabledAsync();
    setResults(r => ({ ...r, gps: gpsOk }));

    const versionOk = !!Application.nativeApplicationVersion;
    setResults(r => ({ ...r, version: versionOk }));

    setRunning(false);
  }, [user?.deviceId]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const allDone = CHECK_DEFS.every(c => results[c.key] !== undefined);
  const allPassed = allDone && CHECK_DEFS.every(c => results[c.key] === true);
  const anyFailed = allDone && CHECK_DEFS.some(c => results[c.key] === false);

  function statusIcon(key) {
    if (results[key] === undefined) return '⏳';
    return results[key] ? '✅' : '⛔';
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Verifying your device…</Text>
        <Text style={styles.subtitle}>Please wait while we run a few quick checks.</Text>

        {CHECK_DEFS.map(c => (
          <View key={c.key} style={styles.row}>
            <Text style={styles.rowLabel}>{c.label}</Text>
            <Text style={styles.rowStatus}>{statusIcon(c.key)}</Text>
          </View>
        ))}

        {anyFailed && (
          <Text style={styles.warnText}>
            One or more checks failed. Make sure GPS and internet are on, then try again.
          </Text>
        )}

        {running ? (
          <ActivityIndicator color="#10b981" style={{ marginTop: 20 }} />
        ) : allPassed ? (
          <TouchableOpacity style={styles.button} onPress={onDone}>
            <Text style={styles.buttonText}>Continue →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.button} onPress={runChecks}>
            <Text style={styles.buttonText}>Retry</Text>
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
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 30, width: '100%', maxWidth: 400 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginBottom: 22 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1f2937', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  rowLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rowStatus: { fontSize: 18 },
  warnText: { color: '#f59e0b', fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 17 },
  button: { backgroundColor: '#10b981', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
