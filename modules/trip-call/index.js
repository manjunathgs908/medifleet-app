// modules/trip-call/index.js
// ============================================================
// JS surface for the native self-managed Android Telecom
// ConnectionService module. See android/src/main/java/com/medifleetapp/
// tripcall/ for the native side. iOS/web are unsupported no-ops — this
// entire feature is Android-only by nature (Telecom framework).
// ============================================================
import { Platform } from 'react-native';
import { requireNativeModule, LegacyEventEmitter } from 'expo-modules-core';

// Name("TripCall") in TripCallModule.kt — must match exactly.
const NativeTripCall = Platform.OS === 'android' ? requireNativeModule('TripCall') : null;
const emitter = NativeTripCall ? new LegacyEventEmitter(NativeTripCall) : null;

// One-time setup — safe to call every app start. Self-managed
// PhoneAccounts (unlike classic ConnectionManager accounts) don't need
// the user to manually enable them in Settings > Calling accounts;
// registerPhoneAccount() alone is sufficient. No-ops on non-Android.
export async function registerPhoneAccountAsync() {
  if (!NativeTripCall) return;
  await NativeTripCall.registerPhoneAccountAsync();
}

// Starts a self-managed incoming call for the given trip. `data` must be
// the same flat, all-string payload shape the full-screen notification
// path already uses (tripId, tripNumber, patientName, pickupAddress,
// dropAddress, distanceKm, fare, selectedType) — passed straight through
// as the ConnectionRequest's extras, and back out again on the
// 'onIncomingCall' event.
export async function startIncomingCall(data) {
  if (!NativeTripCall) return;
  await NativeTripCall.startIncomingCall(data || {});
}

// Tells the native Connection the driver accepted — stops ringing/
// vibration and moves the call to STATE_ACTIVE. Call this *in addition to*
// the existing acceptTrip() API call, not instead of it.
export async function answerCall() {
  if (!NativeTripCall) return;
  await NativeTripCall.answerCall();
}

// Tells the native Connection the driver declined — stops ringing/
// vibration and disconnects. Call this *in addition to* the existing
// rejectTrip() API call, not instead of it.
export async function rejectCall() {
  if (!NativeTripCall) return;
  await NativeTripCall.rejectCall();
}

// Cold-start fallback — reads the trip data TripConnectionService put on
// the launching Intent's extras when it started the app fresh (see
// TripCallModule.kt's getLaunchCallDataAsync). Returns null if the app
// wasn't launched via an incoming call. App.js reads this once at startup,
// same "read once at launch" shape as notifee.getInitialNotification().
export async function getLaunchCallDataAsync() {
  if (!NativeTripCall) return null;
  return await NativeTripCall.getLaunchCallDataAsync();
}

// Fired when the native ConnectionService creates a new incoming
// connection (i.e. startIncomingCall's request was accepted by the
// Telecom framework). event.data is the same flat payload passed to
// startIncomingCall.
export function addIncomingCallListener(listener) {
  if (!emitter) return { remove() {} };
  return emitter.addListener('onIncomingCall', listener);
}

// Fired when the native call ends for any reason not initiated by our own
// answerCall()/rejectCall() JS calls — currently just the 30s ring timeout
// (event.reason === 'timeout'), so JS can dismiss the incoming-call screen
// if the driver never responded. Also fires with reason 'answered' /
// 'rejected' as a mirror of the JS-initiated calls above, so a single
// listener can uniformly react to "the call is over" regardless of cause.
export function addCallEndedListener(listener) {
  if (!emitter) return { remove() {} };
  return emitter.addListener('onCallEnded', listener);
}
