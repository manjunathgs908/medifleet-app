import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import * as Application from 'expo-application';

/**
 * First screen of the driver-onboarding flow (App.js only mounts this once,
 * before Login, gated the same way as ChangePin/Permissions below).
 */
export default function WelcomeScreen({ onDone }) {
  return (
    <View style={styles.container}>
      <Image source={require('../../assets/icon.png')} style={styles.logo} />
      <Text style={styles.title}>Welcome Driver</Text>
      <Text style={styles.subtitle}>Sign in to start your shift and pick up trips.</Text>

      <TouchableOpacity style={styles.button} onPress={onDone}>
        <Text style={styles.buttonText}>Get Started →</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Version {Application.nativeApplicationVersion || '1.0.0'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: { width: 96, height: 96, borderRadius: 20, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: {
    fontSize: 14, color: '#9ca3af', textAlign: 'center',
    marginTop: 10, marginBottom: 36, lineHeight: 20, paddingHorizontal: 12,
  },
  button: {
    backgroundColor: '#10b981', borderRadius: 10,
    paddingVertical: 16, paddingHorizontal: 48,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  version: { position: 'absolute', bottom: 32, color: '#4b5563', fontSize: 12 },
});
