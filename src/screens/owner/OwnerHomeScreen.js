import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';

/**
 * Owner landing screen — replaces the old "UnbindDevice is the only owner
 * screen" setup now that the owner section has more than one tool. Full
 * live dashboard is a later phase; this is deliberately minimal.
 */
export default function OwnerHomeScreen({ navigation }) {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      Alert.alert('Cannot Log Out', err?.response?.data?.message || 'Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>MediFleet Owner</Text>
          <Text style={styles.subtitle}>{user?.name}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutTxt}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('DriveAmbulance')}>
          <Text style={styles.cardIcon}>🚑</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Drive an Ambulance</Text>
            <Text style={styles.cardDesc}>Go on duty yourself on one of your own ambulances</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('OwnerDashboard')}>
          <Text style={styles.cardIcon}>📊</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Live Dashboard</Text>
            <Text style={styles.cardDesc}>Who's on duty, on which ambulance, right now</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AddAmbulance')}>
          <Text style={styles.cardIcon}>➕</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Add Ambulance</Text>
            <Text style={styles.cardDesc}>Register a new vehicle, type, and documents</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('MyAmbulances')}>
          <Text style={styles.cardIcon}>🚑</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>My Ambulances</Text>
            <Text style={styles.cardDesc}>View your fleet, status, and documents</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('PendingDrivers')}>
          <Text style={styles.cardIcon}>🧑‍✈️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Pending Drivers</Text>
            <Text style={styles.cardDesc}>Review documents, approve or reject</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('UnbindDevice')}>
          <Text style={styles.cardIcon}>🔓</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Unbind Device</Text>
            <Text style={styles.cardDesc}>Sign a driver out of a stuck device</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  subtitle: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  logoutBtn: { backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  logoutTxt: { color: '#fff', fontWeight: 'bold' },

  body: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#111827', borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardIcon: { fontSize: 28 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cardDesc: { color: '#9ca3af', fontSize: 12.5, marginTop: 3 },
});
