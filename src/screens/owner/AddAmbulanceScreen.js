import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Image,
} from 'react-native';
import { ambulancesApi } from '../../api/client';
import { pickImageBase64 } from '../../utils/pickImage';
import { AMBULANCE_SERVICE_TYPES, AMBULANCE_DOC_TYPES } from '../../constants/ambulanceServiceTypes';

const EMPTY_DOC = { number: '', expiryDate: '', url: null, uploading: false };

export default function AddAmbulanceScreen({ navigation }) {
  const [step, setStep] = useState('form'); // 'form' -> basic fields, then 'docs' once created
  const [ambulanceId, setAmbulanceId] = useState(null);
  const [regNumber, setRegNumber] = useState('');
  const [serviceType, setServiceType] = useState(null);
  const [year, setYear] = useState('');
  const [creating, setCreating] = useState(false);

  const [photos, setPhotos] = useState([]);
  const [addingPhoto, setAddingPhoto] = useState(false);

  const [docs, setDocs] = useState(
    Object.fromEntries(AMBULANCE_DOC_TYPES.map(d => [d.docType, { ...EMPTY_DOC }]))
  );

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

  const handleAddPhoto = async () => {
    const base64 = await pickImageBase64();
    if (!base64) return;
    setAddingPhoto(true);
    try {
      const { data } = await ambulancesApi.addPhoto(ambulanceId, base64);
      setPhotos(data.photos || []);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not upload photo.');
    } finally {
      setAddingPhoto(false);
    }
  };

  const setDocField = (docType, patch) => {
    setDocs(d => ({ ...d, [docType]: { ...d[docType], ...patch } }));
  };

  const saveDocFields = async (docType) => {
    const { number, expiryDate } = docs[docType];
    try {
      await ambulancesApi.uploadDocument(ambulanceId, docType, {
        number: number || undefined,
        expiryDate: expiryDate || undefined,
      });
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not save document details.');
    }
  };

  const handleDocPhoto = async (docType) => {
    const base64 = await pickImageBase64();
    if (!base64) return;
    setDocField(docType, { uploading: true });
    try {
      const { number, expiryDate } = docs[docType];
      const { data } = await ambulancesApi.uploadDocument(ambulanceId, docType, {
        base64,
        number: number || undefined,
        expiryDate: expiryDate || undefined,
      });
      setDocField(docType, { uploading: false, url: data.documents?.[docType]?.url || null });
    } catch (e) {
      setDocField(docType, { uploading: false });
      Alert.alert('Error', e.response?.data?.message || 'Could not upload document.');
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
      <Text style={styles.subtitle}>Add photos and documents (optional — can be done later too).</Text>

      <Text style={styles.label}>Photos</Text>
      <View style={styles.photoRow}>
        {photos.map((p, i) => (
          <Image key={i} source={{ uri: p.url }} style={styles.photoThumb} />
        ))}
        <TouchableOpacity style={styles.addPhotoBtn} onPress={handleAddPhoto} disabled={addingPhoto}>
          {addingPhoto ? <ActivityIndicator color="#10b981" /> : <Text style={styles.addPhotoTxt}>+ Add</Text>}
        </TouchableOpacity>
      </View>

      <Text style={[styles.label, { marginTop: 20 }]}>Documents</Text>
      {AMBULANCE_DOC_TYPES.map(({ docType, label }) => {
        const d = docs[docType];
        return (
          <View key={docType} style={styles.docCard}>
            <View style={styles.docHeader}>
              <Text style={styles.docLabel}>{label}</Text>
              {d.url ? <Text style={styles.docStatusOk}>Uploaded ✓</Text> : <Text style={styles.docStatusMissing}>Not uploaded</Text>}
            </View>
            <View style={styles.docRow}>
              <TextInput
                style={[styles.input, styles.docInput]}
                placeholder="Document number (optional)"
                placeholderTextColor="#6b7280"
                value={d.number}
                onChangeText={(t) => setDocField(docType, { number: t })}
                onBlur={() => saveDocFields(docType)}
              />
              <TextInput
                style={[styles.input, styles.docInput]}
                placeholder="Expiry (YYYY-MM-DD)"
                placeholderTextColor="#6b7280"
                value={d.expiryDate}
                onChangeText={(t) => setDocField(docType, { expiryDate: t })}
                onBlur={() => saveDocFields(docType)}
              />
            </View>
            <TouchableOpacity style={styles.docUploadBtn} onPress={() => handleDocPhoto(docType)} disabled={d.uploading}>
              {d.uploading
                ? <ActivityIndicator color="#10b981" size="small" />
                : <Text style={styles.docUploadTxt}>{d.url ? 'Replace Photo' : '📷 Upload Photo'}</Text>
              }
            </TouchableOpacity>
          </View>
        );
      })}

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

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  photoThumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#1f2937' },
  addPhotoBtn: {
    width: 72, height: 72, borderRadius: 10, backgroundColor: '#111827',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  addPhotoTxt: { color: '#10b981', fontSize: 12, fontWeight: 'bold' },

  docCard: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  docLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  docStatusOk: { color: '#10b981', fontSize: 11.5, fontWeight: 'bold' },
  docStatusMissing: { color: '#6b7280', fontSize: 11.5 },
  docRow: { flexDirection: 'row', gap: 10 },
  docInput: { flex: 1, marginBottom: 10, paddingVertical: 11, fontSize: 13 },
  docUploadBtn: {
    backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
  },
  docUploadTxt: { color: '#10b981', fontSize: 13, fontWeight: 'bold' },
});
