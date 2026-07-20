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

// One-active-device enforcement (see middleware/auth.js's protect()): once
// a different phone logs in, this phone's next API call gets a 401 with
// code:'DEVICE_MISMATCH'. client.js is a plain module (no React state of
// its own), so it can't clear the session/navigate itself — it just calls
// whatever handler AuthContext registered on mount, which owns the actual
// AsyncStorage clear + setUser(null) + the "logged in elsewhere" banner.
let sessionKickedHandler = null;
export const setSessionKickedHandler = (fn) => { sessionKickedHandler = fn; };

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && err.response?.data?.code === 'DEVICE_MISMATCH' && sessionKickedHandler) {
      sessionKickedHandler();
    }
    return Promise.reject(err);
  }
);

export default api;

export const authApi = {
  login: (phone, password) => api.post('/auth/login', { phone, password }),
  me: () => api.get('/auth/me'),
  sendOtp: (phone) => api.post('/auth/send-otp', { phone }),
  verifyOtp: (phone, otp, deviceId) => api.post('/auth/verify-otp', { phone, otp, deviceId }),
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

// Phase 3 — driver's assigned trip (dispatched/en_route from CRM)
export const tripsApi = {
  getAll: (params) => api.get('/trips', { params }),
  updateStatus: (id, status) => api.put(`/trips/${id}/status`, { status }),
  arrivePickup: (id) => api.put(`/trips/${id}/arrive-pickup`),
  verifyOtp: (id, otp) => api.put(`/trips/${id}/verify-otp`, { otp }),
  complete: (id, data) => api.put(`/trips/${id}/complete`, data || {}),
  confirm: (id) => api.put(`/trips/${id}/confirm`),
  decline: (id) => api.put(`/trips/${id}/decline`),
};

// Driver-onboarding flow — ON DUTY toggle on DriverDashboard, backed by the
// existing Phase 3 Assignment/Shift endpoints (previously unused by the app).
export const assignmentsApi = {
  startDuty: (ambulanceId, deviceId, lat, lng) => api.post('/assignments/start-duty', { ambulanceId, deviceId, lat, lng }),
  endDuty: (lat, lng) => api.post('/assignments/end-duty', { lat, lng }),
  getMyActiveShift: () => api.get('/assignments/my-active'),
};

// Owner OTP login (Phase 1 fleet-Owner model, separate from the User-model
// owner login above) — a different session/token from authApi.login.
export const ownerAuthApi = {
  sendOtp: (phone, name) => api.post('/owners/send-otp', { phone, name }),
  verifyOtp: (phone, otp) => api.post('/owners/verify-otp', { phone, otp }),
};

// Owner-facing driver device management — Unbind Device tool.
export const ownerDriverApi = {
  list: () => api.get('/driver-auth'),
  unbindDevice: (id) => api.put(`/driver-auth/${id}/unbind-device`),
};
