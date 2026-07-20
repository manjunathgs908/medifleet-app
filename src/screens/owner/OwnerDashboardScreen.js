import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { assignmentsApi } from '../../api/client';

const REFRESH_INTERVAL_MS = 15000; // matches the CRM's existing Leaflet map polling cadence

const STATUS_META = {
  available  : { label: 'Available',   color: '#10b981' },
  on_trip    : { label: 'On Trip',      color: '#f59e0b' },
  off        : { label: 'Off',          color: '#6b7280' },
  maintenance: { label: 'Maintenance',  color: '#ef4444' },
};

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diffSec = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ${diffMin % 60}m ago`;
}

/**
 * Live overview — cards only, no map (that's Phase 6E, deferred; the CRM's
 * Leaflet fleet map covers live map viewing in the meantime). Polls the
 * same GET /assignments/fleet-status the "watch this trip" detail screen
 * also reads from, so there's one live-data source for the whole owner
 * section, not two.
 */
export default function OwnerDashboardScreen({ navigation }) {
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await assignmentsApi.getFleetStatus();
      setFleet(data?.fleet || []);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not load fleet status.');
    }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  function renderItem({ item }) {
    const { ambulance, activeTrip } = item;
    const meta = STATUS_META[ambulance.displayStatus] || STATUS_META.off;
    const canTap = !!activeTrip;
    const updatedAt = ambulance.assignedDriver?.location?.updatedAt;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => canTap && navigation.navigate('OwnerTripDetail', { ambulanceId: ambulance.id })}
        disabled={!canTap}
        activeOpacity={canTap ? 0.7 : 1}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.regNumber}>{ambulance.registrationNumber}</Text>
          <Text style={styles.typeLabel}>{ambulance.serviceTypeLabel || ambulance.serviceType}</Text>
          {ambulance.assignedDriver ? (
            <Text style={styles.driverTxt}>🧑‍✈️ {ambulance.assignedDriver.name}</Text>
          ) : (
            <Text style={styles.driverTxtMuted}>No driver on duty</Text>
          )}
          {updatedAt && <Text style={styles.updatedTxt}>📍 updated {timeAgo(updatedAt)}</Text>}
          {canTap && <Text style={styles.tapHint}>Tap to view trip →</Text>}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${meta.color}22`, borderColor: `${meta.color}55` }]}>
          <Text style={[styles.statusTxt, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Live Dashboard</Text>
        <View style={{ width: 50 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={fleet}
          keyExtractor={(item) => item.ambulance.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
          ListEmptyComponent={<Text style={styles.emptyTxt}>No ambulances yet.</Text>}
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
  backTxt: { color: '#9ca3af', fontSize: 14, width: 50 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  regNumber: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  typeLabel: { color: '#9ca3af', fontSize: 12.5, marginTop: 2 },
  driverTxt: { color: '#e5e7eb', fontSize: 12.5, marginTop: 6 },
  driverTxtMuted: { color: '#6b7280', fontSize: 12.5, marginTop: 6 },
  updatedTxt: { color: '#6b7280', fontSize: 11, marginTop: 3 },
  tapHint: { color: '#10b981', fontSize: 11, marginTop: 6, fontWeight: '600' },

  statusBadge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1 },
  statusTxt: { fontSize: 11, fontWeight: 'bold' },

  emptyTxt: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40 },
});
