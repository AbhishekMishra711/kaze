import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { theme } from '../styles/theme';
import { fetchIncidentStatus } from '../api/apiService';

export const IncidentTracker = ({ incident, onReset, isLiveBackend }) => {
  // Hold timer countdown (defaults to 300s = 5 mins per the API spec)
  const [secondsRemaining, setSecondsRemaining] = useState(
    incident?.holdTimerSeconds || 300
  );
  const [liveStatus, setLiveStatus] = useState(incident?.status || 'RESERVED');
  const [liveAmbulanceStatus, setLiveAmbulanceStatus] = useState('EN_ROUTE');

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Poll incident updates if incident ID exists
  useEffect(() => {
    if (!incident?.id) return;
    const pollInterval = setInterval(async () => {
      const res = await fetchIncidentStatus(incident.id);
      if (res?.data) {
        if (res.data.status) setLiveStatus(res.data.status);
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [incident?.id]);

  const formatTimer = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCall = (number) => {
    const phoneUrl = `tel:${number}`;
    if (Platform.OS !== 'web') {
      Linking.openURL(phoneUrl).catch(() => {});
    } else {
      alert(`Initiating emergency call to ${number}`);
    }
  };

  const timerFraction = Math.max(0, secondsRemaining / 300);

  return (
    <View style={styles.cardContainer}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge Bar */}
        <View style={styles.topBar}>
          <View style={styles.incidentIdBox}>
            <Text style={styles.incidentIdLabel}>INCIDENT ID</Text>
            <Text style={styles.incidentIdVal}>{incident?.id || '#INC-4029'}</Text>
          </View>

          <View style={styles.statusPill}>
            <View style={styles.blinkingDot} />
            <Text style={styles.statusText}>{liveStatus}</Text>
          </View>
        </View>

        {/* 5-Minute ER Reservation Hold Timer Banner */}
        <View style={styles.timerCard}>
          <View style={styles.timerHeader}>
            <MaterialCommunityIcons name="clock-fast" size={20} color="#F59E0B" />
            <Text style={styles.timerTitle}>5-MINUTE ER RESERVATION HOLD</Text>
          </View>
          <View style={styles.countdownRow}>
            <Text style={styles.countdownLarge}>{formatTimer(secondsRemaining)}</Text>
            <View style={styles.timerExplainerBox}>
              <Text style={styles.timerExplainer}>
                Guaranteed emergency bed & trauma bay held exclusively for this inbound case.
              </Text>
            </View>
          </View>
          {/* Progress Bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.round(timerFraction * 100)}%` },
              ]}
            />
          </View>
        </View>

        {/* Claude Haiku Clinical Triage Summary */}
        <View style={styles.triageCard}>
          <View style={styles.triageHeader}>
            <MaterialCommunityIcons name="brain" size={18} color="#A78BFA" />
            <Text style={styles.triageTitle}>CLAUDE HAIKU CLINICAL TRIAGE</Text>
          </View>
          <View style={styles.triageBadgeRow}>
            <View style={styles.urgencyPill}>
              <Text style={styles.urgencyPillText}>
                {incident?.triageLevel || 'RESUSCITATION'}
              </Text>
            </View>
            <Text style={styles.priorityLabel}>Immediate Life-Threat Allocation</Text>
          </View>
          <Text style={styles.triageNotes}>
            {incident?.triageSummary ||
              'Automated clinical triage parsed trauma indicators. Matched with optimal Pune ER facility.'}
          </Text>
        </View>

        {/* Assigned Hospital */}
        <View style={styles.infoCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconBox}>
              <MaterialCommunityIcons name="hospital-building" size={22} color={theme.colors.crimson} />
            </View>
            <View style={styles.cardHeaderTexts}>
              <Text style={styles.cardCategory}>ASSIGNED EMERGENCY CENTER</Text>
              <Text style={styles.cardMainTitle}>
                {incident?.assignedHospital || 'Ruby Hall Clinic (Trauma ER), Pune'}
              </Text>
            </View>
          </View>
          <View style={styles.cardDivider} />
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>DISTANCE</Text>
              <Text style={styles.metricValue}>
                {incident?.hospitalDistanceKm || '1.8 km'}
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>STATUS</Text>
              <Text style={[styles.metricValue, { color: theme.colors.emerald }]}>
                ER Bed Ready
              </Text>
            </View>
            <TouchableOpacity
              style={styles.cardActionBtn}
              onPress={() => handleCall('020-66455100')}
            >
              <MaterialCommunityIcons name="phone" size={16} color="#FFFFFF" />
              <Text style={styles.cardActionBtnText}>Call ER Desk</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Assigned Ambulance */}
        <View style={styles.infoCard}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <MaterialCommunityIcons name="ambulance" size={22} color={theme.colors.blue} />
            </View>
            <View style={styles.cardHeaderTexts}>
              <Text style={styles.cardCategory}>DISPATCHED AMBULANCE</Text>
              <Text style={styles.cardMainTitle}>
                {incident?.ambulanceNumber || 'MH-12-QZ-4019'}
              </Text>
            </View>
          </View>
          <View style={styles.cardDivider} />
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>ESTIMATED ARRIVAL</Text>
              <Text style={[styles.metricValue, { color: '#FBBF24' }]}>
                ~{incident?.ambulanceEtaMinutes || 4} Mins
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>TELEMETRY</Text>
              <Text style={[styles.metricValue, { color: theme.colors.emerald }]}>
                Live GPS Active
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.cardActionBtn, { backgroundColor: theme.colors.blue }]}
              onPress={() => handleCall('108')}
            >
              <MaterialCommunityIcons name="phone" size={16} color="#FFFFFF" />
              <Text style={styles.cardActionBtnText}>Driver</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Mode Notice */}
        <View style={styles.modeNoticeBox}>
          <MaterialCommunityIcons
            name={isLiveBackend ? 'server-network' : 'cellphone-wireless'}
            size={14}
            color={theme.colors.textMuted}
          />
          <Text style={styles.modeNoticeText}>
            {isLiveBackend
              ? 'Connected to live backend REST API (port 4000)'
              : 'Simulated allocation response (Offline mode active)'}
          </Text>
        </View>

        {/* Return / Reset Button */}
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={onReset}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="arrow-left" size={18} color="#FFFFFF" />
          <Text style={styles.doneBtnText}>Return to SOS Home Screen</Text>
        </TouchableOpacity>
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 12,
    marginVertical: 10,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 28,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  incidentIdBox: {
    flexDirection: 'column',
  },
  incidentIdLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
  },
  incidentIdVal: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  blinkingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.emerald,
  },
  statusText: {
    color: theme.colors.emerald,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  timerCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    padding: 14,
    marginBottom: 14,
  },
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  timerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.8,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  countdownLarge: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FBBF24',
    letterSpacing: 1,
  },
  timerExplainerBox: {
    flex: 1,
    marginLeft: 14,
  },
  timerExplainer: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    lineHeight: 15,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  triageCard: {
    backgroundColor: 'rgba(167, 139, 250, 0.08)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
    padding: 14,
    marginBottom: 14,
  },
  triageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  triageTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A78BFA',
    letterSpacing: 0.8,
  },
  triageBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  urgencyPill: {
    backgroundColor: theme.colors.crimson,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  urgencyPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  priorityLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  triageNotes: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 17,
  },
  infoCard: {
    backgroundColor: 'rgba(24, 34, 52, 0.6)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardHeaderTexts: {
    flex: 1,
  },
  cardCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
  },
  cardMainTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.crimson,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  cardActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modeNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 10,
  },
  modeNoticeText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 13,
    gap: 8,
    marginTop: 4,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
