import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, TextInput } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import BookingTripScreen from './BookingTripScreen';
import { tripsApi, tripActivityApi, advanceApi } from '../../api/client';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';

export default function DriverDashboard() {
  const { user, logout } = useAuth();
 const [trips, setTrips] = useState([]);
  const [showBookingTrip, setShowBookingTrip] = useState(false);
  const [dutyStatus, setDutyStatus] = useState('OFF');
  const [showExpense, setShowExpense] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [expenseType, setExpenseType] = useState('DIESEL_FILL');
  const [amount, setAmount] = useState('');
  const [liters, setLiters] = useState('');
  const [reason, setReason] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [cameraRef, setCameraRef] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => { loadTrips(); }, []);

  const loadTrips = async () => {
    try {
      const { data } = await tripsApi.getLive();
      setTrips(data.liveTrips || []);
    } catch (e) { console.log(e); }
  };

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { latitude: 0, longitude: 0 };
    const loc = await Location.getCurrentPositionAsync({});
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  };

  const logActivity = async (status, extras = {}) => {
    try {
      const location = await getLocation();
      await tripActivityApi.log({
        driverId: user._id,
        ambulanceId: user?.vehicleId || 'KA05AN9832',
        tripStatus: status,
        latitude: location.latitude,
        longitude: location.longitude,
        ...extras
      });
    } catch (e) { console.log(e); }
  };

  const handleStartDuty = async () => {
    if (!permission?.granted) await requestPermission();
    setShowCamera(true);
  };

  const takeSelfie = async () => {
    if (cameraRef) {
      const photo = await cameraRef.takePictureAsync({ quality: 0.5 });
      setShowCamera(false);
      await logActivity('START_12HR_SHIFT', { imageUrl: photo.uri });
      setDutyStatus('12HR');
      Alert.alert('✅ Success', 'Duty Started!');
    }
  };

  const handleEndDuty = async () => {
    await logActivity('END_12HR_SHIFT');
    setDutyStatus('OFF');
    Alert.alert('✅ Success', 'Duty Ended!');
  };

  const handleTripStatus = async (tripId, status) => {
    try {
      await tripsApi.updateStatus(tripId, status === 'TRIP_STARTED' ? 'en_route' : status);
      await logActivity(status, { tripId });
      Alert.alert('✅ Success', `${status}!`);
      loadTrips();
    } catch (e) { Alert.alert('Error', 'Update failed'); }
  };

  const submitExpense = async () => {
    if (!amount) { Alert.alert('Error', 'Amount ಹಾಕಿ'); return; }
    const details = {};
    if (expenseType === 'DIESEL_FILL') { details.dieselAmount = Number(amount); details.dieselLiters = Number(liters); }
    if (expenseType === 'FOOD_EXPENSE') details.foodAmount = Number(amount);
    if (expenseType === 'VEHICLE_REPAIR') { details.repairAmount = Number(amount); details.repairDetails = reason; }
    if (expenseType === 'POLICE_FINE') { details.policeFineAmount = Number(amount); details.policeFineReason = reason; }
    await logActivity(expenseType, { ambulanceDetails: details, imageUrl: photoUri });
    setShowExpense(false);
    setAmount(''); setLiters(''); setReason(''); setPhotoUri(null);
    Alert.alert('✅ Success', 'Expense saved!');
  };

  const submitAdvance = async () => {
    if (!advanceAmount || !advanceReason) {
      Alert.alert('Error', 'Amount ಮತ್ತು Reason ಹಾಕಿ'); return;
    }
    try {
      await advanceApi.request({ amount: Number(advanceAmount), reason: advanceReason });
      setShowAdvance(false);
      setAdvanceAmount(''); setAdvanceReason('');
      Alert.alert('✅ Success', 'Advance request sent to Admin!');
    } catch { Alert.alert('Error', 'Request failed. Try again.'); }
  };

  const myTrip = trips.find(t => t.driver?._id === user?._id || t.driver === user?._id);
  const isShiftDriver = user?.driverType === 'shift_driver' || !user?.driverType;

  if (showBookingTrip) return <BookingTripScreen onBack={() => setShowBookingTrip(false)} />;

  return (
    <View style={styles.container}>
      {/* Camera Modal */}
      <Modal visible={showCamera} animationType="slide">
        <View style={{ flex: 1 }}>
          <CameraView style={{ flex: 1 }} facing="front" ref={setCameraRef} />
          <TouchableOpacity style={styles.captureBtn} onPress={takeSelfie}>
            <Text style={styles.captureTxt}>📸 Take Selfie</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.captureBtn, { backgroundColor: '#ef4444' }]} onPress={() => setShowCamera(false)}>
            <Text style={styles.captureTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Expense Modal */}
      <Modal visible={showExpense} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>💰 Add Expense</Text>
            <Text style={styles.label}>ಖರ್ಚಿನ ವಿಧ</Text>
            <View style={styles.typeRow}>
              {['DIESEL_FILL','FOOD_EXPENSE','VEHICLE_REPAIR','POLICE_FINE'].map(t => (
                <TouchableOpacity key={t} style={[styles.typeBtn, expenseType===t && styles.typeBtnActive]} onPress={() => setExpenseType(t)}>
                  <Text style={styles.typeTxt}>
                    {t==='DIESEL_FILL'?'⛽':t==='FOOD_EXPENSE'?'🍲':t==='VEHICLE_REPAIR'?'🛠️':'👮'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Amount (₹)" keyboardType="numeric" value={amount} onChangeText={setAmount} placeholderTextColor="#888" />
            {expenseType === 'DIESEL_FILL' && <TextInput style={styles.input} placeholder="Liters" keyboardType="numeric" value={liters} onChangeText={setLiters} placeholderTextColor="#888" />}
            {(expenseType === 'VEHICLE_REPAIR' || expenseType === 'POLICE_FINE') && <TextInput style={styles.input} placeholder="Details/Reason" value={reason} onChangeText={setReason} placeholderTextColor="#888" />}
            <TouchableOpacity style={styles.photoBtn} onPress={() => { setShowExpense(false); setShowCamera(true); }}>
              <Text style={styles.photoBtnTxt}>📸 Take Bill Photo</Text>
            </TouchableOpacity>
            {photoUri && <Text style={{ color: '#10b981', marginBottom: 8 }}>✅ Photo ready</Text>}
            <TouchableOpacity style={styles.submitBtn} onPress={submitExpense}>
              <Text style={styles.submitTxt}>Submit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowExpense(false)}>
              <Text style={{ color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Advance Modal */}
      <Modal visible={showAdvance} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>💵 Request Advance</Text>
            <TextInput style={styles.input} placeholder="Amount (₹)" keyboardType="numeric" value={advanceAmount} onChangeText={setAdvanceAmount} placeholderTextColor="#888" />
            <TextInput style={[styles.input, { height: 80 }]} placeholder="Reason ಹಾಕಿ..." value={advanceReason} onChangeText={setAdvanceReason} placeholderTextColor="#888" multiline />
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#f59e0b' }]} onPress={submitAdvance}>
              <Text style={styles.submitTxt}>Send Request to Admin</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdvance(false)}>
              <Text style={{ color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcome}>Hello, {user?.name}!</Text>
            <Text style={styles.role}>Driver • {dutyStatus === 'OFF' ? '🔴 Off Duty' : dutyStatus === '12HR' ? '🟢 On Duty' : '🚑 On Trip'}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutTxt}>Logout</Text>
          </TouchableOpacity>
        </View>

       {/* Booking Trip Button */}
        <View style={{ margin: 16 }}>
          <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#3b82f6' }]} onPress={() => setShowBookingTrip(true)}>
            <Text style={styles.bigBtnTxt}>🚑 Booking Trip</Text>
            <Text style={styles.bigBtnSub}>Patient pickup/drop trip ಶುರು ಮಾಡಿ</Text>
          </TouchableOpacity>
        </View>
        {/* Main Action Button */}
        <View style={styles.actionBox}>
          {dutyStatus === 'OFF' && (
            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#10b981' }]} onPress={handleStartDuty}>
              <Text style={styles.bigBtnTxt}>🟢 Start 12hr Shift</Text>
              <Text style={styles.bigBtnSub}>Selfie ತೆಗೆದು Duty ಶುರು ಮಾಡಿ</Text>
            </TouchableOpacity>
          )}
          {dutyStatus === '12HR' && (
            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#ef4444' }]} onPress={handleEndDuty}>
              <Text style={styles.bigBtnTxt}>🔴 End 12hr Shift</Text>
              <Text style={styles.bigBtnSub}>Duty ಮುಗಿಸಿ</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Active Trip */}
        {myTrip && !isShiftDriver && (
          <View style={styles.tripCard}>
            <Text style={styles.tripTitle}>🚑 Active Trip</Text>
            <Text style={styles.tripTxt}>Patient: {myTrip.patientName}</Text>
            <Text style={styles.tripTxt}>Hospital: {myTrip.dropHospital?.name || 'N/A'}</Text>
            <Text style={styles.tripTxt}>Status: {myTrip.status}</Text>
            <View style={styles.tripBtns}>
              {myTrip.status === 'dispatched' && (
                <TouchableOpacity style={[styles.tripBtn, { backgroundColor: '#10b981' }]} onPress={() => handleTripStatus(myTrip._id, 'TRIP_STARTED')}>
                  <Text style={styles.tripBtnTxt}>▶ Start Trip</Text>
                </TouchableOpacity>
              )}
              {myTrip.status === 'en_route' && (
                <TouchableOpacity style={[styles.tripBtn, { backgroundColor: '#f59e0b' }]} onPress={() => handleTripStatus(myTrip._id, 'CLIENT_DROPPED')}>
                  <Text style={styles.tripBtnTxt}>📍 Client Dropped</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* FAB Buttons */}
      {dutyStatus !== 'OFF' && (
        <>
          <TouchableOpacity style={[styles.fab, { bottom: 90, backgroundColor: '#f59e0b' }]} onPress={() => setShowAdvance(true)}>
            <Text style={styles.fabTxt}>💵 Request Advance</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fab} onPress={() => setShowExpense(true)}>
            <Text style={styles.fabTxt}>+ Add Expense</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  header: { backgroundColor: '#111827', padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  welcome: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  role: { color: '#10b981', fontSize: 13, marginTop: 2 },
  logoutBtn: { backgroundColor: '#ef4444', padding: 10, borderRadius: 8 },
  logoutTxt: { color: '#fff', fontWeight: 'bold' },
  actionBox: { margin: 16 },
  bigBtn: { padding: 24, borderRadius: 16, alignItems: 'center' },
  bigBtnTxt: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  bigBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  tripCard: { backgroundColor: '#111827', margin: 16, padding: 16, borderRadius: 12 },
  tripTitle: { color: '#10b981', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  tripTxt: { color: '#9ca3af', fontSize: 14, marginBottom: 4 },
  tripBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tripBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  tripBtnTxt: { color: '#fff', fontWeight: 'bold' },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: '#6366f1', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, elevation: 5 },
  fabTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  captureBtn: { backgroundColor: '#10b981', padding: 20, alignItems: 'center' },
  captureTxt: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#111827', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  label: { color: '#9ca3af', fontSize: 14, marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#374151', alignItems: 'center', backgroundColor: '#1f2937' },
  typeBtnActive: { borderColor: '#10b981', backgroundColor: '#064e3b' },
  typeTxt: { fontSize: 24 },
  input: { backgroundColor: '#1f2937', borderRadius: 10, padding: 14, color: '#fff', fontSize: 16, marginBottom: 12 },
  photoBtn: { backgroundColor: '#1f2937', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#374151' },
  photoBtnTxt: { color: '#9ca3af', fontSize: 16 },
  submitBtn: { backgroundColor: '#10b981', padding: 16, borderRadius: 10, alignItems: 'center' },
  submitTxt: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});