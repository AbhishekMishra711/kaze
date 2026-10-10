# Product Requirements Document (PRD)

## Project: Real-Time Emergency Resource Allocator & Intelligent Dispatch Platform
**Problem Statement Code:** HLTH-02 (Track 02: Healthcare)  
**Event:** HackMatrix 5.0 — Final Round (Kali Yuga)  
**Target Deployment Context:** Emergency Medical Services (EMS) & Hospital Networks (Simulated in Pune Metropolitan Region)  
**Author:** Senior Backend Engineering Team  
**Status:** Approved for Implementation  

---

### 1. Executive Summary & Vision
In critical medical emergencies, survival is measured in minutes. Currently, emergency response in India faces a severe coordination breakdown: ambulances rush patients to the nearest hospital without real-time visibility into bed, ICU, or ventilator availability. This causes lethal delays when arriving at an overcrowded facility, forcing frantic multi-hospital reroutes.

This platform bridges emergency dispatchers, hospital emergency rooms (ERs), and ambulance crews into an **atomic, coordinated, and predictive resource allocation system**. It prevents hospital double-booking with mathematical certainty, optimizes batch allocations during mass casualty surges, predicts whether resources will actually be free when the patient arrives at their Estimated Time of Arrival (ETA), and dynamically replans routes when hospitals reject or en-route conditions deteriorate.

---

### 2. User Personas & Core Workflows

| Persona | Role | Core Goals & Pain Points | Primary Interface |
|---|---|---|---|
| **Citizen / Caller** | Patient or bystander raising an emergency | Needs to trigger an SOS instantly without friction; wants real-time status and ambulance ETA; cannot accurately diagnose clinical resource needs. | Citizen PWA / Mobile App (Next.js) |
| **EMS Dispatcher** | Emergency Operations Centre (EOC) controller | Needs a single pane of glass showing active incidents, fleet telemetry, hospital capacities, and batch allocation recommendations. | Dispatcher Command Console (Next.js) |
| **Hospital Staff / ER Doctor** | Medical Officer on duty at admitting facility | Must confirm or reject inbound reservations based on live clinical reality; needs incoming patient clinical summary prior to arrival. | Hospital ER Terminal (Next.js) |
| **Ambulance Driver / Paramedic** | Field medical responders | Needs navigation destination, patient triage details, real-time reroute alerts, and one-tap status updates (En-Route, Arrived, Handover Complete). | Paramedic Mobile Terminal (Next.js) |
| **Hackathon Evaluator / Admin** | Judge validating system resilience and ML accuracy | Needs deterministic scenario playback, stress-testing against concurrency/stale data, and side-by-side benchmark comparison against naive baselines. | Evaluator / Benchmark Dashboard |

---

### 3. Core Functional Requirements (FR)

#### 3.1 Citizen Intake & Multi-Modal Triage (The Front-Door)
* **FR-1 (Instant SOS Trigger):** One-tap emergency dispatch creation capturing geographic coordinates (lat/long) with network-safe idempotency keys.
* **FR-2 (Multi-Modal Incident Enrichment):** Citizen can optionally provide incident context via voice note, text narrative, or scene photos.
* **FR-3 (Clinical Need Extraction via LLM):** System extracts structured clinical triage level (Resuscitation, Emergent, Urgent, Non-Urgent) and specific resource requirements (e.g., `ICU_BED`, `VENTILATOR`, `TRAUMA_BAY`, `NEURO_SURGEON`) with strict validation against standard hospital ontology. Includes a deterministic rule-based fallback if LLM service is degraded.

#### 3.2 Real-Time Hospital Network & Data Freshness
* **FR-4 (Hospital Topology & Capacity):** Maintains real-time state of 5–8 hospitals with discrete physical resource units (e.g., Bed #ICU-04 at Aditya Birla Memorial).
* **FR-5 (Data Freshness Enforcement):** Hospitals must broadcast heartbeat status. If last report timestamp exceeds $\Delta t_{\text{stale}} = 15 \text{ mins}$, the facility is flagged as `STALE`, penalized in ranking, and requires manual dispatcher verification before dispatch.

#### 3.3 Concurrency Control & Double-Booking Prevention (Non-Negotiable)
* **FR-6 (Zero Double-Booking Guarantee):** When a hospital unit is allocated to an incident, it enters a `HELD` state with a 5-minute Time-To-Live (TTL). No other request can claim this unit. Guaranteed via PostgreSQL row-level locks (`SELECT ... FOR UPDATE SKIP LOCKED`) and partial unique indexes.
* **FR-7 (Hospital Confirmation & Handover Lifecycle):** Hospital staff must explicitly `ACCEPT` (transitions to `CONFIRMED`) or `REJECT` (triggers immediate reallocation). Upon arrival, staff completes `HANDED_OVER`, freeing the ambulance and marking the bed `OCCUPIED`.

#### 3.4 Addition 1: Batch Allocation & Dynamic Replanning
* **FR-8 (Batch Surge Allocation):** During mass casualty events or simultaneous incidents, the system executes a multi-patient batch solver rather than naive First-Come-First-Served (FCFS), globally minimizing critical transit time while honoring hospital capacities.
* **FR-9 (Dynamic Replanning Trigger):** If an assigned hospital rejects, a resource becomes faulty en-route, or traffic delay spikes beyond clinical safety thresholds, the replanner automatically reallocates in-transit patients to the next best destination without disturbing already accepted/handed-over patients.
* **FR-10 (Explicit Unserved Reason Logging):** If system cannot safely place a patient within allowable clinical distance/time, it refuses to silently fail or allocate incompatible resources; it explicitly logs structured failure reasons (e.g., `UNSERVED: NO_PEDIATRIC_ICU_WITHIN_MAX_ETA`).

#### 3.5 Addition 2: Predictive Arrival Availability & Baseline Evaluation
* **FR-11 (Arrival-Time Availability Forecaster):** Rather than evaluating current capacity at $t=0$, the system models $P(\text{Resource Available at ETA})$. It considers length-of-stay distributions, discharge probabilities, and historical intake surges to recommend destinations that will have capacity at patient arrival.
* **FR-12 (Deterministic Scenario Replay & Baseline Comparison Package):** An automated harness capable of running identical event logs against both:
  1. **Baseline Model:** Naive current-capacity-only FCFS allocator without predictive or replanning logic.
  2. **Proposed Smart Model:** Predictive availability + Batch solver + Dynamic replanning.
  Produces quantitative comparison tables (Handover Success Rate, Mean Transit Time, Reroute Count, Double-booking Violations).

---

### 4. Non-Functional Requirements (NFR)

* **NFR-1 (Consistency & Atomicity):** Strong ACID consistency for all reservation transitions. Partial allocations (e.g., allocated bed but no ventilator) are rolled back completely.
* **NFR-2 (Latency):**
  - Single SOS ingestion & reservation hold: $< 150 \text{ ms}$.
  - Batch allocation solving (up to 20 patients across 8 hospitals): $< 500 \text{ ms}$.
  - LLM Triage parsing: $< 2.5 \text{ s}$ (with instantaneous optimistic UI progression).
* **NFR-3 (Real-Time Propagation):** Real-time bidirectional telemetry over WebSockets (Socket.io) with latency $< 100 \text{ ms}$ for status changes and driver location pings.
* **NFR-4 (High Concurrency Stress Resistance):** Capable of surviving 50+ concurrent requests competing for 1 unit without data corruption or multiple winners.
* **NFR-5 (Auditability & Replayability):** Every state change, reservation event, allocation decision, and driver position update is logged with immutable timestamps (`event_log` table) to support forensic audit and replay.

---

### 5. Mandatory Demo Scenarios (Judge Verification Matrix)

| Scenario ID | Name | Test Conditions & Injected Events | Expected System Behavior |
|---|---|---|---|
| **SC-01** | **Mass Casualty Surge** | 10 patients generated within 30 seconds across Pune with varying triage levels (3 Critical, 4 Urgent, 3 Non-Urgent). | Batch allocator groups cases, routes critical patients to high-capability trauma centers, and distributes non-urgent cases efficiently without bottlenecking. |
| **SC-02** | **Hospital Rejection & Instant Replan** | Nearest tertiary hospital rejects an inbound cardiac emergency due to catheterization lab power failure. | In-transit ambulance automatically rerouted to secondary hospital in $< 1 \text{ second}$; driver and dispatcher notified via WebSockets; prior hold released cleanly. |
| **SC-03** | **Stale Data & Double-Booking Attack** | 2 ambulances simultaneously attempt to hold the last remaining ICU bed; 1 hospital data heartbeat has expired (35 min old). | Exactly 1 ambulance gets the reservation; second receives structured rejection; stale hospital is marked with warning badge and excluded from automatic ranking. |
| **SC-04** | **System Saturation & Unserved Logging** | Request for specialized Pediatric ECMO bed when all regional units are fully occupied. | System does not hallucinate an allocation; marks patient `UNSERVED` with full audit trace (`REASON_SPECIALTY_RESOURCE_EXHAUSTED`), alerting dispatcher for inter-city transfer. |
| **SC-05** | **Smart Predictive vs Baseline Shootout** | Identical replay script run through Baseline vs Proposed Engine. | Metrics dashboard displays clear evidence: Smart engine reduces diversion/reroute rate by $> 60\%$ and achieves zero double-bookings. |
