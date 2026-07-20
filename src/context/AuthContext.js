import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, ownerAuthApi, setSessionKickedHandler } from '../api/client';

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

  // Re-fetches the driver's own profile and merges it into the cached
  // user — needed because approvalStatus can change server-side (owner
  // approves/rejects) with no push mechanism; DriverOnboardingScreen
  // polls this so the app notices and moves on once approved, without
  // requiring a fresh login.
  const refreshUser = async () => {
    try {
      const { data } = await authApi.me();
      if (data?.user) {
        const merged = { ...user, ...data.user };
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

  const logout = async () => {
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, loginWithOtp, ownerLogin, deviceKicked, dismissDeviceKicked, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);