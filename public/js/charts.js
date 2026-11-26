/**
 * @fileoverview Accessible non-interactive SVG chart & segmented dose bar builders
 * plus synchronized 24h HTML table population (100% XSS-safe, zero inline styles).
 */

import { formatNumber } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PLOT = Object.freeze({ left: 56, right: 696, top: 42, bottom: 266, width: 640, height: 224 });

function svgEl(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  if (text !== null) {
    node.textContent = String(text);
  }
  return node;
}

function createHatchPattern(id, bgHex, stripeHex, angle) {
  const pattern = svgEl('pattern', {
    id,
    width: 8,
    height: 8,
    patternUnits: 'userSpaceOnUse',
    patternTransform: `rotate(${angle})`
  });
  pattern.append(svgEl('rect', { width: 8, height: 8, fill: bgHex }));
  pattern.append(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: stripeHex, 'stroke-width': 2.2, 'stroke-opacity': 0.35 }));
  return pattern;
}

function buildChartDefs() {
  const defs = svgEl('defs');
  defs.append(createHatchPattern('vent-hatch', '#ECF7F0', '#1E7E45', 45));
  defs.append(createHatchPattern('peak-hatch', '#FDECEC', '#B91C1C', -45));
  return defs;
}

function resolveHourAt(entry, idx) {
  const raw = Number(entry?.istHour);
  return Number.isFinite(raw) ? ((Math.trunc(raw) % 24) + 24) % 24 : idx % 24;
}

function collectWindowRuns(hourly, startHour, endHour) {
  const span = (((endHour - startHour) % 24) + 24) % 24 || 2;
  const runs = [];
  let activeStart = -1;

  for (let i = 0; i < hourly.length; i += 1) {
    const hr = resolveHourAt(hourly[i], i);
    const inside = ((hr - startHour + 24) % 24) < span;
    if (inside && activeStart < 0) {
      activeStart = i;
    } else if (!inside && activeStart >= 0) {
      runs.push([activeStart, i - 1]);
      activeStart = -1;
    }
  }
  if (activeStart >= 0) {
    runs.push([activeStart, hourly.length - 1]);
  }
  return runs;
}

function drawBandRun(svg, run, totalHours, colorHex, patternId, labelText, yLabel) {
  const denom = Math.max(totalHours - 1, 1);
  const [startIdx, endIdx] = run;
  const xStart = PLOT.left + (startIdx / denom) * PLOT.width;
  const rawEndX = endIdx + 1 < totalHours
    ? PLOT.left + ((endIdx + 1) / denom) * PLOT.width
    : PLOT.right;
  const rectW = Math.min(PLOT.right - xStart, Math.max(22, rawEndX - xStart));
  const clampedX = Math.max(PLOT.left, Math.min(PLOT.right - rectW, xStart));

  svg.append(svgEl('rect', {
    x: clampedX.toFixed(1),
    y: PLOT.top,
    width: rectW.toFixed(1),
    height: PLOT.height,
    fill: `url(#${patternId})`,
    stroke: colorHex,
    'stroke-width': 1
  }));

  if (labelText) {
    const labelX = Math.min(PLOT.right - 56, Math.max(PLOT.left + 56, clampedX + rectW / 2));
    svg.append(svgEl('text', {
      x: labelX.toFixed(1),
      y: yLabel,
      'text-anchor': 'middle',
      fill: colorHex,
      'font-size': 12.5,
      'font-weight': 600
    }, labelText));
  }
}

function drawWindowBand(svg, win, hourly, colorHex, patternId, yLabel) {
  if (!win) {
    return;
  }
  const start = Number.isFinite(Number(win.startHour)) ? ((Math.trunc(Number(win.startHour)) % 24) + 24) % 24 : 13;
  const end = Number.isFinite(Number(win.endHour)) ? ((Math.trunc(Number(win.endHour)) % 24) + 24) % 24 : (start + 2) % 24;
  const runs = collectWindowRuns(hourly, start, end);
  const labelText = win.label ? String(win.label) : '';

  for (const [idx, run] of runs.entries()) {
    drawBandRun(svg, run, hourly.length, colorHex, patternId, idx === 0 ? labelText : '', yLabel);
  }
}

function collectAxisTickIndices(hourly) {
  const indices = [];
  for (let i = 0; i < hourly.length; i += 1) {
    if (resolveHourAt(hourly[i], i) % 3 === 0) {
      indices.push(i);
    }
  }
  if (indices.length >= 2) {
    return indices;
  }
  return hourly.length > 1 ? [0, hourly.length - 1] : [0];
}

function drawGridAndAxes(svg, maxY, hourly) {
  for (const val of [0, Math.round(maxY / 2), maxY]) {
    const y = PLOT.bottom - (val / maxY) * PLOT.height;
    svg.append(svgEl('line', { x1: PLOT.left, y1: y.toFixed(1), x2: PLOT.right, y2: y.toFixed(1), stroke: '#CBD2D9', 'stroke-width': 1 }));
    svg.append(svgEl('text', { x: PLOT.left - 8, y: (y + 4).toFixed(1), 'text-anchor': 'end', fill: '#4A5565', 'font-size': 13 }, val));
  }

  const thresholdY = PLOT.bottom - (Math.min(90, maxY) / maxY) * PLOT.height;
  svg.append(svgEl('line', {
    x1: PLOT.left,
    y1: thresholdY.toFixed(1),
    x2: PLOT.right,
    y2: thresholdY.toFixed(1),
    stroke: '#9A6700',
    'stroke-width': 1.5,
    'stroke-dasharray': '5 4'
  }));
  svg.append(svgEl('text', { x: PLOT.right - 4, y: (thresholdY - 6).toFixed(1), 'text-anchor': 'end', fill: '#593900', 'font-size': 12.5, 'font-weight': 600 }, '90 µg/m³'));

  const denom = Math.max(hourly.length - 1, 1);
  for (const idx of collectAxisTickIndices(hourly)) {
    const hr = resolveHourAt(hourly[idx], idx);
    const x = Math.min(PLOT.right - 14, Math.max(PLOT.left + 14, PLOT.left + (idx / denom) * PLOT.width));
    svg.append(svgEl('text', { x: x.toFixed(1), y: 292, 'text-anchor': 'middle', fill: '#4A5565', 'font-size': 13 }, `${String(hr).padStart(2, '0')}:00`));
  }
}

function drawLegend(svg, isHi) {
  const items = [
    { x: 56, fill: '#0B57D0', stroke: '#0B57D0', label: 'PM2.5 (µg/m³)' },
    { x: 196, fill: 'url(#vent-hatch)', stroke: '#1E7E45', label: isHi ? 'दोपहर वेंटिलेशन समय' : 'Daytime flush window' },
    { x: 400, fill: 'url(#peak-hatch)', stroke: '#B91C1C', label: isHi ? 'चरम धुंध घंटे' : 'Peak smog hours' }
  ];
  for (const item of items) {
    svg.append(svgEl('rect', { x: item.x, y: 10, width: 14, height: 14, rx: 3, fill: item.fill, stroke: item.stroke, 'stroke-width': 1 }));
    svg.append(svgEl('text', { x: item.x + 20, y: 22, fill: '#364152', 'font-size': 13, 'font-weight': 500 }, item.label));
  }
}

function drawCurveAndMarker(svg, values, hourly, maxY, currentHour) {
  const denom = Math.max(hourly.length - 1, 1);
  const pts = values.map((v, idx) => {
    const x = PLOT.left + (idx / denom) * PLOT.width;
    const y = PLOT.bottom - (v / maxY) * PLOT.height;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });

  const linePts = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPath = `M${pts[0][0]},${PLOT.bottom} L${pts.map(([x, y]) => `${x},${y}`).join(' L')} L${pts[pts.length - 1][0]},${PLOT.bottom} Z`;

  svg.append(svgEl('path', { d: areaPath, fill: '#0B57D0', 'fill-opacity': 0.08 }));
  svg.append(svgEl('polyline', { points: linePts, fill: 'none', stroke: '#0B57D0', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));

  const foundIdx = hourly.findIndex((h, i) => resolveHourAt(h, i) === currentHour);
  const activePt = pts[foundIdx >= 0 ? foundIdx : 0];
  svg.append(svgEl('circle', { cx: activePt[0], cy: activePt[1], r: 6, fill: '#0B57D0', stroke: '#FFFFFF', 'stroke-width': 2 }));
}

function buildChartTitleDesc(snapshot, values, isHi) {
  const city = snapshot.location?.city || 'City';
  const ventLabel = snapshot.ventilationWindow?.label || '';
  const peakLabel = snapshot.peakSmogWindow?.label || '';
  const titleText = isHi ? `${city} 24-घंटे PM2.5 वक्र` : `${city} 24-hour PM2.5 curve`;
  const descText = isHi
    ? `न्यूनतम ${Math.min(...values)} और अधिकतम ${Math.max(...values)} µg/m³। दोपहर वेंटिलेशन समय ${ventLabel}।`
    : `PM2.5 ranges from ${Math.min(...values)} to ${Math.max(...values)} µg/m³. Best daytime window ${ventLabel}; peak smog ${peakLabel}.`;
  return [
    svgEl('title', { id: 'pm25-chart-title' }, titleText),
    svgEl('desc', { id: 'pm25-chart-desc' }, descText)
  ];
}

/**
 * Render non-interactive role="img" 24h PM2.5 curve SVG with hatch bands & window callouts.
 * @param {SVGElement} svg
 * @param {Record<string, unknown>} snapshot
 * @param {'en' | 'hi'} lang
 */
export function renderPm25Chart(svg, snapshot, lang) {
  const hourly = snapshot && Array.isArray(snapshot.hourly24h) ? snapshot.hourly24h.slice(0, 24) : [];
  if (!svg || hourly.length === 0) {
    return;
  }

  const isHi = lang === 'hi';
  const values = hourly.map((h) => Math.max(0, Number(h.pm25) || 0));
  const maxY = Math.ceil(Math.max(...values, 120) / 50) * 50;
  const [titleNode, descNode] = buildChartTitleDesc(snapshot, values, isHi);

  svg.setAttribute('viewBox', '0 0 720 314');
  svg.replaceChildren(titleNode, descNode, buildChartDefs());
  drawLegend(svg, isHi);
  drawWindowBand(svg, snapshot.ventilationWindow, hourly, '#0F4726', 'vent-hatch', 58);
  drawWindowBand(svg, snapshot.peakSmogWindow, hourly, '#701111', 'peak-hatch', 76);
  drawGridAndAxes(svg, maxY, hourly);

  const curHour = Number.isFinite(Number(snapshot.current?.istHour)) ? Number(snapshot.current.istHour) : resolveHourAt(hourly[0], 0);
  drawCurveAndMarker(svg, values, hourly, maxY, curHour);
}

const GRAP_HI_MAP = Object.freeze({
  'Stage I': 'चरण I',
  'Stage II': 'चरण II',
  'Stage III': 'चरण III',
  'Stage IV (Severe+)': 'चरण IV (अति गंभीर)'
});

function formatCategoryGrap(item, lang) {
  const baseCat = (lang === 'hi' ? item.categoryHi || item.category : item.category) || '—';
  if (!item.grapStage) {
    return baseCat;
  }
  const stage = lang === 'hi' ? (GRAP_HI_MAP[item.grapStage] || item.grapStage) : item.grapStage;
  return `${baseCat} (${stage})`;
}

function buildHourlyRow(item, idx, lang) {
  const tr = document.createElement('tr');
  const hr = resolveHourAt(item, idx);
  const cells = [
    `${String(hr).padStart(2, '0')}:00`,
    formatNumber(Math.round(Number(item.pm25) || 0), lang),
    formatNumber(Math.round(Number(item.naqi) || 0), lang),
    formatNumber(Math.round(Number(item.pblMeters) || 0), lang),
    formatNumber(Math.round(Number(item.ventilationCoefficient) || 0), lang),
    formatCategoryGrap(item, lang)
  ];
  for (const val of cells) {
    const td = document.createElement('td');
    td.textContent = String(val);
    tr.append(td);
  }
  return tr;
}

/**
 * Populate accessible 24-hour forecast table rows with textContent only.
 * @param {HTMLElement} tbody
 * @param {Record<string, unknown>} snapshot
 * @param {'en' | 'hi'} lang
 */
export function renderHourlyDataTable(tbody, snapshot, lang) {
  if (!tbody || !snapshot || !Array.isArray(snapshot.hourly24h)) {
    return;
  }
  const rows = snapshot.hourly24h.map((item, idx) => buildHourlyRow(item, idx, lang));
  tbody.replaceChildren(...rows);
}

function buildDoseSlices(dose, isHi) {
  return [
    { val: Math.max(0, Number(dose.commuteOutdoor) || 0), fill: '#0B57D0', stroke: '#0B57D0', label: isHi ? 'बाहर / सफर से संपर्क' : 'Outdoor / Commute' },
    { val: Math.max(0, Number(dose.cookingIndoor) || 0), fill: 'url(#dose-cook-hatch)', stroke: '#B45309', label: isHi ? 'रसोई / इनडोर धुआं स्रोत' : 'Cooking & Indoor Sources' },
    { val: Math.max(0, Number(dose.baselineIndoor) || 0), fill: 'url(#dose-base-hatch)', stroke: '#4A5565', label: isHi ? 'सामान्य इनडोर हवा' : 'Baseline Indoor Air' }
  ];
}

function drawDoseTrackAndSlices(svg, slices, totalRaw) {
  svg.append(svgEl('rect', { x: 16, y: 14, width: 608, height: 34, rx: 4, fill: '#F1EFEA', stroke: '#CBD2D9', 'stroke-width': 1 }));
  if (totalRaw <= 0) {
    return;
  }
  let cursor = 16;
  for (const s of slices) {
    const segW = (s.val / totalRaw) * 608;
    if (segW >= 1) {
      svg.append(svgEl('rect', { x: cursor.toFixed(1), y: 14, width: segW.toFixed(1), height: 34, fill: s.fill, stroke: s.stroke, 'stroke-width': 1 }));
      cursor += segW;
    }
  }
}

/**
 * Render the 3-slice Segmented Lung-Dose SVG Bar with stacked non-overlapping legend rows.
 * @param {SVGElement} svg
 * @param {Record<string, unknown>} impact
 * @param {'en' | 'hi'} lang
 */
export function renderDoseBarSvg(svg, impact, lang) {
  if (!svg || !impact || !impact.dose) {
    return;
  }
  const isHi = lang === 'hi';
  const slices = buildDoseSlices(impact.dose, isHi);
  const totalRaw = slices.reduce((sum, s) => sum + s.val, 0);

  const defs = svgEl('defs');
  defs.append(createHatchPattern('dose-cook-hatch', '#FFF1E6', '#B45309', 45));
  defs.append(createHatchPattern('dose-base-hatch', '#F1EFEA', '#364152', -45));

  const title = svgEl('title', { id: 'dose-bar-title' }, isHi ? '3-भाग फेफड़ों की PM2.5 खुराक' : '3-slice daily inhaled PM2.5 dose breakdown');
  const desc = svgEl('desc', { id: 'dose-bar-desc' }, slices.map((s) => `${s.label}: ${s.val} µg/day`).join('; '));

  svg.setAttribute('viewBox', '0 0 640 156');
  svg.replaceChildren(title, desc, defs);
  drawDoseTrackAndSlices(svg, slices, totalRaw);

  let legendY = 74;
  for (const s of slices) {
    const pct = totalRaw > 0 ? Math.round((s.val / totalRaw) * 100) : 0;
    const unit = isHi ? 'µg/दिन' : 'µg/day';
    svg.append(svgEl('rect', { x: 16, y: legendY - 12, width: 16, height: 16, rx: 3, fill: s.fill, stroke: s.stroke, 'stroke-width': 1 }));
    svg.append(svgEl('text', { x: 40, y: legendY + 1, fill: '#141B24', 'font-size': 14, 'font-weight': 600 }, `${s.label}: ${formatNumber(s.val, lang)} ${unit} (${pct}%)`));
    legendY += 28;
  }
}
