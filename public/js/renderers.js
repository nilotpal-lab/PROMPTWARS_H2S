/**
 * @fileoverview Pure DOM renderers (document.createElement + textContent only; zero raw HTML string sinks)
 * for telemetry, simulator readouts, action plan tabs, copilot thread, and RFC 5545 .ics export.
 */

import { formatNumber, getStrings } from './i18n.js';
import { getTodayIstKey } from './state.js';
import { renderPm25Chart, renderHourlyDataTable, renderDoseBarSvg } from './charts.js';

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

const FALLBACK_COPY = Object.freeze({
  en: {
    redGuidance: 'Medical Red-Flag Active: Keep rescue inhalers and cardiac medicines handy; stop exertion upon breathlessness.',
    redSigns: ['Persistent breathlessness or chest tightness', 'SpO2 < 94% — seek urgent care'],
    morningTitle: 'Morning Departure Shield',
    morningConflict: 'Keep sealed during dawn inversion; never mask infants <2 yrs.',
    morningAction: 'Skip dawn jogs; fit N95 for school/commute (>2 yrs).',
    middayTitle: 'Mid-Day 20-Min Flush & Window',
    middayConflict: 'Purges >2,500 ppm indoor CO₂ during peak mixing.',
    eveningTitle: 'Pre-Inversion Evening Lock-Down',
    eveningConflict: 'Prevent sunset PBL collapse + dinner tadka trap.',
    eveningAction: 'Run kitchen exhaust during tadka; zero incense/coils; turn on purifier.',
    maskRule: 'Use a snug N95 outdoors during poor/severe hours.',
    priorityAction: 'Run closed-room HEPA or 4-filter DIY CR cube overnight.',
    iaqHacks: {
      zero_cost: [{ title: 'Kitchen Exhaust + Damp Pocha', detail: 'Run exhaust during tadka and skip dry sweeping or incense.' }],
      diy: [{ title: '230V 4-Filter CR Cube', detail: '4 pleated MERV-13 filters avoid 230V shaded-pole fan burnout.' }],
      purifier: [{ title: 'True HEPA H13 (CADR >= 4× Vol)', detail: 'Keep bedroom door shut and disable ionizer toggles.' }]
    },
    mythBusters: [
      { myth: 'Houseplants clean PM2.5', reality: 'Negligible PM2.5 CADR at room scale (~600 plants/m² needed).' },
      { myth: 'Washing N95 restores it', reality: 'Soap/water destroys electrostatic charge; only air-dry.' }
    ]
  },
  hi: {
    redGuidance: 'चिकित्सा सतर्कता: रिलीवर इन्हेलर और दवाएं पास रखें; सांस फूलने पर बाहर जाना तुरंत रोकें।',
    redSigns: ['तेज़ सांस फूलना या सीने में दर्द', 'SpO2 < 94% होने पर डॉक्टर से मिलें'],
    morningTitle: 'सुबह का बचाव',
    morningConflict: 'सुबह की धुंध में खिड़कियां बंद रखें; शिशु को मास्क न पहनाएं।',
    morningAction: 'सुबह की दौड़ टालें और फिट N95 का उपयोग करें (>2 वर्ष)।',
    middayTitle: 'दोपहर वेंटिलेशन और फ्लश',
    middayConflict: 'CO₂ कम करने के लिए दोपहर खिड़की चुनें।',
    eveningTitle: 'शाम का इन्वर्ज़न लॉक-डाउन',
    eveningConflict: 'तड़का व अगरबत्ती धुआं अंदर न रुकने दें।',
    eveningAction: 'रसोई एग्जॉस्ट चलाएं और अगरबत्ती/कॉइल बंद रखें।',
    maskRule: 'बाहर निकलते समय फिट N95 पहनें।',
    priorityAction: 'सोते समय बंद कमरे में HEPA/CR बॉक्स चलाएं।',
    iaqHacks: {
      zero_cost: [{ title: 'किचन एग्जॉस्ट और गीला पोंछा', detail: 'तड़का समय एग्जॉस्ट चलाएं और सूखे झाड़ू से बचें।' }],
      diy: [{ title: '230V 4-फ़िल्टर DIY बॉक्स', detail: '4 MERV-13 फ़िल्टर मोटर को गर्म होने से बचाते हैं।' }],
      purifier: [{ title: 'CADR ≥ 4× आयतन HEPA', detail: 'आयोनाइज़र मोड बंद रखें।' }]
    },
    mythBusters: [
      { myth: 'पौधे PM2.5 साफ करते हैं', reality: 'घरेलू पैमाने पर प्रभाव लगभग शून्य।' },
      { myth: 'N95 धोने से नया रहता है', reality: 'पानी इलेक्ट्रोस्टैटिक चार्ज नष्ट कर देता है।' }
    ]
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
    'diurnal-swing-badge', 'what-changed-summary', 'hero-pbl', 'hero-wind', 'hero-vc',
    'pm25-chart-svg', 'pm25-table-body', 'pm25-table-wrap', 'toggle-table-btn',
    'sim-dose-value', 'sim-reduced-value', 'sim-indoor-value', 'infant-mask-warning',
    'room-volume-display', 'outdoor-hours-display', 'cadr-gate-badge',
    'plan-source-badge', 'plan-headline', 'medical-red-flag-banner', 'red-flag-guidance', 'red-flag-signs',
    'routine-anchors', 'profile-guidance-list', 'iaq-hacks-container', 'myth-busters-list',
    'swap-co2-value', 'swap-pm25-value', 'community-multipliers-body',
    'whatsapp-brief-text', 'copy-status', 'whatsapp-fallback-wrap', 'whatsapp-fallback-input',
    'dose-summary-line', 'dose-bar-svg', 'cig-value', 'cig-disclaimer', 'box-cin-value', 'box-meta-line',
    'math-details-body', 'print-sheet-title', 'print-sheet-summary', 'print-sheet-anchors', 'print-sheet-safety',
    'copilot-dialog', 'copilot-grounded-meta', 'copilot-quick-chips', 'copilot-messages',
    'copilot-input', 'simulator-live', 'clear-calibration-btn', 'calibrated-aqi-input', 'footer-attribution'
  ];
  const refs = {};
  for (const id of ids) {
    refs[id] = doc.getElementById(id);
  }
  return refs;
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
      ? 'मानक मॉडल डेटा (स्थानीय मॉनिटर के अनुसार कैलिब्रेट करने के लिए ऊपर NAQI दर्ज करें)'
      : 'Model baseline (enter local monitor NAQI above for PBL-weighted calibration)';
  }
  return lang === 'hi'
    ? `कैलिब्रेटेड (${cal.source}): स्थानीय PM2.5 ${cal.observedPm25} µg/m³ · गुणांक k₀ = ${cal.k0}`
    : `Calibrated (${cal.source}): observed PM2.5 ${cal.observedPm25} µg/m³ · factor k₀ = ${cal.k0}`;
}

function formatVentDetail(win, lang) {
  const isHi = lang === 'hi';
  if (isHi && win.guidanceHi) {
    return win.guidanceHi;
  }
  if (!isHi && win.guidanceEn) {
    return win.guidanceEn;
  }
  const avg = Math.round(Number(win.avgPm25) || 0);
  if (win.confidence === 'safe') {
    return isHi
      ? `दोपहर औसत ${avg} µg/m³ — 20–30 मिनट खिड़कियां खोलने के लिए सुरक्षित।`
      : `Midday average ${avg} µg/m³ — safe for 20–30 min cross-ventilation.`;
  }
  if (win.confidence === 'brief_only') {
    return isHi
      ? `दोपहर औसत ${avg} µg/m³ — केवल 15–20 मिनट CO₂ निकालने के लिए खोलें।`
      : `Midday average ${avg} µg/m³ — brief 15–20 min flush only to purge indoor CO₂.`;
  }
  return isHi
    ? `दोपहर में भी ${avg} µg/m³ अधिक है — खिड़कियां बंद रखें और फ़िल्टर चलाएं।`
    : `Stays >200 µg/m³ (${avg} µg/m³) — keep sealed, limit flush to 5 min post-cooking.`;
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
  setText(refs['fire-alert-body'], msg || `${fire.fireCount} active fires detected across ${fire.region}.`);
}

function renderInversionAlert(refs, cur, isHi) {
  const banner = refs['inversion-banner'];
  if (!banner) {
    return;
  }
  banner.hidden = false;
  const risk = cur.inversionRisk || 'Moderate';
  const pbl = Math.round(Number(cur.pblMeters) || 0);
  const wind = Number(cur.windSpeed10mMs || 0).toFixed(1);
  const vc = Math.round(Number(cur.ventilationCoefficient) || 0);
  const body = isHi
    ? `इन्वर्ज़न जोखिम: ${risk} (PBL ${pbl} मी × हवा ${wind} मी/से = VC ${vc} m²/s)।`
    : `Inversion trapping risk: ${risk} (PBL ${pbl} m × wind ${wind} m/s = VC ${vc} m²/s).`;
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
  setText(refs['hero-band-text'], cur.grapStage ? `${cat} · ${cur.grapStage}` : cat);
}

function renderHeroMetrics(refs, snapshot, cur, lang) {
  const tierSuffix = snapshot.stale ? ' (cached)' : '';
  setText(refs['hero-source-tier'], `${snapshot.sourceTier || 'preset'}${tierSuffix}`);
  setText(refs['hero-location-city'], snapshot.location?.city || 'Delhi');
  updateSeverityBadge(refs, cur, lang);

  setText(refs['hero-naqi'], formatNumber(Math.round(Number(cur.naqi) || 0), lang));
  setText(refs['hero-pm25'], `${formatNumber(Math.round(Number(cur.pm25) || 0), lang)} µg/m³`);
  setText(refs['hero-pm10'], `${formatNumber(Math.round(Number(cur.pm10) || 0), lang)} µg/m³`);
  setText(refs['hero-no2'], `${formatNumber(Math.round(Number(cur.no2) || 0), lang)} µg/m³`);
  setText(refs['hero-co'], `${Number(cur.coMgM3 || 0).toFixed(2)} mg/m³`);
  setText(refs['calibration-status'], formatCalibrationNote(snapshot.calibration, lang));

  const attrText = formatAttributionList(snapshot.attribution);
  setText(refs['data-attribution'], attrText);
  setText(refs['footer-attribution'], attrText);
}

function renderVentCard(refs, snapshot, lang) {
  const win = snapshot.ventilationWindow || {};
  const peak = snapshot.peakSmogWindow || {};
  setText(refs['vent-window-label'], win.label || '13:00–15:00 IST');
  setText(refs['vent-confidence-badge'], String(win.confidence || 'brief_only').replace('_', ' '));
  setText(refs['vent-window-detail'], formatVentDetail(win, lang));

  const peakPm = formatNumber(Math.round(Number(peak.maxPm25) || 0), lang);
  setText(refs['peak-window-label'], `${peak.label || '20:00–22:00 IST'} (${peakPm} µg/m³)`);
}

function renderChangedCard(refs, snapshot, cur, lang) {
  const changed = snapshot.whatChangedToday || {};
  const isHi = lang === 'hi';
  setText(refs['diurnal-swing-badge'], `${changed.peakToMiddayRatio || 1}×`);
  setText(refs['what-changed-summary'], (isHi ? changed.summaryHi : changed.summaryEn) || '');
  setText(refs['hero-pbl'], `${formatNumber(Math.round(Number(cur.pblMeters) || 0), lang)} m`);
  setText(refs['hero-wind'], `${Number(cur.windSpeed10mMs || 0).toFixed(1)} m/s`);
  setText(refs['hero-vc'], `${formatNumber(Math.round(Number(cur.ventilationCoefficient) || 0), lang)} m²/s`);
}

function renderVentAndChangedCards(refs, snapshot, cur, lang) {
  renderVentCard(refs, snapshot, lang);
  renderChangedCard(refs, snapshot, cur, lang);
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
  renderVentAndChangedCards(refs, snapshot, cur, lang);
  renderFireAlert(refs, snapshot, isHi);
  renderInversionAlert(refs, cur, isHi);
  renderPm25Chart(refs['pm25-chart-svg'], snapshot, lang);
  renderHourlyDataTable(refs['pm25-table-body'], snapshot, lang);
}

function formatCadrGateText(box, lang) {
  const isHi = lang === 'hi';
  if (!box) {
    return '';
  }
  const map = {
    inactive: isHi ? 'CADR निष्क्रिय (0 ACH)' : 'Purifier inactive (0 ACH)',
    optimal: isHi ? `उपयुक्त कमरे का आकार (${box.purifierAch} ACH ≥ 4)` : `Optimal CADR match (${box.purifierAch} ACH ≥ 4.0)`,
    undersized: isHi ? `कमरे के लिए थोड़ा कम (${box.purifierAch} ACH)` : `Undersized for room (${box.purifierAch} ACH < 4.0)`,
    oversized_room: isHi ? `कमरा बहुत बड़ा (${box.purifierAch} ACH < 2)` : `Room too large for CADR (${box.purifierAch} ACH < 2.0)`
  };
  return map[box.roomSizeGate] || '';
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
        `1. इनडोर बॉक्स मॉडल: C_in = (0.75 × ACH × C_out + G/V) / (ACH + 0.35 + CADR/V) = ${box.cInUgM3} µg/m³ (I/O = ${box.indoorOutdoorRatio})।`,
        `2. फेफड़ों की खुराक: बाहर (${dose.commuteOutdoor} µg) + रसोई/इनडोर स्रोत (${dose.cookingIndoor} µg) + आधार इनडोर (${dose.baselineIndoor} µg) = ${dose.totalMitigatedUg} µg/दिन (बिना उपाय ${dose.totalBaselineUg} µg)।`,
        `3. वयस्क सिगरेट समतुल्य: औसत 24h सांद्रता ÷ 22 µg/m³ = ${impact.adultCigaretteEquivalent} सिगरेट/दिन (केवल वयस्क मानक; शिशु फेफड़ों से कभी विभाजित नहीं)।`,
        `4. CO रूपांतरण व PBL: CPCB CO को µg/m³ से ÷1000 कर mg/m³ (${cur.coMgM3} mg/m³) में बदला जाता है; VC = ${cur.pblMeters} × ${cur.windSpeed10mMs} = ${cur.ventilationCoefficient} m²/s।`
      ]
    : [
        `1. Steady-state indoor box: C_in = (0.75 × ACH × C_out + G/V) / (ACH + 0.35 + CADR/V) = ${box.cInUgM3} µg/m³ (I/O ratio = ${box.indoorOutdoorRatio}).`,
        `2. Segmented dose (10 µg rounded): Outdoor (${dose.commuteOutdoor} µg) + Cooking/Sources (${dose.cookingIndoor} µg) + Baseline Indoor (${dose.baselineIndoor} µg) = ${dose.totalMitigatedUg} µg/day vs ${dose.totalBaselineUg} µg unmitigated.`,
        `3. Berkeley Earth adult equivalence: Effective 24h concentration ÷ 22 µg/m³ = ${impact.adultCigaretteEquivalent} cig/day (never divided by infant lung volume).`,
        `4. Unit & PBL checks: Open-Meteo CO µg/m³ ÷ 1000 = ${cur.coMgM3} mg/m³; Ventilation Coefficient = ${cur.pblMeters} m × ${cur.windSpeed10mMs} m/s = ${cur.ventilationCoefficient} m²/s.`
      ];
  container.replaceChildren(...lines.map((line) => el('p', null, line)));
}

/**
 * Render 0ms instant simulator KPIs, infant mask hard-block, CADR gate, and math disclosures.
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

  setText(refs['sim-dose-value'], `${formatNumber(dose.totalMitigatedUg, lang)} µg/d`);
  setText(refs['sim-reduced-value'], `-${dose.percentReduced}% (${formatNumber(dose.avoidedUg, lang)} µg)`);
  setText(refs['sim-indoor-value'], `${formatNumber(box.cInUgM3, lang, 1)} µg/m³ (${box.indoorOutdoorRatio}×)`);
  setText(refs['room-volume-display'], `${household.roomVolumeM3} m³`);
  setText(refs['outdoor-hours-display'], `${household.outdoorHours} h`);
  setText(refs['cadr-gate-badge'], formatCadrGateText(box, lang));

  if (refs['infant-mask-warning']) {
    const hasInfant = Boolean(impact.mask?.blockedForInfant) || Boolean(household.profiles?.includes('infant'));
    refs['infant-mask-warning'].hidden = !hasInfant;
  }

  setText(refs['swap-co2-value'], `${formatNumber(impact.co2eSavedKgPerWeek, lang, 1)} kg/wk`);
  setText(refs['swap-pm25-value'], `${formatNumber(impact.pm25AvoidedGPerWeek, lang, 1)} g/wk`);
  renderMultipliersTable(refs['community-multipliers-body'], impact.communityMultipliers, lang);

  const doseSummary = isHi
    ? `दैनिक भार ${formatNumber(dose.totalMitigatedUg, lang)} µg/दिन बनाम बिना सुरक्षा ${formatNumber(dose.totalBaselineUg, lang)} µg/दिन (${dose.percentReduced}% कमी)।`
    : `Mitigated daily dose: ${formatNumber(dose.totalMitigatedUg, lang)} µg/day vs ${formatNumber(dose.totalBaselineUg, lang)} µg/day unmitigated (${dose.percentReduced}% reduction).`;
  setText(refs['dose-summary-line'], doseSummary);
  renderDoseBarSvg(refs['dose-bar-svg'], impact, lang);

  setText(refs['cig-value'], isHi ? `${impact.adultCigaretteEquivalent} सिगरेट / दिन` : `${impact.adultCigaretteEquivalent} cig / day`);
  setText(refs['cig-disclaimer'], isHi
    ? `वयस्क जोखिम मानक (22 µg/m³ = 1 सिगरेट/दिन; बिना सुरक्षा ${impact.baselineAdultCigaretteEquivalent}/दिन)। शिशुओं के लिए उपयोग न करें।`
    : `Berkeley Earth adult risk (22 µg/m³ = 1 cig/day; baseline ${impact.baselineAdultCigaretteEquivalent}/day). Never divided by infant lung volume.`);
  setText(refs['box-cin-value'], `${formatNumber(box.cInUgM3, lang, 1)} µg/m³`);
  setText(refs['box-meta-line'], isHi
    ? `बाहरी स्तर ${box.cOutUgM3} µg/m³ · I/O अनुपात ${box.indoorOutdoorRatio} · अनुमानित CO₂ ${box.estimatedCo2Ppm} ppm`
    : `Outdoor ${box.cOutUgM3} µg/m³ · I/O ratio ${box.indoorOutdoorRatio} · Est. CO₂ ${box.estimatedCo2Ppm} ppm`);

  renderMathBody(refs['math-details-body'], impact, snapshot, lang);
}

function buildFallbackRoutine(copy, winLabel, isHi) {
  const middayAct = isHi
    ? `${winLabel} के दौरान 15–20 मिनट क्रॉस-वेंटिलेशन करें।`
    : `Cross-ventilate 15–20 min during ${winLabel}.`;
  return [
    { id: 'morning_shield', timeWindow: '06:30–09:00 IST', title: copy.morningTitle, conflictNote: copy.morningConflict, actions: [copy.morningAction] },
    { id: 'midday_flush', timeWindow: winLabel, title: copy.middayTitle, conflictNote: copy.middayConflict, actions: [middayAct] },
    { id: 'evening_lockdown', timeWindow: '17:30–22:00 IST', title: copy.eveningTitle, conflictNote: copy.eveningConflict, actions: [copy.eveningAction] }
  ];
}

function buildFallbackGuidance(profiles, copy, dict, winLabel, isHi) {
  const outRule = isHi ? `बाहरी काम केवल ${winLabel} में सीमित रखें।` : `Keep outdoor trips brief outside ${winLabel}.`;
  return profiles.map((id) => ({
    profileId: id,
    label: String(dict[`prof_${id}`] || id),
    maskRule: id === 'infant' ? String(dict.infantMaskBlock) : copy.maskRule,
    outdoorRule: outRule,
    priorityAction: copy.priorityAction
  }));
}

function resolveActiveProfiles(household) {
  const raw = household ? household.profiles : null;
  return Array.isArray(raw) && raw.length > 0 ? raw : ['commuter'];
}

function hasSensitiveProfile(profiles) {
  return profiles.includes('asthmatic') || profiles.includes('elderly_cardiac');
}

function readSnapshotFields(snapshot) {
  const s = snapshot || {};
  return {
    naqi: Number(s.current?.naqi) || 0,
    winLabel: s.ventilationWindow?.label || '13:00–15:00 IST',
    city: s.location?.city || 'City'
  };
}

function resolveFallbackContext(snapshot, impact, household, lang) {
  const isHi = lang === 'hi';
  const { naqi, winLabel, city } = readSnapshotFields(snapshot);
  const profiles = resolveActiveProfiles(household);
  const pct = impact?.dose?.percentReduced || 0;

  return {
    isHi,
    copy: isHi ? FALLBACK_COPY.hi : FALLBACK_COPY.en,
    dict: getStrings(lang),
    winLabel,
    city,
    naqi,
    profiles,
    redActive: naqi > 300 || hasSensitiveProfile(profiles),
    pct
  };
}

function buildFallbackPlan(snapshot, impact, household, lang) {
  const ctx = resolveFallbackContext(snapshot, impact, household, lang);
  const headline = ctx.isHi
    ? `${ctx.city}: NAQI ${ctx.naqi}। इन बदलावों से फेफड़ों का PM2.5 भार ${ctx.pct}% घटता है।`
    : `${ctx.city}: NAQI ${ctx.naqi}. Routing windows and indoor fixes cut daily inhaled dose by ${ctx.pct}%.`;
  const brief = ctx.isHi
    ? `VayuMitra (${ctx.city}): NAQI ${ctx.naqi}। दोपहर वेंटिलेशन: ${ctx.winLabel}।`
    : `VayuMitra Brief (${ctx.city}): NAQI ${ctx.naqi}. Best window: ${ctx.winLabel}.`;

  return {
    lang,
    headlinePlainEnglish: headline,
    medicalRedFlag: { active: ctx.redActive, guidance: ctx.copy.redGuidance, emergencySigns: ctx.copy.redSigns },
    threeAnchorRoutine: buildFallbackRoutine(ctx.copy, ctx.winLabel, ctx.isHi),
    profileGuidance: buildFallbackGuidance(ctx.profiles, ctx.copy, ctx.dict, ctx.winLabel, ctx.isHi),
    iaqHacks: ctx.copy.iaqHacks,
    mythBusters: ctx.copy.mythBusters,
    commuteAndCommunity: { whatsappBrief: brief }
  };
}

function renderAnchors(refs, anchors, checklist, lang, onToggleCheck) {
  if (!refs['routine-anchors']) {
    return;
  }
  const dict = getStrings(lang);
  const cards = (anchors || []).map((item) => {
    const card = el('article', 'anchor-card');
    const head = el('div', 'anchor-header');
    const checkLabel = el('label', 'anchor-check-label');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(checklist[item.id]);
    checkbox.addEventListener('change', () => onToggleCheck(item.id, checkbox.checked));
    checkLabel.append(checkbox, el('span', null, `${item.title} (${dict.anchorDoneLabel})`));

    head.append(checkLabel, el('span', 'status-pill tabular-nums', item.timeWindow));
    card.append(head, el('p', 'muted-caption', item.conflictNote || ''));

    const ul = el('ul', 'bullet-list');
    for (const act of item.actions || []) {
      ul.append(el('li', null, act));
    }
    card.append(ul);
    return card;
  });
  refs['routine-anchors'].replaceChildren(...cards);
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
  if (!active) {
    return;
  }
  setText(refs['red-flag-guidance'], flag.guidance || '');
  if (refs['red-flag-signs']) {
    const items = (flag.emergencySigns || []).map((s) => el('li', null, s));
    refs['red-flag-signs'].replaceChildren(...items);
  }
}

function renderPrintSheet(refs, snapshot, plan) {
  setText(refs['print-sheet-title'], `VayuMitra Fridge Sheet — ${snapshot?.location?.city || 'India'}`);
  setText(refs['print-sheet-summary'], plan.headlinePlainEnglish || '');
  if (refs['print-sheet-anchors']) {
    const items = (plan.threeAnchorRoutine || []).map((a) =>
      el('p', null, `${a.timeWindow} · ${a.title}: ${(a.actions || []).join(' ')}`)
    );
    refs['print-sheet-anchors'].replaceChildren(...items);
  }
  setText(refs['print-sheet-safety'], plan.medicalRedFlag?.active ? plan.medicalRedFlag.guidance : '');
}

/**
 * Render all 4 Action Plan tab panels + print sheet from API plan or deterministic fallback.
 * @param {Record<string, HTMLElement | null>} refs
 * @param {Record<string, unknown>} state
 * @param {(anchorId: string, checked: boolean) => void} onToggleCheck
 */
export function renderPlanSections(refs, state, onToggleCheck) {
  const lang = state.lang === 'hi' ? 'hi' : 'en';
  const dict = getStrings(lang);
  const plan = state.plan?.lang === lang
    ? state.plan
    : buildFallbackPlan(state.snapshot, state.impact, state.household, lang);

  setText(refs['plan-source-badge'], state.planSource === 'gemini' ? dict.sourceGemini : dict.sourceFallback);
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
  renderPrintSheet(refs, state.snapshot, plan);
}

function buildChatBubble(msg) {
  const isUser = msg.role === 'user';
  const bubble = el('div', isUser ? 'chat-msg chat-msg-user' : 'chat-msg chat-msg-assistant');
  bubble.append(el('p', 'alert-body', msg.text));
  if (!isUser && msg.meta) {
    bubble.append(el('p', 'chat-meta', msg.meta));
  }
  return bubble;
}

function renderQuickChips(container, quickChips, onQuickChip) {
  if (!container) {
    return;
  }
  const chips = (quickChips || []).map((q) => {
    const btn = el('button', 'quick-chip-btn', q);
    btn.type = 'button';
    btn.addEventListener('click', () => onQuickChip(q));
    return btn;
  });
  container.replaceChildren(...chips);
}

/**
 * Render quick-ask chips and chat conversation thread cleanly with textContent.
 * @param {Record<string, HTMLElement | null>} refs
 * @param {readonly Record<string, unknown>[]} messages
 * @param {Record<string, unknown>} snapshot
 * @param {'en' | 'hi'} lang
 * @param {(question: string) => void} onQuickChip
 */
export function renderCopilotPanel(refs, messages, snapshot, lang, onQuickChip) {
  const dict = getStrings(lang);
  const city = snapshot?.location?.city || '';
  const naqi = snapshot?.current?.naqi ?? '—';
  const win = snapshot?.ventilationWindow?.label || '';
  setText(refs['copilot-grounded-meta'], `${city} · NAQI ${naqi} · ${win}`);

  renderQuickChips(refs['copilot-quick-chips'], dict.quickChips, onQuickChip);
  if (refs['copilot-messages']) {
    refs['copilot-messages'].replaceChildren(...(messages || []).map(buildChatBubble));
  }
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
  const city = snapshot?.location?.city || 'India';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VayuMitra//Exposure Router//EN',
    'BEGIN:VEVENT',
    `UID:vayumitra-vent-${dateKey}@vayumitra.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${istHourToUtcStamp(dateKey, Number(win.startHour) || 13)}`,
    `DTEND:${istHourToUtcStamp(dateKey, Number(win.endHour) || 15)}`,
    `SUMMARY:${escapeIcsText(isHi ? `VayuMitra दोपहर वेंटिलेशन (${city})` : `VayuMitra Mid-Day Ventilation (${city})`)}`,
    `DESCRIPTION:${escapeIcsText(`Window ${win.label}, avg PM2.5 ${win.avgPm25} ug/m3. Flush indoor CO2 briefly.`)}`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    `UID:vayumitra-lock-${dateKey}@vayumitra.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${istHourToUtcStamp(dateKey, 17.5)}`,
    `DTEND:${istHourToUtcStamp(dateKey, 18.5)}`,
    `SUMMARY:${escapeIcsText(isHi ? `VayuMitra शाम इन्वर्ज़न लॉक-डाउन (${city})` : `VayuMitra Pre-Inversion Lock-Down (${city})`)}`,
    `DESCRIPTION:${escapeIcsText('Seal windows before evening PBL collapse; run kitchen exhaust during tadka.')}`,
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n');
}
