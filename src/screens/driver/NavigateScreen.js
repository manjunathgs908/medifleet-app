import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { tripsApi } from '../../api/client';

/**
 * Post-accept "en route to pickup" screen (Phase 5).
 *
 * LIMITATION: react-native-maps is NOT a dependency of this project
 * (checked package.json — no map library present anywhere). Per
 * instructions this phase does not add a new native map library, since
 * that would require a new native build (not just an eas update). This
 * screen shows a static address card + "Reached Pickup" action instead
 * of an actual map. Flagging clearly rather than guessing: adding a real
 * map here is a follow-up phase that needs `npx expo install
 * react-native-maps` and a fresh native/EAS build.
 */
export default function NavigateScreen({ navigation, route }) {
  const { trip } = route.params || {};
  const [loading, setLoading] = useState(false);

  async function handleReachedPickup() {
    setLoading(true);
    try {
      // The only valid forward transition from 'dispatched' is 'en_route'
      // (tripController.js validTransitions) — same call DriverDashboard's
      // existing "▶ Start Trip" button already makes for a dispatched trip.
      await tripsApi.updateStatus(trip._id, 'en_route');

      // Trip completion for THIS Trip lives on DriverDashboard's Active
      // Trip card — its "📍 Client Dropped" button (Bug #2-fixed) is what
      // actually calls tripsApi.complete() and opens TripSummaryScreen.
      // BookingTripScreen tracks a separate BookingTrip document with no
      // link back to this Trip's _id, so routing through it here would
      // never actually complete *this* trip — returning to Dashboard
      // instead puts the real completion action in front of the driver.
      navigation.navigate('DriverDashboard');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update trip status.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapIcon}>📍</Text>
        <Text style={styles.mapPlaceholderText}>Map view not available in this build</Text>
        <Text style={styles.mapPlaceholderSub}>react-native-maps is not installed — see pickup address below</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Pickup Address</Text>
        <Text style={styles.value}>{trip?.pickup?.address || 'N/A'}</Text>

        <Text style={[styles.label, { marginTop: 16 }]}>Patient</Text>
        <Text style={styles.value}>{trip?.patientName || 'N/A'}</Text>

        <TouchableOpacity style={styles.button} onPress={handleReachedPickup} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>📍 Reached Pickup</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  mapPlaceholder: {
    height: 280,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  mapIcon: { fontSize: 40, marginBottom: 10 },
  mapPlaceholderText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  mapPlaceholderSub: { color: '#6b7280', fontSize: 12, marginTop: 6, textAlign: 'center', paddingHorizontal: 30 },
  card: { margin: 16, backgroundColor: '#111827', borderRadius: 16, padding: 20 },
  label: { color: '#9ca3af', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: '#fff', fontSize: 17, fontWeight: '600', marginTop: 4 },
  button: { backgroundColor: '#10b981', borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 28 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
