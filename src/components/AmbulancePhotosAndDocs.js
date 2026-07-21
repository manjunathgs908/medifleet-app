import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Image, Alert } from 'react-native';
import { ambulancesApi } from '../api/client';
import { pickImageBase64 } from '../utils/pickImage';
import { AMBULANCE_DOC_TYPES } from '../constants/ambulanceServiceTypes';

function buildDocState(documents) {
  return Object.fromEntries(AMBULANCE_DOC_TYPES.map(({ docType }) => [
    docType,
    {
      number    : documents?.[docType]?.number || '',
      expiryDate: documents?.[docType]?.expiryDate ? String(documents[docType].expiryDate).slice(0, 10) : '',
      url       : documents?.[docType]?.url || null,
      uploading : false,
    },
  ]));
}

/**
 * Photo grid + the 5 compliance-document cards (RC/Insurance/Fitness/
 * Permit/PUC) — shared by AddAmbulanceScreen (right after creating a new
 * ambulance) and AmbulanceDetailScreen (editing an existing one later).
 * Same upload endpoints either way (POST /:id/photos, PUT /:id/document),
 * just seeded with different initial state.
 */
export default function AmbulancePhotosAndDocs({ ambulanceId, initialPhotos, initialDocuments }) {
  const [photos, setPhotos] = useState(initialPhotos || []);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [docs, setDocs] = useState(buildDocState(initialDocuments));

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

  return (
    <>
      <Text style={styles.label}>Photos</Text>
      <View style={styles.photoRow}>
        {photos.map((p, i) => (
          <Image key={p.publicId || i} source={{ uri: p.url }} style={styles.photoThumb} />
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

            {d.url && <Image source={{ uri: d.url }} style={styles.docThumb} />}

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
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: '#9ca3af', fontSize: 12.5, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: '#1f2937', borderRadius: 10, padding: 14,
    color: '#fff', fontSize: 15, marginBottom: 14,
  },

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
  docThumb: { width: '100%', height: 130, borderRadius: 10, backgroundColor: '#1f2937', marginBottom: 10 },
  docRow: { flexDirection: 'row', gap: 10 },
  docInput: { flex: 1, marginBottom: 10, paddingVertical: 11, fontSize: 13 },
  docUploadBtn: {
    backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
  },
  docUploadTxt: { color: '#10b981', fontSize: 13, fontWeight: 'bold' },
});
