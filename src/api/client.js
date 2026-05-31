import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://medifleet-backend.onrender.com/api';

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
  getAll: (params) => api.get('/trips', { params }),
  updateStatus: (id, status) => api.put(`/trips/${id}/status`, { status }),
  complete: (id, data) => api.put(`/trips/${id}/complete`, data),
};

export const attendanceApi = {
  clockIn: (data) => api.post('/attendance/clock-in', data),
  clockOut: () => api.post('/attendance/clock-out'),
};

export const salaryApi = {
  getPayslip: (dId, m, y) => api.get(`/salary/${dId}/${m}/${y}`),
};