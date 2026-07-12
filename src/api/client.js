import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://api.savelife.health/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('accessToken');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

export default api;

export const authApi = {
  login: (phone, password) => api.post('/auth/login', { phone, password }),
  me: () => api.get('/auth/me'),
};

export const attendanceApi = {
  clockIn: (data) => api.post('/attendance/clock-in', data),
  clockOut: () => api.post('/attendance/clock-out'),
};

export const salaryApi = {
  getPayslip: (dId, m, y) => api.get(`/salary/${dId}/${m}/${y}`),
};

// Phase 4 — Employee ID + PIN driver login (backend Phase 2), additive
// alongside authApi above; the existing phone+password flow is untouched.
export const driverAuthApi = {
  loginWithPin: (employeeId, pin, deviceId) => api.post('/driver-auth/login', { employeeId, pin, deviceId }),
  changePin: (oldPin, newPin) => api.post('/driver-auth/change-pin', { oldPin, newPin }),
  updateLocation: (lat, lng, status) => api.put('/driver-auth/location', { lat, lng, status }),
};