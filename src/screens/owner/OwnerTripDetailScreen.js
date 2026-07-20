import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { assignmentsApi } from '../../api/client';

const REFRESH_INTERVAL_MS = 10000; // matches the driver app's own GPS-ping cadence

/**
 * Text/detail view of one ambulance's active trip — no map (Phase 6E,
 * deferred). Reuses the same GET /assignments/fleet-status the overview
 * screen already polls, filtered down to one ambulance, rather than a
 * second endpoint — the trip summary it needs is already embedded there.
 */
export default function OwnerTripDetailScreen({ navigation, route }) {
  const { ambulanceId } = route?.params || {};
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const endedAlertShownRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const { data } = await assignmentsApi.getFleetStatus();
      const match = (data?.fleet || []).find(f => f.ambulance.id === ambulanceId);
      setEntry(match || null);
    } catch (err) {
      // Silent — next poll tick retries.
    }
  }, [ambulanceId]);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const trip = entry?.activeTrip;

  useEffect(() => {
    if (!loading && entry && !trip && !endedAlertShownRef.current) {
      endedAlertShownRef.current = true;
      Alert.alert('Trip Ended', 'This trip is no longer active.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [loading, entry, trip]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#10b981" style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trip Details</Text>
        <View style={{ width: 50 }} />
      </View>

      {trip ? (
        <>
          <View style={styles.card}>
            <View style={styles.tripHeader}>
              <Text style={styles.tripNumber}>{trip.tripNumber}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillTxt}>
                  {trip.status === 'en_route' ? '🚑 En Route' : '📋 Dispatched'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Patient</Text>
            <Text style={styles.value}>{trip.patientName}</Text>
            <Text style={styles.valueMuted}>📞 {trip.patientPhone}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Pickup</Text>
            <Text style={styles.value}>{trip.pickup?.address || '—'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Drop</Text>
            <Text style={styles.value}>{trip.dropHospital?.name || trip.dropAddress || '—'}</Text>
          </View>

          <View style={styles.rowCards}>
            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.label}>Emergency</Text>
              <Text style={styles.value}>{trip.emergencyType || '—'}</Text>
            </View>
            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.label}>Distance</Text>
              <Text style={styles.value}>{trip.distanceKm ? `${trip.distanceKm} km` : '—'}</Text>
            </View>
          </View>

          {entry?.ambulance?.assignedDriver && (
            <View style={styles.card}>
              <Text style={styles.label}>Driver</Text>
              <Text style={styles.value}>{entry.ambulance.assignedDriver.name}</Text>
              <Text style={styles.valueMuted}>📞 {entry.ambulance.assignedDriver.phone}</Text>
            </View>
          )}
        </>
      ) : (
        <Text style={styles.emptyTxt}>No active trip on this ambulance right now.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  content: { paddingBottom: 60 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backTxt: { color: '#9ca3af', fontSize: 14, width: 50 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  card: {
    backgroundColor: '#111827', borderRadius: 14, padding: 16, margin: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rowCards: { flexDirection: 'row' },
  halfCard: { flex: 1 },

  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripNumber: { color: '#9ca3af', fontSize: 12.5, fontFamily: 'monospace' },
  statusPill: { backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  statusPillTxt: { color: '#f59e0b', fontSize: 12.5, fontWeight: 'bold' },

  label: { color: '#6b7280', fontSize: 11.5, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { color: '#fff', fontSize: 15, fontWeight: '600' },
  valueMuted: { color: '#9ca3af', fontSize: 13, marginTop: 4 },

  emptyTxt: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 30 },
});
