import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import PinInput from '../components/PinInput';
import { getDeviceId } from '../utils/device';
import { ownerAuthApi } from '../api/client';

export default function LoginScreen() {
  const { login, loginWithPin, ownerLogin } = useAuth();

  // Phase 4 — mode toggle. PIN Login is the default; Password Login is
  // the pre-existing flow below, untouched, just gated behind the toggle.
  // 'owner' is a minimal third tab for the Unbind Device tool.
  const [mode, setMode] = useState('pin'); // 'pin' | 'password' | 'owner'

  // Shared by both flows (existing behavior — was already the single
  // loading flag used by handleLogin before this phase).
  const [loading, setLoading] = useState(false);

  // ── Existing phone+password state/logic — unchanged ──────────────────
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!phone || !password) {
      Alert.alert('Error', 'Please enter Phone and Password');
      return;
    }
    setLoading(true);
    try {
      await login(phone, password);
    } catch (e) {
      Alert.alert('Error', 'Invalid Phone or Password');
    } finally {
      setLoading(false);
    }
  };

  // ── New: Employee ID + PIN state/logic ────────────────────────────────
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [pendingApproval, setPendingApproval] = useState(false);
  const [deviceBlocked, setDeviceBlocked] = useState(false);

  const handlePinLogin = async () => {
    if (!employeeId || pin.length !== 6) {
      Alert.alert('Error', 'Please enter your Employee ID and 6-digit PIN.');
      return;
    }
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      if (!deviceId) {
        Alert.alert('Error', 'Could not identify this device. Please try again.');
        return;
      }
      await loginWithPin(employeeId.trim(), pin, deviceId);
      // App.js reacts to the updated user (ChangePin/Permissions/Dashboard) —
      // no explicit navigation call needed here, same pattern handleLogin uses.
    } catch (e) {
      const message = e.response?.data?.message;
      if (message === 'Your account is pending approval.') {
        setPendingApproval(true);
      } else if (message && message.startsWith('This device is not registered')) {
        setDeviceBlocked(true);
      } else {
        Alert.alert('Error', 'Invalid Employee ID or PIN');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetPinNotice = () => {
    setPendingApproval(false);
    setDeviceBlocked(false);
    setPin('');
  };

  const showingNotice = pendingApproval || deviceBlocked;

  // ── New: Owner OTP login (minimal — Unbind Device tool only) ──────────
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerOtp, setOwnerOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const handleSendOwnerOtp = async () => {
    if (!ownerPhone) {
      Alert.alert('Error', 'Please enter your phone number.');
      return;
    }
    setLoading(true);
    try {
      await ownerAuthApi.sendOtp(ownerPhone.trim());
      setOtpSent(true);
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

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, mode === 'pin' && styles.tabBtnActive]}
            onPress={() => setMode('pin')}
          >
            <Text style={[styles.tabText, mode === 'pin' && styles.tabTextActive]}>PIN Login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, mode === 'password' && styles.tabBtnActive]}
            onPress={() => setMode('password')}
          >
            <Text style={[styles.tabText, mode === 'password' && styles.tabTextActive]}>Password Login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, mode === 'owner' && styles.tabBtnActive]}
            onPress={() => setMode('owner')}
          >
            <Text style={[styles.tabText, mode === 'owner' && styles.tabTextActive]}>Owner</Text>
          </TouchableOpacity>
        </View>

        {mode === 'pin' ? (
          <>
            {pendingApproval && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeTitle}>⏳ Pending Approval</Text>
                <Text style={styles.noticeText}>
                  Your account is waiting for your Owner/Admin to approve it. Please check back later.
                </Text>
              </View>
            )}

            {deviceBlocked && (
              <View style={[styles.noticeBox, styles.noticeBoxDanger]}>
                <Text style={styles.noticeTitle}>🔒 Device Not Registered</Text>
                <Text style={styles.noticeText}>
                  This device is not registered for this ambulance. Contact your Owner/Admin to unbind
                  your previous device.
                </Text>
              </View>
            )}

            {!showingNotice && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Employee ID"
                  placeholderTextColor="#888"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={employeeId}
                  onChangeText={setEmployeeId}
                />
                <Text style={styles.label}>6-Digit PIN</Text>
                <PinInput length={6} value={pin} onChange={setPin} />
              </>
            )}

            <TouchableOpacity
              style={[styles.button, { marginTop: 20 }, loading && { opacity: 0.6 }]}
              onPress={showingNotice ? resetPinNotice : handlePinLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>{showingNotice ? 'Try Again' : 'Sign In →'}</Text>
              }
            </TouchableOpacity>
          </>
        ) : mode === 'password' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor="#888"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#888"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              style={styles.button}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Sign In →</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor="#888"
              keyboardType="phone-pad"
              editable={!otpSent}
              value={ownerPhone}
              onChangeText={setOwnerPhone}
            />

            {otpSent && (
              <>
                <Text style={styles.label}>6-Digit OTP</Text>
                <PinInput length={6} value={ownerOtp} onChange={setOwnerOtp} />
              </>
            )}

            <TouchableOpacity
              style={[styles.button, { marginTop: otpSent ? 20 : 8 }, loading && { opacity: 0.6 }]}
              onPress={otpSent ? handleVerifyOwnerOtp : handleSendOwnerOtp}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>{otpSent ? 'Verify OTP →' : 'Send OTP'}</Text>
              }
            </TouchableOpacity>

            {otpSent && (
              <TouchableOpacity onPress={() => { setOtpSent(false); setOwnerOtp(''); }} style={{ marginTop: 12 }}>
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
    marginBottom: 8,
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
});
