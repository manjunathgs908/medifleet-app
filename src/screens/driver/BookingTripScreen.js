import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * Booking Trip screen — workflow removed.
 * The entire previous stage/timeline workflow (start/reached-hospital/
 * patient-picked/start-patient-trip/client-dropped/return-started/
 * close-duty, cancel-request, past trips, notes modal, and all backing
 * state/handlers/API calls) has been deleted per instructions. This is
 * intentionally a blank shell — App Bar only. A new Booking Trip flow
 * will be built here in a later pass.
 */
export default function BookingTripScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🚑 Booking Trip</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  header: { backgroundColor: '#111827', padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { padding: 8 },
  backTxt: { color: '#10b981', fontSize: 16 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});
