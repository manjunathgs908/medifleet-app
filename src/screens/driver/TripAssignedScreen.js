import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { tripsApi } from '../../api/client';

/**
 * Full-screen trip-assignment alert (Phase 5 of the Ola/Uber-style flow).
 * DriverDashboard's polling effect navigates here (as a modal-presented
 * route — see App.js's Stack.Screen options) when a new 'dispatched'
 * Trip appears for this driver.
 */
export default function TripAssignedScreen({ navigation, route }) {
  const { trip } = route.params || {};
  const [declining, setDeclining] = useState(false);

  function handleAccept() {
    // There is no dedicated "accepted" Trip.status — the enum is
    // booked/dispatched/en_route/completed/cancelled, and 'dispatched'
    // already means "assigned to this driver, awaiting pickup"
    // (tripController.js's validTransitions only allows
    // dispatched -> en_route; re-posting the same 'dispatched' status
    // would be rejected by the backend as a no-op transition anyway).
    // Accepting is therefore a client-side acknowledgment only — the
    // real status change happens on "Reached Pickup" in NavigateScreen.
    navigation.replace('Navigate', { trip });
  }

  async function handleReject() {
    // Phase 6 — PUT /api/trips/:id/decline (driver-only) returns the trip
    // to the unassigned pool so an owner/telecaller can reassign it.
    setDeclining(true);
    try {
      await tripsApi.decline(trip._id);
    } catch (e) {
      // Don't trap the driver on this screen if the call fails — just
      // let them go back; the trip simply stays assigned until an
      // owner/telecaller intervenes.
      Alert.alert('Error', e.response?.data?.message || 'Could not decline the trip, but you can still go back.');
    } finally {
      setDeclining(false);
      navigation.goBack();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>🚑 New Trip Assigned</Text>

        <Text style={styles.label}>Patient</Text>
        <Text style={styles.value}>{trip?.patientName || 'N/A'}</Text>

        <Text style={styles.label}>Emergency Type</Text>
        <Text style={styles.value}>{trip?.emergencyType || 'general'}</Text>

        <Text style={styles.label}>Pickup Address</Text>
        <Text style={styles.value}>{trip?.pickup?.address || 'N/A'}</Text>

        {trip?.distanceKm != null && (
          <>
            <Text style={styles.label}>Distance</Text>
            <Text style={styles.value}>{trip.distanceKm} km</Text>
          </>
        )}

        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.rejectBtn]} onPress={handleReject} disabled={declining}>
            {declining ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Reject</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={handleAccept} disabled={declining}>
            <Text style={styles.btnText}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#111827', borderRadius: 20, padding: 24 },
  badge: { color: '#10b981', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  label: { color: '#9ca3af', fontSize: 12, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  btn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  rejectBtn: { backgroundColor: '#ef4444' },
  acceptBtn: { backgroundColor: '#10b981' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
