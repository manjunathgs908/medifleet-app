import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, TextInput, Animated } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { tripsApi, tripActivityApi, advanceApi } from '../../api/client';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';

export default function DriverDashboard({ navigation }) {
  const { user, logout } = useAuth();
 const [trips, setTrips] = useState([]);
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

  // UI-only: sliding indicator position for the OFF/ON duty pill toggle
  // below, purely derived FROM the existing dutyStatus state — no new
  // business meaning, just an animated visual mirror of it.
  const dutyAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(dutyAnim, {
      toValue: dutyStatus === 'OFF' ? 0 : 1,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [dutyStatus]);

  useEffect(() => { loadTrips(); }, []);

  const loadTrips = async () => {
    try {
      const { data } = await tripsApi.getLive();
      setTrips(data.liveTrips || []);
    } catch (e) { console.log(e); }
  };

  // Phase 5 — poll for newly assigned trips so TripAssignedScreen can pop
  // up without a manual refresh. No push notifications yet (a later
  // phase) — plain client-side polling. Gated to trip_driver types only,
  // matching the existing Active Trip card's own isShiftDriver gating
  // further down (shift_driver types use the 12hr-shift + Booking Trip
  // flow instead and were never shown Trip-model assignments).
  const [acknowledgedTripIds, setAcknowledgedTripIds] = useState([]);

  useEffect(() => {
    if (!user?.driverType || user.driverType === 'shift_driver') return;

    const interval = setInterval(async () => {
      try {
        const { data } = await tripsApi.getLive();
        const liveTrips = data.liveTrips || [];
        setTrips(liveTrips);

        const isMine = (t) => t.driver?._id === user?._id || t.driver === user?._id;
        const hasActiveTrip = liveTrips.some(t => isMine(t) && t.status === 'en_route');
        const newlyAssigned = liveTrips.find(
          t => isMine(t) && t.status === 'dispatched' && !acknowledgedTripIds.includes(t._id)
        );

        if (newlyAssigned && !hasActiveTrip) {
          setAcknowledgedTripIds(prev => [...prev, newlyAssigned._id]);
          navigation.navigate('TripAssigned', { trip: newlyAssigned });
        }
      } catch (e) { console.log(e); }
    }, 9000);

    return () => clearInterval(interval);
  }, [user, acknowledgedTripIds]);

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
      if (status === 'CLIENT_DROPPED') {
        // Backend Trip.status has no 'CLIENT_DROPPED' value — dropping the
        // patient is what actually completes the trip (fare calc + bill +
        // income ledger + vehicle/driver release), so this maps to /complete
        // instead of /status. distanceKm/additionalCharges are optional —
        // the backend falls back to the trip's stored distance when omitted.
        const { data } = await tripsApi.complete(tripId, {});
        await logActivity(status, { tripId });
        loadTrips();
        // Phase 5 — show the completion summary instead of a plain Alert.
        // The complete() call above and its arguments are unchanged.
        navigation.navigate('TripSummary', { trip: data.trip, bill: data.bill });
        return;
      }
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

      {/* ═══ Full-screen "map" background ═══
          react-native-maps is NOT a dependency of this project (checked
          package.json — confirmed absent, same finding as Phase 5's
          NavigateScreen). Per instructions this pass adds no new native
          dependency, so this is a static dark background with a couple
          of soft decorative glows standing in for a map, not an actual
          gradient library (RN has no built-in gradient primitive) or a
          real map. Flagging this clearly rather than guessing further. */}
      <View style={styles.mapBackground} pointerEvents="none">
        <View style={styles.mapGlowTop} />
        <View style={styles.mapGlowBottom} />
      </View>

      {/* Top bar — same greeting/role text and logout action as before */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.welcome}>Hello, {user?.name}!</Text>
          <Text style={styles.role}>Driver • {dutyStatus === 'OFF' ? '🔴 Off Duty' : dutyStatus === '12HR' ? '🟢 On Duty' : '🚑 On Trip'}</Text>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.bellBtn} onPress={() => Alert.alert('Notifications', 'Coming soon')}>
            <Text style={styles.bellIcon}>🔔</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>0</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutTxt}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* OFF DUTY ⟷ ON DUTY sliding pill — tapping it calls the EXACT
          same handleStartDuty (camera/selfie flow) / handleEndDuty as
          the old two-separate-buttons layout. Only the trigger/visual
          changed, not what either function does. */}
      <View style={styles.dutyPillWrap}>
        <TouchableOpacity
          style={styles.dutyPill}
          activeOpacity={0.85}
          onPress={dutyStatus === 'OFF' ? handleStartDuty : handleEndDuty}
        >
          <Animated.View
            style={[
              styles.dutyPillIndicator,
              {
                backgroundColor: dutyStatus === 'OFF' ? '#ef4444' : '#10b981',
                transform: [{
                  translateX: dutyAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 120] }),
                }],
              },
            ]}
          />
          <View style={styles.dutyPillLabel}>
            <Text style={[styles.dutyPillText, dutyStatus === 'OFF' && styles.dutyPillTextActive]}>OFF DUTY</Text>
          </View>
          <View style={styles.dutyPillLabel}>
            <Text style={[styles.dutyPillText, dutyStatus !== 'OFF' && styles.dutyPillTextActive]}>ON DUTY</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Booking Trip Button — identical text/action, restyled card */}
        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#3b82f6' }]} onPress={() => navigation.navigate('BookingTrip')}>
          <Text style={styles.bigBtnTxt}>🚑 Booking Trip</Text>
          <Text style={styles.bigBtnSub}>Patient pickup/drop trip ಶುರು ಮಾಡಿ ✅ OTA TEST</Text>
        </TouchableOpacity>

        {/* Active Trip — identical logic/buttons, restyled card */}
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

      {/* FAB Buttons — identical triggers, repositioned to clear the new bottom nav bar */}
      {dutyStatus !== 'OFF' && (
        <>
          <TouchableOpacity style={[styles.fab, { bottom: 172, backgroundColor: '#f59e0b' }]} onPress={() => setShowAdvance(true)}>
            <Text style={styles.fabTxt}>💵 Request Advance</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fab} onPress={() => setShowExpense(true)}>
            <Text style={styles.fabTxt}>+ Add Expense</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Bottom nav bar — Home is this screen; the rest are non-functional
          placeholder stubs per instructions ("Coming soon"), since only
          Booking-Trip/trip-related navigation exists today. */}
      <View style={styles.bottomNav}>
        <View style={styles.navItem}>
          <Text style={styles.navIconActive}>🏠</Text>
          <Text style={styles.navLabelActive}>Home</Text>
        </View>
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Trips', 'Coming soon')}>
          <Text style={styles.navIcon}>📋</Text>
          <Text style={styles.navLabel}>Trips</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Earnings', 'Coming soon')}>
          <Text style={styles.navIcon}>💰</Text>
          <Text style={styles.navLabel}>Earnings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Messages', 'Coming soon')}>
          <Text style={styles.navIcon}>💬</Text>
          <Text style={styles.navLabel}>Messages</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Profile', 'Coming soon')}>
          <Text style={styles.navIcon}>👤</Text>
          <Text style={styles.navLabel}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },

  // ── "Map" background — see comment at the usage site in the JSX above
  // for why this is a static dark backdrop rather than a real map/gradient.
  mapBackground: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0a0f1e', overflow: 'hidden' },
  mapGlowTop: { position: 'absolute', top: -120, left: -60, width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(16,185,129,0.08)' },
  mapGlowBottom: { position: 'absolute', bottom: -140, right: -80, width: 360, height: 360, borderRadius: 180, backgroundColor: 'rgba(59,130,246,0.07)' },

  // ── Top bar ──────────────────────────────────────────────────────────
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 4 },
  welcome: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  role: { color: '#10b981', fontSize: 13, marginTop: 2 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 18 },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: '#ef4444', padding: 10, borderRadius: 8 },
  logoutTxt: { color: '#fff', fontWeight: 'bold' },

  // ── OFF DUTY ⟷ ON DUTY sliding pill ─────────────────────────────────
  dutyPillWrap: { alignItems: 'center', paddingTop: 18, paddingBottom: 10 },
  dutyPill: { flexDirection: 'row', width: 232, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: 4, overflow: 'hidden' },
  dutyPillIndicator: { position: 'absolute', top: 4, left: 0, width: 112, height: 40, borderRadius: 20 },
  dutyPillLabel: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dutyPillText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 'bold', letterSpacing: 0.5 },
  dutyPillTextActive: { color: '#fff' },

  // ── Scrollable content over the map background ──────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },

  bigBtn: { padding: 24, borderRadius: 16, alignItems: 'center' },
  bigBtnTxt: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  bigBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  tripCard: { backgroundColor: 'rgba(17,24,39,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: 16, padding: 16, borderRadius: 12 },
  tripTitle: { color: '#10b981', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  tripTxt: { color: '#9ca3af', fontSize: 14, marginBottom: 4 },
  tripBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tripBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  tripBtnTxt: { color: '#fff', fontWeight: 'bold' },

  // ── FABs (unchanged triggers — repositioned to clear the bottom nav) ─
  fab: { position: 'absolute', bottom: 106, right: 24, backgroundColor: '#6366f1', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, elevation: 5 },
  fabTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // ── Bottom nav bar ───────────────────────────────────────────────────
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#111827', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 10, paddingBottom: 22 },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navIcon: { fontSize: 20, opacity: 0.45 },
  navIconActive: { fontSize: 20 },
  navLabel: { color: '#6b7280', fontSize: 10, fontWeight: '600' },
  navLabelActive: { color: '#10b981', fontSize: 10, fontWeight: '700' },

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