import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, TextInput, Modal
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { tripsApi } from '../../api/client';

export default function TelecallerDashboard() {
  const { user, logout } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({
    patientName: '',
    patientPhone: '',
    pickupAddress: '',
    emergencyType: 'general',
  });

  useEffect(() => { loadTrips(); }, []);

  const loadTrips = async () => {
    try {
      const { data } = await tripsApi.getAll({ status: 'all' });
      setTrips(data.trips || []);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTrip = async () => {
    if (!form.patientName || !form.patientPhone || !form.pickupAddress) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    try {
      await tripsApi.create(form);
      Alert.alert('Success', 'Trip created successfully!');
      setModalVisible(false);
      setForm({ patientName: '', patientPhone: '', pickupAddress: '', emergencyType: 'general' });
      loadTrips();
    } catch (e) {
      Alert.alert('Error', 'Failed to create trip');
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'completed': return '#10b981';
      case 'in-progress': return '#f59e0b';
      case 'cancelled': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Hello, {user?.name}!</Text>
          <Text style={styles.role}>Telecaller</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.newTripBtn}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.newTripText}>+ New Booking</Text>
      </TouchableOpacity>

      <ScrollView style={styles.scroll}>
        <Text style={styles.sectionTitle}>Recent Trips</Text>
        {loading
          ? <ActivityIndicator color="#10b981" size="large" />
          : trips.length === 0
            ? <Text style={styles.empty}>No trips found</Text>
            : trips.map(trip => (
              <View key={trip._id} style={styles.tripCard}>
                <View style={styles.tripHeader}>
                  <Text style={styles.tripName}>{trip.patientName}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(trip.status) }]}>
                    <Text style={styles.statusText}>{trip.status}</Text>
                  </View>
                </View>
                <Text style={styles.tripText}>Phone: {trip.patientPhone}</Text>
                <Text style={styles.tripText}>Pickup: {trip.pickupAddress}</Text>
                <Text style={styles.tripText}>Type: {trip.emergencyType}</Text>
              </View>
            ))
        }
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Booking</Text>

            <TextInput
              style={styles.input}
              placeholder="Patient Name"
              placeholderTextColor="#888"
              value={form.patientName}
              onChangeText={v => setForm({...form, patientName: v})}
            />
            <TextInput
              style={styles.input}
              placeholder="Patient Phone"
              placeholderTextColor="#888"
              keyboardType="phone-pad"
              value={form.patientPhone}
              onChangeText={v => setForm({...form, patientPhone: v})}
            />
            <TextInput
              style={styles.input}
              placeholder="Pickup Address"
              placeholderTextColor="#888"
              value={form.pickupAddress}
              onChangeText={v => setForm({...form, pickupAddress: v})}
            />

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGreen]}
                onPress={handleCreateTrip}
              >
                <Text style={styles.btnText}>Create Trip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnRed]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  role: { color: '#3b82f6', fontSize: 14, marginTop: 2 },
  logoutBtn: { backgroundColor: '#ef4444', padding: 10, borderRadius: 8 },
  logoutText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  newTripBtn: {
    backgroundColor: '#10b981',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  newTripText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  scroll: { flex: 1, padding: 16 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  tripCard: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  tripName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  tripText: { color: '#9ca3af', fontSize: 14, marginBottom: 4 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 40, fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  input: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center' },
  btnGreen: { backgroundColor: '#10b981' },
  btnRed: { backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});