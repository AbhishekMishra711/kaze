import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SOSButton } from '../components/SOSButton';
import { theme } from '../styles/theme';

export function HomeScreen({
  onActivate,
  location,
  activeIncident,
  onTrackIncident,
  onCancelIncident,
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!activeIncident) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [activeIncident]);

  const confirmCancel = () => {
    Alert.alert(
      'Cancel Emergency Request?',
      'Are you sure you want to end tracking for this incident?',
      [
        { text: 'Keep Tracking', style: 'cancel' },
        {
          text: 'Cancel SOS',
          style: 'destructive',
          onPress: onCancelIncident,
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.bg} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>Kaze</Text>
          <Text style={styles.tagline}>Emergency Response</Text>
        </View>

        {/* Active Incident Card (Visible when user has an ongoing request) */}
        {activeIncident && (
          <View style={styles.activeCard}>
            {/* Status Header */}
            <View style={styles.cardHeaderRow}>
              <View style={styles.liveIndicator}>
                <Animated.View
                  style={[
                    styles.pulseDot,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
                <Text style={styles.liveText}>ONGOING REQUEST</Text>
              </View>

              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>
                  {activeIncident.status || 'ALLOCATING'}
                </Text>
              </View>
            </View>

            {/* Request ID */}
            <View style={styles.idContainer}>
              <Text style={styles.idLabel}>Request ID</Text>
              <Text style={styles.idValue} numberOfLines={1}>
                {activeIncident.id}
              </Text>
            </View>

            {/* Triage & Address Info */}
            <View style={styles.metaRow}>
              {activeIncident.triageLevel && (
                <View style={styles.triageTag}>
                  <Text style={styles.triageText}>{activeIncident.triageLevel}</Text>
                </View>
              )}
              {activeIncident.addressText && (
                <Text style={styles.addressText} numberOfLines={1}>
                  {activeIncident.addressText}
                </Text>
              )}
            </View>

            {/* Description Preview */}
            {activeIncident.description ? (
              <Text style={styles.descSnippet} numberOfLines={2}>
                "{activeIncident.description}"
              </Text>
            ) : null}

            {/* Requirements Pills */}
            {Array.isArray(activeIncident.requirements) &&
              activeIncident.requirements.length > 0 && (
                <View style={styles.reqRow}>
                  {activeIncident.requirements.map((req, idx) => (
                    <View key={idx} style={styles.reqPill}>
                      <Text style={styles.reqText}>
                        {req.quantity}x {req.category?.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

            {/* Card Actions */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.trackButton}
                onPress={onTrackIncident}
                activeOpacity={0.85}
              >
                <Text style={styles.trackButtonText}>Track Current Request</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelLink}
                onPress={confirmCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelLinkText}>Cancel / End SOS</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SOS Button Area */}
        <View style={[styles.center, activeIncident ? styles.centerWithActive : null]}>
          <SOSButton onActivate={onActivate} />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {location ? (
            <View style={styles.locPill}>
              <View style={styles.locDot} />
              <Text style={styles.locText}>
                {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
              </Text>
            </View>
          ) : (
            <View style={styles.locPill}>
              <View style={[styles.locDot, { backgroundColor: theme.colors.textMuted }]} />
              <Text style={styles.locText}>Fetching location...</Text>
            </View>
          )}

          <Text style={styles.footerNote}>
            {activeIncident
              ? 'An emergency request is currently active. Hold button again only to issue an additional alert.'
              : 'Press and hold the button for 3 seconds to send an emergency signal'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  appName: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
    fontWeight: '400',
  },

  // Active Incident Card
  activeCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: '#C5DEB0',
    padding: 18,
    marginTop: 10,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.greenDark,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.greenDark,
    letterSpacing: 0.8,
  },
  statusPill: {
    backgroundColor: '#EEF5E9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: '#C5DEB0',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.greenDark,
  },
  idContainer: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  idLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '500',
    marginBottom: 2,
  },
  idValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    fontFamily: 'monospace',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  triageTag: {
    backgroundColor: '#FDEDEC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#F5B7B1',
  },
  triageText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.red,
    letterSpacing: 0.5,
  },
  addressText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  descSnippet: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  reqRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  reqPill: {
    backgroundColor: '#EEF5E9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#C5DEB0',
  },
  reqText: {
    fontSize: 11,
    color: theme.colors.greenDark,
    fontWeight: '600',
  },
  actionRow: {
    gap: 8,
  },
  trackButton: {
    backgroundColor: theme.colors.greenDark,
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  trackButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  cancelLinkText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
  },
  centerWithActive: {
    minHeight: 240,
    marginVertical: 10,
  },
  footer: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
  },
  locPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  locDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.green,
  },
  locText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  footerNote: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 280,
  },
});
