import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, Alert, Image, TextInput,
} from 'react-native';
import { ownerDriverApi } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Matches the enum on User.shiftHours. A fixed posting length, not a
// schedule.
const SHIFT_HOURS = [8, 12, 24];

const DOC_LABELS = { dl: 'DL', aadhaar: 'Aadhaar', photo: 'Photo' };

const STATUS_STYLES = {
  pending : { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', text: '#f59e0b', label: 'Pending' },
  approved: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)', text: '#10b981', label: 'Approved' },
  rejected: { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.4)',  text: '#ef4444', label: 'Rejected' },
};

// Every driver linked to this owner (see authController.listDrivers'
// owner: req.user._id scoping) — was "Pending Drivers" (approvalStatus=
// 'pending' only); now shows all of them with a status badge, and
// approve/reject stay available only on the pending ones.
export default function MyDriversScreen({ navigation }) {
  // features.attendance is resolved server-side from the owner's own
  // isPlatformOwner flag. shiftHours exists only to gate the
  // auto-attendance write, and a partner's drivers never get attendance
  // rows, so a partner is shown none of this.
  const { features } = useAuth();

  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await ownerDriverApi.list();
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

  const setShiftHours = async (driver, hours) => {
    setBusyId(driver._id);
    try {
      // Tapping the active chip clears it. null is the explicit "not
      // configured" the backend $unsets — endDuty reads absent as
      // "skip attendance", and there is no other way back to that state.
      const next = driver.shiftHours === hours ? null : hours;
      await ownerDriverApi.setShiftHours(driver._id, next);
      await load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update shift hours.');
    } finally {
      setBusyId(null);
    }
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
    const isPending = item.approvalStatus === 'pending';
    const status = STATUS_STYLES[item.approvalStatus] || STATUS_STYLES.pending;

    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.phone} · {item.employeeId}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: status.bg, borderColor: status.border }]}>
            <Text style={[styles.badgeTxt, { color: status.text }]}>{status.label}</Text>
          </View>
        </View>

        {/* Shift hours — SaveLife fleets only.
            The warning is the point of this block, not the picker. A
            driver with no shiftHours works normally and accrues NO
            attendance, silently; the only existing trace is a console
            line on the server. Without something on screen, it surfaces
            at payroll, a month late. */}
        {features?.attendance && (
          <View style={styles.shiftBlock}>
            <View style={styles.shiftHeader}>
              <Text style={styles.shiftLabel}>Shift hours</Text>
              {!item.shiftHours && (
                <View style={styles.warnBadge}>
                  <Text style={styles.warnBadgeTxt}>NOT SET — NO ATTENDANCE</Text>
                </View>
              )}
            </View>

            <View style={styles.chipRow}>
              {SHIFT_HOURS.map((h) => {
                const active = item.shiftHours === h;
                return (
                  <TouchableOpacity
                    key={h}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setShiftHours(item, h)}
                    disabled={isBusy}
                  >
                    <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{h}h</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {!item.shiftHours && (
              <Text style={styles.warnHint}>
                Duty is still recorded, but no attendance is written and this driver will not
                appear in payroll.
              </Text>
            )}
          </View>
        )}

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

        {isPending && (isRejecting ? (
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
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Drivers</Text>
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
          ListEmptyComponent={<Text style={styles.emptyTxt}>No drivers yet. Add one from Owner Home.</Text>}
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  name: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  meta: { color: '#9ca3af', fontSize: 12.5, marginTop: 2 },
  badge: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1 },
  badgeTxt: { fontSize: 11, fontWeight: 'bold' },

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

  shiftBlock: {
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  shiftHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  shiftLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  warnBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.45)',
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
  },
  warnBadgeTxt: { color: '#f59e0b', fontSize: 9, fontWeight: 'bold', letterSpacing: 0.3 },
  warnHint: { color: '#f59e0b', fontSize: 11, lineHeight: 15, marginTop: 8, opacity: 0.85 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  chipActive: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.12)' },
  chipTxt: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  chipTxtActive: { color: '#10b981' },

  emptyTxt: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40 },
});
