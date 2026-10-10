import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { theme } from '../styles/theme';

export function ConfirmationModal({ visible, incident, onClose, onTrack }) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Indicator */}
          <View style={styles.iconRow}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>!</Text>
            </View>
          </View>

          <Text style={styles.title}>Emergency Request Created</Text>
          <Text style={styles.body}>
            Your emergency request has been received. You can track ambulance dispatch and hospital bed allocation live.
          </Text>

          {incident?.id && (
            <View style={styles.idCard}>
              <View style={styles.idTopRow}>
                <Text style={styles.idLabel}>REQUEST ID</Text>
                {incident.status && (
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>{incident.status}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.idValue}>{incident.id}</Text>

              {incident.triageLevel && (
                <View style={styles.triageRow}>
                  <Text style={styles.triageLabel}>Triage Level:</Text>
                  <Text style={styles.triageValue}>{incident.triageLevel}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.trackBtn}
              onPress={onTrack}
              activeOpacity={0.85}
            >
              <Text style={styles.trackBtnText}>Track My Request</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.closeBtnText}>Return to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: 14,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF5E9',
    borderWidth: 2,
    borderColor: '#C5DEB0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.greenDark,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  idCard: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  idTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  idLabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusPill: {
    backgroundColor: '#EEF5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: '#C5DEB0',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.greenDark,
  },
  idValue: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  triageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  triageLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  triageValue: {
    fontSize: 11,
    color: theme.colors.red,
    fontWeight: '700',
  },
  actions: {
    gap: 10,
  },
  trackBtn: {
    backgroundColor: theme.colors.greenDark,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  trackBtnText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  closeBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
});
