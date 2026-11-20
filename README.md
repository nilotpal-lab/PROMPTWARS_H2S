# Domino Sky — Flight Disruption Cascade & Recovery Simulator

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Live%20Production-brightgreen?logo=vercel)](https://domino-sky-rho.vercel.app)
[![Tests Passing](https://img.shields.io/badge/Tests-48%2F48%20Passing-success)](https://github.com/nilotpal-lab/PROMPTWARS_H2S)
[![Deterministic Engine](https://img.shields.io/badge/Engine-100%25%20Deterministic-blue)](#)

🚀 **Live Production URL:** [https://domino-sky-rho.vercel.app](https://domino-sky-rho.vercel.app)  
🛰️ **Mirror Deployment:** [https://domino-sky-nilotpaldeb083-gmailcoms-projects.vercel.app](https://domino-sky-nilotpaldeb083-gmailcoms-projects.vercel.app)

Domino Sky is an airline Network Operations Center (NOC) simulator that models cascading flight delays, broken passenger transfers, and crew duty limits across a 24-hour schedule. When any hub airport closes, the system computes delay propagation along each aircraft's flight chain using pure deterministic logic. An integrated AI recovery dispatcher recommends proactive cancellations and spare aircraft swaps to minimize stranded passengers.

**Core Invariant:** Every delay, cancellation, passenger count, and crew duty figure is produced strictly by deterministic code (`engine.js`). The AI dispatcher writes operational prose using placeholders resolved directly against engine calculations—it is mathematically incapable of hallucinating numbers.

---

## Quick Start

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Local Installation & Execution

```bash
# 1. Clone repository
git clone https://github.com/nilotpal-lab/PROMPTWARS_H2S.git
cd PROMPTWARS_H2S

# 2. Install dependencies
npm install

# 3. Configure environment (Optional: enables Gemini AI prose generation)
cp .env.example .env
# Edit .env to add your GEMINI_API_KEY from Google AI Studio:
# GEMINI_API_KEY=your_api_key_here
# GEMINI_MODEL=gemini-3.5-flash-lite

# 4. Start local operations server
npm start
# Server listens at http://localhost:3000

# 5. Run automated test suite (48 tests, 0 network or API key required)
npm test
```

> **Zero-Key Deterministic Fallback:** Without a `GEMINI_API_KEY`, Domino Sky remains 100% operational. The AI dispatcher uses an internal deterministic operational template that reports identical, engine-verified figures.

---

## Problem Statement & Operational Mechanics

When severe weather closes an airport, the ripple effects spread throughout the entire flight network:
1. **Turnaround Slack Absorption:** Flights on the same aircraft chain absorb delays through turnaround buffer slack (minimum 30 minutes). Once slack is exhausted, subsequent departures are delayed.
2. **Reopening Queue:** When a closed airport reopens, held departures enter an orderly slot queue metered by airport capacity (`60 / capacity_per_hour` minutes per departure).
3. **Rotational Cascades:** An aircraft held in Mumbai morning departures will start late in Bengaluru, Hyderabad, and Kolkata hours later, even under clear skies.
4. **Broken Passenger Connections:** When a feeder flight arrives late, passengers with connection buffers under `min_connect_minutes` miss their outbound flight and become stranded.
5. **Flight Duty Period (FDP) Breaches:** Indian aviation regulations cap crew duty at 600 minutes (10 hours). If rotational delays push a crew past this threshold, the flight is cancelled immediately (`cancelReason: crew_duty`).
6. **Aircraft Out-of-Position:** When a leg cancels, the aircraft remains at its departure airport. The subsequent leg (scheduled to depart from the destination) cancels due to missing equipment (`out_of_position`).

---

## System Architecture

```
flight_network.json  (16 airports, 70 flights, 16 aircraft, 21 connections, 16 crews, 2 spares)
        │
        ▼
   engine.js  (Pure ES modules, deterministic, zero randomness, zero external dependencies)
    ├─ simulate()       Propagates delays, calculates turnaround, connection slack, crew FDP
    ├─ explainFlight()  Generates causal delay provenance chain for any flight
    └─ recommend()      Greedy solver evaluating candidate spare swaps and proactive cancellations
        │
        ▼
   server/dispatcher.js  (Anti-Hallucination AI Pipeline)
    Facts (from engine) ──► Gemini LLM ──► JSON with {{placeholders}}
                                 │
                                 ▼
                     validateNarrative()   (Rejects any bare unverified digits)
                                 │
                                 ▼
                     resolveNarrative()    (Substitutes real engine numbers)
                                 │
                                 ▼
                     auditNumbers()        (Final pass: every digit must exist in facts)
                                 │
         (On failure or absent API key) ──► Deterministic Template
        │
        ▼
   server/index.js  (Express API: Rate Limiting, CSP, Whitelist Validation)
        │
        ▼
   public/  (High-density Tactical Glass Cockpit: Radar, Gantt Timeline, Telemetry)
```

---

## Why the AI Cannot Hallucinate Numbers

Domino Sky enforces a zero-trust architecture between the language model and operations metrics:

1. **Facts Isolation:** The model only receives a structured `facts` JSON object computed by `engine.js`. This includes deltas (`strandedSaved`, `crewBreachesAvoided`).
2. **Placeholder Contract:** The system prompt prohibits raw numbers. The model must write placeholders:
   ```json
   {
     "headline": "BOM closure: {{overall.actionCount}} actions save {{overall.strandedSaved}} stranded passengers.",
     "steps": [
       {
         "action": "Swap spare {{steps.0.spare}} onto {{steps.0.flight}}",
         "rationale": "Saves {{steps.0.strandedSaved}} passengers and avoids crew breach."
       }
     ]
   }
   ```
3. **Pre-Resolution Validation (`validateNarrative`):** Strips allowed identifiers (flight codes like `DS0101`, tail numbers `VT-DS17`, times `07:00`). If any bare digits remain, the attempt is rejected and retried with explicit error feedback.
4. **Engine Substitution (`resolveNarrative`):** The server replaces placeholders with exact integer values from the engine.
5. **Post-Resolution Audit (`auditNumbers`):** Every single numeric token in the final text is scanned against the set of valid numbers in `facts`. Any discrepancy causes instant fallback to the deterministic template.

---

## Simulation Rules & Parameters

| Operational Rule | Constraint / Value | Implementation |
|---|---|---|
| **Aircraft Leg Sequence** | Flights execute in strict `leg_order` per aircraft tail | `dep = max(schedDep, prevArr + 30m)` |
| **Turnaround Buffer** | Minimum 30 minutes between arrival and departure | Turnaround slack absorbs delay before departure slips |
| **Airport Closure** | Zero departures during closure window. Arrivals hold until reopening | Held flights released per capacity slot queue |
| **Slot Metering** | `60 / capacity_per_hour` minutes per release slot | Mumbai (32/h) releases a flight every 1.875 min |
| **Late Threshold** | Arrival delay $\ge$ 15 minutes | Categorized as `delayed` |
| **Cancellation Threshold** | Departure delay $\ge$ 240 minutes | Categorized as `cancelled` (`cancelReason: delay_threshold`) |
| **Crew Duty Limit** | Maximum 600 minutes total duty | Categorized as `cancelled` (`cancelReason: crew_duty`) |
| **Equipment Repositioning**| Cancelled leg strands aircraft at origin | Downstream flight cancelled (`cancelReason: out_of_position`) |
| **Connection Slack** | Transfer buffer must exceed `min_connect_minutes` | Broken connections mark passengers as stranded |
| **Stranded Accounting** | `Cancelled pax` + `Missed transfer pax` | Deduplicated so each passenger is counted at most once |
| **Spare Aircraft Swaps** | 2 available spares (DEL: `VT-DS17`, BLR: `VT-DS18`) | Ferry time: 800 km/h great-circle distance + 20 min prep |

---

## Benchmark Scenarios

### Benchmark 1: Morning Hub Collapse (`BOM 07:00–11:00`, 240 min)
- **Disrupted Baseline:** 21 delayed flights, 4 cancellations, 861 stranded passengers, 4 crew duty breaches.
- **AI Recovery Plan:**
  1. Swap spare `VT-DS18` (BLR) onto flight `DS1204`.
  2. Swap spare `VT-DS17` (DEL) onto flight `DS0704`.
- **Recovered Outcome:** Stranded passengers drop from **861 to 534** (327 passengers rescued, 2 crew breaches resolved).

### Benchmark 2: Problem Statement Thunderstorm (`BOM 15:00–16:30`, 90 min)
- **Disrupted Baseline:** Demonstrates how an afternoon storm in Mumbai propagates across rotations to cancel flight `DS0304` (`DEL-CCU`) hours later due to crew `CR03` exceeding 600 minutes duty.
- **Outcome:** 167 passengers stranded on downstream clear-sky legs directly attributable to Mumbai weather.

---

## REST API Specification

### 1. Health & Telemetry Check
- **Endpoint:** `GET /api/health`
- **Response:**
  ```json
  {
    "status": "ok",
    "version": "1.0.0",
    "engine": "deterministic",
    "llm": { "enabled": true, "model": "gemini-3.5-flash-lite" },
    "network": { "airports": 16, "flights": 70, "crews": 16 }
  }
  ```

### 2. Disruption Simulation
- **Endpoint:** `POST /api/simulate`
- **Request Body:**
  ```json
  {
    "closures": [
      { "airport": "BOM", "start": "07:00", "end": "11:00" }
    ]
  }
  ```
- **Response:** Complete simulation object containing `summary`, `flights[]`, `connections[]`, `crews[]`, and `closures[]`.

### 3. AI Recovery Dispatch
- **Endpoint:** `POST /api/dispatch`
- **Request Body:**
  ```json
  {
    "closures": [
      { "airport": "BOM", "start": "07:00", "end": "11:00" }
    ]
  }
  ```
- **Response:**
  ```json
  {
    "plan": [
      { "type": "swap", "flight_id": "DS1204", "spare": "VT-DS18" },
      { "type": "swap", "flight_id": "DS0704", "spare": "VT-DS17" }
    ],
    "before": { "strandedPax": 861, "cancelledFlights": 4, "delayedFlights": 21, "crewBreaches": 4 },
    "after": { "strandedPax": 534, "cancelledFlights": 2, "delayedFlights": 21, "crewBreaches": 2 },
    "narrative": { "headline": "...", "steps": [...], "summary": "..." },
    "verification": {
      "source": "gemini",
      "numbersVerifiedAgainstEngine": true,
      "llmAttempts": 1
    }
  }
  ```

---

## Defensive Engineering & Security

- **Content Security Policy (CSP):** Strict policy whitelisting `self` and Google Fonts.
- **In-Memory Rate Limiting:** 120 requests/minute per client IP to safeguard against denial-of-service and API quota abuse.
- **Input Sanitization:** Strict whitelist validation for airport and flight identifiers; prototype pollution defense blocks `__proto__` and `constructor` injections.
- **Size Bounds:** HTTP request body limit strictly capped at 64KB.
- **Credential Protection:** `GEMINI_API_KEY` is loaded exclusively on the backend via `.env` and is never exposed in client bundles.

---

## Verification & Testing

Domino Sky maintains **48 automated test specifications** running across 6 test suites with zero external dependencies:

```bash
npm test
```

```
✔ without an LLM, deterministic template is used and numbers verify
✔ honest LLM using placeholders is accepted and numbers are resolved from engine
✔ LLM that invents numbers is rejected, retried, then replaced by template
✔ LLM referencing a non-existent placeholder is rejected
✔ baseline: no closure means schedule is reproduced exactly
✔ determinism: identical input gives identical output
✔ closure delays flights that depart from or land at the closed airport
✔ domino: delay propagates along an aircraft chain with turnaround slack absorbed
✔ stranded passengers: no double counting between cancellations and connections
✔ crew duty: breach cancels the flight and is reported
✔ demo scenario headline numbers (quoted in README)
✔ recovery never makes things worse and reduces stranded passengers on demo
✔ spare swap: each spare used at most once
✔ planner guardrail: no recovery step ever increases stranded passengers
✔ Geo: all 16 airports project within visible SVG radar bounds
✔ PS Scenario: 90-minute Mumbai thunderstorm causes downstream rotational cancellation
✔ Dispatcher Caching: repeated calls for identical scenario resolve instantly and remain verified
✔ Security: parseScenario blocks prototype pollution and constructor injection
✔ API Integration: simulate endpoint handles valid payload and returns compliant simulation
...
ℹ tests 48 | pass 48 | fail 0 | cancelled 0
```

---

## Deployment to Vercel

The application is pre-configured for instant deployment on Vercel:

1. **Configuration:** [vercel.json](file:///c:/Users/nilot/OneDrive/Desktop/H2S/vercel.json) routes static requests to `/public` and API requests to `/api/index.js`.
2. **Serverless Function:** [api/index.js](file:///c:/Users/nilot/OneDrive/Desktop/H2S/api/index.js) wraps the Express application with all security headers, caching, and deterministic routes.
3. **Environment Variables:** In Vercel Project Settings, add `GEMINI_API_KEY` (optional for LLM prose) and `GEMINI_MODEL=gemini-3.5-flash-lite`.

---

## License

Apache-2.0. Dataset provided for Google PromptWars.
