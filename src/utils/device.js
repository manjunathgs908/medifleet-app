import { Platform } from 'react-native';
import * as Application from 'expo-application';

const API_ROOT = 'https://api.savelife.health';
const FETCH_TIMEOUT_MS = 6000;

export async function getDeviceId() {
  try {
    if (Platform.OS === 'android') {
      return Application.getAndroidId();
    }
    return await Application.getIosIdForVendorAsync();
  } catch {
    return null;
  }
}

// No @react-native-community/netinfo in this project (native module — would
// need a new build). A timed fetch against the backend's own root route
// doubles as both "internet reachable" and "backend reachable" in one check.
export async function checkInternet() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(API_ROOT, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
