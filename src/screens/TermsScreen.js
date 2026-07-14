import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

export default function TermsScreen({ onDone }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Terms & Conditions</Text>

        <ScrollView style={styles.scrollBox} contentContainerStyle={{ padding: 14 }}>
          <Text style={styles.bodyText}>
            By using the MediFleet driver app, you agree to follow all applicable traffic and
            safety regulations, keep your location sharing enabled while on duty, and use the app
            solely for authorized ambulance dispatch and trip management. Your location and trip
            data will be shared with your fleet owner/admin for dispatch and compliance purposes.
            Review the full Privacy Policy with your fleet owner/admin.
          </Text>
        </ScrollView>

        <TouchableOpacity style={styles.checkRow} onPress={() => setAgreed(a => !a)} activeOpacity={0.7}>
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>I agree to the Terms & Conditions and Privacy Policy</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, !agreed && { opacity: 0.5 }]}
          onPress={onDone}
          disabled={!agreed}
        >
          <Text style={styles.buttonText}>Continue →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0a0f1e',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 16 },
  scrollBox: {
    maxHeight: 220, backgroundColor: '#1f2937', borderRadius: 12, marginBottom: 18,
  },
  bodyText: { color: '#9ca3af', fontSize: 13, lineHeight: 20 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#4b5563',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#10b981', borderColor: '#10b981' },
  checkmark: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  checkLabel: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 18 },
  button: { backgroundColor: '#10b981', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
