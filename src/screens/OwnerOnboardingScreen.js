import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { ownerAuthApi } from '../api/client';
import { pickImageBase64 } from '../utils/pickImage';

const REFRESH_INTERVAL_MS = 8000;

const DOC_FIELDS = [
  { docType: 'aadhaar',      label: 'Aadhaar / ID' },
  { docType: 'pan',          label: 'PAN Card' },
  { docType: 'addressProof', label: 'Business Address Proof' },
  { docType: 'photo',        label: 'Your Photo' },
];

/**
 * Sits in the owner branch of App.js, mirroring DriverOnboardingScreen's
 * role in the driver branch exactly — an owner with kycStatus !==
 * 'approved' is stuck here until the CRM admin approves them. No onDone
 * escape hatch: the only way out is the server-side kycStatus flip,
 * picked up by the periodic refreshUser() poll below, or Logout.
 */
export default function OwnerOnboardingScreen() {
  const { user, logout, refreshUser } = useAuth();
  const intervalRef = useRef(null);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      Alert.alert('Cannot Log Out', err?.response?.data?.message || 'Please try again.');
    }
  };

  const [docs, setDocs] = useState(() => buildInitialDocs(user));

  useEffect(() => {
    setDocs(buildInitialDocs(user));
  }, [user?.kycDocuments]);

  useEffect(() => {
    intervalRef.current = setInterval(refreshUser, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, []);

  function buildInitialDocs(u) {
    const d = u?.kycDocuments || {};
    return Object.fromEntries(DOC_FIELDS.map(({ docType }) => [
      docType,
      { url: d[docType]?.url || null, uploading: false },
    ]));
  }

  const setDocField = (docType, patch) => {
    setDocs(d => ({ ...d, [docType]: { ...d[docType], ...patch } }));
  };

  const handleUpload = async (docType) => {
    const base64 = await pickImageBase64();
    if (!base64) return;
    setDocField(docType, { uploading: true });
    try {
      const { data } = await ownerAuthApi.uploadKycDocument(docType, base64);
      setDocField(docType, { uploading: false, url: data.kycDocuments?.[docType]?.url || null });
      await refreshUser(); // picks up the rejected -> submitted auto-flip immediately
    } catch (e) {
      setDocField(docType, { uploading: false });
      Alert.alert('Error', e.response?.data?.message || 'Could not upload document.');
    }
  };

  const allUploaded = DOC_FIELDS.every(({ docType }) => docs[docType]?.url);
  const isRejected = user?.kycStatus === 'rejected';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Owner Verification</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutTxt}>Logout</Text>
        </TouchableOpacity>
      </View>

      {isRejected && (
        <View style={[styles.noticeBox, styles.noticeBoxDanger]}>
          <Text style={styles.noticeTitle}>❌ Documents Rejected</Text>
          <Text style={styles.noticeText}>
            {user?.kycRejectionReason || 'Please check your documents and re-upload.'}
          </Text>
        </View>
      )}

      {!isRejected && allUploaded && (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>⏳ Waiting for Approval</Text>
          <Text style={styles.noticeText}>
            Your documents are submitted. You'll be able to add ambulances and drivers as soon as the platform admin approves your account.
          </Text>
        </View>
      )}

      {!isRejected && !allUploaded && (
        <Text style={styles.subtitle}>
          Upload the following documents to complete your registration. You can't add ambulances or drivers until the platform admin approves your account.
        </Text>
      )}

      {DOC_FIELDS.map(({ docType, label }) => {
        const d = docs[docType];
        return (
          <View key={docType} style={styles.docCard}>
            <View style={styles.docHeader}>
              <Text style={styles.docLabel}>{label}</Text>
              {d.url ? <Text style={styles.docStatusOk}>Uploaded ✓</Text> : <Text style={styles.docStatusMissing}>Not uploaded</Text>}
            </View>

            {d.url && <Image source={{ uri: d.url }} style={styles.docThumb} />}

            <TouchableOpacity style={styles.uploadBtn} onPress={() => handleUpload(docType)} disabled={d.uploading}>
              {d.uploading
                ? <ActivityIndicator color="#10b981" size="small" />
                : <Text style={styles.uploadBtnTxt}>{d.url ? 'Replace Photo' : '📷 Upload Photo'}</Text>
              }
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 60 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  logoutBtn: { backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  logoutTxt: { color: '#fff', fontWeight: 'bold', fontSize: 12.5 },
  subtitle: { fontSize: 13, color: '#9ca3af', marginBottom: 20, lineHeight: 18 },

  noticeBox: {
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 12, padding: 16, marginBottom: 20,
  },
  noticeBoxDanger: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.35)' },
  noticeTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 6 },
  noticeText: { color: '#9ca3af', fontSize: 13, lineHeight: 19 },

  docCard: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  docLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  docStatusOk: { color: '#10b981', fontSize: 11.5, fontWeight: 'bold' },
  docStatusMissing: { color: '#6b7280', fontSize: 11.5 },
  docThumb: { width: '100%', height: 140, borderRadius: 10, backgroundColor: '#1f2937', marginBottom: 10 },
  uploadBtn: {
    backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
  },
  uploadBtnTxt: { color: '#10b981', fontSize: 13, fontWeight: 'bold' },
});
