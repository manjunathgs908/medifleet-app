import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { acceptTrip, rejectTrip } from '../../utils/tripResponse';
import * as TripCall from 'trip-call';

// Same formatter as TripAssignedScreen.js — selectedType is a raw Pricing
// serviceType id with no label table anywhere in the app/backend.
function formatAmbulanceType(selectedType) {
  if (!selectedType) return 'AMBULANCE';
  const words = String(selectedType).split(/[-_\s]+/).filter(Boolean);
  if (words.length === 1 && words[0].length <= 4) return words[0].toUpperCase();
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Ola-style full-screen incoming-trip card — reached via the full-screen
 * push path (index.js's FCM background handler displays a notification
 * with android.fullScreenAction; App.js's getInitialNotification/
 * onForegroundEvent wiring routes here on press/launch). Deliberately a
 * separate screen from TripAssignedScreen.js (different trigger, different
 * data shape — this one gets a flat string-only payload straight from the
 * FCM data message, not a full Trip document), but ACCEPT/REJECT call the
 * exact same acceptTrip/rejectTrip helpers TripAssignedScreen.js uses —
 * one implementation of that behavior, not two.
 */
export default function IncomingTripScreen({ navigation, route }) {
  const {
    tripId, tripNumber, patientName, pickupAddress,
    dropAddress, distanceKm, fare, selectedType,
  } = route.params || {};
  const [submitting, setSubmitting] = useState(false);

  // The native Connection's own 30s ring timeout (modules/trip-call) fires
  // independent of this screen — if the driver never taps a button, the OS
  // call ends on its own and this listener dismisses the card to match.
  // Doesn't fire for 'answered'/'rejected' from OUR OWN button taps below
  // (this screen has already navigated away by the time those resolve), so
  // no double-handling.
  useEffect(() => {
    const sub = TripCall.addCallEndedListener(({ reason }) => {
      if (reason === 'timeout') {
        navigation.replace('DriverDashboard');
      }
    });
    return () => sub.remove();
  }, [navigation]);

  async function handleAccept() {
    setSubmitting(true);
    try {
      await TripCall.answerCall(tripId);
      const confirmedTrip = await acceptTrip(tripId);
      navigation.replace('DriverDashboard', { confirmedTrip });
    } catch (e) {
      const msg = e.response?.data?.message || 'Could not confirm the trip. Please try again.';
      Alert.alert('Error', msg);
      setSubmitting(false);
    }
  }

  async function handleReject() {
    setSubmitting(true);
    try {
      await TripCall.rejectCall(tripId);
      await rejectTrip(tripId);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not decline the trip, but you can still go back.');
    } finally {
      setSubmitting(false);
      navigation.replace('DriverDashboard');
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.badge}>🚨 NEW TRIP</Text>
        {!!tripNumber && <Text style={styles.tripNumber}>{tripNumber}</Text>}

        <View style={styles.card}>
          <View style={styles.typeChip}>
            <Text style={styles.typeChipTxt}>🚑 {formatAmbulanceType(selectedType)}</Text>
          </View>

          <Text style={styles.label}>Patient</Text>
          <Text style={styles.value}>{patientName || 'N/A'}</Text>

          <Text style={styles.label}>Pickup</Text>
          <Text style={styles.value}>{pickupAddress || 'N/A'}</Text>

          <Text style={styles.label}>Drop</Text>
          <Text style={styles.value}>{dropAddress || 'N/A'}</Text>

          <View style={styles.row2}>
            <View style={styles.col}>
              <Text style={styles.label}>Distance</Text>
              <Text style={styles.value}>{distanceKm ? `${distanceKm} km` : 'N/A'}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Fare</Text>
              <Text style={styles.fareValue}>{fare ? `₹${fare}` : 'N/A'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.rejectBtn]}
            onPress={handleReject}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>✕ Reject</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.acceptBtn]}
            onPress={handleAccept}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>✓ Accept</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  badge: {
    color: '#e8192c', fontSize: 22, fontWeight: '900', textAlign: 'center',
    letterSpacing: 1.5,
  },
  tripNumber: { color: '#6b7280', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 4, marginBottom: 20 },

  card: {
    backgroundColor: '#111827', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: 'rgba(232,25,44,0.35)', marginTop: 16,
  },
  typeChip: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(20,184,166,0.15)',
    borderWidth: 1, borderColor: 'rgba(20,184,166,0.4)',
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginBottom: 8,
  },
  typeChipTxt: { color: '#14B8A6', fontSize: 13, fontWeight: '800' },

  label: { color: '#9ca3af', fontSize: 12, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 4 },
  fareValue: { color: '#14B8A6', fontSize: 24, fontWeight: '900', marginTop: 4 },

  row2: { flexDirection: 'row', gap: 20, marginTop: 4 },
  col: { flex: 1 },

  btnRow: { flexDirection: 'row', gap: 14, marginTop: 28 },
  btn: { flex: 1, paddingVertical: 20, borderRadius: 16, alignItems: 'center' },
  rejectBtn: { backgroundColor: '#e8192c' },
  acceptBtn: { backgroundColor: '#14B8A6' },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 18 },
});
