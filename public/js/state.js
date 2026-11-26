/**
 * @fileoverview Client state defaults, localStorage persistence, seeded initial snapshot
 * via isomorphic lib/aqi.js, and zero-duplication 0ms mirror of lib/impact.js.
 */

import {
  SCENARIO_PRESETS,
  buildAirQualitySnapshot,
  classifyNaqi,
  computeNaqi
} from '../lib/aqi.js';
import {
  COMMUTE_FACTORS,
  COMMUNITY_ACTIONS,
  PROFILE_PARAMS,
  calculateHouseholdImpact
} from '../lib/impact.js';

export {
  COMMUTE_FACTORS,
  COMMUNITY_ACTIONS,
  PROFILE_PARAMS,
  SCENARIO_PRESETS,
  buildAirQualitySnapshot,
  calculateHouseholdImpact,
  classifyNaqi,
  computeNaqi
};

export const PROFILE_RISK_ORDER = Object.freeze([
  'infant',
  'asthmatic',
  'elderly_cardiac',
  'school_child',
  'outdoor_worker',
  'commuter'
]);

/**
 * Pure 0ms client mirror of lib/impact.js calculateHouseholdImpact().
 * @param {number} outdoorPm25
 * @param {Record<string, unknown>} household
 * @returns {Record<string, unknown>}
 */
export function computeImpactMirror(outdoorPm25, household) {
  const safe = household && typeof household === 'object' ? household : {};
  return calculateHouseholdImpact({ ...safe, outdoorPm25 });
}

/**
 * Compute current calendar date string (YYYY-MM-DD) in Asia/Kolkata safely.
 * @returns {string}
 */
export function getTodayIstKey() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  } catch (_err) {
    return new Date().toISOString().slice(0, 10);
  }
}

export function loadSavedLang() {
  try {
    const val = window.localStorage.getItem('vayumitra:lang');
    return val === 'hi' ? 'hi' : 'en';
  } catch (_err) {
    return 'en';
  }
}

export function saveLang(lang) {
  try {
    window.localStorage.setItem('vayumitra:lang', lang === 'hi' ? 'hi' : 'en');
  } catch (_err) {
    // Storage unavailable
  }
}

export function loadChecklist(dateKey) {
  try {
    const raw = window.localStorage.getItem(`vayumitra:checks:${dateKey}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}

export function saveChecklist(dateKey, checks) {
  try {
    window.localStorage.setItem(`vayumitra:checks:${dateKey}`, JSON.stringify(checks));
  } catch (_err) {
    // Ignore quota errors
  }
}

function buildInitialHourlySeries() {
  return buildAirQualitySnapshot({ presetId: 'delhi-severe' }).hourly24h;
}

/**
 * Create initial state object before first API payload returns.
 * @returns {Record<string, unknown>}
 */
export function createInitialState() {
  const baseSnapshot = buildAirQualitySnapshot({ presetId: 'delhi-severe' });
  const hourly24h = baseSnapshot.hourly24h || buildInitialHourlySeries();
  const household = {
    profile: 'commuter',
    profiles: ['commuter'],
    maskType: 'n95',
    purifierMode: 'none',
    roomVolumeM3: 36,
    outdoorHours: 2.5,
    noExhaustTadka: false,
    indoorIncenseOrCoil: false,
    dryJhaduSweeping: false,
    sealed24hNoFlush: false,
    commuteFrom: 'petrol_car',
    commuteTo: 'metro_bus',
    dailyKm: 16,
    commuteDaysPerWeek: 5,
    communityActions: ['compost_leaves', 'watchman_thermal_gear']
  };

  const snapshot = {
    ...baseSnapshot,
    sourceTier: 'preset',
    attribution: [{ name: 'VayuMitra Winter Smog Preset' }],
    fetchedAt: new Date().toISOString(),
    stale: false,
    hourly24h,
    regionalContext: { fireAlert: { active: false, fireCount: 0, region: 'IGP' } }
  };

  return {
    lang: loadSavedLang(),
    query: { preset: 'delhi-severe', city: '', lat: null, lon: null, calibratedAqi: null },
    household,
    snapshot,
    impact: computeImpactMirror(snapshot.current.pm25, household),
    plan: null,
    planSource: 'fallback',
    checklist: loadChecklist(getTodayIstKey()),
    chatHistory: [],
    activeTab: 'routine'
  };
}

/**
 * Build validated /api/plan and /api/chat context payload omitting unset optionals.
 * @param {Record<string, unknown>} state
 * @returns {Record<string, unknown>}
 */
export function buildPlanRequestPayload(state) {
  const payload = {
    lang: state.lang,
    ...state.household
  };
  if (state.query.city) {
    payload.city = state.query.city;
  } else if (Number.isFinite(state.query.lat) && Number.isFinite(state.query.lon)) {
    payload.lat = state.query.lat;
    payload.lon = state.query.lon;
  } else if (state.query.preset) {
    payload.preset = state.query.preset;
  }
  if (Number.isFinite(state.query.calibratedAqi) && state.query.calibratedAqi >= 1) {
    payload.calibratedAqi = Math.round(state.query.calibratedAqi);
  }
  return payload;
}
