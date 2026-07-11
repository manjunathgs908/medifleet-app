import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, driverAuthApi } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

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

  // Phase 4 — Employee ID + PIN login (driver-auth), additive alongside
  // the existing phone+password login above. Same token-storage pattern;
  // pinChangeRequired is merged into the stored user so App.js can react
  // to it (and so it survives an app restart before the PIN is changed).
  const loginWithPin = async (employeeId, pin, deviceId) => {
    const { data } = await driverAuthApi.loginWithPin(employeeId, pin, deviceId);
    const userWithPinFlag = { ...data.user, pinChangeRequired: data.pinChangeRequired };
    await AsyncStorage.setItem('accessToken', data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(userWithPinFlag));
    setUser(userWithPinFlag);
    return userWithPinFlag;
  };

  // Called by ChangePinScreen after a successful PIN change, so App.js's
  // navigation moves on from the forced ChangePin screen.
  const completePinChange = async () => {
    const updated = { ...user, pinChangeRequired: false };
    await AsyncStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, loginWithPin, completePinChange }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);