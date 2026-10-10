# Technical Specification & Architecture Design (TechSpec)

## Project: Real-Time Emergency Resource Allocator & Intelligent Dispatch Platform
**Codebase:** `HackMatrix5.0-HLTH02`  
**Architecture Archetype:** Modular Monolith with Sidecar ML Forecaster  
**Target Environment:** Node.js (v20+ LTS) + TypeScript (v5+) + Python (v3.11+) + PostgreSQL (Neon/Supabase)  
**Status:** Approved Technical Architecture  

---

### 1. High-Level System Architecture

The system is designed as a high-throughput, low-latency **Modular Monolith** in TypeScript running on Node.js/Express, complemented by an internal **Python Micro-Service** dedicated to ML forecasting and baseline replay evaluations. 

```
┌────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND CLIENTS (Next.js)                    │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────┐  │
│   │ Citizen App  │   │  Dispatcher  │   │ Hospital ER  │   │ Driver │  │
│   │ (SOS/Triage) │   │ Command Hub  │   │  Dashboard   │   │ Tablet │  │
│   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └───┬────┘  │
└──────────┼──────────────────┼──────────────────┼───────────────┼───────┘
           │ REST / SSE       │ REST / WSS       │ REST / WSS    │ WSS
           ▼                  ▼                  ▼               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   EXPRESS / TYPESCRIPT CORE BACKEND                    │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Middleware Layer: JWT Auth, RBAC, Idempotency-Key, Audit Log   │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│   ┌─────────────────┐   ┌─────────────────┐   ┌────────────────────┐   │
│   │ Incident Intake │   │ LLM Clinical    │   │ Batch Allocator &  │   │
│   │ & SOS Controller│   │ Triage Parser   │   │ Dynamic Replanner  │   │
│   └────────┬────────┘   └────────┬────────┘   └─────────┬──────────┘   │
│            │                     │                      │              │
│            ▼                     ▼                      ▼              │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │     Reservation State Machine & Atomic Locking Engine          │   │
│   └────────────────────────────────┬───────────────────────────────┘   │
│                                    │                                   │
│            ┌───────────────────────┴───────────────────────┐           │
│            ▼                                               ▼           │
│   ┌─────────────────┐                             ┌────────────────┐   │
│   │ Socket.io Server│                             │ TTL Hold Expire│   │
│   │ (Realtime Sync) │                             │ Worker (30s)   │   │
│   └─────────────────┘                             └────────────────┘   │
└────────────┬───────────────────────────────────────────────┬───────────┘
             │                                               │
             │ Internal HTTP (`/predict`)                    │ Pooler / Direct SQL
             ▼                                               ▼
┌───────────────────────────────┐               ┌────────────────────────┐
│    PYTHON ML FORECASTER       │               │ CLOUD POSTGRESQL (NEON)│
│  (FastAPI / Scikit-Learn)     │               │                        │
│                               │               │ • Row Locks (`FOR      │
│ • P(Available at ETA)         │               │   UPDATE SKIP LOCKED`) │
│ • Historical Turnaround Curve │               │ • Partial Unique Index │
│ • Baseline Replay Harness     │               │ • Spatial Haversine    │
└───────────────────────────────┘               └────────────────────────┘
```

---

### 2. Database Design & Relational Schema

#### 2.1 Schema Definition & Data Dictionary (PostgreSQL)

```sql
-- 1. User & Role Management
CREATE TYPE user_role AS ENUM ('CITIZEN', 'DISPATCHER', 'HOSPITAL_STAFF', 'DRIVER', 'EVALUATOR');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    role user_role NOT NULL DEFAULT 'CITIZEN',
    hospital_id UUID NULL, -- Foreign key if role is HOSPITAL_STAFF
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Hospitals & Infrastructure
CREATE TABLE hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_reported_at TIMESTAMPTZ DEFAULT NOW(), -- Used for staleness calculation
    contact_phone VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Discrete Resource Inventory Units
CREATE TYPE resource_category AS ENUM (
    'ICU_BED', 
    'VENTILATOR', 
    'TRAUMA_BAY', 
    'OXYGEN_BED', 
    'PEDIATRIC_ICU', 
    'GENERAL_BED'
);

CREATE TYPE unit_status AS ENUM ('FREE', 'OCCUPIED', 'MAINTENANCE', 'FAULTY');

CREATE TABLE resource_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    category resource_category NOT NULL,
    unit_label VARCHAR(50) NOT NULL, -- e.g. "ICU-BED-04"
    status unit_status NOT NULL DEFAULT 'FREE',
    is_movable BOOLEAN DEFAULT FALSE, -- e.g. portable ventilators
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_resource_search ON resource_units(hospital_id, category, status);

-- 4. Emergency Incidents
CREATE TYPE triage_priority AS ENUM ('RESUSCITATION', 'EMERGENT', 'URGENT', 'LESS_URGENT', 'NON_URGENT');
CREATE TYPE incident_status AS ENUM (
    'REPORTED',
    'TRIAGED',
    'ALLOCATING',
    'RESERVED',
    'EN_ROUTE',
    'ARRIVED',
    'HANDED_OVER',
    'REPLANNING',
    'UNSERVED',
    'CANCELLED'
);

CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id UUID REFERENCES users(id),
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address_text TEXT,
    description_raw TEXT,
    audio_url TEXT,
    triage_level triage_priority DEFAULT 'EMERGENT',
    status incident_status DEFAULT 'REPORTED',
    unserved_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Incident Required Resources (Extracted by LLM / Overridden by Dispatcher)
CREATE TABLE incident_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    category resource_category NOT NULL,
    quantity_needed INT DEFAULT 1,
    justification TEXT,
    is_mandatory BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Fleet Ambulances
CREATE TYPE ambulance_status AS ENUM ('AVAILABLE', 'DISPATCHED', 'EN_ROUTE', 'AT_HOSPITAL', 'OFF_DUTY');

CREATE TABLE ambulances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_number VARCHAR(30) UNIQUE NOT NULL,
    driver_id UUID REFERENCES users(id),
    current_lat DOUBLE PRECISION NOT NULL,
    current_lng DOUBLE PRECISION NOT NULL,
    status ambulance_status DEFAULT 'AVAILABLE',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Reservations (The Critical Concurrency Table)
CREATE TYPE reservation_status AS ENUM ('HELD', 'CONFIRMED', 'REJECTED', 'ARRIVED', 'HANDED_OVER', 'EXPIRED', 'CANCELLED');

CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES resource_units(id) ON DELETE RESTRICT,
    hospital_id UUID NOT NULL REFERENCES hospitals(id),
    ambulance_id UUID REFERENCES ambulances(id),
    status reservation_status NOT NULL DEFAULT 'HELD',
    hold_expires_at TIMESTAMPTZ NOT NULL, -- Defaults to NOW() + INTERVAL '5 minutes'
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. THE CRITICAL ATOMICITY CONSTRAINT (NON-NEGOTIABLE)
-- A physical unit can ONLY have ONE active reservation across HELD, CONFIRMED, or ARRIVED states!
CREATE UNIQUE INDEX one_active_reservation_per_unit 
ON reservations(unit_id) 
WHERE status IN ('HELD', 'CONFIRMED', 'ARRIVED');

-- 9. Comprehensive Event & Audit Log (Supports Forensic Replay & Benchmarks)
CREATE TABLE audit_event_logs (
    id BIGSERIAL PRIMARY KEY,
    incident_id UUID,
    event_type VARCHAR(50) NOT NULL, -- e.g. 'UNIT_HELD', 'HOSPITAL_ACCEPTED', 'REPLAN_TRIGGERED'
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3. Concurrency & Transaction Control: Zero Double-Booking

Race conditions happen when two concurrent callers try to claim the last available ICU bed at 13:00:00.000. 

```
Ambulance 1 ──┐  Competing for Bed #ICU-01
              ├─────────────────────────────► [PostgreSQL Isolation Engine]
Ambulance 2 ──┘                                        │
                                                       ▼
                                ┌───────────────────────────────────────────────┐
                                │ Transaction 1: Obtains Row Lock (FOR UPDATE)  │
                                │ Status -> 'HELD', Unique Index Created        │
                                │ Returns: SUCCESS ✅                            │
                                └──────────────────────┬────────────────────────┘
                                                       ▼
                                ┌───────────────────────────────────────────────┐
                                │ Transaction 2: SKIP LOCKED (Row already held) │
                                │ Evaluates next candidate or queues            │
                                │ Returns: CLEAN ALTERNATIVE / QUEUED ❌        │
                                └───────────────────────────────────────────────┘
```

#### Atomic Multi-Resource Hold Logic (TypeScript + Raw SQL Transaction)
```typescript
/**
 * Atomically locks all requested resources for an incident.
 * If ANY mandatory resource fails to lock, the entire transaction rolls back cleanly.
 */
async function holdResourcesAtomically(
  client: pg.PoolClient,
  incidentId: string,
  hospitalId: string,
  requirements: Array<{ category: string; qty: number }>,
  holdDurationSeconds: number = 300
): Promise<{ success: boolean; heldUnits: string[]; error?: string }> {
  try {
    await client.query('BEGIN');

    const heldUnitIds: string[] = [];

    for (const req of requirements) {
      // Find candidate units that are FREE and have NO active reservation
      const selectQuery = `
        SELECT u.id 
        FROM resource_units u
        WHERE u.hospital_id = $1 
          AND u.category = $2 
          AND u.status = 'FREE'
          AND u.id NOT IN (
            SELECT unit_id FROM reservations 
            WHERE status IN ('HELD', 'CONFIRMED', 'ARRIVED')
          )
        ORDER BY u.id
        LIMIT $3
        FOR UPDATE SKIP LOCKED;
      `;

      const result = await client.query(selectQuery, [hospitalId, req.category, req.qty]);

      if (result.rows.length < req.qty) {
        // Insufficient capacity for this category -> Rollback entire reservation
        await client.query('ROLLBACK');
        return { success: false, heldUnits: [], error: `INSUFFICIENT_${req.category}` };
      }

      for (const row of result.rows) {
        heldUnitIds.push(row.id);
        const insertRes = `
          INSERT INTO reservations (incident_id, unit_id, hospital_id, status, hold_expires_at)
          VALUES ($1, $2, $3, 'HELD', NOW() + ($4 || ' seconds')::INTERVAL);
        `;
        await client.query(insertRes, [incidentId, row.id, hospitalId, holdDurationSeconds]);
      }
    }

    await client.query('COMMIT');
    return { success: true, heldUnits: heldUnitIds };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  }
}
```

---

### 4. Addition 1: Batch Allocation & Dynamic Replanning

#### 4.1 Batch Surge Allocation Optimization
During peak surges (e.g. multi-vehicle collision on Expressway), naive FCFS assigns the nearest hospital to the first caller, potentially depriving a more critical resuscitation patient of specialized care.

* **Batch Window:** Incoming incidents within a 5–10 second sliding window are grouped into candidate batch $\mathcal{I}$.
* **Objective Function:**
$$\min \sum_{i \in \mathcal{I}} \sum_{j \in \mathcal{H}} x_{ij} \cdot \left[ w_{\text{urgency}}(i) \cdot \text{TravelTime}(i, j) + \lambda_{\text{stale}} \cdot \text{StalenessPenalty}(j) - \mu_{\text{pred}} \cdot \ln(P_{ij}(\text{free at ETA})) \right]$$
* **Subject to Constraints:**
  1. $\sum_{j} x_{ij} \le 1 \quad \forall i$ (each patient assigned to at most one hospital).
  2. $\sum_{i} x_{ij} \cdot \text{Needs}(i, c) \le \text{Capacity}(j, c) \quad \forall j, c$ (hospital capacity cannot be breached).
  3. Hard feasibility: $x_{ij} = 0$ if hospital $j$ does not support mandatory specialty required by patient $i$.

#### 4.2 Dynamic Replanning Engine
When unexpected disruptions occur, the system triggers the **Replanner**:
1. **Trigger Events:**
   - Hospital ER Staff clicks `REJECT` on reservation within hold window.
   - Hospital signals equipment breakdown (`unit_status = 'FAULTY'`).
   - Ambulance Paramedic reports unexpected traffic delay ($\Delta \text{ETA} > 15 \text{ mins}$).
2. **Safety Invariant:** Patients already `CONFIRMED` or `ARRIVED` are strictly immutable; they are excluded from replanning.
3. **Execution:** In-transit patient is immediately returned to the allocation queue at top priority and routed to the secondary optimal facility within $< 1$ second.

---

### 5. Addition 2: Predictive Arrival Availability & Baseline Evaluation

#### 5.1 Probabilistic Model Formulation ($P(\text{available at ETA})$)
Rather than checking current status $S(t_0)$, the system computes the conditional probability that a requested resource unit will be vacant when the ambulance arrives at $t_{\text{ETA}}$:

* For a currently **FREE** unit:
  $$P(\text{free at } t_{\text{ETA}}) = \exp(-\lambda_{\text{arrival}} \cdot t_{\text{ETA}})$$
  where $\lambda_{\text{arrival}}$ is the hospital-specific emergency walk-in arrival rate (derived from historical time-of-day Poisson distributions).
* For a currently **OCCUPIED** unit with elapsed time $t_{\text{elapsed}}$:
  $$P(\text{discharged by } t_{\text{ETA}}) = 1 - \exp\left( - \left(\frac{t_{\text{elapsed}} + t_{\text{ETA}}}{\beta}\right)^\alpha \right)$$
  (Parameterized by resource type: Weibull distribution parameters $\alpha, \beta$ for ICU vs Emergency Bed turnaround).

#### 5.2 Deterministic Replay & Baseline Comparison Harness
Judges require reproducible evidence. We build a deterministic evaluation engine that executes the **exact same synthetic event trace** against two separate execution strategies:

| Dimension | Baseline Strategy (Naive) | Proposed Smart Engine |
|---|---|---|
| **Dispatch Mode** | Greedy FCFS (1 by 1) | Multi-Patient Batch Priority Solver |
| **Availability Metric** | Snapshot capacity at $t=0$ only | $P(\text{available at ETA})$ Predictive Model |
| **Staleness Handling** | None (treats 2-hour-old data as valid) | Strict penalty + manual review trigger |
| **Rejection Handling** | Driver unassisted (manual phone call) | Automated sub-second dynamic replanning |
| **Concurrency Safeguard** | None (prone to race collisions) | Strict DB row-locks + partial unique index |

The evaluator outputs an automated performance matrix:
* **Diversion / Reroute Rate (%)**
* **Average Patient Handover Delay (Minutes)**
* **Double-Booking Collisions (Count: 0 in Smart)**
* **Unserved Incidents with Valid Reason Transparency**

---

### 6. REST API Specification & Socket Contracts

#### 6.1 Citizen & Incident Endpoints
* `POST /api/v1/incidents/sos` — Trigger instantaneous SOS (returns incident ID & tracking token).
* `POST /api/v1/incidents/:id/describe` — Attach voice note, text, or photo.
* `GET /api/v1/incidents/:id/status` — Live status, assigned hospital, and ambulance tracking.

#### 6.2 Dispatcher Command Endpoints
* `GET /api/v1/dispatcher/active-incidents` — Active queue with triage scores & recommendations.
* `POST /api/v1/dispatcher/solve-batch` — Triggers batch allocation solver on current queue.
* `POST /api/v1/dispatcher/override-allocation` — Manual dispatcher intervention.

#### 6.3 Hospital ER Terminal Endpoints
* `GET /api/v1/hospital/:id/reservations` — Inbound ambulances and held reservations.
* `POST /api/v1/hospital/reservations/:resId/accept` — Confirms bed hold.
* `POST /api/v1/hospital/reservations/:resId/reject` — Rejects hold, triggering instant replan.
* `POST /api/v1/hospital/reservations/:resId/handover` — Completes handoff; frees ambulance.
* `PUT /api/v1/hospital/:id/capacity` — Update live bed/unit status.

#### 6.4 Paramedic / Driver Endpoints
* `PATCH /api/v1/ambulances/:id/telemetry` — Update GPS lat/lng and speed.
* `POST /api/v1/ambulances/:id/status` — Transitions: `DISPATCHED` $\to$ `EN_ROUTE` $\to$ `ARRIVED`.

#### 6.5 Benchmark & Evaluator Endpoints
* `POST /api/v1/evaluator/run-scenario` — Ingests scenario name (`surge`, `rejection`, `stale_double_book`, `unserved`) and runs both Baseline vs Smart engines.
* `GET /api/v1/evaluator/metrics` — Returns comparative KPI table for judges.

#### 6.6 Socket.io Real-Time Event Taxonomy
* `incident:created` (Broadcast to Dispatcher)
* `reservation:proposed` (Sent to specific Hospital room)
* `reservation:confirmed` (Broadcast to Dispatcher, Driver, Citizen)
* `reservation:replan_triggered` (Immediate alert to Driver & Dispatcher)
* `ambulance:telemetry_ping` (Real-time map updates)
