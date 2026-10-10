export type UserRole = 'CITIZEN' | 'DISPATCHER' | 'HOSPITAL_STAFF' | 'DRIVER' | 'EVALUATOR';

export type ResourceCategory = 
  | 'ICU_BED' 
  | 'VENTILATOR' 
  | 'TRAUMA_BAY' 
  | 'OXYGEN_BED' 
  | 'PEDIATRIC_ICU' 
  | 'GENERAL_BED';

export type UnitStatus = 'FREE' | 'OCCUPIED' | 'MAINTENANCE' | 'FAULTY';

export type TriagePriority = 
  | 'RESUSCITATION' 
  | 'EMERGENT' 
  | 'URGENT' 
  | 'LESS_URGENT' 
  | 'NON_URGENT';

export type IncidentStatus = 
  | 'REPORTED'
  | 'TRIAGED'
  | 'ALLOCATING'
  | 'RESERVED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'HANDED_OVER'
  | 'REPLANNING'
  | 'UNSERVED'
  | 'CANCELLED';

export type ReservationStatus = 
  | 'HELD' 
  | 'CONFIRMED' 
  | 'REJECTED' 
  | 'ARRIVED' 
  | 'HANDED_OVER' 
  | 'EXPIRED' 
  | 'CANCELLED';

export type AmbulanceStatus = 
  | 'AVAILABLE' 
  | 'DISPATCHED' 
  | 'EN_ROUTE' 
  | 'AT_HOSPITAL' 
  | 'OFF_DUTY';

export interface User {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  hospital_id?: string | null;
  created_at: string;
}

export interface Hospital {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
  last_reported_at: string;
  contact_phone?: string;
  created_at: string;
}

export interface ResourceUnit {
  id: string;
  hospital_id: string;
  category: ResourceCategory;
  unit_label: string;
  status: UnitStatus;
  is_movable: boolean;
  updated_at: string;
}

export interface IncidentRequirement {
  id?: string;
  incident_id?: string;
  category: ResourceCategory;
  quantity_needed: number;
  justification?: string;
  is_mandatory: boolean;
}

export interface Incident {
  id: string;
  caller_id?: string;
  idempotency_key: string;
  latitude: number;
  longitude: number;
  address_text?: string;
  description_raw?: string;
  audio_url?: string;
  triage_level: TriagePriority;
  status: IncidentStatus;
  unserved_reason?: string | null;
  created_at: string;
  updated_at: string;
  requirements?: IncidentRequirement[];
}

export interface Ambulance {
  id: string;
  vehicle_number: string;
  driver_id?: string;
  current_lat: number;
  current_lng: number;
  status: AmbulanceStatus;
  updated_at: string;
}

export interface Reservation {
  id: string;
  incident_id: string;
  unit_id: string;
  hospital_id: string;
  ambulance_id?: string;
  status: ReservationStatus;
  hold_expires_at: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditEventLog {
  id: number;
  incident_id?: string;
  event_type: string;
  payload: Record<string, any>;
  occurred_at: string;
}

// Optimization & Forecasting Contracts
export interface AllocationCandidate {
  hospitalId: string;
  hospitalName: string;
  distanceKm: number;
  estimatedTravelMinutes: number;
  isStale: boolean;
  minutesSinceReport: number;
  predictedAvailabilityAtEta: number; // Probability [0, 1]
  matchingUnits: ResourceUnit[];
  overallScore: number;
}

export interface BatchAllocationRequest {
  incidentIds: string[];
}

export interface BatchAllocationResult {
  assigned: Array<{
    incidentId: string;
    hospitalId: string;
    hospitalName: string;
    ambulanceId?: string;
    reservationIds?: string[];
    heldUnitIds: string[];
    travelMinutes: number;
    score: number;
  }>;
  unserved: Array<{
    incidentId: string;
    reason: string;
  }>;
}

export interface EvaluationScenarioResult {
  scenarioName: string;
  baseline: {
    totalPatients: number;
    servedCount: number;
    unservedCount: number;
    rerouteCount: number;
    doubleBookingCollisions: number;
    avgTransitMinutes: number;
  };
  smartEngine: {
    totalPatients: number;
    servedCount: number;
    unservedCount: number;
    rerouteCount: number;
    doubleBookingCollisions: number;
    avgTransitMinutes: number;
  };
  improvementSummary: string;
}
