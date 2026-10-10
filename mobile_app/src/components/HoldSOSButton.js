import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../styles/theme';

const HOLD_DURATION_MS = 3000;
const BUTTON_SIZE = 200;
const STROKE_WIDTH = 8;
const RADIUS = (BUTTON_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const HoldSOSButton = ({ onTrigger }) => {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [countdownText, setCountdownText] = useState('HOLD 3s');
  const [releaseWarning, setReleaseWarning] = useState(false);

  // Animated values
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Timers & interval refs
  const holdTimeoutRef = useRef(null);
  const hapticIntervalRef = useRef(null);
  const warningTimeoutRef = useRef(null);

  // Background radar pulse animation (runs when not holding)
  useEffect(() => {
    let loop;
    if (!isHolding) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    }
    return () => {
      if (loop) loop.stop();
    };
  }, [isHolding]);

  // Track animated value and update SVG circle & countdown text
  useEffect(() => {
    const listenerId = animatedProgress.addListener(({ value }) => {
      setProgress(value);
      const remainingSeconds = Math.max(0, (HOLD_DURATION_MS * (1 - value)) / 1000);
      if (value >= 0.98) {
        setCountdownText('ACTIVATED!');
      } else if (remainingSeconds > 0) {
        setCountdownText(`HOLD ${(remainingSeconds).toFixed(1)}s`);
      }
    });

    return () => {
      animatedProgress.removeListener(listenerId);
    };
  }, []);

  const triggerHaptic = (type) => {
    if (Platform.OS === 'web') return;
    try {
      if (type === 'tick') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (type === 'heavy') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else if (type === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      // Haptics fallback
    }
  };

  const handlePressIn = () => {
    setIsHolding(true);
    setReleaseWarning(false);
    clearTimeout(warningTimeoutRef.current);

    triggerHaptic('heavy');

    // Scale up button slightly
    Animated.spring(scaleAnim, {
      toValue: 1.05,
      friction: 4,
      useNativeDriver: true,
    }).start();

    // Start 3000ms progress fill
    animatedProgress.setValue(0);
    Animated.timing(animatedProgress, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // Periodic haptic tick every 600ms
    let tickCount = 0;
    hapticIntervalRef.current = setInterval(() => {
      tickCount++;
      triggerHaptic('tick');
    }, 600);

    // Timeout when 3000ms completes
    holdTimeoutRef.current = setTimeout(() => {
      clearInterval(hapticIntervalRef.current);
      triggerHaptic('success');
      setIsHolding(false);
      onTrigger && onTrigger();
    }, HOLD_DURATION_MS);
  };

  const handlePressOut = () => {
    if (progress < 0.98) {
      // Released too early
      clearTimeout(holdTimeoutRef.current);
      clearInterval(hapticIntervalRef.current);
      setIsHolding(false);

      // Smoothly snap back
      Animated.timing(animatedProgress, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start();

      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }).start();

      setCountdownText('HOLD 3s');
      setReleaseWarning(true);
      warningTimeoutRef.current = setTimeout(() => {
        setReleaseWarning(false);
      }, 3500);
    }
  };

  const strokeDashoffset = CIRCUMFERENCE - progress * CIRCUMFERENCE;

  return (
    <View style={styles.container}>
      {/* Outer Glowing Ripple Ring */}
      <Animated.View
        style={[
          styles.outerPulseRing,
          {
            transform: [{ scale: pulseAnim }],
            opacity: isHolding ? 0.8 : 0.35,
          },
        ]}
      />

      {/* Secondary Pulse Ring */}
      <Animated.View
        style={[
          styles.secondaryPulseRing,
          {
            transform: [{ scale: isHolding ? 1.15 : 1 }],
            opacity: isHolding ? 0.6 : 0.2,
          },
        ]}
      />

      {/* Main Interactive Button with Scale */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          delayPressIn={0}
          pressRetentionOffset={{ top: 50, bottom: 50, left: 50, right: 50 }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={({ pressed }) => [
            styles.buttonWrapper,
            pressed && styles.buttonPressed,
          ]}
        >
          {/* SVG Progress Ring */}
          <Svg
            width={BUTTON_SIZE}
            height={BUTTON_SIZE}
            style={styles.svgRing}
          >
            <Defs>
              <SvgLinearGradient id="sosGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#EF4444" />
                <Stop offset="50%" stopColor="#F87171" />
                <Stop offset="100%" stopColor="#FBBF24" />
              </SvgLinearGradient>
            </Defs>

            {/* Background inactive track */}
            <Circle
              cx={BUTTON_SIZE / 2}
              cy={BUTTON_SIZE / 2}
              r={RADIUS}
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth={STROKE_WIDTH}
              fill="transparent"
            />

            {/* Active Progress Ring */}
            <Circle
              cx={BUTTON_SIZE / 2}
              cy={BUTTON_SIZE / 2}
              r={RADIUS}
              stroke="url(#sosGrad)"
              strokeWidth={STROKE_WIDTH + 1}
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              transform={`rotate(-90 ${BUTTON_SIZE / 2} ${BUTTON_SIZE / 2})`}
            />
          </Svg>

          {/* Center Button Body */}
          <View style={styles.centerDisc}>
            <MaterialCommunityIcons
              name={isHolding ? 'alarm-light' : 'shield-alert'}
              size={36}
              color={theme.colors.textPrimary}
              style={styles.icon}
            />
            <Text style={styles.sosText}>SOS</Text>
            <Text style={styles.countdownText}>
              {isHolding ? countdownText : 'HOLD 3 SEC'}
            </Text>
          </View>
        </Pressable>
      </Animated.View>

      {/* Feedback & Instructions Hint */}
      <View style={styles.hintContainer}>
        {releaseWarning ? (
          <View style={styles.warningPill}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FBBF24" />
            <Text style={styles.warningText}>
              Hold continuously for 3 full seconds to trigger
            </Text>
          </View>
        ) : (
          <Text style={styles.instructionText}>
            {isHolding
              ? 'Keep pressing until circle completes...'
              : 'Press & hold to trigger instant emergency dispatch'}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  outerPulseRing: {
    position: 'absolute',
    width: BUTTON_SIZE + 72,
    height: BUTTON_SIZE + 72,
    borderRadius: (BUTTON_SIZE + 72) / 2,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  secondaryPulseRing: {
    position: 'absolute',
    width: BUTTON_SIZE + 36,
    height: BUTTON_SIZE + 36,
    borderRadius: (BUTTON_SIZE + 36) / 2,
    backgroundColor: 'rgba(220, 38, 38, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  buttonWrapper: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  buttonPressed: {
    shadowOpacity: 0.85,
    shadowRadius: 32,
  },
  svgRing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  centerDisc: {
    width: BUTTON_SIZE - 24,
    height: BUTTON_SIZE - 24,
    borderRadius: (BUTTON_SIZE - 24) / 2,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  icon: {
    marginBottom: 2,
  },
  sosText: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 3,
  },
  countdownText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hintContainer: {
    marginTop: 26,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  warningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  warningText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '600',
  },
});
