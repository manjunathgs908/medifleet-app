import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { driverAuthApi } from '../api/client';
import PinInput from '../components/PinInput';

/**
 * Forced first-login PIN change (Phase 4 of the driver-auth redesign).
 * App.js only ever mounts this screen as the sole screen of its own
 * Stack.Navigator while user.pinChangeRequired is true, and headerShown
 * is false there — so there is no back button/gesture to hide; there is
 * simply nothing to go back to. (A future *voluntary* PIN-change entry
 * point, e.g. from a Profile screen, would need its own back handling —
 * out of scope for this phase.)
 */
export default function ChangePinScreen() {
  const { completePinChange } = useAuth();
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (oldPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6) {
      Alert.alert('Error', 'Please enter all three 6-digit PINs.');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('Error', 'New PIN and Confirm PIN do not match.');
      return;
    }
    if (newPin === oldPin) {
      Alert.alert('Error', 'New PIN must be different from your current PIN.');
      return;
    }

    setLoading(true);
    try {
      await driverAuthApi.changePin(oldPin, newPin);
      await completePinChange();
      // App.js reacts to pinChangeRequired:false and moves on automatically.
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to change PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Set a New PIN</Text>
        <Text style={styles.subtitle}>
          This is your first login. Please set a personal 6-digit PIN before continuing.
        </Text>

        <Text style={styles.label}>Current (Temporary) PIN</Text>
        <PinInput length={6} value={oldPin} onChange={setOldPin} autoFocus />

        <Text style={[styles.label, { marginTop: 22 }]}>New PIN</Text>
        <PinInput length={6} value={newPin} onChange={setNewPin} />

        <Text style={[styles.label, { marginTop: 22 }]}>Confirm New PIN</Text>
        <PinInput length={6} value={confirmPin} onChange={setConfirmPin} />

        <TouchableOpacity style={[styles.button, { marginTop: 28 }]} onPress={handleSubmit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Save & Continue</Text>
          }
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
    marginBottom: 24,
    lineHeight: 19,
  },
  label: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
