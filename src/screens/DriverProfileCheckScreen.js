import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/client';

/**
 * Last onboarding step before the Dashboard. Shows the real, logged-in
 * driver/ambulance record — not invented placeholder data. Ambulance Number
 * comes from assignedAmbulanceId (Ambulance model), the same field
 * /assignments/start-duty requires; that model has no `type` field (only
 * the legacy Vehicle model does), so Ambulance Type is intentionally not
 * shown here rather than guessed from an unrelated record.
 */
export default function DriverProfileCheckScreen({ onDone }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(user);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await authApi.me();
        if (mounted && data?.user) setProfile(data.user);
      } catch {
        // Fall back to whatever's already in AuthContext from login.
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const ambulanceNumber = profile?.assignedAmbulanceId?.registrationNumber || 'Not assigned yet';

  const fields = [
    { label: 'Driver Name', value: profile?.name || '—' },
    { label: 'Employee ID', value: profile?.employeeId || '—' },
    { label: 'Ambulance Number', value: ambulanceNumber },
    { label: 'Phone', value: profile?.phone || '—' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Confirm Your Details</Text>
        <Text style={styles.subtitle}>Please review your driver profile before going live.</Text>

        {loading ? (
          <ActivityIndicator color="#10b981" style={{ marginVertical: 24 }} />
        ) : (
          fields.map(f => (
            <View key={f.label} style={styles.row}>
              <Text style={styles.rowLabel}>{f.label}</Text>
              <Text style={styles.rowValue}>{f.value}</Text>
            </View>
          ))
        )}

        <TouchableOpacity style={styles.button} onPress={onDone} disabled={loading}>
          <Text style={styles.buttonText}>Continue →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0a0f1e',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 30, width: '100%', maxWidth: 400 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginBottom: 22 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1f2937', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  rowLabel: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  rowValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  button: { backgroundColor: '#10b981', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
