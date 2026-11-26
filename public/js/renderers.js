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

const FALLBACK_COPY = Object.freeze({
  en: {
    redGuidance: 'Medical Alert Active: Keep rescue (reliever) inhalers and heart medicines handy; stop outdoor activity if wheezing or chest tightness starts.',
    redSigns: ['Persistent breathlessness or chest tightness', 'SpO2 < 94% or bluish lips — seek urgent care'],
    morningTitle: 'Morning Departure Shield',
    morningConflict: 'Keep windows shut during morning chill; never mask infants under 2 years.',
    morningAction: 'Skip dawn jogs; fit a snug N95 for school/commute (>2 yrs).',
    middayTitle: 'Mid-Day 20-Min Airing',
    middayConflict: 'Balances high indoor CO₂ (>2,500 ppm) against outdoor smog.',
    eveningTitle: 'Evening Lock-Down Before Sunset',
    eveningConflict: 'Prevents sunset air collapse from trapping cooking smoke indoors.',
    eveningAction: 'Run kitchen exhaust during tadka; zero incense/coils; run indoor filter.',
    maskRule: 'Use a snug N95 outdoors during poor or severe hours.',
    priorityAction: 'Run closed-room HEPA or 4-filter DIY CR cube overnight.',
    iaqHacks: {
      zero_cost: [
        { title: 'Kitchen Exhaust During Tadka / Frying', detail: 'Switch on chimney or exhaust before heating oil and shut the kitchen door.' },
        { title: 'Damp Pocha Instead of Dry Jhadu', detail: 'Damp mopping removes settled dust without tossing fine PM2.5 back into the air.' },
        { title: 'Zero Indoor Agarbatti or Mosquito Coils', detail: 'Swap coils and incense indoors for window mesh, nets, or electric rackets.' },
        { title: 'Brief Midday Cross-Ventilation + Door Towel Seal', detail: 'Air out rooms for 15–20 min only in the midday slot, then block bottom door gaps.' }
      ],
      diy: [
        { title: '230V 4-Filter Corsi-Rosenthal Cube (₹2,500–₹4,000)', detail: '230V SAFETY RULE: Tape 4 pleated MERV-13 filters into a cube so low air resistance prevents Indian box fan motor overheating.' },
        { title: 'Activated Carbon Pre-Wrap for Cooking Odors', detail: 'Wrap a thin carbon sheet outside the 4 filters if tadka fumes linger; replace every 60–90 days.' }
      ],
      purifier: [
        { title: 'True HEPA H13 Matched to Bedroom Size', detail: 'Pick CADR >= 4 × room volume (m³), keep bedroom doors closed, and turn off any ionizer toggle.' }
      ]
    },
    mythBusters: [
      { myth: 'Houseplants clean indoor PM2.5 smog', reality: 'Negligible effect at home scale: studies show ~600+ plants per m² are needed to match one small purifier.' },
      { myth: 'Ionizers / plasma purifiers are safer filter-free cleaners', reality: 'Harmful myth: ionizers emit ground-level ozone (O₃) that irritates airways and worsens asthma.' },
      { myth: 'Washing or boiling N95 masks makes them reusable', reality: 'Destructive myth: soap and water ruin electrostatic fiber charge; air-dry in a paper bag instead.' },
      { myth: 'Split AC mesh filters block fine PM2.5', reality: 'False: AC plastic screens only trap coarse lint (>10 µm), letting >95% of PM2.5 pass through.' }
    ]
  },
  hi: {
    redGuidance: 'चिकित्सा सुरक्षा सक्रिय: रिलीवर इन्हेलर और हृदय की दवाएं पास रखें; घरघराहट या सीने में जकड़न होने पर बाहर न जाएं।',
    redSigns: ['लगातार सांस फूलना या सीने में दर्द', 'SpO2 < 94% या होंठ नीले पड़ना — तुरंत डॉक्टर से मिलें'],
    morningTitle: 'सुबह का बचाव',
    morningConflict: 'सुबह की ठंडी धुंध में खिड़कियां बंद रखें; 2 वर्ष से छोटे शिशु को मास्क न पहनाएं।',
    morningAction: 'सुबह की दौड़ टालें और स्कूल/सफर में फिट N95 का उपयोग करें (>2 वर्ष)।',
    middayTitle: 'दोपहर में 20 मिनट ताज़ी हवा',
    middayConflict: 'बंद कमरे की CO₂ (>2,500 ppm) निकालने और धुंध से बचाव में संतुलन।',
    eveningTitle: 'शाम का लॉक-डाउन',
    eveningConflict: 'तड़का व अगरबत्ती धुआं कमरे के अंदर फंसने से रोकता है।',
    eveningAction: 'खाना बनाते समय एग्जॉस्ट चलाएं, अगरबत्ती/कॉइल बंद रखें और फ़िल्टर चलाएं।',
    maskRule: 'खराब/गंभीर घंटों में बाहर निकलते समय फिट N95 पहनें।',
    priorityAction: 'सोते समय बंद कमरे में HEPA या 4-फ़िल्टर DIY CR बॉक्स चलाएं।',
    iaqHacks: {
      zero_cost: [
        { title: 'तड़का/तलते समय किचन एग्जॉस्ट चलाएं', detail: 'तेल गर्म करने से पहले चिमनी/एग्जॉस्ट चलाएं और रसोई का दरवाज़ा बंद रखें।' },
        { title: 'सूखे झाड़ू की जगह गीला पोंछा', detail: 'गीला पोंछा बैठी धूल को हवा में उड़ाए बिना साफ करता है।' },
        { title: 'घर में अगरबत्ती व मच्छर कॉइल बंद करें', detail: 'अंदर कॉइल/धूप की जगह मच्छरदानी, जाली या इलेक्ट्रिक रैकेट अपनाएं।' },
        { title: 'दोपहर में संक्षिप्त क्रॉस-वेंटिलेशन + दरवाज़ा सील', detail: 'केवल दोपहर के समय 15–20 मिनट हवा बदलें और बाद में दरवाज़े की दरार बंद करें।' }
      ],
      diy: [
        { title: '230V 4-फ़िल्टर कॉर्सी-रोसेंथल बॉक्स (₹2,500–₹4,000)', detail: '230V सुरक्षा नियम: 4 MERV-13 फ़िल्टर का क्यूब हवा का दबाव कम रखता है जिससे भारतीय पंखे की मोटर गर्म नहीं होती।' },
        { title: 'तड़का गंध के लिए कार्बन प्री-शीट', detail: 'रसोई की गंध व गैस कम करने के लिए बाहर पतली एक्टिवेटेड कार्बन शीट लगाएं (हर 60–90 दिन में बदलें)।' }
      ],
      purifier: [
        { title: 'कमरे के आकार अनुसार True HEPA H13', detail: '4 × कमरे के आयतन (m³) बराबर CADR चुनें (जैसे 40 m³ के लिए >=160 m³/h) और आयोनाइज़र बंद रखें।' }
      ]
    },
    mythBusters: [
      { myth: 'इनडोर पौधे घर का PM2.5 साफ करते हैं', reality: 'गलत: एक छोटे प्यूरीफायर बराबर सफाई के लिए प्रति वर्ग मीटर 600+ गमले चाहिए।' },
      { myth: 'आयोनाइज़र बिना फ़िल्टर हवा साफ करते हैं', reality: 'खतरनाक भ्रम: ये ज़हरीली ओज़ोन (O₃) गैस छोड़ते हैं जो फेफड़ों को नुकसान पहुँचाती है।' },
      { myth: 'N95 मास्क धोने या उबालने से नया हो जाता है', reality: 'गलत: पानी व साबुन इलेक्ट्रोस्टैटिक चार्ज नष्ट कर देते हैं; इसे केवल कागज़ के बैग में हवा में सुखाएं।' },
      { myth: 'स्प्लिट एसी की जाली PM2.5 रोकती है', reality: 'गलत: प्लास्टिक जाली केवल मोटी धूल (>10 µm) रोकती है; >95% PM2.5 आर-पार निकल जाता है।' }
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
    'copilot-dialog', 'copilot-grounded-meta', 'copilot-quick-chips', 'copilot-messages', 'copilot-status',
    'copilot-input', 'copilot-send-btn', 'simulator-live', 'clear-calibration-btn', 'calibrated-aqi-input', 'footer-attribution'
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

function renderVentCard(refs, snapshot, lang) {
  const win = snapshot.ventilationWindow || {};
  const peak = snapshot.peakSmogWindow || {};
  const confTokens = TOKEN_LABELS[lang === 'hi' ? 'hi' : 'en'].confidence;

  setText(refs['vent-window-label'], win.label || '13:00–15:00 IST');
  setText(refs['vent-confidence-badge'], confTokens[win.confidence] || String(win.confidence || 'brief_only'));
  setText(refs['vent-window-detail'], formatVentDetail(win, lang));

  const peakPm = formatNumber(Math.round(Number(peak.maxPm25) || 0), lang);
  setText(refs['peak-window-label'], `${peak.label || '20:00–22:00 IST'} (${peakPm} µg/m³)`);
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
        `4. CO रूपांतरण व मिश्रण: CPCB CO को µg/m³ से ÷1000 कर mg/m³ (${formatNumber(Number(cur.coMgM3), lang, 2)} mg/m³) में बदला जाता है; गति = ${formatNumber(Number(cur.ventilationCoefficient), lang)} m²/s।`
      ]
    : [
        `1. Steady-state indoor box: C_in = (0.75 × ACH × C_out + G/V) / (ACH + 0.35 + CADR/V) = ${formatNumber(box.cInUgM3, lang, 1)} µg/m³ (I/O ratio = ${formatNumber(box.indoorOutdoorRatio, lang, 2)}).`,
        `2. Segmented dose (10 µg rounded): Outdoor (${formatNumber(dose.commuteOutdoor, lang)} µg) + Cooking/Sources (${formatNumber(dose.cookingIndoor, lang)} µg) + Baseline Indoor (${formatNumber(dose.baselineIndoor, lang)} µg) = ${formatNumber(dose.totalMitigatedUg, lang)} µg/day vs ${formatNumber(dose.totalBaselineUg, lang)} µg unmitigated.`,
        `3. Berkeley Earth adult equivalence: Effective 24h concentration ÷ 22 µg/m³ = ${formatNumber(impact.adultCigaretteEquivalent, lang, 1)} cig/day (never divided by infant lung volume).`,
        `4. Unit & mixing checks: Open-Meteo CO µg/m³ ÷ 1000 = ${formatNumber(Number(cur.coMgM3), lang, 2)} mg/m³; Air Clearing Speed = ${formatNumber(Number(cur.pblMeters), lang)} m × ${formatNumber(Number(cur.windSpeed10mMs), lang, 1)} m/s = ${formatNumber(Number(cur.ventilationCoefficient), lang)} m²/s.`
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
 * Render 0ms instant simulator KPIs, infant safety rule, CADR gate, and math disclosures.
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

  setText(refs['sim-dose-value'], `${formatNumber(dose.totalMitigatedUg, lang)} ${isHi ? 'µg/दिन' : 'µg/day'}`);
  setText(refs['sim-reduced-value'], `-${formatNumber(dose.percentReduced, lang)}% (${formatNumber(dose.avoidedUg, lang)} µg)`);
  setText(refs['sim-indoor-value'], `${formatNumber(box.cInUgM3, lang, 1)} µg/m³ (${formatNumber(box.indoorOutdoorRatio, lang, 2)}×)`);
  setText(refs['room-volume-display'], formatRoomVolumeLabel(household.roomVolumeM3, lang));
  setText(refs['outdoor-hours-display'], `${formatNumber(Number(household.outdoorHours), lang, 1)} ${isHi ? 'घंटे' : 'h'}`);
  setText(refs['cadr-gate-badge'], formatCadrGateText(box, lang));

  updateInfantSafetyVisibility(refs, impact, household);
  setText(refs['swap-co2-value'], `${formatNumber(impact.co2eSavedKgPerWeek, lang, 1)} ${isHi ? 'kg/सप्ताह' : 'kg/wk'}`);
  setText(refs['swap-pm25-value'], `${formatNumber(impact.pm25AvoidedGPerWeek, lang, 1)} ${isHi ? 'g/सप्ताह' : 'g/wk'}`);
  renderMultipliersTable(refs['community-multipliers-body'], impact.communityMultipliers, lang);
  renderDoseAndBoxCards(refs, impact, snapshot, lang);
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

function buildFallbackPlan(snapshot, impact, household, lang) {
  const isHi = lang === 'hi';
  const copy = isHi ? FALLBACK_COPY.hi : FALLBACK_COPY.en;
  const dict = getStrings(lang);
  const { naqi, winLabel, city } = readSnapshotFields(snapshot);
  const profiles = resolveActiveProfiles(household);
  const redActive = naqi > 300 || hasSensitiveProfile(profiles);
  const severity = naqi > 400 && redActive ? 'critical' : redActive ? 'elevated' : 'none';
  const pct = impact?.dose?.percentReduced || 0;

  const headline = isHi
    ? `${city}: NAQI ${formatNumber(naqi, lang)}। इन बदलावों से फेफड़ों का PM2.5 भार ${formatNumber(pct, lang)}% घटता है।`
    : `${city}: NAQI ${formatNumber(naqi, lang)}. Routing outdoor hours and indoor fixes cuts daily inhaled dose by ${formatNumber(pct, lang)}%.`;
  const brief = isHi
    ? `VayuMitra (${city}): NAQI ${formatNumber(naqi, lang)}। दोपहर वेंटिलेशन समय: ${winLabel}।`
    : `VayuMitra Brief (${city}): NAQI ${formatNumber(naqi, lang)}. Best daytime window: ${winLabel}.`;

  return {
    lang,
    headlinePlainEnglish: headline,
    medicalRedFlag: { active: redActive, severity, guidance: copy.redGuidance, emergencySigns: copy.redSigns },
    threeAnchorRoutine: buildFallbackRoutine(copy, winLabel, isHi),
    profileGuidance: buildFallbackGuidance(profiles, copy, dict, winLabel, isHi),
    iaqHacks: copy.iaqHacks,
    mythBusters: copy.mythBusters,
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

/**
 * Render all 4 Action Plan tab panels + print sheet from API plan or deterministic fallback.
 * @param {Record<string, HTMLElement | null>} refs
 * @param {Record<string, unknown>} state
 * @param {(anchorId: string, checked: boolean) => void} onToggleCheck
 */
export function renderPlanSections(refs, state, onToggleCheck) {
  const lang = state.lang === 'hi' ? 'hi' : 'en';
  const dict = getStrings(lang);
  const hasMatchingGemini = state.plan?.lang === lang && state.planSource === 'gemini';
  const plan = state.plan?.lang === lang
    ? state.plan
    : buildFallbackPlan(state.snapshot, state.impact, state.household, lang);

  setText(refs['plan-source-badge'], hasMatchingGemini ? dict.sourceGemini : dict.sourceFallback);
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

/**
 * Render quick-ask chips (only when language changes) and chat thread with auto-scroll.
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
  const msgBox = refs['copilot-messages'];
  if (msgBox) {
    msgBox.replaceChildren(...(messages || []).map(buildChatBubble));
    msgBox.scrollTop = msgBox.scrollHeight;
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
