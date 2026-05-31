import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { tripsApi, attendanceApi } from '../../api/client';

export default function DriverDashboard() {
  const { user, logout } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clockedIn, setClockedIn] = useState(false);

  useEffect(() => { loadTrips(); }, []);

  const loadTrips = async () => {
    try {
      const { data } = await tripsApi.getLive();
      setTrips(data.liveTrips || []);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async () => {
    try {
      await attendanceApi.clockIn({ location: 'Current Location' });
      setClockedIn(true);
      Alert.alert('Success', 'Clocked In successfully!');
    } catch (e) {
      Alert.alert('Error', 'Clock In failed. Try again.');
    }
  };

  const handleClockOut = async () => {
    try {
      await attendanceApi.clockOut();
      setClockedIn(false);
      Alert.alert('Success', 'Clocked Out successfully!');
    } catch (e) {
      Alert.alert('Error', 'Clock Out failed. Try again.');
    }
  };

  const handleTripStatus = async (id, status) => {
    try {
      await tripsApi.updateStatus(id, status);
      Alert.alert('Success', `Trip ${status}!`);
      loadTrips();
    } catch (e) {
      Alert.alert('Error', 'Update failed. Try again.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Hello, {user?.name}!</Text>
          <Text style={styles.role}>Driver</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.attendanceCard}>
        <Text style={styles.cardTitle}>Attendance</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, clockedIn ? styles.btnDisabled : styles.btnGreen]}
            onPress={handleClockIn}
            disabled={clockedIn}
          >
            <Text style={styles.btnText}>Clock In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, !clockedIn ? styles.btnDisabled : styles.btnRed]}
            onPress={handleClockOut}
            disabled={!clockedIn}
          >
            <Text style={styles.btnText}>Clock Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Trips</Text>
        {loading
          ? <ActivityIndicator color="#10b981" size="large" />
          : trips.length === 0
            ? <Text style={styles.empty}>No active trips</Text>
            : trips.map(trip => (
              <View key={trip._id} style={styles.tripCard}>
                <Text style={styles.tripTitle}>Patient: {trip.patientName}</Text>
                <Text style={styles.tripText}>Pickup: {trip.pickupAddress}</Text>
                <Text style={styles.tripText}>Hospital: {trip.dropHospitalId?.name || 'N/A'}</Text>
                <Text style={styles.tripText}>Status: {trip.status}</Text>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnGreen]}
                    onPress={() => handleTripStatus(trip._id, 'in-progress')}
                  >
                    <Text style={styles.btnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnRed]}
                    onPress={() => handleTripStatus(trip._id, 'cancelled')}
                  >
                    <Text style={styles.btnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
        }
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  header: {
    backgroundColor: '#111827',
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  welcome: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  role: { color: '#10b981', fontSize: 14, marginTop: 2 },
  logoutBtn: { backgroundColor: '#ef4444', padding: 10, borderRadius: 8 },
  logoutText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  attendanceCard: {
    backgroundColor: '#111827',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  section: { margin: 16 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  tripCard: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  tripTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  tripText: { color: '#9ca3af', fontSize: 14, marginBottom: 4 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 40, fontSize: 16 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  btnGreen: { backgroundColor: '#10b981' },
  btnRed: { backgroundColor: '#ef4444' },
  btnDisabled: { backgroundColor: '#374151' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});