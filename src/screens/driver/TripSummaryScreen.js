import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const mins = Math.round((new Date(endIso) - new Date(startIso)) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function Row({ label, value }) {
  if (value == null) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * Shown right after tripsApi.complete() succeeds (see DriverDashboard's
 * handleTripStatus 'CLIENT_DROPPED' branch). Every field below is read
 * directly from that response's `trip`/`bill` — nothing here is invented;
 * see controllers/tripController.js completeTrip() for the exact shape.
 */
export default function TripSummaryScreen({ navigation, route }) {
  const { trip, bill } = route.params || {};
  const duration  = fmtDuration(trip?.enRouteAt, trip?.completedAt);
  const dropLabel = trip?.dropHospital?.name || trip?.dropAddress || 'N/A';
  const grandTotal = trip?.grandTotal ?? bill?.grandTotal;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.checkmark}>✅</Text>
        <Text style={styles.title}>Trip Completed</Text>
        {trip?.tripNumber && <Text style={styles.tripNumber}>{trip.tripNumber}</Text>}

        <View style={styles.fareCard}>
          <Text style={styles.fareLabel}>Total Fare</Text>
          <Text style={styles.fareAmount}>
            {grandTotal != null ? `₹${Number(grandTotal).toLocaleString('en-IN')}` : 'N/A'}
          </Text>
        </View>

        <View style={styles.card}>
          <Row label="Pickup" value={trip?.pickup?.address} />
          <Row label="Drop" value={dropLabel} />
          <Row label="Distance" value={trip?.distanceKm != null ? `${trip.distanceKm} km` : null} />
          <Row label="Duration" value={duration} />
          <Row label="Base Fare" value={trip?.baseFare != null ? `₹${trip.baseFare}` : null} />
          <Row label="GST" value={trip?.gstAmount != null ? `₹${trip.gstAmount}` : null} />
          <Row label="Payment Status" value={bill?.paymentStatus} />
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('DriverDashboard')}>
        <Text style={styles.buttonText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  checkmark: { fontSize: 48, textAlign: 'center', marginTop: 20 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginTop: 8 },
  tripNumber: { color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: 4 },
  fareCard: { backgroundColor: '#111827', borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 24 },
  fareLabel: { color: '#9ca3af', fontSize: 13 },
  fareAmount: { color: '#10b981', fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 16, marginTop: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  rowLabel: { color: '#9ca3af', fontSize: 14 },
  rowValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
  button: { backgroundColor: '#10b981', borderRadius: 12, padding: 18, alignItems: 'center', margin: 16 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
