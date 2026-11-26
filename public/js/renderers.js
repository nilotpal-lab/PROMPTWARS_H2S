/**
 * @fileoverview Pure DOM renderers (document.createElement + textContent only; zero raw HTML string sinks)
 * importing deterministic recommender directly from ../lib/recommender.js (zero fallback drift).
 */

import {
  IAQ_HACKS_DATA,
  MYTH_BUSTERS_DATA,
  PROFILE_GUIDANCE_DATA,
  RED_FLAG_GUIDANCE,
  buildHeadline,
  buildMedicalRedFlag,
  buildThreeAnchorRoutine,
  buildWhatsappBrief,
  generateDeterministicPlan
} from '../lib/recommender.js';
import { formatNumber, getStrings } from './i18n.js';
import { getTodayIstKey } from './state.js';
import { renderPm25Chart, renderHourlyDataTable, renderDoseBarSvg } from './charts.js';

export {
  IAQ_HACKS_DATA,
  MYTH_BUSTERS_DATA,
  PROFILE_GUIDANCE_DATA,
  RED_FLAG_GUIDANCE,
  buildHeadline,
  buildMedicalRedFlag,
  buildThreeAnchorRoutine,
  buildWhatsappBrief,
  generateDeterministicPlan
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const SEVERITY_CLASSES = Object.freeze([
  'severity-good',
  'severity-satisfactory',
  'severity-moderate',
  'severity-poor',
  'severity-very-poor',
  'severity-severe',
  'severity-severe-plus'
]);

const BAND_ICON_PATHS = Object.freeze({
  good: 'M5 13l4 4L19 7',
  satisfactory: 'M12 8v4m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  moderate: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  poor: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  'very-poor': 'M12 8v5m0 3.5h.01M7.9 2.5h8.2l5.4 5.4v8.2l-5.4 5.4H7.9L2.5 16.1V7.9z',
  severe: 'M12 8v5m0 3.5h.01M7.9 2.5h8.2l5.4 5.4v8.2l-5.4 5.4H7.9L2.5 16.1V7.9z',
  'severe-plus': 'M12 8v5m0 3.5h.01M7.9 2.5h8.2l5.4 5.4v8.2l-5.4 5.4H7.9L2.5 16.1V7.9z'
});

const TOKEN_LABELS = Object.freeze({
  en: {
    confidence: { safe: 'Safe', brief_only: 'Brief flush only', avoid: 'Keep closed' },
    risk: { High: 'High', Moderate: 'Moderate', Low: 'Low' },
    grap: { 'Stage I': 'Stage I', 'Stage II': 'Stage II', 'Stage III': 'Stage III', 'Stage IV (Severe+)': 'Stage IV (Severe+)' },
    tier: { preset: 'Preset scenario', 'fallback-preset': 'Fallback scenario', 'live-open-meteo': 'Open-Meteo forecast', cpcb: 'CPCB', waqi: 'WAQI' }
  },
  hi: {
    confidence: { safe: 'सुरक्षित', brief_only: 'केवल संक्षिप्त हवा', avoid: 'बंद रखें' },
    risk: { High: 'उच्च', Moderate: 'मध्यम', Low: 'कम' },
    grap: { 'Stage I': 'चरण I', 'Stage II': 'चरण II', 'Stage III': 'चरण III', 'Stage IV (Severe+)': 'चरण IV (अति गंभीर)' },
    tier: { preset: 'मानक परिदृश्य', 'fallback-preset': 'सुरक्षित मानक', 'live-open-meteo': 'Open-Meteo पूर्वानुमान', cpcb: 'CPCB', waqi: 'WAQI' }
  }
});

function el(tag, className = null, text = null) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== null) {
    node.textContent = String(text);
  }
  return node;
}

function setText(node, value) {
  if (node) {
    node.textContent = String(value);
  }
}

function createSeverityIconSvg(band) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', BAND_ICON_PATHS[band] || BAND_ICON_PATHS.moderate);
  svg.append(path);
  return svg;
}

/**
 * Collect DOM element references by ID once at boot or test setup.
 * @param {Document} doc
 * @returns {Record<string, HTMLElement | null>}
 */
export function collectDomRefs(doc) {
  const ids = [
    'status-banner', 'fire-alert-banner', 'fire-alert-body', 'inversion-banner', 'inversion-body',
    'hero-source-tier', 'hero-location-city', 'hero-band-badge', 'hero-band-icon', 'hero-band-text',
    'hero-naqi', 'hero-pm25', 'hero-pm10', 'hero-no2', 'hero-co', 'calibration-status', 'data-attribution',
    'vent-confidence-badge', 'vent-window-label', 'vent-window-detail', 'peak-window-label',
    'tomorrow-window-row', 'tomorrow-window-label',
    'diurnal-swing-badge', 'what-changed-summary', 'hero-pbl', 'hero-wind', 'hero-vc',
    'pm25-chart-svg', 'pm25-table-body', 'pm25-table-wrap', 'toggle-table-btn',
    'sim-dose-value', 'sim-reduced-value', 'sim-indoor-value', 'infant-mask-warning',
    'room-volume-range', 'room-volume-display', 'outdoor-hours-range', 'outdoor-hours-display', 'cadr-gate-badge',
    'daily-km-input', 'daily-km-error', 'commute-days-input', 'commute-days-error',
    'city-input', 'gps-locate-btn', 'calibrated-aqi-input', 'clear-calibration-btn',
    'plan-source-badge', 'plan-headline', 'medical-red-flag-banner', 'red-flag-guidance', 'red-flag-signs',
    'routine-anchors', 'profile-guidance-list', 'iaq-hacks-container', 'myth-busters-list',
    'swap-co2-value', 'swap-pm25-value', 'community-multipliers-body',
    'whatsapp-brief-text', 'copy-status', 'whatsapp-fallback-wrap', 'whatsapp-fallback-input',
    'dose-summary-line', 'dose-bar-svg', 'cig-value', 'cig-disclaimer', 'box-cin-value', 'box-meta-line',
    'math-details-body', 'print-sheet-title', 'print-sheet-summary', 'print-sheet-anchors', 'print-sheet-safety',
    'copilot-dialog', 'copilot-grounded-meta', 'copilot-quick-chips', 'copilot-messages', 'copilot-status',
    'copilot-input', 'copilot-send-btn', 'simulator-live', 'footer-attribution'
  ];
  const refs = {};
  for (const id of ids) {
    refs[id] = doc.getElementById(id);
  }
  return refs;
}

function localizeSourceTier(sourceTier, stale, lang) {
  const tokens = TOKEN_LABELS[lang === 'hi' ? 'hi' : 'en'].tier;
  const parts = String(sourceTier || 'preset')
    .split('+')
    .map((p) => tokens[p] || p);
  const base = parts.join(' + ');
  if (!stale) {
    return base;
  }
  return lang === 'hi' ? `${base} (कैश्ड)` : `${base} (cached)`;
}

function formatAttributionList(attribution) {
  if (Array.isArray(attribution)) {
    return attribution.map((item) => (typeof item === 'string' ? item : item?.name || '')).filter(Boolean).join(' · ');
  }
  return typeof attribution === 'string' ? attribution : 'Open-Meteo CAMS · CPCB NAQI';
}

function formatCalibrationNote(cal, lang) {
  if (!cal || !cal.applied) {
    return lang === 'hi'
      ? 'मानक पूर्वानुमान (नज़दीकी मॉनिटर मिलाने के लिए ऊपर NAQI दर्ज करें)'
      : 'Forecast baseline (enter nearby monitor NAQI above to calibrate)';
  }
  const obs = formatNumber(Number(cal.observedPm25), lang, 1);
  const k0 = formatNumber(Number(cal.k0), lang, 2);
  return lang === 'hi'
    ? `कैलिब्रेटेड (${cal.source}): स्थानीय PM2.5 ${obs} µg/m³ · गुणांक k₀ = ${k0}`
    : `Calibrated (${cal.source}): observed PM2.5 ${obs} µg/m³ · factor k₀ = ${k0}`;
}

function formatVentDetail(win, lang) {
  const isHi = lang === 'hi';
  if (isHi && win.guidanceHi) {
    return win.guidanceHi;
  }
  if (!isHi && win.guidanceEn) {
    return win.guidanceEn;
  }
  const avg = formatNumber(Math.round(Number(win.avgPm25) || 0), lang);
  if (win.confidence === 'safe') {
    return isHi
      ? `दोपहर औसत ${avg} µg/m³ — 20–30 मिनट खिड़कियां खोलने के लिए सुरक्षित`
      : `Midday average ${avg} µg/m³ — safe for 20–30 min cross-ventilation`;
  }
  if (win.confidence === 'brief_only') {
    return isHi
      ? `दोपहर औसत ${avg} µg/m³ — केवल 15–20 मिनट CO₂ निकालने के लिए खोलें`
      : `Midday average ${avg} µg/m³ — brief 15–20 min flush only to purge indoor CO₂`;
  }
  return isHi
    ? `दोपहर में भी ${avg} µg/m³ अधिक है — खिड़कियां बंद रखें और फ़िल्टर चलाएं`
    : `Stays >200 µg/m³ (${avg} µg/m³) — keep sealed, limit flush to 5 min post-cooking`;
}

function renderFireAlert(refs, snapshot, isHi) {
  const banner = refs['fire-alert-banner'];
  if (!banner) {
    return;
  }
  const fire = snapshot.regionalContext?.fireAlert;
  const active = Boolean(fire && fire.active);
  banner.hidden = !active;
  if (!active) {
    return;
  }
  const msg = isHi ? fire.messageHi : fire.messageEn;
  setText(refs['fire-alert-body'], msg || `${formatNumber(fire.fireCount, isHi ? 'hi' : 'en')} active fires detected across ${fire.region}`);
}

function renderInversionAlert(refs, cur, lang) {
  const banner = refs['inversion-banner'];
  if (!banner) {
    return;
  }
  const isHi = lang === 'hi';
  const tokens = TOKEN_LABELS[isHi ? 'hi' : 'en'].risk;
  banner.hidden = false;
  const risk = tokens[cur.inversionRisk] || cur.inversionRisk || tokens.Moderate;
  const pbl = formatNumber(Math.round(Number(cur.pblMeters) || 0), lang);
  const wind = formatNumber(Number(cur.windSpeed10mMs || 0), lang, 1);
  const vc = formatNumber(Math.round(Number(cur.ventilationCoefficient) || 0), lang);
  const body = isHi
    ? `इन्वर्ज़न जोखिम: ${risk} (मिश्रण ऊँचाई ${pbl} मी × हवा ${wind} मी/से = ${vc} m²/s)`
    : `Inversion trapping risk: ${risk} (mixing height ${pbl} m × wind ${wind} m/s = ${vc} m²/s)`;
  setText(refs['inversion-body'], body);
}

function updateSeverityBadge(refs, cur, lang) {
  const badge = refs['hero-band-badge'];
  if (!badge) {
    return;
  }
  for (const cls of SEVERITY_CLASSES) {
    badge.classList.remove(cls);
  }
  const band = cur.band || 'moderate';
  badge.classList.add(`severity-${band}`);
  if (refs['hero-band-icon']) {
    refs['hero-band-icon'].replaceChildren(createSeverityIconSvg(band));
  }
  const cat = lang === 'hi' ? cur.categoryHi || cur.category : cur.category;
  const grapTokens = TOKEN_LABELS[lang === 'hi' ? 'hi' : 'en'].grap;
  const stage = cur.grapStage ? (grapTokens[cur.grapStage] || cur.grapStage) : null;
  setText(refs['hero-band-text'], stage ? `${cat} · ${stage}` : cat);
}

function renderHeroMetrics(refs, snapshot, cur, lang) {
  setText(refs['hero-source-tier'], localizeSourceTier(snapshot.sourceTier, Boolean(snapshot.stale), lang));
  setText(refs['hero-location-city'], snapshot.location?.city || 'Delhi');
  updateSeverityBadge(refs, cur, lang);

  setText(refs['hero-naqi'], formatNumber(Math.round(Number(cur.naqi) || 0), lang));
  setText(refs['hero-pm25'], `${formatNumber(Math.round(Number(cur.pm25) || 0), lang)} µg/m³`);
  setText(refs['hero-pm10'], `${formatNumber(Math.round(Number(cur.pm10) || 0), lang)} µg/m³`);
  setText(refs['hero-no2'], `${formatNumber(Math.round(Number(cur.no2) || 0), lang)} µg/m³`);
  setText(refs['hero-co'], `${formatNumber(Number(cur.coMgM3 || 0), lang, 2)} mg/m³`);
  setText(refs['calibration-status'], formatCalibrationNote(snapshot.calibration, lang));

  const attrText = formatAttributionList(snapshot.attribution);
  setText(refs['data-attribution'], attrText);
  setText(refs['footer-attribution'], attrText);
}

function renderTomorrowWindowRow(refs, tomorrow, confTokens, lang) {
  const tomorrowRow = refs['tomorrow-window-row'];
  if (!tomorrowRow) {
    return;
  }
  const hasTomorrow = Boolean(tomorrow && tomorrow.label);
  tomorrowRow.hidden = !hasTomorrow;
  if (!hasTomorrow) {
    setText(refs['tomorrow-window-label'], '—');
    return;
  }
  const tomAvg = formatNumber(Math.round(Number(tomorrow.avgPm25) || 0), lang);
  const tomConf = confTokens[tomorrow.confidence] || '';
  const suffix = tomConf ? ` · ${tomConf}` : '';
  setText(refs['tomorrow-window-label'], `${tomorrow.label} (~${tomAvg} µg/m³${suffix})`);
}

function renderVentCard(refs, snapshot, lang) {
  const win = snapshot.ventilationWindow || {};
  const peak = snapshot.peakSmogWindow || {};
  const confTokens = TOKEN_LABELS[lang === 'hi' ? 'hi' : 'en'].confidence;

  setText(refs['vent-window-label'], win.label || '13:00–15:00 IST');
  setText(refs['vent-confidence-badge'], confTokens[win.confidence] || String(win.confidence || 'brief_only'));
  setText(refs['vent-window-detail'], formatVentDetail(win, lang));

  const peakPm = formatNumber(Math.round(Number(peak.maxPm25) || 0), lang);
  setText(refs['peak-window-label'], `${peak.label || '20:00–22:00 IST'} (${peakPm} µg/m³)`);
  renderTomorrowWindowRow(refs, snapshot.tomorrowWindow, confTokens, lang);
}

function renderChangedCard(refs, snapshot, cur, lang) {
  const changed = snapshot.whatChangedToday || {};
  const isHi = lang === 'hi';
  const ratio = formatNumber(Number(changed.peakToMiddayRatio || 1), lang, 1);
  setText(refs['diurnal-swing-badge'], `${ratio}×`);
  setText(refs['what-changed-summary'], (isHi ? changed.summaryHi : changed.summaryEn) || '');
  setText(refs['hero-pbl'], `${formatNumber(Math.round(Number(cur.pblMeters) || 0), lang)} ${isHi ? 'मी' : 'm'}`);
  setText(refs['hero-wind'], `${formatNumber(Number(cur.windSpeed10mMs || 0), lang, 1)} ${isHi ? 'मी/से' : 'm/s'}`);
  setText(refs['hero-vc'], `${formatNumber(Math.round(Number(cur.ventilationCoefficient) || 0), lang)} m²/s`);
}

/**
 * Render location, telemetry KPIs, alerts, 24h chart, and synchronized table.
 * @param {Record<string, HTMLElement | null>} refs
 * @param {Record<string, unknown>} snapshot
 * @param {'en' | 'hi'} lang
 */
export function renderLocationAndTelemetry(refs, snapshot, lang) {
  if (!snapshot) {
    return;
  }
  const cur = snapshot.current || {};
  const isHi = lang === 'hi';
  renderHeroMetrics(refs, snapshot, cur, lang);
  renderVentCard(refs, snapshot, lang);
  renderChangedCard(refs, snapshot, cur, lang);
  renderFireAlert(refs, snapshot, isHi);
  renderInversionAlert(refs, cur, lang);
  renderPm25Chart(refs['pm25-chart-svg'], snapshot, lang);
  renderHourlyDataTable(refs['pm25-table-body'], snapshot, lang);
}

function formatCadrGateText(box, lang) {
  const isHi = lang === 'hi';
  if (!box) {
    return '';
  }
  const ach = formatNumber(Number(box.purifierAch), lang, 1);
  const map = {
    inactive: isHi ? 'फ़िल्टर बंद (0 ACH)' : 'Purifier off (0 ACH)',
    optimal: isHi ? `कमरे के आकार के अनुकूल (${ach} ACH ≥ 4)` : `Good match for room (${ach} ACH ≥ 4.0)`,
    undersized: isHi ? `कमरे के लिए क्षमता थोड़ी कम (${ach} ACH)` : `Slightly undersized for room (${ach} ACH < 4.0)`,
    oversized_room: isHi ? `कमरा बहुत बड़ा है (${ach} ACH < 2)` : `Room too large for this filter (${ach} ACH < 2.0)`
  };
  return map[box.roomSizeGate] || '';
}

function formatRoomVolumeLabel(vol, lang) {
  const isHi = lang === 'hi';
  const vNum = Number(vol) || 36;
  const approxSqFt = Math.round(vNum * 3.65);
  if (vNum === 36) {
    return isHi ? '36 m³ (~11×12 फीट कमरा)' : '36 m³ (~11×12 ft room)';
  }
  return isHi ? `${formatNumber(vNum, lang)} m³ (~${formatNumber(approxSqFt, lang)} वर्ग फुट)` : `${formatNumber(vNum, lang)} m³ (~${formatNumber(approxSqFt, lang)} sq ft)`;
}

function renderMultipliersTable(tbody, multipliers, lang) {
  if (!tbody || !Array.isArray(multipliers)) {
    return;
  }
  const rows = multipliers.map((row) => {
    const tr = el('tr');
    tr.append(
      el('td', null, formatNumber(row.households, lang)),
      el('td', null, formatNumber(row.co2eSavedKgPerWeek, lang, 1)),
      el('td', null, formatNumber(row.pm25AvoidedGPerWeek, lang, 1))
    );
    return tr;
  });
  tbody.replaceChildren(...rows);
}

function renderMathBody(container, impact, snapshot, lang) {
  if (!container || !impact) {
    return;
  }
  const isHi = lang === 'hi';
  const cur = snapshot?.current || {};
  const box = impact.indoorBox || {};
  const dose = impact.dose || {};
  const lines = isHi
    ? [
        `1. इनडोर बॉक्स मॉडल: C_in = (0.75 × ACH × C_out + G/V) / (ACH + 0.35 + CADR/V) = ${formatNumber(box.cInUgM3, lang, 1)} µg/m³ (I/O = ${formatNumber(box.indoorOutdoorRatio, lang, 2)})।`,
        `2. फेफड़ों की खुराक: बाहर (${formatNumber(dose.commuteOutdoor, lang)} µg) + रसोई/इनडोर स्रोत (${formatNumber(dose.cookingIndoor, lang)} µg) + आधार इनडोर (${formatNumber(dose.baselineIndoor, lang)} µg) = ${formatNumber(dose.totalMitigatedUg, lang)} µg/दिन।`,
        `3. वयस्क सिगरेट समतुल्य: औसत 24h सांद्रता ÷ 22 µg/m³ = ${formatNumber(impact.adultCigaretteEquivalent, lang, 1)} सिगरेट/दिन (केवल वयस्क मानक; शिशु के लिए लागू नहीं)।`,
        `4. CO रूपांतरण व मिश्रण: CPCB CO को µg/m³ से ÷1000 कर mg/m³ (${formatNumber(Number(cur.coMgM3), lang, 2)} mg/m³) में बदला जाता है; गति = ${formatNumber(Number(cur.ventilationCoefficient), lang)} m²/s।`,
        '5. प्रति-घंटा NAQI अनुमान: प्रति-घंटा Open-Meteo CAMS मॉडल मानों को तात्कालिक गंभीरता अनुमान के रूप में 24-घंटे CPCB NAQI मानकों पर मैप किया जाता है।'
      ]
    : [
        `1. Steady-state indoor box: C_in = (0.75 × ACH × C_out + G/V) / (ACH + 0.35 + CADR/V) = ${formatNumber(box.cInUgM3, lang, 1)} µg/m³ (I/O ratio = ${formatNumber(box.indoorOutdoorRatio, lang, 2)}).`,
        `2. Segmented dose (10 µg rounded): Outdoor (${formatNumber(dose.commuteOutdoor, lang)} µg) + Cooking/Sources (${formatNumber(dose.cookingIndoor, lang)} µg) + Baseline Indoor (${formatNumber(dose.baselineIndoor, lang)} µg) = ${formatNumber(dose.totalMitigatedUg, lang)} µg/day vs ${formatNumber(dose.totalBaselineUg, lang)} µg unmitigated.`,
        `3. Berkeley Earth adult equivalence: Effective 24h concentration ÷ 22 µg/m³ = ${formatNumber(impact.adultCigaretteEquivalent, lang, 1)} cig/day (never divided by infant lung volume).`,
        `4. Unit & mixing checks: Open-Meteo CO µg/m³ ÷ 1000 = ${formatNumber(Number(cur.coMgM3), lang, 2)} mg/m³; Air Clearing Speed = ${formatNumber(Number(cur.pblMeters), lang)} m × ${formatNumber(Number(cur.windSpeed10mMs), lang, 1)} m/s = ${formatNumber(Number(cur.ventilationCoefficient), lang)} m²/s.`,
        '5. Hourly NAQI estimate: Hourly modeled Open-Meteo CAMS concentrations are mapped onto 24-hour CPCB NAQI breakpoints as a real-time hourly severity estimate.'
      ];
  container.replaceChildren(...lines.map((line) => el('p', null, line)));
}

function renderDoseAndBoxCards(refs, impact, snapshot, lang) {
  const isHi = lang === 'hi';
  const dose = impact.dose || {};
  const box = impact.indoorBox || {};

  const doseSummary = isHi
    ? `दैनिक भार ${formatNumber(dose.totalMitigatedUg, lang)} µg/दिन बनाम बिना सुरक्षा ${formatNumber(dose.totalBaselineUg, lang)} µg/दिन (${formatNumber(dose.percentReduced, lang)}% कमी)`
    : `Daily inhaled dose: ${formatNumber(dose.totalMitigatedUg, lang)} µg/day vs ${formatNumber(dose.totalBaselineUg, lang)} µg/day unmitigated (${formatNumber(dose.percentReduced, lang)}% reduction)`;
  setText(refs['dose-summary-line'], doseSummary);
  renderDoseBarSvg(refs['dose-bar-svg'], impact, lang);

  setText(refs['cig-value'], isHi ? `${formatNumber(impact.adultCigaretteEquivalent, lang, 1)} सिगरेट / दिन` : `${formatNumber(impact.adultCigaretteEquivalent, lang, 1)} cig / day`);
  setText(refs['cig-disclaimer'], isHi
    ? `वयस्क जोखिम मानक (22 µg/m³ = 1 सिगरेट/दिन; बिना सुरक्षा ${formatNumber(impact.baselineAdultCigaretteEquivalent, lang, 1)}/दिन)। शिशुओं के लिए उपयोग न करें।`
    : `Berkeley Earth adult risk (22 µg/m³ = 1 cig/day; baseline ${formatNumber(impact.baselineAdultCigaretteEquivalent, lang, 1)}/day). Never divided by infant lung volume.`);
  setText(refs['box-cin-value'], `${formatNumber(box.cInUgM3, lang, 1)} µg/m³`);
  setText(refs['box-meta-line'], isHi
    ? `बाहरी स्तर ${formatNumber(box.cOutUgM3, lang, 1)} µg/m³ · I/O अनुपात ${formatNumber(box.indoorOutdoorRatio, lang, 2)} · अनुमानित CO₂ ${formatNumber(box.estimatedCo2Ppm, lang)} ppm`
    : `Outdoor ${formatNumber(box.cOutUgM3, lang, 1)} µg/m³ · I/O ratio ${formatNumber(box.indoorOutdoorRatio, lang, 2)} · Est. CO₂ ${formatNumber(box.estimatedCo2Ppm, lang)} ppm`);
  renderMathBody(refs['math-details-body'], impact, snapshot, lang);
}

function updateInfantSafetyVisibility(refs, impact, household) {
  const banner = refs['infant-mask-warning'];
  if (!banner) {
    return;
  }
  const hasInfant = Boolean(impact.mask?.blockedForInfant) || Boolean(household.profiles?.includes('infant'));
  banner.hidden = !hasInfant;
}

/**
 * Render 0ms instant simulator KPIs, slider aria-valuetext, infant safety rule, CADR gate, and math disclosures.
 * @param {Record<string, HTMLElement | null>} refs
 * @param {Record<string, unknown>} impact
 * @param {Record<string, unknown>} household
 * @param {Record<string, unknown>} snapshot
 * @param {'en' | 'hi'} lang
 */
export function renderSimulatorReadout(refs, impact, household, snapshot, lang) {
  if (!impact) {
    return;
  }
  const isHi = lang === 'hi';
  const dose = impact.dose || {};
  const box = impact.indoorBox || {};
  const roomText = formatRoomVolumeLabel(household.roomVolumeM3, lang);
  const hoursFormatted = formatNumber(Number(household.outdoorHours), lang, 1);

  setText(refs['sim-dose-value'], `${formatNumber(dose.totalMitigatedUg, lang)} ${isHi ? 'µg/दिन' : 'µg/day'}`);
  setText(refs['sim-reduced-value'], `-${formatNumber(dose.percentReduced, lang)}% (${formatNumber(dose.avoidedUg, lang)} µg)`);
  setText(refs['sim-indoor-value'], `${formatNumber(box.cInUgM3, lang, 1)} µg/m³ (${formatNumber(box.indoorOutdoorRatio, lang, 2)}×)`);
  setText(refs['room-volume-display'], roomText);
  setText(refs['outdoor-hours-display'], `${hoursFormatted} ${isHi ? 'घंटे' : 'h'}`);
  setText(refs['cadr-gate-badge'], formatCadrGateText(box, lang));

  if (refs['room-volume-range']) {
    refs['room-volume-range'].setAttribute('aria-valuetext', roomText);
  }
  if (refs['outdoor-hours-range']) {
    refs['outdoor-hours-range'].setAttribute(
      'aria-valuetext',
      `${hoursFormatted} ${isHi ? 'घंटे प्रतिदिन' : 'hours per day'}`
    );
  }

  updateInfantSafetyVisibility(refs, impact, household);
  setText(refs['swap-co2-value'], `${formatNumber(impact.co2eSavedKgPerWeek, lang, 1)} ${isHi ? 'kg/सप्ताह' : 'kg/wk'}`);
  setText(refs['swap-pm25-value'], `${formatNumber(impact.pm25AvoidedGPerWeek, lang, 1)} ${isHi ? 'g/सप्ताह' : 'g/wk'}`);
  renderMultipliersTable(refs['community-multipliers-body'], impact.communityMultipliers, lang);
  renderDoseAndBoxCards(refs, impact, snapshot, lang);
}

function updateAnchorCardInPlace(card, item, checked, dict) {
  const checkbox = card.querySelector('input[type="checkbox"]');
  if (checkbox) {
    checkbox.checked = checked;
  }
  setText(card.querySelector('.anchor-title-text'), `${item.title} (${dict.anchorDoneLabel})`);
  setText(card.querySelector('.status-pill'), item.timeWindow);
  setText(card.querySelector('.anchor-conflict-note'), item.conflictNote || '');
  const ul = card.querySelector('.bullet-list');
  if (ul) {
    ul.replaceChildren(...(item.actions || []).map((act) => el('li', null, act)));
  }
}

function buildAnchorCard(item, checked, dict, onToggleCheck) {
  const card = el('article', 'anchor-card');
  card.dataset.anchorId = item.id;
  const head = el('div', 'anchor-header');
  const checkLabel = el('label', 'anchor-check-label');
  const checkbox = el('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.anchorId = item.id;
  checkbox.checked = checked;
  checkbox.addEventListener('change', () => onToggleCheck(item.id, checkbox.checked));
  checkLabel.append(checkbox, el('span', 'anchor-title-text', `${item.title} (${dict.anchorDoneLabel})`));

  head.append(checkLabel, el('span', 'status-pill tabular-nums', item.timeWindow));
  card.append(head, el('p', 'muted-caption anchor-conflict-note', item.conflictNote || ''));

  const ul = el('ul', 'bullet-list');
  for (const act of item.actions || []) {
    ul.append(el('li', null, act));
  }
  card.append(ul);
  return card;
}

function renderAnchors(refs, anchors, checklist, lang, onToggleCheck) {
  const container = refs['routine-anchors'];
  if (!container) {
    return;
  }
  const dict = getStrings(lang);
  const list = anchors || [];
  const existing = Array.from(container.children);
  const sameOrder =
    existing.length === list.length &&
    list.every((item, idx) => existing[idx]?.dataset?.anchorId === item.id);

  if (sameOrder) {
    for (const [idx, item] of list.entries()) {
      updateAnchorCardInPlace(existing[idx], item, Boolean(checklist[item.id]), dict);
    }
    return;
  }

  const activeEl = container.ownerDocument?.activeElement;
  const focusedAnchorId = activeEl && container.contains(activeEl) ? activeEl.dataset?.anchorId : null;
  const cards = list.map((item) => buildAnchorCard(item, Boolean(checklist[item.id]), dict, onToggleCheck));
  container.replaceChildren(...cards);
  if (focusedAnchorId) {
    container.querySelector(`input[data-anchor-id="${focusedAnchorId}"]`)?.focus();
  }
}

function renderProfileGuidance(container, list, lang) {
  if (!container) {
    return;
  }
  const dict = getStrings(lang);
  const cards = (list || []).map((item) => {
    const card = el('article', 'guidance-card');
    card.append(
      el('h4', 'mini-heading', item.label),
      el('p', 'muted-caption', `${dict.maskRuleLabel}: ${item.maskRule}`),
      el('p', 'muted-caption', `${dict.outdoorRuleLabel}: ${item.outdoorRule}`),
      el('p', 'card-detail', `${dict.priorityActionLabel}: ${item.priorityAction}`)
    );
    return card;
  });
  container.replaceChildren(...cards);
}

function renderIaqAndMyths(refs, plan, lang) {
  const dict = getStrings(lang);
  const hacks = plan.iaqHacks || {};
  const tiers = [
    [dict.tierZeroCost, hacks.zero_cost || []],
    [dict.tierDiy, hacks.diy || []],
    [dict.tierPurifier, hacks.purifier || []]
  ];
  if (refs['iaq-hacks-container']) {
    const tierCards = [];
    for (const [tierLabel, items] of tiers) {
      for (const item of items) {
        const card = el('article', 'iaq-tier-card');
        card.append(el('span', 'tier-badge', tierLabel), el('h4', 'mini-heading', item.title), el('p', 'card-detail', item.detail));
        tierCards.push(card);
      }
    }
    refs['iaq-hacks-container'].replaceChildren(...tierCards);
  }

  if (refs['myth-busters-list']) {
    const cards = (plan.mythBusters || []).map((m) => {
      const card = el('article', 'myth-card');
      card.append(
        el('p', 'meta-label', `${dict.mythClaimLabel}: ${m.myth}`),
        el('p', 'card-detail', `${dict.mythFactLabel}: ${m.reality}`)
      );
      return card;
    });
    refs['myth-busters-list'].replaceChildren(...cards);
  }
}

function renderMedicalRedFlag(refs, flag) {
  const banner = refs['medical-red-flag-banner'];
  if (!banner) {
    return;
  }
  const active = Boolean(flag && flag.active);
  banner.hidden = !active;
  banner.classList.remove('alert-danger', 'alert-critical');
  if (!active) {
    return;
  }
  banner.classList.add(flag.severity === 'critical' ? 'alert-critical' : 'alert-danger');
  setText(refs['red-flag-guidance'], flag.guidance || '');
  if (refs['red-flag-signs']) {
    const items = (flag.emergencySigns || []).map((s) => el('li', null, s));
    refs['red-flag-signs'].replaceChildren(...items);
  }
}

function renderPrintSheet(refs, snapshot, plan, lang) {
  const city = snapshot?.location?.city || (lang === 'hi' ? 'भारत' : 'India');
  const title = lang === 'hi' ? `वायुमित्र फ्रिज कार्य शीट — ${city}` : `VayuMitra Fridge Sheet — ${city}`;
  setText(refs['print-sheet-title'], title);
  setText(refs['print-sheet-summary'], plan.headlinePlainEnglish || '');
  if (refs['print-sheet-anchors']) {
    const items = (plan.threeAnchorRoutine || []).map((a) =>
      el('p', null, `${a.timeWindow} · ${a.title}: ${(a.actions || []).join(' ')}`)
    );
    refs['print-sheet-anchors'].replaceChildren(...items);
  }
  setText(refs['print-sheet-safety'], plan.medicalRedFlag?.active ? plan.medicalRedFlag.guidance : '');
}

function resolvePlanBadgeLabel(dict, state, lang) {
  if (state.plan?.lang === lang && state.planSource === 'gemini') {
    return dict.sourceGemini;
  }
  if (state.planSource === 'error-fallback') {
    return dict.sourcePlanOffline;
  }
  return dict.sourceFallback;
}

/**
 * Render all 4 Action Plan tab panels + print sheet from API plan or deterministic recommender.
 * @param {Record<string, HTMLElement | null>} refs
 * @param {Record<string, unknown>} state
 * @param {(anchorId: string, checked: boolean) => void} onToggleCheck
 */
export function renderPlanSections(refs, state, onToggleCheck) {
  const lang = state.lang === 'hi' ? 'hi' : 'en';
  const dict = getStrings(lang);
  const plan = state.plan?.lang === lang
    ? state.plan
    : generateDeterministicPlan({
        snapshot: state.snapshot,
        impact: state.impact,
        ...state.household,
        lang
      });

  setText(refs['plan-source-badge'], resolvePlanBadgeLabel(dict, state, lang));
  setText(refs['plan-headline'], plan.headlinePlainEnglish || '');
  renderMedicalRedFlag(refs, plan.medicalRedFlag);

  renderAnchors(refs, plan.threeAnchorRoutine, state.checklist || {}, lang, onToggleCheck);
  renderProfileGuidance(refs['profile-guidance-list'], plan.profileGuidance, lang);
  renderIaqAndMyths(refs, plan, lang);

  const brief = plan.commuteAndCommunity?.whatsappBrief || '';
  setText(refs['whatsapp-brief-text'], brief);
  if (refs['whatsapp-fallback-input']) {
    refs['whatsapp-fallback-input'].value = brief;
  }
  renderPrintSheet(refs, state.snapshot, plan, lang);
}

function buildChatBubble(msg) {
  const isUser = msg.role === 'user';
  const bubble = el('div', isUser ? 'chat-msg chat-msg-user' : 'chat-msg chat-msg-assistant');
  bubble.append(el('p', 'alert-body', msg.text));
  if (!isUser && msg.safetyNotice) {
    bubble.append(el('p', 'chat-safety-notice', msg.safetyNotice));
  }
  if (!isUser && msg.meta) {
    bubble.append(el('p', 'chat-meta', msg.meta));
  }
  return bubble;
}

function renderQuickChips(container, quickChips, lang, onQuickChip) {
  if (!container || container.dataset.lang === lang) {
    return;
  }
  container.dataset.lang = lang;
  const chips = (quickChips || []).map((q) => {
    const btn = el('button', 'quick-chip-btn', q);
    btn.type = 'button';
    btn.addEventListener('click', () => onQuickChip(q));
    return btn;
  });
  container.replaceChildren(...chips);
}

function syncCopilotMessages(msgBox, messages, lang) {
  if (!msgBox) {
    return;
  }
  const list = Array.isArray(messages) ? messages : [];
  const prevCount = Number(msgBox.dataset.renderedCount || '0');
  const prevLang = msgBox.dataset.renderedLang || '';
  const needsRebuild = prevLang !== lang || list.length < prevCount || msgBox.children.length !== prevCount;

  if (needsRebuild) {
    msgBox.replaceChildren(...list.map(buildChatBubble));
  } else if (list.length > prevCount) {
    msgBox.append(...list.slice(prevCount).map(buildChatBubble));
  }
  msgBox.dataset.renderedCount = String(list.length);
  msgBox.dataset.renderedLang = lang;
  if (needsRebuild || list.length > prevCount) {
    msgBox.scrollTop = msgBox.scrollHeight;
  }
}

/**
 * Render quick-ask chips and incrementally append newly added chat bubbles (rebuilding only on clear or language switch).
 * @param {Record<string, HTMLElement | null>} refs
 * @param {readonly Record<string, unknown>[]} messages
 * @param {Record<string, unknown>} snapshot
 * @param {'en' | 'hi'} lang
 * @param {(question: string) => void} onQuickChip
 */
export function renderCopilotPanel(refs, messages, snapshot, lang, onQuickChip) {
  const dict = getStrings(lang);
  const city = snapshot?.location?.city || '';
  const naqi = snapshot?.current?.naqi;
  const naqiText = Number.isFinite(Number(naqi)) ? formatNumber(Number(naqi), lang) : '—';
  const win = snapshot?.ventilationWindow?.label || '';
  setText(refs['copilot-grounded-meta'], `${city} · NAQI ${naqiText} · ${win}`);

  renderQuickChips(refs['copilot-quick-chips'], dict.quickChips, lang, onQuickChip);
  syncCopilotMessages(refs['copilot-messages'], messages, lang);
}

function escapeIcsText(text) {
  return String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function istHourToUtcStamp(dateStr, istHourFloat) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const totalMins = Math.round(istHourFloat * 60) - 330;
  const dt = new Date(Date.UTC(y, m - 1, d, 0, totalMins, 0));
  return dt.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
}

function resolveVentIcsHours(win) {
  const rawStart = Number(win?.startHour);
  const startHr = Number.isFinite(rawStart) ? rawStart : 13;
  const rawEnd = Number(win?.endHour);
  const baseEnd = Number.isFinite(rawEnd) ? rawEnd : startHr + 2;
  const endHr = baseEnd <= startHr ? baseEnd + 24 : baseEnd;
  return { startHr, endHr };
}

/**
 * Build RFC 5545 .ics calendar reminders for Today's Midday Ventilation & Evening Lockdown.
 * @param {Record<string, unknown>} snapshot
 * @param {'en' | 'hi'} lang
 * @returns {string}
 */
export function buildIcsContent(snapshot, lang) {
  const isHi = lang === 'hi';
  const dateKey = getTodayIstKey();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const win = snapshot?.ventilationWindow || { startHour: 13, endHour: 15, label: '13:00–15:00 IST', avgPm25: 120 };
  const city = snapshot?.location?.city || (isHi ? 'भारत' : 'India');
  const { startHr, endHr } = resolveVentIcsHours(win);

  const ventDesc = isHi
    ? `दोपहर हवा समय ${win.label}, औसत PM2.5 ${win.avgPm25} ug/m3। घर की CO2 निकालने के लिए 15–20 मिनट खिड़कियां खोलें।`
    : `Midday airing slot ${win.label}, avg PM2.5 ${win.avgPm25} ug/m3. Open opposite windows briefly to purge indoor CO2.`;
  const lockDesc = isHi
    ? 'शाम के समय से पहले खिड़कियां बंद करें और खाना बनाते समय रसोई एग्जॉस्ट चलाएं।'
    : 'Close windows before evening chill traps smoke; switch on kitchen exhaust during cooking.';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VayuMitra//Air Action Guide//EN',
    'BEGIN:VEVENT',
    `UID:vayumitra-vent-${dateKey}@vayumitra.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${istHourToUtcStamp(dateKey, startHr)}`,
    `DTEND:${istHourToUtcStamp(dateKey, endHr)}`,
    `SUMMARY:${escapeIcsText(isHi ? `VayuMitra दोपहर वेंटिलेशन (${city})` : `VayuMitra Mid-Day Ventilation (${city})`)}`,
    `DESCRIPTION:${escapeIcsText(ventDesc)}`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    `UID:vayumitra-lock-${dateKey}@vayumitra.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${istHourToUtcStamp(dateKey, 17.5)}`,
    `DTEND:${istHourToUtcStamp(dateKey, 18.5)}`,
    `SUMMARY:${escapeIcsText(isHi ? `VayuMitra शाम इन्वर्ज़न लॉक-डाउन (${city})` : `VayuMitra Evening Lock-Down (${city})`)}`,
    `DESCRIPTION:${escapeIcsText(lockDesc)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n');
}
