import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, ownerAuthApi, assignmentsApi, setSessionKickedHandler } from '../api/client';

const OWNER_BACKUP_KEY = 'ownerBackupSession'; // holds the owner's own tokens while acting as driver

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deviceKicked, setDeviceKicked] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  // Registered once — client.js calls this from its response interceptor
  // whenever a 401 DEVICE_MISMATCH comes back (a newer login elsewhere).
  useEffect(() => {
    setSessionKickedHandler(async () => {
      await AsyncStorage.clear();
      setUser(null);
      setDeviceKicked(true);
    });
  }, []);

  const dismissDeviceKicked = () => setDeviceKicked(false);

  // Re-fetches the driver's (or owner's) own profile and merges it into
  // the cached user — needed because approvalStatus/kycStatus can change
  // server-side (owner/admin approves or rejects) with no push
  // mechanism; DriverOnboardingScreen/OwnerOnboardingScreen poll this so
  // the app notices and moves on once approved, without requiring a
  // fresh login. Branches on role since the two onboarding flows are
  // backed by entirely separate collections/endpoints (User vs Owner).
  const refreshUser = async () => {
    try {
      const { data } = user?.role === 'owner' ? await ownerAuthApi.getMe() : await authApi.me();
      const fresh = data?.owner || data?.user;
      if (fresh) {
        const merged = { ...user, ...fresh };
        await AsyncStorage.setItem('user', JSON.stringify(merged));
        setUser(merged);
        return merged;
      }
    } catch (e) {
      // Silent — caller just keeps whatever's already cached.
    }
    return user;
  };

  const loadUser = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const savedUser = await AsyncStorage.getItem('user');
      if (token && savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const login = async (phone, password) => {
    const { data } = await authApi.login(phone, password);
    await AsyncStorage.setItem('accessToken', data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  // Phase 5 — logout safety rule. Owner sessions (a separate model with
  // no duty/trip concept) skip straight to the client-only clear, same
  // as before. Driver sessions must round-trip through the backend first
  // — it throws (403) if the driver is on duty or has an active trip,
  // in which case AsyncStorage is deliberately left untouched and the
  // caller (the screen's logout button) is expected to catch and show
  // the block reason. This is a distinct path from the DEVICE_MISMATCH
  // forced-kick in client.js's interceptor, which never calls this
  // function and must still fire regardless of duty state.
  const logout = async () => {
    if (user?.role === 'driver') {
      await authApi.logout();
    }
    await AsyncStorage.clear();
    setUser(null);
  };

  // Driver login — phone + OTP (replaces the removed Employee ID + PIN
  // flow). Same token-storage pattern as the other login functions.
  const loginWithOtp = async (phone, otp, deviceId) => {
    const { data } = await authApi.verifyOtp(phone, otp, deviceId);
    await AsyncStorage.setItem('accessToken', data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  // Owner OTP login (fleet-Owner model, Phase 1) — additive, same
  // token-storage pattern as loginWithOtp above. Note: this is a
  // completely separate session/collection from the User-model owner
  // login() above, even though both end up with user.role === 'owner'.
  const ownerLogin = async (phone, otp) => {
    const { data } = await ownerAuthApi.verifyOtp(phone, otp);
    await AsyncStorage.setItem('accessToken', data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(data.owner));
    setUser(data.owner);
    return data.owner;
  };

  // Owner-as-driver — a small operator drives their own fleet. Deliberately
  // does NOT flip the active session (setUser) until start-duty has
  // actually succeeded: if the owner cancels the ambulance picker, or
  // another driver wins the race for that ambulance, the owner must never
  // be left stuck as an ambulance-less "driver" with no easy way back.
  const startDutyAsOwner = async (ambulanceId, deviceId, lat, lng) => {
    // 1. Mint (or reuse) the shadow driver session — pure data fetch, no
    //    session/state change yet.
    const { data: driverAuth } = await ownerAuthApi.actAsDriver(deviceId);

    // 2. Snapshot the currently-active (owner) session so it can be
    //    restored either on failure below, or later on end-duty.
    const ownerAccessToken  = await AsyncStorage.getItem('accessToken');
    const ownerRefreshToken = await AsyncStorage.getItem('refreshToken');
    const ownerUserRaw      = await AsyncStorage.getItem('user');

    // 3. Swap ONLY the access token so start-duty authenticates as the
    //    driver — `user` state is untouched, so the UI shows no change yet.
    await AsyncStorage.setItem('accessToken', driverAuth.accessToken);

    try {
      await assignmentsApi.startDuty(ambulanceId, deviceId, lat, lng);
    } catch (err) {
      // Roll back invisibly — restore the owner's token, never called
      // setUser, so nothing the owner sees ever changed.
      await AsyncStorage.setItem('accessToken', ownerAccessToken);
      throw err;
    }

    // 4. Duty actually started — commit the full swap, backing up the
    //    owner session first so restoreOwnerSession() can bring it back.
    await AsyncStorage.setItem(OWNER_BACKUP_KEY, JSON.stringify({
      accessToken : ownerAccessToken,
      refreshToken: ownerRefreshToken,
      user        : ownerUserRaw,
    }));
    await AsyncStorage.setItem('refreshToken', driverAuth.refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(driverAuth.user));
    setUser(driverAuth.user);
  };

  // Called from DriverDashboard's end-duty success path when
  // user.isOwnerSelf is true — swaps the app back to the owner identity,
  // which App.js's role-based routing then renders automatically.
  const restoreOwnerSession = async () => {
    const backupRaw = await AsyncStorage.getItem(OWNER_BACKUP_KEY);
    if (!backupRaw) {
      // Shouldn't happen, but fail safe rather than stranding them in a
      // half-swapped state.
      await logout();
      return;
    }
    const backup = JSON.parse(backupRaw);
    await AsyncStorage.setItem('accessToken', backup.accessToken);
    await AsyncStorage.setItem('refreshToken', backup.refreshToken);
    await AsyncStorage.setItem('user', backup.user);
    await AsyncStorage.removeItem(OWNER_BACKUP_KEY);
    setUser(JSON.parse(backup.user));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, loginWithOtp, ownerLogin, deviceKicked, dismissDeviceKicked, refreshUser, startDutyAsOwner, restoreOwnerSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);