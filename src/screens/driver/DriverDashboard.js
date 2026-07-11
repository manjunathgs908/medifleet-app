import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { tripsApi, tripActivityApi } from '../../api/client';
import * as Location from 'expo-location';

export default function DriverDashboard({ navigation }) {
  const { user, logout } = useAuth();
 const [trips, setTrips] = useState([]);

  useEffect(() => { loadTrips(); }, []);

  const loadTrips = async () => {
    try {
      const { data } = await tripsApi.getLive();
      setTrips(data.liveTrips || []);
    } catch (e) { console.log(e); }
  };

  // Phase 5 — poll for newly assigned trips so TripAssignedScreen can pop
  // up without a manual refresh. No push notifications yet (a later
  // phase) — plain client-side polling. Gated to trip_driver types only,
  // matching the existing Active Trip card's own isShiftDriver gating
  // further down (shift_driver types used the removed 12hr-shift flow and
  // were never shown Trip-model assignments).
  const [acknowledgedTripIds, setAcknowledgedTripIds] = useState([]);

  useEffect(() => {
    if (!user?.driverType || user.driverType === 'shift_driver') return;

    const interval = setInterval(async () => {
      try {
        const { data } = await tripsApi.getLive();
        const liveTrips = data.liveTrips || [];
        setTrips(liveTrips);

        const isMine = (t) => t.driver?._id === user?._id || t.driver === user?._id;
        const hasActiveTrip = liveTrips.some(t => isMine(t) && t.status === 'en_route');
        const newlyAssigned = liveTrips.find(
          t => isMine(t) && t.status === 'dispatched' && !acknowledgedTripIds.includes(t._id)
        );

        if (newlyAssigned && !hasActiveTrip) {
          setAcknowledgedTripIds(prev => [...prev, newlyAssigned._id]);
          navigation.navigate('TripAssigned', { trip: newlyAssigned });
        }
      } catch (e) { console.log(e); }
    }, 9000);

    return () => clearInterval(interval);
  }, [user, acknowledgedTripIds]);

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { latitude: 0, longitude: 0 };
    const loc = await Location.getCurrentPositionAsync({});
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  };

  const logActivity = async (status, extras = {}) => {
    try {
      const location = await getLocation();
      await tripActivityApi.log({
        driverId: user._id,
        ambulanceId: user?.vehicleId || 'KA05AN9832',
        tripStatus: status,
        latitude: location.latitude,
        longitude: location.longitude,
        ...extras
      });
    } catch (e) { console.log(e); }
  };

  const handleTripStatus = async (tripId, status) => {
    try {
      if (status === 'CLIENT_DROPPED') {
        // Backend Trip.status has no 'CLIENT_DROPPED' value — dropping the
        // patient is what actually completes the trip (fare calc + bill +
        // income ledger + vehicle/driver release), so this maps to /complete
        // instead of /status. distanceKm/additionalCharges are optional —
        // the backend falls back to the trip's stored distance when omitted.
        const { data } = await tripsApi.complete(tripId, {});
        await logActivity(status, { tripId });
        loadTrips();
        // Phase 5 — show the completion summary instead of a plain Alert.
        // The complete() call above and its arguments are unchanged.
        navigation.navigate('TripSummary', { trip: data.trip, bill: data.bill });
        return;
      }
      await tripsApi.updateStatus(tripId, status === 'TRIP_STARTED' ? 'en_route' : status);
      await logActivity(status, { tripId });
      Alert.alert('✅ Success', `${status}!`);
      loadTrips();
    } catch (e) { Alert.alert('Error', 'Update failed'); }
  };

  const myTrip = trips.find(t => t.driver?._id === user?._id || t.driver === user?._id);
  const isShiftDriver = user?.driverType === 'shift_driver' || !user?.driverType;

  return (
    <View style={styles.container}>
      {/* ═══ Full-screen "map" background ═══
          react-native-maps is NOT a dependency of this project (checked
          package.json — confirmed absent, same finding as Phase 5's
          NavigateScreen). Per instructions this pass adds no new native
          dependency, so this is a static dark background with a couple
          of soft decorative glows standing in for a map, not an actual
          gradient library (RN has no built-in gradient primitive) or a
          real map. Flagging this clearly rather than guessing further. */}
      <View style={styles.mapBackground} pointerEvents="none">
        <View style={styles.mapGlowTop} />
        <View style={styles.mapGlowBottom} />
      </View>

      {/* Top bar — same greeting/logout action as before. The role line
          used to show dutyStatus ("Off Duty"/"On Duty"/"On Trip"); that
          state no longer exists now that the shift toggle is removed, so
          this just reads "Driver" — a required consequence of the
          removal below, not a separate restyling choice. */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.welcome}>Hello, {user?.name}!</Text>
          <Text style={styles.role}>Driver</Text>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.bellBtn} onPress={() => Alert.alert('Notifications', 'Coming soon')}>
            <Text style={styles.bellIcon}>🔔</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>0</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutTxt}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Booking Trip Button — identical text/action, restyled card */}
        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#3b82f6' }]} onPress={() => navigation.navigate('BookingTrip')}>
          <Text style={styles.bigBtnTxt}>🚑 Booking Trip</Text>
          <Text style={styles.bigBtnSub}>Patient pickup/drop trip ಶುರು ಮಾಡಿ ✅ OTA TEST</Text>
        </TouchableOpacity>

        {/* Active Trip — identical logic/buttons, restyled card */}
        {myTrip && !isShiftDriver && (
          <View style={styles.tripCard}>
            <Text style={styles.tripTitle}>🚑 Active Trip</Text>
            <Text style={styles.tripTxt}>Patient: {myTrip.patientName}</Text>
            <Text style={styles.tripTxt}>Hospital: {myTrip.dropHospital?.name || 'N/A'}</Text>
            <Text style={styles.tripTxt}>Status: {myTrip.status}</Text>
            <View style={styles.tripBtns}>
              {myTrip.status === 'dispatched' && (
                <TouchableOpacity style={[styles.tripBtn, { backgroundColor: '#10b981' }]} onPress={() => handleTripStatus(myTrip._id, 'TRIP_STARTED')}>
                  <Text style={styles.tripBtnTxt}>▶ Start Trip</Text>
                </TouchableOpacity>
              )}
              {myTrip.status === 'en_route' && (
                <TouchableOpacity style={[styles.tripBtn, { backgroundColor: '#f59e0b' }]} onPress={() => handleTripStatus(myTrip._id, 'CLIENT_DROPPED')}>
                  <Text style={styles.tripBtnTxt}>📍 Client Dropped</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom nav bar — Home is this screen; the rest are non-functional
          placeholder stubs per instructions ("Coming soon"), since only
          Booking-Trip/trip-related navigation exists today. */}
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

  // ── "Map" background — see comment at the usage site in the JSX above
  // for why this is a static dark backdrop rather than a real map/gradient.
  mapBackground: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0a0f1e', overflow: 'hidden' },
  mapGlowTop: { position: 'absolute', top: -120, left: -60, width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(16,185,129,0.08)' },
  mapGlowBottom: { position: 'absolute', bottom: -140, right: -80, width: 360, height: 360, borderRadius: 180, backgroundColor: 'rgba(59,130,246,0.07)' },

  // ── Top bar ──────────────────────────────────────────────────────────
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 4 },
  welcome: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  role: { color: '#10b981', fontSize: 13, marginTop: 2 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 18 },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: '#ef4444', padding: 10, borderRadius: 8 },
  logoutTxt: { color: '#fff', fontWeight: 'bold' },

  // ── Scrollable content over the map background ──────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },

  bigBtn: { padding: 24, borderRadius: 16, alignItems: 'center' },
  bigBtnTxt: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  bigBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  tripCard: { backgroundColor: 'rgba(17,24,39,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: 16, padding: 16, borderRadius: 12 },
  tripTitle: { color: '#10b981', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  tripTxt: { color: '#9ca3af', fontSize: 14, marginBottom: 4 },
  tripBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tripBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  tripBtnTxt: { color: '#fff', fontWeight: 'bold' },

  // ── Bottom nav bar ───────────────────────────────────────────────────
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#111827', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 10, paddingBottom: 22 },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navIcon: { fontSize: 20, opacity: 0.45 },
  navIconActive: { fontSize: 20 },
  navLabel: { color: '#6b7280', fontSize: 10, fontWeight: '600' },
  navLabelActive: { color: '#10b981', fontSize: 10, fontWeight: '700' },
});
