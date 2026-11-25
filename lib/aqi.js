/**
 * @fileoverview Isomorphic CPCB NAQI engine, US EPA inverse calibration,
 * Planetary Boundary Layer (PBL) ventilation physics, diurnal calibration,
 * daytime ventilation window detection, and curated Indian winter smog presets.
 */

const CPCB_BREAKPOINTS = Object.freeze({
  pm25: Object.freeze([
    [0, 30, 0, 50],
    [30, 60, 50, 100],
    [60, 90, 100, 200],
    [90, 120, 200, 300],
    [120, 250, 300, 400],
    [250, 380, 400, 500]
  ]),
  pm10: Object.freeze([
    [0, 50, 0, 50],
    [50, 100, 50, 100],
    [100, 250, 100, 200],
    [250, 350, 200, 300],
    [350, 430, 300, 400],
    [430, 510, 400, 500]
  ]),
  no2: Object.freeze([
    [0, 40, 0, 50],
    [40, 80, 50, 100],
    [80, 180, 100, 200],
    [180, 280, 200, 300],
    [280, 400, 300, 400],
    [400, 520, 400, 500]
  ]),
  so2: Object.freeze([
    [0, 40, 0, 50],
    [40, 80, 50, 100],
    [80, 380, 100, 200],
    [380, 800, 200, 300],
    [800, 1600, 300, 400],
    [1600, 2400, 400, 500]
  ]),
  o3: Object.freeze([
    [0, 50, 0, 50],
    [50, 100, 50, 100],
    [100, 168, 100, 200],
    [168, 208, 200, 300],
    [208, 748, 300, 400],
    [748, 1288, 400, 500]
  ]),
  co: Object.freeze([
    [0, 1.0, 0, 50],
    [1.0, 2.0, 50, 100],
    [2.0, 10.0, 100, 200],
    [10.0, 17.0, 200, 300],
    [17.0, 34.0, 300, 400],
    [34.0, 51.0, 400, 500]
  ])
});

const US_EPA_PM25_BREAKPOINTS = Object.freeze([
  [0, 50, 0, 12.0],
  [50, 100, 12.0, 35.4],
  [100, 150, 35.4, 55.4],
  [150, 200, 55.4, 150.4],
  [200, 300, 150.4, 250.4],
  [300, 400, 250.4, 350.4],
  [400, 500, 350.4, 500.4]
]);

const POLLUTANT_LABELS = Object.freeze({
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO2',
  so2: 'SO2',
  o3: 'O3',
  co: 'CO'
});

const CPCB_CATEGORIES = Object.freeze([
  {
    max: 50,
    category: 'Good',
    categoryHi: 'अच्छा',
    band: 'good',
    impactEn: 'Minimal impact; ideal for outdoor movement and ventilation.',
    impactHi: 'न्यूनतम प्रभाव; बाहर जाने और खिड़कियाँ खोलने के लिए सुरक्षित।'
  },
  {
    max: 100,
    category: 'Satisfactory',
    categoryHi: 'संतोषजनक',
    band: 'satisfactory',
    impactEn: 'Minor breathing discomfort possible for unusually sensitive people.',
    impactHi: 'अत्यधिक संवेदनशील लोगों को हल्की सांस की असुविधा हो सकती है।'
  },
  {
    max: 200,
    category: 'Moderately Polluted',
    categoryHi: 'मध्यम प्रदूषित',
    band: 'moderate',
    impactEn: 'Breathing discomfort for people with asthma, lung, or heart conditions.',
    impactHi: 'दमा, फेफड़ों या हृदय रोग वाले लोगों को सांस लेने में तकलीफ हो सकती है।'
  },
  {
    max: 300,
    category: 'Poor',
    categoryHi: 'खराब',
    band: 'poor',
    impactEn: 'Breathing discomfort to most people on prolonged exposure.',
    impactHi: 'लंबे समय तक बाहर रहने पर अधिकांश लोगों को सांस में तकलीफ।'
  },
  {
    max: 400,
    category: 'Very Poor',
    categoryHi: 'बहुत खराब',
    band: 'very-poor',
    impactEn: 'Respiratory illness risk on prolonged exposure; limit strenuous outdoor activity.',
    impactHi: 'लंबे संपर्क से श्वसन रोग का खतरा; भारी बाहरी गतिविधि सीमित करें।'
  },
  {
    max: Infinity,
    category: 'Severe',
    categoryHi: 'गंभीर',
    band: 'severe',
    impactEn: 'Affects healthy people and seriously impacts those with existing conditions.',
    impactHi: 'स्वस्थ लोगों पर भी असर और रोगियों के लिए गंभीर जोखिम।'
  }
]);

const RUSH_HOURS = new Set([8, 9, 19, 20, 21]);

/**
 * Clamp a numeric value within [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Return finite non-negative number or null.
 * @param {unknown} value
 * @returns {number | null}
 */
function toNonNegFinite(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

/**
 * Return first non-null non-negative finite candidate value.
 * @param {...unknown} candidates
 * @returns {number | null}
 */
function firstValidNumber(...candidates) {
  for (const val of candidates) {
    const parsed = toNonNegFinite(val);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

/**
 * Interpolate a pollutant concentration against continuous piecewise breakpoints.
 * Values above the highest breakpoint extrapolate along the top segment up to 999.
 * @param {number} conc
 * @param {readonly (readonly [number, number, number, number])[]} table
 * @returns {number}
 */
function interpolatePiecewise(conc, table) {
  const safeConc = Math.max(0, conc);
  for (const [bLo, bHi, iLo, iHi] of table) {
    if (safeConc <= bHi) {
      const ratio = (safeConc - bLo) / (bHi - bLo);
      return iLo + ratio * (iHi - iLo);
    }
  }
  const [bLo, bHi, iLo, iHi] = table[table.length - 1];
  const slope = (iHi - iLo) / (bHi - bLo);
  return Math.min(999, iHi + (safeConc - bHi) * slope);
}

/**
 * Resolve CO concentration in mg/m3 from explicit unit fields.
 * Converts Open-Meteo carbon_monoxide (ug/m3) via coMgM3 = coUgM3 / 1000.
 * @param {Record<string, unknown>} pollutants
 * @returns {number | null}
 */
function extractCoMgM3(pollutants) {
  const mg = toNonNegFinite(pollutants.coMgM3);
  if (mg !== null) {
    return mg;
  }
  const ug = firstValidNumber(pollutants.coUgM3, pollutants.carbon_monoxide);
  if (ug !== null) {
    return ug / 1000;
  }
  const coDirect = toNonNegFinite(pollutants.co);
  if (coDirect === null) {
    return null;
  }
  return pollutants.coUnit === 'ug/m3' ? coDirect / 1000 : coDirect;
}

/**
 * Resolve CAQM GRAP stage badge for a rounded NAQI score.
 * @param {number} roundedNaqi
 * @returns {string | null}
 */
function resolveGrapStage(roundedNaqi) {
  if (roundedNaqi > 450) {
    return 'Stage IV (Severe+)';
  }
  if (roundedNaqi >= 401) {
    return 'Stage III';
  }
  if (roundedNaqi >= 301) {
    return 'Stage II';
  }
  if (roundedNaqi >= 201) {
    return 'Stage I';
  }
  return null;
}

/**
 * Classify a NAQI score into official CPCB category + CAQM GRAP Stage badge.
 * @param {number} naqi
 * @returns {{
 *   naqi: number,
 *   category: string,
 *   categoryHi: string,
 *   band: string,
 *   grapStage: string | null,
 *   impactEn: string,
 *   impactHi: string
 * }}
 */
export function classifyNaqi(naqi) {
  const safeValue = Number.isFinite(naqi) ? Math.max(0, Math.round(naqi)) : 0;
  const match = CPCB_CATEGORIES.find((entry) => safeValue <= entry.max) ?? CPCB_CATEGORIES[5];
  const grapStage = resolveGrapStage(safeValue);
  const band = grapStage === 'Stage IV (Severe+)' ? 'severe-plus' : match.band;
  return {
    naqi: safeValue,
    category: match.category,
    categoryHi: match.categoryHi,
    band,
    grapStage,
    impactEn: match.impactEn,
    impactHi: match.impactHi
  };
}

/**
 * Normalize pollutant field aliases into a canonical CPCB unit object.
 * @param {Record<string, unknown>} safe
 * @param {number | null} coMgM3
 * @returns {Record<string, number | null>}
 */
function normalizePollutantMap(safe, coMgM3) {
  return {
    pm25: firstValidNumber(safe.pm25, safe.pm2_5),
    pm10: toNonNegFinite(safe.pm10),
    no2: firstValidNumber(safe.no2, safe.nitrogen_dioxide),
    so2: firstValidNumber(safe.so2, safe.sulphur_dioxide),
    o3: firstValidNumber(safe.o3, safe.ozone),
    co: coMgM3
  };
}

/**
 * Compute CPCB NAQI from pollutant concentrations.
 * Converts Open-Meteo carbon_monoxide (ug/m3) to mg/m3 before applying CO breakpoints.
 * @param {Record<string, unknown>} [pollutants]
 * @returns {{
 *   naqi: number,
 *   dominantPollutant: string,
 *   subIndices: Record<string, number | null>,
 *   coMgM3: number | null,
 *   category: string,
 *   categoryHi: string,
 *   band: string,
 *   grapStage: string | null,
 *   impactEn: string,
 *   impactHi: string
 * }}
 */
export function computeNaqi(pollutants = {}) {
  const safe = pollutants && typeof pollutants === 'object' ? pollutants : {};
  const coMgM3 = extractCoMgM3(safe);
  const inputs = normalizePollutantMap(safe, coMgM3);
  const subIndices = { pm25: null, pm10: null, no2: null, so2: null, o3: null, co: null };
  let maxIndex = 0;
  let dominantKey = 'pm25';

  for (const [key, conc] of Object.entries(inputs)) {
    if (conc === null) {
      continue;
    }
    const sub = Math.round(interpolatePiecewise(conc, CPCB_BREAKPOINTS[key]));
    subIndices[key] = sub;
    if (sub >= maxIndex) {
      maxIndex = sub;
      dominantKey = key;
    }
  }

  const roundedCo = coMgM3 === null ? null : Number(coMgM3.toFixed(4));
  return {
    ...classifyNaqi(maxIndex),
    dominantPollutant: POLLUTANT_LABELS[dominantKey],
    subIndices,
    coMgM3: roundedCo
  };
}

/**
 * Invert US EPA PM2.5 AQI (used by WAQI iaqi.pm25.v) into raw PM2.5 concentration (ug/m3).
 * @param {number} aqi
 * @returns {number}
 */
export function usEpaPm25AqiToUgM3(aqi) {
  if (!Number.isFinite(aqi) || aqi <= 0) {
    return 0;
  }
  const safeAqi = Math.min(999, aqi);
  for (const [iLo, iHi, cLo, cHi] of US_EPA_PM25_BREAKPOINTS) {
    if (safeAqi <= iHi) {
      const conc = cLo + ((safeAqi - iLo) / (iHi - iLo)) * (cHi - cLo);
      return Number(conc.toFixed(1));
    }
  }
  const [iLo, iHi, cLo, cHi] = US_EPA_PM25_BREAKPOINTS[US_EPA_PM25_BREAKPOINTS.length - 1];
  const slope = (cHi - cLo) / (iHi - iLo);
  return Number((cHi + (safeAqi - iHi) * slope).toFixed(1));
}

/**
 * Compute Planetary Boundary Layer Ventilation Coefficient (VC = pblMeters * windSpeed10mMs)
 * and classify thermal inversion trapping risk.
 * @param {number} pblMeters
 * @param {number} windSpeed10mMs
 * @returns {{
 *   ventilationCoefficient: number | null,
 *   inversionRisk: 'High' | 'Moderate' | 'Low',
 *   pblMeters: number | null,
 *   windSpeed10mMs: number | null
 * }}
 */
export function computeInversionRisk(pblMeters, windSpeed10mMs) {
  const pbl = toNonNegFinite(pblMeters);
  const wind = toNonNegFinite(windSpeed10mMs);
  if (pbl === null || wind === null) {
    return {
      ventilationCoefficient: null,
      inversionRisk: 'Moderate',
      pblMeters: pbl,
      windSpeed10mMs: wind
    };
  }
  const ventilationCoefficient = Math.round(pbl * wind);
  let inversionRisk = 'Low';
  if (pbl < 400 || (pbl < 700 && wind < 1.5)) {
    inversionRisk = 'High';
  } else if (pbl < 1200) {
    inversionRisk = 'Moderate';
  }
  return {
    ventilationCoefficient,
    inversionRisk,
    pblMeters: Math.round(pbl),
    windSpeed10mMs: Number(wind.toFixed(2))
  };
}

/**
 * Normalize an hourly forecast item so raw Open-Meteo aliases work seamlessly.
 * @param {Record<string, unknown>} item
 * @returns {Record<string, unknown>}
 */
function normalizeHourlyItem(item) {
  const pm25 = firstValidNumber(item.pm25, item.pm2_5) ?? 0;
  const pblMeters = firstValidNumber(item.pblMeters, item.boundary_layer_height) ?? 600;
  const windSpeed10mMs = firstValidNumber(item.windSpeed10mMs, item.wind_speed_10m) ?? 1.5;
  const rh = firstValidNumber(item.rh, item.relative_humidity_2m);
  return { ...item, pm25, pblMeters, windSpeed10mMs, ...(rh !== null ? { rh } : {}) };
}

/**
 * Compute PBL trapping weight w(t) = clamp((1200 - pbl) / 800, 0.2, 1.0).
 * @param {number | undefined} pblMeters
 * @returns {number}
 */
function pblTrappingWeight(pblMeters) {
  const safePbl = Number.isFinite(pblMeters) ? pblMeters : 600;
  return clamp((1200 - safePbl) / 800, 0.2, 1.0);
}

/**
 * Apply Physics-Weighted Diurnal PBL Calibration against a ground PM2.5 reading.
 * Anchors k0 = clamp(observedPm25 / max(modelNow, 1), 0.5, 4.0) and modulates each hour
 * by its PBL trapping weight w(t) relative to w(t0) so midday dispersion stays realistic.
 * @param {readonly Record<string, unknown>[]} hourly24h
 * @param {number | null | undefined} observedPm25
 * @param {number} [anchorIndex]
 * @returns {Record<string, unknown>[]}
 */
export function applyPblCalibration(hourly24h, observedPm25, anchorIndex = 0) {
  if (!Array.isArray(hourly24h) || hourly24h.length === 0) {
    return [];
  }
  const normalized = hourly24h.map(normalizeHourlyItem);
  const obs = toNonNegFinite(observedPm25);
  if (obs === null) {
    return normalized;
  }

  const idx = clamp(Math.trunc(anchorIndex), 0, normalized.length - 1);
  const anchor = normalized[idx];
  const modelNow = Math.max(Number(anchor.pm25) || 0, 1);
  const k0 = clamp(obs / modelNow, 0.5, 4.0);
  const w0 = pblTrappingWeight(Number(anchor.pblMeters));

  return normalized.map((item) => {
    const rawPm25 = Math.max(0, Number(item.pm25) || 0);
    const weightRatio = pblTrappingWeight(Number(item.pblMeters)) / w0;
    const factor = clamp(1 + (k0 - 1) * weightRatio, 0.5, 4.0);
    const calibratedPm25 = Math.round(rawPm25 * factor);
    const naqiMeta = computeNaqi({ ...item, pm25: calibratedPm25 });
    return {
      ...item,
      rawPm25,
      pm25: calibratedPm25,
      calibrationFactor: Number(factor.toFixed(2)),
      naqi: naqiMeta.naqi,
      category: naqiMeta.category,
      grapStage: naqiMeta.grapStage
    };
  });
}

/**
 * Extract integer IST hour (0..23) from a forecast entry.
 * @param {Record<string, unknown>} entry
 * @param {number} fallbackIdx
 * @returns {number}
 */
function extractIstHour(entry, fallbackIdx) {
  const numericHour = entry.istHour ?? entry.hour;
  if (typeof numericHour === 'number' && Number.isFinite(numericHour)) {
    return ((Math.trunc(numericHour) % 24) + 24) % 24;
  }
  if (typeof entry.time !== 'string') {
    return fallbackIdx % 24;
  }
  const match = entry.time.match(/(?:T|^)(\d{2}):(\d{2})(Z)?/);
  if (!match) {
    return fallbackIdx % 24;
  }
  const parsedHour = Number(match[1]);
  if (match[3] === 'Z') {
    const totalMinutes = parsedHour * 60 + Number(match[2]) + 330;
    return Math.floor(totalMinutes / 60) % 24;
  }
  return parsedHour % 24;
}

/**
 * Format integer hour (0..24) as HH:00.
 * @param {number} hour
 * @returns {string}
 */
function formatHourLabel(hour) {
  const normalized = ((Math.trunc(hour) % 24) + 24) % 24;
  return `${String(normalized).padStart(2, '0')}:00`;
}

/**
 * Build scored contiguous 2h pairs from an hourly slice.
 * @param {readonly { pm25: number, vc: number, hour: number }[]} points
 * @param {boolean} daytimeOnly
 * @returns {{ startHour: number, endHour: number, avgPm25: number, maxPm25: number, avgVc: number }[]}
 */
function collectTwoHourPairs(points, daytimeOnly) {
  const pairs = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const inDaytime = a.hour >= 9 && a.hour <= 16 && b.hour >= 10 && b.hour <= 17;
    if (daytimeOnly && !inDaytime) {
      continue;
    }
    const endHour = b.hour === (a.hour + 1) % 24 ? (b.hour + 1) % 24 : b.hour;
    pairs.push({
      startHour: a.hour,
      endHour,
      avgPm25: Math.round((a.pm25 + b.pm25) / 2),
      maxPm25: Math.round(Math.max(a.pm25, b.pm25)),
      avgVc: Math.round((a.vc + b.vc) / 2)
    });
  }
  return pairs;
}

/**
 * Classify daytime ventilation confidence from PM2.5 average concentration.
 * @param {number} avgPm25
 * @returns {'safe' | 'brief_only' | 'avoid'}
 */
function ventilationConfidence(avgPm25) {
  if (avgPm25 <= 90) {
    return 'safe';
  }
  if (avgPm25 <= 200) {
    return 'brief_only';
  }
  return 'avoid';
}

/**
 * Select optimal ventilation pair (lowest PM2.5, tie-break highest VC).
 * @param {readonly { startHour: number, endHour: number, avgPm25: number, maxPm25: number, avgVc: number }[]} list
 * @param {{ startHour: number, endHour: number, avgPm25: number, maxPm25: number, avgVc: number }} fallback
 * @returns {{ startHour: number, endHour: number, avgPm25: number, maxPm25: number, avgVc: number }}
 */
function pickLowestPmPair(list, fallback) {
  return list.reduce((acc, cur) => {
    if (cur.avgPm25 !== acc.avgPm25) {
      return cur.avgPm25 < acc.avgPm25 ? cur : acc;
    }
    return cur.avgVc > acc.avgVc ? cur : acc;
  }, list[0] ?? fallback);
}

/**
 * Detect the optimal daytime (09:00-18:00 IST) 2h ventilation window and peak smog window.
 * @param {readonly Record<string, unknown>[]} hourly24h
 * @returns {{
 *   startHour: number,
 *   endHour: number,
 *   label: string,
 *   avgPm25: number,
 *   confidence: 'safe' | 'brief_only' | 'avoid',
 *   isDaytime: boolean,
 *   peakSmogWindow: {
 *     startHour: number,
 *     endHour: number,
 *     label: string,
 *     avgPm25: number,
 *     maxPm25: number
 *   }
 * }}
 */
export function findVentilationWindow(hourly24h) {
  if (!Array.isArray(hourly24h) || hourly24h.length === 0) {
    return {
      startHour: 13,
      endHour: 15,
      label: '13:00–15:00 IST',
      avgPm25: 0,
      confidence: 'safe',
      isDaytime: true,
      peakSmogWindow: { startHour: 21, endHour: 23, label: '21:00–23:00 IST', avgPm25: 0, maxPm25: 0 }
    };
  }

  const points = hourly24h.map((entry, idx) => {
    const item = normalizeHourlyItem(entry);
    return {
      hour: extractIstHour(item, idx),
      pm25: Math.max(0, Number(item.pm25)),
      vc: Number(item.ventilationCoefficient) || Number(item.pblMeters) * Number(item.windSpeed10mMs)
    };
  });

  const daytimePairs = collectTwoHourPairs(points, true);
  const allPairs = collectTwoHourPairs(points, false);
  const fallback = {
    startHour: points[0].hour,
    endHour: (points[0].hour + 2) % 24,
    avgPm25: points[0].pm25,
    maxPm25: points[0].pm25,
    avgVc: points[0].vc
  };
  const best = pickLowestPmPair(daytimePairs.length > 0 ? daytimePairs : allPairs, fallback);
  const peakSource = allPairs.length > 0 ? allPairs : [fallback];
  const peak = peakSource.reduce((acc, cur) => (cur.avgPm25 > acc.avgPm25 ? cur : acc), peakSource[0]);

  return {
    startHour: best.startHour,
    endHour: best.endHour,
    label: `${formatHourLabel(best.startHour)}–${formatHourLabel(best.endHour)} IST`,
    avgPm25: best.avgPm25,
    confidence: ventilationConfidence(best.avgPm25),
    isDaytime: daytimePairs.length > 0,
    peakSmogWindow: {
      startHour: peak.startHour,
      endHour: peak.endHour,
      label: `${formatHourLabel(peak.startHour)}–${formatHourLabel(peak.endHour)} IST`,
      avgPm25: peak.avgPm25,
      maxPm25: peak.maxPm25
    }
  };
}

/**
 * Generate a deterministic 24h hourly curve from realistic diurnal weights.
 * @param {Record<string, number>} cfg
 * @returns {Record<string, unknown>[]}
 */
function buildDiurnalCurve(cfg) {
  const hours = [];
  for (let h = 0; h < 24; h += 1) {
    const mixing = clamp(Math.sin(((h - 7) / 14) * Math.PI), 0, 1);
    const inversionWeight = 1 - mixing;
    const rushFactor = RUSH_HOURS.has(h) ? 1.15 : 1.0;
    const pm25 = Math.round((cfg.basePm25 + cfg.amplitudePm25 * inversionWeight) * rushFactor);
    const pblMeters = Math.round(cfg.pblNight + (cfg.pblDay - cfg.pblNight) * mixing);
    const windSpeed10mMs = Number((cfg.windNight + (cfg.windDay - cfg.windNight) * mixing).toFixed(2));
    const rh = Math.round(cfg.rhNight - (cfg.rhNight - cfg.rhDay) * mixing);
    const no2 = Math.round(cfg.no2Base * (0.65 + 0.55 * inversionWeight) * rushFactor);
    const o3 = Math.round(18 + cfg.o3Peak * mixing);
    const coUgM3 = Math.round(cfg.coUgBase * (0.7 + 0.6 * inversionWeight) * rushFactor);
    const pm10 = Math.round(pm25 * cfg.pm10Ratio);
    const so2 = Math.round(cfg.so2Base * (0.8 + 0.3 * inversionWeight));
    const risk = computeInversionRisk(pblMeters, windSpeed10mMs);
    const naqiMeta = computeNaqi({ pm25, pm10, no2, so2, o3, coUgM3 });

    hours.push({
      time: `2026-11-25T${String(h).padStart(2, '0')}:00`,
      istHour: h,
      pm25,
      pm10,
      no2,
      so2,
      o3,
      coUgM3,
      coMgM3: naqiMeta.coMgM3,
      rh,
      pblMeters: risk.pblMeters,
      windSpeed10mMs: risk.windSpeed10mMs,
      ventilationCoefficient: risk.ventilationCoefficient,
      inversionRisk: risk.inversionRisk,
      naqi: naqiMeta.naqi,
      category: naqiMeta.category,
      grapStage: naqiMeta.grapStage
    });
  }
  return hours;
}

/**
 * Curated Winter Smog Crisis Presets with realistic 24h PBL, wind, and pollutant profiles.
 */
export const SCENARIO_PRESETS = Object.freeze({
  'delhi-severe': Object.freeze({
    id: 'delhi-severe',
    label: 'Delhi Winter Inversion (Severe)',
    labelHi: 'दिल्ली शीतकालीन धुंध (गंभीर)',
    city: 'Delhi (Anand Vihar)',
    lat: 28.6469,
    lon: 77.316,
    defaultHourIst: 8,
    hourly24h: Object.freeze(
      buildDiurnalCurve({
        basePm25: 138,
        amplitudePm25: 145,
        pm10Ratio: 1.58,
        no2Base: 68,
        so2Base: 22,
        o3Peak: 58,
        coUgBase: 1650,
        pblNight: 185,
        pblDay: 1020,
        windNight: 0.85,
        windDay: 2.35,
        rhNight: 84,
        rhDay: 48
      })
    )
  }),
  'igp-very-poor': Object.freeze({
    id: 'igp-very-poor',
    label: 'IGP Plain Haze (Very Poor)',
    labelHi: 'गंगा का मैदानी कोहरा (बहुत खराब)',
    city: 'Patna (IGP Plain)',
    lat: 25.5941,
    lon: 85.1376,
    defaultHourIst: 8,
    hourly24h: Object.freeze(
      buildDiurnalCurve({
        basePm25: 82,
        amplitudePm25: 108,
        pm10Ratio: 1.52,
        no2Base: 48,
        so2Base: 18,
        o3Peak: 54,
        coUgBase: 1180,
        pblNight: 240,
        pblDay: 1180,
        windNight: 1.1,
        windDay: 2.75,
        rhNight: 82,
        rhDay: 46
      })
    )
  }),
  'coastal-moderate': Object.freeze({
    id: 'coastal-moderate',
    label: 'Coastal Sea-Breeze (Satisfactory)',
    labelHi: 'तटीय समुद्री हवा (संतोषजनक)',
    city: 'Mumbai (Worli)',
    lat: 19.0176,
    lon: 72.8162,
    defaultHourIst: 9,
    hourly24h: Object.freeze(
      buildDiurnalCurve({
        basePm25: 32,
        amplitudePm25: 26,
        pm10Ratio: 1.72,
        no2Base: 34,
        so2Base: 14,
        o3Peak: 46,
        coUgBase: 760,
        pblNight: 560,
        pblDay: 1480,
        windNight: 2.4,
        windDay: 4.5,
        rhNight: 74,
        rhDay: 58
      })
    )
  })
});

/**
 * Build yesterday-comparison delta summary for "What Changed Today".
 * @param {Record<string, unknown>} current
 * @param {{ peakPm25: number, naqi?: number }} yesterday
 * @param {number} peakPm25
 * @param {number} peakToMiddayRatio
 * @returns {Record<string, unknown>}
 */
function buildYesterdayDelta(current, yesterday, peakPm25, peakToMiddayRatio) {
  const deltaPm25 = Math.round(peakPm25 - yesterday.peakPm25);
  const deltaNaqi = Number.isFinite(yesterday.naqi) ? Math.round(Number(current.naqi) - yesterday.naqi) : 0;
  const trend = deltaPm25 > 12 ? 'worse' : deltaPm25 < -12 ? 'better' : 'steady';
  const sign = deltaPm25 >= 0 ? '+' : '';
  return {
    deltaPm25,
    deltaNaqi,
    peakToMiddayRatio,
    trend,
    summaryEn: `Peak PM2.5 is ${sign}${deltaPm25} µg/m³ vs yesterday (${peakToMiddayRatio}× diurnal swing).`,
    summaryHi: `कल की तुलना में अधिकतम PM2.5 ${sign}${deltaPm25} µg/m³ है (दिन-रात का अंतर ${peakToMiddayRatio}×)।`
  };
}

/**
 * Summarize "What Changed Today" comparing current inversion vs afternoon mixing or yesterday.
 * @param {readonly Record<string, unknown>[]} hourly24h
 * @param {Record<string, unknown>} current
 * @param {{ peakPm25?: number, naqi?: number } | null | undefined} yesterday
 * @returns {{
 *   deltaPm25: number,
 *   deltaNaqi: number,
 *   peakToMiddayRatio: number,
 *   trend: 'worse' | 'better' | 'steady',
 *   summaryEn: string,
 *   summaryHi: string
 * }}
 */
function buildWhatChangedDelta(hourly24h, current, yesterday) {
  const pmValues = hourly24h.map((h) => Number(h.pm25) || 0);
  const peakPm25 = Math.max(...pmValues, Number(current.pm25));
  const minPm25 = Math.min(...pmValues, Number(current.pm25));
  const peakToMiddayRatio = Number((peakPm25 / Math.max(minPm25, 1)).toFixed(1));

  if (yesterday && Number.isFinite(yesterday.peakPm25)) {
    return buildYesterdayDelta(current, yesterday, peakPm25, peakToMiddayRatio);
  }

  const highTrap = current.inversionRisk === 'High';
  const trend = highTrap ? 'worse' : current.inversionRisk === 'Low' ? 'better' : 'steady';
  return {
    deltaPm25: Math.round(Number(current.pm25) - 60),
    deltaNaqi: Math.round(Number(current.naqi) - 100),
    peakToMiddayRatio,
    trend,
    summaryEn: highTrap
      ? `Shallow PBL (${current.pblMeters} m, VC ${current.ventilationCoefficient} m²/s) drives a ${peakToMiddayRatio}× smog swing between inversion hours and midday lift.`
      : `Boundary layer lifts to allow ${peakToMiddayRatio}× cleaner dispersion during midday mixing hours.`,
    summaryHi: highTrap
      ? `कमज़ोर हवा व निचली परत (${current.pblMeters} m, VC ${current.ventilationCoefficient} m²/s) से रात और दोपहर के प्रदूषण में ${peakToMiddayRatio}× अंतर है।`
      : `दिन की ऊँची परत व हवा से दोपहर में प्रदूषण ${peakToMiddayRatio}× तक कम होता है।`
  };
}

/**
 * Resolve observed PM2.5 value from explicit PM2.5, calibrated AQI, or WAQI US EPA AQI.
 * @param {Record<string, unknown>} input
 * @returns {{ observedPm25: number | null, source: string | null }}
 */
function resolveCalibrationInput(input) {
  const directPm25 = firstValidNumber(input.observedPm25, input.calibratedPm25);
  if (directPm25 !== null) {
    return { observedPm25: directPm25, source: String(input.calibrationSource ?? 'local-pm25') };
  }
  const waqi = toNonNegFinite(input.waqiUsEpaPm25Aqi);
  if (waqi !== null && waqi > 0) {
    return { observedPm25: usEpaPm25AqiToUgM3(waqi), source: 'waqi-us-epa' };
  }
  const calAqi = toNonNegFinite(input.calibratedAqi);
  if (calAqi !== null && calAqi > 0) {
    const approxPm25 = interpolatePiecewise(calAqi, [
      [0, 50, 0, 30],
      [50, 100, 30, 60],
      [100, 200, 60, 90],
      [200, 300, 90, 120],
      [300, 400, 120, 250],
      [400, 500, 250, 380]
    ]);
    return { observedPm25: Number(approxPm25.toFixed(1)), source: 'local-naqi' };
  }
  return { observedPm25: null, source: null };
}

/**
 * Enrich an hourly item with full NAQI sub-indices and inversion metrics.
 * @param {Record<string, unknown>} item
 * @param {number} idx
 * @returns {Record<string, unknown>}
 */
function enrichHourlyPoint(item, idx) {
  const risk = computeInversionRisk(Number(item.pblMeters), Number(item.windSpeed10mMs));
  const naqiMeta = computeNaqi(item);
  return {
    ...item,
    istHour: extractIstHour(item, idx),
    coMgM3: naqiMeta.coMgM3,
    naqi: naqiMeta.naqi,
    dominantPollutant: naqiMeta.dominantPollutant,
    subIndices: naqiMeta.subIndices,
    category: naqiMeta.category,
    categoryHi: naqiMeta.categoryHi,
    band: naqiMeta.band,
    grapStage: naqiMeta.grapStage,
    ventilationCoefficient: risk.ventilationCoefficient,
    inversionRisk: risk.inversionRisk
  };
}

/**
 * Resolve location metadata from snapshot input and fallback preset.
 * @param {Record<string, unknown>} safeInput
 * @param {typeof SCENARIO_PRESETS['delhi-severe']} preset
 * @param {boolean} hasCustomHourly
 * @returns {Record<string, unknown>}
 */
function resolveLocationMeta(safeInput, preset, hasCustomHourly) {
  return {
    city: safeInput.city ?? preset.city,
    lat: safeInput.lat ?? preset.lat,
    lon: safeInput.lon ?? preset.lon,
    presetId: hasCustomHourly ? (safeInput.presetId ?? null) : preset.id,
    source: safeInput.source ?? 'preset'
  };
}

/**
 * Resolve anchor index for current snapshot hour (0 for custom live series unless currentHourIst given).
 * @param {readonly Record<string, unknown>[]} baseHourly
 * @param {unknown} currentHourIst
 * @param {boolean} hasCustomHourly
 * @param {number} defaultPresetHour
 * @returns {number}
 */
function resolveAnchorIndex(baseHourly, currentHourIst, hasCustomHourly, defaultPresetHour) {
  if (hasCustomHourly && !Number.isFinite(currentHourIst)) {
    return 0;
  }
  const targetHour = Number.isFinite(currentHourIst)
    ? ((Math.trunc(Number(currentHourIst)) % 24) + 24) % 24
    : defaultPresetHour;
  return Math.max(0, baseHourly.findIndex((h, idx) => extractIstHour(h, idx) === targetHour));
}

/**
 * Build a complete normalized Air Quality snapshot from a preset or live hourly series.
 * @param {Record<string, unknown>} [input]
 * @returns {Record<string, unknown>}
 */
export function buildAirQualitySnapshot(input = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const preset = SCENARIO_PRESETS[safeInput.presetId] ?? SCENARIO_PRESETS['delhi-severe'];
  const hasCustomHourly = Array.isArray(safeInput.hourly24h) && safeInput.hourly24h.length > 0;
  const baseHourly = hasCustomHourly ? safeInput.hourly24h.slice(0, 24) : preset.hourly24h;
  const anchorIdx = resolveAnchorIndex(baseHourly, safeInput.currentHourIst, hasCustomHourly, preset.defaultHourIst);
  const cal = resolveCalibrationInput(safeInput);
  const hourly24h = applyPblCalibration(baseHourly, cal.observedPm25, anchorIdx).map(enrichHourlyPoint);

  const current = hourly24h[anchorIdx] ?? hourly24h[0];
  const windowInfo = findVentilationWindow(hourly24h);
  const { peakSmogWindow, ...ventilationWindow } = windowInfo;

  return {
    location: resolveLocationMeta(safeInput, preset, hasCustomHourly),
    current,
    calibration: {
      applied: cal.observedPm25 !== null,
      source: cal.source,
      observedPm25: cal.observedPm25,
      k0: current.calibrationFactor ?? 1
    },
    ventilationWindow,
    peakSmogWindow,
    whatChangedToday: buildWhatChangedDelta(hourly24h, current, safeInput.yesterday),
    hourly24h
  };
}
