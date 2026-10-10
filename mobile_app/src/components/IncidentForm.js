import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { theme } from '../styles/theme';

const QUICK_TAGS = [
  { label: 'Severe Road Accident', icon: 'car-emergency', text: 'Vehicular collision with severe injury and road obstruction.' },
  { label: 'Cardiac Arrest / Chest Pain', icon: 'heart-pulse', text: 'Patient collapsed, experiencing severe chest pain and breathlessness.' },
  { label: 'Unconscious / No Pulse', icon: 'account-alert', text: 'Victim is completely unresponsive, shallow breathing, pulse weak.' },
  { label: 'Severe Trauma & Bleeding', icon: 'water-alert', text: 'Heavy open wound bleeding from deep laceration, immediate tourniquet needed.' },
  { label: 'Fire & Severe Burns', icon: 'fire', text: 'Thermal burn injuries, smoke inhalation, rapid evacuation needed.' },
  { label: 'Stroke Symptoms', icon: 'brain', text: 'Facial drooping, sudden arm weakness, slurred speech.' },
];

export const IncidentForm = ({
  location,
  onRefreshLocation,
  onSubmit,
  onCancel,
  isSubmitting,
}) => {
  const [description, setDescription] = useState('');
  const [callerName, setCallerName] = useState('Citizen Caller');
  const [callerPhone, setCallerPhone] = useState('+91 98765 43210');
  const [selectedTag, setSelectedTag] = useState(null);
  const [validationError, setValidationError] = useState('');

  const handleSelectTag = (tag) => {
    setSelectedTag(tag.label);
    if (!description.trim()) {
      setDescription(tag.text);
    } else {
      setDescription((prev) => `${prev.trim()}\n• ${tag.text}`);
    }
  };

  const handleFormSubmit = () => {
    if (!description.trim()) {
      setValidationError('Please provide a brief description of the incident.');
      return;
    }
    setValidationError('');
    onSubmit({
      description: description.trim(),
      callerName: callerName.trim() || 'Citizen Caller',
      callerPhone: callerPhone.trim() || '+91 98765 43210',
      lat: location?.latitude || 18.5204,
      lng: location?.longitude || 73.8567,
    });
  };

  return (
    <View style={styles.cardContainer}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Urgent Header */}
        <View style={styles.headerRow}>
          <View style={styles.urgencyBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.urgencyBadgeText}>EMERGENCY PROTOCOL ACTIVE</Text>
          </View>
          <TouchableOpacity
            onPress={onCancel}
            style={styles.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>Incident Report</Text>
        <Text style={styles.subtitle}>
          Define what has occurred. Claude Haiku AI will triage urgency & reserve ER resources instantly.
        </Text>

        {/* GPS Coordinates Locked Banner */}
        <View style={styles.locationBanner}>
          <View style={styles.locationIconBox}>
            <MaterialCommunityIcons name="crosshairs-gps" size={22} color={theme.colors.crimson} />
          </View>
          <View style={styles.locationDetails}>
            <Text style={styles.locationLabel}>LOCK ON GPS COORDINATES</Text>
            <Text style={styles.locationCoords}>
              {location?.latitude?.toFixed(4) || '18.5204'}° N,{' '}
              {location?.longitude?.toFixed(4) || '73.8567'}° E
              <Text style={styles.locationCity}> (Pune Region)</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshLocBtn}
            onPress={onRefreshLocation}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="refresh" size={18} color={theme.colors.cyan} />
          </TouchableOpacity>
        </View>

        {/* Quick Triage Presets */}
        <Text style={styles.sectionHeader}>Quick Symptom / Incident Type</Text>
        <View style={styles.tagGrid}>
          {QUICK_TAGS.map((tag) => {
            const isSelected = selectedTag === tag.label;
            return (
              <TouchableOpacity
                key={tag.label}
                style={[styles.tagPill, isSelected && styles.tagPillSelected]}
                onPress={() => handleSelectTag(tag)}
              >
                <MaterialCommunityIcons
                  name={tag.icon}
                  size={14}
                  color={isSelected ? '#FFFFFF' : theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.tagText,
                    isSelected && styles.tagTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {tag.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Textual Incident Description */}
        <View style={styles.inputGroup}>
          <View style={styles.inputHeaderRow}>
            <Text style={styles.inputLabel}>Incident Description (Textual)</Text>
            <Text style={styles.aiTriageHint}>Claude Haiku Triage</Text>
          </View>
          <TextInput
            style={[
              styles.textArea,
              validationError ? styles.textAreaError : null,
            ]}
            placeholder="Describe what occurred (e.g. 2-wheeler collision, 1 unconscious victim, deep head injury, urgent ambulance required)..."
            placeholderTextColor={theme.colors.textMuted}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={(txt) => {
              setDescription(txt);
              if (validationError) setValidationError('');
            }}
            textAlignVertical="top"
          />
          {validationError ? (
            <Text style={styles.errorText}>⚠️ {validationError}</Text>
          ) : null}
        </View>

        {/* Caller Information */}
        <View style={styles.rowTwoCols}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.inputLabel}>Caller Name</Text>
            <TextInput
              style={styles.inputSingle}
              value={callerName}
              onChangeText={setCallerName}
              placeholder="Your Name"
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={styles.inputSingle}
              value={callerPhone}
              onChangeText={setCallerPhone}
              keyboardType="phone-pad"
              placeholder="+91..."
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              isSubmitting && styles.submitButtonDisabled,
            ]}
            onPress={handleFormSubmit}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <View style={styles.submittingRow}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.submitBtnText}>Transmitting Emergency SOS...</Text>
              </View>
            ) : (
              <View style={styles.submittingRow}>
                <MaterialCommunityIcons name="send-circle" size={24} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>TRANSMIT SOS & DISPATCH</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <Text style={styles.cancelBtnText}>Discard & Return to SOS</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    marginHorizontal: 12,
    marginVertical: 10,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  urgencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.crimson,
  },
  urgencyBadgeText: {
    color: theme.colors.crimson,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(24, 34, 52, 0.8)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    marginBottom: 16,
  },
  locationIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  locationDetails: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.6,
  },
  locationCoords: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  locationCity: {
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  },
  refreshLocBtn: {
    padding: 6,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    gap: 6,
  },
  tagPillSelected: {
    backgroundColor: theme.colors.crimson,
    borderColor: theme.colors.crimson,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  tagTextSelected: {
    color: '#FFFFFF',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  aiTriageHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#818CF8',
  },
  textArea: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: theme.colors.textPrimary,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 96,
  },
  textAreaError: {
    borderColor: theme.colors.crimson,
  },
  errorText: {
    color: theme.colors.dangerLight,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  rowTwoCols: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  inputSingle: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  buttonContainer: {
    marginTop: 6,
    gap: 8,
  },
  submitButton: {
    backgroundColor: theme.colors.crimson,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.crimson,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
