import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { ambulancesApi } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { getDeviceId } from '../../utils/device';

/**
 * Owner-side ambulance picker for "Drive an Ambulance" — a small
 * operator going on duty on their own fleet. Lists the owner's own
 * available ambulances (GET /ambulances?status=available, the same
 * owner-authenticated endpoint My Ambulances uses), then delegates the
 * actual duty-claim to AuthContext.startDutyAsOwner(), which mints a
 * driver session and swaps to it ONLY once start-duty has actually
 * succeeded — this screen never flips into a driver session on its own.
 */
export default function DriveAmbulanceScreen({ navigation }) {
  const { startDutyAsOwner } = useAuth();
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingId, setStartingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await ambulancesApi.getAll({ status: 'available' });
      setAmbulances(data?.ambulances || []);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not load ambulances.');
    }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Best-effort — start-duty treats lat/lng as optional, so a denied
  // permission or GPS failure here shouldn't block going on duty.
  const getBestEffortLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return {};
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch (err) {
      return {};
    }
  };

  const handlePick = async (ambulance) => {
    setStartingId(ambulance._id);
    try {
      const deviceId = await getDeviceId();
      if (!deviceId) {
        Alert.alert('Error', 'Could not identify this device. Please try again.');
        return;
      }
      const { lat, lng } = await getBestEffortLocation();
      await startDutyAsOwner(ambulance._id, deviceId, lat, lng);
      // Success — AuthContext already swapped the active session to the
      // driver identity; App.js's role-based routing takes it from here.
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not start duty. Please try again.');
      await load();
    } finally {
      setStartingId(null);
    }
  };

  function renderItem({ item }) {
    const isStarting = startingId === item._id;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handlePick(item)}
        disabled={!!startingId}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.regNumber}>{item.registrationNumber}</Text>
          <Text style={styles.typeLabel}>{item.serviceTypeLabel || item.serviceType}</Text>
        </View>
        {isStarting ? <ActivityIndicator color="#10b981" /> : <Text style={styles.pickTxt}>Select →</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Drive an Ambulance</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={ambulances}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
          ListEmptyComponent={
            <Text style={styles.emptyTxt}>No available ambulances right now. Pull down to refresh.</Text>
          }
        />
      )}
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
  backTxt: { color: '#9ca3af', fontSize: 14, width: 60 },
  title: { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111827', borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  regNumber: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  typeLabel: { color: '#9ca3af', fontSize: 12.5, marginTop: 2 },
  pickTxt: { color: '#10b981', fontSize: 13, fontWeight: 'bold' },

  emptyTxt: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 30 },
});
