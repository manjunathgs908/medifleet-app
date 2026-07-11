import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, AppState, Alert } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Updates from 'expo-updates';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import ChangePinScreen from './src/screens/ChangePinScreen';
import PermissionsScreen from './src/screens/PermissionsScreen';
import DriverDashboard from './src/screens/driver/DriverDashboard';
import BookingTripScreen from './src/screens/driver/BookingTripScreen';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { user, loading } = useAuth();

  // Phase 4 — permissions gate. Read-only checks here (no request calls);
  // PermissionsScreen itself does the requesting. permissionsConfirmed is
  // the escape hatch: once PermissionsScreen reports both granted via
  // onDone, this flips true immediately without waiting on these two
  // independent hook instances to re-poll on their own.
  const [permissionsConfirmed, setPermissionsConfirmed] = useState(false);
  const [cameraPermission] = useCameraPermissions();
  const [locationPermission] = Location.useForegroundPermissions();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0f1e' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (user.role === 'driver') {
    if (user.pinChangeRequired) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="ChangePin" component={ChangePinScreen} />
        </Stack.Navigator>
      );
    }

    const permissionsGranted =
      permissionsConfirmed || (cameraPermission?.granted && locationPermission?.granted);

    if (!permissionsGranted) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Permissions">
            {() => <PermissionsScreen onDone={() => setPermissionsConfirmed(true)} />}
          </Stack.Screen>
        </Stack.Navigator>
      );
    }

    // The map/live-tracking/booking-status-timeline workflow (TripAssigned,
    // Navigate, TripSummary) has been removed entirely — see DriverDashboard
    // and the deleted screen files. DriverDashboard and BookingTrip (already
    // a blank shell from an earlier removal) are the only driver routes
    // left, ready for a new workflow to be built later.
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="DriverDashboard" component={DriverDashboard} />
        <Stack.Screen name="BookingTrip" component={BookingTripScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TEMPORARY OTA DEBUG BUILD (Phase 9 investigation) — REMOVE AFTER DEBUGGING
// ────────────────────────────────────────────────────────────────────────
// Shows an on-screen Alert with the update-check debug info after every
// check completes, so this can be read directly off a real device without
// adb/logcat. Once the real cause is found, delete showOtaDebugAlert() and
// the calls to it, and restore the silent try/catch in checkAndApplyUpdate.
// ════════════════════════════════════════════════════════════════════════
function showOtaDebugAlert(debug, note, onOk) {
  const message =
    `Trigger: ${debug.trigger}\n` +
    `DEV: ${debug.dev}\n` +
    `Channel: ${debug.channel ?? 'n/a'}\n` +
    `Runtime: ${debug.runtimeVersion ?? 'n/a'}\n` +
    `Current updateId: ${debug.updateId ?? 'n/a'}\n` +
    `Update available: ${debug.isAvailable}\n` +
    `Error: ${debug.errorMessage || 'none'}` +
    (note ? `\n\n${note}` : '');

  Alert.alert(
    '🐞 OTA Debug — TEMPORARY, remove after debugging',
    message,
    onOk ? [{ text: 'OK', onPress: onOk }] : undefined
  );
}

// Applies an OTA update immediately (instead of waiting for the next cold
// start) whenever one is available — checked once on mount and again every
// time the app is foregrounded, since eas update was reportedly not always
// taking effect just from checkAutomatically:"ON_LOAD" + reopening the app.
async function checkAndApplyUpdate(trigger) {
  const debug = {
    trigger,
    dev: __DEV__,
    channel: null,
    runtimeVersion: null,
    updateId: null,
    isAvailable: false,
    errorMessage: null,
  };

  // expo-updates has no native module in Expo Go / dev mode — this mirrors
  // the guard already used in the sibling savelife-app's App.js.
  //
  // NOTE: Updates.isEmbeddedLaunch is deliberately NOT used as a skip
  // condition here. It's only true on the very first launch before any OTA
  // update has ever been applied — once one update has landed, every
  // subsequent normal launch runs from the update cache and reports
  // isEmbeddedLaunch:false. Gating on it would silently stop checking for
  // updates after the first successful one, which is the exact reliability
  // bug this change is meant to fix.
  if (__DEV__) {
    showOtaDebugAlert(debug, 'Skipped — __DEV__ is true (Expo Go / dev client).');
    return;
  }

  // Context that determines whether checkForUpdateAsync() can succeed at
  // all — a channel/runtimeVersion mismatch between this build and what
  // was published via `eas update` will make every check silently find
  // nothing, with no error, even though everything "looks" fine.
  debug.channel = Updates.channel;
  debug.runtimeVersion = Updates.runtimeVersion;
  debug.updateId = Updates.updateId;

  try {
    const result = await Updates.checkForUpdateAsync();
    debug.isAvailable = result.isAvailable;

    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      // Reload only after the user taps OK, so they actually get to read
      // the debug info before the app restarts — TEMPORARY behavior, not
      // the intended final "reload immediately" flow.
      showOtaDebugAlert(debug, 'Update fetched. Tap OK to reload now.', () => Updates.reloadAsync());
      return;
    }
  } catch (e) {
    // Previously: swallowed silently. Now surfaced on-screen so the real
    // failure reason (offline, no channel configured, manifest fetch
    // error, etc.) is actually visible instead of just "nothing happened."
    debug.errorMessage = e?.message || String(e);
  }

  showOtaDebugAlert(debug);
}

export default function App() {
  useEffect(() => {
    checkAndApplyUpdate('mount'); // also cover cold start, not just resume

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') checkAndApplyUpdate('foreground');
    });

    return () => subscription.remove();
  }, []);

  return (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}