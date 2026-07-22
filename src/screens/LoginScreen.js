import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import PinInput from '../components/PinInput';
import { getDeviceId } from '../utils/device';
import { unifiedAuthApi } from '../api/client';

/**
 * Single phone-only login — no Driver/Owner tab choice. The backend
 * (POST /auth/unified-send-otp, /unified-verify-otp) decides whether
 * this phone is a driver, an existing owner, or brand-new; the app just
 * routes on whatever `user.role` comes back (App.js's existing
 * role-based branching is unaffected by how login happened).
 */
export default function LoginScreen() {
  const { unifiedLogin, deviceKicked, dismissDeviceKicked } = useAuth();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [testOtp, setTestOtp] = useState(null);

  // Brand-new phone (no Owner, no active driver) registers as a new
  // Owner — same "name required" flow ownerController.sendOtp already
  // had, just reached without picking a tab first.
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState('');

  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (phone.trim().length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number.');
      return;
    }
    if (needsName && !name.trim()) {
      Alert.alert('Error', 'Please enter your name to register.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await unifiedAuthApi.sendOtp(phone.trim(), needsName ? name.trim() : undefined);
      setOtpSent(true);
      if (data?.testOtp) {
        setTestOtp(data.testOtp);
        setOtp(data.testOtp);
      } else {
        setTestOtp(null);
      }
    } catch (e) {
      const message = e.response?.data?.message || 'Could not send OTP. Please try again.';
      if (!needsName && /name is required/i.test(message)) {
        setNeedsName(true);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 4) {
      Alert.alert('Error', 'Please enter the 4-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      if (!deviceId) {
        Alert.alert('Error', 'Could not identify this device. Please try again.');
        return;
      }
      await unifiedLogin(phone.trim(), otp.trim(), deviceId);
      // App.js reacts to the updated user (role:'driver'|'owner') — no
      // explicit navigation call needed here, same pattern the old
      // per-tab handlers used.
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Invalid or expired OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePhone = () => {
    setOtpSent(false);
    setOtp('');
    setTestOtp(null);
    setNeedsName(false);
    setName('');
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

        <TextInput
          style={styles.input}
          placeholder="Phone Number"
          placeholderTextColor="#888"
          keyboardType="phone-pad"
          maxLength={10}
          editable={!otpSent}
          value={phone}
          onChangeText={(t) => { setPhone(t.replace(/[^0-9]/g, '')); setNeedsName(false); setName(''); }}
        />

        {needsName && !otpSent && (
          <>
            <Text style={styles.label}>New here — what's your name?</Text>
            <TextInput
              style={styles.input}
              placeholder="Your Name"
              placeholderTextColor="#888"
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </>
        )}

        {otpSent && (
          <>
            <Text style={styles.label}>4-Digit OTP</Text>
            {testOtp && (
              <Text style={styles.testOtpBanner}>🧪 Test mode — OTP auto-filled: {testOtp}</Text>
            )}
            <PinInput length={4} value={otp} onChange={setOtp} autoFocus />
          </>
        )}

        <TouchableOpacity
          style={[styles.button, { marginTop: otpSent ? 20 : 8 }, loading && { opacity: 0.6 }]}
          onPress={otpSent ? handleVerifyOtp : handleSendOtp}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>{otpSent ? 'Verify OTP →' : 'Send OTP'}</Text>
          }
        </TouchableOpacity>

        {otpSent && (
          <TouchableOpacity onPress={handleChangePhone} style={{ marginTop: 12 }}>
            <Text style={styles.label}>Change phone number</Text>
          </TouchableOpacity>
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
