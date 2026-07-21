import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { ambulancesApi } from '../../api/client';
import AmbulancePhotosAndDocs from '../../components/AmbulancePhotosAndDocs';

/**
 * Opened by tapping an ambulance in MyAmbulancesScreen — previously
 * there was no way back into an existing ambulance at all once created,
 * so a photo/document skipped during Add Ambulance was stuck missing
 * forever. Reuses the exact same photo/document upload component and
 * endpoints AddAmbulanceScreen uses, just seeded from the fetched
 * ambulance instead of starting empty.
 */
export default function AmbulanceDetailScreen({ navigation, route }) {
  const { ambulanceId } = route?.params || {};
  const [ambulance, setAmbulance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await ambulancesApi.getById(ambulanceId);
      setAmbulance(data.ambulance);
      setYear(data.ambulance?.year ? String(data.ambulance.year) : '');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not load ambulance.');
    }
  }, [ambulanceId]);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const saveYear = async () => {
    try {
      await ambulancesApi.update(ambulanceId, { year: year ? Number(year) : undefined });
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not save year.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{ambulance?.registrationNumber || '...'}</Text>
        <View style={{ width: 50 }} />
      </View>

      {loading || !ambulance ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>{ambulance.serviceTypeLabel || ambulance.serviceType}</Text>

          <Text style={styles.label}>Year</Text>
          <TextInput
            style={styles.input}
            placeholder="2023"
            placeholderTextColor="#6b7280"
            keyboardType="number-pad"
            maxLength={4}
            value={year}
            onChangeText={(t) => setYear(t.replace(/[^0-9]/g, ''))}
            onBlur={saveYear}
          />

          <AmbulancePhotosAndDocs
            ambulanceId={ambulanceId}
            initialPhotos={ambulance.photos || []}
            initialDocuments={ambulance.documents || {}}
          />
        </ScrollView>
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
  title: { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  content: { padding: 20, paddingBottom: 60 },
  subtitle: { fontSize: 13, color: '#9ca3af', marginBottom: 20 },
  label: { color: '#9ca3af', fontSize: 12.5, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: '#1f2937', borderRadius: 10, padding: 14,
    color: '#fff', fontSize: 15, marginBottom: 14,
  },
});
