import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { ownerDriverApi, assignmentsApi } from '../../api/client';

/**
 * Minimal Owner tool: list drivers, unbind a stuck device. Backed by
 * GET /api/driver-auth (added alongside this screen) and the pre-existing
 * PUT /api/driver-auth/:id/unbind-device — both protectOwner-gated, so this
 * only works with the Owner OTP login (LoginScreen's "Owner" tab), not the
 * old User-model phone+password owner login.
 */
export default function UnbindDeviceScreen() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      Alert.alert('Cannot Log Out', err?.response?.data?.message || 'Please try again.');
    }
  };
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unbindingId, setUnbindingId] = useState(null);
  const [forceEndingId, setForceEndingId] = useState(null);

  const loadDrivers = useCallback(async () => {
    try {
      const { data } = await ownerDriverApi.list();
      setDrivers(data?.drivers || []);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not load drivers.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadDrivers();
      setLoading(false);
    })();
  }, [loadDrivers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDrivers();
    setRefreshing(false);
  };

  function confirmUnbind(driver) {
    Alert.alert(
      'Unbind Device?',
      `${driver.name} (${driver.employeeId}) will be signed out of their current device and can log in from a new one.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unbind', style: 'destructive', onPress: () => handleUnbind(driver) },
      ]
    );
  }

  async function handleUnbind(driver) {
    setUnbindingId(driver._id);
    try {
      await ownerDriverApi.unbindDevice(driver._id);
      await loadDrivers();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not unbind device.');
    } finally {
      setUnbindingId(null);
    }
  }

  // Escape hatch for a driver stuck on duty with a dead app session — e.g.
  // the device was lost or the app reinstalled before they could tap "End
  // Duty". Unbind Device alone refuses in that case ("driver is on duty"),
  // and there's no way to reach that driver's own session anymore, so this
  // is the owner-side way to close it. Backend safely refuses if the
  // driver actually has a live trip, or isn't on duty at all.
  function confirmForceEndDuty(driver) {
    Alert.alert(
      'Force End Duty?',
      `Only do this if ${driver.name} (${driver.employeeId})'s device is lost or the app was reinstalled — this ends their duty and frees their ambulance without going through their own device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Force End Duty', style: 'destructive', onPress: () => handleForceEndDuty(driver) },
      ]
    );
  }

  async function handleForceEndDuty(driver) {
    setForceEndingId(driver._id);
    try {
      await assignmentsApi.forceEndDuty(driver._id);
      Alert.alert('Done', `${driver.name}'s duty has been ended.`);
      await loadDrivers();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not force-end duty.');
    } finally {
      setForceEndingId(null);
    }
  }

  function renderDriver({ item }) {
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>{item.employeeId}</Text>
          <Text style={styles.deviceId} numberOfLines={1}>
            {item.deviceId ? `Device: ${item.deviceId}` : 'Not bound'}
          </Text>
        </View>
        <View style={styles.actionsCol}>
          <TouchableOpacity
            style={[styles.unbindBtn, !item.deviceId && styles.unbindBtnDisabled]}
            onPress={() => confirmUnbind(item)}
            disabled={!item.deviceId || unbindingId === item._id}
          >
            {unbindingId === item._id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.unbindBtnTxt}>Unbind Device</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.forceEndBtn}
            onPress={() => confirmForceEndDuty(item)}
            disabled={forceEndingId === item._id}
          >
            {forceEndingId === item._id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.forceEndBtnTxt}>Force End Duty</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>Unbind Device</Text>
          <Text style={styles.subtitle}>{user?.name}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutTxt}>Logout</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(item) => item._id}
          renderItem={renderDriver}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
          ListEmptyComponent={<Text style={styles.emptyTxt}>No drivers found.</Text>}
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
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  subtitle: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  logoutBtn: { backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  logoutTxt: { color: '#fff', fontWeight: 'bold' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  name: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  meta: { color: '#9ca3af', fontSize: 12.5, marginTop: 2 },
  deviceId: { color: '#6b7280', fontSize: 11.5, marginTop: 4 },

  actionsCol: { gap: 8, alignItems: 'stretch' },
  unbindBtn: { backgroundColor: '#ef4444', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  unbindBtnDisabled: { backgroundColor: '#374151' },
  unbindBtnTxt: { color: '#fff', fontSize: 12.5, fontWeight: 'bold', textAlign: 'center' },
  forceEndBtn: { backgroundColor: '#7c2d12', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#f97316' },
  forceEndBtnTxt: { color: '#fed7aa', fontSize: 12.5, fontWeight: 'bold', textAlign: 'center' },

  emptyTxt: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40 },
});
