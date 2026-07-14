import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { tripsApi } from '../../api/client';

// selectedType is a raw Pricing serviceType id (e.g. "bls", "dead-body") —
// no label table exists anywhere in the app/backend, so this just makes
// short ids read as acronyms and longer ones as Title Case.
function formatAmbulanceType(selectedType) {
  if (!selectedType) return 'N/A';
  const words = String(selectedType).split(/[-_\s]+/).filter(Boolean);
  if (words.length === 1 && words[0].length <= 4) return words[0].toUpperCase();
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Full-screen Accept/Reject popup shown when DriverDashboard's polling
 * detects a trip that is 'dispatched' to this driver but not yet
 * trip.driverConfirmed (see tripController.js's confirmTrip/declineTrip).
 * Presented as a modal route from App.js — see that file for options.
 */
export default function TripAssignedScreen({ navigation, route }) {
  const { trip } = route.params || {};
  const [submitting, setSubmitting] = useState(false);

  const destination = trip?.dropHospital?.name || trip?.dropAddress || 'N/A';
  const estimatedFare = (trip?.baseFare || 0) + (trip?.additionalCharges || 0);
  const isScheduled = trip?.scheduleType === 'later';

  async function handleAccept() {
    setSubmitting(true);
    try {
      const { data } = await tripsApi.confirm(trip._id);
      navigation.navigate('DriverDashboard', { confirmedTrip: data.trip });
    } catch (e) {
      const msg = e.response?.data?.message || 'Could not confirm the trip. Please try again.';
      Alert.alert('Error', msg);
      setSubmitting(false);
    }
  }

  async function handleReject() {
    setSubmitting(true);
    try {
      await tripsApi.decline(trip._id);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not decline the trip, but you can still go back.');
    } finally {
      setSubmitting(false);
      navigation.navigate('DriverDashboard');
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.badge}>🚑 New Trip Assigned</Text>

          <View style={styles.tagRow}>
            <View style={[styles.tag, isScheduled ? styles.tagScheduled : styles.tagEmergency]}>
              <Text style={styles.tagTxt}>{isScheduled ? '🗓 Scheduled' : '🚨 Emergency'}</Text>
            </View>
          </View>

          <Text style={styles.label}>Customer Name</Text>
          <Text style={styles.value}>{trip?.patientName || 'N/A'}</Text>

          <Text style={styles.label}>Pickup Address</Text>
          <Text style={styles.value}>{trip?.pickup?.address || 'N/A'}</Text>

          <Text style={styles.label}>Destination</Text>
          <Text style={styles.value}>{destination}</Text>

          <View style={styles.row2}>
            <View style={styles.col}>
              <Text style={styles.label}>Ambulance Type</Text>
              <Text style={styles.value}>{formatAmbulanceType(trip?.selectedType)}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Distance</Text>
              <Text style={styles.value}>{trip?.distanceKm != null ? `${trip.distanceKm} km` : 'N/A'}</Text>
            </View>
          </View>

          <Text style={styles.label}>Estimated Fare</Text>
          <Text style={styles.fareValue}>₹{estimatedFare}</Text>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, styles.rejectBtn]}
              onPress={handleReject}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Reject</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.acceptBtn]}
              onPress={handleAccept}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Accept</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgba(10,15,30,0.92)' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#111827', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  badge: { color: '#10b981', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },

  tagRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  tag: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20 },
  tagEmergency: { backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)' },
  tagScheduled: { backgroundColor: 'rgba(59,130,246,0.15)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)' },
  tagTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  label: { color: '#9ca3af', fontSize: 12, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 4 },
  fareValue: { color: '#10b981', fontSize: 24, fontWeight: 'bold', marginTop: 4 },

  row2: { flexDirection: 'row', gap: 20 },
  col: { flex: 1 },

  btnRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  btn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  rejectBtn: { backgroundColor: '#ef4444' },
  acceptBtn: { backgroundColor: '#10b981' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
