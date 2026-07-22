import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Image } from 'react-native';
import { useAuth } from '../../context/AuthContext';

const DOC_LABELS = { aadhaar: 'Aadhaar / ID', pan: 'PAN Card', addressProof: 'Business Address Proof', photo: 'Your Photo' };

const STATUS_STYLES = {
  pending  : { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', label: 'Pending' },
  submitted: { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6', label: 'Submitted' },
  approved : { bg: 'rgba(16,185,129,0.12)', text: '#10b981', label: 'Approved' },
  rejected : { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444', label: 'Rejected' },
};

/**
 * Owner Profile — reachable only once approved (OwnerHome itself is
 * gated on kycStatus, this is one tap away from it). View-only KYC
 * documents here (unlike the driver Profile's re-upload capability) —
 * re-upload stays OwnerOnboardingScreen's job, which an approved owner
 * never revisits. Logout moved here from OwnerHomeScreen's top bar.
 */
export default function OwnerProfileScreen({ navigation }) {
  const { user, logout, refreshUser } = useAuth();

  useEffect(() => { refreshUser(); }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      Alert.alert('Cannot Log Out', err?.response?.data?.message || 'Please try again.');
    }
  };

  const status = STATUS_STYLES[user?.kycStatus] || STATUS_STYLES.pending;
  const docs = user?.kycDocuments || {};

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.backTxt}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.meta}>{user?.phone}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={[styles.badgeTxt, { color: status.text }]}>{status.label}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>KYC Documents</Text>
      <View style={styles.docGrid}>
        {Object.entries(DOC_LABELS).map(([docType, label]) => (
          <View key={docType} style={styles.docSlot}>
            {docs[docType]?.url
              ? <Image source={{ uri: docs[docType].url }} style={styles.docThumb} />
              : <View style={[styles.docThumb, styles.docThumbMissing]} />
            }
            <Text style={styles.docLabel}>{label}</Text>
          </View>
        ))}
      </View>

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

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  name: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  meta: { color: '#9ca3af', fontSize: 13, marginTop: 4 },
  badge: { borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10 },
  badgeTxt: { fontSize: 12, fontWeight: 'bold' },

  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  docGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  docSlot: { width: '47%' },
  docThumb: { width: '100%', height: 110, borderRadius: 10, backgroundColor: '#1f2937' },
  docThumbMissing: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderStyle: 'dashed' },
  docLabel: { color: '#9ca3af', fontSize: 11.5, marginTop: 6, textAlign: 'center' },

  logoutBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 10,
  },
  logoutTxt: { color: '#ef4444', fontSize: 14, fontWeight: 'bold' },
});
