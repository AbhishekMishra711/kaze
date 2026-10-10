import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Easing,
  Platform,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { theme } from '../styles/theme';

const SIZE = 180;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;
const HOLD_MS = 3000;

export function SOSButton({ onActivate }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [earlyRelease, setEarlyRelease] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef(null);
  const earlyTimer = useRef(null);

  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      setProgress(value);
      setCountdown(Math.ceil(3 * (1 - value)));
    });
    return () => progressAnim.removeListener(id);
  }, []);

  const haptic = (type) => {
    if (Platform.OS === 'web') return;
    try {
      if (type === 'start') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      else if (type === 'tick') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      else if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_) {}
  };

  const startHold = () => {
    clearTimeout(earlyTimer.current);
    setEarlyRelease(false);
    setHolding(true);
    haptic('start');
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    holdTimer.current = setTimeout(() => {
      haptic('success');
      setHolding(false);
      setProgress(0);
      progressAnim.setValue(0);
      onActivate && onActivate();
    }, HOLD_MS);
  };

  const stopHold = () => {
    if (progress >= 0.98) return;
    clearTimeout(holdTimer.current);
    progressAnim.stopAnimation();
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
    setHolding(false);
    setCountdown(3);
    setEarlyRelease(true);
    earlyTimer.current = setTimeout(() => setEarlyRelease(false), 2500);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: startHold,
      onPanResponderRelease: stopHold,
      onPanResponderTerminate: stopHold,
    })
  ).current;

  const strokeOffset = CIRC - progress * CIRC;

  return (
    <View style={styles.wrapper}>
      <View {...pan.panHandlers} style={styles.hitArea}>
        {/* Progress ring */}
        <Svg
          width={SIZE}
          height={SIZE}
          style={StyleSheet.absoluteFill}
        >
          {/* Track */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="#E0E0E0"
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Progress */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={theme.colors.red}
            strokeWidth={STROKE}
            strokeDasharray={`${CIRC} ${CIRC}`}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            fill="none"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>

        {/* Button disc */}
        <View style={[styles.disc, holding && styles.discActive]}>
          <Text style={styles.sosLabel}>SOS</Text>
          {holding ? (
            <Text style={styles.countdown}>{countdown}</Text>
          ) : (
            <Text style={styles.holdHint}>Hold 3 sec</Text>
          )}
        </View>
      </View>

      {earlyRelease && (
        <Text style={styles.earlyMsg}>Keep holding until the circle completes</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  hitArea: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: SIZE - 24,
    height: SIZE - 24,
    borderRadius: (SIZE - 24) / 2,
    backgroundColor: theme.colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discActive: {
    backgroundColor: '#C55A5A',
  },
  sosLabel: {
    fontSize: 36,
    fontWeight: '800',
    color: theme.colors.white,
    letterSpacing: 3,
  },
  countdown: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  holdHint: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
  },
  earlyMsg: {
    marginTop: 20,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
