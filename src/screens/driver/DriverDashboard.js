import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, TextInput, Switch, Platform } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Updates from 'expo-updates';
import { BatteryOptEnabled } from 'react-native-battery-optimization-check';
import { useAuth } from '../../context/AuthContext';
import { driverAuthApi, tripsApi, assignmentsApi, authApi } from '../../api/client';
import { getDeviceId, checkInternet } from '../../utils/device';

// Every check the driver must pass before the ON DUTY toggle is enabled.
// Keys match the `checks` state object below 1:1 so failing ones can be
// listed by label without a separate lookup table drifting out of sync.
const DUTY_CHECK_LABELS = {
  gps: 'GPS enabled',
  internet: 'Internet connected',
  backgroundLocation: 'Background location granted',
  batteryOk: 'Battery optimization disabled',
  approved: 'Driver approved',
  ambulanceAssigned: 'Ambulance assigned',
  documentsValid: 'Documents uploaded',
  appUpdated: 'App up to date',
};

// Default region: Bengaluru (map ge fallback, GPS baruvavarege)
const BANGALORE = {
  latitude: 12.9716,
  longitude: 77.5946,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const LOCATION_UPDATE_INTERVAL_MS = 10000;
const TRIP_POLL_INTERVAL_MS = 15000;

export default function DriverDashboard({ navigation, route }) {
  const { user, logout } = useAuth();
  const mapRef = useRef(null);
  const intervalRef = useRef(null);
  const tripIntervalRef = useRef(null);
  // Guards against re-navigating to the popup every poll tick while the
  // same unconfirmed trip is still pending. Keyed on id+dispatchedAt so a
  // later re-assignment of the same trip document (new dispatchedAt) is
  // still treated as a fresh prompt.
  const promptedTripKeyRef = useRef(null);

  const [region, setRegion] = useState(BANGALORE);
  const [driverLoc, setDriverLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [activeTrip, setActiveTrip] = useState(null);
  const [startingTrip, setStartingTrip] = useState(false);

  const [otpInput, setOtpInput] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const [completingTrip, setCompletingTrip] = useState(false);

  // ── ON DUTY toggle + pre-go-online gate ──
  const [profile, setProfile] = useState(user);
  const [onDuty, setOnDuty] = useState(false);
  const [dutyLoading, setDutyLoading] = useState(false);
  const [checks, setChecks] = useState({});
  const [checksLoading, setChecksLoading] = useState(true);

  // Re-fetches the real driver profile (approvalStatus/assignedAmbulanceId/
  // driverDocuments — not necessarily fresh in AuthContext if the session
  // has been open a while) and runs every device/account check the toggle
  // is gated on. Returns the computed checks so the toggle handler can act
  // on them immediately instead of waiting on the next render's state.
  const runDutyChecks = useCallback(async () => {
    setChecksLoading(true);
    let freshUser = user;
    try {
      const { data } = await authApi.me();
      if (data?.user) freshUser = data.user;
    } catch (err) {
      // Silent — fall back to whatever AuthContext already has.
    }
    setProfile(freshUser);

    const [gps, internet, backgroundPerm, batteryEnabled, updateResult] = await Promise.all([
      Location.hasServicesEnabledAsync(),
      checkInternet(),
      Location.getBackgroundPermissionsAsync(),
      Platform.OS === 'android' ? BatteryOptEnabled() : Promise.resolve(false),
      __DEV__ ? Promise.resolve({ isAvailable: false }) : Updates.checkForUpdateAsync().catch(() => ({ isAvailable: false })),
    ]);

    const next = {
      gps,
      internet,
      backgroundLocation: !!backgroundPerm?.granted,
      batteryOk: Platform.OS === 'android' ? !batteryEnabled : true,
      approved: freshUser?.approvalStatus === 'approved',
      ambulanceAssigned: !!freshUser?.assignedAmbulanceId,
      documentsValid: !!(
        freshUser?.driverDocuments?.dl?.url &&
        freshUser?.driverDocuments?.aadhaar?.url &&
        freshUser?.driverDocuments?.photo?.url
      ),
      appUpdated: !updateResult?.isAvailable,
    };
    setChecks(next);
    setChecksLoading(false);
    return next;
  }, [user]);

  useEffect(() => {
    runDutyChecks();
  }, [runDutyChecks]);

  // Reflects the real backend state (e.g. app was killed mid-shift) rather
  // than assuming off-duty on every cold start.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await assignmentsApi.getMyActiveShift();
        if (mounted) setOnDuty(!!data?.shift);
      } catch (err) {
        // Silent — toggle just defaults to off; driver can still try to go online.
      }
    })();
    return () => { mounted = false; };
  }, []);

  const failingChecks = Object.keys(DUTY_CHECK_LABELS).filter(k => checks[k] === false);
  const allChecksPassed = !checksLoading && failingChecks.length === 0;

  async function handleToggleDuty() {
    if (onDuty) {
      setDutyLoading(true);
      try {
        await assignmentsApi.endDuty(driverLoc?.latitude, driverLoc?.longitude);
        setOnDuty(false);
      } catch (err) {
        Alert.alert('Error', err?.response?.data?.message || 'Could not end duty. Try again.');
      } finally {
        setDutyLoading(false);
      }
      return;
    }

    const fresh = await runDutyChecks();
    const stillFailing = Object.keys(DUTY_CHECK_LABELS).filter(k => fresh[k] === false);
    if (stillFailing.length > 0) {
      Alert.alert(
        'Cannot Go Online',
        'Please fix the following before going on duty:\n\n' +
          stillFailing.map(k => `• ${DUTY_CHECK_LABELS[k]}`).join('\n')
      );
      return;
    }

    setDutyLoading(true);
    try {
      const deviceId = await getDeviceId();
      const ambulanceId = profile?.assignedAmbulanceId?._id || profile?.assignedAmbulanceId;
      await assignmentsApi.startDuty(ambulanceId, deviceId, driverLoc?.latitude, driverLoc?.longitude);
      setOnDuty(true);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not start duty. Try again.');
    } finally {
      setDutyLoading(false);
    }
  }

  // ── Get initial location + start map ──
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) {
            setErrorMsg('Location permission beku. Settings alli allow maadi.');
            setLoading(false);
          }
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (mounted) {
          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setDriverLoc(coords);
          setRegion({
            ...coords,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setErrorMsg('Location tegeyalu aagalilla. GPS on ideya check maadi.');
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ── Send location to backend every 10 seconds ──
  useEffect(() => {
    const sendLocation = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const { latitude, longitude } = loc.coords;

        setDriverLoc({ latitude, longitude });

        await driverAuthApi.updateLocation(latitude, longitude, 'available');
      } catch (err) {
        // Silent — next interval tick will retry automatically.
      }
    };

    sendLocation();
    intervalRef.current = setInterval(sendLocation, LOCATION_UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ── Poll for an assigned trip (dispatched / en_route) ──
  useEffect(() => {
    const checkForTrip = async () => {
      try {
        const { data } = await tripsApi.getAll({});
        const trips = data.trips || [];

        // A 'dispatched' trip the driver hasn't accepted/rejected yet —
        // show the Accept/Reject popup instead of surfacing it as active.
        const unconfirmed = trips.find(t => t.status === 'dispatched' && !t.driverConfirmed);
        if (unconfirmed) {
          const key = `${unconfirmed._id}-${unconfirmed.dispatchedAt}`;
          if (promptedTripKeyRef.current !== key) {
            promptedTripKeyRef.current = key;
            navigation.navigate('TripAssigned', { trip: unconfirmed });
          }
          return;
        }

        const trip = trips.find(t => (t.status === 'dispatched' && t.driverConfirmed) || t.status === 'en_route');
        setActiveTrip(trip || null);
      } catch (err) {
        // Silent — next interval tick will retry automatically.
      }
    };

    checkForTrip();
    tripIntervalRef.current = setInterval(checkForTrip, TRIP_POLL_INTERVAL_MS);

    return () => {
      if (tripIntervalRef.current) clearInterval(tripIntervalRef.current);
    };
  }, []);

  // ── Trip just accepted on TripAssignedScreen — show it as active
  //    immediately instead of waiting for the next poll tick. ──
  useEffect(() => {
    const confirmedTrip = route?.params?.confirmedTrip;
    if (confirmedTrip) {
      setActiveTrip(confirmedTrip);
      navigation.setParams({ confirmedTrip: undefined });
    }
  }, [route?.params?.confirmedTrip]);

  const startTrip = async () => {
    if (!activeTrip) return;
    setStartingTrip(true);
    try {
      await tripsApi.updateStatus(activeTrip._id, 'en_route');
      setActiveTrip({ ...activeTrip, status: 'en_route' });
      Alert.alert('Trip Started', 'Safe driving! Patient/hospital ge navigate maadi.');
    } catch (err) {
      Alert.alert('Error', 'Trip start maadalu aagalilla. Wapas try maadi.');
    } finally {
      setStartingTrip(false);
    }
  };

  const verifyOtp = async () => {
    if (!activeTrip || otpInput.length !== 4) {
      Alert.alert('Sari illa', '4-digit OTP haaki.');
      return;
    }
    setVerifyingOtp(true);
    try {
      await tripsApi.verifyOtp(activeTrip._id, otpInput);
      setActiveTrip({ ...activeTrip, pickupVerified: true });
      setOtpInput('');
      Alert.alert('✅ Verified', 'Patient pickup confirm aaytu!');
    } catch (err) {
      const msg = err?.response?.data?.message || 'OTP sari illa. Wapas try maadi.';
      Alert.alert('Error', msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const completeTrip = () => {
    if (!activeTrip) return;
    Alert.alert(
      'Trip Complete maadu?',
      'Hospital ge patient drop aaythaa? Idannu maadidmele trip close aagatte, bill generate aagatte.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Complete',
          onPress: async () => {
            setCompletingTrip(true);
            try {
              await tripsApi.complete(activeTrip._id, {});
              setActiveTrip(null);
              Alert.alert('🎉 Trip Completed', 'Bill generate aagide. Munde trip ge ready aagi.');
            } catch (err) {
              const msg = err?.response?.data?.message || 'Trip complete maadalu aagalilla.';
              Alert.alert('Error', msg);
            } finally {
              setCompletingTrip(false);
            }
          },
        },
      ]
    );
  };

  const recenter = () => {
    if (driverLoc && mapRef.current) {
      mapRef.current.animateToRegion(
        { ...driverLoc, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        500
      );
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        region={region}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingTxt}>Loading map...</Text>
        </View>
      )}

      {errorMsg && !loading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTxt}>{errorMsg}</Text>
        </View>
      )}

      <View style={styles.topBar}>
        <View style={styles.topBarCard}>
          <View>
            <Text style={styles.welcome}>Hello, {user?.name}!</Text>
            <Text style={styles.role}>Driver</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutTxt}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dutyCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dutyLabel}>{onDuty ? '🟢 ON DUTY' : '⚪ OFF DUTY'}</Text>
            {!onDuty && !checksLoading && failingChecks.length > 0 && (
              <Text style={styles.dutyWarn} numberOfLines={2}>
                Needs: {failingChecks.map(k => DUTY_CHECK_LABELS[k]).join(', ')}
              </Text>
            )}
          </View>
          {dutyLoading || checksLoading ? (
            <ActivityIndicator color="#10b981" />
          ) : (
            <Switch
              value={onDuty}
              onValueChange={handleToggleDuty}
              disabled={!onDuty && !allChecksPassed}
              trackColor={{ false: '#374151', true: '#10b981' }}
              thumbColor="#fff"
            />
          )}
        </View>
      </View>

      <TouchableOpacity style={[styles.recenterBtn, activeTrip && { bottom: 380 }]} onPress={recenter}>
        <Text style={styles.recenterIcon}>📍</Text>
      </TouchableOpacity>

      {activeTrip && (
        <ScrollView style={styles.tripCard} contentContainerStyle={styles.tripCardContent}>
          <View style={styles.tripHeader}>
            <Text style={styles.tripHeaderTxt}>
              {activeTrip.status === 'en_route' ? '🚑 Trip In Progress' : '✅ Trip Accepted'}
            </Text>
          </View>

          <Text style={styles.patientName}>{activeTrip.patientName}</Text>
          {activeTrip.patientPhone && activeTrip.patientPhone !== 'N/A' && (
            <Text style={styles.patientPhone}>📞 {activeTrip.patientPhone}</Text>
          )}

          <View style={styles.tripRow}>
            <Text style={styles.tripLabel}>📍 Pickup</Text>
            <Text style={styles.tripValue}>{activeTrip.pickup?.address || '—'}</Text>
          </View>

          {activeTrip.dropHospital?.name && (
            <View style={styles.tripRow}>
              <Text style={styles.tripLabel}>🏥 Drop</Text>
              <Text style={styles.tripValue}>{activeTrip.dropHospital.name}</Text>
            </View>
          )}
          {!activeTrip.dropHospital?.name && activeTrip.dropAddress && (
            <View style={styles.tripRow}>
              <Text style={styles.tripLabel}>🏁 Drop</Text>
              <Text style={styles.tripValue}>{activeTrip.dropAddress}</Text>
            </View>
          )}

          <View style={styles.tripRow}>
            <Text style={styles.tripLabel}>💰 Fare</Text>
            <Text style={styles.tripValue}>₹{activeTrip.baseFare || 0}</Text>
          </View>

          {activeTrip.status === 'dispatched' && (
            <TouchableOpacity
              style={styles.startBtn}
              onPress={startTrip}
              disabled={startingTrip}
            >
              <Text style={styles.startBtnTxt}>
                {startingTrip ? 'Starting...' : '▶ Trip Started'}
              </Text>
            </TouchableOpacity>
          )}

          {activeTrip.status === 'en_route' && !activeTrip.pickupVerified && (
            <View style={styles.otpSection}>
              <Text style={styles.otpLabel}>Patient hattira iruva 4-digit OTP haaki:</Text>
              <View style={styles.otpRow}>
                <TextInput
                  style={styles.otpInput}
                  value={otpInput}
                  onChangeText={(t) => setOtpInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="0000"
                  placeholderTextColor="#4b5563"
                  keyboardType="number-pad"
                  maxLength={4}
                />
                <TouchableOpacity
                  style={[styles.verifyBtn, otpInput.length !== 4 && styles.verifyBtnDisabled]}
                  onPress={verifyOtp}
                  disabled={verifyingOtp || otpInput.length !== 4}
                >
                  <Text style={styles.verifyBtnTxt}>
                    {verifyingOtp ? '...' : 'Verify'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTrip.status === 'en_route' && activeTrip.pickupVerified && (
            <>
              <View style={styles.inProgressBadge}>
                <Text style={styles.inProgressTxt}>✅ Pickup Verified — En Route to hospital</Text>
              </View>
              <TouchableOpacity
                style={styles.completeBtn}
                onPress={completeTrip}
                disabled={completingTrip}
              >
                <Text style={styles.completeBtnTxt}>
                  {completingTrip ? 'Completing...' : '🏁 Trip Completed'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}

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

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,15,30,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: { color: '#fff', marginTop: 12, fontSize: 15 },

  errorBanner: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    backgroundColor: '#ef4444',
    padding: 12,
    borderRadius: 10,
  },
  errorTxt: { color: '#fff', fontSize: 13, textAlign: 'center' },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 44, paddingHorizontal: 16 },
  topBarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(17,24,39,0.92)',
    padding: 14,
    borderRadius: 14,
  },
  welcome: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  role: { color: '#10b981', fontSize: 13, marginTop: 2 },
  logoutBtn: { backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  logoutTxt: { color: '#fff', fontWeight: 'bold' },

  dutyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(17,24,39,0.92)',
    padding: 14,
    borderRadius: 14,
    marginTop: 10,
  },
  dutyLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  dutyWarn: { color: '#f59e0b', fontSize: 11, marginTop: 3, lineHeight: 15 },

  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 110,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  recenterIcon: { fontSize: 22 },

  tripCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    maxHeight: 400,
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tripCardContent: { padding: 18 },
  tripHeader: { marginBottom: 8 },
  tripHeaderTxt: { color: '#3b82f6', fontSize: 13, fontWeight: '700' },
  patientName: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  patientPhone: { color: '#9ca3af', fontSize: 13, marginTop: 2, marginBottom: 10 },

  tripRow: { marginBottom: 8 },
  tripLabel: { color: '#6b7280', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  tripValue: { color: '#e5e7eb', fontSize: 14 },

  startBtn: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  startBtnTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  otpSection: { marginTop: 12 },
  otpLabel: { color: '#9ca3af', fontSize: 13, marginBottom: 8 },
  otpRow: { flexDirection: 'row', gap: 10 },
  otpInput: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 8,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  verifyBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBtnDisabled: { backgroundColor: '#374151' },
  verifyBtnTxt: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  inProgressBadge: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  inProgressTxt: { color: '#10b981', fontSize: 14, fontWeight: '700' },

  completeBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  completeBtnTxt: { color: '#0a0f1e', fontSize: 16, fontWeight: 'bold' },

  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
    paddingBottom: 22,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navIcon: { fontSize: 20, opacity: 0.45 },
  navIconActive: { fontSize: 20 },
  navLabel: { color: '#6b7280', fontSize: 10, fontWeight: '600' },
  navLabelActive: { color: '#10b981', fontSize: 10, fontWeight: '700' },
});