import React, { useRef } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';

/**
 * Boxed, masked numeric entry — plain RN components, no extra deps.
 * Originally built for PIN entry, now reused by LoginScreen's Driver and
 * Owner tabs for 6-digit OTP entry.
 */
export default function PinInput({ length = 6, value, onChange, autoFocus }) {
  const refs = useRef([]);
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length);

  function handleChange(i, v) {
    if (!/^[0-9]?$/.test(v)) return;
    const next = digits.slice();
    next[i] = v;
    onChange(next.join(''));
    if (v && i < length - 1) refs.current[i + 1]?.focus();
  }

  function handleKeyPress(i, e) {
    if (e.nativeEvent.key === 'Backspace' && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  }

  return (
    <View style={styles.row}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => (refs.current[i] = el)}
          style={[styles.box, { borderColor: d ? '#10b981' : '#374151' }]}
          keyboardType="number-pad"
          maxLength={1}
          secureTextEntry
          value={d}
          onChangeText={(v) => handleChange(i, v)}
          onKeyPress={(e) => handleKeyPress(i, e)}
          autoFocus={autoFocus && i === 0}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  box: {
    width: 44,
    height: 52,
    backgroundColor: '#1f2937',
    borderWidth: 2,
    borderRadius: 10,
    textAlign: 'center',
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
});
