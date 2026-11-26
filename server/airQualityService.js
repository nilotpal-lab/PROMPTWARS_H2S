/**
 * @fileoverview Tiered Air Quality & Planetary Boundary Layer weather service
 * combining Open-Meteo Tier 0 forecasts with optional WAQI, CPCB data.gov.in,
 * and NASA FIRMS IGP stubble-fire telemetry under strict timeouts & fallbacks.
 */

import {
  SCENARIO_PRESETS,
  buildAirQualitySnapshot,
  computeNaqi,
  cpcbPm25SubIndexToUgM3,
  usEpaPm25AqiToUgM3
} from '../lib/aqi.js';
import { createTtlCache } from './cache.js';
import { safeFetch } from './httpClient.js';

const FRESH_TTL_MS = 5 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;
const FIRMS_TTL_MS = 30 * 60 * 1000;
const GEO_TTL_MS = 24 * 60 * 60 * 1000;

const KNOWN_INDIAN_CITIES = Object.freeze({
  delhi: { city: 'Delhi', lat: 28.6139, lon: 77.209 },
  'new delhi': { city: 'New Delhi', lat: 28.6139, lon: 77.209 },
  noida: { city: 'Noida', lat: 28.5355, lon: 77.391 },
  gurgaon: { city: 'Gurugram', lat: 28.4595, lon: 77.0266 },
  gurugram: { city: 'Gurugram', lat: 28.4595, lon: 77.0266 },
  ghaziabad: { city: 'Ghaziabad', lat: 28.6692, lon: 77.4538 },
  faridabad: { city: 'Faridabad', lat: 28.4089, lon: 77.3178 },
  patna: { city: 'Patna', lat: 25.5941, lon: 85.1376 },
  lucknow: { city: 'Lucknow', lat: 26.8467, lon: 80.9462 },
  kanpur: { city: 'Kanpur', lat: 26.4499, lon: 80.3319 },
  varanasi: { city: 'Varanasi', lat: 25.3176, lon: 82.9739 },
  mumbai: { city: 'Mumbai', lat: 19.076, lon: 72.8777 },
  bengaluru: { city: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  bangalore: { city: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  kolkata: { city: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  chennai: { city: 'Chennai', lat: 13.0827, lon: 80.2707 },
  hyderabad: { city: 'Hyderabad', lat: 17.385, lon: 78.4867 },
  pune: { city: 'Pune', lat: 18.5204, lon: 73.8567 },
  ahmedabad: { city: 'Ahmedabad', lat: 23.0225, lon: 72.5714 },
  jaipur: { city: 'Jaipur', lat: 26.9124, lon: 75.7873 },
  chandigarh: { city: 'Chandigarh', lat: 30.7333, lon: 76.7794 }
});

const EMPTY_FIRE_ALERT = Object.freeze({
  active: false,
  fireCount: 0,
  region: 'Indo-Gangetic Plain',
  messageEn: null,
  messageHi: null
});

/**
 * Race an async task against a hard millisecond cutoff, cleaning up timers.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @returns {Promise<T | null>}
 */
async function withDeadline(promise, timeoutMs) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check whether coordinates fall inside the Indo-Gangetic Plain airshed.
 * @param {number} lat
 * @param {number} lon
 * @returns {boolean}
 */
function isInIgpAirshed(lat, lon) {
  return lat >= 24 && lat <= 32.5 && lon >= 73 && lon <= 88.5;
}

/**
 * Pick closest curated preset ID based on coordinates.
 * @param {number | undefined} lat
 * @param {number | undefined} lon
 * @returns {string}
 */
function pickClosestPresetId(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return 'delhi-severe';
  }
  if (lat < 22) {
    return 'coastal-moderate';
  }
  if (lon > 81.5 || lat < 27) {
    return 'igp-very-poor';
  }
  return 'delhi-severe';
}

/**
 * Format current IST hour key (YYYY-MM-DDTHH:00) for Open-Meteo Asia/Kolkata series alignment.
 * @param {number} epochMs
 * @returns {string}
 */
function getCurrentIstHourKey(epochMs) {
  const istMs = epochMs + 330 * 60 * 1000;
  return `${new Date(istMs).toISOString().slice(0, 13)}:00`;
}

/**
 * Enrich ventilationWindow and peakSmogWindow with NAQI and bilingual guidance.
 * @param {Record<string, unknown>} snapshot
 * @returns {{ ventilationWindow: Record<string, unknown>, peakSmogWindow: Record<string, unknown> }}
 */
function enrichWindows(snapshot) {
  const vw = snapshot.ventilationWindow;
  const psw = snapshot.peakSmogWindow;
  const avgNaqi = computeNaqi({ pm25: Number(vw.avgPm25) }).naqi;
  const maxNaqi = computeNaqi({ pm25: Number(psw.maxPm25) }).naqi;

  const guidanceByConf = {
    safe: {
      en: `Open opposite windows 20-30 min during ${vw.label} (${vw.avgPm25} µg/m³).`,
      hi: `${vw.label} (${vw.avgPm25} µg/m³) में 20-30 मिनट खिड़कियाँ खोलें।`
    },
    brief_only: {
      en: `Brief 15-20 min flush only during ${vw.label} (${vw.avgPm25} µg/m³) to clear indoor CO2.`,
      hi: `CO2 निकालने के लिए केवल ${vw.label} (${vw.avgPm25} µg/m³) में 15-20 मिनट हवा बदलें।`
    },
    avoid: {
      en: `High smog (${vw.avgPm25} µg/m³): keep flush under 5 min post-cooking with purifier active.`,
      hi: `अधिक धुंध (${vw.avgPm25} µg/m³): केवल खाना बनने के बाद 5 मिनट हवा बदलें।`
    }
  };
  const g = guidanceByConf[vw.confidence] ?? guidanceByConf.brief_only;

  return {
    ventilationWindow: { ...vw, avgNaqi, guidanceEn: g.en, guidanceHi: g.hi },
    peakSmogWindow: { ...psw, maxNaqi }
  };
}

/**
 * Pick best geocoding match with strong India prioritization.
 * @param {readonly Record<string, unknown>[]} results
 * @returns {{ city: string, lat: number, lon: number } | null}
 */
function pickBestGeoResult(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }
  const scored = [...results]
    .filter((r) => Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude))
    .sort((a, b) => {
      const aIn = a.country_code === 'IN' || a.country === 'India' ? 1 : 0;
      const bIn = b.country_code === 'IN' || b.country === 'India' ? 1 : 0;
      if (aIn !== bIn) {
        return bIn - aIn;
      }
      return (Number(b.population) || 0) - (Number(a.population) || 0);
    });

  const top = scored[0];
  if (!top) {
    return null;
  }
  const suffix = top.admin1 && top.admin1 !== top.name ? `, ${top.admin1}` : '';
  return {
    city: `${String(top.name)}${suffix}`,
    lat: Number(top.latitude),
    lon: Number(top.longitude)
  };
}

/**
 * Build time-indexed lookup map from Open-Meteo weather hourly payload.
 * @param {Record<string, unknown> | null} wxJson
 * @returns {Map<string, { pbl: unknown, windKmh: unknown, rh: unknown }>}
 */
function buildWeatherLookup(wxJson) {
  const wxByTime = new Map();
  const wxHourly = wxJson?.hourly;
  if (!wxHourly || !Array.isArray(wxHourly.time)) {
    return wxByTime;
  }
  wxHourly.time.forEach((t, idx) => {
    wxByTime.set(String(t), {
      pbl: wxHourly.boundary_layer_height?.[idx],
      windKmh: wxHourly.wind_speed_10m?.[idx],
      rh: wxHourly.relative_humidity_2m?.[idx]
    });
  });
  return wxByTime;
}

/**
 * Pick finite number or fallback value.
 * @param {unknown} val
 * @param {number} fallback
 * @returns {number}
 */
function numOr(val, fallback) {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

/**
 * Extract valid non-negative PM2.5 numbers (or null for missing slots) across a window.
 * @param {readonly unknown[]} pmArr
 * @param {number} startIdx
 * @param {number} endIdx
 * @returns {(number | null)[]}
 */
function extractWindowPm25(pmArr, startIdx, endIdx) {
  const slots = [];
  for (let i = startIdx; i < endIdx; i += 1) {
    const val = pmArr?.[i];
    slots.push(typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : null);
  }
  return slots;
}

/**
 * Find index of next non-null number starting at startOffset, or -1.
 * @param {readonly (number | null)[]} slots
 * @param {number} startOffset
 * @returns {number}
 */
function findNextValidSlot(slots, startOffset) {
  for (let j = startOffset; j < slots.length; j += 1) {
    if (slots[j] !== null) {
      return j;
    }
  }
  return -1;
}

/**
 * Linearly interpolate (or boundary-clamp) null PM2.5 slots; throw if all slots are missing.
 * @param {(number | null)[]} rawSlots
 * @returns {number[]}
 */
function interpolatePm25Slots(rawSlots) {
  const firstValid = findNextValidSlot(rawSlots, 0);
  if (firstValid < 0) {
    throw new Error('Open-Meteo Tier 0 Air Quality pm2_5 slots are all missing');
  }
  const out = [...rawSlots];
  let lastValid = firstValid;

  for (let i = 0; i < out.length; i += 1) {
    if (out[i] !== null) {
      lastValid = i;
      continue;
    }
    if (i < firstValid) {
      out[i] = out[firstValid];
      continue;
    }
    const nextIdx = findNextValidSlot(out, i + 1);
    if (nextIdx < 0) {
      out[i] = out[lastValid];
      continue;
    }
    const ratio = (i - lastValid) / (nextIdx - lastValid);
    out[i] = Number((out[lastValid] + ratio * (out[nextIdx] - out[lastValid])).toFixed(1));
  }
  return out;
}

/**
 * Map a single merged Open-Meteo AQ + Weather hour into normalized snapshot entry.
 * Normalizes wind_speed_10m from km/h to m/s (divide by 3.6).
 * @param {Record<string, unknown[]>} aqHourly
 * @param {Map<string, { pbl: unknown, windKmh: unknown, rh: unknown }>} wxByTime
 * @param {number} idx
 * @param {number} pm25Value
 * @returns {Record<string, unknown>}
 */
function mapMergedHour(aqHourly, wxByTime, idx, pm25Value) {
  const timeStr = String(aqHourly.time[idx]);
  const wx = wxByTime.get(timeStr) ?? {};
  const windMs = typeof wx.windKmh === 'number' && Number.isFinite(wx.windKmh)
    ? Number((wx.windKmh / 3.6).toFixed(2))
    : 1.5;
  return {
    time: timeStr,
    pm2_5: pm25Value,
    pm10: numOr(aqHourly.pm10?.[idx], 0),
    carbon_monoxide: numOr(aqHourly.carbon_monoxide?.[idx], 0),
    nitrogen_dioxide: numOr(aqHourly.nitrogen_dioxide?.[idx], 0),
    sulphur_dioxide: numOr(aqHourly.sulphur_dioxide?.[idx], 0),
    ozone: numOr(aqHourly.ozone?.[idx], 0),
    pblMeters: numOr(wx.pbl, 600),
    windSpeed10mMs: windMs,
    ...(typeof wx.rh === 'number' && Number.isFinite(wx.rh) ? { rh: wx.rh } : {})
  };
}

/**
 * Compute yesterday's peak PM2.5 and matching-hour NAQI from the past-24h Open-Meteo slice.
 * @param {Record<string, unknown[]>} aqHourly
 * @param {number} pastStartIdx
 * @param {number} pastEndIdx
 * @param {string} nowKey
 * @returns {{ peakPm25: number, naqi: number } | null}
 */
function computeYesterdaySummary(aqHourly, pastStartIdx, pastEndIdx, nowKey) {
  if (pastEndIdx <= pastStartIdx) {
    return null;
  }
  const pmSlots = extractWindowPm25(aqHourly.pm2_5, pastStartIdx, pastEndIdx);
  const validPms = pmSlots.filter((v) => v !== null);
  if (validPms.length === 0) {
    return null;
  }
  const peakPm25 = Math.round(Math.max(...validPms));
  const hourSuffix = nowKey.slice(11);
  let refIdx = pastStartIdx;
  for (let i = pastStartIdx; i < pastEndIdx; i += 1) {
    if (String(aqHourly.time[i]).endsWith(hourSuffix) && pmSlots[i - pastStartIdx] !== null) {
      refIdx = i;
      break;
    }
  }
  const refPm = pmSlots[refIdx - pastStartIdx] ?? validPms[0];
  const naqi = computeNaqi({
    pm25: refPm,
    pm10: numOr(aqHourly.pm10?.[refIdx], 0),
    no2: numOr(aqHourly.nitrogen_dioxide?.[refIdx], 0),
    so2: numOr(aqHourly.sulphur_dioxide?.[refIdx], 0),
    o3: numOr(aqHourly.ozone?.[refIdx], 0),
    coUgM3: numOr(aqHourly.carbon_monoxide?.[refIdx], 0)
  }).naqi;
  return { peakPm25, naqi };
}

/**
 * Align and merge Open-Meteo past_days=1 + forecast_days=2 AQ + Weather arrays into
 * yesterday's summary (< nowKey) and a forward hourly48h series (>= nowKey).
 * @param {Record<string, unknown>} aqJson
 * @param {Record<string, unknown> | null} wxJson
 * @param {number} epochMs
 * @returns {{ hourly48h: Record<string, unknown>[], yesterday: { peakPm25: number, naqi: number } | null }}
 */
function mergeOpenMeteoSeries(aqJson, wxJson, epochMs) {
  const aqHourly = aqJson?.hourly;
  if (!aqHourly || !Array.isArray(aqHourly.time) || aqHourly.time.length === 0) {
    throw new Error('Open-Meteo air quality hourly payload missing');
  }
  const wxByTime = buildWeatherLookup(wxJson);
  const nowKey = getCurrentIstHourKey(epochMs);
  const foundIdx = aqHourly.time.findIndex((t) => String(t) >= nowKey);
  const startIdx = foundIdx >= 0 ? Math.min(foundIdx, Math.max(0, aqHourly.time.length - 24)) : 0;
  const endIdx = Math.min(aqHourly.time.length, startIdx + 48);
  const pastEndIdx = foundIdx >= 0 ? foundIdx : 0;
  const pastStartIdx = Math.max(0, pastEndIdx - 24);
  const yesterday = computeYesterdaySummary(aqHourly, pastStartIdx, pastEndIdx, nowKey);
  const pm25Series = interpolatePm25Slots(extractWindowPm25(aqHourly.pm2_5, startIdx, endIdx));
  const hourly48h = [];

  for (let i = startIdx; i < endIdx; i += 1) {
    hourly48h.push(mapMergedHour(aqHourly, wxByTime, i, pm25Series[i - startIdx]));
  }
  return { hourly48h, yesterday };
}

/**
 * Parse NASA FIRMS VIIRS CSV and count high/nominal confidence fires with FRP >= 5.
 * @param {string} csvText
 * @returns {{ active: boolean, fireCount: number, region: string, messageEn: string | null, messageHi: string | null }}
 */
function parseFirmsCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { ...EMPTY_FIRE_ALERT };
  }
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const confIdx = headers.indexOf('confidence');
  const frpIdx = headers.indexOf('frp');
  if (confIdx < 0 || frpIdx < 0) {
    return { ...EMPTY_FIRE_ALERT };
  }

  let fireCount = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',');
    const conf = String(cols[confIdx] ?? '').trim().toLowerCase();
    const frp = Number(cols[frpIdx]);
    if (conf !== 'l' && conf !== 'low' && Number.isFinite(frp) && frp >= 5) {
      fireCount += 1;
    }
  }

  const active = fireCount >= 25;
  return {
    active,
    fireCount,
    region: 'Indo-Gangetic Plain (VIIRS SNPP)',
    messageEn: active
      ? `NASA FIRMS detected ${fireCount} active high-FRP fires across Punjab/Haryana upwind of the IGP.`
      : null,
    messageHi: active
      ? `NASA FIRMS ने पंजाब/हरियाणा क्षेत्र में ${fireCount} सक्रिय पराली/अग्नि बिंदु दर्ज किए हैं।`
      : null
  };
}

/**
 * Extract unit metadata string from a CPCB data.gov.in record.
 * @param {Record<string, unknown>} rec
 * @returns {string}
 */
function readCpcbUnit(rec) {
  return String(rec.unit || rec.pollutant_unit || rec.uom || '').trim();
}

/**
 * Extract valid PM2.5 concentration (ug/m3) from a CPCB data.gov.in record.
 * Converts CPCB sub-index values via cpcbPm25SubIndexToUgM3 unless unit metadata
 * explicitly declares ug/m3.
 * @param {Record<string, unknown>} rec
 * @returns {number | null}
 */
function parseCpcbPm25Value(rec) {
  if (!rec || typeof rec !== 'object') {
    return null;
  }
  const pol = String(rec.pollutant_id ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const val = Number(rec.pollutant_avg ?? rec.avg_value);
  if (pol !== 'PM25' || !Number.isFinite(val) || val <= 0 || val > 1500) {
    return null;
  }
  return /(?:µg|ug)\s*\/\s*m|microgram/i.test(readCpcbUnit(rec)) ? val : cpcbPm25SubIndexToUgM3(val);
}

/**
 * Parse a finite coordinate value, treating null/empty strings as missing.
 * @param {unknown} raw
 * @returns {number | null}
 */
function parseCoord(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

/**
 * Score a single CPCB data.gov.in record for PM2.5 proximity to target city/coords.
 * Missing coordinates (dist === 99) with city match score 0.6 so real nearby stations (<= 0.5 deg) always win.
 * @param {Record<string, unknown>} rec
 * @param {number} lat
 * @param {number} lon
 * @param {string} cityToken
 * @returns {{ dist: number, val: number, station: string } | null}
 */
function scoreCpcbRecord(rec, lat, lon, cityToken) {
  const val = parseCpcbPm25Value(rec);
  if (val === null) {
    return null;
  }
  const rLat = parseCoord(rec.latitude);
  const rLon = parseCoord(rec.longitude);
  const dist = rLat !== null && rLon !== null ? Math.hypot(rLat - lat, rLon - lon) : 99;
  const cityMatch = cityToken.length > 0 && String(rec.city ?? '').toLowerCase().includes(cityToken);
  if (dist > 0.8 && !cityMatch) {
    return null;
  }
  const scoredDist = cityMatch ? (dist === 99 ? 0.6 : Math.min(dist, 0.2)) : dist;
  return {
    dist: scoredDist,
    val,
    station: String(rec.station ?? rec.city ?? 'CPCB CAAQMS')
  };
}

/**
 * Validate an external attribution URL as strict HTTPS, falling back safely otherwise.
 * @param {unknown} rawUrl
 * @param {string} fallback
 * @returns {string}
 */
function sanitizeHttpsUrl(rawUrl, fallback = 'https://waqi.info') {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return fallback;
  }
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'https:' ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Extract nearest CPCB PM2.5 station observation from data.gov.in records.
 * @param {readonly Record<string, unknown>[]} records
 * @param {number} lat
 * @param {number} lon
 * @param {string} cityName
 * @returns {{ pm25UgM3: number, stationName: string } | null}
 */
function extractNearestCpcbPm25(records, lat, lon, cityName) {
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }
  const cityToken = cityName.toLowerCase().split(',')[0].trim();
  const candidates = records.map((rec) => scoreCpcbRecord(rec, lat, lon, cityToken)).filter(Boolean);
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0] ? { pm25UgM3: candidates[0].val, stationName: candidates[0].station } : null;
}

/**
 * Normalize WAQI attribution list, rejecting any non-HTTPS URLs.
 * @param {unknown} rawAttrs
 * @returns {{ name: string, url: string }[]}
 */
function parseWaqiAttributions(rawAttrs) {
  if (!Array.isArray(rawAttrs)) {
    return [{ name: 'World Air Quality Index (WAQI)', url: 'https://waqi.info' }];
  }
  const parsed = rawAttrs
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({
      name: String(a.name ?? 'WAQI'),
      url: sanitizeHttpsUrl(a.url, 'https://waqi.info')
    }));
  return parsed.length > 0 ? parsed : [{ name: 'World Air Quality Index (WAQI)', url: 'https://waqi.info' }];
}

/**
 * Parse WAQI JSON payload and convert US EPA PM2.5 AQI to ug/m3.
 * @param {Record<string, unknown>} json
 * @returns {{ pm25UgM3: number, stationName: string, attributions: { name: string, url: string }[] } | null}
 */
function parseWaqiPayload(json) {
  const aqiVal = Number(json?.data?.iaqi?.pm25?.v);
  if (json?.status !== 'ok' || !Number.isFinite(aqiVal) || aqiVal <= 0) {
    return null;
  }
  return {
    pm25UgM3: usEpaPm25AqiToUgM3(aqiVal),
    stationName: String(json.data.city?.name ?? 'WAQI Nearest Station'),
    attributions: parseWaqiAttributions(json.data.attributions)
  };
}

/**
 * Create the Air Quality Service with Tier 0 live fetches, parallel optional Tier 1/2 upgrades,
 * caching, and resilient stale/preset fallbacks.
 * @param {{
 *   fetchImpl?: typeof globalThis.fetch,
 *   cache?: ReturnType<typeof createTtlCache>,
 *   env?: Record<string, string | undefined>,
 *   now?: () => number
 * }} [deps]
 */
export function createAirQualityService(deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const cache = deps.cache ?? createTtlCache();
  const env = deps.env ?? process.env;
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const envSecrets = [env.WAQI_API_KEY, env.DATA_GOV_IN_API_KEY, env.NASA_FIRMS_MAP_KEY].filter(Boolean);

  async function geocodeCity(cityName) {
    const normalized = cityName.trim().toLowerCase();
    const geoKey = `geo:${normalized}`;
    const cached = cache.get(geoKey);
    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({ name: cityName, count: '8', language: 'en', format: 'json' });
    try {
      const res = await safeFetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
        timeoutMs: 3500,
        fetchImpl,
        secrets: envSecrets
      });
      if (res.ok) {
        const picked = pickBestGeoResult(await res.json().then((j) => j?.results));
        if (picked) {
          cache.set(geoKey, picked, GEO_TTL_MS);
        }
        return picked;
      }
    } catch {
      // Fallback to built-in Indian city table if geocoding fails or is offline
    }

    return KNOWN_INDIAN_CITIES[normalized] ?? null;
  }

  async function fetchTier0(lat, lon) {
    const aqParams = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      past_days: '1',
      forecast_days: '2',
      timezone: 'Asia/Kolkata',
      hourly: 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone'
    });
    const wxParams = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      past_days: '1',
      forecast_days: '2',
      timezone: 'Asia/Kolkata',
      hourly: 'boundary_layer_height,wind_speed_10m,relative_humidity_2m'
    });

    const [aqRes, wxRes] = await Promise.allSettled([
      safeFetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${aqParams}`, {
        timeoutMs: 3500,
        fetchImpl,
        secrets: envSecrets
      }),
      safeFetch(`https://api.open-meteo.com/v1/forecast?${wxParams}`, {
        timeoutMs: 3500,
        fetchImpl,
        secrets: envSecrets
      })
    ]);

    if (aqRes.status !== 'fulfilled' || !aqRes.value.ok) {
      throw new Error('Open-Meteo Tier 0 Air Quality unavailable');
    }
    const aqJson = await aqRes.value.json();
    const wxJson = wxRes.status === 'fulfilled' && wxRes.value.ok ? await wxRes.value.json() : null;
    return mergeOpenMeteoSeries(aqJson, wxJson, now());
  }

  async function fetchWaqi(lat, lon) {
    const token = (env.WAQI_API_KEY ?? '').trim();
    if (!token) {
      return null;
    }
    const url = `https://api.waqi.info/feed/geo:${Number(lat.toFixed(4))};${Number(lon.toFixed(4))}/?token=${encodeURIComponent(token)}`;
    const res = await safeFetch(url, { timeoutMs: 2000, fetchImpl, secrets: envSecrets });
    return res.ok ? parseWaqiPayload(await res.json()) : null;
  }

  async function fetchCpcb(lat, lon, cityName, filterCity) {
    const key = (env.DATA_GOV_IN_API_KEY ?? '').trim();
    if (!key) {
      return null;
    }
    const params = new URLSearchParams({
      'api-key': key,
      format: 'json',
      limit: '250',
      'filters[pollutant_id]': 'PM2.5'
    });
    if (filterCity) {
      params.set('filters[city]', filterCity);
    }
    const url = `https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69?${params}`;
    const res = await safeFetch(url, { timeoutMs: 2000, fetchImpl, secrets: envSecrets });
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    return extractNearestCpcbPm25(json?.records, lat, lon, cityName);
  }

  async function fetchFirms(lat, lon) {
    const mapKey = (env.NASA_FIRMS_MAP_KEY ?? '').trim();
    if (!mapKey || !isInIgpAirshed(lat, lon)) {
      return { ...EMPTY_FIRE_ALERT };
    }
    const cached = cache.get('firms:igp');
    if (cached) {
      return cached;
    }
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/VIIRS_SNPP_NRT/73.5,27.5,80.5,32.5/1`;
    const res = await safeFetch(url, { timeoutMs: 2000, fetchImpl, secrets: envSecrets });
    if (!res.ok) {
      return { ...EMPTY_FIRE_ALERT };
    }
    const parsed = parseFirmsCsv(await res.text());
    cache.set('firms:igp', parsed, FIRMS_TTL_MS);
    return parsed;
  }

  async function fetchOptionalTiers(lat, lon, cityName, filterCity) {
    const settled = await Promise.allSettled([
      withDeadline(fetchWaqi(lat, lon).catch(() => null), 2000),
      withDeadline(fetchCpcb(lat, lon, cityName, filterCity).catch(() => null), 2000),
      withDeadline(fetchFirms(lat, lon).catch(() => ({ ...EMPTY_FIRE_ALERT })), 2000)
    ]);

    return {
      waqi: settled[0].status === 'fulfilled' ? settled[0].value : null,
      cpcb: settled[1].status === 'fulfilled' ? settled[1].value : null,
      fireAlert: (settled[2].status === 'fulfilled' && settled[2].value) || { ...EMPTY_FIRE_ALERT }
    };
  }

  function assembleResponse(payload, query, target) {
    const resolvedCity = target?.city ?? payload.city;
    const resolvedLat = target?.lat ?? payload.lat;
    const resolvedLon = target?.lon ?? payload.lon;
    const hasUserCal = query.calibratedPm25 !== undefined || query.calibratedAqi !== undefined;
    const snapshot = buildAirQualitySnapshot({
      city: resolvedCity,
      lat: resolvedLat,
      lon: resolvedLon,
      presetId: payload.presetId,
      source: payload.source,
      ...(payload.hourly48h ? { hourly48h: payload.hourly48h } : { hourly24h: payload.hourly24h }),
      yesterday: query.yesterday ?? payload.yesterday ?? null,
      ...(hasUserCal
        ? {
            calibratedPm25: query.calibratedPm25,
            calibratedAqi: query.calibratedAqi,
            calibrationSource: 'user-calibrated'
          }
        : payload.stationCal)
    });

    const windows = enrichWindows(snapshot);
    return {
      location: snapshot.location,
      sourceTier: payload.sourceTier,
      attribution: payload.attribution,
      fetchedAt: payload.fetchedAt,
      stale: payload.stale,
      current: snapshot.current,
      calibration: snapshot.calibration,
      ventilationWindow: windows.ventilationWindow,
      peakSmogWindow: windows.peakSmogWindow,
      tomorrowWindow: snapshot.tomorrowWindow,
      whatChangedToday: snapshot.whatChangedToday,
      hourly24h: snapshot.hourly24h,
      regionalContext: payload.regionalContext
    };
  }

  function buildPresetPayload(presetId, overrides = {}) {
    const preset = SCENARIO_PRESETS[presetId] ?? SCENARIO_PRESETS['delhi-severe'];
    return {
      hourly24h: preset.hourly24h,
      city: overrides.city ?? preset.city,
      lat: overrides.lat ?? preset.lat,
      lon: overrides.lon ?? preset.lon,
      presetId: preset.id,
      source: overrides.source ?? 'preset',
      sourceTier: overrides.sourceTier ?? 'preset',
      attribution: overrides.attribution ?? [{ name: 'VayuMitra Winter Smog Preset', url: 'https://cpcb.nic.in' }],
      fetchedAt: new Date(now()).toISOString(),
      stale: Boolean(overrides.stale),
      stationCal: {},
      regionalContext: { stationName: null, stationPm25UgM3: null, stationSource: null, fireAlert: { ...EMPTY_FIRE_ALERT } }
    };
  }

  function reconcileOptionalMeta(optional) {
    const tierTags = ['live-open-meteo'];
    const attribution = [{ name: 'Open-Meteo CAMS & Weather', url: 'https://open-meteo.com' }];
    let stationCal = {};
    let stationName = null;
    let stationPm25UgM3 = null;
    let stationSource = null;

    if (optional.cpcb) {
      tierTags.push('cpcb');
      attribution.push({ name: 'CPCB / data.gov.in', url: 'https://data.gov.in' });
      stationCal = { observedPm25: optional.cpcb.pm25UgM3, calibrationSource: 'cpcb-data-gov-in' };
      stationName = optional.cpcb.stationName;
      stationPm25UgM3 = optional.cpcb.pm25UgM3;
      stationSource = 'cpcb';
    }
    if (optional.waqi) {
      tierTags.push('waqi');
      attribution.push(...optional.waqi.attributions);
      if (!optional.cpcb) {
        stationCal = { observedPm25: optional.waqi.pm25UgM3, calibrationSource: 'waqi-us-epa' };
        stationName = optional.waqi.stationName;
        stationPm25UgM3 = optional.waqi.pm25UgM3;
        stationSource = 'waqi';
      }
    }
    if (optional.fireAlert.fireCount > 0) {
      attribution.push({ name: 'NASA FIRMS VIIRS', url: 'https://firms.modaps.eosdis.nasa.gov' });
    }

    return {
      sourceTier: tierTags.join('+'),
      attribution,
      stationCal,
      regionalContext: {
        stationName,
        stationPm25UgM3,
        stationSource,
        fireAlert: optional.fireAlert
      }
    };
  }

  async function resolveTargetCoordinates(query) {
    if (query.lat !== undefined && query.lon !== undefined) {
      return {
        city: query.city ?? `${query.lat.toFixed(2)}, ${query.lon.toFixed(2)}`,
        lat: query.lat,
        lon: query.lon,
        cpcbCity: null
      };
    }
    if (query.city) {
      const geo = await geocodeCity(query.city);
      if (!geo) {
        return null;
      }
      return {
        ...geo,
        cpcbCity: geo.city.split(',')[0].trim()
      };
    }
    return null;
  }

  async function fetchLiveWithFallback(target, query, cacheKey) {
    try {
      const [tier0, optional] = await Promise.all([
        fetchTier0(target.lat, target.lon),
        fetchOptionalTiers(target.lat, target.lon, target.city, target.cpcbCity)
      ]);
      // Omit request-specific city strings from coordinate cache to prevent cache poisoning
      const livePayload = {
        hourly48h: tier0.hourly48h,
        yesterday: tier0.yesterday,
        lat: target.lat,
        lon: target.lon,
        presetId: null,
        source: 'open-meteo',
        fetchedAt: new Date(now()).toISOString(),
        stale: false,
        ...reconcileOptionalMeta(optional)
      };
      cache.set(`stale:${cacheKey}`, livePayload, STALE_TTL_MS);
      cache.set(cacheKey, livePayload, FRESH_TTL_MS);
      return assembleResponse(livePayload, query, target);
    } catch {
      const stalePayload = cache.get(`stale:${cacheKey}`);
      if (stalePayload) {
        return assembleResponse({ ...stalePayload, stale: true }, query, target);
      }
      return assembleResponse(
        buildPresetPayload(pickClosestPresetId(target.lat, target.lon), {
          city: target.city,
          lat: target.lat,
          lon: target.lon,
          source: 'fallback-preset',
          sourceTier: 'fallback-preset',
          stale: true
        }),
        query,
        target
      );
    }
  }

  async function getAirQuality(query = {}) {
    if (query.lat === undefined && !query.city) {
      return assembleResponse(buildPresetPayload(query.preset ?? 'delhi-severe'), query);
    }

    const target = await resolveTargetCoordinates(query);
    if (!target) {
      const err = new Error('City not found');
      err.statusCode = 404;
      err.code = 'CITY_NOT_FOUND';
      throw err;
    }

    const cpcbCityKey = target.cpcbCity ? target.cpcbCity.toLowerCase() : 'geo';
    const cacheKey = `aqi:${target.lat.toFixed(2)}:${target.lon.toFixed(2)}:${cpcbCityKey}`;
    const cachedFresh = cache.get(cacheKey);
    return cachedFresh
      ? assembleResponse(cachedFresh, query, target)
      : fetchLiveWithFallback(target, query, cacheKey);
  }

  return { getAirQuality };
}
