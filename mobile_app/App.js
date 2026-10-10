import React, { useState, useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HomeScreen } from './src/screens/HomeScreen';
import { IncidentScreen } from './src/screens/IncidentScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { ConfirmationModal } from './src/components/ConfirmationModal';
import { submitSOS } from './src/api/api';

const ACTIVE_INCIDENT_KEY = '@kaze_active_incident';

// App navigation screens: 'home' | 'incident' | 'tracking'
export default function App() {
  const [screen, setScreen] = useState('home');
  const [location, setLocation] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [incident, setIncident] = useState(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  // Load any ongoing incident from persistent storage on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(ACTIVE_INCIDENT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.id) {
            setIncident(parsed);
          }
        }
      } catch (err) {
        console.log('[Storage] Error restoring incident:', err);
      }
    })();
  }, []);

  // Fetch GPS on mount
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web') {
          setLocation({ latitude: 18.6253, longitude: 73.8166 });
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocation({ latitude: 18.6253, longitude: 73.8166 });
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      } catch (_) {
        setLocation({ latitude: 18.6253, longitude: 73.8166 });
      }
    })();
  }, []);

  // Persist incident state
  const saveIncident = async (newIncident) => {
    setIncident(newIncident);
    try {
      if (newIncident) {
        await AsyncStorage.setItem(ACTIVE_INCIDENT_KEY, JSON.stringify(newIncident));
      } else {
        await AsyncStorage.removeItem(ACTIVE_INCIDENT_KEY);
      }
    } catch (err) {
      console.log('[Storage] Error writing incident:', err);
    }
  };

  // SOS button held → go to incident screen
  const handleSOSActivate = () => {
    setScreen('incident');
  };

  // Submit incident description & location
  const handleSubmit = async ({ description }) => {
    setIsSubmitting(true);
    try {
      const result = await submitSOS({
        description,
        latitude: location?.latitude ?? 18.6253,
        longitude: location?.longitude ?? 73.8166,
      });
      await saveIncident(result.incident);
      setConfirmVisible(true);
    } catch (err) {
      Alert.alert('Failed to send', 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // User taps "Track my request" in confirmation modal or on Home screen
  const handleTrack = () => {
    setConfirmVisible(false);
    setScreen('tracking');
  };

  // User closes confirmation modal → returns to home, keeps incident active
  const handleConfirmClose = () => {
    setConfirmVisible(false);
    setScreen('home');
  };

  // From tracking → back to home (persists incident so user can track anytime!)
  const handleClose = () => {
    setScreen('home');
  };

  // Explicit user cancellation of emergency
  const handleCancelIncident = async () => {
    await saveIncident(null);
    setScreen('home');
  };

  // Incident updated via live polling or progress
  const handleUpdateIncident = async (updated) => {
    if (updated) {
      await saveIncident(updated);
    }
  };

  return (
    <SafeAreaProvider>
      {screen === 'home' && (
        <HomeScreen
          onActivate={handleSOSActivate}
          location={location}
          activeIncident={incident}
          onTrackIncident={handleTrack}
          onCancelIncident={handleCancelIncident}
        />
      )}

      {screen === 'incident' && (
        <IncidentScreen
          onSubmit={handleSubmit}
          onBack={() => setScreen('home')}
          location={location}
          isSubmitting={isSubmitting}
        />
      )}

      {screen === 'tracking' && (
        <TrackingScreen
          incident={incident}
          location={location}
          onClose={handleClose}
          onUpdateIncident={handleUpdateIncident}
          onCancel={handleCancelIncident}
        />
      )}

      <ConfirmationModal
        visible={confirmVisible}
        incident={incident}
        onClose={handleConfirmClose}
        onTrack={handleTrack}
      />
    </SafeAreaProvider>
  );
}
