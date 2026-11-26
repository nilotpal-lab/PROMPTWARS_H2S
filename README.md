# VayuMitra

Urban Air Quality & Winter Smog Assistant built for **Hack2Skill x Google PromptWars (All-India Virtual Edition) — Challenge 6**.

VayuMitra helps Indian households plan daily routines around winter thermal inversions and indoor combustion spikes across **English (`en`)** and **Hindi (`hi`)**.

## Overview

- **Official CPCB NAQI & CAQM GRAP**: Continuous breakpoints for PM2.5, PM10, NO2, SO2, O3, and CO (`ug/m³` converted to `mg/m³`), six CPCB categories, and GRAP Stage I–IV+ badges.
- **PBL Ventilation Physics**: Computes the Ventilation Coefficient (`VC = PBL × windSpeed10mMs`), identifies nocturnal thermal inversions, and recommends daytime (`09:00–18:00 IST`) cross-ventilation windows.
- **Household Dosimetry & Safety Rules**: Models indoor PM2.5 box concentration (`tadka` exhaust, agarbatti/mosquito coils, dry `jhadu` sweeping, 24h sealing, HEPA/Corsi-Rosenthal CADR sizing), 3-slice daily inhaled dose, mandatory under-2 infant mask prohibition, 230V 4-filter Corsi-Rosenthal motor safety, and commute/RWA savings multipliers.
- **7-Tier Data & Fallback Strategy**:
  1. **Tier 0-A**: Open-Meteo Air Quality (`air-quality-api.open-meteo.com`, zero API key, includes `past_days=1` yesterday comparison and 48h tomorrow ventilation outlook)
  2. **Tier 0-B**: Open-Meteo Weather PBL & wind (`api.open-meteo.com`, zero API key) + Geocoding (`geocoding-api.open-meteo.com`) + browser **"Use My Location"** GPS lookup (`lat`/`lon` via `Permissions-Policy: geolocation=(self)`)
  3. **Tier 1-A**: Optional WAQI station feed (`api.waqi.info`, US EPA PM2.5 AQI inverted to `µg/m³`)
  4. **Tier 1-B**: Optional CPCB CAAQMS feed (`api.data.gov.in`, prioritized over WAQI)
  5. **Tier 2**: Optional NASA FIRMS VIIRS upwind fire alert (`firms.modaps.eosdis.nasa.gov`) for Indo-Gangetic Plain coordinates
  6. **User Calibration & Stale Cache**: Manual local monitor override (`calibratedAqi` / `calibratedPm25`) + bounded LRU/TTL stale fallback (with optional Upstash Redis REST persistence)
  7. **Deterministic Baseline**: Curated winter smog presets (`delhi-severe`, `igp-very-poor`, `coastal-moderate`, dynamically anchored to current IST hour) and deterministic bilingual plan/chat fallback when `GEMINI_API_KEY` is unset or rate/quota limits trigger

## Prerequisites & Commands

- **Node.js**: `>=22.0.0`

```bash
npm ci                 # Install exact locked dependencies
npm start              # Start Express server on PORT (loads .env if present)
npm run dev            # Start server in watch mode
npm run sync:lib       # Mirror lib/*.js into public/lib/*.js for browser imports
npm run test:coverage  # Run node:test suite with --experimental-test-coverage
npm run check          # Run eslint . --max-warnings 0 && node --test test/*.test.js
```

## Environment Variables

Copy `.env.example` to `.env` for local runs (do not commit `.env`). None of the external keys are required to run VayuMitra locally.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Local HTTP port for `server/index.js` |
| `GEMINI_API_KEY` | — | Optional `@google/genai` API key; uses deterministic fallback when unset |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Allowlisted Gemini model (`/^gemini-[a-z0-9.-]+$/`) |
| `GEMINI_DAILY_CAP` | `400` | Daily circuit-breaker request cap for Gemini calls |
| `GEMINI_RPM_CAP` | `20` | Per-minute request cap for Gemini calls |
| `WAQI_API_KEY` | — | Optional Tier 1-A WAQI station token |
| `DATA_GOV_IN_API_KEY` | — | Optional Tier 1-B CPCB `data.gov.in` API key |
| `NASA_FIRMS_MAP_KEY` | — | Optional Tier 2 NASA FIRMS VIIRS map key (IGP airshed only) |
| `UPSTASH_REDIS_REST_URL` | — | Optional Upstash Redis REST endpoint for shared cache/rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | — | Optional Upstash Redis REST bearer token |

## API Endpoints

- `GET /api/health` — Returns `{ status, service, timestamp, geminiConfigured }` (`Cache-Control: no-store`).
- `GET /api/aqi` — Query by `preset` (`delhi-severe`, `igp-very-poor`, `coastal-moderate`), `city`, or `lat` + `lon`, with optional `calibratedAqi` (`1–999`), `calibratedPm25` (`0–1500`), and `lang` (`en` | `hi`). Rate-limited (`60/min`), edge-cached (`s-maxage=300, stale-while-revalidate=900`).
- `POST /api/plan` — Accepts household profiles, mask/purifier/room settings, indoor smoke toggles, commute swap, and RWA actions; returns calculated `snapshot`, `impact`, and a grounded Gemini or deterministic bilingual action plan (`16kb` JSON limit, `15/min`, `no-store`).
- `POST /api/chat` — Accepts `message` (`1–500` chars), `history` (up to `6` turns), `lang`, and optional household `context`; returns grounded metrics and safety-checked advice (`16kb` JSON limit, `15/min`, `no-store`).

## Repository Layout

```text
├── api/index.js                  # Vercel serverless entrypoint (no port binding)
├── lib/                          # Pure isomorphic ES modules (zero Node/browser globals)
│   ├── aqi.js                    # CPCB NAQI, inverse converters, PBL calibration, presets
│   ├── impact.js                 # Indoor box model, 3-slice dosimetry, commute/RWA savings
│   ├── recommender.js            # Bilingual routine, 230V CR & medical guardrails, chat fallback
│   └── validation.js             # Input schemas, bounds, sanitization, prototype guards
├── server/                       # Express 5 app, caching, allowlisted HTTP client, Gemini/AQI services
├── scripts/sync-lib.mjs          # Zero-dep sync mirroring lib/*.js -> public/lib/*.js
├── public/                       # Strict-CSP bilingual static frontend, synced lib/, & WebP diagrams
├── test/                         # node:test suites (domain, parity, cache/services, HTTP security, assets, axe-core UI)
├── .env.example                  # Sample environment variables
├── eslint.config.js              # ESLint 9 flat config (isomorphic / Node / browser split)
├── package.json                  # Scripts and dependency manifest
└── vercel.json                   # Buildless static output, /api rewrite, CSP & security headers
```
