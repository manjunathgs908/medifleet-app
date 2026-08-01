import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

// Receives the full trip document straight from TripHistoryScreen's list
// via navigation params — GET /api/trips already returns full documents,
// not summaries, so there's nothing to fetch here.
export default function TripDetailScreen({ navigation, route }) {
  const { trip } = route.params || {};

  const fmt = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trip Details</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.card}>
        <View style={styles.tripHeader}>
          <Text style={styles.tripNumber}>{trip?.tripNumber}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillTxt}>✓ Completed</Text>
          </View>
        </View>
        <Text style={styles.valueMuted}>{fmt(trip?.completedAt)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Patient</Text>
        <Text style={styles.value}>{trip?.patientName || 'N/A'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Pickup</Text>
        <Text style={styles.value}>{trip?.pickup?.address || 'N/A'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Drop</Text>
        <Text style={styles.value}>{trip?.dropHospital?.name || trip?.dropAddress || 'N/A'}</Text>
      </View>

      <View style={styles.rowCards}>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.label}>Distance</Text>
          <Text style={styles.value}>{trip?.distanceKm != null ? `${trip.distanceKm} km` : '—'}</Text>
        </View>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.label}>Emergency</Text>
          <Text style={styles.value}>{trip?.emergencyType || '—'}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Fare Breakdown</Text>
        <View style={styles.fareRow}>
          <Text style={styles.fareLabel}>Base Fare</Text>
          <Text style={styles.fareValue}>₹{(trip?.baseFare || 0).toLocaleString('en-IN')}</Text>
        </View>
        {trip?.additionalCharges > 0 && (
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Additional Charges</Text>
            <Text style={styles.fareValue}>₹{trip.additionalCharges.toLocaleString('en-IN')}</Text>
          </View>
        )}
        {trip?.waitCharge > 0 && (
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Wait Charge</Text>
            <Text style={styles.fareValue}>₹{trip.waitCharge.toLocaleString('en-IN')}</Text>
          </View>
        )}
        {trip?.gstAmount > 0 && (
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>GST</Text>
            <Text style={styles.fareValue}>₹{trip.gstAmount.toLocaleString('en-IN')}</Text>
          </View>
        )}
        <View style={[styles.fareRow, styles.fareTotalRow]}>
          <Text style={styles.fareTotalLabel}>Total</Text>
          <Text style={styles.fareTotalValue}>₹{(trip?.grandTotal || 0).toLocaleString('en-IN')}</Text>
        </View>
      </View>

      {trip?.rating != null && (
        <View style={styles.card}>
          <Text style={styles.label}>Customer Rating</Text>
          <Text style={styles.value}>{'⭐'.repeat(trip.rating)} ({trip.rating}/5)</Text>
          {!!trip.feedback && <Text style={styles.valueMuted}>{trip.feedback}</Text>}
        </View>
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
  statusPill: { backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  statusPillTxt: { color: '#10b981', fontSize: 12.5, fontWeight: 'bold' },

  label: { color: '#6b7280', fontSize: 11.5, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { color: '#fff', fontSize: 15, fontWeight: '600' },
  valueMuted: { color: '#9ca3af', fontSize: 13, marginTop: 4 },

  fareRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  fareLabel: { color: '#9ca3af', fontSize: 13.5 },
  fareValue: { color: '#fff', fontSize: 13.5, fontFamily: 'monospace' },
  fareTotalRow: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  fareTotalLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  fareTotalValue: { color: '#10b981', fontSize: 17, fontWeight: '800', fontFamily: 'monospace' },
});
