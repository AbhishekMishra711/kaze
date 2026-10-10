# Engineering Execution Tracker & Roadmap (Tracker)

## Project: Real-Time Emergency Resource Allocator & Intelligent Dispatch Platform
**Problem Statement Code:** HLTH-02  
**Current Phase:** Production-Ready & Verified  
**Execution Lead:** Senior Backend Engineer  
**Frontend Collaborator:** Next.js Lead  

---

### Legend
- `[ ]` Not Started
- `[/]` In Progress
- `[x]` Completed
- `[!]` Blocked / Attention Required

---

### Milestone 0: Environment Setup, Database & Seed Topology
*Objective: Establish project structure, database connection (Neon/PostgreSQL), and real-world Pune hospital/fleet seed data.*

- [x] **M0.1:** Initialize Node.js TypeScript project (`package.json`, `tsconfig.json`, ESLint, Prettier).
- [x] **M0.2:** Set up PostgreSQL connection pooling with Prisma / Kysely / Pg pooler + PGlite embedded fallback.
- [x] **M0.3:** Execute PostgreSQL DDL migrations (Tables: `users`, `hospitals`, `resource_units`, `incidents`, `reservations`, `ambulances`, `audit_event_logs`).
- [x] **M0.4:** Apply non-negotiable partial unique index: `one_active_reservation_per_unit`.
- [x] **M0.5:** Build seed script (`scripts/seed.ts`):
  - 6 Real Pune Hospitals (DY Patil, Aditya Birla, Sassoon, Ruby Hall, Manipal, YCM).
  - 144+ discrete units across 6 categories (`ICU_BED`, `VENTILATOR`, `TRAUMA_BAY`, `OXYGEN_BED`, `PEDIATRIC_ICU`, `GENERAL_BED`).
  - 6 ambulances placed across Pune hotspots (PCCOE Akurdi, Hinjawadi Phase 1, Baner, Shivajinagar, Chinchwad, Swargate).

---

### Milestone 1: Atomic Reservation Engine & Concurrency Defense
*Objective: Guarantee mathematical prevention of double-booking with row-level locks and time-to-live hold semantics.*

- [x] **M1.1:** Implement `ReservationService.holdUnitsAtomically()` using PostgreSQL transactions with `FOR UPDATE SKIP LOCKED`.
- [x] **M1.2:** Implement TTL auto-expiry background worker (runs every 30 seconds to expire abandoned holds).
- [x] **M1.3:** Build Concurrency Stress-Test Script (`scripts/test_concurrency.ts`):
  - Simulates 50 simultaneous parallel requests competing for 2 remaining ICU beds.
  - Verified: Exactly 2 succeed, 48 cleanly reject, 0 exceptions, 0 double-bookings.
- [x] **M1.4:** Expose Hospital ER Confirmation APIs (`acceptReservation`, `rejectReservation`, `completeHandover`).

---

### Milestone 2: Citizen Incident Intake & Multi-Modal LLM Triage
*Objective: Allow instant SOS creation and parse unstructured medical reports into structured hospital resource needs.*

- [x] **M2.1:** Implement `POST /api/v1/incidents/sos` with `Idempotency-Key` header validation.
- [x] **M2.2:** Build multi-modal incident attachment route (`POST /api/v1/incidents/:id/describe`) for text narrative or audio URL.
- [x] **M2.3:** Implement LLM Triage Service (Claude 3.5 / Haiku with strict token minimization & schema enforcement).
- [x] **M2.4:** Implement Deterministic Fallback Triage (keyword & symptom matcher for instant offline/zero-credit fallback).

---

### Milestone 3: Addition 1 — Batch Allocation & Dynamic Replanning
*Objective: Implement multi-patient optimization during surges and resilient in-transit rerouting.*

- [x] **M3.1:** Implement Distance & Travel Time Matrix Calculator (Haversine + Pune city speed heuristics).
- [x] **M3.2:** Implement Data Freshness Validator (Flags and penalizes hospitals where `last_reported_at > 15m`).
- [x] **M3.3:** Implement `BatchAllocatorService.solve()`:
  - Takes a batch of $N$ competing patients.
  - Optimizes global transit time weighted by clinical urgency.
  - Enforces hard capacity and specialty compatibility constraints.
- [x] **M3.4:** Implement `DynamicReplannerService`:
  - Listens for Hospital `REJECT` or En-Route Traffic Spike events.
  - Reallocates patient to secondary best hospital in $< 1 \text{ second}$.
  - Strictly preserves accepted/in-progress handovers.
- [x] **M3.5:** Implement Structured Unserved Logger:
  - Explicitly records reasons when resources cannot be fulfilled (e.g., `UNSERVED: NO_PEDIATRIC_ICU_WITHIN_MAX_ETA`).

---

### Milestone 4: Addition 2 — Python ML Forecaster & Baseline Replay Engine
*Objective: Build availability probability model at ETA and deterministic benchmark runner comparing against naive baseline.*

- [x] **M4.1:** Scaffold Python FastAPI micro-service (`ml-service/main.py`).
- [x] **M4.2:** Implement $P(\text{available at ETA})$ probabilistic model using resource turnaround distributions.
- [x] **M4.3:** Build internal HTTP client in Node.js to query `/predict` and integrate probabilities into allocator scoring.
- [x] **M4.4:** Build Deterministic Scenario Generator (`sim/scenarios.json` or embedded replay traces).
- [x] **M4.5:** Build Naive Baseline Allocator (`scripts/run_benchmark.ts`).
- [x] **M4.6:** Build Automated Evaluator Script (`ml-service/evaluate_model.py` and `scripts/run_benchmark.ts`):
  - Model evaluation: 43.01% Brier Score improvement on held-out test data.
  - Replay benchmark: Handover success +25%, Double-bookings eliminated (0 vs 3), transit delay reduced by 42.7%.

---

### Milestone 5: Real-Time WebSockets & Frontend Integration Contracts
*Objective: Deliver real-time Socket.io communication and clean API contracts for the Next.js frontend teammate.*

- [x] **M5.1:** Set up Socket.io server with room-based pub/sub (`hospital:<id>`, `dispatcher`, `incident:<id>`).
- [x] **M5.2:** Emit live lifecycle events (`incident:created`, `batch:allocated`, `reservation:confirmed`, `replan:alert`, `ambulance:moved`).
- [x] **M5.3:** Create complete API and WebSocket documentation (`docs/api_contracts.md`) for Next.js frontend teammate.
- [x] **M5.4:** Verify full compilation with `tsc --noEmit` (Zero errors).

---

### Milestone 6: Mandatory Judge Demo Scenarios & Replay Verification
*Objective: Verify all 5 mandatory judge scenarios and compile the reproducible evidence package.*

- [x] **M6.1:** Scenario 1 Verification — Mass Casualty Surge (10 simultaneous patients).
- [x] **M6.2:** Scenario 2 Verification — Hospital Rejection & Dynamic In-transit Reroute.
- [x] **M6.3:** Scenario 3 Verification — Stale Data & Concurrency Race Attack.
- [x] **M6.4:** Scenario 4 Verification — Saturated Regional Specialty & Unserved Reason Audit.
- [x] **M6.5:** Scenario 5 Verification — Smart vs Baseline Replay Benchmark & Evidence Package generation.
