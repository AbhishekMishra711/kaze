'use client';

import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:4000';

interface HospitalData {
  id: string;
  name: string;
  admin_id: string;
  latitude: number;
  longitude: number;
  contact_phone: string;
  is_active: boolean;
  last_reported_at?: string;
  capacity?: Array<{
    category: string;
    total: string | number;
    free: string | number;
    occupied?: string | number;
    maintenance?: string | number;
  }>;
}

interface Reservation {
  id: string;
  incident_id: string;
  unit_id: string;
  hospital_id: string;
  ambulance_id: string | null;
  status: 'HELD' | 'CONFIRMED' | 'ARRIVED' | 'HANDED_OVER' | 'REJECTED';
  hold_expires_at: string;
  triage_level: string;
  description_raw: string;
  inc_lat: number;
  inc_lng: number;
  unit_category: string;
  unit_label: string;
  vehicle_number: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  created_at: string;
}

interface ResourceUnit {
  id: string;
  category: string;
  unit_label: string;
  status: 'FREE' | 'OCCUPIED' | 'MAINTENANCE' | 'HELD';
  is_movable: boolean;
  updated_at: string;
}

export default function HospitalDashboard() {
  const [hospital, setHospital] = useState<HospitalData | null>(null);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Login form state
  const [loginAdminId, setLoginAdminId] = useState('dy_patil@admin');
  const [loginPassword, setLoginPassword] = useState('password123');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regAdminId, setRegAdminId] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regLat, setRegLat] = useState('18.6253');
  const [regLng, setRegLng] = useState('73.8166');
  const [regPhone, setRegPhone] = useState('020-27805100');

  // Active Tab: 'REQUESTS' | 'RESOURCES' | 'HANDOVER'
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'RESOURCES' | 'HANDOVER'>('REQUESTS');

  // Data states
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [resourceUnits, setResourceUnits] = useState<ResourceUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Add resource modal
  const [showAddResource, setShowAddResource] = useState(false);
  const [newCategory, setNewCategory] = useState('ICU_BED');
  const [newCount, setNewCount] = useState(2);
  const [newIsMovable, setNewIsMovable] = useState(false);

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem('kaze_hospital_session');
    if (saved) {
      try {
        setHospital(JSON.parse(saved));
      } catch (_) {}
    }
  }, []);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setActionMsg({ text, type });
    setTimeout(() => setActionMsg(null), 5000);
  };

  // Login
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/hospital/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: loginAdminId, password: loginPassword })
      });
      const data = await res.json();
      if (data.success && data.hospital) {
        setHospital(data.hospital);
        localStorage.setItem('kaze_hospital_session', JSON.stringify(data.hospital));
        showToast(`Welcome back, ${data.hospital.name}`, 'success');
      } else {
        showToast(data.error || 'Login failed. Check your credentials.', 'error');
      }
    } catch (err: any) {
      showToast(`Network error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Register
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regAdminId || !regPassword) {
      showToast('Please fill all required fields.', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/hospital/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          admin_id: regAdminId,
          password: regPassword,
          latitude: parseFloat(regLat),
          longitude: parseFloat(regLng),
          contact_phone: regPhone
        })
      });
      const data = await res.json();
      if (data.success && data.hospital) {
        setHospital(data.hospital);
        localStorage.setItem('kaze_hospital_session', JSON.stringify(data.hospital));
        showToast(`Hospital "${data.hospital.name}" registered and 24 units initialized!`, 'success');
      } else {
        showToast(data.error || 'Registration failed.', 'error');
      }
    } catch (err: any) {
      showToast(`Network error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kaze_hospital_session');
    setHospital(null);
  };

  // Poll hospital reservations and profile
  const fetchHospitalData = async () => {
    if (!hospital?.id) return;
    try {
      // 1. Fetch profile & capacity
      const hRes = await fetch(`${API_BASE}/api/v1/hospitals/${hospital.id}`);
      if (hRes.ok) {
        const hJson = await hRes.json();
        if (hJson.success && hJson.hospital) {
          setHospital(prev => ({ ...prev!, ...hJson.hospital }));
        }
      }

      // 2. Fetch reservations
      const rRes = await fetch(`${API_BASE}/api/v1/hospitals/${hospital.id}/reservations`);
      if (rRes.ok) {
        const rJson = await rRes.json();
        if (rJson.success) {
          setReservations(rJson.reservations || []);
        }
      }

      // 3. Fetch discrete units
      const uRes = await fetch(`${API_BASE}/api/v1/hospitals/${hospital.id}/resources`);
      if (uRes.ok) {
        const uJson = await uRes.json();
        if (uJson.success) {
          setResourceUnits(uJson.resources || []);
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (!hospital?.id) return;
    fetchHospitalData();
    const interval = setInterval(fetchHospitalData, 3500);
    return () => clearInterval(interval);
  }, [hospital?.id]);

  // Toggle Hospital Active/Shutdown
  const toggleHospitalStatus = async () => {
    if (!hospital?.id) return;
    const newStatus = !hospital.is_active;
    try {
      const res = await fetch(`${API_BASE}/api/v1/hospitals/${hospital.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: newStatus,
          reason: newStatus ? 'ER_REOPENED' : 'TEMPORARY_ER_DIVERSION'
        })
      });
      const data = await res.json();
      if (data.success) {
        setHospital(prev => prev ? ({ ...prev, is_active: newStatus }) : null);
        showToast(
          newStatus
            ? 'Hospital is now OPEN and accepting emergency patients.'
            : 'Hospital SHUT DOWN. All inbound in-transit ambulances dynamically rerouted!',
          newStatus ? 'success' : 'error'
        );
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Heartbeat refresh
  const triggerHeartbeat = async () => {
    if (!hospital?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/hospitals/${hospital.id}/heartbeat`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Heartbeat signal transmitted. Telemetry freshness 100%!', 'success');
        fetchHospitalData();
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Accept reservation
  const acceptReservation = async (resId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/hospitals/reservations/${resId}/accept`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Reservation confirmed! Inbound ambulance & dispatcher notified.', 'success');
        fetchHospitalData();
      } else {
        showToast(data.error || 'Could not confirm reservation', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Reject reservation (auto dynamic replan)
  const rejectReservation = async (resId: string) => {
    const reason = window.prompt('Reason for rejecting emergency reservation:', 'ER_CAPACITY_OVERLOAD') || 'ER_CAPACITY_OVERLOAD';
    try {
      const res = await fetch(`${API_BASE}/api/v1/hospitals/reservations/${resId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, hospitalId: hospital?.id })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Reservation rejected. Patient dynamically replanned to next hospital!', 'info');
        fetchHospitalData();
      } else {
        showToast(data.error || 'Could not reject reservation', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handover completed (frees ambulance)
  const completeHandover = async (resId: string, vehicleNum?: string | null) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/hospitals/reservations/${resId}/handover`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Patient admitted at ER! Ambulance ${vehicleNum || ''} is now free and back in service.`, 'success');
        fetchHospitalData();
      } else {
        showToast(data.error || 'Could not complete handover', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Adjust capacity delta
  const adjustCapacity = async (category: string, delta: number) => {
    if (!hospital?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/hospitals/${hospital.id}/resources/adjust`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, delta })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${category} adjusted by ${delta > 0 ? '+' : ''}${delta}`, 'success');
        fetchHospitalData();
      } else {
        showToast(data.error || 'Failed to adjust', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Add new resources
  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospital?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/hospitals/${hospital.id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newCategory,
          count: newCount,
          isMovable: newIsMovable
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Added ${newCount} units of ${newCategory}!`, 'success');
        setShowAddResource(false);
        fetchHospitalData();
      } else {
        showToast(data.error || 'Could not add resources', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Demo hospital presets for quick login
  const demoAccounts = [
    { name: 'Dr. D.Y. Patil Medical College', admin_id: 'dy_patil@admin', pass: 'password123' },
    { name: 'Aditya Birla Memorial Hospital', admin_id: 'aditya_birla@admin', pass: 'password123' },
    { name: 'YCM Hospital', admin_id: 'ycm@admin', pass: 'password123' },
    { name: 'Manipal Hospital (Baner)', admin_id: 'manipal@admin', pass: 'password123' },
    { name: 'Ruby Hall Clinic', admin_id: 'ruby_hall@admin', pass: 'password123' },
    { name: 'Sassoon General Hospital', admin_id: 'sassoon@admin', pass: 'password123' }
  ];

  // =========================================================================
  // VIEW: AUTHENTICATION (LOGIN / REGISTER)
  // =========================================================================
  if (!hospital) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center items-center gap-2 mb-2">
            <span className="w-4 h-4 rounded-full bg-emerald-600 inline-block animate-pulse"></span>
            <span className="text-xs font-bold tracking-widest text-emerald-700 uppercase">HLTH-02 Core Gateway</span>
          </div>
          <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">
            Hospital Emergency Terminal
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Real-time ER Resource Allocation & Patient Handover System
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-10">
            {/* Tabs for Login vs Register */}
            <div className="flex border-b border-slate-200 mb-6">
              <button
                type="button"
                onClick={() => setAuthMode('LOGIN')}
                className={`flex-1 py-2 text-sm font-semibold text-center border-b-2 ${
                  authMode === 'LOGIN'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('REGISTER')}
                className={`flex-1 py-2 text-sm font-semibold text-center border-b-2 ${
                  authMode === 'REGISTER'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Register New Hospital
              </button>
            </div>

            {actionMsg && (
              <div
                className={`mb-4 p-3 rounded-lg text-sm font-medium ${
                  actionMsg.type === 'error'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {actionMsg.text}
              </div>
            )}

            {authMode === 'LOGIN' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Hospital Admin ID
                  </label>
                  <input
                    type="text"
                    required
                    value={loginAdminId}
                    onChange={e => setLoginAdminId(e.target.value)}
                    placeholder="e.g. dy_patil@admin"
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition-colors disabled:opacity-50"
                >
                  {loading ? 'Authenticating...' : 'Sign In to Hospital Terminal'}
                </button>

                {/* Quick Demo Pre-sets */}
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Quick Demo Credentials (Pune Network):
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {demoAccounts.map((acc, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setLoginAdminId(acc.admin_id);
                          setLoginPassword(acc.pass);
                        }}
                        className="text-left p-1.5 rounded bg-slate-50 hover:bg-emerald-50 border border-slate-200 text-[11px] text-slate-700 truncate"
                        title={acc.name}
                      >
                        <span className="font-semibold block truncate">{acc.name}</span>
                        <span className="text-slate-400 font-mono text-[10px]">{acc.admin_id}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Hospital Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={e => {
                      setRegName(e.target.value);
                      if (!regAdminId) {
                        const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
                        setRegAdminId(`${slug}@admin`);
                      }
                    }}
                    placeholder="e.g. Sahyadri Speciality Hospital"
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Hospital Admin ID * (Format: hospital_name@admin)
                  </label>
                  <input
                    type="text"
                    required
                    value={regAdminId}
                    onChange={e => setRegAdminId(e.target.value)}
                    placeholder="sahyadri@admin"
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    placeholder="Create a secure password"
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Latitude
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      required
                      value={regLat}
                      onChange={e => setRegLat(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Longitude
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      required
                      value={regLng}
                      onChange={e => setRegLng(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={regPhone}
                    onChange={e => setRegPhone(e.target.value)}
                    placeholder="020-XXXXXXXX"
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <p className="text-[11px] text-slate-500 leading-tight">
                  ℹ️ Registration automatically provisions 24 standard emergency units (4 ICU beds, 3 ventilators, 2 trauma bays, 6 oxygen beds, 8 general beds).
                </p>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition-colors disabled:opacity-50"
                >
                  {loading ? 'Registering...' : 'Register Hospital & Launch'}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Incoming Held Requests
  const heldRequests = reservations.filter(r => r.status === 'HELD');
  // In-transit / Confirmed Cases
  const confirmedCases = reservations.filter(r => r.status === 'CONFIRMED' || r.status === 'ARRIVED');

  // =========================================================================
  // VIEW: HOSPITAL DASHBOARD MAIN
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left: Branding & Hospital Identity */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-black text-xl shadow-xs">
                +
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-slate-900 tracking-tight">{hospital.name}</h1>
                  {hospital.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5 animate-pulse"></span>
                      OPEN / RECEIVING
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-600 mr-1.5"></span>
                      SHUT DOWN / DIVERTED
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 font-mono mt-0.5">
                  <span>ID: {hospital.admin_id}</span>
                  <span>•</span>
                  <span>GPS: {hospital.latitude.toFixed(4)}, {hospital.longitude.toFixed(4)}</span>
                  <span>•</span>
                  <span>Tel: {hospital.contact_phone || '020-30717500'}</span>
                </div>
              </div>
            </div>

            {/* Right: Hospital Controls (Active Toggle, Heartbeat, Logout) */}
            <div className="flex items-center gap-2.5">
              {/* Active/Inactive Toggle Button */}
              <button
                type="button"
                onClick={toggleHospitalStatus}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                  hospital.is_active
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
                title="Toggle hospital status between open and temporarily diverted"
              >
                {hospital.is_active ? '⏸️ Temporarily Divert ER' : '▶️ Re-open Hospital'}
              </button>

              {/* Heartbeat Refresh */}
              <button
                type="button"
                onClick={triggerHeartbeat}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
                title="Refresh timestamp to keep hospital freshness score 100%"
              >
                📡 Heartbeat
              </button>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex space-x-8 border-t border-slate-100 -mb-px">
            <button
              onClick={() => setActiveTab('REQUESTS')}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                activeTab === 'REQUESTS'
                  ? 'border-emerald-600 text-emerald-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <span>📥 Incoming Requests</span>
              {heldRequests.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white animate-pulse">
                  {heldRequests.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('RESOURCES')}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                activeTab === 'RESOURCES'
                  ? 'border-emerald-600 text-emerald-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <span>🛏️ Resource Read / Update</span>
              <span className="text-xs text-slate-400 font-normal">
                ({resourceUnits.filter(u => u.status === 'FREE').length} free)
              </span>
            </button>

            <button
              onClick={() => setActiveTab('HANDOVER')}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                activeTab === 'HANDOVER'
                  ? 'border-emerald-600 text-emerald-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <span>🚑 Patient Arrival & Handover</span>
              {confirmedCases.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
                  {confirmedCases.length}
                </span>
              )}
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
                : 'bg-sky-50 text-sky-700 border border-sky-200'
            }`}
          >
            <span>{actionMsg.text}</span>
            <button onClick={() => setActionMsg(null)} className="text-xs font-bold opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {/* ================================================================= */}
        {/* TAB 1: INCOMING REQUESTS                                          */}
        {/* ================================================================= */}
        {activeTab === 'REQUESTS' && (
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Emergency Dispatch Requests</h2>
                <p className="text-xs text-slate-500">
                  Review and accept or decline real-time resource reservation holds.
                </p>
              </div>
              <span className="text-xs bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-mono">
                Auto-refreshing every 3.5s
              </span>
            </div>

            {heldRequests.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-xs">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center text-xl mb-3">
                  ✓
                </div>
                <h3 className="text-sm font-semibold text-slate-900">No Pending Emergency Requests</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  When a dispatcher or citizen triggers an SOS requiring your hospital's resources, it will appear here instantly.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {heldRequests.map(req => {
                  const expires = new Date(req.hold_expires_at).toLocaleTimeString();
                  return (
                    <div
                      key={req.id}
                      className="bg-white border-2 border-emerald-500 rounded-xl p-5 shadow-sm transition-all hover:shadow-md"
                    >
                      <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                              req.triage_level === 'RESUSCITATION'
                                ? 'bg-rose-100 text-rose-800'
                                : req.triage_level === 'EMERGENT'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {req.triage_level}
                          </span>
                          <span className="text-xs font-mono font-semibold text-slate-500">
                            Incident #{req.incident_id.slice(0, 8)}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                          Hold Expires at {expires}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-3 text-sm">
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-bold text-slate-500 uppercase block">Required Unit</span>
                          <span className="text-base font-bold text-slate-900 block mt-0.5">
                            {req.unit_category.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-emerald-700 font-mono font-semibold">
                            Hold on: {req.unit_label}
                          </span>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-bold text-slate-500 uppercase block">Inbound Transport</span>
                          <span className="text-base font-bold text-slate-900 block mt-0.5">
                            {req.vehicle_number || 'Auto-Allocated 108 Fleet'}
                          </span>
                          {req.driver_phone && (
                            <span className="text-xs text-slate-600 block">📞 {req.driver_phone}</span>
                          )}
                        </div>

                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-bold text-slate-500 uppercase block">Patient Coordinates</span>
                          <span className="text-xs font-mono font-bold text-slate-800 block mt-1">
                            {req.inc_lat?.toFixed(4)}, {req.inc_lng?.toFixed(4)}
                          </span>
                          <span className="text-xs text-slate-500">Estimated Transit: ~7-12 min</span>
                        </div>
                      </div>

                      <div className="bg-amber-50/60 p-3 rounded-lg border border-amber-200/60 text-xs text-slate-800 mb-4">
                        <span className="font-bold text-amber-900 block mb-0.5">Triage Clinical Description:</span>
                        "{req.description_raw || 'Emergency SOS trigger without description.'}"
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => rejectReservation(req.id)}
                          className="px-4 py-2 rounded-lg text-xs font-bold text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 transition-colors"
                        >
                          ✕ Reject & Replan Patient
                        </button>
                        <button
                          type="button"
                          onClick={() => acceptReservation(req.id)}
                          className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors"
                        >
                          ✓ Accept & Confirm Bed
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 2: RESOURCE READ / UPDATE                                     */}
        {/* ================================================================= */}
        {activeTab === 'RESOURCES' && (
          <section className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Hospital Resource Inventory</h2>
                <p className="text-xs text-slate-500">
                  Read live availability, increment or decrement available capacity, and provision new physical units.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddResource(true)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors"
              >
                + Add New Equipment
              </button>
            </div>

            {/* Aggregated Capacity Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { key: 'ICU_BED', label: 'ICU Beds', icon: '🛏️', desc: 'Critical Care Monitoring' },
                { key: 'VENTILATOR', label: 'Ventilators', icon: '🫁', desc: 'Invasive/Non-invasive Respiration' },
                { key: 'TRAUMA_BAY', label: 'Trauma Bays', icon: '🚨', desc: 'High-acuity Resuscitation' },
                { key: 'OXYGEN_BED', label: 'Oxygen Beds', icon: '💨', desc: 'High-flow O2 Support' },
                { key: 'PEDIATRIC_ICU', label: 'Pediatric ICU', icon: '👶', desc: 'Neonatal & Child Intensive Care' },
                { key: 'GENERAL_BED', label: 'General Ward Beds', icon: '🏥', desc: 'Acute Clinical Observation' }
              ].map(cat => {
                const units = resourceUnits.filter(u => u.category === cat.key);
                const freeCount = units.filter(u => u.status === 'FREE').length;
                const totalCount = units.length;
                const occupiedCount = units.filter(u => u.status === 'OCCUPIED' || u.status === 'HELD').length;

                return (
                  <div
                    key={cat.key}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{cat.icon}</span>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">{cat.label}</h3>
                            <span className="text-[11px] text-slate-400 block">{cat.desc}</span>
                          </div>
                        </div>
                        <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                          {cat.key}
                        </span>
                      </div>

                      <div className="mt-4 flex items-baseline justify-between">
                        <div>
                          <span className="text-3xl font-extrabold text-slate-900">{freeCount}</span>
                          <span className="text-xs text-slate-400 ml-1">/ {totalCount} free</span>
                        </div>
                        <div className="text-right text-[11px] text-slate-500">
                          <span className="text-amber-700 font-semibold">{occupiedCount} occupied</span>
                        </div>
                      </div>

                      {/* Capacity progress bar */}
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2">
                        <div
                          className="bg-emerald-500 h-full transition-all"
                          style={{ width: `${totalCount > 0 ? (freeCount / totalCount) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Quick Delta +/- Buttons */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600">Quick Adjust:</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => adjustCapacity(cat.key, -1)}
                          disabled={freeCount <= 0}
                          className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold flex items-center justify-center disabled:opacity-30 transition-colors"
                          title="Reduce available unit (-1 Maintenance)"
                        >
                          -
                        </button>
                        <span className="text-xs font-mono font-bold text-slate-600 w-6 text-center">
                          {freeCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustCapacity(cat.key, 1)}
                          className="w-7 h-7 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-sm font-bold flex items-center justify-center transition-colors"
                          title="Free up or add unit (+1 Free)"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Discrete Inventory List */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900">Discrete Physical Units ({resourceUnits.length})</h3>
                <span className="text-xs text-slate-500">Atomic Resource State Tracking</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">Unit Label</th>
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Movable</th>
                      <th className="py-2.5 px-4">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resourceUnits.map(unit => (
                      <tr key={unit.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{unit.unit_label}</td>
                        <td className="py-2.5 px-4 text-slate-600">{unit.category}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              unit.status === 'FREE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : unit.status === 'OCCUPIED'
                                ? 'bg-amber-100 text-amber-800'
                                : unit.status === 'HELD'
                                ? 'bg-blue-100 text-blue-800 animate-pulse'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {unit.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-500">{unit.is_movable ? 'Yes (Movable)' : 'No (Fixed)'}</td>
                        <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">
                          {new Date(unit.updated_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal: Add New Equipment */}
            {showAddResource && (
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
                  <h3 className="text-base font-bold text-slate-900 mb-1">Add Equipment to Hospital</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Creates discrete physical tracking identifiers for new hospital assets.
                  </p>

                  <form onSubmit={handleAddResource} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase">Category</label>
                      <select
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="ICU_BED">ICU Bed</option>
                        <option value="VENTILATOR">Ventilator</option>
                        <option value="TRAUMA_BAY">Trauma Bay</option>
                        <option value="OXYGEN_BED">Oxygen Bed</option>
                        <option value="PEDIATRIC_ICU">Pediatric ICU</option>
                        <option value="GENERAL_BED">General Ward Bed</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase">Quantity to Add</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={newCount}
                        onChange={e => setNewCount(parseInt(e.target.value, 10) || 1)}
                        className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="movableCheck"
                        checked={newIsMovable}
                        onChange={e => setNewIsMovable(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <label htmlFor="movableCheck" className="text-xs text-slate-700">
                        Is movable equipment (e.g. portable ventilator)
                      </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowAddResource(false)}
                        className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Confirm & Provision
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 3: APPROVED PATIENTS & HANDOVER                               */}
        {/* ================================================================= */}
        {activeTab === 'HANDOVER' && (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Patient Arrival & Handover Station</h2>
              <p className="text-xs text-slate-500">
                When an ambulance arrives at the emergency bay, click &quot;Patient Arrived & Complete Handover&quot; to admit the patient and free the ambulance for new dispatches.
              </p>
            </div>

            {confirmedCases.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-xs">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center text-xl mb-3">
                  🚑
                </div>
                <h3 className="text-sm font-semibold text-slate-900">No In-Transit Ambulances En Route</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Accepted reservations and active inbound patients will appear here awaiting ER admission.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {confirmedCases.map(c => (
                  <div
                    key={c.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 uppercase">
                          {c.status}
                        </span>
                        <span className="text-xs font-bold text-slate-900 font-mono">
                          Ambulance: {c.vehicle_number || '108-EM-UNIT'}
                        </span>
                        {c.driver_phone && (
                          <span className="text-xs text-emerald-700 font-semibold">📞 {c.driver_phone}</span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 font-medium">
                        Patient Incident #{c.incident_id.slice(0, 8)} • Reserved {c.unit_category.replace(/_/g, ' ')} ({c.unit_label})
                      </p>

                      <p className="text-xs text-slate-500 italic max-w-xl">
                        &quot;{c.description_raw || 'Emergency transfer'}&quot;
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => completeHandover(c.id, c.vehicle_number)}
                        className="px-5 py-2.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors flex items-center gap-2"
                      >
                        <span>✓ Patient Arrived & Free Ambulance</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
