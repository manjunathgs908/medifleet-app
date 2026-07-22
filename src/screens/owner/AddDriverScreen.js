import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { ownerDriverApi } from '../../api/client';

/**
 * Owner adds a driver by name + phone, linked to their own owner
 * account server-side (owner: req.user._id — see
 * authController.createDriverAccount). No employeeId/PIN fields: those
 * are a legacy identifier from the old Employee-ID + PIN login era —
 * driver login is phone+OTP now, so the backend auto-generates
 * employeeId and never sets a PIN.
 */
export default function AddDriverScreen({ navigation }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert('Missing info', 'Please enter the driver\'s name.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      Alert.alert('Missing info', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setCreating(true);
    try {
      const { data } = await ownerDriverApi.register(name.trim(), phone.trim());
      Alert.alert(
        'Driver Added',
        `${data.driver.name} (${data.driver.employeeId}) can now log in with ${data.driver.phone} + OTP. They'll be asked to upload documents, then you can approve them from My Drivers.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not add driver.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.backTxt}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Add Driver</Text>
      <Text style={styles.subtitle}>
        They'll log in with this phone number + OTP, then upload documents for your approval.
      </Text>

      <Text style={styles.label}>Driver Name *</Text>
      <TextInput
        style={styles.input}
        placeholder="Full name"
        placeholderTextColor="#6b7280"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Phone Number *</Text>
      <TextInput
        style={styles.input}
        placeholder="10-digit mobile"
        placeholderTextColor="#6b7280"
        keyboardType="phone-pad"
        maxLength={10}
        value={phone}
        onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ''))}
      />

      <TouchableOpacity style={styles.submitBtn} onPress={handleAdd} disabled={creating}>
        {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnTxt}>Add Driver</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  content: { padding: 20, paddingTop: 54 },
  backTxt: { color: '#9ca3af', fontSize: 14, marginBottom: 18 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  subtitle: { color: '#9ca3af', fontSize: 13, marginTop: 6, marginBottom: 24, lineHeight: 18 },

  label: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: '#111827', borderRadius: 10, padding: 14, color: '#fff', fontSize: 15,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 20,
  },

  submitBtn: {
    backgroundColor: '#10b981', borderRadius: 10, paddingVertical: 15,
    alignItems: 'center', marginTop: 8,
  },
  submitBtnTxt: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
