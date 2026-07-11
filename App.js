import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import ChangePinScreen from './src/screens/ChangePinScreen';
import PermissionsScreen from './src/screens/PermissionsScreen';
import DriverDashboard from './src/screens/driver/DriverDashboard';

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

    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="DriverDashboard" component={DriverDashboard} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}