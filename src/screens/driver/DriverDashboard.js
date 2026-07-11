import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';

/**
 * Driver home screen — map/live-tracking/booking-status-timeline workflow
 * removed. Deleted entirely: the full-screen map background, driver
 * location fetching, the trip-assignment polling effect (and the
 * TripAssigned/Navigate/TripSummary screens it drove), the Active Trip
 * card, and handleTripStatus (Start Trip/Client Dropped + everything in
 * between). Not replaced with anything new — this is intentionally a
 * clean shell (top bar + Booking Trip entry point + bottom nav) ready
 * for a new workflow to be built later.
 */
export default function DriverDashboard({ navigation }) {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
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
        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#3b82f6' }]} onPress={() => navigation.navigate('BookingTrip')}>
          <Text style={styles.bigBtnTxt}>🚑 Booking Trip</Text>
          <Text style={styles.bigBtnSub}>Patient pickup/drop trip ಶುರು ಮಾಡಿ ✅ OTA TEST</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom nav bar — Home is this screen; the rest are non-functional
          placeholder stubs ("Coming soon"). */}
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

  // ── Scrollable content ──────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },

  bigBtn: { padding: 24, borderRadius: 16, alignItems: 'center' },
  bigBtnTxt: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  bigBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },

  // ── Bottom nav bar ───────────────────────────────────────────────────
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#111827', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 10, paddingBottom: 22 },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navIcon: { fontSize: 20, opacity: 0.45 },
  navIconActive: { fontSize: 20 },
  navLabel: { color: '#6b7280', fontSize: 10, fontWeight: '600' },
  navLabelActive: { color: '#10b981', fontSize: 10, fontWeight: '700' },
});
