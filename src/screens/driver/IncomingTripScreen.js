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
 *
 * Fixed-frame layout, not a single scrolling page — an emergency call
 * screen must fit without scrolling on a normal phone (a driver won't
 * scroll to find Accept). Only the trip-info block in the middle scrolls,
 * as a safety net for a very long address on a very small screen; the
 * header and the accept/reject controls stay pinned in place regardless.
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
  // timer reaching zero.
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
  // eventTripId is checked against this screen's own tripId — with calls
  // possibly stacked, a DIFFERENT call timing out must not dismiss this one.
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

  const isUrgent = secondsLeft <= URGENT_THRESHOLD_SECONDS;

  return (
    <View style={styles.container}>
      {/* Fixed header — badge, trip number, and countdown all on one line */}
      <View style={styles.header}>
        <Text style={styles.headerText} numberOfLines={1}>
          <Text style={styles.badge}>🚨 NEW TRIP</Text>
          {!!tripNumber && <Text style={styles.tripNumberInline}>  ·  {tripNumber}</Text>}
        </Text>
        <View style={[styles.countdownPill, isUrgent && styles.countdownPillUrgent]}>
          <Text style={[styles.countdownPillText, isUrgent && styles.countdownPillTextUrgent]}>
            {secondsLeft}
          </Text>
        </View>
      </View>

      {/* Fixed, compact map — ~22% of screen height */}
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
                <Text style={{ fontSize: 14 }}>🚑</Text>
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

      {/* Only this middle block scrolls, and only if it has to — a safety
          net for a long address on a small screen, not the primary layout
          mechanism. */}
      <ScrollView style={styles.infoScroll} contentContainerStyle={styles.infoContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.typeChip}>
            <Text style={styles.typeChipTxt}>🚑 {formatAmbulanceType(selectedType)}</Text>
          </View>

          <Text style={styles.label}>Patient</Text>
          <Text style={styles.value} numberOfLines={1}>{patientName || 'N/A'}</Text>

          <Text style={styles.label}>Pickup</Text>
          <Text style={styles.value} numberOfLines={2} ellipsizeMode="tail">{pickupAddress || 'N/A'}</Text>

          <Text style={styles.label}>Drop</Text>
          <Text style={styles.value} numberOfLines={2} ellipsizeMode="tail">{dropAddress || 'N/A'}</Text>

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
      </ScrollView>

      {/* Fixed, pinned bottom — always visible regardless of the info
          block's content length. */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingHorizontal: 20, paddingBottom: 10, gap: 10,
  },
  headerText: { flex: 1 },
  badge: { color: '#e8192c', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  tripNumberInline: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },

  countdownPill: {
    minWidth: 44, height: 44, borderRadius: 22, paddingHorizontal: 8,
    backgroundColor: 'rgba(20,184,166,0.15)', borderWidth: 2, borderColor: '#14B8A6',
    alignItems: 'center', justifyContent: 'center',
  },
  countdownPillUrgent: { backgroundColor: 'rgba(232,25,44,0.15)', borderColor: '#e8192c' },
  countdownPillText: { color: '#14B8A6', fontSize: 18, fontWeight: '900' },
  countdownPillTextUrgent: { color: '#e8192c' },

  mapContainer: {
    height: '22%', marginHorizontal: 20, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(20,184,166,0.4)',
  },
  driverMarker: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#111827',
    borderWidth: 2, borderColor: '#14B8A6', alignItems: 'center', justifyContent: 'center',
  },
  routeBadge: {
    position: 'absolute', bottom: 8, alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.9)', borderRadius: 16,
    paddingVertical: 5, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(20,184,166,0.5)',
  },
  routeBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  infoScroll: { flex: 1 },
  infoContent: { padding: 20, paddingBottom: 8 },

  card: {
    backgroundColor: '#111827', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(232,25,44,0.35)',
  },
  typeChip: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(20,184,166,0.15)',
    borderWidth: 1, borderColor: 'rgba(20,184,166,0.4)',
    borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12, marginBottom: 6,
  },
  typeChipTxt: { color: '#14B8A6', fontSize: 13, fontWeight: '800' },

  label: { color: '#9ca3af', fontSize: 11, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 2 },
  fareValue: { color: '#14B8A6', fontSize: 20, fontWeight: '900', marginTop: 2 },

  row2: { flexDirection: 'row', gap: 20, marginTop: 2 },
  col: { flex: 1 },

  actionsContainer: {
    gap: 10, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 22,
  },
  rejectBtn: {
    backgroundColor: '#e8192c', paddingVertical: 14, borderRadius: 16, alignItems: 'center',
  },
  rejectBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
