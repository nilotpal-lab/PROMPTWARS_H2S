/**
 * @fileoverview Steady-state indoor box model, 3-slice segmented personal inhaled
 * dose (ug/day), infant mask hard-block, adult cigarette risk metric, and
 * Indian commute / RWA community emissions savings engine.
 */

const MASK_EFFICIENCY = Object.freeze({
  none: 0,
  cloth: 0.2,
  surgical: 0.45,
  n95: 0.85
});

const PURIFIER_CADR_M3H = Object.freeze({
  none: 0,
  diy_cr_box: 320,
  hepa_purifier: 260
});

const COMMUNITY_MULTIPLIER_TIERS = Object.freeze([100, 500, 1000]);

/**
 * Minimum purifier Air Changes per Hour (ACH) required for optimal bedroom CADR sizing.
 */
export const MIN_CADR_ACH_OPTIMAL = 4.0;

/**
 * Physiological ventilation rates, mask permissions, and default daily schedules
 * across all 6 Indian household member profiles.
 */
export const PROFILE_PARAMS = Object.freeze({
  infant: Object.freeze({
    id: 'infant',
    label: 'Infant (< 2 yrs)',
    labelHi: 'शिशु (< 2 वर्ष)',
    ventilationRateM3PerDay: 4.5,
    maskAllowed: false,
    defaultOutdoorHours: 0.5,
    exertionFactor: 1.0
  }),
  school_child: Object.freeze({
    id: 'school_child',
    label: 'School Child (6–14 yrs)',
    labelHi: 'स्कूली बच्चा (6–14 वर्ष)',
    ventilationRateM3PerDay: 10.5,
    maskAllowed: true,
    defaultOutdoorHours: 2.0,
    exertionFactor: 1.25
  }),
  elderly_cardiac: Object.freeze({
    id: 'elderly_cardiac',
    label: 'Elderly / Cardiac (65+)',
    labelHi: 'बुज़ुर्ग / हृदय रोगी (65+)',
    ventilationRateM3PerDay: 12.0,
    maskAllowed: true,
    defaultOutdoorHours: 1.0,
    exertionFactor: 1.05
  }),
  asthmatic: Object.freeze({
    id: 'asthmatic',
    label: 'Asthmatic / Respiratory',
    labelHi: 'दमा / श्वसन संवेदनशील',
    ventilationRateM3PerDay: 13.5,
    maskAllowed: true,
    defaultOutdoorHours: 1.0,
    exertionFactor: 1.1
  }),
  commuter: Object.freeze({
    id: 'commuter',
    label: 'Daily Commuter',
    labelHi: 'दैनिक यात्री',
    ventilationRateM3PerDay: 15.5,
    maskAllowed: true,
    defaultOutdoorHours: 2.5,
    exertionFactor: 1.35
  }),
  outdoor_worker: Object.freeze({
    id: 'outdoor_worker',
    label: 'Outdoor Worker',
    labelHi: 'बाहरी कामगार',
    ventilationRateM3PerDay: 22.0,
    maskAllowed: true,
    defaultOutdoorHours: 7.0,
    exertionFactor: 1.5
  })
});

/**
 * Indian passenger transport emission factors per km (CO2e kg/km & PM2.5 g/km).
 */
export const COMMUTE_FACTORS = Object.freeze({
  petrol_car: Object.freeze({
    id: 'petrol_car',
    label: 'Petrol Car (Solo)',
    labelHi: 'पेट्रोल कार (अकेले)',
    co2eKgPerKm: 0.175,
    pm25GPerKm: 0.012
  }),
  diesel_cab: Object.freeze({
    id: 'diesel_cab',
    label: 'Diesel Cab / Auto',
    labelHi: 'डीज़ल कैब / ऑटो',
    co2eKgPerKm: 0.195,
    pm25GPerKm: 0.045
  }),
  two_wheeler: Object.freeze({
    id: 'two_wheeler',
    label: 'Two-Wheeler',
    labelHi: 'दोपहिया वाहन',
    co2eKgPerKm: 0.062,
    pm25GPerKm: 0.018
  }),
  metro_bus: Object.freeze({
    id: 'metro_bus',
    label: 'Metro / Electric Bus',
    labelHi: 'मेट्रो / इलेक्ट्रिक बस',
    co2eKgPerKm: 0.032,
    pm25GPerKm: 0.004
  }),
  ev: Object.freeze({
    id: 'ev',
    label: 'Electric Vehicle (EV)',
    labelHi: 'इलेक्ट्रिक वाहन (EV)',
    co2eKgPerKm: 0.048,
    pm25GPerKm: 0.005
  }),
  wfh: Object.freeze({
    id: 'wfh',
    label: 'Work From Home (WFH)',
    labelHi: 'घर से काम (WFH)',
    co2eKgPerKm: 0,
    pm25GPerKm: 0
  }),
  anti_idling: Object.freeze({
    id: 'anti_idling',
    label: 'Engine-Off Anti-Idling',
    labelHi: 'लाल बत्ती पर इंजन बंद',
    co2eKgPerKm: null,
    pm25GPerKm: null,
    co2eReductionFraction: 0.12,
    pm25ReductionFraction: 0.15
  })
});

/**
 * RWA & neighbourhood collective winter actions per household per week.
 */
export const COMMUNITY_ACTIONS = Object.freeze({
  compost_leaves: Object.freeze({
    id: 'compost_leaves',
    label: 'Compost dry leaves (stop RWA bonfires)',
    labelHi: 'सूखे पत्तों की खाद बनाएं (अलाव रोकें)',
    co2eSavedKgPerHouseholdWeek: 2.4,
    pm25AvoidedGPerHouseholdWeek: 18.0
  }),
  watchman_thermal_gear: Object.freeze({
    id: 'watchman_thermal_gear',
    label: 'Watchman thermal gear + electric heater (stop wood fire)',
    labelHi: 'गार्ड के लिए गर्म कपड़े व हीटर (लकड़ी आग बंद)',
    co2eSavedKgPerHouseholdWeek: 3.1,
    pm25AvoidedGPerHouseholdWeek: 24.0
  }),
  school_no_idling_dg_stagger: Object.freeze({
    id: 'school_no_idling_dg_stagger',
    label: 'School-gate no-idling + DG test stagger past noon',
    labelHi: 'स्कूल गेट नो-आइडलिंग व डीजी परीक्षण दोपहर में',
    co2eSavedKgPerHouseholdWeek: 1.8,
    pm25AvoidedGPerHouseholdWeek: 9.5
  })
});

/**
 * Clamp numeric value within [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Parse a finite number clamped to [min, max], returning fallback otherwise.
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function optClampedNumber(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return clamp(value, min, max);
}

/**
 * Resolve an allowlisted key or fallback.
 * @param {unknown} value
 * @param {Record<string, unknown>} allowMap
 * @param {string} fallback
 * @returns {string}
 */
function optEnum(value, allowMap, fallback) {
  return typeof value === 'string' && Object.hasOwn(allowMap, value) ? value : fallback;
}

/**
 * Round inhaled dose slice to the nearest 10 micrograms.
 * @param {number} ug
 * @returns {number}
 */
function roundToNearest10(ug) {
  return Math.max(0, Math.round(ug / 10) * 10);
}

/**
 * Resolve effective mask filtration efficiency with mandatory infant (<2 yrs) hard-block.
 * @param {typeof PROFILE_PARAMS['commuter']} profileSpec
 * @param {string} maskType
 * @returns {{ maskEff: number, maskBlocked: boolean, effectiveMaskType: string }}
 */
function resolveMaskEfficiency(profileSpec, maskType) {
  const validMask = optEnum(maskType, MASK_EFFICIENCY, 'none');
  if (!profileSpec.maskAllowed) {
    return { maskEff: 0, maskBlocked: true, effectiveMaskType: 'none' };
  }
  return {
    maskEff: MASK_EFFICIENCY[validMask],
    maskBlocked: false,
    effectiveMaskType: validMask
  };
}

/**
 * Classify CADR Room-Size Gate for a purifier relative to room volume.
 * @param {number} cadrM3h
 * @param {number} purifierAch
 * @returns {'inactive' | 'optimal' | 'undersized' | 'oversized_room'}
 */
function classifyCadrGate(cadrM3h, purifierAch) {
  if (cadrM3h <= 0) {
    return 'inactive';
  }
  if (purifierAch >= MIN_CADR_ACH_OPTIMAL) {
    return 'optimal';
  }
  if (purifierAch >= 2.0) {
    return 'undersized';
  }
  return 'oversized_room';
}

/**
 * Compute steady-state indoor concentration C_in = (P*ACH*C_out + G/V) / (ACH + k_dep + CADR/V).
 * @param {{
 *   outdoorPm25: number,
 *   roomVolumeM3: number,
 *   purifierMode: string,
 *   noExhaustTadka: boolean,
 *   indoorIncenseOrCoil: boolean,
 *   dryJhaduSweeping: boolean,
 *   sealed24hNoFlush: boolean
 * }} cfg
 * @returns {Record<string, number | string>}
 */
function computeIndoorBoxState(cfg) {
  const ach = cfg.sealed24hNoFlush ? 0.35 : 0.75;
  const cadrM3h = PURIFIER_CADR_M3H[cfg.purifierMode] ?? 0;
  const purifierAch = Number((cadrM3h / cfg.roomVolumeM3).toFixed(2));
  const denom = ach + 0.35 + cadrM3h / cfg.roomVolumeM3;

  const indoorSourceUgPerHour =
    (cfg.noExhaustTadka ? 1600 : 240) +
    (cfg.indoorIncenseOrCoil ? 1150 : 0) +
    (cfg.dryJhaduSweeping ? 400 : 60);

  const cInOutdoorShare = (0.75 * ach * cfg.outdoorPm25) / denom;
  const cInSourceShare = indoorSourceUgPerHour / cfg.roomVolumeM3 / denom;
  const cInTotal = cInOutdoorShare + cInSourceShare;

  return {
    cInTotal,
    cInOutdoorShare,
    cInSourceShare,
    indoorSourceUgPerHour,
    cadrM3h,
    purifierAch,
    roomSizeGate: classifyCadrGate(cadrM3h, purifierAch),
    estimatedCo2Ppm: cfg.sealed24hNoFlush ? 2650 : 950,
    indoorOutdoorRatio: cfg.outdoorPm25 > 0 ? Number((cInTotal / cfg.outdoorPm25).toFixed(2)) : 1
  };
}

/**
 * Compute 3-slice daily inhaled dose (ug/day, rounded to nearest 10 ug).
 * @param {{
 *   outdoorPm25: number,
 *   outdoorHours: number,
 *   profileSpec: typeof PROFILE_PARAMS['commuter'],
 *   maskEff: number,
 *   box: Record<string, number | string>
 * }} params
 * @returns {Record<string, number>}
 */
function computeDoseSlices(params) {
  const hourlyVent = params.profileSpec.ventilationRateM3PerDay / 24;
  const indoorHours = 24 - params.outdoorHours;
  const outdoorEffectiveConc = params.outdoorPm25 * (1 - params.maskEff);

  const commuteOutdoor = roundToNearest10(
    params.outdoorHours * hourlyVent * params.profileSpec.exertionFactor * outdoorEffectiveConc
  );
  const cookingIndoor = roundToNearest10(indoorHours * hourlyVent * Number(params.box.cInSourceShare));
  const baselineIndoor = roundToNearest10(indoorHours * hourlyVent * Number(params.box.cInOutdoorShare));
  const effective24hConcUgM3 =
    (params.outdoorHours * outdoorEffectiveConc + indoorHours * Number(params.box.cInTotal)) / 24;

  return {
    commuteOutdoor,
    cookingIndoor,
    baselineIndoor,
    totalUg: commuteOutdoor + cookingIndoor + baselineIndoor,
    effective24hConcUgM3: Number(effective24hConcUgM3.toFixed(1))
  };
}

/**
 * Compute weekly commute savings (clamped >= 0) for Indian transport swaps.
 * @param {string} fromMode
 * @param {string} toMode
 * @param {number} dailyKm
 * @param {number} commuteDaysPerWeek
 * @returns {{ co2eSavedKgPerWeek: number, pm25AvoidedGPerWeek: number, isBeneficialSwap: boolean }}
 */
function computeCommuteSavings(fromMode, toMode, dailyKm, commuteDaysPerWeek) {
  const fromSpec = COMMUTE_FACTORS[fromMode] ?? COMMUTE_FACTORS.petrol_car;
  const toSpec = COMMUTE_FACTORS[toMode] ?? COMMUTE_FACTORS.metro_bus;
  const weeklyKm = dailyKm * commuteDaysPerWeek;

  if (fromMode === toMode || fromSpec.co2eKgPerKm === null) {
    return { co2eSavedKgPerWeek: 0, pm25AvoidedGPerWeek: 0, isBeneficialSwap: false };
  }

  const co2TargetRate =
    toMode === 'anti_idling'
      ? fromSpec.co2eKgPerKm * (1 - toSpec.co2eReductionFraction)
      : (toSpec.co2eKgPerKm ?? 0);
  const pmTargetRate =
    toMode === 'anti_idling'
      ? fromSpec.pm25GPerKm * (1 - toSpec.pm25ReductionFraction)
      : (toSpec.pm25GPerKm ?? 0);

  const deltaCo2 = (fromSpec.co2eKgPerKm - co2TargetRate) * weeklyKm;
  const deltaPm25 = (fromSpec.pm25GPerKm - pmTargetRate) * weeklyKm;

  return {
    co2eSavedKgPerWeek: Number(Math.max(0, deltaCo2).toFixed(2)),
    pm25AvoidedGPerWeek: Number(Math.max(0, deltaPm25).toFixed(2)),
    isBeneficialSwap: deltaCo2 > 0 || deltaPm25 > 0
  };
}

/**
 * Compute weekly savings across selected RWA community actions and 100/500/1000 multipliers.
 * @param {readonly string[]} selectedIds
 * @param {{ co2eSavedKgPerWeek: number, pm25AvoidedGPerWeek: number }} commuteSavings
 * @returns {Record<string, unknown>}
 */
function computeCommunityImpact(selectedIds, commuteSavings) {
  const uniqueIds = Array.from(new Set(selectedIds)).filter((id) => Object.hasOwn(COMMUNITY_ACTIONS, id));
  let actionCo2 = 0;
  let actionPm25 = 0;
  for (const id of uniqueIds) {
    actionCo2 += COMMUNITY_ACTIONS[id].co2eSavedKgPerHouseholdWeek;
    actionPm25 += COMMUNITY_ACTIONS[id].pm25AvoidedGPerHouseholdWeek;
  }

  const householdCo2 = Number((commuteSavings.co2eSavedKgPerWeek + actionCo2).toFixed(2));
  const householdPm25 = Number((commuteSavings.pm25AvoidedGPerWeek + actionPm25).toFixed(2));
  const communityMultipliers = COMMUNITY_MULTIPLIER_TIERS.map((households) => ({
    households,
    co2eSavedKgPerWeek: Number((householdCo2 * households).toFixed(1)),
    pm25AvoidedGPerWeek: Number((householdPm25 * households).toFixed(1))
  }));

  return {
    selectedActions: uniqueIds,
    householdCo2eSavedKgPerWeek: householdCo2,
    householdPm25AvoidedGPerWeek: householdPm25,
    communityMultipliers
  };
}

/**
 * Normalize raw impact options into validated safe physical parameters.
 * @param {Record<string, unknown>} input
 * @returns {Record<string, unknown>}
 */
function normalizeImpactOptions(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const profileId = optEnum(safe.profile, PROFILE_PARAMS, 'commuter');
  const profileSpec = PROFILE_PARAMS[profileId];

  return {
    outdoorPm25: optClampedNumber(safe.outdoorPm25 ?? safe.pm25, 180, 0, 1500),
    profileId,
    profileSpec,
    outdoorHours: optClampedNumber(safe.outdoorHours, profileSpec.defaultOutdoorHours, 0, 16),
    maskType: optEnum(safe.maskType, MASK_EFFICIENCY, 'none'),
    purifierMode: optEnum(safe.purifierMode, PURIFIER_CADR_M3H, 'none'),
    roomVolumeM3: optClampedNumber(safe.roomVolumeM3, 36, 10, 500),
    noExhaustTadka: Boolean(safe.noExhaustTadka),
    indoorIncenseOrCoil: Boolean(safe.indoorIncenseOrCoil),
    dryJhaduSweeping: Boolean(safe.dryJhaduSweeping),
    sealed24hNoFlush: Boolean(safe.sealed24hNoFlush),
    commuteFrom: optEnum(safe.commuteFrom, COMMUTE_FACTORS, 'petrol_car'),
    commuteTo: optEnum(safe.commuteTo, COMMUTE_FACTORS, 'metro_bus'),
    dailyKm: optClampedNumber(safe.dailyKm, 16, 0, 200),
    commuteDaysPerWeek: optClampedNumber(safe.commuteDaysPerWeek, 5, 1, 7),
    communityActions: Array.isArray(safe.communityActions) ? safe.communityActions : []
  };
}

/**
 * Calculate household steady-state indoor concentration, 3-slice inhaled dose,
 * adult-equivalent cigarette risk, and commute/community emissions savings.
 * @param {Record<string, unknown>} [input]
 * @returns {Record<string, unknown>}
 */
export function calculateHouseholdImpact(input = {}) {
  const opts = normalizeImpactOptions(input);
  const maskInfo = resolveMaskEfficiency(opts.profileSpec, opts.maskType);

  const mitigatedBox = computeIndoorBoxState({
    outdoorPm25: opts.outdoorPm25,
    roomVolumeM3: opts.roomVolumeM3,
    purifierMode: opts.purifierMode,
    noExhaustTadka: opts.noExhaustTadka,
    indoorIncenseOrCoil: opts.indoorIncenseOrCoil,
    dryJhaduSweeping: opts.dryJhaduSweeping,
    sealed24hNoFlush: opts.sealed24hNoFlush
  });

  const baselineBox = computeIndoorBoxState({
    outdoorPm25: opts.outdoorPm25,
    roomVolumeM3: opts.roomVolumeM3,
    purifierMode: 'none',
    noExhaustTadka: true,
    indoorIncenseOrCoil: true,
    dryJhaduSweeping: true,
    sealed24hNoFlush: true
  });

  const mitigatedDose = computeDoseSlices({
    outdoorPm25: opts.outdoorPm25,
    outdoorHours: opts.outdoorHours,
    profileSpec: opts.profileSpec,
    maskEff: maskInfo.maskEff,
    box: mitigatedBox
  });

  const baselineDose = computeDoseSlices({
    outdoorPm25: opts.outdoorPm25,
    outdoorHours: opts.outdoorHours,
    profileSpec: opts.profileSpec,
    maskEff: 0,
    box: baselineBox
  });

  const avoidedUg = Math.max(0, baselineDose.totalUg - mitigatedDose.totalUg);
  const percentReduced =
    baselineDose.totalUg > 0 ? Math.round((avoidedUg / baselineDose.totalUg) * 100) : 0;

  const commuteSavings = computeCommuteSavings(
    opts.commuteFrom,
    opts.commuteTo,
    opts.dailyKm,
    opts.commuteDaysPerWeek
  );
  const community = computeCommunityImpact(opts.communityActions, commuteSavings);

  return {
    profile: opts.profileId,
    mask: {
      requested: opts.maskType,
      effective: maskInfo.effectiveMaskType,
      efficiency: maskInfo.maskEff,
      blockedForInfant: maskInfo.maskBlocked
    },
    indoorBox: {
      cInUgM3: Number(Number(mitigatedBox.cInTotal).toFixed(1)),
      cOutUgM3: Number(Number(opts.outdoorPm25).toFixed(1)),
      indoorOutdoorRatio: mitigatedBox.indoorOutdoorRatio,
      cadrM3h: mitigatedBox.cadrM3h,
      purifierAch: mitigatedBox.purifierAch,
      roomVolumeM3: opts.roomVolumeM3,
      roomSizeGate: mitigatedBox.roomSizeGate,
      estimatedCo2Ppm: mitigatedBox.estimatedCo2Ppm
    },
    dose: {
      commuteOutdoor: mitigatedDose.commuteOutdoor,
      cookingIndoor: mitigatedDose.cookingIndoor,
      baselineIndoor: mitigatedDose.baselineIndoor,
      totalMitigatedUg: mitigatedDose.totalUg,
      totalBaselineUg: baselineDose.totalUg,
      avoidedUg,
      percentReduced
    },
    adultCigaretteEquivalent: Number((mitigatedDose.effective24hConcUgM3 / 22).toFixed(1)),
    baselineAdultCigaretteEquivalent: Number((baselineDose.effective24hConcUgM3 / 22).toFixed(1)),
    adultCigaretteLabel:
      'Adult epidemiological risk (Berkeley Earth: 22 µg/m³ = 1 cig/day; never divided by infant lung volume)',
    commute: {
      from: opts.commuteFrom,
      to: opts.commuteTo,
      ...commuteSavings
    },
    co2eSavedKgPerWeek: community.householdCo2eSavedKgPerWeek,
    pm25AvoidedGPerWeek: community.householdPm25AvoidedGPerWeek,
    communityMultipliers: community.communityMultipliers,
    selectedCommunityActions: community.selectedActions
  };
}
