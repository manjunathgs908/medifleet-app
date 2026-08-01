import React, { useRef, useState } from 'react';
import { View, Text, Animated, PanResponder, StyleSheet } from 'react-native';

const THUMB_SIZE = 56;
const TRACK_PADDING = 4;
const ACCEPT_THRESHOLD_RATIO = 0.75; // fraction of the available drag distance that counts as "accepted"

/**
 * Ola/Uber-style slide-to-accept control. PanResponder + Animated — both
 * core React Native, no extra dependency (package.json has no gesture/
 * slider library installed, and this is a single deliberate action, unlike
 * Reject which stays a normal one-tap button elsewhere on the screen).
 *
 * onAccept may be async; the thumb only resets back to start if it doesn't
 * resolve into a navigation away from this screen (e.g. acceptTrip failed
 * and the caller caught it internally) — see IncomingTripScreen's own
 * handleAccept, which never re-throws, just Alert.alert()s and lets this
 * component's reset run harmlessly whether or not the screen is still up.
 */
export default function SlideToAccept({ onAccept, disabled, label = 'Slide to Accept' }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const pan = useRef(new Animated.Value(0)).current;

  const maxDrag = Math.max(0, trackWidth - THUMB_SIZE - TRACK_PADDING * 2);

  // PanResponder.create(...) below only runs once -- useRef's initializer
  // is never re-evaluated on later renders -- so its handler closures
  // captured maxDrag/disabled from that FIRST render, before onLayout
  // ever fired (trackWidth, and therefore maxDrag, was still 0). Every
  // drag then clamped to Math.min(dx, 0) = 0 forever. Mirroring both into
  // refs reassigned every render fixes this without recreating the
  // PanResponder itself, which would risk resetting an in-progress
  // gesture if trackWidth happened to change mid-drag.
  const maxDragRef = useRef(maxDrag);
  maxDragRef.current = maxDrag;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderMove: (_, gesture) => {
        const next = Math.min(Math.max(0, gesture.dx), maxDragRef.current);
        pan.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const currentMaxDrag = maxDragRef.current;
        if (currentMaxDrag > 0 && gesture.dx >= currentMaxDrag * ACCEPT_THRESHOLD_RATIO) {
          Animated.timing(pan, { toValue: currentMaxDrag, duration: 120, useNativeDriver: false }).start(async () => {
            try {
              await onAccept();
            } finally {
              Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
            }
          });
        } else {
          Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  const labelOpacity = pan.interpolate({
    inputRange: [0, Math.max(1, maxDrag)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[styles.track, disabled && styles.trackDisabled]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.Text style={[styles.label, { opacity: labelOpacity }]} pointerEvents="none">
        {disabled ? 'Please wait…' : `${label}  →`}
      </Animated.Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.thumb, { transform: [{ translateX: pan }] }]}
      >
        <Text style={styles.thumbIcon}>✓</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB_SIZE + TRACK_PADDING * 2,
    borderRadius: (THUMB_SIZE + TRACK_PADDING * 2) / 2,
    backgroundColor: 'rgba(20,184,166,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(20,184,166,0.4)',
    justifyContent: 'center',
    padding: TRACK_PADDING,
    overflow: 'hidden',
  },
  trackDisabled: { opacity: 0.6 },
  label: {
    position: 'absolute',
    alignSelf: 'center',
    color: '#14B8A6',
    fontSize: 18,
    fontWeight: '800',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#14B8A6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbIcon: { color: '#fff', fontSize: 26, fontWeight: '900' },
});
