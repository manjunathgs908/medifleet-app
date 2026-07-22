import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { driverAuthApi } from '../../api/client';
import { pickImageBase64 } from '../../utils/pickImage';

const DOC_FIELDS = [
  { docType: 'dl',      label: 'Driving License', hasNumber: true,  numberPlaceholder: 'DL number' },
  { docType: 'aadhaar', label: 'Aadhaar / ID',     hasNumber: true,  numberPlaceholder: 'Aadhaar number' },
  { docType: 'photo',   label: 'Your Photo',       hasNumber: false, numberPlaceholder: null },
];

const STATUS_STYLES = {
  pending : { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', label: 'Pending' },
  approved: { bg: 'rgba(16,185,129,0.12)', text: '#10b981', label: 'Approved' },
  rejected: { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444', label: 'Rejected' },
};

/**
 * Ola/Uber-style Profile — reachable only once approved (DriverDashboard
 * itself is gated on approvalStatus, this is one tap away from it), so
 * unlike DriverOnboardingScreen there's no pending/rejected messaging
 * here — just profile info + always-available document re-upload +
 * Logout (moved here from DriverDashboard's top bar).
 */
export default function DriverProfileScreen({ navigation }) {
  const { user, logout, refreshUser } = useAuth();

  useEffect(() => { refreshUser(); }, []);

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
  }, [user?.driverDocuments]);

  function buildInitialDocs(u) {
    const d = u?.driverDocuments || {};
    return Object.fromEntries(DOC_FIELDS.map(({ docType }) => [
      docType,
      { number: d[docType]?.number || '', url: d[docType]?.url || null, uploading: false },
    ]));
  }

  const setDocField = (docType, patch) => {
    setDocs(d => ({ ...d, [docType]: { ...d[docType], ...patch } }));
  };

  const saveNumber = async (docType) => {
    const { number } = docs[docType];
    try {
      await driverAuthApi.uploadDocument(docType, { number: number || undefined });
    } catch (e) {
      // Non-fatal — the field just didn't persist this time.
    }
  };

  const handleUpload = async (docType) => {
    const base64 = await pickImageBase64();
    if (!base64) return;
    setDocField(docType, { uploading: true });
    try {
      const { number } = docs[docType];
      const { data } = await driverAuthApi.uploadDocument(docType, { base64, number: number || undefined });
      setDocField(docType, { uploading: false, url: data.driverDocuments?.[docType]?.url || null });
    } catch (e) {
      setDocField(docType, { uploading: false });
      Alert.alert('Error', e.response?.data?.message || 'Could not upload document.');
    }
  };

  const status = STATUS_STYLES[user?.approvalStatus] || STATUS_STYLES.pending;
  const ambulance = user?.assignedAmbulanceId;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.backTxt}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.meta}>{user?.phone} · {user?.employeeId}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={[styles.badgeTxt, { color: status.text }]}>{status.label}</Text>
        </View>
      </View>

      {ambulance && (
        <View style={styles.ambulanceCard}>
          <Text style={styles.ambulanceLabel}>Assigned Ambulance</Text>
          <Text style={styles.ambulanceValue}>🚑 {ambulance.registrationNumber} · {ambulance.status}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Documents</Text>
      {DOC_FIELDS.map(({ docType, label, hasNumber, numberPlaceholder }) => {
        const d = docs[docType];
        return (
          <View key={docType} style={styles.docCard}>
            <View style={styles.docHeader}>
              <Text style={styles.docLabel}>{label}</Text>
              {d.url ? <Text style={styles.docStatusOk}>Uploaded ✓</Text> : <Text style={styles.docStatusMissing}>Not uploaded</Text>}
            </View>

            {d.url && <Image source={{ uri: d.url }} style={styles.docThumb} />}

            {hasNumber && (
              <TextInput
                style={styles.input}
                placeholder={numberPlaceholder}
                placeholderTextColor="#6b7280"
                value={d.number}
                onChangeText={(t) => setDocField(docType, { number: t })}
                onBlur={() => saveNumber(docType)}
              />
            )}

            <TouchableOpacity style={styles.uploadBtn} onPress={() => handleUpload(docType)} disabled={d.uploading}>
              {d.uploading
                ? <ActivityIndicator color="#10b981" size="small" />
                : <Text style={styles.uploadBtnTxt}>{d.url ? 'Replace Photo' : '📷 Upload Photo'}</Text>
              }
            </TouchableOpacity>
          </View>
        );
      })}

      <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
        <Text style={styles.logoutTxt}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  content: { padding: 20, paddingTop: 54, paddingBottom: 60 },
  backTxt: { color: '#9ca3af', fontSize: 14, marginBottom: 18 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  name: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  meta: { color: '#9ca3af', fontSize: 13, marginTop: 4 },
  badge: { borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10 },
  badgeTxt: { fontSize: 12, fontWeight: 'bold' },

  ambulanceCard: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  ambulanceLabel: { color: '#6b7280', fontSize: 11.5, fontWeight: '600', marginBottom: 4 },
  ambulanceValue: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 12 },

  docCard: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  docLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  docStatusOk: { color: '#10b981', fontSize: 11.5, fontWeight: 'bold' },
  docStatusMissing: { color: '#6b7280', fontSize: 11.5 },
  docThumb: { width: '100%', height: 140, borderRadius: 10, backgroundColor: '#1f2937', marginBottom: 10 },
  input: {
    backgroundColor: '#1f2937', borderRadius: 10, padding: 12,
    color: '#fff', fontSize: 14, marginBottom: 10,
  },
  uploadBtn: {
    backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
  },
  uploadBtnTxt: { color: '#10b981', fontSize: 13, fontWeight: 'bold' },

  logoutBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 10,
  },
  logoutTxt: { color: '#ef4444', fontSize: 14, fontWeight: 'bold' },
});
