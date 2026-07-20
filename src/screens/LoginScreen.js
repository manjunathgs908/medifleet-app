import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import PinInput from '../components/PinInput';
import { getDeviceId } from '../utils/device';
import { authApi, ownerAuthApi } from '../api/client';

export default function LoginScreen() {
  const { loginWithOtp, ownerLogin, deviceKicked, dismissDeviceKicked } = useAuth();

  // Two actor types share this screen: Driver (phone+OTP) and Owner
  // (phone+OTP, separate Owner model/session — untouched by this pass).
  const [mode, setMode] = useState('driver'); // 'driver' | 'owner'
  const [loading, setLoading] = useState(false);

  // ── Driver: phone + OTP ────────────────────────────────────────
  const [driverPhone, setDriverPhone] = useState('');
  const [driverOtp, setDriverOtp] = useState('');
  const [driverOtpSent, setDriverOtpSent] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  // TEMPORARY — REMOVE AFTER DLT APPROVAL. testOtp only ever appears in
  // the response for whitelisted numbers (see authController.sendOtp) —
  // this just surfaces it on screen since a phone can't see server logs.
  const [driverTestOtp, setDriverTestOtp] = useState(null);

  const handleSendDriverOtp = async () => {
    if (driverPhone.trim().length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.sendOtp(driverPhone.trim());
      setDriverOtpSent(true);
      if (data?.testOtp) {
        setDriverTestOtp(data.testOtp);
        setDriverOtp(data.testOtp);
      } else {
        setDriverTestOtp(null);
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyDriverOtp = async () => {
    if (driverOtp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      if (!deviceId) {
        Alert.alert('Error', 'Could not identify this device. Please try again.');
        return;
      }
      await loginWithOtp(driverPhone.trim(), driverOtp.trim(), deviceId);
      // App.js reacts to the updated user (Permissions/Dashboard) — no
      // explicit navigation call needed here, same pattern the other
      // login flows on this screen use.
    } catch (e) {
      const message = e.response?.data?.message;
      if (message === 'Your account is pending approval.') {
        setPendingApproval(true);
      } else {
        Alert.alert('Error', message || 'Invalid or expired OTP.');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetDriverNotice = () => {
    setPendingApproval(false);
    setDriverOtp('');
    setDriverOtpSent(false);
    setDriverTestOtp(null);
  };

  // ── Owner: phone + OTP (fleet-Owner model — untouched) ─────────
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerOtp, setOwnerOtp] = useState('');
  const [ownerOtpSent, setOwnerOtpSent] = useState(false);
  // TEMPORARY — REMOVE AFTER DLT APPROVAL. See driverTestOtp above.
  const [ownerTestOtp, setOwnerTestOtp] = useState(null);

  const handleSendOwnerOtp = async () => {
    if (!ownerPhone) {
      Alert.alert('Error', 'Please enter your phone number.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await ownerAuthApi.sendOtp(ownerPhone.trim());
      setOwnerOtpSent(true);
      if (data?.testOtp) {
        setOwnerTestOtp(data.testOtp);
        setOwnerOtp(data.testOtp);
      } else {
        setOwnerTestOtp(null);
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOwnerOtp = async () => {
    if (ownerOtp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      await ownerLogin(ownerPhone.trim(), ownerOtp.trim());
      // App.js reacts to the updated user (role:'owner') — no explicit
      // navigation call needed here, same pattern the other tabs use.
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Invalid or expired OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>🚑 MediFleet</Text>
        <Text style={styles.subtitle}>Ambulance CRM</Text>

        {deviceKicked && (
          <View style={[styles.noticeBox, styles.noticeBoxDanger]}>
            <Text style={styles.noticeTitle}>🔒 Logged Out</Text>
            <Text style={styles.noticeText}>
              You were logged in on another device. Log in again here if this is your active phone.
            </Text>
            <TouchableOpacity onPress={dismissDeviceKicked} style={{ marginTop: 10 }}>
              <Text style={styles.label}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, mode === 'driver' && styles.tabBtnActive]}
            onPress={() => setMode('driver')}
          >
            <Text style={[styles.tabText, mode === 'driver' && styles.tabTextActive]}>Driver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, mode === 'owner' && styles.tabBtnActive]}
            onPress={() => setMode('owner')}
          >
            <Text style={[styles.tabText, mode === 'owner' && styles.tabTextActive]}>Owner</Text>
          </TouchableOpacity>
        </View>

        {mode === 'driver' ? (
          <>
            {pendingApproval && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeTitle}>⏳ Pending Approval</Text>
                <Text style={styles.noticeText}>
                  Your account is waiting for your Owner/Admin to approve it. Please check back later.
                </Text>
                <TouchableOpacity onPress={resetDriverNotice} style={{ marginTop: 10 }}>
                  <Text style={styles.label}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {!pendingApproval && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Phone Number"
                  placeholderTextColor="#888"
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!driverOtpSent}
                  value={driverPhone}
                  onChangeText={(t) => setDriverPhone(t.replace(/[^0-9]/g, ''))}
                />

                {driverOtpSent && (
                  <>
                    <Text style={styles.label}>6-Digit OTP</Text>
                    {driverTestOtp && (
                      <Text style={styles.testOtpBanner}>🧪 Test mode — OTP auto-filled: {driverTestOtp}</Text>
                    )}
                    <PinInput length={6} value={driverOtp} onChange={setDriverOtp} autoFocus />
                  </>
                )}

                <TouchableOpacity
                  style={[styles.button, { marginTop: driverOtpSent ? 20 : 8 }, loading && { opacity: 0.6 }]}
                  onPress={driverOtpSent ? handleVerifyDriverOtp : handleSendDriverOtp}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.buttonText}>{driverOtpSent ? 'Verify OTP →' : 'Send OTP'}</Text>
                  }
                </TouchableOpacity>

                {driverOtpSent && (
                  <TouchableOpacity onPress={resetDriverNotice} style={{ marginTop: 12 }}>
                    <Text style={styles.label}>Change phone number</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor="#888"
              keyboardType="phone-pad"
              editable={!ownerOtpSent}
              value={ownerPhone}
              onChangeText={setOwnerPhone}
            />

            {ownerOtpSent && (
              <>
                <Text style={styles.label}>6-Digit OTP</Text>
                {ownerTestOtp && (
                  <Text style={styles.testOtpBanner}>🧪 Test mode — OTP auto-filled: {ownerTestOtp}</Text>
                )}
                <PinInput length={6} value={ownerOtp} onChange={setOwnerOtp} />
              </>
            )}

            <TouchableOpacity
              style={[styles.button, { marginTop: ownerOtpSent ? 20 : 8 }, loading && { opacity: 0.6 }]}
              onPress={ownerOtpSent ? handleVerifyOwnerOtp : handleSendOwnerOtp}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>{ownerOtpSent ? 'Verify OTP →' : 'Send OTP'}</Text>
              }
            </TouchableOpacity>

            {ownerOtpSent && (
              <TouchableOpacity onPress={() => { setOwnerOtpSent(false); setOwnerOtp(''); setOwnerTestOtp(null); }} style={{ marginTop: 12 }}>
                <Text style={styles.label}>Change phone number</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 30,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 22,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#10b981',
  },
  tabText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: 'bold',
  },
  tabTextActive: {
    color: '#fff',
  },
  label: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  noticeBox: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  noticeBoxDanger: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.35)',
  },
  noticeTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  noticeText: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 19,
  },
  // TEMPORARY — REMOVE AFTER DLT APPROVAL.
  testOtpBanner: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    color: '#10b981',
    fontSize: 12.5,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
