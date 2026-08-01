import React, { useState, useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, AppState, Platform } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';
import notifee, { EventType } from 'react-native-notify-kit';
import * as TripCall from 'trip-call';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BatteryOptEnabled } from 'react-native-battery-optimization-check';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import DeviceVerificationScreen from './src/screens/DeviceVerificationScreen';
import PermissionsScreen from './src/screens/PermissionsScreen';
import BatteryOptimizationScreen from './src/screens/BatteryOptimizationScreen';
import FullScreenIntentPermissionScreen from './src/screens/FullScreenIntentPermissionScreen';
import TermsScreen from './src/screens/TermsScreen';
import DriverProfileCheckScreen from './src/screens/DriverProfileCheckScreen';
import DriverOnboardingScreen from './src/screens/DriverOnboardingScreen';
import OwnerOnboardingScreen from './src/screens/OwnerOnboardingScreen';
import DriverDashboard from './src/screens/driver/DriverDashboard';
import DriverProfileScreen from './src/screens/driver/DriverProfileScreen';
import BookingTripScreen from './src/screens/driver/BookingTripScreen';
import TripAssignedScreen from './src/screens/driver/TripAssignedScreen';
import IncomingTripScreen from './src/screens/driver/IncomingTripScreen';
import AmbulancePickerScreen from './src/screens/driver/AmbulancePickerScreen';
import UnbindDeviceScreen from './src/screens/owner/UnbindDeviceScreen';
import OwnerHomeScreen from './src/screens/owner/OwnerHomeScreen';
import AddAmbulanceScreen from './src/screens/owner/AddAmbulanceScreen';
import MyAmbulancesScreen from './src/screens/owner/MyAmbulancesScreen';
import AmbulanceDetailScreen from './src/screens/owner/AmbulanceDetailScreen';
import MyDriversScreen from './src/screens/owner/MyDriversScreen';
import AddDriverScreen from './src/screens/owner/AddDriverScreen';
import OwnerDashboardScreen from './src/screens/owner/OwnerDashboardScreen';
import DriveAmbulanceScreen from './src/screens/owner/DriveAmbulanceScreen';
import OwnerTripDetailScreen from './src/screens/owner/OwnerTripDetailScreen';
import OwnerProfileScreen from './src/screens/owner/OwnerProfileScreen';

// Without this, a push received while the app is open/foregrounded is
// silently swallowed — expo-notifications shows nothing by default unless
// a handler is registered. Module-level (not inside a component) and set
// once, as early as possible, per Expo's own documented pattern.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Android notification channel — without this, Android delivers pushes on
// the default/low-importance channel, which Doze can defer until the
// screen turns back on (the exact "nothing arrives while asleep, all at
// once on wake" symptom this fixes). MAX importance + sound + vibration is
// what makes a heads-up notification actually interrupt whatever the
// driver is doing. channelId ('trip-alerts') must match what the backend
// sends in utils/pushService.js's sendPush — a mismatch silently falls
// back to the default channel even with priority:'high' set server-side.
// iOS has no channel concept; setNotificationChannelAsync resolves to a
// documented no-op there, so the Platform guard is for clarity, not safety.
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('trip-alerts', {
    name: 'Trip Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    enableLights: true,
    lightColor: '#e8192c',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
  });
}

const Stack = createNativeStackNavigator();

// Shared across every driver-branch navigator below (all onboarding gates
// AND the final full navigator) — not just the last one. A trip can arrive
// via FCM at any point while a driver is on duty, including while they're
// re-doing these one-time-per-session onboarding taps (e.g. after the app
// was backgrounded/killed and reopened — the server still has them on
// duty, but these client-side flags reset to false on every fresh
// session). Previously IncomingTrip only existed in the final navigator,
// so navigate('IncomingTrip', ...) silently failed
// ("NAVIGATE ... was not handled by any navigator") whenever a real trip
// arrived during onboarding — the driver never saw it.
const incomingTripScreen = (
  <Stack.Screen
    name="IncomingTrip"
    component={IncomingTripScreen}
    options={{ presentation: 'modal', gestureEnabled: false }}
  />
);

// Same reasoning as incomingTripScreen above — IncomingTripScreen's own
// handleAccept()/handleReject() navigate.replace('DriverDashboard', ...)
// once the trip response API call resolves, which needs a target to land
// on regardless of which gate the driver was mid-onboarding on.
const driverDashboardScreen = (
  <Stack.Screen name="DriverDashboard" component={DriverDashboard} />
);

// termsAccepted and profileConfirmed are pure one-time acknowledgements
// with no OS-level state to re-check — persisted per driver (keyed by _id)
// so an already-on-duty
// driver isn't forced through them again every time Vivo kills the app
// process and it restarts. permissionsConfirmed, batteryOptDone, and most
// of fullScreenIntentDone are deliberately NOT here: they're real OS
// permissions that can be granted, then later revoked (by the driver, or
// by Vivo's own aggressive permission auto-reset) — persisting a one-time
// "done" flag for those would go stale and skip a gate that should have
// re-appeared. Those three are instead re-checked against live OS state
// on every app start (see the effect in AppNavigator). The one exception:
// fullScreenIntentDone has no live-check API available anywhere in the
// currently installed dependencies (see FullScreenIntentPermissionScreen.js's
// own header comment — this was already investigated) — persisted here
// as a documented fallback, not a preference.
const PERSISTED_ONBOARDING_KEYS = ['termsAccepted', 'profileConfirmed', 'fullScreenIntentDone'];

function onboardingFlagsStorageKey(userId) {
  return `driverOnboardingFlags:${userId}`;
}

// Best-effort both ways — a failed read just means the driver re-taps
// through the gates once more (the pre-existing behavior), a failed write
// means the same on next restart. Never blocks the gates themselves.
async function loadOnboardingFlags(userId) {
  try {
    const raw = await AsyncStorage.getItem(onboardingFlagsStorageKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveOnboardingFlag(userId, key, value) {
  if (!userId || !PERSISTED_ONBOARDING_KEYS.includes(key)) return;
  try {
    const storageKey = onboardingFlagsStorageKey(userId);
    const raw = await AsyncStorage.getItem(storageKey);
    const saved = raw ? JSON.parse(raw) : {};
    saved[key] = value;
    await AsyncStorage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    // Best-effort — see loadOnboardingFlags comment.
  }
}

// Lets index.js's notification-open handling (see App() below) navigate
// from outside any screen component — the standard React Navigation
// pattern for reacting to events that aren't a JS button press.
export const navigationRef = createNavigationContainerRef();

function AppNavigator() {
  const { user, loading } = useAuth();

  // Full driver-onboarding flow (extends the Phase 4 permissions gate):
  // Welcome → Login(existing) → DeviceVerification → Permissions →
  // BatteryOptimization(Android) → FullScreenIntentPermission(Android) →
  // Terms → DriverProfileCheck → Dashboard. Each step is a one-time escape
  // hatch for this app session, same pattern as the original
  // permissionsConfirmed flag below — once a screen calls onDone, that
  // step is skipped for the rest of the session.
  const [welcomeDone, setWelcomeDone] = useState(false);
  const [deviceVerified, setDeviceVerified] = useState(false);
  const [onboardingGatePreChecksDone, setOnboardingGatePreChecksDone] = useState(false);
  const [batteryOptDone, setBatteryOptDone] = useState(Platform.OS !== 'android');
  const [fullScreenIntentDone, setFullScreenIntentDone] = useState(Platform.OS !== 'android');
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

  // Runs once per driver session: reads the two persisted pure
  // acknowledgements plus fullScreenIntentDone's documented-fallback
  // persistence (see PERSISTED_ONBOARDING_KEYS above), and separately
  // re-checks battery optimization against LIVE OS state (BatteryOptEnabled()
  // resolving false means optimization is OFF, i.e. the gate can be
  // skipped) rather than a stale persisted flag — a driver could have
  // granted it once, then had it silently revoked later (by themselves,
  // or by Vivo's own aggressive permission auto-reset), and a persisted
  // "done" flag would incorrectly skip re-prompting them.
  // permissionsConfirmed needs no equivalent check here — it already
  // re-verifies live via the cameraPermission/locationPermission hooks
  // above, on every render, not just once at startup.
  useEffect(() => {
    if (!user?._id || user.role !== 'driver' || Platform.OS !== 'android') {
      setOnboardingGatePreChecksDone(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const [saved, stillBatteryOptimized] = await Promise.all([
        loadOnboardingFlags(user._id),
        // Defaults to "still optimized" (i.e. show the gate) on failure —
        // the safe direction, since skipping it incorrectly could leave a
        // driver's app killed in the background without them ever finding
        // out, while showing it unnecessarily is just a mild annoyance.
        BatteryOptEnabled().catch(() => true),
      ]);
      if (cancelled) return;
      if (saved.termsAccepted) setTermsAccepted(true);
      if (saved.profileConfirmed) setProfileConfirmed(true);
      if (saved.fullScreenIntentDone) setFullScreenIntentDone(true);
      if (!stillBatteryOptimized) setBatteryOptDone(true);
      setOnboardingGatePreChecksDone(true);
    })();
    return () => { cancelled = true; };
  }, [user?._id, user?.role]);

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
          {incomingTripScreen}
          {driverDashboardScreen}
        </Stack.Navigator>
      );
    }

    // Phase 3 — onboarding/approval gate. A pending/rejected driver is
    // stuck here (no onDone escape hatch — the only way out is the
    // server-side approvalStatus flip, which DriverOnboardingScreen polls
    // for via refreshUser()). Placed before Permissions/Terms/etc. since
    // there's no point walking an unapproved driver through those.
    if (user.approvalStatus !== 'approved') {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="DriverOnboarding" component={DriverOnboardingScreen} />
        </Stack.Navigator>
      );
    }

    // Wait for the persisted-flags read + live BatteryOptEnabled() check
    // above — otherwise the gates below would briefly evaluate against
    // their useState() defaults and flash before the real values arrive
    // a tick later.
    if (!onboardingGatePreChecksDone) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0f1e' }}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
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
          {incomingTripScreen}
          {driverDashboardScreen}
        </Stack.Navigator>
      );
    }

    if (!batteryOptDone) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="BatteryOptimization">
            {() => <BatteryOptimizationScreen onDone={() => setBatteryOptDone(true)} />}
          </Stack.Screen>
          {incomingTripScreen}
          {driverDashboardScreen}
        </Stack.Navigator>
      );
    }

    if (!fullScreenIntentDone) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="FullScreenIntentPermission">
            {() => <FullScreenIntentPermissionScreen onDone={() => {
              setFullScreenIntentDone(true);
              saveOnboardingFlag(user._id, 'fullScreenIntentDone', true);
            }} />}
          </Stack.Screen>
          {incomingTripScreen}
          {driverDashboardScreen}
        </Stack.Navigator>
      );
    }

    if (!termsAccepted) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Terms">
            {() => <TermsScreen onDone={() => {
              setTermsAccepted(true);
              saveOnboardingFlag(user._id, 'termsAccepted', true);
            }} />}
          </Stack.Screen>
          {incomingTripScreen}
          {driverDashboardScreen}
        </Stack.Navigator>
      );
    }

    if (!profileConfirmed) {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="DriverProfileCheck">
            {() => <DriverProfileCheckScreen onDone={() => {
              setProfileConfirmed(true);
              saveOnboardingFlag(user._id, 'profileConfirmed', true);
            }} />}
          </Stack.Screen>
          {incomingTripScreen}
          {driverDashboardScreen}
        </Stack.Navigator>
      );
    }

    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {driverDashboardScreen}
        <Stack.Screen name="DriverProfile" component={DriverProfileScreen} />
        <Stack.Screen name="BookingTrip" component={BookingTripScreen} />
        <Stack.Screen name="AmbulancePicker" component={AmbulancePickerScreen} />
        <Stack.Screen
          name="TripAssigned"
          component={TripAssignedScreen}
          options={{ presentation: 'modal', gestureEnabled: false }}
        />
        {incomingTripScreen}
      </Stack.Navigator>
    );
  }

  // Owner OTP login (fleet-Owner model) — a small multi-screen section now
  // (Phase 2: Add Ambulance). LoginScreen's Password tab was dropped when
  // driver login moved to phone+OTP; the phone+password flow (authApi.login,
  // role:'owner'/'telecaller' User-model staff) is still reachable via
  // AuthContext.login() if something calls it directly, but nothing on
  // this screen does anymore — only the dedicated Owner (OTP) tab reaches
  // here.
  if (user.role === 'owner') {
    // Owner Approval (KYC) gate — same role App.js's driver branch plays
    // for approvalStatus: an owner with kycStatus !== 'approved' is stuck
    // on OwnerOnboardingScreen (no escape hatch but Logout) until the CRM
    // admin approves them via the new /api/owners/:id/approve endpoint.
    if (user.kycStatus !== 'approved') {
      return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="OwnerOnboarding" component={OwnerOnboardingScreen} />
        </Stack.Navigator>
      );
    }
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="OwnerHome" component={OwnerHomeScreen} />
        <Stack.Screen name="AddAmbulance" component={AddAmbulanceScreen} />
        <Stack.Screen name="MyAmbulances" component={MyAmbulancesScreen} />
        <Stack.Screen name="AmbulanceDetail" component={AmbulanceDetailScreen} />
        <Stack.Screen name="MyDrivers" component={MyDriversScreen} />
        <Stack.Screen name="AddDriver" component={AddDriverScreen} />
        <Stack.Screen name="OwnerDashboard" component={OwnerDashboardScreen} />
        <Stack.Screen name="DriveAmbulance" component={DriveAmbulanceScreen} />
        <Stack.Screen name="OwnerTripDetail" component={OwnerTripDetailScreen} />
        <Stack.Screen name="UnbindDevice" component={UnbindDeviceScreen} />
        <Stack.Screen name="OwnerProfile" component={OwnerProfileScreen} />
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

// Routes to the full-screen incoming-trip card when the app was opened via
// that notification — either a cold start (fullScreenAction/pressAction
// launching the app fresh) or an already-running app whose notification
// got pressed. Wrapped defensively throughout: notify-kit's native module
// doesn't exist pre-rebuild, and even once it does, a failure here must
// never prevent the app from opening normally — the driver falls back to
// seeing the trip via DriverDashboard's own poll loop and the ordinary
// Expo push, same as before this feature existed.
function navigateToIncomingTrip(data) {
  if (!data?.tripId || !navigationRef.isReady()) return;
  navigationRef.navigate('IncomingTrip', data);
}

// Lets DriverDashboard's poll loop check the CURRENT navigation state
// before also popping up TripAssignedScreen for a trip the FCM path has
// already put on screen — the two paths detect the same dispatch
// independently (see TripAssignedScreen.js's own header comment), and
// without this check whichever navigate() call lands second wins,
// silently swapping out a screen whose Accept/Reject the driver may
// already be about to tap. Reads live navigator state rather than a
// separately-tracked flag, so it can never go stale if IncomingTrip
// dismisses itself (timeout, accept, reject, crash) — the fallback poll
// picks the trip up again next tick exactly as it did before this screen existed.
export function isIncomingTripOnScreen(tripId) {
  if (!tripId || !navigationRef.isReady()) return false;
  const current = navigationRef.getCurrentRoute();
  return current?.name === 'IncomingTrip' && String(current?.params?.tripId) === String(tripId);
}

export default function App() {
  useEffect(() => {
    checkAndApplyUpdate();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') checkAndApplyUpdate();
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
        if (type === EventType.PRESS) {
          navigateToIncomingTrip(detail?.notification?.data);
        }
      });
    } catch (err) {
      console.log('[notifee] Could not subscribe to foreground events:', err?.message);
    }
    return () => unsubscribe();
  }, []);

  // ConnectionService self-managed PhoneAccounts, unlike classic
  // ConnectionManager ones, don't need the user to manually enable them in
  // Settings — registerPhoneAccount() alone is enough, so this can just run
  // on every launch. No-op on iOS/web (modules/trip-call/index.js).
  useEffect(() => {
    TripCall.registerPhoneAccountAsync().catch((err) => {
      console.log('[trip-call] Could not register phone account:', err?.message);
    });
  }, []);

  // Primary incoming-call route: fires whenever the native ConnectionService
  // creates a connection (index.js's background task called
  // TripCall.startIncomingCall) while this JS bridge is alive — covers both
  // foreground and backgrounded-but-not-killed app states.
  useEffect(() => {
    const sub = TripCall.addIncomingCallListener(({ data }) => {
      navigateToIncomingTrip(data);
    });
    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          notifee.getInitialNotification()
            .then((initial) => navigateToIncomingTrip(initial?.notification?.data))
            .catch((err) => console.log('[notifee] Could not read initial notification:', err?.message));

          // Cold-start route: the app was fully killed, so no JS listener
          // was alive to catch the 'onIncomingCall' event —
          // TripConnectionService.launchIncomingCallActivity() instead put
          // the trip data straight on the launching Intent's extras, which
          // this reads once at startup (same "read once at launch" shape
          // as notifee.getInitialNotification() above).
          TripCall.getLaunchCallDataAsync()
            .then((data) => navigateToIncomingTrip(data))
            .catch((err) => console.log('[trip-call] Could not read launch call data:', err?.message));
        }}
      >
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
