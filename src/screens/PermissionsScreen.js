import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';

/**
 * One-time permissions gate (Phase 4 of the driver-auth redesign, extended
 * for the full onboarding flow). App.js only mounts this when at least one
 * *required* permission isn't already granted; once all required ones are
 * granted it's skipped entirely on subsequent logins. Microphone is optional
 * (has its own Skip) — everything else is required because DriverDashboard's
 * live-tracking/trip-assignment/selfie flows depend on it.
 */
export default function PermissionsScreen({ onDone }) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [foregroundPermission, requestForegroundPermission] = Location.useForegroundPermissions();
  const [backgroundPermission, requestBackgroundPermission] = Location.useBackgroundPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  // expo-notifications has no permission hook — tracked manually.
  const [notifPermission, setNotifPermission] = useState(null);

  const refreshNotifPermission = useCallback(async () => {
    const status = await Notifications.getPermissionsAsync();
    setNotifPermission(status);
  }, []);

  useEffect(() => {
    refreshNotifPermission();
  }, [refreshNotifPermission]);

  async function requestNotifPermission() {
    const status = await Notifications.requestPermissionsAsync();
    setNotifPermission(status);
    return status;
  }

  // Background location can only be requested after foreground is granted
  // (OS requirement on both Android and iOS) — auto-trigger it right after.
  useEffect(() => {
    if (cameraPermission?.status === 'undetermined') requestCameraPermission();
  }, [cameraPermission?.status]);

  useEffect(() => {
    if (foregroundPermission?.status === 'undetermined') requestForegroundPermission();
  }, [foregroundPermission?.status]);

  useEffect(() => {
    if (foregroundPermission?.granted && backgroundPermission?.status === 'undetermined') {
      requestBackgroundPermission();
    }
  }, [foregroundPermission?.granted, backgroundPermission?.status]);

  useEffect(() => {
    if (notifPermission?.status === 'undetermined') requestNotifPermission();
  }, [notifPermission?.status]);

  useEffect(() => {
    if (mediaPermission?.status === 'undetermined') requestMediaPermission();
  }, [mediaPermission?.status]);

  const required = [
    { key: 'camera', icon: '📸', title: 'Camera', desc: "Used to take your selfie when you start a shift.", perm: cameraPermission },
    { key: 'location', icon: '📍', title: 'Location', desc: "Used to track your ambulance's position during a trip.", perm: foregroundPermission },
    { key: 'backgroundLocation', icon: '🛰️', title: 'Background Location', desc: 'Keeps tracking your position even while the app is in the background.', perm: backgroundPermission },
    { key: 'notifications', icon: '🔔', title: 'Notifications', desc: 'Alerts you the moment a new trip is assigned.', perm: notifPermission },
    { key: 'media', icon: '🖼️', title: 'Storage', desc: 'Lets you save and attach photos from your device.', perm: mediaPermission },
  ];

  const optional = [
    { key: 'microphone', icon: '🎙️', title: 'Microphone', desc: 'Optional — only needed if you record audio notes during a trip.', perm: microphonePermission },
  ];

  function statusIcon(perm) {
    if (!perm) return '⏳';
    if (perm.granted) return '✅';
    if (!perm.canAskAgain && perm.status !== 'undetermined') return '⛔';
    return '⏳';
  }

  const requiredGranted = required.every(p => p.perm?.granted);
  const requiredBlocked = required.some(p => p.perm && !p.perm.granted && p.perm.canAskAgain === false);
  const microphoneBlocked = !!microphonePermission && !microphonePermission.granted && microphonePermission.canAskAgain === false;

  function handlePress() {
    if (requiredGranted) {
      onDone?.();
    } else if (requiredBlocked) {
      Linking.openSettings();
    } else {
      if (cameraPermission?.status !== 'granted') requestCameraPermission();
      if (foregroundPermission?.status !== 'granted') requestForegroundPermission();
      if (foregroundPermission?.granted && backgroundPermission?.status !== 'granted') requestBackgroundPermission();
      if (notifPermission?.status !== 'granted') requestNotifPermission();
      if (mediaPermission?.status !== 'granted') requestMediaPermission();
    }
  }

  const allUndetermined = required.every(p => p.perm?.status === 'undetermined');
  const buttonLabel = requiredGranted ? 'Continue →' : requiredBlocked ? 'Open Settings' : 'Grant Permissions';
  const buttonDisabled = !requiredGranted && !requiredBlocked && allUndetermined;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>App Permissions</Text>
        <Text style={styles.subtitle}>MediFleet needs a few permissions to work correctly:</Text>

        {required.map(p => (
          <View key={p.key} style={styles.permRow}>
            <Text style={styles.permIcon}>{p.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>{p.title}</Text>
              <Text style={styles.permDesc}>{p.desc}</Text>
            </View>
            <Text style={styles.permStatus}>{statusIcon(p.perm)}</Text>
          </View>
        ))}

        {optional.map(p => (
          <View key={p.key} style={styles.permRow}>
            <Text style={styles.permIcon}>{p.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>{p.title}</Text>
              <Text style={styles.permDesc}>{p.desc}</Text>
            </View>
            <Text style={styles.permStatus}>{statusIcon(p.perm)}</Text>
          </View>
        ))}

        {requiredBlocked && (
          <Text style={styles.warnText}>
            One or more permissions were permanently denied. Please enable them in Settings.
          </Text>
        )}

        {!microphonePermission?.granted && (
          <TouchableOpacity onPress={requestMicrophonePermission} disabled={microphoneBlocked}>
            <Text style={styles.micLink}>
              {microphoneBlocked ? 'Microphone denied — enable in Settings if needed' : 'Grant microphone access (optional)'}
            </Text>
          </TouchableOpacity>
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
  micLink: {
    color: '#3b82f6',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
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
