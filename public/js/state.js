/**
 * @fileoverview Client state defaults, localStorage persistence, seeded initial snapshot,
 * and a pure 0ms browser mirror of lib/impact.js steady-state dosimetry & swap math.
 */

export const PROFILE_PARAMS = Object.freeze({
  infant: Object.freeze({ id: 'infant', ventilationRateM3PerDay: 4.5, maskAllowed: false, defaultOutdoorHours: 0.5, exertionFactor: 1.0 }),
  school_child: Object.freeze({ id: 'school_child', ventilationRateM3PerDay: 10.5, maskAllowed: true, defaultOutdoorHours: 2.0, exertionFactor: 1.25 }),
  elderly_cardiac: Object.freeze({ id: 'elderly_cardiac', ventilationRateM3PerDay: 12.0, maskAllowed: true, defaultOutdoorHours: 1.0, exertionFactor: 1.05 }),
  asthmatic: Object.freeze({ id: 'asthmatic', ventilationRateM3PerDay: 13.5, maskAllowed: true, defaultOutdoorHours: 1.0, exertionFactor: 1.1 }),
  commuter: Object.freeze({ id: 'commuter', ventilationRateM3PerDay: 15.5, maskAllowed: true, defaultOutdoorHours: 2.5, exertionFactor: 1.35 }),
  outdoor_worker: Object.freeze({ id: 'outdoor_worker', ventilationRateM3PerDay: 22.0, maskAllowed: true, defaultOutdoorHours: 7.0, exertionFactor: 1.5 })
});

const MASK_EFFICIENCY = Object.freeze({ none: 0, cloth: 0.2, surgical: 0.45, n95: 0.85 });
const PURIFIER_CADR_M3H = Object.freeze({ none: 0, diy_cr_box: 320, hepa_purifier: 260 });
const COMMUNITY_MULTIPLIER_TIERS = Object.freeze([100, 500, 1000]);

const COMMUTE_FACTORS = Object.freeze({
  petrol_car: Object.freeze({ co2eKgPerKm: 0.175, pm25GPerKm: 0.012 }),
  diesel_cab: Object.freeze({ co2eKgPerKm: 0.195, pm25GPerKm: 0.045 }),
  two_wheeler: Object.freeze({ co2eKgPerKm: 0.062, pm25GPerKm: 0.018 }),
  metro_bus: Object.freeze({ co2eKgPerKm: 0.032, pm25GPerKm: 0.004 }),
  ev: Object.freeze({ co2eKgPerKm: 0.048, pm25GPerKm: 0.005 }),
  wfh: Object.freeze({ co2eKgPerKm: 0, pm25GPerKm: 0 }),
  anti_idling: Object.freeze({ co2eKgPerKm: null, pm25GPerKm: null, co2eReductionFraction: 0.12, pm25ReductionFraction: 0.15 })
});

const COMMUNITY_ACTIONS = Object.freeze({
  compost_leaves: Object.freeze({ co2eSavedKgPerHouseholdWeek: 2.4, pm25AvoidedGPerHouseholdWeek: 18.0 }),
  watchman_thermal_gear: Object.freeze({ co2eSavedKgPerHouseholdWeek: 3.1, pm25AvoidedGPerHouseholdWeek: 24.0 }),
  school_no_idling_dg_stagger: Object.freeze({ co2eSavedKgPerHouseholdWeek: 1.8, pm25AvoidedGPerHouseholdWeek: 9.5 })
});

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function roundToNearest10(ug) {
  return Math.max(0, Math.round(ug / 10) * 10);
}

function classifyCadrGate(cadrM3h, purifierAch) {
  if (cadrM3h <= 0) {
    return 'inactive';
  }
  if (purifierAch >= 4.0) {
    return 'optimal';
  }
  if (purifierAch >= 2.0) {
    return 'undersized';
  }
  return 'oversized_room';
}

function computeIndoorBox(outdoorPm25, cfg) {
  const ach = cfg.sealed24hNoFlush ? 0.35 : 0.75;
  const cadrM3h = PURIFIER_CADR_M3H[cfg.purifierMode] ?? 0;
  const purifierAch = Number((cadrM3h / cfg.roomVolumeM3).toFixed(2));
  const denom = ach + 0.35 + cadrM3h / cfg.roomVolumeM3;
  const sourceUg =
    (cfg.noExhaustTadka ? 1600 : 240) +
    (cfg.indoorIncenseOrCoil ? 1150 : 0) +
    (cfg.dryJhaduSweeping ? 400 : 60);

  const cInOut = (0.75 * ach * outdoorPm25) / denom;
  const cInSrc = sourceUg / cfg.roomVolumeM3 / denom;
  const cInTotal = cInOut + cInSrc;
  return {
    cInTotal,
    cInOut,
    cInSrc,
    cadrM3h,
    purifierAch,
    roomSizeGate: classifyCadrGate(cadrM3h, purifierAch),
    estimatedCo2Ppm: cfg.sealed24hNoFlush ? 2650 : 950,
    indoorOutdoorRatio: outdoorPm25 > 0 ? Number((cInTotal / outdoorPm25).toFixed(2)) : 1
  };
}

function computeDose(outdoorPm25, outdoorHours, profileSpec, maskEff, box) {
  const hourlyVent = profileSpec.ventilationRateM3PerDay / 24;
  const indoorHours = 24 - outdoorHours;
  const effOut = outdoorPm25 * (1 - maskEff);

  const commuteOutdoor = roundToNearest10(outdoorHours * hourlyVent * profileSpec.exertionFactor * effOut);
  const cookingIndoor = roundToNearest10(indoorHours * hourlyVent * box.cInSrc);
  const baselineIndoor = roundToNearest10(indoorHours * hourlyVent * box.cInOut);
  const totalUg = commuteOutdoor + cookingIndoor + baselineIndoor;
  const eff24h = (outdoorHours * effOut + indoorHours * box.cInTotal) / 24;

  return {
    commuteOutdoor,
    cookingIndoor,
    baselineIndoor,
    totalUg,
    effective24hConcUgM3: Number(eff24h.toFixed(1))
  };
}

function computeCommute(fromMode, toMode, dailyKm, days) {
  const fromSpec = COMMUTE_FACTORS[fromMode] ?? COMMUTE_FACTORS.petrol_car;
  const toSpec = COMMUTE_FACTORS[toMode] ?? COMMUTE_FACTORS.metro_bus;
  const weeklyKm = dailyKm * days;
  if (fromMode === toMode || fromSpec.co2eKgPerKm === null) {
    return { co2eSavedKgPerWeek: 0, pm25AvoidedGPerWeek: 0, isBeneficialSwap: false };
  }
  const co2Target = toMode === 'anti_idling'
    ? fromSpec.co2eKgPerKm * (1 - toSpec.co2eReductionFraction)
    : (toSpec.co2eKgPerKm ?? 0);
  const pmTarget = toMode === 'anti_idling'
    ? fromSpec.pm25GPerKm * (1 - toSpec.pm25ReductionFraction)
    : (toSpec.pm25GPerKm ?? 0);
  const dCo2 = (fromSpec.co2eKgPerKm - co2Target) * weeklyKm;
  const dPm = (fromSpec.pm25GPerKm - pmTarget) * weeklyKm;
  return {
    co2eSavedKgPerWeek: Number(Math.max(0, dCo2).toFixed(2)),
    pm25AvoidedGPerWeek: Number(Math.max(0, dPm).toFixed(2)),
    isBeneficialSwap: dCo2 > 0 || dPm > 0
  };
}

function pickEnum(val, table, fallback) {
  const key = String(val);
  return Object.hasOwn(table, key) ? key : fallback;
}

function normalizeHouseholdBooleans(safe) {
  return {
    noExhaustTadka: Boolean(safe.noExhaustTadka),
    indoorIncenseOrCoil: Boolean(safe.indoorIncenseOrCoil),
    dryJhaduSweeping: Boolean(safe.dryJhaduSweeping),
    sealed24hNoFlush: Boolean(safe.sealed24hNoFlush),
    communityActions: Array.isArray(safe.communityActions) ? safe.communityActions : []
  };
}

function normalizeMirrorInputs(outdoorPm25, household) {
  const safe = household && typeof household === 'object' ? household : {};
  const profileId = pickEnum(safe.profile, PROFILE_PARAMS, 'commuter');
  const profileSpec = PROFILE_PARAMS[profileId];
  const maskReq = pickEnum(safe.maskType, MASK_EFFICIENCY, 'n95');
  const maskBlocked = !profileSpec.maskAllowed;

  return {
    pm: clamp(Number(outdoorPm25) || 0, 0, 1500),
    profileId,
    profileSpec,
    maskReq,
    maskBlocked,
    maskEff: maskBlocked ? 0 : MASK_EFFICIENCY[maskReq],
    roomVolumeM3: clamp(Number(safe.roomVolumeM3) || 36, 10, 500),
    outdoorHours: clamp(Number(safe.outdoorHours ?? profileSpec.defaultOutdoorHours), 0, 16),
    purifierMode: String(safe.purifierMode ?? 'none'),
    commuteFrom: String(safe.commuteFrom ?? 'petrol_car'),
    commuteTo: String(safe.commuteTo ?? 'metro_bus'),
    dailyKm: clamp(Number(safe.dailyKm) || 0, 0, 200),
    commuteDaysPerWeek: clamp(Number(safe.commuteDaysPerWeek) || 5, 1, 7),
    ...normalizeHouseholdBooleans(safe)
  };
}

function sumCommunityActions(actions) {
  let actCo2 = 0;
  let actPm = 0;
  for (const id of new Set(actions)) {
    const key = String(id);
    if (Object.hasOwn(COMMUNITY_ACTIONS, key)) {
      actCo2 += COMMUNITY_ACTIONS[key].co2eSavedKgPerHouseholdWeek;
      actPm += COMMUNITY_ACTIONS[key].pm25AvoidedGPerHouseholdWeek;
    }
  }
  return { actCo2, actPm };
}

/**
 * Pure 0ms client mirror of lib/impact.js calculateHouseholdImpact().
 * @param {number} outdoorPm25
 * @param {Record<string, unknown>} household
 * @returns {Record<string, unknown>}
 */
export function computeImpactMirror(outdoorPm25, household) {
  const cfg = normalizeMirrorInputs(outdoorPm25, household);
  const mitBox = computeIndoorBox(cfg.pm, cfg);
  const baseBox = computeIndoorBox(cfg.pm, {
    roomVolumeM3: cfg.roomVolumeM3,
    purifierMode: 'none',
    noExhaustTadka: true,
    indoorIncenseOrCoil: true,
    dryJhaduSweeping: true,
    sealed24hNoFlush: true
  });

  const mitDose = computeDose(cfg.pm, cfg.outdoorHours, cfg.profileSpec, cfg.maskEff, mitBox);
  const baseDose = computeDose(cfg.pm, cfg.outdoorHours, cfg.profileSpec, 0, baseBox);
  const avoidedUg = Math.max(0, baseDose.totalUg - mitDose.totalUg);
  const percentReduced = baseDose.totalUg > 0 ? Math.round((avoidedUg / baseDose.totalUg) * 100) : 0;

  const commute = computeCommute(cfg.commuteFrom, cfg.commuteTo, cfg.dailyKm, cfg.commuteDaysPerWeek);
  const { actCo2, actPm } = sumCommunityActions(cfg.communityActions);
  const hhCo2 = Number((commute.co2eSavedKgPerWeek + actCo2).toFixed(2));
  const hhPm = Number((commute.pm25AvoidedGPerWeek + actPm).toFixed(2));

  return {
    profile: cfg.profileId,
    mask: { requested: cfg.maskReq, effective: cfg.maskBlocked ? 'none' : cfg.maskReq, efficiency: cfg.maskEff, blockedForInfant: cfg.maskBlocked },
    indoorBox: {
      cInUgM3: Number(mitBox.cInTotal.toFixed(1)),
      cOutUgM3: Number(cfg.pm.toFixed(1)),
      indoorOutdoorRatio: mitBox.indoorOutdoorRatio,
      cadrM3h: mitBox.cadrM3h,
      purifierAch: mitBox.purifierAch,
      roomVolumeM3: cfg.roomVolumeM3,
      roomSizeGate: mitBox.roomSizeGate,
      estimatedCo2Ppm: mitBox.estimatedCo2Ppm
    },
    dose: {
      commuteOutdoor: mitDose.commuteOutdoor,
      cookingIndoor: mitDose.cookingIndoor,
      baselineIndoor: mitDose.baselineIndoor,
      totalMitigatedUg: mitDose.totalUg,
      totalBaselineUg: baseDose.totalUg,
      avoidedUg,
      percentReduced
    },
    adultCigaretteEquivalent: Number((mitDose.effective24hConcUgM3 / 22).toFixed(1)),
    baselineAdultCigaretteEquivalent: Number((baseDose.effective24hConcUgM3 / 22).toFixed(1)),
    commute,
    co2eSavedKgPerWeek: hhCo2,
    pm25AvoidedGPerWeek: hhPm,
    communityMultipliers: COMMUNITY_MULTIPLIER_TIERS.map((households) => ({
      households,
      co2eSavedKgPerWeek: Number((hhCo2 * households).toFixed(1)),
      pm25AvoidedGPerWeek: Number((hhPm * households).toFixed(1))
    }))
  };
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
    // Storage unavailable in private contexts
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
  return Array.from({ length: 24 }, (_, h) => {
    const mix = clamp(Math.sin(((h - 7) / 14) * Math.PI), 0, 1);
    const rush = h === 8 || h === 9 || h === 19 || h === 20 || h === 21 ? 1.15 : 1;
    const pm25 = Math.round((138 + 145 * (1 - mix)) * rush);
    const pblMeters = Math.round(185 + 835 * mix);
    const windSpeed10mMs = Number((0.85 + 1.5 * mix).toFixed(2));
    return {
      time: `2026-11-25T${String(h).padStart(2, '0')}:00`,
      istHour: h,
      pm25,
      pm10: Math.round(pm25 * 1.58),
      no2: Math.round(68 * (0.65 + 0.55 * (1 - mix)) * rush),
      coMgM3: Number(((1650 * (0.7 + 0.6 * (1 - mix)) * rush) / 1000).toFixed(2)),
      pblMeters,
      windSpeed10mMs,
      ventilationCoefficient: Math.round(pblMeters * windSpeed10mMs),
      inversionRisk: pblMeters < 400 ? 'High' : pblMeters < 1200 ? 'Moderate' : 'Low',
      naqi: Math.min(500, Math.round(pm25 * 1.35)),
      category: pm25 > 250 ? 'Severe' : pm25 > 120 ? 'Very Poor' : 'Poor',
      grapStage: pm25 > 250 ? 'Stage III' : pm25 > 120 ? 'Stage II' : 'Stage I'
    };
  });
}

/**
 * Create initial state object before first API payload returns.
 * @returns {Record<string, unknown>}
 */
export function createInitialState() {
  const hourly24h = buildInitialHourlySeries();
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
    location: { city: 'Delhi (Anand Vihar)', lat: 28.6469, lon: 77.316, presetId: 'delhi-severe', source: 'preset' },
    sourceTier: 'preset',
    attribution: ['Open-Meteo CAMS & Weather', 'CPCB NAQI Breakpoints'],
    fetchedAt: new Date().toISOString(),
    stale: false,
    current: { ...hourly24h[8], categoryHi: 'गंभीर', band: 'severe', dominantPollutant: 'PM2.5' },
    calibration: { applied: false, source: null, observedPm25: null, k0: 1 },
    ventilationWindow: { startHour: 13, endHour: 15, label: '13:00–15:00 IST', avgPm25: 138, avgNaqi: 314, confidence: 'brief_only' },
    peakSmogWindow: { startHour: 20, endHour: 22, label: '20:00–22:00 IST', maxPm25: 325, maxNaqi: 458 },
    whatChangedToday: {
      deltaPm25: 180,
      deltaNaqi: 240,
      peakToMiddayRatio: 2.4,
      trend: 'worse',
      summaryEn: 'Shallow PBL traps emissions until midday heating lifts dispersion.',
      summaryHi: 'कमज़ोर हवा व निचली परत के कारण दोपहर से पहले तक धुआं सतह के पास जमा रहता है।'
    },
    hourly24h,
    regionalContext: { fireAlert: { active: false, fireCount: 0, region: 'IGP' } }
  };

  return {
    lang: loadSavedLang(),
    query: { preset: 'delhi-severe', city: '', calibratedAqi: null },
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
  } else if (state.query.preset) {
    payload.preset = state.query.preset;
  }
  if (Number.isFinite(state.query.calibratedAqi) && state.query.calibratedAqi >= 1) {
    payload.calibratedAqi = Math.round(state.query.calibratedAqi);
  }
  return payload;
}
