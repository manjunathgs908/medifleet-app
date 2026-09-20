import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import PinInput from '../components/PinInput';
import { ownerAuthApi } from '../api/client';

/**
 * Partner sign-up. The only path that creates an Owner.
 *
 * Two steps, matching the backend: POST /owners/register/send-otp puts a
 * code against the phone, then POST /owners/register spends it and creates
 * the Owner at kycStatus 'pending'. Nothing exists until the code is
 * proven — a partner who abandons this screen halfway leaves no account
 * behind, which is the whole reason registration moved off the login path.
 *
 * No session is issued at the end. The partner waits for a SaveLife admin
 * to approve them in the CRM, then logs in normally on the previous screen.
 */
export default function RegisterPartnerScreen({ navigation, route }) {
  // Carried over when the partner taps "Register as Partner" after having
  // already typed their number on the login screen — no reason to ask twice.
  const [phone, setPhone] = useState(route?.params?.phone || '');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSendOtp = async () => {
    if (phone.trim().length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setLoading(true);
    try {
      await ownerAuthApi.sendRegistrationOtp(phone.trim());
      setOtpSent(true);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (otp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit OTP.');
      return;
    }
    if (!name.trim())         { Alert.alert('Error', 'Please enter your name.'); return; }
    if (!businessName.trim()) { Alert.alert('Error', 'Please enter your business name.'); return; }

    setLoading(true);
    try {
      // Bank details are sent only when something was actually filled in —
      // an object of empty strings would write blank fields rather than
      // leaving them unset.
      const hasBank = accountName || accountNumber || ifsc || bankName;

      await ownerAuthApi.register({
        phone       : phone.trim(),
        otp         : otp.trim(),
        name        : name.trim(),
        businessName: businessName.trim(),
        gstin       : gstin.trim() || undefined,
        pan         : pan.trim() || undefined,
        bankDetails : hasBank ? {
          accountName  : accountName.trim(),
          accountNumber: accountNumber.trim(),
          ifsc         : ifsc.trim(),
          bankName     : bankName.trim(),
        } : undefined,
      });
      setDone(true);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not complete registration.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>✅ Submitted</Text>
          <Text style={styles.body}>
            Your partner registration has been sent to SaveLife for approval.
            You'll be able to log in with this number once it's approved.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.buttonText}>Back to login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a0f1e' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Register as Partner</Text>
          <Text style={styles.subtitle}>
            Run your ambulances on SaveLife. We'll review your details before activating the account.
          </Text>

          <Text style={styles.label}>Mobile number</Text>
          <TextInput
            style={styles.input}
            placeholder="10-digit mobile number"
            placeholderTextColor="#888"
            keyboardType="phone-pad"
            maxLength={10}
            editable={!otpSent}
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ''))}
          />

          {!otpSent ? (
            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.6 }]}
              onPress={handleSendOtp}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send OTP</Text>}
            </TouchableOpacity>
          ) : (
            <>
              <Text style={styles.label}>6-digit OTP</Text>
              <PinInput length={6} value={otp} onChange={setOtp} autoFocus />

              <TouchableOpacity onPress={() => { setOtpSent(false); setOtp(''); }} style={{ marginVertical: 12 }}>
                <Text style={styles.linkSmall}>Change number</Text>
              </TouchableOpacity>

              <View style={styles.divider} />
              <Text style={styles.section}>Your details</Text>

              <Text style={styles.label}>Your name *</Text>
              <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#888"
                value={name} onChangeText={setName} />

              <Text style={styles.label}>Business name *</Text>
              <TextInput style={styles.input} placeholder="Registered or trading name" placeholderTextColor="#888"
                value={businessName} onChangeText={setBusinessName} />

              <Text style={styles.label}>GSTIN (optional)</Text>
              <TextInput style={styles.input} placeholder="15-character GSTIN" placeholderTextColor="#888"
                autoCapitalize="characters" maxLength={15}
                value={gstin} onChangeText={(t) => setGstin(t.toUpperCase())} />

              <Text style={styles.label}>PAN (optional)</Text>
              <TextInput style={styles.input} placeholder="10-character PAN" placeholderTextColor="#888"
                autoCapitalize="characters" maxLength={10}
                value={pan} onChangeText={(t) => setPan(t.toUpperCase())} />

              <View style={styles.divider} />
              <Text style={styles.section}>Bank details (optional)</Text>
              <Text style={styles.hint}>Used for payouts. You can add these later.</Text>

              <Text style={styles.label}>Account holder name</Text>
              <TextInput style={styles.input} placeholder="As printed on the passbook" placeholderTextColor="#888"
                value={accountName} onChangeText={setAccountName} />

              <Text style={styles.label}>Account number</Text>
              <TextInput style={styles.input} placeholder="Account number" placeholderTextColor="#888"
                keyboardType="number-pad"
                value={accountNumber} onChangeText={(t) => setAccountNumber(t.replace(/[^0-9]/g, ''))} />

              <Text style={styles.label}>IFSC</Text>
              <TextInput style={styles.input} placeholder="11-character IFSC" placeholderTextColor="#888"
                autoCapitalize="characters" maxLength={11}
                value={ifsc} onChangeText={(t) => setIfsc(t.toUpperCase())} />

              <Text style={styles.label}>Bank name</Text>
              <TextInput style={styles.input} placeholder="Bank name" placeholderTextColor="#888"
                value={bankName} onChangeText={setBankName} />

              <TouchableOpacity
                style={[styles.button, { marginTop: 20 }, loading && { opacity: 0.6 }]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonText}>Submit registration</Text>}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
            <Text style={styles.linkSmall}>Already registered? Log in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e', justifyContent: 'center', alignItems: 'center', padding: 20 },
  scroll   : { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card     : { backgroundColor: '#111827', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440 },
  title    : { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 6 },
  subtitle : { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginBottom: 22, lineHeight: 19 },
  section  : { fontSize: 15, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  hint     : { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  label    : { color: '#9ca3af', fontSize: 13, marginBottom: 6 },
  linkSmall: { color: '#10b981', fontSize: 13, textAlign: 'center' },
  body     : { color: '#9ca3af', fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 22 },
  input    : { backgroundColor: '#1f2937', borderRadius: 10, padding: 14, color: '#fff', fontSize: 16, marginBottom: 14 },
  divider  : { height: 1, backgroundColor: '#1f2937', marginVertical: 18 },
  button   : { backgroundColor: '#10b981', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
