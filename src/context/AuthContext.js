import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { authApi, ownerAuthApi, unifiedAuthApi, assignmentsApi, setSessionKickedHandler } from '../api/client';

const OWNER_BACKUP_KEY = 'ownerBackupSession'; // holds the owner's own tokens while acting as driver

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deviceKicked, setDeviceKicked] = useState(false);

  // Always holds the latest `user` — the AppState listener below is
  // registered once on mount, so its closure would otherwise only ever
  // see whatever `user` was at that first render (null).
  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    loadUser();
  }, []);

  // Same self-healing refresh loadUser() does on cold start, but for the
  // resume-from-background case too — approvalStatus/kycStatus approved
  // while the app was merely backgrounded (not killed) would otherwise
  // stay stale until whatever screen-specific polling loop next fires.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && userRef.current) {
        refreshUser(userRef.current).catch(() => {});
      }
    });
    return () => subscription.remove();
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
  // `baseUser` defaults to current state, but loadUser() below passes the
  // freshly-parsed AsyncStorage value explicitly — right after a cold
  // start, `user` state hasn't committed yet in this closure, so relying
  // on it here would silently skip the owner branch (or fetch nothing)
  // for the very first refresh of a session.
  const refreshUser = async (baseUser = user) => {
    try {
      const { data } = baseUser?.role === 'owner' ? await ownerAuthApi.getMe() : await authApi.me();
      const fresh = data?.owner || data?.user;
      if (fresh) {
        const merged = { ...baseUser, ...fresh };
        await AsyncStorage.setItem('user', JSON.stringify(merged));
        setUser(merged);
        return merged;
      }
    } catch (e) {
      // Silent — caller just keeps whatever's already cached.
    }
    return baseUser;
  };

  const loadUser = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const savedUser = await AsyncStorage.getItem('user');
      if (token && savedUser) {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        // Fire-and-forget: self-heals stale cached approvalStatus/
        // kycStatus (e.g. approved server-side while the app was closed)
        // on every cold start, instead of only while sitting on whatever
        // onboarding screen happens to be polling. Doesn't block the
        // loading screen — UI shows cached state immediately, then
        // silently updates once this resolves.
        refreshUser(parsed).catch(() => {});
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

  // Unified login — single phone-only flow (LoginScreen no longer asks
  // Driver or Owner first). The backend decides which collection the
  // phone belongs to and returns either `user` (driver) or `owner`
  // (fleet-Owner) — whichever key is present is the session to store.
  // Same AsyncStorage/setUser pattern the old per-role login functions
  // used (loginWithOtp/ownerLogin, removed — LoginScreen was their only
  // caller).
  const unifiedLogin = async (phone, otp, deviceId) => {
    const { data } = await unifiedAuthApi.verifyOtp(phone, otp, deviceId);
    const profile = data.user || data.owner;
    await AsyncStorage.setItem('accessToken', data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(profile));
    setUser(profile);
    return profile;
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
    <AuthContext.Provider value={{ user, loading, login, logout, unifiedLogin, deviceKicked, dismissDeviceKicked, refreshUser, startDutyAsOwner, restoreOwnerSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);