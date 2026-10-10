'use client';

import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:4000';

interface UserSession {
  role: string;
  username: string;
  name: string;
}

interface Incident {
  id: string;
  idempotency_key?: string;
  latitude: number;
  longitude: number;
  address_text?: string;
  description_raw?: string;
  triage_level: string;
  status: string;
  created_at: string;
  requirements?: Array<{
    category: string;
    quantity_needed: number;
    justification?: string;
  }>;
}

interface HospitalCandidate {
  hospitalId: string;
  name: string;
  contactPhone: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  travelMinutes: number;
  freePrimaryCount: number;
  primaryCategory: string;
  pAvailable: number;
  pAvailablePercent: number;
  isStale: boolean;
  minutesSinceReport: number;
  stalenessPenalty: number;
  compositeScore: number;
  capacitySummary?: Array<{ category: string; total: string | number; free: string | number }>;
}

interface Ambulance {
  id: string;
  vehicle_number: string;
  driver_name?: string;
  driver_phone?: string;
  current_lat: number;
  current_lng: number;
  status: string;
}

export default function AmbulanceAdminDashboard() {
  const [session, setSession] = useState<UserSession | null>(null);

  // Auth state
  const [loginId, setLoginId] = useState('admin');
  const [loginPass, setLoginPass] = useState('admin');
  const [authError, setAuthError] = useState('');

  // Incidents and active workflow state
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [candidates, setCandidates] = useState<HospitalCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [activeReservation, setActiveReservation] = useState<any>(null);

  // Ambulances fleet
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<string>('');

  // UI Tabs: 'DISPATCH' | 'FLEET' | 'COMPLETED'
  const [activeTab, setActiveTab] = useState<'DISPATCH' | 'FLEET'>('DISPATCH');
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem('kaze_ambulance_admin_session');
    if (saved) {
      try {
        setSession(JSON.parse(saved));
      } catch (_) {}
    }
  }, []);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setActionMsg({ text, type });
    setTimeout(() => setActionMsg(null), 5000);
  };

  // Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/ambulance/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: loginId, password: loginPass })
      });
      const data = await res.json();
      if (data.success && data.user) {
        setSession(data.user);
        localStorage.setItem('kaze_ambulance_admin_session', JSON.stringify(data.user));
        showToast('Logged in as Central Ambulance Administrator', 'success');
      } else {
        setAuthError(data.error || 'Invalid credentials. Use admin / admin');
      }
    } catch (err: any) {
      setAuthError(`Connection error: ${err.message}`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kaze_ambulance_admin_session');
    setSession(null);
  };

  // Poll incidents & fleet
  const fetchData = async () => {
    if (!session) return;
    try {
      // 1. Fetch active incidents
      const incRes = await fetch(`${API_BASE}/api/v1/dispatcher/active-incidents`);
      if (incRes.ok) {
        const incData = await incRes.json();
        if (incData.success) {
          const list: Incident[] = incData.incidents || [];
          setIncidents(list);

          // If currently selected incident exists, refresh its state
          if (selectedIncident) {
            const updated = list.find(i => i.id === selectedIncident.id);
            if (updated) {
              setSelectedIncident(updated);
            }
          }
        }
      }

      // 2. Fetch fleet
      const ambRes = await fetch(`${API_BASE}/api/v1/dispatcher/ambulances`);
      if (ambRes.ok) {
        const ambData = await ambRes.json();
        if (ambData.success) {
          const fleet: Ambulance[] = ambData.ambulances || [];
          setAmbulances(fleet);
          if (!selectedAmbulanceId && fleet.length > 0) {
            const firstAvail = fleet.find(a => a.status === 'AVAILABLE') || fleet[0];
            setSelectedAmbulanceId(firstAvail.id);
          }
        }
      }

      // 3. If an incident is selected, check its reservation details
      if (selectedIncident) {
        const detailRes = await fetch(`${API_BASE}/api/v1/incidents/${selectedIncident.id}`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData.success && detailData.activeReservation) {
            setActiveReservation(detailData.activeReservation);
          } else {
            setActiveReservation(null);
          }
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (!session) return;
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [session, selectedIncident?.id]);

  // Click on an incident -> Fetch automated hospital recommendations
  const handleSelectIncident = async (inc: Incident) => {
    setSelectedIncident(inc);
    setLoadingCandidates(true);
    setCandidates([]);
    try {
      const res = await fetch(`${API_BASE}/api/v1/dispatcher/incidents/${inc.id}/recommendations`);
      const data = await res.json();
      if (data.success && data.recommendations) {
        setCandidates(data.recommendations);
      } else {
        showToast('Could not fetch hospital candidates', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Dispatcher requests specific hospital
  const handleRequestHospital = async (cand: HospitalCandidate) => {
    if (!selectedIncident) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/dispatcher/incidents/${selectedIncident.id}/request-hospital`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospitalId: cand.hospitalId,
          ambulanceId: selectedAmbulanceId || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Request sent to ${cand.name}! Waiting for hospital ER approval...`, 'success');
        fetchData();
      } else {
        showToast(data.error || 'Failed to request hospital', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Dispatcher confirms dispatch after hospital accepts
  const handleConfirmDispatch = async () => {
    if (!selectedIncident) return;
    const chosenAmb = ambulances.find(a => a.id === selectedAmbulanceId) || ambulances[0];
    try {
      const res = await fetch(`${API_BASE}/api/v1/dispatcher/incidents/${selectedIncident.id}/dispatch-ambulance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ambulanceId: chosenAmb?.id,
          driverName: chosenAmb?.driver_name,
          driverPhone: chosenAmb?.driver_phone
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          `Ambulance ${chosenAmb?.vehicle_number || ''} dispatched! Tracking & driver contact transmitted to user app.`,
          'success'
        );
        fetchData();
      } else {
        showToast(data.error || 'Failed to dispatch ambulance', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Quick Simulation of SOS trigger
  const handleSimulateSOS = async (triageType: 'TRAUMA' | 'CARDIAC' | 'GENERAL') => {
    const descMap = {
      TRAUMA: 'High-speed motorcycle collision near Akurdi station, rider unconscious with heavy head bleeding.',
      CARDIAC: '62-year-old male with acute crushing chest pain, diaphoresis, and severe breathlessness.',
      GENERAL: 'Worker fallen from scaffolding with severe lower limb fracture and acute pain.'
    };
    try {
      const res = await fetch(`${API_BASE}/api/v1/incidents/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: 18.6253,
          longitude: 73.8166,
          description: descMap[triageType],
          addressText: 'Akurdi Railway Station Chowk, Pune'
        })
      });
      const data = await res.json();
      if (data.success && data.incident) {
        showToast(`New SOS Alert Received from Citizen (${triageType})!`, 'info');
        fetchData();
        handleSelectIncident(data.incident);
      }
    } catch (err: any) {
      showToast(`Simulate error: ${err.message}`, 'error');
    }
  };

  // =========================================================================
  // VIEW: LOGIN SCREEN
  // =========================================================================
  if (!session) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center items-center gap-2 mb-2">
            <span className="w-4 h-4 rounded-full bg-blue-600 inline-block animate-pulse"></span>
            <span className="text-xs font-bold tracking-widest text-blue-700 uppercase">Emergency Command Grid</span>
          </div>
          <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">
            Ambulance Admin Console
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Central Dispatch, Intelligent Nearest Hospital Matching & Fleet Control
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-10">
            {authError && (
              <div className="mb-4 p-3 rounded-lg text-sm font-medium bg-rose-50 text-rose-700 border border-rose-200">
                {authError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Admin User ID
                </label>
                <input
                  type="text"
                  required
                  value={loginId}
                  onChange={e => setLoginId(e.target.value)}
                  placeholder="admin"
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  placeholder="admin"
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-lg text-xs text-blue-800">
                💡 Credentials pre-filled: ID <span className="font-mono font-bold">admin</span> / Password{' '}
                <span className="font-mono font-bold">admin</span>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-colors"
              >
                Sign In to Central Dispatch
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW: MAIN AMBULANCE ADMIN DASHBOARD
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-xs">
                🚑
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-slate-900 tracking-tight">
                    Central Ambulance Dispatch & Matching
                  </h1>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5 animate-pulse"></span>
                    ONLINE GRID
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  Operator: {session.name} • Active Fleet: {ambulances.filter(a => a.status === 'AVAILABLE').length} Available
                </div>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-slate-50">
                <span className="text-[11px] font-bold text-slate-500 px-1.5 uppercase">Test SOS:</span>
                <button
                  type="button"
                  onClick={() => handleSimulateSOS('TRAUMA')}
                  className="px-2 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 rounded text-[11px] font-bold transition-colors"
                >
                  🚨 Trauma SOS
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateSOS('CARDIAC')}
                  className="px-2 py-1 bg-white hover:bg-amber-50 text-amber-700 border border-slate-200 rounded text-[11px] font-bold transition-colors"
                >
                  🫀 Cardiac SOS
                </button>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors ml-2"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Navigation Bar */}
          <div className="flex space-x-8 border-t border-slate-100 -mb-px">
            <button
              onClick={() => setActiveTab('DISPATCH')}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                activeTab === 'DISPATCH'
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <span>🚨 Live SOS & Hospital Matching</span>
              {incidents.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white animate-pulse">
                  {incidents.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('FLEET')}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                activeTab === 'FLEET'
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <span>🚑 108 Fleet Status</span>
              <span className="text-xs text-slate-400 font-normal">({ambulances.length} vehicles)</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast notifications */}
      {actionMsg && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 w-full">
          <div
            className={`p-3.5 rounded-lg text-sm font-medium shadow-xs flex justify-between items-center ${
              actionMsg.type === 'error'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : actionMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}
          >
            <span>{actionMsg.text}</span>
            <button onClick={() => setActionMsg(null)} className="text-xs font-bold opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {activeTab === 'DISPATCH' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 4 Cols: Live Incoming SOS Requests */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-slate-900">Incoming SOS Alerts ({incidents.length})</h2>
                <span className="text-[11px] font-mono text-slate-400">Auto-refresh 3s</span>
              </div>

              {incidents.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-xs">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center text-lg mb-2">
                    ✓
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">No Active SOS Incidents</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Emergency alerts from citizens will pop up here in real time.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSimulateSOS('TRAUMA')}
                    className="mt-4 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold hover:bg-blue-100"
                  >
                    + Trigger Simulated Citizen SOS
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {incidents.map(inc => {
                    const isSelected = selectedIncident?.id === inc.id;
                    return (
                      <div
                        key={inc.id}
                        onClick={() => handleSelectIncident(inc)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50/50 border-blue-500 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              inc.triage_level === 'RESUSCITATION'
                                ? 'bg-rose-100 text-rose-800'
                                : inc.triage_level === 'EMERGENT'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {inc.triage_level}
                          </span>
                          <span className="text-[11px] font-mono font-semibold text-slate-500">
                            #{inc.id.slice(0, 8)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-800 font-medium line-clamp-2">
                          &quot;{inc.description_raw || 'Emergency SOS trigger'}&quot;
                        </p>

                        <div className="mt-3 flex justify-between items-center text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                          <span className="font-semibold text-blue-700">Status: {inc.status}</span>
                          <span>{new Date(inc.created_at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right 8 Cols: Selected Incident & Automated Hospital Matcher */}
            <div className="lg:col-span-8">
              {!selectedIncident ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-xs">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center text-xl mb-3">
                    👈
                  </div>
                  <h3 className="text-base font-bold text-slate-900">Select an SOS Request</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Click any incoming incident from the left panel to trigger automated nearest hospital calculation,
                    availability forecasting, and dispatch coordination.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Incident Detail Card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                              selectedIncident.triage_level === 'RESUSCITATION'
                                ? 'bg-rose-100 text-rose-800'
                                : selectedIncident.triage_level === 'EMERGENT'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {selectedIncident.triage_level}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900">
                            Incident #{selectedIncident.id}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Location: {selectedIncident.latitude.toFixed(4)}, {selectedIncident.longitude.toFixed(4)} •{' '}
                          {selectedIncident.address_text || 'Pune Metro Area'}
                        </p>
                      </div>

                      {/* Status Tag */}
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 font-mono">
                        Status: {selectedIncident.status}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-800">
                      <span className="font-bold block text-slate-600 mb-0.5">Reported Condition:</span>
                      &quot;{selectedIncident.description_raw || 'Emergency SOS trigger'}&quot;
                    </div>

                    {/* Ambulance fleet selector */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-700">Assign 108 Ambulance:</label>
                        <select
                          value={selectedAmbulanceId}
                          onChange={e => setSelectedAmbulanceId(e.target.value)}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {ambulances.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.vehicle_number} — {a.driver_name || 'Driver'} ({a.status})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* If Hospital Accepted -> Show Dispatch Ambulance Action */}
                      {activeReservation?.status === 'CONFIRMED' && selectedIncident.status !== 'EN_ROUTE' && (
                        <button
                          type="button"
                          onClick={handleConfirmDispatch}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5 animate-bounce"
                        >
                          <span>🚑 Confirm Ambulance Dispatched to Location</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active Reservation Status Banner (If request already placed) */}
                  {activeReservation && (
                    <div
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                        activeReservation.status === 'CONFIRMED'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : activeReservation.status === 'HELD'
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-current animate-ping"></span>
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {activeReservation.status === 'CONFIRMED'
                              ? 'REQUEST ACCEPTED BY HOSPITAL'
                              : 'PENDING HOSPITAL ER ACCEPTANCE'}
                          </span>
                        </div>
                        <p className="text-sm font-bold mt-1">
                          Hospital: {activeReservation.hospital_name || 'Designated Facility'}
                        </p>
                        <p className="text-xs opacity-80 mt-0.5">
                          Ambulance: {activeReservation.vehicle_number || '108 Fleet'} • Driver:{' '}
                          {activeReservation.driver_name || 'Paramedic Staff'} (
                          {activeReservation.driver_phone || 'Available'})
                        </p>
                      </div>

                      {activeReservation.status === 'CONFIRMED' && (
                        <div className="text-right">
                          <span className="inline-block px-3 py-1 bg-emerald-600 text-white font-bold text-xs rounded-lg">
                            ✓ Bed Confirmed at ER
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Automated Nearest Hospital Calculation & Matching */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Automated Nearest Hospital Calculation & Availability Matcher
                        </h3>
                        <p className="text-xs text-slate-500">
                          Ranked by ML-calibrated arrival availability P(available at ETA), travel time, and data freshness.
                        </p>
                      </div>
                      {loadingCandidates && (
                        <span className="text-xs text-blue-600 font-semibold animate-pulse">
                          Evaluating network...
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      {candidates.map((cand, idx) => {
                        const isTop = idx === 0;
                        return (
                          <div
                            key={cand.hospitalId}
                            className={`bg-white border rounded-xl p-4 transition-all shadow-xs ${
                              isTop
                                ? 'border-blue-500 ring-1 ring-blue-500/30'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  {isTop && (
                                    <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-extrabold uppercase">
                                      #1 TOP MATCH
                                    </span>
                                  )}
                                  <h4 className="text-sm font-bold text-slate-900">{cand.name}</h4>
                                </div>
                                <span className="text-xs text-slate-500 block mt-0.5">
                                  📞 {cand.contactPhone} • GPS: {cand.latitude.toFixed(4)}, {cand.longitude.toFixed(4)}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-right">
                                <div>
                                  <span className="text-xs font-mono font-bold text-slate-800">
                                    Score: {cand.compositeScore}
                                  </span>
                                  <span className="text-[11px] text-slate-400 block font-mono">
                                    P(avail): {cand.pAvailablePercent}%
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Metric Badges */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-xs font-mono">
                              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                                <span className="text-[10px] text-slate-400 block">EST. TRAVEL</span>
                                <span className="font-bold text-slate-800">
                                  {cand.travelMinutes} mins ({cand.distanceKm} km)
                                </span>
                              </div>
                              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                                <span className="text-[10px] text-slate-400 block">FREE UNITS</span>
                                <span className="font-bold text-emerald-700">
                                  {cand.freePrimaryCount} available
                                </span>
                              </div>
                              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                                <span className="text-[10px] text-slate-400 block">ML AVAILABILITY</span>
                                <span className="font-bold text-blue-700">
                                  {cand.pAvailablePercent}% confidence
                                </span>
                              </div>
                              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                                <span className="text-[10px] text-slate-400 block">DATA FRESHNESS</span>
                                <span
                                  className={`font-bold ${
                                    cand.isStale ? 'text-amber-700' : 'text-slate-700'
                                  }`}
                                >
                                  {cand.isStale ? `Stale (${cand.minutesSinceReport}m)` : 'Live & Verified'}
                                </span>
                              </div>
                            </div>

                            {/* Action to Request */}
                            <div className="flex justify-end pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => handleRequestHospital(cand)}
                                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors flex items-center gap-1.5"
                              >
                                <span>Send Request to {cand.name.split(' ')[0]} ER</span>
                                <span>→</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: 108 AMBULANCE FLEET OVERVIEW                               */}
        {/* ================================================================= */}
        {activeTab === 'FLEET' && (
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Pune 108 Emergency Fleet Status</h2>
                <p className="text-xs text-slate-500">
                  Real-time telemetry, driver contacts, and trip statuses for active emergency vehicles.
                </p>
              </div>
              <span className="text-xs bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-mono">
                {ambulances.filter(a => a.status === 'AVAILABLE').length} Available / {ambulances.length} Total
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ambulances.map(amb => (
                <div key={amb.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-base font-extrabold text-slate-900 font-mono">
                      {amb.vehicle_number}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        amb.status === 'AVAILABLE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : amb.status === 'DISPATCHED' || amb.status === 'EN_ROUTE'
                          ? 'bg-amber-100 text-amber-800 animate-pulse'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {amb.status}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 font-medium">
                    <p>Driver: {amb.driver_name || 'Emergency Responder'}</p>
                    <p className="text-emerald-700 font-bold">📞 {amb.driver_phone || '+91 9800000004'}</p>
                    <p className="font-mono text-[11px] text-slate-400">
                      GPS: {amb.current_lat.toFixed(4)}, {amb.current_lng.toFixed(4)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
