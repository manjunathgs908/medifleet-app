import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { ambulancesApi } from '../../api/client';
import { AMBULANCE_SERVICE_TYPES } from '../../constants/ambulanceServiceTypes';
import AmbulancePhotosAndDocs from '../../components/AmbulancePhotosAndDocs';

export default function AddAmbulanceScreen({ navigation }) {
  const [step, setStep] = useState('form'); // 'form' -> basic fields, then 'docs' once created
  const [ambulanceId, setAmbulanceId] = useState(null);
  const [regNumber, setRegNumber] = useState('');
  const [serviceType, setServiceType] = useState(null);
  const [year, setYear] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!regNumber.trim() || !serviceType) {
      Alert.alert('Missing info', 'Please enter a vehicle number and select a type.');
      return;
    }
    setCreating(true);
    try {
      const { data } = await ambulancesApi.create({
        registrationNumber: regNumber.trim(),
        serviceType,
        year: year ? Number(year) : undefined,
      });
      setAmbulanceId(data.ambulance._id);
      setStep('docs');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not create ambulance.');
    } finally {
      setCreating(false);
    }
  };

  if (step === 'form') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Add Ambulance</Text>
        <Text style={styles.subtitle}>Vehicle details — documents and photos come next.</Text>

        <Text style={styles.label}>Vehicle Number *</Text>
        <TextInput
          style={styles.input}
          placeholder="KA-01-AB-1234"
          placeholderTextColor="#6b7280"
          autoCapitalize="characters"
          value={regNumber}
          onChangeText={setRegNumber}
        />

        <Text style={styles.label}>Ambulance Type *</Text>
        {AMBULANCE_SERVICE_TYPES.map(t => (
          <TouchableOpacity
            key={t.serviceType}
            style={[styles.typeRow, serviceType === t.serviceType && styles.typeRowActive]}
            onPress={() => setServiceType(t.serviceType)}
          >
            <Text style={styles.typeRowTxt}>{t.label}</Text>
            {serviceType === t.serviceType && <Text style={styles.typeCheck}>✓</Text>}
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Year</Text>
        <TextInput
          style={styles.input}
          placeholder="2023"
          placeholderTextColor="#6b7280"
          keyboardType="number-pad"
          maxLength={4}
          value={year}
          onChangeText={(t) => setYear(t.replace(/[^0-9]/g, ''))}
        />

        <TouchableOpacity style={[styles.button, creating && { opacity: 0.6 }]} onPress={handleCreate} disabled={creating}>
          {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Ambulance →</Text>}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>✅ {regNumber}</Text>
      <Text style={styles.subtitle}>Add photos and documents (optional — can be done later too, from My Ambulances).</Text>

      <AmbulancePhotosAndDocs ambulanceId={ambulanceId} initialPhotos={[]} initialDocuments={{}} />

      <TouchableOpacity style={[styles.button, { marginTop: 22 }]} onPress={() => navigation.navigate('MyAmbulances')}>
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#9ca3af', marginBottom: 20, lineHeight: 18 },
  label: { color: '#9ca3af', fontSize: 12.5, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: '#1f2937', borderRadius: 10, padding: 14,
    color: '#fff', fontSize: 15, marginBottom: 14,
  },
  typeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#111827', borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  typeRowActive: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)' },
  typeRowTxt: { color: '#fff', fontSize: 14, flex: 1 },
  typeCheck: { color: '#10b981', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },

  button: { backgroundColor: '#10b981', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
