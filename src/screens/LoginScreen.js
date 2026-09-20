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
 * (POST /auth/unified-send-otp, /unified-verify-otp) decides whether this
 * phone is a driver or an owner; the app routes on whatever `user.role`
 * comes back (App.js's role branching is unaffected by how login happened).
 *
 * WHY THERE IS NO "NOT REGISTERED" RESPONSE TO REACT TO
 *
 * send-otp deliberately answers an unknown number exactly as it answers a
 * known one. Anything else makes it a phone directory: feed it numbers,
 * keep the ones that come back different. So the app cannot be told whether
 * a number has an account, and must not try to infer it.
 *
 * Register as Partner is therefore always on screen rather than appearing
 * when the server says "unknown" — it needs no server signal at all. The
 * "Not registered?" line beside it is a static prompt, not a verdict about
 * the number typed above.
 */
export default function LoginScreen({ navigation }) {
  const { unifiedLogin, deviceKicked, dismissDeviceKicked } = useAuth();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (phone.trim().length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setLoading(true);
    try {
      await unifiedAuthApi.sendOtp(phone.trim());
      setOtpSent(true);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
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
          onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ''))}
        />

        {otpSent && (
          <>
            <Text style={styles.label}>6-Digit OTP</Text>
            <PinInput length={6} value={otp} onChange={setOtp} autoFocus />
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

        {/* Always visible — see the note at the top of this file. The number
            already typed is carried across so it is not asked for twice. */}
        <View style={styles.registerBlock}>
          <Text style={styles.registerHint}>Not registered?</Text>
          <TouchableOpacity
            style={styles.registerButton}
            onPress={() => navigation.navigate('RegisterPartner', { phone: phone.trim() })}
          >
            <Text style={styles.registerButtonText}>Register as Partner</Text>
          </TouchableOpacity>
          <Text style={styles.registerNote}>
            Drivers are added by their fleet owner — ask them to add your number.
          </Text>
        </View>
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
  registerBlock: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    alignItems: 'center',
  },
  registerHint: { color: '#9ca3af', fontSize: 13, marginBottom: 10 },
  registerButton: {
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  registerButtonText: { color: '#10b981', fontSize: 15, fontWeight: 'bold' },
  registerNote: {
    color: '#6b7280',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
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
});
