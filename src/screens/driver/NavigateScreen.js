import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { tripsApi } from '../../api/client';

/**
 * Post-accept "en route to pickup" screen (Phase 5, map added in Phase 8).
 *
 * Shows the pickup location (Trip.pickup.lat/lng — models/index.js) and a
 * single fix of the driver's own current location (expo-location, no
 * continuous tracking in this pass — that's a bigger feature). No
 * polyline: medifleet-app has no src/utils route-fetching helper (checked,
 * confirmed absent), and this project has no Directions-API integration
 * to reuse, so drawing a real route line was skipped per instructions
 * rather than approximated.
 *
 * If trip.pickup has no lat/lng (older/manually-entered trips), falls
 * back to the original address-only card instead of rendering a map with
 * no pickup marker.
 */
export default function NavigateScreen({ navigation, route }) {
  const { trip } = route.params || {};
  const [loading, setLoading] = useState(false);

  const pickupCoord = (trip?.pickup?.lat != null && trip?.pickup?.lng != null)
    ? { latitude: trip.pickup.lat, longitude: trip.pickup.lng }
    : null;

  const [driverCoord, setDriverCoord] = useState(null);
  const mapRef = useRef(null);

  // One-shot location fix on mount — not continuous tracking.
  useEffect(() => {
    if (!pickupCoord) return; // nothing to show a driver marker relative to
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({});
        setDriverCoord({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        // GPS unavailable — the map still shows the pickup marker alone.
      }
    })();
  }, [pickupCoord?.latitude, pickupCoord?.longitude]);

  // Once both points are known, frame the map to show both.
  useEffect(() => {
    if (!pickupCoord || !driverCoord || !mapRef.current) return;
    mapRef.current.fitToCoordinates([pickupCoord, driverCoord], {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated: true,
    });
  }, [pickupCoord, driverCoord]);

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
      {pickupCoord ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: pickupCoord.latitude,
            longitude: pickupCoord.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
        >
          <Marker
            coordinate={pickupCoord}
            title="Pickup"
            description={trip?.pickup?.address}
            pinColor="#ef4444"
          />
          {driverCoord && (
            <Marker
              coordinate={driverCoord}
              title="Your location"
              pinColor="#10b981"
            />
          )}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapIcon}>📍</Text>
          <Text style={styles.mapPlaceholderText}>No pickup coordinates on this trip</Text>
          <Text style={styles.mapPlaceholderSub}>Showing the address below instead</Text>
        </View>
      )}

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
  map: { height: 280 },
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
