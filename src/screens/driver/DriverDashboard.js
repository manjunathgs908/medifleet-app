import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { driverAuthApi, tripsApi } from '../../api/client';

// Default region: Bengaluru (map ge fallback, GPS baruvavarege)
const BANGALORE = {
  latitude: 12.9716,
  longitude: 77.5946,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Every how many milliseconds the driver's location is sent to the backend
const LOCATION_UPDATE_INTERVAL_MS = 10000; // 10 seconds
// Every how many milliseconds we check for a newly assigned trip
const TRIP_POLL_INTERVAL_MS = 15000; // 15 seconds

export default function DriverDashboard({ navigation }) {
  const { user, logout } = useAuth();
  const mapRef = useRef(null);
  const intervalRef = useRef(null);
  const tripIntervalRef = useRef(null);

  const [region, setRegion] = useState(BANGALORE);
  const [driverLoc, setDriverLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [activeTrip, setActiveTrip] = useState(null);
  const [startingTrip, setStartingTrip] = useState(false);

  // ── Get initial location + start map ──
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) {
            setErrorMsg('Location permission beku. Settings alli allow maadi.');
            setLoading(false);
          }
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (mounted) {
          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setDriverLoc(coords);
          setRegion({
            ...coords,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setErrorMsg('Location tegeyalu aagalilla. GPS on ideya check maadi.');
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ── Send location to backend every 10 seconds ──
  useEffect(() => {
    const sendLocation = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const { latitude, longitude } = loc.coords;

        setDriverLoc({ latitude, longitude });

        await driverAuthApi.updateLocation(latitude, longitude, 'available');
      } catch (err) {
        // Silent — next interval tick will retry automatically.
      }
    };

    sendLocation();
    intervalRef.current = setInterval(sendLocation, LOCATION_UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ── Poll for an assigned trip (dispatched / en_route) ──
  useEffect(() => {
    const checkForTrip = async () => {
      try {
        const { data } = await tripsApi.getAll({});
        const trips = data.trips || [];
        const trip = trips.find(t => t.status === 'dispatched' || t.status === 'en_route');
        setActiveTrip(trip || null);
      } catch (err) {
        // Silent — next interval tick will retry automatically.
      }
    };

    checkForTrip();
    tripIntervalRef.current = setInterval(checkForTrip, TRIP_POLL_INTERVAL_MS);

    return () => {
      if (tripIntervalRef.current) clearInterval(tripIntervalRef.current);
    };
  }, []);

  const startTrip = async () => {
    if (!activeTrip) return;
    setStartingTrip(true);
    try {
      await tripsApi.updateStatus(activeTrip._id, 'en_route');
      setActiveTrip({ ...activeTrip, status: 'en_route' });
      Alert.alert('Trip Started', 'Safe driving! Patient/hospital ge navigate maadi.');
    } catch (err) {
      Alert.alert('Error', 'Trip start maadalu aagalilla. Wapas try maadi.');
    } finally {
      setStartingTrip(false);
    }
  };

  const recenter = () => {
    if (driverLoc && mapRef.current) {
      mapRef.current.animateToRegion(
        { ...driverLoc, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        500
      );
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Full-screen Map ── */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        region={region}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingTxt}>Loading map...</Text>
        </View>
      )}

      {errorMsg && !loading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTxt}>{errorMsg}</Text>
        </View>
      )}

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <View style={styles.topBarCard}>
          <View>
            <Text style={styles.welcome}>Hello, {user?.name}!</Text>
            <Text style={styles.role}>Driver</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutTxt}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Re-center button ── */}
      <TouchableOpacity style={[styles.recenterBtn, activeTrip && { bottom: 340 }]} onPress={recenter}>
        <Text style={styles.recenterIcon}>📍</Text>
      </TouchableOpacity>

      {/* ── Active Trip Card ── */}
      {activeTrip && (
        <ScrollView style={styles.tripCard} contentContainerStyle={styles.tripCardContent}>
          <View style={styles.tripHeader}>
            <Text style={styles.tripHeaderTxt}>
              {activeTrip.status === 'en_route' ? '🚑 Trip In Progress' : '🆕 New Trip Assigned'}
            </Text>
          </View>

          <Text style={styles.patientName}>{activeTrip.patientName}</Text>
          {activeTrip.patientPhone && activeTrip.patientPhone !== 'N/A' && (
            <Text style={styles.patientPhone}>📞 {activeTrip.patientPhone}</Text>
          )}

          <View style={styles.tripRow}>
            <Text style={styles.tripLabel}>📍 Pickup</Text>
            <Text style={styles.tripValue}>{activeTrip.pickup?.address || '—'}</Text>
          </View>

          {activeTrip.dropHospital?.name && (
            <View style={styles.tripRow}>
              <Text style={styles.tripLabel}>🏥 Drop</Text>
              <Text style={styles.tripValue}>{activeTrip.dropHospital.name}</Text>
            </View>
          )}
          {!activeTrip.dropHospital?.name && activeTrip.dropAddress && (
            <View style={styles.tripRow}>
              <Text style={styles.tripLabel}>🏁 Drop</Text>
              <Text style={styles.tripValue}>{activeTrip.dropAddress}</Text>
            </View>
          )}

          <View style={styles.tripRow}>
            <Text style={styles.tripLabel}>💰 Fare</Text>
            <Text style={styles.tripValue}>₹{activeTrip.baseFare || 0}</Text>
          </View>

          {activeTrip.status === 'dispatched' ? (
            <TouchableOpacity
              style={styles.startBtn}
              onPress={startTrip}
              disabled={startingTrip}
            >
              <Text style={styles.startBtnTxt}>
                {startingTrip ? 'Starting...' : '▶ Trip Started'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.inProgressBadge}>
              <Text style={styles.inProgressTxt}>En Route — Trip active</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Bottom nav ── */}
      <View style={styles.bottomNav}>
        <View style={styles.navItem}>
          <Text style={styles.navIconActive}>🏠</Text>
          <Text style={styles.navLabelActive}>Home</Text>
        </View>
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Trips', 'Coming soon')}>
          <Text style={styles.navIcon}>📋</Text>
          <Text style={styles.navLabel}>Trips</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Earnings', 'Coming soon')}>
          <Text style={styles.navIcon}>💰</Text>
          <Text style={styles.navLabel}>Earnings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Messages', 'Coming soon')}>
          <Text style={styles.navIcon}>💬</Text>
          <Text style={styles.navLabel}>Messages</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Profile', 'Coming soon')}>
          <Text style={styles.navIcon}>👤</Text>
          <Text style={styles.navLabel}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,15,30,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: { color: '#fff', marginTop: 12, fontSize: 15 },

  errorBanner: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    backgroundColor: '#ef4444',
    padding: 12,
    borderRadius: 10,
  },
  errorTxt: { color: '#fff', fontSize: 13, textAlign: 'center' },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 44, paddingHorizontal: 16 },
  topBarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(17,24,39,0.92)',
    padding: 14,
    borderRadius: 14,
  },
  welcome: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  role: { color: '#10b981', fontSize: 13, marginTop: 2 },
  logoutBtn: { backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  logoutTxt: { color: '#fff', fontWeight: 'bold' },

  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 110,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  recenterIcon: { fontSize: 22 },

  // ── Trip card ──
  tripCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    maxHeight: 300,
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tripCardContent: { padding: 18 },
  tripHeader: { marginBottom: 8 },
  tripHeaderTxt: { color: '#3b82f6', fontSize: 13, fontWeight: '700' },
  patientName: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  patientPhone: { color: '#9ca3af', fontSize: 13, marginTop: 2, marginBottom: 10 },

  tripRow: { marginBottom: 8 },
  tripLabel: { color: '#6b7280', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  tripValue: { color: '#e5e7eb', fontSize: 14 },

  startBtn: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  startBtnTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  inProgressBadge: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  inProgressTxt: { color: '#3b82f6', fontSize: 14, fontWeight: '700' },

  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
    paddingBottom: 22,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navIcon: { fontSize: 20, opacity: 0.45 },
  navIconActive: { fontSize: 20 },
  navLabel: { color: '#6b7280', fontSize: 10, fontWeight: '600' },
  navLabelActive: { color: '#10b981', fontSize: 10, fontWeight: '700' },
});