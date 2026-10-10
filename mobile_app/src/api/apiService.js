// API Service for HLTH-02 Emergency Resource Allocator

export const DEFAULT_BASE_URL = 'http://localhost:4000';

let activeBaseUrl = DEFAULT_BASE_URL;

export const setApiBaseUrl = (url) => {
  if (url && typeof url === 'string') {
    activeBaseUrl = url.trim().replace(/\/+$/, '');
  }
};

export const getApiBaseUrl = () => activeBaseUrl;

/**
 * Trigger SOS Incident
 * Endpoint: POST /api/v1/incidents/sos
 * Payload: { lat, lng, description, callerPhone, callerName }
 */
export const triggerSOSIncident = async ({
  lat,
  lng,
  description,
  callerPhone = '+91 98765 43210',
  callerName = 'Citizen Caller',
}) => {
  const url = `${activeBaseUrl}/api/v1/incidents/sos`;
  const payload = {
    lat: Number(lat) || 18.5204,
    lng: Number(lng) || 73.8567,
    latitude: Number(lat) || 18.5204,
    longitude: Number(lng) || 73.8567,
    description: description || 'Emergency SOS signal triggered',
    callerPhone,
    callerName,
    timestamp: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        isLiveBackend: true,
        data: normalizeIncidentResponse(data),
      };
    } else {
      const errText = await response.text();
      console.warn(`[API SOS Error] ${response.status}: ${errText}`);
      throw new Error(`Server responded with status ${response.status}`);
    }
  } catch (error) {
    console.log('[API Fallback] Network request failed or server offline, using local simulation:', error.message);
    // Return realistic Pune hospital allocation mock as described in hackathon PDF
    const simulated = generateMockIncidentResponse(payload);
    return {
      success: true,
      isLiveBackend: false,
      errorNotice: error.message,
      data: simulated,
    };
  }
};

/**
 * Fetch Live Incident Status
 * Endpoint: GET /api/v1/incidents/:id
 */
export const fetchIncidentStatus = async (id) => {
  const url = `${activeBaseUrl}/api/v1/incidents/${id}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        isLiveBackend: true,
        data: normalizeIncidentResponse(data),
      };
    }
  } catch (error) {
    // Return simulated state update
  }

  return {
    success: true,
    isLiveBackend: false,
    data: null,
  };
};

/**
 * Ping backend health
 */
export const checkBackendHealth = async (customUrl) => {
  const target = (customUrl || activeBaseUrl).trim().replace(/\/+$/, '');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(`${target}/api/v1/dispatcher/hospitals`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 404;
  } catch (e) {
    return false;
  }
};

function normalizeIncidentResponse(data) {
  if (!data) return null;
  const res = data.data || data.incident || data;
  return {
    id: res.id || res._id || res.incidentId || `INC-${Math.floor(1000 + Math.random() * 9000)}`,
    status: res.status || 'RESERVED',
    assignedHospital: res.assignedHospital || res.hospitalName || res.hospital?.name || 'Ruby Hall Clinic, Pune',
    hospitalDistanceKm: res.hospitalDistanceKm || '1.8 km',
    ambulanceNumber: res.ambulanceNumber || res.ambulanceVehicleNumber || res.ambulance?.vehicleNumber || 'MH-12-QZ-4019',
    ambulanceEtaMinutes: res.ambulanceEtaMinutes || res.eta || 4,
    triageLevel: res.triageLevel || res.triageUrgency || 'RESUSCITATION',
    triageSummary: res.triageSummary || 'Claude Haiku Triage: High-acuity trauma / immediate priority allocated.',
    holdTimerSeconds: res.holdTimerSeconds !== undefined ? res.holdTimerSeconds : 300, // 5 minute reservation hold timer
    latitude: res.lat || res.latitude || 18.5204,
    longitude: res.lng || res.longitude || 73.8567,
    createdAt: res.createdAt || new Date().toISOString(),
  };
}

function generateMockIncidentResponse(payload) {
  const hospitals = [
    { name: 'Sancheti Hospital (ER Trauma Center), Pune', dist: '1.4 km', eta: 3 },
    { name: 'Ruby Hall Clinic (Critical Care ER), Pune', dist: '2.1 km', eta: 5 },
    { name: 'Jehangir Hospital (Emergency Wing), Pune', dist: '2.8 km', eta: 6 },
    { name: 'KEM Hospital & Research Centre, Pune', dist: '3.2 km', eta: 7 },
  ];
  const chosen = hospitals[Math.floor(Math.random() * hospitals.length)];
  const ambPlates = ['MH-12-QZ-4019', 'MH-12-TX-8821', 'MH-14-EM-9002', 'MH-12-ER-3344'];
  const chosenPlate = ambPlates[Math.floor(Math.random() * ambPlates.length)];

  const descLower = (payload.description || '').toLowerCase();
  let triage = 'RESUSCITATION';
  let triageNotes = 'Claude Haiku Clinical Triage: Priority 1 - Critical emergency flagged. Rapid ICU bed reserved.';

  if (descLower.includes('chest') || descLower.includes('heart') || descLower.includes('cardiac')) {
    triage = 'RESUSCITATION';
    triageNotes = 'Claude Haiku Triage: Cardiac alert protocol triggered. Cath lab & ventilator standby initiated.';
  } else if (descLower.includes('accident') || descLower.includes('blood') || descLower.includes('trauma')) {
    triage = 'EMERGENT';
    triageNotes = 'Claude Haiku Triage: Polytrauma protocol active. Trauma bay and surgical team pre-notified.';
  } else if (descLower.includes('burn') || descLower.includes('fire')) {
    triage = 'EMERGENT';
    triageNotes = 'Claude Haiku Triage: Burn critical care unit notified. Sterile trauma dressing on route.';
  } else {
    triage = 'URGENT';
    triageNotes = 'Claude Haiku Triage: Acute assessment in progress. Immediate paramedic dispatch queued.';
  }

  return {
    id: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
    status: 'RESERVED',
    assignedHospital: chosen.name,
    hospitalDistanceKm: chosen.dist,
    ambulanceNumber: chosenPlate,
    ambulanceEtaMinutes: chosen.eta,
    triageLevel: triage,
    triageSummary: triageNotes,
    holdTimerSeconds: 300, // 5 minutes
    latitude: payload.lat,
    longitude: payload.lng,
    description: payload.description,
    createdAt: new Date().toISOString(),
  };
}
