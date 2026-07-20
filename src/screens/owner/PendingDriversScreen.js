import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, Alert, Image, TextInput,
} from 'react-native';
import { ownerDriverApi } from '../../api/client';

const DOC_LABELS = { dl: 'DL', aadhaar: 'Aadhaar', photo: 'Photo' };

export default function PendingDriversScreen({ navigation }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await ownerDriverApi.list({ approvalStatus: 'pending' });
      setDrivers(data?.drivers || []);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not load drivers.');
    }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleApprove = async (driver) => {
    setBusyId(driver._id);
    try {
      await ownerDriverApi.approve(driver._id);
      await load();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not approve driver.');
    } finally {
      setBusyId(null);
    }
  };

  const startReject = (driver) => {
    setRejectingId(driver._id);
    setReason('');
  };

  const confirmReject = async (driver) => {
    setBusyId(driver._id);
    try {
      await ownerDriverApi.reject(driver._id, reason.trim() || undefined);
      setRejectingId(null);
      await load();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not reject driver.');
    } finally {
      setBusyId(null);
    }
  };

  function renderItem({ item }) {
    const docs = item.driverDocuments || {};
    const isRejecting = rejectingId === item._id;
    const isBusy = busyId === item._id;

    return (
      <View style={styles.card}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>{item.phone}</Text>

        <View style={styles.docRow}>
          {Object.keys(DOC_LABELS).map((docType) => (
            <View key={docType} style={styles.docSlot}>
              {docs[docType]?.url
                ? <Image source={{ uri: docs[docType].url }} style={styles.docThumb} />
                : <View style={[styles.docThumb, styles.docThumbMissing]} />
              }
              <Text style={styles.docLabel}>{DOC_LABELS[docType]}</Text>
              {docs[docType]?.number ? <Text style={styles.docNumber}>{docs[docType].number}</Text> : null}
            </View>
          ))}
        </View>

        {isRejecting ? (
          <View style={{ marginTop: 10 }}>
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason for rejection"
              placeholderTextColor="#6b7280"
              value={reason}
              onChangeText={setReason}
              autoFocus
            />
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRejectingId(null)}>
                <Text style={styles.cancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => confirmReject(item)} disabled={isBusy}>
                {isBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.rejectBtnTxt}>Confirm Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(item)} disabled={isBusy}>
              {isBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.approveBtnTxt}>✓ Approve</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectOutlineBtn} onPress={() => startReject(item)} disabled={isBusy}>
              <Text style={styles.rejectOutlineBtnTxt}>✕ Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pending Drivers</Text>
        <View style={{ width: 50 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
          ListEmptyComponent={<Text style={styles.emptyTxt}>No drivers waiting for approval.</Text>}
        />
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
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  card: {
    backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  name: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  meta: { color: '#9ca3af', fontSize: 12.5, marginTop: 2, marginBottom: 12 },

  docRow: { flexDirection: 'row', gap: 10 },
  docSlot: { flex: 1, alignItems: 'center' },
  docThumb: { width: '100%', height: 64, borderRadius: 8, backgroundColor: '#1f2937' },
  docThumbMissing: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderStyle: 'dashed' },
  docLabel: { color: '#6b7280', fontSize: 10.5, marginTop: 4, fontWeight: '600' },
  docNumber: { color: '#9ca3af', fontSize: 9.5, marginTop: 1 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  approveBtn: { flex: 1, backgroundColor: '#10b981', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  approveBtnTxt: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  rejectOutlineBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 11, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.08)',
  },
  rejectOutlineBtnTxt: { color: '#ef4444', fontSize: 13, fontWeight: 'bold' },

  reasonInput: { backgroundColor: '#1f2937', borderRadius: 8, padding: 11, color: '#fff', fontSize: 13 },
  cancelBtn: { flex: 1, backgroundColor: '#1f2937', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  cancelBtnTxt: { color: '#9ca3af', fontSize: 13, fontWeight: 'bold' },
  rejectBtn: { flex: 1, backgroundColor: '#ef4444', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  rejectBtnTxt: { color: '#fff', fontSize: 13, fontWeight: 'bold' },

  emptyTxt: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40 },
});
