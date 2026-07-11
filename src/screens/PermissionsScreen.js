import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';

/**
 * One-time permissions gate (Phase 4 of the driver-auth redesign).
 * App.js only mounts this when either permission isn't already granted;
 * once both are granted it's skipped entirely on subsequent logins.
 */
export default function PermissionsScreen({ onDone }) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();

  // Auto-trigger the native prompts once, the first time each permission
  // has never been asked for — avoids re-prompting on every render after
  // the user has already answered (granted or denied) once.
  useEffect(() => {
    if (cameraPermission?.status === 'undetermined') requestCameraPermission();
  }, [cameraPermission?.status]);

  useEffect(() => {
    if (locationPermission?.status === 'undetermined') requestLocationPermission();
  }, [locationPermission?.status]);

  const cameraGranted   = !!cameraPermission?.granted;
  const locationGranted = !!locationPermission?.granted;
  const bothGranted      = cameraGranted && locationGranted;

  const cameraBlocked   = !!cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain;
  const locationBlocked = !!locationPermission && !locationPermission.granted && !locationPermission.canAskAgain;
  const anyBlocked      = cameraBlocked || locationBlocked;

  function statusIcon(granted, blocked) {
    if (granted) return '✅';
    if (blocked) return '⛔';
    return '⏳';
  }

  function handlePress() {
    if (bothGranted) {
      onDone?.();
    } else if (anyBlocked) {
      Linking.openSettings();
    } else {
      requestCameraPermission();
      requestLocationPermission();
    }
  }

  const buttonLabel = bothGranted ? 'Continue →' : anyBlocked ? 'Open Settings' : 'Grant Permissions';
  // Disabled only while both permissions are still undetermined and
  // there's nothing actionable for the button to do yet.
  const buttonDisabled = !bothGranted && !anyBlocked
    && cameraPermission?.status === 'undetermined'
    && locationPermission?.status === 'undetermined';

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>App Permissions</Text>
        <Text style={styles.subtitle}>MediFleet needs two permissions to work correctly:</Text>

        <View style={styles.permRow}>
          <Text style={styles.permIcon}>📸</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.permTitle}>Camera</Text>
            <Text style={styles.permDesc}>Used to take your selfie when you start a shift.</Text>
          </View>
          <Text style={styles.permStatus}>{statusIcon(cameraGranted, cameraBlocked)}</Text>
        </View>

        <View style={styles.permRow}>
          <Text style={styles.permIcon}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.permTitle}>Location</Text>
            <Text style={styles.permDesc}>Used to track your ambulance's position during a trip.</Text>
          </View>
          <Text style={styles.permStatus}>{statusIcon(locationGranted, locationBlocked)}</Text>
        </View>

        {anyBlocked && (
          <Text style={styles.warnText}>
            One or more permissions were permanently denied. Please enable them in Settings.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, buttonDisabled && { opacity: 0.5 }]}
          onPress={handlePress}
          disabled={buttonDisabled}
        >
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 30,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 22,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  permIcon: { fontSize: 22 },
  permTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  permDesc: { color: '#9ca3af', fontSize: 12, marginTop: 2, lineHeight: 17 },
  permStatus: { fontSize: 18 },
  warnText: {
    color: '#f59e0b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 17,
  },
  button: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
