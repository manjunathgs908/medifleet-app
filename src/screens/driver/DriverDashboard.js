import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, TextInput, Switch, Platform, Modal, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Updates from 'expo-updates';
import { BatteryOptEnabled } from 'react-native-battery-optimization-check';
import { useAuth } from '../../context/AuthContext';
import { driverAuthApi, tripsApi, assignmentsApi, authApi, sosApi } from '../../api/client';
import { getDeviceId, checkInternet } from '../../utils/device';
import { getRouteInfo } from '../../utils/routeUtils';
import { getCachedPushToken, refreshPushToken } from '../../utils/pushToken';

// e.g. "bls_tempo" -> "BLS TEMPO", "dead-body" -> "DEAD BODY" — same
// word-splitting TripAssignedScreen.js's formatAmbulanceType uses,
// uppercased to match the header badge style.
function formatAmbulanceBadge(selectedType) {
  if (!selectedType) return 'AMBULANCE';
  return String(selectedType).split(/[-_\s]+/).filter(Boolean).join(' ').toUpperCase();
}

// Must match AuthContext.js's own OWNER_BACKUP_KEY — that's where
// startDutyAsOwner backs up the owner's tokens while this driver session
// is active, and where they stay until end-duty restores them.
const OWNER_BACKUP_KEY = 'ownerBackupSession';

// Every check the driver must pass before the ON DUTY toggle is enabled.
// Keys match the `checks` state object below 1:1 so failing ones can be
// listed by label without a separate lookup table drifting out of sync.
const DUTY_CHECK_LABELS = {
  gps: 'GPS enabled',
  internet: 'Internet connected',
  backgroundLocation: 'Background location granted',
  batteryOk: 'Battery optimization disabled',
  approved: 'Driver approved',
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
// A push token can change over time (Expo's own docs) — re-checked
// periodically rather than fetched once and assumed permanent. Far less
// frequent than the location loop; there's no need to hit Expo's token
// endpoint every 10s.
const PUSH_TOKEN_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

// GPS-proximity gate for "Reached Pickup"/"Reached Hospital" — a UI
// convenience only (never used for fare/billing, which stays server-side
// on verified road distance). PROXIMITY_METERS is how close the driver
// must be for the button to appear; GPS_STALE_MS is the safety override —
// if no GPS fix has landed in that long, show the button anyway rather
// than leaving the driver stuck.
const PROXIMITY_METERS = 100;
const GPS_STALE_MS = 2 * 60 * 1000;

// Straight-line distance between two GPS fixes — same formula used
// server-side and in the customer app, kept local here (no shared util
// package between apps) so distance can be accumulated client-side
// tick-by-tick while en_route, without waiting on a round trip to the API.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DriverDashboard({ navigation, route }) {
  const { user, restoreOwnerSession } = useAuth();

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
  // Timestamp of the last real GPS fix — the safety override for the
  // proximity gate below reads this: if GPS goes stale, never leave the
  // driver stuck with no button.
  const [driverLocUpdatedAt, setDriverLocUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [activeTrip, setActiveTrip] = useState(null);
  const activeTripRef = useRef(null); // mirrors activeTrip for the GPS-loop effect below (which has [] deps, so it can't read state directly without going stale)

  // Driver -> current-leg route line on the active-trip map (pickup before
  // OTP verification, drop after — drop only draws when the trip actually
  // has dropLat/dropLng, which is now persisted by the backend but still
  // optional: older trips or an un-updated client may not have it).
  const [routeCoords, setRouteCoords] = useState([]);
  const lastRouteOriginRef = useRef(null); // throttle re-fetch to real movement, not every 10s GPS ping
  const routeTargetLegRef = useRef(null); // 'pickup' | 'drop' | null — detects a leg switch so the throttle above doesn't wrongly suppress the first fetch for the new target

  const [arrivingPickup, setArrivingPickup] = useState(false);

  const [otpInput, setOtpInput] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const [markingReachedHospital, setMarkingReachedHospital] = useState(false);
  const [startingReturn, setStartingReturn] = useState(false);
  const [callingCustomer, setCallingCustomer] = useState(false);

  const [completingTrip, setCompletingTrip] = useState(false);

  // ── Actual-distance accumulation while en_route (Step C) ──
  const distanceAccumRef = useRef(0);
  const lastFixRef        = useRef(null);

  // ── ON DUTY toggle + pre-go-online gate ──
  const [profile, setProfile] = useState(user);
  const [onDuty, setOnDuty] = useState(false);
  const onDutyRef = useRef(false); // mirrors onDuty for the GPS-loop effect below ([] deps, would otherwise see a stale value)
  const [activeAmbulance, setActiveAmbulance] = useState(null); // Phase 4 — which ambulance was picked at start-duty
  const [dutyLoading, setDutyLoading] = useState(false);
  const [checks, setChecks] = useState({});
  const [checksLoading, setChecksLoading] = useState(true);

  // ── "My Fleet" quick-check (owner-driving-self only) ──
  const [fleetModalOpen, setFleetModalOpen] = useState(false);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetData, setFleetData] = useState(null);
  const [fleetError, setFleetError] = useState(null);

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
      // approvalStatus is the one gate for duty — an owner approving a
      // driver is the actual decision point (documents inform it, same as
      // the server enforces at start-duty); re-checking driverDocuments
      // here too was redundant and wrongly blocked already-approved
      // drivers whose documents field is empty (e.g. DRV-001, created
      // before this onboarding flow existed).
      approved: freshUser?.approvalStatus === 'approved',
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
  // than assuming off-duty on every cold start. Also picks up which
  // ambulance is currently assigned (Phase 4), so a killed-and-reopened
  // app still shows it without needing to re-pick.
  const refreshActiveShift = async () => {
    try {
      const { data } = await assignmentsApi.getMyActiveShift();
      setOnDuty(!!data?.shift);
      setActiveAmbulance(data?.ambulance || null);
    } catch (err) {
      // Silent — toggle just defaults to off; driver can still try to go online.
    }
  };

  useEffect(() => {
    refreshActiveShift();
  }, []);

  // AmbulancePickerScreen navigates back here with dutyStarted:true after
  // a successful start-duty — same pattern as confirmedTrip below.
  useEffect(() => {
    if (route?.params?.dutyStarted) {
      refreshActiveShift();
      navigation.setParams({ dutyStarted: undefined });
    }
  }, [route?.params?.dutyStarted]);

  const failingChecks = Object.keys(DUTY_CHECK_LABELS).filter(k => checks[k] === false);
  const allChecksPassed = !checksLoading && failingChecks.length === 0;

  async function handleToggleDuty() {
    if (onDuty) {
      setDutyLoading(true);
      try {
        await assignmentsApi.endDuty(driverLoc?.latitude, driverLoc?.longitude);
        if (user?.isOwnerSelf) {
          // This "driver" is actually the owner acting as themselves —
          // swap back to their real owner session instead of staying in
          // the driver flow off-duty with nothing to do.
          await restoreOwnerSession();
          return;
        }
        setOnDuty(false);
        setActiveAmbulance(null);
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

    // Phase 4 — a driver isn't fixed to one ambulance; they pick from
    // whichever of their owner's ambulances are free right now.
    navigation.navigate('AmbulancePicker', {
      lat: driverLoc?.latitude,
      lng: driverLoc?.longitude,
    });
  }

  // ── Get initial location + start map ──
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) {
            setErrorMsg('Location permission is required. Please allow it in Settings.');
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
          setDriverLocUpdatedAt(Date.now());
          setRegion({
            ...coords,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setErrorMsg('Could not get your location. Check that GPS is turned on.');
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Keep the GPS-loop effect (mounted once, [] deps) able to see the
  // latest activeTrip/onDuty without re-subscribing the interval every update.
  useEffect(() => {
    activeTripRef.current = activeTrip;
  }, [activeTrip]);

  useEffect(() => {
    onDutyRef.current = onDuty;
  }, [onDuty]);

  // Push token — best-effort, independent of the location loop below (never
  // awaited by it, never blocks it). Fetched once on mount and re-checked
  // every 30 min since a token can change over time. Permission-denied /
  // no-network / Expo-service-down all no-op silently inside
  // refreshPushToken() itself — nothing here needs its own error handling.
  useEffect(() => {
    refreshPushToken();
    const pushTokenInterval = setInterval(refreshPushToken, PUSH_TOKEN_REFRESH_INTERVAL_MS);
    return () => clearInterval(pushTokenInterval);
  }, []);

  // ── Send location to backend every 10 seconds; also accumulate actual
  //    distance travelled while a trip is en_route (Step C) ──
  useEffect(() => {
    const sendLocation = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const { latitude, longitude } = loc.coords;

        setDriverLoc({ latitude, longitude });
        setDriverLocUpdatedAt(Date.now());

        if (activeTripRef.current?.status === 'en_route') {
          if (lastFixRef.current) {
            distanceAccumRef.current += haversineKm(
              lastFixRef.current.latitude, lastFixRef.current.longitude,
              latitude, longitude
            );
          }
          lastFixRef.current = { latitude, longitude };
        } else {
          // Not en_route (idle/dispatched/between trips) — drop the last fix
          // so we don't measure a jump across dead time as travelled distance.
          lastFixRef.current = null;
        }

        // Phase 6A — this used to hardcode 'available' regardless of real
        // state; the owner dashboard (and the CRM's existing Leaflet map,
        // which already reads this same field for marker color) both need
        // it to actually reflect reality. activeTrip is non-null for both
        // 'dispatched' (accepted) and 'en_route' — the backend itself
        // already writes 'on_trip' at the moment of dispatch
        // (assignTripToVehicle), so matching that here (not just
        // 'en_route') avoids the very next 10s ping flipping it back to
        // 'available' before the driver even taps "Trip Started".
        const liveStatus = activeTripRef.current
          ? 'on_trip'
          : (onDutyRef.current ? 'available' : 'offline');
        await driverAuthApi.updateLocation(latitude, longitude, liveStatus, getCachedPushToken());
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

        let trip = trips.find(t => (t.status === 'dispatched' && t.driverConfirmed) || t.status === 'en_route');

        // Self-heal: accepting a trip auto-advances it to 'en_route' (see
        // TripAssignedScreen's handleAccept) — there's no "Trip Started"
        // button anymore for the driver to fall back on. If that one-shot
        // call didn't land, a trip can be found here still sitting at
        // 'dispatched' (accepted, confirmed, just not yet advanced) —
        // retry the same transition every poll tick until it succeeds.
        if (trip && trip.status === 'dispatched' && trip.driverConfirmed) {
          try {
            const { data: startedData } = await tripsApi.updateStatus(trip._id, 'en_route');
            trip = startedData.trip;
          } catch (startErr) {
            // Silent — next poll tick (still 'dispatched') retries again.
          }
        }

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

  // ── Driver -> current-leg route line for the active-trip map. Pickup
  //    before OTP verification, drop after. Throttled to real movement
  //    (300m), not every 10s GPS ping, to avoid hammering the backend's
  //    rate-limited /api/places/* endpoints. ──
  useEffect(() => {
    const leg = activeTrip?.pickupVerified ? 'drop' : 'pickup';
    const targetLat = leg === 'drop' ? activeTrip?.dropLat : activeTrip?.pickup?.lat;
    const targetLng = leg === 'drop' ? activeTrip?.dropLng : activeTrip?.pickup?.lng;

    if (!activeTrip || !driverLoc || targetLat == null || targetLng == null) {
      setRouteCoords([]);
      lastRouteOriginRef.current = null;
      routeTargetLegRef.current = null;
      return;
    }

    if (routeTargetLegRef.current !== leg) {
      // Leg just switched (pickup -> drop) or this is the first run for
      // it — force a fresh fetch regardless of how far the driver has
      // moved since the last one (that distance was toward a different
      // target).
      lastRouteOriginRef.current = null;
      routeTargetLegRef.current = leg;
    }

    const last = lastRouteOriginRef.current;
    if (last && haversineKm(last.latitude, last.longitude, driverLoc.latitude, driverLoc.longitude) < 0.3) return;

    lastRouteOriginRef.current = driverLoc;
    let cancelled = false;
    getRouteInfo(driverLoc, { latitude: targetLat, longitude: targetLng }).then((info) => {
      if (!cancelled && info) setRouteCoords(info.coords);
    });
    return () => { cancelled = true; };
  }, [activeTrip?._id, activeTrip?.pickupVerified, activeTrip?.dropLat, activeTrip?.dropLng, driverLoc]);

  const arrivePickup = async () => {
    if (!activeTrip) return;
    setArrivingPickup(true);
    try {
      const { data } = await tripsApi.arrivePickup(activeTrip._id);
      setActiveTrip({ ...activeTrip, arrivedAtPickupAt: data.arrivedAtPickupAt });
    } catch (err) {
      Alert.alert('Error', "Couldn't mark reached pickup. Please try again.");
    } finally {
      setArrivingPickup(false);
    }
  };

  const verifyOtp = async () => {
    if (!activeTrip || otpInput.length !== 4) {
      Alert.alert('Incomplete', 'Enter the 4-digit OTP.');
      return;
    }
    setVerifyingOtp(true);
    try {
      await tripsApi.verifyOtp(activeTrip._id, otpInput);
      setActiveTrip({ ...activeTrip, pickupVerified: true });
      setOtpInput('');
      Alert.alert('✅ Verified', 'Patient pickup confirmed!');
    } catch (err) {
      const msg = err?.response?.data?.message || 'Incorrect OTP. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const reachedHospital = async () => {
    if (!activeTrip) return;
    setMarkingReachedHospital(true);
    try {
      await tripsApi.reachedHospital(activeTrip._id, driverLoc?.latitude, driverLoc?.longitude);
      setActiveTrip({ ...activeTrip, reachedHospitalAt: new Date().toISOString() });
    } catch (err) {
      const msg = err?.response?.data?.message || "Couldn't mark reached hospital. Please try again.";
      Alert.alert('Error', msg);
    } finally {
      setMarkingReachedHospital(false);
    }
  };

  const startReturn = async () => {
    if (!activeTrip) return;
    setStartingReturn(true);
    try {
      await tripsApi.startReturn(activeTrip._id);
      setActiveTrip({ ...activeTrip, returnStartedAt: new Date().toISOString() });
    } catch (err) {
      const msg = err?.response?.data?.message || "Couldn't start the return trip. Please try again.";
      Alert.alert('Error', msg);
    } finally {
      setStartingReturn(false);
    }
  };

  // Masked calling via Exotel — backend no longer sends patientPhone to
  // drivers (see tripController.js:getTrips), so this places a masked
  // call through POST /api/call/connect instead of a tel: link.
  const callCustomer = async () => {
    if (!activeTrip) return;
    setCallingCustomer(true);
    try {
      await tripsApi.connectCall(activeTrip._id, 'driver');
      Alert.alert('Calling Customer', 'Your phone will ring shortly — answer it to connect.');
    } catch (err) {
      const msg = err?.response?.data?.message || "Couldn't connect the call. Please try again.";
      Alert.alert('Error', msg);
    } finally {
      setCallingCustomer(false);
    }
  };

  // SOS / emergency button — always visible while on duty (idle or mid-trip).
  // Safety rule: the phone call must always happen, even if GPS is
  // unavailable, the network is down, or the backend request fails. The
  // alert POST is fire-and-forget (not awaited) purely so a slow/failed
  // request can never delay dialling; no error UI on failure either, since
  // showing one would just get in the way of the call actually mattering.
  const fireSos = () => {
    sosApi.trigger(driverLoc?.latitude, driverLoc?.longitude, activeTrip?._id).catch(() => {});
    Linking.openURL('tel:112').catch(() => {});
  };

  const handleSosPress = () => {
    Alert.alert(
      'Emergency SOS',
      'Call 112 and alert the control room?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call 112', style: 'destructive', onPress: fireSos },
      ]
    );
  };

  const completeTrip = () => {
    if (!activeTrip) return;
    Alert.alert(
      'Complete Trip?',
      'Has the patient been dropped at the hospital? Once you confirm, the trip will close and the bill will be generated.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Complete',
          onPress: async () => {
            setCompletingTrip(true);
            try {
              await tripsApi.complete(activeTrip._id, {
                actualDistanceKm: Number(distanceAccumRef.current.toFixed(2)),
              });
              distanceAccumRef.current = 0;
              lastFixRef.current = null;
              setActiveTrip(null);
              Alert.alert('🎉 Trip Completed', 'Bill generated. Get ready for the next trip.');
            } catch (err) {
              const msg = err?.response?.data?.message || "Couldn't complete the trip.";
              Alert.alert('Error', msg);
            } finally {
              setCompletingTrip(false);
            }
          },
        },
      ]
    );
  };

  // Reads GET /assignments/fleet-status with the owner's own (backed-up)
  // token — a one-off direct read, not a session swap, so the active
  // driving session/duty/trip is completely undisturbed.
  const openFleetModal = async () => {
    setFleetModalOpen(true);
    setFleetLoading(true);
    setFleetError(null);
    try {
      const backupRaw = await AsyncStorage.getItem(OWNER_BACKUP_KEY);
      if (!backupRaw) throw new Error('No owner session found.');
      const backup = JSON.parse(backupRaw);
      const { data } = await assignmentsApi.getFleetStatusAsOwner(backup.accessToken);
      setFleetData(data.fleet || []);
    } catch (err) {
      setFleetError(err?.response?.data?.message || err.message || 'Could not load fleet status.');
    } finally {
      setFleetLoading(false);
    }
  };

  const recenter = () => {
    if (driverLoc && mapRef.current) {
      mapRef.current.animateToRegion(
        { ...driverLoc, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        500
      );
    }
  };

  // Turn-by-turn navigation to the current leg.
  //
  // Deliberately NOT the google.navigation: custom scheme — that's what
  // was causing Android's app-chooser to pop up. A custom scheme has no
  // single "owner": Android has to ask whenever more than one installed
  // app (Maps, Waze, a work-profile duplicate, etc.) registers a handler
  // for it. https://www.google.com/maps/dir/... is different: it's a
  // Google-verified Android App Link, so when Google Maps is installed,
  // ACTION_VIEW on this exact host+path routes straight to it with zero
  // chooser — that's the whole point of App Link verification, and it's
  // also how Google Maps registers its iOS Universal Link, so one URL
  // covers both platforms. If Maps isn't installed, the identical URL
  // just opens in the browser — no separate installed-check needed.
  //
  // (True package-pinning like Ola/Uber's native Intent.setPackage() was
  // considered — an intent://...#Intent;package=...;end URL — but RN's
  // Linking.openURL() on Android just does Uri.parse(url) + ACTION_VIEW
  // (see node_modules/react-native/.../IntentModule.kt); it never calls
  // Intent.parseUri(url, URI_INTENT_SCHEME), which is the only thing that
  // understands that syntax. That's a Chrome/WebView convention for <a
  // href> navigation, not a general Android ACTION_VIEW behavior, so an
  // intent:// URL passed to Linking.openURL fails outright — it doesn't
  // fall back to a chooser, it just doesn't open. Real package-pinning
  // needs a native module, e.g. expo-intent-launcher, which would need a
  // new EAS Build, not just an OTA update.)
  const openNavigation = async (lat, lng, address) => {
    const hasCoords = typeof lat === 'number' && typeof lng === 'number';
    if (!hasCoords && !address) return;
    try {
      const destination = hasCoords ? `${lat},${lng}` : encodeURIComponent(address);
      await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`);
    } catch (err) {
      Alert.alert('Error', "Couldn't open Maps.");
    }
  };

  // Before pickup OTP is verified: navigate to pickup (has real lat/lng on
  // every trip). After: navigate to drop — prefers the trip's real
  // dropLat/dropLng (now persisted server-side) and falls back to the
  // address/hospital-name text for older trips or an un-updated client
  // that don't have it, same pattern as the pickup branch. null when
  // there's nothing usable to navigate to (hidden in the JSX below).
  let navTarget = null;
  if (activeTrip) {
    if (!activeTrip.pickupVerified) {
      const lat = activeTrip.pickup?.lat;
      const lng = activeTrip.pickup?.lng;
      const address = activeTrip.pickup?.address;
      if ((typeof lat === 'number' && typeof lng === 'number') || address) {
        navTarget = { label: '🧭 Navigate to Pickup', lat, lng, address };
      }
    } else {
      const lat = activeTrip.dropLat;
      const lng = activeTrip.dropLng;
      const address = activeTrip.dropHospital?.name || activeTrip.dropAddress;
      if ((typeof lat === 'number' && typeof lng === 'number') || address) {
        navTarget = { label: '🧭 Navigate to Drop', lat, lng, address };
      }
    }
  }

  // Header badge + bottom-sheet location card — both flip on the same
  // pickupVerified toggle as navTarget above, so the whole screen reads as
  // one consistent "which leg am I on" state.
  const headingToPickup = !!activeTrip && !activeTrip.pickupVerified;
  const locationLabel = headingToPickup ? 'PICKUP LOCATION' : 'DROP LOCATION';
  const locationAddress = activeTrip
    ? (headingToPickup
        ? (activeTrip.pickup?.address || '—')
        : (activeTrip.dropHospital?.name || activeTrip.dropAddress || '—'))
    : '';

  // GPS-proximity gate for "Reached Pickup"/"Reached Hospital" (Ola/Uber-
  // style) — straight-line Haversine distance, deliberately: this is only
  // a UI convenience for when the button appears, never used for
  // fare/billing (that stays server-side on verified road distance, see
  // medifleet-backend's createTrip). Always resolves to "show the button"
  // (withinRange: true) rather than blocking the driver whenever:
  //  - the trip has no coordinate for this leg to check against, or
  //  - GPS hasn't produced a fix in over GPS_STALE_MS (safety override).
  const gpsIsStale = !driverLocUpdatedAt || (Date.now() - driverLocUpdatedAt) > GPS_STALE_MS;

  function proximityGate(targetLat, targetLng) {
    if (typeof targetLat !== 'number' || typeof targetLng !== 'number') {
      return { withinRange: true, distanceKm: null };
    }
    if (!driverLoc || gpsIsStale) {
      const distanceKm = driverLoc
        ? haversineKm(driverLoc.latitude, driverLoc.longitude, targetLat, targetLng)
        : null;
      return { withinRange: true, distanceKm };
    }
    const distanceKm = haversineKm(driverLoc.latitude, driverLoc.longitude, targetLat, targetLng);
    return { withinRange: distanceKm * 1000 <= PROXIMITY_METERS, distanceKm };
  }

  const pickupProximity = (activeTrip?.status === 'en_route' && !activeTrip.arrivedAtPickupAt)
    ? proximityGate(activeTrip.pickup?.lat, activeTrip.pickup?.lng)
    : null;

  // Uses the trip's real dropLat/dropLng when the backend has them
  // (persisted as of this pass). Falls back to "always show the button"
  // via proximityGate's own no-coordinate branch for older trips or an
  // un-updated client that don't have a drop coordinate yet.
  const hospitalProximity = (activeTrip?.status === 'en_route' && activeTrip.pickupVerified && !activeTrip.reachedHospitalAt)
    ? proximityGate(activeTrip.dropLat, activeTrip.dropLng)
    : null;

  const pickupStatusLine = pickupProximity && !pickupProximity.withinRange && pickupProximity.distanceKm != null
    ? `Head to pickup — ${pickupProximity.distanceKm.toFixed(1)} km away`
    : 'Heading to pickup...';

  const hospitalStatusLine = hospitalProximity && !hospitalProximity.withinRange && hospitalProximity.distanceKm != null
    ? `Heading to hospital — ${hospitalProximity.distanceKm.toFixed(1)} km away`
    : 'Heading to hospital...';

  // Trip Completed must not be reachable before the hospital step is
  // actually done — otherwise reachedHospitalAt (and, for round trips,
  // returnStartedAt) never gets set, the drop wait segment never opens,
  // and drop wait charges silently come out to zero. One-way trips need
  // reachedHospitalAt; round trips need returnStartedAt (keeps the
  // existing Reached Hospital -> Starting Return -> Complete order).
  // Doesn't touch Reached Hospital's own gating above (proximity/
  // no-coordinate/GPS-stale fallbacks all untouched) — once that button
  // is reachable and tapped, this gate opens on its own.
  const canCompleteTrip = activeTrip?.tripType === 'round_trip'
    ? !!activeTrip?.returnStartedAt
    : !!activeTrip?.reachedHospitalAt;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        region={region}
        showsUserLocation={!activeTrip}
        showsMyLocationButton={false}
        showsCompass={true}
      >
        {/* Custom marker instead of the native blue dot during an active
            trip, so it reads as "your ambulance" the same way Ola/Uber
            show the driver's own vehicle on their live map. */}
        {activeTrip && driverLoc && (
          <Marker coordinate={driverLoc} anchor={{ x: 0.5, y: 0.5 }} flat>
            <View style={styles.driverMarker}>
              <Text style={{ fontSize: 20 }}>🚑</Text>
            </View>
          </Marker>
        )}

        {activeTrip && headingToPickup && activeTrip.pickup?.lat != null && activeTrip.pickup?.lng != null && (
          <Marker
            coordinate={{ latitude: activeTrip.pickup.lat, longitude: activeTrip.pickup.lng }}
            title="Pickup"
            pinColor="#14B8A6"
          />
        )}

        {/* Drop pin — only draws when the trip actually has dropLat/dropLng
            (persisted by the backend now, but still optional: older trips
            or an un-updated client won't have it). The bottom sheet always
            switches to showing the drop address once pickupVerified
            regardless; this is just the map pin for it when a real
            coordinate exists. */}
        {activeTrip && !headingToPickup && activeTrip.dropLat != null && activeTrip.dropLng != null && (
          <Marker
            coordinate={{ latitude: activeTrip.dropLat, longitude: activeTrip.dropLng }}
            title="Drop"
            pinColor="#e8192c"
          />
        )}

        {activeTrip && routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor="#14B8A6" strokeWidth={4} />
        )}
      </MapView>

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

      {!activeTrip && (
        <View style={styles.topBar}>
          <View style={styles.topBarCard}>
            <View>
              <Text style={styles.welcome}>Hello, {user?.name}!</Text>
              <Text style={styles.role}>Driver</Text>
            </View>
            {user?.isOwnerSelf && (
              <TouchableOpacity style={styles.myFleetBtn} onPress={openFleetModal}>
                <Text style={styles.myFleetBtnTxt}>🚑 My Fleet</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.dutyCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dutyLabel}>{onDuty ? '🟢 ON DUTY' : '⚪ OFF DUTY'}</Text>
              {onDuty && activeAmbulance && (
                <Text style={styles.dutyAmbulance} numberOfLines={1}>
                  🚑 {activeAmbulance.registrationNumber} · {activeAmbulance.serviceTypeLabel || activeAmbulance.serviceType}
                </Text>
              )}
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
      )}

      <TouchableOpacity style={[styles.recenterBtn, activeTrip && styles.recenterBtnActiveTrip]} onPress={recenter}>
        <Text style={styles.recenterIcon}>📍</Text>
      </TouchableOpacity>

      {(onDuty || !!activeTrip) && (
        <TouchableOpacity style={[styles.sosBtn, activeTrip && styles.sosBtnActiveTrip]} onPress={handleSosPress}>
          <Text style={styles.sosBtnTxt}>SOS</Text>
        </TouchableOpacity>
      )}

      {activeTrip && (
        <View style={styles.activeHeader}>
          <Text style={styles.activeHeaderBadge}>
            {formatAmbulanceBadge(activeTrip.selectedType)} • {headingToPickup ? 'PICK UP' : 'DROP'}
          </Text>
          <Text style={styles.activeHeaderName}>{activeTrip.patientName}</Text>

          <TouchableOpacity
            style={[styles.headerCallBtn, callingCustomer && styles.headerCallBtnDisabled]}
            onPress={callCustomer}
            disabled={callingCustomer}
          >
            {callingCustomer
              ? <ActivityIndicator size="small" color="#14B8A6" />
              : <Text style={styles.headerCallIcon}>📞</Text>}
          </TouchableOpacity>
        </View>
      )}

      {activeTrip && (
        <View style={styles.activeBottomSheet}>
          <ScrollView contentContainerStyle={styles.activeBottomSheetContent} showsVerticalScrollIndicator={false}>
            <View style={styles.locationRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.locationLabel}>{locationLabel}</Text>
                <Text style={styles.locationAddress} numberOfLines={2}>{locationAddress}</Text>
              </View>

              {navTarget && (
                <TouchableOpacity
                  style={styles.navigateArrowBtn}
                  onPress={() => openNavigation(navTarget.lat, navTarget.lng, navTarget.address)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.navigateArrowIcon}>➤</Text>
                  <Text style={styles.navigateArrowLabel}>NAVIGATE</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Fare</Text>
              <Text style={styles.fareValue}>₹{activeTrip.baseFare || 0}</Text>
            </View>

            {/* Accepting a trip now auto-advances it straight to 'en_route'
                (see TripAssignedScreen's handleAccept + the poll-loop
                self-heal above) — this 'dispatched' window is normally
                just one brief moment, not a driver-facing step anymore. */}
            {activeTrip.status === 'dispatched' && (
              <View style={styles.proximityStatus}>
                <ActivityIndicator size="small" color="#14B8A6" />
                <Text style={styles.proximityStatusTxt}>Starting trip...</Text>
              </View>
            )}

            {activeTrip.status === 'en_route' && !activeTrip.arrivedAtPickupAt && (
              pickupProximity?.withinRange ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={arrivePickup} disabled={arrivingPickup}>
                  {arrivingPickup
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.primaryBtnTxt}>📍 Reached Pickup</Text>}
                </TouchableOpacity>
              ) : (
                <View style={styles.proximityStatus}>
                  <ActivityIndicator size="small" color="#14B8A6" />
                  <Text style={styles.proximityStatusTxt}>{pickupStatusLine}</Text>
                </View>
              )
            )}

            {activeTrip.status === 'en_route' && activeTrip.arrivedAtPickupAt && !activeTrip.pickupVerified && (
              <View style={styles.otpSection}>
                <Text style={styles.otpLabel}>Enter the 4-digit OTP from the patient:</Text>
                <View style={styles.otpRow}>
                  <TextInput
                    style={styles.otpInput}
                    value={otpInput}
                    onChangeText={(t) => setOtpInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
                    placeholder="0000"
                    placeholderTextColor="#9ca3af"
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

                {!activeTrip.reachedHospitalAt && (
                  hospitalProximity?.withinRange ? (
                    <TouchableOpacity style={styles.primaryBtn} onPress={reachedHospital} disabled={markingReachedHospital}>
                      {markingReachedHospital
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryBtnTxt}>🏥 Reached Hospital</Text>}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.proximityStatus}>
                      <ActivityIndicator size="small" color="#14B8A6" />
                      <Text style={styles.proximityStatusTxt}>{hospitalStatusLine}</Text>
                    </View>
                  )
                )}

                {activeTrip.reachedHospitalAt && activeTrip.tripType === 'round_trip' && !activeTrip.returnStartedAt && (
                  <TouchableOpacity style={styles.primaryBtn} onPress={startReturn} disabled={startingReturn}>
                    {startingReturn
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.primaryBtnTxt}>↩ Starting Return</Text>}
                  </TouchableOpacity>
                )}

                {canCompleteTrip && (
                  <TouchableOpacity style={styles.primaryBtn} onPress={completeTrip} disabled={completingTrip}>
                    {completingTrip
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.primaryBtnTxt}>🏁 Trip Completed</Text>}
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        </View>
      )}

      {!activeTrip && (
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
          <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('DriverProfile')}>
            <Text style={styles.navIcon}>👤</Text>
            <Text style={styles.navLabel}>Profile</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={fleetModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFleetModalOpen(false)}
      >
        <View style={styles.fleetModalOverlay}>
          <View style={styles.fleetModalCard}>
            <View style={styles.fleetModalHeader}>
              <Text style={styles.fleetModalTitle}>🚑 My Fleet</Text>
              <TouchableOpacity onPress={() => setFleetModalOpen(false)}>
                <Text style={styles.fleetModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {fleetLoading && (
              <ActivityIndicator color="#3b82f6" style={{ marginVertical: 20 }} />
            )}

            {!fleetLoading && fleetError && (
              <Text style={styles.fleetErrorTxt}>{fleetError}</Text>
            )}

            {!fleetLoading && !fleetError && (
              <ScrollView style={{ maxHeight: 360 }}>
                {(fleetData || []).length === 0 && (
                  <Text style={styles.fleetEmptyTxt}>No ambulances yet.</Text>
                )}
                {(fleetData || []).map((entry) => (
                  <View key={entry.ambulance.id} style={styles.fleetRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fleetReg}>{entry.ambulance.registrationNumber}</Text>
                      <Text style={styles.fleetDriver} numberOfLines={1}>
                        {entry.ambulance.assignedDriver?.name || 'Unassigned'}
                      </Text>
                      {entry.activeTrip && (
                        <Text style={styles.fleetTrip} numberOfLines={1}>
                          🚨 {entry.activeTrip.patientName} · {entry.activeTrip.status}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.fleetStatusTxt}>
                      {entry.ambulance.displayStatus === 'available' ? '🟢 Available'
                        : entry.ambulance.displayStatus === 'on_trip' ? '🟡 On Trip'
                        : entry.ambulance.displayStatus === 'maintenance' ? '🔧 Maintenance'
                        : '⚪ Off'}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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

  myFleetBtn: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
  },
  myFleetBtnTxt: { color: '#3b82f6', fontSize: 12, fontWeight: '700' },

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
  dutyAmbulance: { color: '#10b981', fontSize: 11.5, marginTop: 3, fontWeight: '600' },
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
  recenterBtnActiveTrip: { bottom: 380 },

  // Mirrors recenterBtn on the opposite edge — same bottom offsets, so it
  // never collides with the top header/duty card, the bottom nav/sheet, or
  // the recenter/call buttons on the right, in either idle or active-trip state.
  sosBtn: {
    position: 'absolute',
    left: 16,
    bottom: 110,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8192c',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  sosBtnActiveTrip: { bottom: 380 },
  sosBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  driverMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#14B8A6',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },

  // ── Active-trip header — white, centered, replaces the dark "Hello, X"
  //    topBar while a trip is in progress. ──
  activeHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  activeHeaderBadge: { color: '#14B8A6', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  activeHeaderName: { color: '#0F172A', fontSize: 20, fontWeight: '800', marginTop: 4 },
  headerCallBtn: {
    position: 'absolute',
    right: 16,
    top: 50,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(20,184,166,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(20,184,166,0.35)',
  },
  headerCallBtnDisabled: { opacity: 0.6 },
  headerCallIcon: { fontSize: 20 },

  // ── Active-trip bottom sheet — clean white card over the big map ──
  activeBottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: 360,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  activeBottomSheetContent: { padding: 20, paddingBottom: 28 },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationLabel: { color: '#14B8A6', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  locationAddress: { color: '#0F172A', fontSize: 16, fontWeight: '600', marginTop: 4, lineHeight: 21 },

  // Big thumb-reachable NAVIGATE button, right side of the location row —
  // reuses openNavigation(), same one-tap-no-chooser Google Maps behavior.
  navigateArrowBtn: {
    backgroundColor: '#14B8A6',
    borderRadius: 16,
    width: 76,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#14B8A6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  navigateArrowIcon: { color: '#fff', fontSize: 24, fontWeight: '900' },
  navigateArrowLabel: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },

  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  fareLabel: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  fareValue: { color: '#0F172A', fontSize: 18, fontWeight: '800' },

  // One consistent teal primary button for every trip-flow step (Start,
  // Reached Pickup, Reached Hospital, Starting Return, Trip Completed) —
  // same single-obvious-action look Ola uses, instead of the old design's
  // different color per step. Logic/conditions behind each are unchanged.
  primaryBtn: {
    backgroundColor: '#14B8A6',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 14,
    shadowColor: '#14B8A6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },

  // Shown instead of the primary action button while the driver is still
  // outside the GPS-proximity radius (or the transient 'dispatched' window
  // right after accepting) — same footprint as primaryBtn so nothing jumps.
  proximityStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  proximityStatusTxt: { color: '#475569', fontSize: 15, fontWeight: '600' },

  otpSection: { marginTop: 14 },
  otpLabel: { color: '#374151', fontSize: 14, marginBottom: 8, fontWeight: '600' },
  otpRow: { flexDirection: 'row', gap: 10 },
  otpInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#0F172A',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 8,
    textAlign: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  verifyBtn: {
    backgroundColor: '#14B8A6',
    borderRadius: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBtnDisabled: { backgroundColor: '#CBD5E1' },
  verifyBtnTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  inProgressBadge: {
    backgroundColor: 'rgba(20,184,166,0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(20,184,166,0.3)',
  },
  inProgressTxt: { color: '#0D9488', fontSize: 14, fontWeight: '700' },

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

  fleetModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  fleetModalCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  fleetModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  fleetModalTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  fleetModalClose: { color: '#9ca3af', fontSize: 18, padding: 4 },
  fleetErrorTxt: { color: '#ef4444', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  fleetEmptyTxt: { color: '#6b7280', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  fleetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  fleetReg: { color: '#fff', fontSize: 14, fontWeight: '700' },
  fleetDriver: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  fleetTrip: { color: '#f59e0b', fontSize: 11, marginTop: 3 },
  fleetStatusTxt: { color: '#e5e7eb', fontSize: 12, fontWeight: '600', marginLeft: 10 },
});