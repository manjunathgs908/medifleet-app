import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, AppState, Platform } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Updates from 'expo-updates';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import DeviceVerificationScreen from './src/screens/DeviceVerificationScreen';
import PermissionsScreen from './src/screens/PermissionsScreen';
import BatteryOptimizationScreen from './src/screens/BatteryOptimizationScreen';
import TermsScreen from './src/screens/TermsScreen';
import DriverProfileCheckScreen from './src/screens/DriverProfileCheckScreen';
import DriverDashboard from './src/screens/driver/DriverDashboard';
import BookingTripScreen from './src/screens/driver/BookingTripScreen';
import TripAssignedScreen from './src/screens/driver/TripAssignedScreen';
import UnbindDeviceScreen from './src/screens/owner/UnbindDeviceScreen';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { user, loading } = useAuth();

  // Full driver-onboarding flow (extends the Phase 4 permissions gate):
  // Welcome → Login(existing) → DeviceVerification → Permissions →
  // BatteryOptimization(Android) → Terms → DriverProfileCheck → Dashboard.
  // Each step is a one-time escape hatch for this app session,
  // same pattern as the original permissionsConfirmed flag below — once a
  // screen calls onDone, that step is skipped for the rest of the session.
  const [welcomeDone, setWelcomeDone] = useState(false);
  const [deviceVerified, setDeviceVerified] = useState(false);
  const [batteryOptDone, setBatteryOptDone] = useState(Platform.OS !== 'android');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [profileConfirmed, setProfileConfirmed] = useState(false);

  // Phase 4 — permissions gate. Read-only checks here (no request calls);
  // PermissionsScreen itself does the requesting. permissionsConfirmed is
  // the escape hatch: once PermissionsScreen reports all *required*
  // permissions granted via onDone, this flips true immediately without
  // waiting on these two independent hook instances to re-poll on their
  // own. Only camera+foreground location are re-checked here (not the
  // newer background-location/notifications/media-library permissions) —
  // DriverDashboard's own pre-"Go Online" gate re-verifies the full set
  // every time, so a permission revoked after onboarding is still caught
  // there even though this fast pre-check wouldn't catch it.
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
    if (!welcomeDone) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Welcome">
            {() => <WelcomeScreen onDone={() => setWelcomeDone(true)} />}
          </Stack.Screen>
        </Stack.Navigator>
      );
    }
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (user.role === 'driver') {
    if (!deviceVerified) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="DeviceVerification">
            {() => <DeviceVerificationScreen onDone={() => setDeviceVerified(true)} />}
          </Stack.Screen>
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

    if (!batteryOptDone) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="BatteryOptimization">
            {() => <BatteryOptimizationScreen onDone={() => setBatteryOptDone(true)} />}
          </Stack.Screen>
        </Stack.Navigator>
      );
    }

    if (!termsAccepted) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Terms">
            {() => <TermsScreen onDone={() => setTermsAccepted(true)} />}
          </Stack.Screen>
        </Stack.Navigator>
      );
    }

    if (!profileConfirmed) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="DriverProfileCheck">
            {() => <DriverProfileCheckScreen onDone={() => setProfileConfirmed(true)} />}
          </Stack.Screen>
        </Stack.Navigator>
      );
    }

    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="DriverDashboard" component={DriverDashboard} />
        <Stack.Screen name="BookingTrip" component={BookingTripScreen} />
        <Stack.Screen
          name="TripAssigned"
          component={TripAssignedScreen}
          options={{ presentation: 'modal', gestureEnabled: false }}
        />
      </Stack.Navigator>
    );
  }

  // Owner OTP login (fleet-Owner model) — minimal single-screen tool, no
  // onboarding gate needed. LoginScreen's Password tab was dropped when
  // driver login moved to phone+OTP; the phone+password flow (authApi.login,
  // role:'owner'/'telecaller' User-model staff) is still reachable via
  // AuthContext.login() if something calls it directly, but nothing on
  // this screen does anymore — only the dedicated Owner (OTP) tab reaches here.
  if (user.role === 'owner') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="UnbindDevice" component={UnbindDeviceScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

// Silently checks for and applies an OTA update — checked once on mount
// and again every time the app is foregrounded. No debug popups; failures
// are simply ignored (app continues on whatever version is already loaded).
async function checkAndApplyUpdate() {
  if (__DEV__) return;

  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch (e) {
    // Silently ignore — offline, no channel configured, etc.
  }
}

export default function App() {
  useEffect(() => {
    checkAndApplyUpdate();

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
