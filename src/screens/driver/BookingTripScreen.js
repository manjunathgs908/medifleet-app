import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Modal } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import * as Location from 'expo-location';

const STAGES = [
  { key: 'START_TRIP',               label: '▶ Start Trip',         color: '#10b981' },
  { key: 'REACHED_HOSPITAL',         label: '🏥 Reached Hospital',   color: '#3b82f6' },
  { key: 'PATIENT_PICKED_BOOKING',   label: '🧑 Patient Picked',     color: '#8b5cf6' },
  { key: 'START_PICKUP_TRIP',        label: '🚑 Start Patient Trip', color: '#f59e0b' },
  { key: 'CLIENT_DROPPED',           label: '📍 Client Dropped',     color: '#ef4444' },
  { key: 'RETURN_STARTED',           label: '↩ Return Started',      color: '#06b6d4' },
  { key: 'END_TRIP_CLOSE_DUTY',      label: '✅ Close Duty',         color: '#10b981' },
];

const fmt = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

export default function BookingTripScreen({ navigation }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const [pendingStage, setPendingStage] = useState(null);
  const [notes, setNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadTrips(); }, []);

  const loadTrips = async () => {
    try {
      const { data } = await api.get('/booking-trips/my');
      setTrips(data.trips || []);
      const active = data.trips?.find(t => !t.isCompleted && !t.isCancelled);
      setActiveTrip(active || null);
    } catch (e) { console.log(e); }
  };

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return { latitude: 0, longitude: 0 };
      const loc = await Location.getCurrentPositionAsync({});
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch { return { latitude: 0, longitude: 0 }; }
  };

  const startNewTrip = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/booking-trips', { vehicle: user?.vehicleId || '' });
      setActiveTrip(data.trip);
      loadTrips();
    } catch (e) { Alert.alert('Error', 'Failed to create trip'); }
    finally { setLoading(false); }
  };

  const handleStagePress = (stage) => {
    setPendingStage(stage);
    setNotes('');
    setCancelReason('');
    setShowNotes(true);
  };

  const confirmStage = async () => {
    if (!activeTrip) return;
    setLoading(true);
    try {
      const location = await getLocation();
      await api.put(`/booking-trips/${activeTrip._id}/stage`, {
        stage: pendingStage,
        latitude: location.latitude,
        longitude: location.longitude,
        notes,
        cancelReason,
      });
      setShowNotes(false);
      Alert.alert('✅ Success', `${pendingStage} saved!`);
      loadTrips();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed');
    } finally { setLoading(false); }
  };

  const getNextStage = () => {
    if (!activeTrip) return STAGES[0];
    const idx = STAGES.findIndex(s => s.key === activeTrip.currentStage);
    return STAGES[idx + 1] || null;
  };

  const isStageCompleted = (key) => activeTrip?.stages?.[key]?.completedAt;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🚑 Booking Trip</Text>
      </View>

      <Modal visible={showNotes} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{STAGES.find(s=>s.key===pendingStage)?.label}</Text>
            {pendingStage === 'CANCEL_REQUESTED' && (
              <TextInput style={styles.input} placeholder="Cancel Reason *" value={cancelReason} onChangeText={setCancelReason} placeholderTextColor="#888" />
            )}
            <TextInput style={[styles.input, { height: 80 }]} placeholder="Notes (optional)" value={notes} onChangeText={setNotes} placeholderTextColor="#888" multiline />
            <TouchableOpacity style={styles.confirmBtn} onPress={confirmStage} disabled={loading}>
              <Text style={styles.confirmTxt}>{loading ? 'Saving...' : '✅ Confirm'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowNotes(false)}>
              <Text style={{ color: '#9ca3af', textAlign: 'center', marginTop: 10 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView style={{ flex: 1 }}>
        {!activeTrip && (
          <View style={styles.newTripBox}>
            <Text style={styles.newTripTitle}>ಹೊಸ Booking Trip ಶುರು ಮಾಡಿ</Text>
            <TouchableOpacity style={styles.newTripBtn} onPress={startNewTrip} disabled={loading}>
              <Text style={styles.newTripBtnTxt}>{loading ? 'Creating...' : '+ New Booking Trip'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTrip && (
          <View style={styles.tripBox}>
            <Text style={styles.tripDate}>Trip: {fmt(activeTrip.createdAt)}</Text>
            {!activeTrip.isCompleted && !activeTrip.isCancelled && (
              <View style={styles.actionBox}>
                {getNextStage() ? (
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: getNextStage().color }]} onPress={() => handleStagePress(getNextStage().key)}>
                    <Text style={styles.actionBtnTxt}>{getNextStage().label}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.actionBtn, { backgroundColor: '#10b981' }]}>
                    <Text style={styles.actionBtnTxt}>✅ Trip Completed!</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.cancelBtn} onPress={() => handleStagePress('CANCEL_REQUESTED')}>
                  <Text style={styles.cancelBtnTxt}>⚠ Request Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.timelineTitle}>📋 Stage Timeline</Text>
            {STAGES.map((stage) => {
              const completed = isStageCompleted(stage.key);
              const stageData = activeTrip.stages?.[stage.key];
              return (
                <View key={stage.key} style={styles.timelineItem}>
                  <View style={[styles.dot, { backgroundColor: completed ? stage.color : '#374151' }]} />
                  <View style={styles.timelineContent}>
                    <Text style={[styles.stageName, { color: completed ? '#fff' : '#6b7280' }]}>{stage.label}</Text>
                    {completed && (
                      <>
                        <Text style={styles.stageTime}>🕐 {fmt(stageData.completedAt)}</Text>
                        {stageData.completedBy ? <Text style={styles.stageBy}>👤 {stageData.completedBy}</Text> : null}
                        {stageData.notes ? <Text style={styles.stageNotes}>📝 {stageData.notes}</Text> : null}
                        {stageData.cancelReason ? <Text style={styles.stageNotes}>⚠ {stageData.cancelReason}</Text> : null}
                      </>
                    )}
                  </View>
                </View>
              );
            })}

            {activeTrip.isCompleted && activeTrip.totalDutyHours && (
              <View style={styles.statsBox}>
                <Text style={styles.statsTitle}>📊 Trip Summary</Text>
                <Text style={styles.statsText}>⏱ Total Duty: {activeTrip.totalDutyHours} hrs</Text>
              </View>
            )}
          </View>
        )}

        {trips.filter(t => t.isCompleted || t.isCancelled).length > 0 && (
          <View style={{ margin: 16 }}>
            <Text style={styles.timelineTitle}>📁 Past Trips</Text>
            {trips.filter(t => t.isCompleted || t.isCancelled).map(t => (
              <View key={t._id} style={styles.pastTrip}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{fmt(t.createdAt)}</Text>
                <Text style={{ color: t.isCancelled ? '#ef4444' : '#10b981', fontSize: 12 }}>
                  {t.isCancelled ? '❌ Cancelled' : '✅ Completed'}
                  {t.totalDutyHours ? ` • ${t.totalDutyHours}hrs` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  header: { backgroundColor: '#111827', padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { padding: 8 },
  backTxt: { color: '#10b981', fontSize: 16 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  newTripBox: { margin: 16, padding: 24, backgroundColor: '#111827', borderRadius: 16, alignItems: 'center' },
  newTripTitle: { color: '#9ca3af', fontSize: 16, marginBottom: 16 },
  newTripBtn: { backgroundColor: '#10b981', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  newTripBtnTxt: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  tripBox: { margin: 16 },
  tripDate: { color: '#9ca3af', fontSize: 12, marginBottom: 12 },
  actionBox: { marginBottom: 20 },
  actionBtn: { padding: 18, borderRadius: 14, alignItems: 'center', marginBottom: 8 },
  actionBtnTxt: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  cancelBtn: { padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ef4444' },
  cancelBtnTxt: { color: '#ef4444', fontSize: 14, fontWeight: 'bold' },
  timelineTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: 12 },
  timelineContent: { flex: 1 },
  stageName: { fontSize: 15, fontWeight: 'bold' },
  stageTime: { color: '#10b981', fontSize: 12, marginTop: 2 },
  stageBy: { color: '#9ca3af', fontSize: 11 },
  stageNotes: { color: '#6b7280', fontSize: 11, fontStyle: 'italic' },
  statsBox: { backgroundColor: '#111827', padding: 16, borderRadius: 12, marginTop: 16 },
  statsTitle: { color: '#fff', fontWeight: 'bold', marginBottom: 8 },
  statsText: { color: '#10b981', fontSize: 14 },
  pastTrip: { backgroundColor: '#111827', padding: 12, borderRadius: 10, marginBottom: 8 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#111827', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { backgroundColor: '#1f2937', borderRadius: 10, padding: 14, color: '#fff', fontSize: 16, marginBottom: 12 },
  confirmBtn: { backgroundColor: '#10b981', padding: 16, borderRadius: 10, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});