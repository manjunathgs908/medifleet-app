import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { acceptTrip, rejectTrip } from '../../utils/tripResponse';
import { getRouteInfo } from '../../utils/routeUtils';
import SlideToAccept from '../../components/SlideToAccept';
import * as TripCall from 'trip-call';

// Same formatter as TripAssignedScreen.js — selectedType is a raw Pricing
// serviceType id with no label table anywhere in the app/backend.
function formatAmbulanceType(selectedType) {
  if (!selectedType) return 'AMBULANCE';
  const words = String(selectedType).split(/[-_\s]+/).filter(Boolean);
  if (words.length === 1 && words[0].length <= 4) return words[0].toUpperCase();
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Display-only countdown, purely cosmetic — the actual ring timeout is
// owned and enforced natively (modules/trip-call's TripConnection.kt,
// RING_TIMEOUT_MS). No shared constant between Kotlin and JS in this
// codebase, so these two values have to be kept in sync by hand; if they
// ever drift, the native timeout (authoritative) still fires onCallEnded
// correctly, this number would just reach zero slightly early or late.
const RING_TIMEOUT_SECONDS = 60;
const URGENT_THRESHOLD_SECONDS = 15;

// Centers on the midpoint of driver + pickup with padding around whichever
// is further apart — same "just big enough to show both" approach as
// DriverDashboard's own map region, minus its ref/fitToCoordinates timing
// dance, since this screen only ever needs a static, non-interactive view.
function regionForPoints(a, b) {
  const latitudeDelta = Math.max(0.01, Math.abs(a.latitude - b.latitude) * 1.8);
  const longitudeDelta = Math.max(0.01, Math.abs(a.longitude - b.longitude) * 1.8);
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}

/**
 * Ola-style full-screen incoming-trip card — reached via the full-screen
 * push path (index.js's FCM background handler displays a notification
 * with android.fullScreenAction; App.js's getInitialNotification/
 * onForegroundEvent wiring routes here on press/launch). Deliberately a
 * separate screen from TripAssignedScreen.js (different trigger, different
 * data shape — this one gets a flat string-only payload straight from the
 * FCM data message, not a full Trip document), but ACCEPT/REJECT call the
 * exact same acceptTrip/rejectTrip helpers TripAssignedScreen.js uses —
 * one implementation of that behavior, not two.
 */
export default function IncomingTripScreen({ navigation, route }) {
  const {
    tripId, tripNumber, patientName, pickupAddress, pickupLat, pickupLng,
    dropAddress, distanceKm, fare, selectedType,
  } = route.params || {};
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RING_TIMEOUT_SECONDS);
  const [driverLoc, setDriverLoc] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null); // { distanceKm, durationSec, coords }

  // pickupLat/pickupLng arrive as strings (FCM data payloads are string-only
  // — see utils/fcmService.js) and are empty strings, not absent, on an
  // older/test payload that predates this field. A missing/malformed
  // coordinate just means no map — the address text below still shows
  // regardless, same as before this feature existed.
  const pickupCoords = (() => {
    const lat = Number(pickupLat);
    const lng = Number(pickupLng);
    return pickupLat && pickupLng && !Number.isNaN(lat) && !Number.isNaN(lng)
      ? { latitude: lat, longitude: lng }
      : null;
  })();

  // Map/route are enhancements layered on top of the core accept/reject
  // flow, never allowed to block it — every failure path here is silent,
  // matching routeUtils.getRouteInfo's own "return null on any failure"
  // contract. Only checks the already-granted permission (this screen can
  // appear mid-ring on top of a locked/backgrounded app; firing a NEW
  // permission prompt here would be jarring, and every driver already has
  // to grant location during onboarding before they can go on duty at all).
  useEffect(() => {
    if (!pickupCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const from = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setDriverLoc(from);
        const info = await getRouteInfo(from, pickupCoords);
        if (!cancelled && info) setRouteInfo(info);
      } catch (err) {
        // Silent — see comment above.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ticks down purely for display — dismissal itself still happens via
  // the native timeout's onCallEnded('timeout') event below, not this
  // timer reaching zero. Per-mount (not keyed to tripId explicitly): each
  // stacked IncomingTripScreen instance is its own mount tied to one call
  // for its whole lifetime, so there's nothing to reset.
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Overlapping bookings push a new IncomingTripScreen on top rather than
  // replacing this one (see App.js's navigateToIncomingTrip) — so once
  // THIS call resolves, there may be another one still stacked underneath,
  // unresolved. Jumping straight to 'DriverDashboard' would skip right
  // past it. Go back to reveal it if it's there; otherwise fall through
  // to the dashboard exactly as before (and keep the confirmedTrip
  // fast-path — DriverDashboard reads it to show the accepted trip
  // immediately instead of waiting for its next poll tick, see its own
  // confirmedTrip effect).
  function dismissAfterResolution(params) {
    const state = navigation.getState();
    const stackedBelow = state.routes[state.routes.length - 2];
    if (stackedBelow?.name === 'IncomingTrip') {
      navigation.goBack();
    } else {
      navigation.replace('DriverDashboard', params);
    }
  }

  // The native Connection's own ring timeout (modules/trip-call) fires
  // independent of this screen — if the driver never taps a button, the OS
  // call ends on its own and this listener dismisses the card to match.
  // Doesn't fire for 'answered'/'rejected' from OUR OWN button taps below
  // (this screen has already navigated away by the time those resolve), so
  // no double-handling. eventTripId is checked against this screen's own
  // tripId — with calls possibly stacked, a DIFFERENT call timing out
  // must not dismiss this one.
  useEffect(() => {
    const sub = TripCall.addCallEndedListener(({ tripId: eventTripId, reason }) => {
      if (eventTripId !== tripId) return;
      if (reason === 'timeout') {
        dismissAfterResolution();
      }
    });
    return () => sub.remove();
  }, [navigation, tripId]);

  async function handleAccept() {
    setSubmitting(true);
    try {
      await TripCall.answerCall(tripId);
      const confirmedTrip = await acceptTrip(tripId);
      dismissAfterResolution({ confirmedTrip });
    } catch (e) {
      const msg = e.response?.data?.message || 'Could not confirm the trip. Please try again.';
      Alert.alert('Error', msg);
      setSubmitting(false);
    }
  }

  async function handleReject() {
    setSubmitting(true);
    try {
      await TripCall.rejectCall(tripId);
      await rejectTrip(tripId);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not decline the trip, but you can still go back.');
    } finally {
      setSubmitting(false);
      dismissAfterResolution();
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.badge}>🚨 NEW TRIP</Text>
        {!!tripNumber && <Text style={styles.tripNumber}>{tripNumber}</Text>}

        <Text style={[styles.countdown, secondsLeft <= URGENT_THRESHOLD_SECONDS && styles.countdownUrgent]}>
          {secondsLeft}
        </Text>

        {pickupCoords && driverLoc && (
          <View style={styles.mapContainer}>
            <MapView
              style={StyleSheet.absoluteFill}
              provider={PROVIDER_GOOGLE}
              region={regionForPoints(driverLoc, pickupCoords)}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              showsCompass={false}
              toolbarEnabled={false}
            >
              <Marker coordinate={driverLoc} anchor={{ x: 0.5, y: 0.5 }} flat>
                <View style={styles.driverMarker}>
                  <Text style={{ fontSize: 16 }}>🚑</Text>
                </View>
              </Marker>
              <Marker coordinate={pickupCoords} pinColor="#14B8A6" />
              {routeInfo?.coords?.length > 1 && (
                <Polyline coordinates={routeInfo.coords} strokeColor="#14B8A6" strokeWidth={4} />
              )}
            </MapView>
            {routeInfo && (
              <View style={styles.routeBadge}>
                <Text style={styles.routeBadgeText}>
                  {routeInfo.distanceKm.toFixed(1)} km
                  {routeInfo.durationSec != null ? `  ·  ${Math.max(1, Math.round(routeInfo.durationSec / 60))} min` : ''}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.typeChip}>
            <Text style={styles.typeChipTxt}>🚑 {formatAmbulanceType(selectedType)}</Text>
          </View>

          <Text style={styles.label}>Patient</Text>
          <Text style={styles.value}>{patientName || 'N/A'}</Text>

          <Text style={styles.label}>Pickup</Text>
          <Text style={styles.value}>{pickupAddress || 'N/A'}</Text>

          <Text style={styles.label}>Drop</Text>
          <Text style={styles.value}>{dropAddress || 'N/A'}</Text>

          <View style={styles.row2}>
            <View style={styles.col}>
              <Text style={styles.label}>Distance</Text>
              <Text style={styles.value}>{distanceKm ? `${distanceKm} km` : 'N/A'}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Fare</Text>
              <Text style={styles.fareValue}>{fare ? `₹${fare}` : 'N/A'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <SlideToAccept onAccept={handleAccept} disabled={submitting} />
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={handleReject}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.rejectBtnText}>✕ Reject</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  badge: {
    color: '#e8192c', fontSize: 24, fontWeight: '900', textAlign: 'center',
    letterSpacing: 1.5,
  },
  tripNumber: { color: '#9ca3af', fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 4, marginBottom: 16 },

  countdown: { color: '#14B8A6', fontSize: 60, fontWeight: '900', textAlign: 'center', marginTop: -8, marginBottom: 12 },
  countdownUrgent: { color: '#e8192c' },

  mapContainer: {
    height: 180, borderRadius: 20, overflow: 'hidden', marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(20,184,166,0.4)',
  },
  driverMarker: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#111827',
    borderWidth: 2, borderColor: '#14B8A6', alignItems: 'center', justifyContent: 'center',
  },
  routeBadge: {
    position: 'absolute', bottom: 10, alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.9)', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 18,
    borderWidth: 1, borderColor: 'rgba(20,184,166,0.5)',
  },
  routeBadgeText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  card: {
    backgroundColor: '#111827', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: 'rgba(232,25,44,0.35)', marginTop: 16,
  },
  typeChip: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(20,184,166,0.15)',
    borderWidth: 1, borderColor: 'rgba(20,184,166,0.4)',
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginBottom: 8,
  },
  typeChipTxt: { color: '#14B8A6', fontSize: 14, fontWeight: '800' },

  label: { color: '#9ca3af', fontSize: 13, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 4 },
  fareValue: { color: '#14B8A6', fontSize: 28, fontWeight: '900', marginTop: 4 },

  row2: { flexDirection: 'row', gap: 20, marginTop: 4 },
  col: { flex: 1 },

  // Slide-to-accept is the full-width primary action; Reject stays a
  // normal, smaller, secondary button below it — Ola/Uber-style weighting,
  // and it keeps the slide track wide enough for a meaningful drag distance.
  actionsContainer: { gap: 14, marginTop: 28 },
  rejectBtn: {
    backgroundColor: '#e8192c', paddingVertical: 16, borderRadius: 16, alignItems: 'center',
  },
  rejectBtnText: { color: '#fff', fontWeight: '900', fontSize: 17 },
});
