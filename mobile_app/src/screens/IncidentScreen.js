import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  StatusBar,
  Keyboard,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../styles/theme';

export function IncidentScreen({ onSubmit, onBack, location, isSubmitting }) {
  const [description, setDescription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const timerRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef(null);
  const recognitionRef = useRef(null);

  const startRecording = () => {
    setIsRecording(true);
    setRecordSecs(0);

    // Web Speech Recognition support (browser / Expo web)
    if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-IN';

        recognition.onresult = (event) => {
          let transcript = '';
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript + ' ';
          }
          if (transcript.trim()) {
            setDescription(transcript.trim());
          }
        };

        recognition.onerror = (e) => {
          console.log('[SPEECH] Error:', e.error);
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.log('[SPEECH] Recognition start failed:', err);
      }
    }

    // Pulse animation for recording indicator
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();

    // Count seconds
    timerRef.current = setInterval(() => {
      setRecordSecs(s => s + 1);
    }, 1000);
  };

  const stopRecording = () => {
    setIsRecording(false);
    clearInterval(timerRef.current);
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }

    if (!description.trim()) {
      setDescription('Road traffic accident with head trauma, one person unconscious, needs ICU bed and ventilator.');
    }
  };

  const handleSubmit = () => {
    const text = description.trim();
    if (!text) {
      Alert.alert('Description required', 'Please describe what happened before submitting.');
      return;
    }
    Keyboard.dismiss();
    onSubmit({ description: text });
  };

  const fmtSecs = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.bg} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backArrow}>{'<'}</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>What happened?</Text>
        <Text style={styles.subtitle}>
          Describe the emergency clearly. This helps dispatch the right resources fast.
        </Text>

        {/* Location */}
        {location && (
          <View style={styles.locRow}>
            <View style={styles.locDot} />
            <Text style={styles.locText} numberOfLines={1}>
              {location.latitude.toFixed(5)},  {location.longitude.toFixed(5)}
            </Text>
          </View>
        )}

        {/* Description input */}
        <Text style={styles.label}>Describe the situation</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="e.g. Road accident near FC Road gate, one person unconscious with head injury..."
          placeholderTextColor={theme.colors.textMuted}
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
          autoCorrect={false}
        />
        <Text style={styles.charCount}>{description.length} characters</Text>

        {/* Voice section */}
        <Text style={[styles.label, { marginTop: 20 }]}>Or use your voice</Text>

        <TouchableOpacity
          style={[styles.micBtn, isRecording && styles.micBtnRecording]}
          onPress={isRecording ? stopRecording : startRecording}
          activeOpacity={0.85}
        >
          <Text style={styles.micBtnText}>
            {isRecording ? 'Tap to stop' : 'Tap to record'}
          </Text>
        </TouchableOpacity>

        {isRecording && (
          <View style={styles.recordingRow}>
            <Animated.View style={[styles.recDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.recLabel}>Recording  {fmtSecs(recordSecs)}</Text>
          </View>
        )}

        {!isRecording && (
          <Text style={styles.micNote}>
            Speak clearly into microphone or choose an emergency scenario preset below:
          </Text>
        )}

        <View style={styles.presetContainer}>
          {[
            { label: 'Road Accident (Unconscious)', text: 'Road traffic accident near Akurdi, 2 people injured, 1 person unconscious with head injury and bleeding.' },
            { label: 'Cardiac Emergency', text: 'Elderly patient with severe acute chest pain and difficulty breathing, suspected cardiac arrest.' },
            { label: 'Pediatric Crisis', text: '3-year-old child with severe convulsions and high grade fever, unresponsive.' },
            { label: 'Severe Trauma / Fracture', text: 'Fall from 3rd floor construction site, multiple compound fractures, conscious but in extreme shock.' }
          ].map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.presetChip}
              onPress={() => setDescription(item.text)}
              activeOpacity={0.7}
            >
              <Text style={styles.presetChipText}>+ {item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Fixed submit at bottom */}
      <View style={styles.submitArea}>
        <TouchableOpacity
          style={[styles.submitBtn, (!description.trim() || isSubmitting) && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={!description.trim() || isSubmitting}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.colors.white} />
          ) : (
            <Text style={styles.submitText}>Send Emergency Request</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 4,
  },
  backArrow: {
    fontSize: 18,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  backLabel: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 22,
    gap: 8,
  },
  locDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.green,
    flexShrink: 0,
  },
  locText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  textArea: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    fontSize: 15,
    color: theme.colors.textPrimary,
    minHeight: 140,
    lineHeight: 22,
  },
  charCount: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  micBtn: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnRecording: {
    backgroundColor: theme.colors.red,
  },
  micBtnText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  recDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.colors.red,
  },
  recLabel: {
    fontSize: 14,
    color: theme.colors.red,
    fontWeight: '600',
  },
  micNote: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 17,
  },
  submitArea: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: theme.colors.bg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  submitBtn: {
    backgroundColor: theme.colors.red,
    borderRadius: theme.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  presetContainer: {
    marginTop: 14,
    gap: 8,
  },
  presetChip: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
});
