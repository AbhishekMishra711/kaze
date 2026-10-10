# HLTH-02 Backend API & WebSocket Contracts for Frontend (Next.js)

**Backend Server Base URL:** `http://localhost:4000`  
**WebSocket Server URL:** `ws://localhost:4000` (Socket.io)  
**Authentication Header:** Optional in early dev, `Authorization: Bearer <token>` when enabled.

---

## 1. Real-Time Socket.io Events

Connect using standard `socket.io-client`:
```typescript
import { io } from 'socket.io-client';
export const socket = io('http://localhost:4000');
```

| Event Name | Direction | Payload Example | Description |
|---|---|---|---|
| `incident:created` | Server $\to$ Client | `{ id, latitude, longitude, triage_level, description_raw, requirements }` | Broadcast whenever citizen triggers SOS |
| `batch:allocated` | Server $\to$ Client | `{ assigned: [...], unserved: [...] }` | Broadcast when batch allocation completes |
| `reservation:confirmed` | Server $\to$ Client | `{ reservationId }` | Hospital staff accepts inbound ambulance |
| `replan:alert` | Server $\to$ Client | `{ incidentId, replan: { newHospitalName, newTravelMinutes } }` | Triggered when hospital rejects and patient is rerouted |
| `handover:completed` | Server $\to$ Client | `{ reservationId }` | Patient arrived and handed over to ER bed |
| `ambulance:moved` | Server $\to$ Client | `{ id, latitude, longitude }` | Paramedic GPS location telemetry update |

---

## 2. Citizen / SOS Endpoints

### 2.1 Trigger Emergency SOS
* **Method & Path:** `POST /api/v1/incidents/sos`
* **Request Body:**
```json
{
  "latitude": 18.6253,
  "longitude": 73.8166,
  "description": "Severe chest pain and shortness of breath at Akurdi station",
  "addressText": "Akurdi, Pimpri-Chinchwad",
  "callerId": "optional-uuid"
}
```
* **Response (HTTP 201):**
```json
{
  "success": true,
  "incident": {
    "id": "e4b1...-uuid",
    "triage_level": "EMERGENT",
    "status": "ALLOCATING",
    "requirements": [
      {
        "category": "ICU_BED",
        "quantity": 1,
        "justification": "Cardiac critical care monitoring"
      },
      {
        "category": "OXYGEN_BED",
        "quantity": 1,
        "justification": "Supplemental high-flow oxygen"
      }
    ]
  }
}
```

### 2.2 Get Live Incident Status & Assigned Hospital
* **Method & Path:** `GET /api/v1/incidents/:id`
* **Response (HTTP 200):**
```json
{
  "success": true,
  "incident": {
    "id": "e4b1...",
    "status": "RESERVED",
    "triage_level": "EMERGENT"
  },
  "activeReservation": {
    "id": "res-uuid",
    "hospital_id": "hosp-uuid",
    "hospital_name": "Aditya Birla Memorial Hospital (Thergaon)",
    "vehicle_number": "MH-14-EM-1081",
    "status": "HELD",
    "hold_expires_at": "2026-10-10T08:45:00.000Z"
  }
}
```

---

## 3. Dispatcher Command Console Endpoints

### 3.1 List Active Emergency Queue
* **Method & Path:** `GET /api/v1/dispatcher/active-incidents`
* **Response (HTTP 200):**
```json
{
  "success": true,
  "count": 3,
  "incidents": [
    {
      "id": "...",
      "triage_level": "RESUSCITATION",
      "status": "ALLOCATING",
      "latitude": 18.62,
      "longitude": 73.81,
      "description_raw": "Multi-car collision on old highway",
      "requirements": [
        { "category": "TRAUMA_BAY", "quantity_needed": 1 },
        { "category": "VENTILATOR", "quantity_needed": 1 }
      ]
    }
  ]
}
```

### 3.2 Trigger Batch Allocation
* **Method & Path:** `POST /api/v1/dispatcher/solve-batch`
* **Request Body:**
```json
{
  "incidentIds": ["optional-array-of-uuids-or-empty-for-all-active"]
}
```
* **Response (HTTP 200):**
```json
{
  "success": true,
  "result": {
    "assigned": [
      {
        "incidentId": "inc-1",
        "hospitalId": "hosp-1",
        "hospitalName": "Aditya Birla Memorial Hospital",
        "ambulanceId": "amb-1",
        "heldUnitIds": ["unit-101", "unit-102"],
        "travelMinutes": 4,
        "score": 117.6
      }
    ],
    "unserved": [
      {
        "incidentId": "inc-2",
        "reason": "UNSERVED: NO_MATCHING_RESOURCES_WITHIN_MAX_ETA [PEDIATRIC_ICU]"
      }
    ]
  }
}
```

### 3.3 List Regional Hospitals & Capacity (with Staleness Badging)
* **Method & Path:** `GET /api/v1/dispatcher/hospitals`
* **Response (HTTP 200):**
```json
{
  "success": true,
  "hospitals": [
    {
      "id": "...",
      "name": "Dr. D.Y. Patil Medical College Hospital (Pimpri)",
      "latitude": 18.6253,
      "longitude": 73.8166,
      "isStale": false,
      "minutesSinceReport": 2,
      "stalenessPenalty": 0,
      "capacity": [
        { "category": "ICU_BED", "total": 4, "free": 3 },
        { "category": "VENTILATOR", "total": 3, "free": 2 },
        { "category": "TRAUMA_BAY", "total": 2, "free": 2 }
      ]
    },
    {
      "id": "...",
      "name": "Sassoon General Hospital (Govt Tertiary)",
      "isStale": true,
      "minutesSinceReport": 45,
      "stalenessPenalty": 100
    }
  ]
}
```

---

## 4. Hospital ER Terminal Endpoints

### 4.1 Inbound Ambulances & Reservations
* **Method & Path:** `GET /api/v1/hospitals/:id/reservations`
* **Response (HTTP 200):** Array of inbound cases with patient triage, ambulance vehicle, unit label, and hold expiry.

### 4.2 Confirm Inbound Case (1-Click Accept)
* **Method & Path:** `POST /api/v1/hospitals/reservations/:resId/accept`
* **Response (HTTP 200):** `{ "success": true, "message": "Reservation confirmed by hospital ER" }`

### 4.3 Reject Inbound Case (Triggers Dynamic Replan)
* **Method & Path:** `POST /api/v1/hospitals/reservations/:resId/reject`
* **Request Body:**
```json
{
  "reason": "Cath-lab equipment power failure",
  "hospitalId": "hosp-uuid"
}
```
* **Response (HTTP 200):**
```json
{
  "success": true,
  "message": "Reservation rejected and patient dynamically replanned",
  "replan": {
    "reallocated": true,
    "newHospitalName": "Dr. D.Y. Patil Medical College Hospital",
    "newTravelMinutes": 5
  }
}
```

### 4.4 Complete ER Handover
* **Method & Path:** `POST /api/v1/hospitals/reservations/:resId/handover`
* **Response (HTTP 200):** `{ "success": true, "message": "Patient handover completed successfully" }`

### 4.5 Temporarily Shut Down or Re-open Hospital (Auto-Reroutes Inbound Patients)
* **Method & Path:** `PATCH /api/v1/hospitals/:id/status`
* **Request Body:**
```json
{
  "isActive": false,
  "reason": "Emergency generator failure"
}
```
* **Response (HTTP 200):**
```json
{
  "success": true,
  "message": "Hospital temporarily SHUT DOWN / DIVERTED",
  "reroutedPatients": [
    {
      "incidentId": "...",
      "reallocated": true,
      "newHospitalName": "Dr. D.Y. Patil Medical College Hospital",
      "newTravelMinutes": 5
    }
  ]
}
```

### 4.6 Add New Resource Units (e.g. 2 New Ventilators)
* **Method & Path:** `POST /api/v1/hospitals/:id/resources`
* **Request Body:**
```json
{
  "category": "VENTILATOR",
  "count": 2,
  "isMovable": true
}
```
* **Response (HTTP 201):**
```json
{
  "success": true,
  "message": "Added 2 VENTILATOR unit(s) to hospital",
  "units": ["VENTILATOR-04", "VENTILATOR-05"]
}
```

### 4.7 Increment / Decrement Resource Capacity
* **Method & Path:** `PATCH /api/v1/hospitals/:id/resources/adjust`
* **Request Body:**
```json
{
  "category": "ICU_BED",
  "delta": -1
}
```
*(Use `delta: +1` to increase available beds, `delta: -1` to mark a bed as in maintenance/unavailable)*
* **Response (HTTP 200):**
```json
{
  "success": true,
  "message": "Capacity adjusted by -1 for ICU_BED"
}
```

### 4.8 Hospital Heartbeat / Freshness Refresh
* **Method & Path:** `POST /api/v1/hospitals/:id/heartbeat`
* **Response (HTTP 200):** `{ "success": true, "message": "Hospital heartbeat updated. Freshness restored!" }`

---

## 5. Judge Benchmark / Reproducible Metrics API

* **Method & Path:** `GET /api/v1/evaluator/benchmark`
* **Response (HTTP 200):** Complete side-by-side comparison table between Naive Baseline and Proposed Smart Engine.

---

## 6. Explainable ML Forecaster API (`http://localhost:8000`)

### 6.1 Predict Availability at ETA with Explainable AI (XAI)
* **Method & Path:** `POST http://localhost:8000/predict`
* **Request Body:**
```json
{
  "hospital_id": "aditya-birla-01",
  "resource_category": "ICU_BED",
  "current_free_units": 2,
  "eta_minutes": 15.0,
  "time_of_day_hour": 19
}
```
* **Response (HTTP 200):**
```json
{
  "p_available": 0.812,
  "model_version": "v2.1-explainable-calibrated-gbm",
  "eta_minutes": 15.0,
  "ci_lower": 0.781,
  "ci_upper": 0.843,
  "algorithm": "Calibrated HistGradientBoosting Classifier (Platt Sigmoid Scaled)",
  "clinical_summary": "High availability likelihood (81.2%) for ICU_BED. Key driver: 2 vacant beds (+18.4%), dampened by peak emergency rush (-7.8%), with 15m travel window (-4.1%).",
  "xai_attributions": [
    {
      "feature": "Current Free Units (2 units)",
      "impact": "+18.4%",
      "direction": "POSITIVE",
      "description": "Strong local buffer against competing walk-in patients"
    },
    {
      "feature": "Time of Day (19:00 Hrs)",
      "impact": "-7.8%",
      "direction": "NEGATIVE",
      "description": "Peak emergency surge period: high local admission turnover"
    },
    {
      "feature": "Transit ETA (15.0 mins)",
      "impact": "-4.1%",
      "direction": "NEGATIVE",
      "description": "Extended travel time widens vulnerability to walk-in preemption"
    },
    {
      "feature": "Resource Category (ICU_BED)",
      "impact": "-3.2%",
      "direction": "NEGATIVE",
      "description": "Specialized critical unit with high regional scarcity"
    }
  ],
  "insights": {
    "demand_pressure": "Moderate Load",
    "peak_surge_status": "Peak Surge Hours (High Admission Pressure)"
  }
}
```
