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
  // Phase 5 — server-enforced logout (blocks a driver mid-duty/mid-trip).
  logout: () => api.post('/auth/logout'),
};

// Unified login — single phone-only flow, backend decides driver vs
// owner vs brand-new. Replaces LoginScreen's old Driver/Owner tabs.
export const unifiedAuthApi = {
  sendOtp: (phone, name) => api.post('/auth/unified-send-otp', { phone, name }),
  verifyOtp: (phone, otp, deviceId) => api.post('/auth/unified-verify-otp', { phone, otp, deviceId }),
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
  // Phase 3 — driver uploads their own onboarding documents (dl/aadhaar/photo).
  uploadDocument: (docType, fields) => api.put('/driver-auth/documents', { docType, ...fields }),
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
  // Phase 4 — ambulances a driver can pick from at start-duty.
  getAvailableAmbulances: () => api.get('/assignments/available-ambulances'),
  // Phase 6 — owner-facing live fleet overview (protectOwner-gated).
  getFleetStatus: () => api.get('/assignments/fleet-status'),
  // Phase 6C — an owner driving their own ambulance is mid-session as the
  // shadow driver, so the shared `api` instance's interceptor would attach
  // the driver's accessToken, not the owner's. Uses the owner token backed
  // up in AsyncStorage[OWNER_BACKUP_KEY] (see AuthContext.startDutyAsOwner)
  // directly, bypassing that interceptor, so the driving session is never
  // touched.
  getFleetStatusAsOwner: (ownerAccessToken) => axios.get(`${API_URL}/assignments/fleet-status`, {
    headers: { Authorization: `Bearer ${ownerAccessToken}` },
  }),
};

// Owner OTP login (Phase 1 fleet-Owner model, separate from the User-model
// owner login above) — a different session/token from authApi.login.
export const ownerAuthApi = {
  sendOtp: (phone, name) => api.post('/owners/send-otp', { phone, name }),
  verifyOtp: (phone, otp) => api.post('/owners/verify-otp', { phone, otp }),
  // Mints a driver token for the owner's own shadow driver identity —
  // lets a small operator drive their own fleet through the normal
  // driver flow.
  actAsDriver: (deviceId) => api.post('/owners/act-as-driver', { deviceId }),
  // Owner Approval (KYC) — self-service, mirrors driverAuthApi's own
  // getMe/uploadDocument shape. Never gated: an owner must always be
  // able to check their own kycStatus/kycRejectionReason and upload/
  // re-upload documents regardless of approval state.
  getMe: () => api.get('/owners/me'),
  uploadKycDocument: (docType, base64) => api.post('/owners/kyc/upload', { docType, base64 }),
};

// Owner-facing driver device management + approval (Unbind Device tool,
// Phase 3 — Pending Drivers screen). Same GET /driver-auth list endpoint,
// filtered by ?approvalStatus= for the Pending Drivers view.
export const ownerDriverApi = {
  list       : (params) => api.get('/driver-auth', { params }),
  register   : (name, phone) => api.post('/driver-auth/register', { name, phone }),
  unbindDevice: (id) => api.put(`/driver-auth/${id}/unbind-device`),
  approve    : (id) => api.put(`/driver-auth/${id}/approve`),
  reject     : (id, reason) => api.put(`/driver-auth/${id}/reject`, { reason }),
};

// Owner-facing ambulance CRUD + document/photo upload (Phase 2 — Add Ambulance).
export const ambulancesApi = {
  create        : (data) => api.post('/ambulances', data),
  getAll        : (params) => api.get('/ambulances', { params }),
  getById       : (id) => api.get(`/ambulances/${id}`),
  update        : (id, data) => api.put(`/ambulances/${id}`, data),
  uploadDocument: (id, docType, fields) => api.put(`/ambulances/${id}/document`, { docType, ...fields }),
  addPhoto      : (id, base64) => api.post(`/ambulances/${id}/photos`, { base64 }),
};
