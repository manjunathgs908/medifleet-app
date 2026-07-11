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

export const tripsApi = {
  getLive: () => api.get('/trips/live'),
  updateStatus: (id, status) => api.put(`/trips/${id}/status`, { status }),
  complete: (id, data) => api.put(`/trips/${id}/complete`, data),
  decline: (id) => api.put(`/trips/${id}/decline`),
};

export const attendanceApi = {
  clockIn: (data) => api.post('/attendance/clock-in', data),
  clockOut: () => api.post('/attendance/clock-out'),
};

export const salaryApi = {
  getPayslip: (dId, m, y) => api.get(`/salary/${dId}/${m}/${y}`),
};
// Trip Activity
export const tripActivityApi = {
  log: (data) => api.post('/trip-activity/log', data),
};// Advance
export const advanceApi = {
  request: (data) => api.post('/advances', data),
  myAdvances: () => api.get('/advances/my'),
};

// Phase 4 — Employee ID + PIN driver login (backend Phase 2), additive
// alongside authApi above; the existing phone+password flow is untouched.
export const driverAuthApi = {
  loginWithPin: (employeeId, pin, deviceId) => api.post('/driver-auth/login', { employeeId, pin, deviceId }),
  changePin: (oldPin, newPin) => api.post('/driver-auth/change-pin', { oldPin, newPin }),
};

// Phase 4 — Assignment/Shift duty management (backend Phase 3).
export const assignmentsApi = {
  startDuty: (ambulanceId, deviceId, lat, lng) => api.post('/assignments/start-duty', { ambulanceId, deviceId, lat, lng }),
  breakDuty: () => api.post('/assignments/break'),
  resumeDuty: () => api.post('/assignments/resume'),
  endDuty: (lat, lng) => api.post('/assignments/end-duty', { lat, lng }),
  getMyActive: () => api.get('/assignments/my-active'),
  getMyHistory: (params) => api.get('/assignments/my-history', { params }),
};
