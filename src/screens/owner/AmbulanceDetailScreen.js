import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { ambulancesApi, ownerDriverApi } from '../../api/client';
import AmbulancePhotosAndDocs from '../../components/AmbulancePhotosAndDocs';

/**
 * Opened by tapping an ambulance in MyAmbulancesScreen — previously
 * there was no way back into an existing ambulance at all once created,
 * so a photo/document skipped during Add Ambulance was stuck missing
 * forever. Reuses the exact same photo/document upload component and
 * endpoints AddAmbulanceScreen uses, just seeded from the fetched
 * ambulance instead of starting empty.
 *
 * Phase 2 adds the assigned-driver section. Note it shows TWO driver
 * lines, deliberately:
 *   "Assigned driver" = defaultDriver, the owner's roster decision.
 *   "On duty now"     = assignedDriver, written by the duty system.
 * Collapsing those into one field is the exact conflation this phase
 * exists to undo, and the gap between them is the useful signal — a
 * locked ambulance with nobody on duty means its driver has not come in.
 */

// Matches Ambulance.driverLock's enum. 'preferred' is the default because
// it is the only setting that cannot strand an ambulance.
const LOCK_OPTIONS = [
  { value: 'preferred', label: 'Preferred', hint: 'Shown to them first. Anyone can still drive it.' },
  { value: 'locked',    label: 'Locked',    hint: 'Only this driver can start duty on it.' },
  { value: 'open',      label: 'Open',      hint: 'Just a label. No effect on start duty.' },
];

export default function AmbulanceDetailScreen({ navigation, route }) {
  const { ambulanceId } = route?.params || {};
  const [ambulance, setAmbulance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState('');

  const [drivers, setDrivers] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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

  // Approved drivers only. The backend refuses the rest with
  // DRIVER_NOT_APPROVED, so listing them here would be offering a
  // guaranteed error.
  const loadDrivers = useCallback(async () => {
    try {
      const { data } = await ownerDriverApi.list({ approvalStatus: 'approved' });
      setDrivers(data.drivers || []);
    } catch {
      setDrivers([]);
    }
  }, []);

  const openPicker = async () => { await loadDrivers(); setPickerOpen(true); };

  const assign = async (driverId) => {
    setBusy(true);
    try {
      // Changing the driver on an ambulance that already has one keeps
      // whatever lock the owner chose. A fresh assignment starts at
      // 'preferred' rather than inheriting the 'open' that Remove leaves
      // behind — an owner rostering someone is making a roster decision,
      // and 'preferred' is the safe expression of it.
      const lock = ambulance?.defaultDriver ? (ambulance.driverLock || 'preferred') : 'preferred';
      await ambulancesApi.setDefaultDriver(ambulanceId, driverId, lock);
      setPickerOpen(false);
      await load();
    } catch (e) {
      // DRIVER_ALREADY_ASSIGNED names the other ambulance — surfaced
      // verbatim, because the fix is to remove them from that one.
      Alert.alert('Could not assign', e.response?.data?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const setLock = async (value) => {
    if (!ambulance?.defaultDriver) return;
    setBusy(true);
    try {
      await ambulancesApi.setDefaultDriver(ambulanceId, ambulance.defaultDriver._id, value);
      await load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not change the lock.');
    } finally {
      setBusy(false);
    }
  };

  const removeDriver = () => {
    Alert.alert(
      'Remove assigned driver?',
      `${ambulance?.defaultDriver?.name || 'This driver'} will no longer be assigned to ${ambulance?.registrationNumber}. The lock is removed too, so any driver can take it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await ambulancesApi.clearDefaultDriver(ambulanceId);
              await load();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || 'Could not remove the driver.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
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

          {/* ── Assigned driver (see the note at the top of this file) ── */}
          <View style={styles.section}>
            <Text style={styles.label}>Assigned driver</Text>

            {ambulance.defaultDriver ? (
              <>
                <View style={styles.driverRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverName}>{ambulance.defaultDriver.name}</Text>
                    <Text style={styles.driverPhone}>{ambulance.defaultDriver.phone}</Text>
                  </View>
                  <TouchableOpacity onPress={openPicker} disabled={busy} style={styles.smallBtn}>
                    <Text style={styles.smallBtnTxt}>Change</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={removeDriver} disabled={busy} style={[styles.smallBtn, styles.smallBtnDanger]}>
                    <Text style={[styles.smallBtnTxt, styles.smallBtnTxtDanger]}>Remove</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.label, { marginTop: 18 }]}>Who can drive it</Text>
                {LOCK_OPTIONS.map((opt) => {
                  const active = (ambulance.driverLock || 'preferred') === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.lockRow, active && styles.lockRowActive]}
                      onPress={() => setLock(opt.value)}
                      disabled={busy}
                    >
                      <View style={[styles.radio, active && styles.radioOn]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.lockLabel, active && { color: '#fff' }]}>{opt.label}</Text>
                        <Text style={styles.lockHint}>{opt.hint}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              <>
                <Text style={styles.emptyTxt}>No driver assigned yet.</Text>
                <TouchableOpacity onPress={openPicker} disabled={busy} style={styles.assignBtn}>
                  <Text style={styles.assignBtnTxt}>Assign a driver</Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={[styles.label, { marginTop: 22 }]}>On duty now</Text>
            <Text style={ambulance.assignedDriver ? styles.onDutyTxt : styles.emptyTxt}>
              {ambulance.assignedDriver
                ? `${ambulance.assignedDriver.name} · ${ambulance.assignedDriver.phone}`
                : 'Nobody is on duty on this ambulance.'}
            </Text>
          </View>

          <AmbulancePhotosAndDocs
            ambulanceId={ambulanceId}
            initialPhotos={ambulance.photos || []}
            initialDocuments={ambulance.documents || {}}
          />
        </ScrollView>
      )}

      {/* Driver picker — approved drivers only, see loadDrivers. */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose a driver</Text>

            {drivers.length === 0 ? (
              <Text style={styles.emptyTxt}>
                No approved drivers yet. Add a driver and approve them first.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 340 }}>
                {drivers.map((d) => (
                  <TouchableOpacity
                    key={d._id}
                    style={styles.pickRow}
                    onPress={() => assign(d._id)}
                    disabled={busy}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverName}>{d.name}</Text>
                      <Text style={styles.driverPhone}>{d.phone}</Text>
                    </View>
                    {ambulance?.defaultDriver?._id === d._id && (
                      <Text style={styles.currentTag}>CURRENT</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity onPress={() => setPickerOpen(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  section: {
    marginTop: 8, marginBottom: 24, paddingTop: 18,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  driverName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  driverPhone: { color: '#9ca3af', fontSize: 12.5, marginTop: 2 },
  onDutyTxt: { color: '#10b981', fontSize: 14, fontWeight: '600' },
  emptyTxt: { color: '#6b7280', fontSize: 13.5, marginBottom: 12 },

  smallBtn: {
    borderWidth: 1, borderColor: '#374151', borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  smallBtnTxt: { color: '#d1d5db', fontSize: 12.5, fontWeight: '600' },
  smallBtnDanger: { borderColor: 'rgba(239,68,68,0.5)' },
  smallBtnTxtDanger: { color: '#ef4444' },

  assignBtn: {
    borderWidth: 1, borderColor: '#10b981', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  assignBtnTxt: { color: '#10b981', fontSize: 14.5, fontWeight: 'bold' },

  lockRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1, borderColor: '#1f2937', borderRadius: 10,
    padding: 12, marginBottom: 8,
  },
  lockRowActive: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)' },
  radio: {
    width: 16, height: 16, borderRadius: 8, marginTop: 2,
    borderWidth: 2, borderColor: '#4b5563',
  },
  radioOn: { borderColor: '#10b981', backgroundColor: '#10b981' },
  lockLabel: { color: '#d1d5db', fontSize: 14, fontWeight: '600' },
  lockHint: { color: '#6b7280', fontSize: 11.5, marginTop: 2, lineHeight: 16 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#111827', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 20, paddingBottom: 34,
  },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 16 },
  pickRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  currentTag: { color: '#10b981', fontSize: 10.5, fontWeight: 'bold', letterSpacing: 0.5 },
  modalCancel: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  modalCancelTxt: { color: '#9ca3af', fontSize: 14.5 },
});
