import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, AppState } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Updates from 'expo-updates';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import ChangePinScreen from './src/screens/ChangePinScreen';
import PermissionsScreen from './src/screens/PermissionsScreen';
import DriverDashboard from './src/screens/driver/DriverDashboard';
import TripAssignedScreen from './src/screens/driver/TripAssignedScreen';
import NavigateScreen from './src/screens/driver/NavigateScreen';
import BookingTripScreen from './src/screens/driver/BookingTripScreen';
import TripSummaryScreen from './src/screens/driver/TripSummaryScreen';

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

    // Phase 5 — the driver flow is now a real nested stack (DriverDashboard,
    // TripAssigned, Navigate, BookingTrip, TripSummary) instead of
    // DriverDashboard hand-rolling BookingTripScreen as a conditionally
    // rendered component (the exact issue PROJECT_REPORT.md flagged).
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="DriverDashboard" component={DriverDashboard} />
        <Stack.Screen
          name="TripAssigned"
          component={TripAssignedScreen}
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="Navigate" component={NavigateScreen} />
        <Stack.Screen name="BookingTrip" component={BookingTripScreen} />
        <Stack.Screen name="TripSummary" component={TripSummaryScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

// Applies an OTA update immediately (instead of waiting for the next cold
// start) whenever one is available — checked once on mount and again every
// time the app is foregrounded, since eas update was reportedly not always
// taking effect just from checkAutomatically:"ON_LOAD" + reopening the app.
async function checkAndApplyUpdate() {
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
  if (__DEV__) return;
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync(); // reboots the JS bundle — never returns
    }
  } catch {
    // Offline, no update channel configured, etc — fail silently.
  }
}

export default function App() {
  useEffect(() => {
    checkAndApplyUpdate(); // also cover cold start, not just resume

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') checkAndApplyUpdate();
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