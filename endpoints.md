# HLTH-02 Real-Time Emergency Resource Allocator — API Directory

> **Base URLs:**
> - **Backend REST API:** `http://localhost:4000`
> - **Real-time WebSockets:** `ws://localhost:4000` (Socket.io)
> - **Python ML Forecaster (XAI):** `http://localhost:8000`

---

## 0. 🔐 Authentication & Onboarding

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/hospital/register` | **Hospital Self-Registration:** Registers new hospital (`name`, `admin_id`, `password`, `lat`/`lng`, `phone`). Provisions 24 standard emergency units. |
| `POST` | `/api/v1/auth/hospital/login` | **Hospital Staff Login:** Authenticates hospital staff with `admin_id` (`hospital_name@admin`) and `password`. |
| `POST` | `/api/v1/auth/ambulance/login` | **Ambulance Admin Login:** Authenticates central dispatcher with `admin` / `admin`. |

---

## 1. 🧑‍🦱 Citizen / Caller (Emergency SOS App)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/incidents/sos` | **Trigger SOS:** Submits GPS coordinates (`lat`/`lng`), emergency description, and optional audio. Automatically runs clinical triage and queues for hospital allocation. |
| `GET` | `/api/v1/incidents/:id` | **Live Incident Tracking:** Returns live status (`ALLOCATING`, `RESERVED`, `EN_ROUTE`), assigned hospital name, ambulance vehicle number, driver contact phone, and reservation hold timer. |

---

## 2. 🎧 EMS Dispatcher & Ambulance Admin Console

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/dispatcher/active-incidents` | **Active Queue:** Returns all waiting emergency cases sorted by clinical triage urgency (`RESUSCITATION` first). |
| `GET` | `/api/v1/dispatcher/incidents/:id/recommendations` | **Automated Nearest Hospital Calculation:** Ranks all active hospitals by distance, travel time, available beds/ventilators, and ML-calibrated arrival availability $P(\text{available at ETA})$. |
| `POST` | `/api/v1/dispatcher/incidents/:id/request-hospital` | **Request Bed at Hospital:** Holds requested medical resource at the selected hospital and alerts hospital ER terminal in real-time. |
| `POST` | `/api/v1/dispatcher/incidents/:id/dispatch-ambulance` | **Confirm Dispatch:** Dispatches 108 ambulance with driver name & phone, streaming telemetry to the citizen's mobile app. |
| `POST` | `/api/v1/dispatcher/solve-batch` | **AI Batch Optimizer:** Evaluates all waiting patients simultaneously across Pune, optimizing travel times, capacities, and $P(\text{available at ETA})$. |
| `GET` | `/api/v1/dispatcher/hospitals` | **Hospital Overview:** Live bed, ICU, and ventilator capacities across all 6 hospitals. Automatically flags stale hospitals ($>15$m since last heartbeat). |
| `GET` | `/api/v1/dispatcher/ambulances` | **Fleet Telemetry:** Live GPS coordinates, availability, and trip statuses for all ambulances. |

---

## 3. 🏥 Hospital ER Staff & Doctors (ER Reception Terminal)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/hospitals/:id` | **Hospital Profile & Capacity:** Returns hospital status (`is_active`), coordinates, freshness rating, and aggregated counts for all 6 categories. |
| `GET` | `/api/v1/hospitals/:id/resources` | **Discrete Unit Inventory:** Lists all physical units with real-time atomic states (`FREE`, `OCCUPIED`, `MAINTENANCE`, `HELD`). |
| `GET` | `/api/v1/hospitals/:id/reservations` | **Inbound Cases:** Shows incoming ambulances, patient clinical notes, reserved unit numbers, and hold countdown timers. |
| `POST` | `/api/v1/hospitals/reservations/:resId/accept` | **1-Click Accept:** Confirms bed hold, alerting driver and dispatcher that ER is ready. |
| `POST` | `/api/v1/hospitals/reservations/:resId/reject` | **Reject & Auto-Replan:** Rejects reservation; backend instantly re-optimizes the in-transit ambulance to the next best hospital in $<1$ second. |
| `POST` | `/api/v1/hospitals/reservations/:resId/handover` | **Complete Handover:** Patient is admitted to bed; frees ambulance back to the available pool. |
| `PATCH` | `/api/v1/hospitals/:id/status` | **Temporary Shutdown / Re-open:** Closes hospital (e.g. power cut / ER diversion). **Automatically reroutes all inbound ambulances!** |
| `POST` | `/api/v1/hospitals/:id/resources` | **Add Discrete Units:** Adds new physical equipment (e.g. `+2 VENTILATOR`, `+1 ICU_BED`). |
| `PATCH` | `/api/v1/hospitals/:id/resources/adjust` | **Quick Capacity Delta:** Adjusts available units with delta (`+1` to free up, `-1` to mark under maintenance). |
| `POST` | `/api/v1/hospitals/:id/heartbeat` | **Heartbeat Refresh:** Updates last-reported timestamp and clears the 15-minute staleness warning penalty. |

---

## 4. 🚑 Ambulance Paramedic / Driver (Navigation Tablet)

| Method | Endpoint | Description |
|---|---|---|
| `PATCH` | `/api/v1/ambulances/:id/location` | **GPS Telemetry Ping:** Updates driver's live latitude and longitude coordinates on the dispatcher map. |
| `POST` | `/api/v1/ambulances/:id/status` | **Trip Status Transition:** Updates status (`DISPATCHED` $\to$ `EN_ROUTE` $\to$ `ARRIVED`). |

---

## 5. 🧠 AI & Machine Learning Service (Decision Intelligence)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `http://localhost:8000/predict` | **Explainable AI (XAI) Forecaster:** Calculates calibrated $P(\text{available at ETA})$ with feature attributions (bed buffer $+18\%$, peak hour $-7\%$, travel delay $-4\%$) and clinical summary. |
| `GET` | `http://localhost:8000/health` | **ML Service Health:** Verifies the Calibrated HistGradientBoosting model pipeline artifact is loaded in memory. |

---

## 6. 🏆 Judges & Evaluators (Benchmark Scorecards & Stress-Tests)

| Target | Command / Endpoint | Description |
|---|---|---|
| **API** | `GET /api/v1/evaluator/benchmark` | **Proof Scorecard:** Live comparative table between Naive Baseline and Proposed Smart Engine (Success rate, Reroutes, Double-booking collisions). |
| **CLI** | `npm run test:concurrency` | **50-Thread Race Attack:** Proves zero double-booking under extreme simultaneous caller load. |
| **CLI** | `npm run test:benchmark` | **Scenario Replay:** Deterministically verifies all 5 mandatory hackathon scenarios. |
| **CLI** | `python evaluate_model.py` | **ML Benchmark:** Proves +40.4% Brier Score improvement on held-out test data over baseline. |
