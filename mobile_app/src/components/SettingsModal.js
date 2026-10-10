import React, { useState } from 'react';
import {
  Modal,
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
import {
  getApiBaseUrl,
  setApiBaseUrl,
  checkBackendHealth,
  DEFAULT_BASE_URL,
} from '../api/apiService';

const PRESET_URLS = [
  { label: 'This Mac Wi-Fi (192.168.137.107:4000)', url: 'http://192.168.137.107:4000' },
  { label: 'Localhost (Web / Port 4000)', url: 'http://localhost:4000' },
  { label: 'Android Emulator (10.0.2.2:4000)', url: 'http://10.0.2.2:4000' },
];

export const SettingsModal = ({ visible, onClose, onUrlUpdated }) => {
  const [currentUrl, setCurrentUrl] = useState(getApiBaseUrl());
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const reachable = await checkBackendHealth(currentUrl);
    setIsTesting(false);
    setTestResult({
      success: reachable,
      message: reachable
        ? 'Connected to HLTH-02 Backend successfully!'
        : 'Backend server not responding at this URL. Fallback simulation mode will be used automatically.',
    });
  };

  const handleSave = () => {
    setApiBaseUrl(currentUrl);
    onUrlUpdated && onUrlUpdated(currentUrl);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="server-network" size={22} color={theme.colors.cyan} />
              <Text style={styles.headerTitle}>Backend API Settings</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionDesc}>
              Configure the HLTH-02 Backend REST API URL for citizen SOS trigger and live triage tracking.
            </Text>

            {/* URL Input */}
            <Text style={styles.inputLabel}>Backend Base URL</Text>
            <TextInput
              style={styles.textInput}
              value={currentUrl}
              onChangeText={(txt) => {
                setCurrentUrl(txt);
                setTestResult(null);
              }}
              placeholder="http://localhost:4000"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Quick Presets */}
            <Text style={styles.presetLabel}>Quick Presets</Text>
            <View style={styles.presetsContainer}>
              {PRESET_URLS.map((preset) => (
                <TouchableOpacity
                  key={preset.url}
                  style={[
                    styles.presetBtn,
                    currentUrl === preset.url && styles.presetBtnActive,
                  ]}
                  onPress={() => {
                    setCurrentUrl(preset.url);
                    setTestResult(null);
                  }}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      currentUrl === preset.url && styles.presetBtnTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Test Connection Button */}
            <TouchableOpacity
              style={styles.testBtn}
              onPress={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="lan-connect" size={18} color="#FFFFFF" />
                  <Text style={styles.testBtnText}>Test Server Connection</Text>
                </>
              )}
            </TouchableOpacity>

            {testResult && (
              <View
                style={[
                  styles.resultBox,
                  testResult.success ? styles.resultBoxSuccess : styles.resultBoxFail,
                ]}
              >
                <MaterialCommunityIcons
                  name={testResult.success ? 'check-circle' : 'alert-circle'}
                  size={18}
                  color={testResult.success ? theme.colors.emerald : '#F59E0B'}
                />
                <Text
                  style={[
                    styles.resultText,
                    testResult.success ? { color: theme.colors.emerald } : { color: '#F59E0B' },
                  ]}
                >
                  {testResult.message}
                </Text>
              </View>
            )}

            {/* Document Endpoints Reference */}
            <View style={styles.specBox}>
              <Text style={styles.specTitle}>API DIRECTORY MAPPING (PDF)</Text>
              <View style={styles.specItem}>
                <Text style={styles.specMethod}>POST</Text>
                <Text style={styles.specEndpoint}>/api/v1/incidents/sos</Text>
              </View>
              <Text style={styles.specDetail}>
                Submits GPS coordinates & description. Triggers Claude Haiku triage.
              </Text>

              <View style={[styles.specItem, { marginTop: 8 }]}>
                <Text style={[styles.specMethod, { backgroundColor: '#3B82F6' }]}>GET</Text>
                <Text style={styles.specEndpoint}>/api/v1/incidents/:id</Text>
              </View>
              <Text style={styles.specDetail}>
                Live Incident Tracking: status, assigned hospital, ambulance plate, 5-min hold timer.
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save & Apply</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 14,
  },
  presetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  presetsContainer: {
    gap: 6,
    marginBottom: 14,
  },
  presetBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  presetBtnActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: theme.colors.cyan,
  },
  presetBtnText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  presetBtnTextActive: {
    color: theme.colors.cyan,
    fontWeight: '700',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  testBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginBottom: 14,
  },
  resultBoxSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  resultBoxFail: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  resultText: {
    fontSize: 12,
    flex: 1,
    fontWeight: '600',
  },
  specBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: theme.borderRadius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 18,
  },
  specTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  specMethod: {
    backgroundColor: theme.colors.crimson,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  specEndpoint: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  specDetail: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  modalActions: {
    marginTop: 4,
  },
  saveBtn: {
    backgroundColor: theme.colors.crimson,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
