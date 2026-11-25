/**
 * @fileoverview Accessible non-interactive SVG chart & segmented dose bar builders
 * plus synchronized 24h HTML table population (100% XSS-safe, zero inline styles).
 */

import { formatNumber } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

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

function drawWindowBand(svg, win, totalHours, colorHex, patternId, yLabel) {
  const left = 54;
  const width = 642;
  const top = 38;
  const height = 206;
  const rawStart = win && Number.isFinite(win.startHour) ? win.startHour : 13;
  const rawEnd = win && Number.isFinite(win.endHour) ? win.endHour : rawStart + 2;
  const start = Math.max(0, Math.min(totalHours - 1, rawStart));
  const end = Math.max(start + 1, Math.min(totalHours, rawEnd));
  const x1 = left + (start / Math.max(totalHours - 1, 1)) * width;
  const x2 = left + (end / Math.max(totalHours - 1, 1)) * width;
  const rectW = Math.max(18, x2 - x1);

  svg.append(svgEl('rect', {
    x: x1.toFixed(1),
    y: top,
    width: rectW.toFixed(1),
    height,
    fill: `url(#${patternId})`,
    stroke: colorHex,
    'stroke-width': 1
  }));

  const labelText = win && win.label ? String(win.label) : '';
  const labelX = Math.min(640, Math.max(left + 44, x1 + rectW / 2));
  svg.append(svgEl('text', {
    x: labelX.toFixed(1),
    y: yLabel,
    'text-anchor': 'middle',
    fill: colorHex,
    'font-size': 11,
    'font-weight': 600
  }, labelText));
}

function drawGridAndAxes(svg, maxY, totalHours) {
  const left = 54;
  const right = 696;
  const top = 38;
  const bottom = 244;
  const height = bottom - top;

  for (const val of [0, Math.round(maxY / 2), maxY]) {
    const y = bottom - (val / maxY) * height;
    svg.append(svgEl('line', { x1: left, y1: y.toFixed(1), x2: right, y2: y.toFixed(1), stroke: '#CBD2D9', 'stroke-width': 1 }));
    svg.append(svgEl('text', { x: left - 8, y: (y + 4).toFixed(1), 'text-anchor': 'end', fill: '#4A5565', 'font-size': 11 }, val));
  }

  const thresholdY = bottom - (Math.min(90, maxY) / maxY) * height;
  svg.append(svgEl('line', {
    x1: left,
    y1: thresholdY.toFixed(1),
    x2: right,
    y2: thresholdY.toFixed(1),
    stroke: '#9A6700',
    'stroke-width': 1.5,
    'stroke-dasharray': '5 4'
  }));
  svg.append(svgEl('text', { x: right - 4, y: (thresholdY - 5).toFixed(1), 'text-anchor': 'end', fill: '#593900', 'font-size': 11, 'font-weight': 600 }, '90 µg/m³'));

  for (const hr of [0, 3, 6, 9, 12, 15, 18, 21]) {
    const x = left + (hr / Math.max(totalHours - 1, 1)) * (right - left);
    svg.append(svgEl('text', { x: x.toFixed(1), y: 266, 'text-anchor': 'middle', fill: '#4A5565', 'font-size': 11 }, `${String(hr).padStart(2, '0')}:00`));
  }
}

function drawLegend(svg, isHi) {
  const items = [
    { x: 54, fill: '#0B57D0', stroke: '#0B57D0', label: 'PM2.5 (µg/m³)' },
    { x: 185, fill: 'url(#vent-hatch)', stroke: '#1E7E45', label: isHi ? 'दोपहर वेंटिलेशन' : 'Daytime flush window' },
    { x: 365, fill: 'url(#peak-hatch)', stroke: '#B91C1C', label: isHi ? 'चरम धुंध घंटे' : 'Peak smog hours' }
  ];
  for (const item of items) {
    svg.append(svgEl('rect', { x: item.x, y: 8, width: 12, height: 12, rx: 3, fill: item.fill, stroke: item.stroke, 'stroke-width': 1 }));
    svg.append(svgEl('text', { x: item.x + 18, y: 18, fill: '#364152', 'font-size': 11, 'font-weight': 500 }, item.label));
  }
}

function drawCurveAndMarker(svg, values, hourly, maxY, currentHour) {
  const left = 54;
  const width = 642;
  const bottom = 244;
  const height = 206;
  const denom = Math.max(hourly.length - 1, 1);

  const pts = values.map((v, idx) => {
    const x = left + (idx / denom) * width;
    const y = bottom - (v / maxY) * height;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });

  const linePts = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPath = `M${pts[0][0]},${bottom} L${pts.map(([x, y]) => `${x},${y}`).join(' L')} L${pts[pts.length - 1][0]},${bottom} Z`;

  svg.append(svgEl('path', { d: areaPath, fill: '#0B57D0', 'fill-opacity': 0.08 }));
  svg.append(svgEl('polyline', { points: linePts, fill: 'none', stroke: '#0B57D0', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));

  const foundIdx = hourly.findIndex((h, i) => (Number.isFinite(h.istHour) ? h.istHour : i) === currentHour);
  const activePt = pts[foundIdx >= 0 ? foundIdx : 0];
  svg.append(svgEl('circle', { cx: activePt[0], cy: activePt[1], r: 5.5, fill: '#0B57D0', stroke: '#FFFFFF', 'stroke-width': 2 }));
}

function buildChartTitleDesc(snapshot, values, isHi) {
  const city = snapshot.location?.city || 'City';
  const ventLabel = snapshot.ventilationWindow?.label || '';
  const peakLabel = snapshot.peakSmogWindow?.label || '';
  const titleText = isHi ? `${city} 24-घंटे PM2.5 वक्र` : `${city} 24-hour PM2.5 curve`;
  const descText = isHi
    ? `न्यूनतम ${Math.min(...values)} और अधिकतम ${Math.max(...values)} µg/m³। दोपहर वेंटिलेशन खिड़की ${ventLabel}।`
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

  svg.replaceChildren(titleNode, descNode, buildChartDefs());
  drawLegend(svg, isHi);
  drawWindowBand(svg, snapshot.ventilationWindow, hourly.length, '#0F4726', 'vent-hatch', 52);
  drawWindowBand(svg, snapshot.peakSmogWindow, hourly.length, '#701111', 'peak-hatch', 66);
  drawGridAndAxes(svg, maxY, hourly.length);

  const curHour = Number.isFinite(snapshot.current?.istHour) ? snapshot.current.istHour : 8;
  drawCurveAndMarker(svg, values, hourly, maxY, curHour);
}

function buildHourlyRow(item, idx, lang) {
  const tr = document.createElement('tr');
  const hr = Number.isFinite(item.istHour) ? item.istHour : idx;
  const baseCat = lang === 'hi' ? item.categoryHi || item.category : item.category;
  const catText = baseCat || '—';
  const grap = item.grapStage ? `${catText} (${item.grapStage})` : catText;

  const cells = [
    `${String(hr).padStart(2, '0')}:00`,
    formatNumber(Math.round(Number(item.pm25) || 0), lang),
    formatNumber(Math.round(Number(item.naqi) || 0), lang),
    formatNumber(Math.round(Number(item.pblMeters) || 0), lang),
    formatNumber(Math.round(Number(item.ventilationCoefficient) || 0), lang),
    grap
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
    {
      val: Number(dose.commuteOutdoor) || 0,
      fill: '#0B57D0',
      stroke: '#0B57D0',
      label: isHi ? 'बाहर/सफर' : 'Outdoor/Commute'
    },
    {
      val: Number(dose.cookingIndoor) || 0,
      fill: 'url(#dose-cook-hatch)',
      stroke: '#B45309',
      label: isHi ? 'रसोई/इनडोर धुआं' : 'Cooking/Indoor Sources'
    },
    {
      val: Number(dose.baselineIndoor) || 0,
      fill: 'url(#dose-base-hatch)',
      stroke: '#4A5565',
      label: isHi ? 'सामान्य इनडोर' : 'Baseline Indoor'
    }
  ];
}

/**
 * Render the 3-slice Segmented Lung-Dose SVG Bar with distinct SVG fills/patterns.
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
  const total = Math.max(1, Number(impact.dose.totalMitigatedUg) || 0);

  const defs = svgEl('defs');
  defs.append(createHatchPattern('dose-cook-hatch', '#FFF1E6', '#B45309', 45));
  defs.append(createHatchPattern('dose-base-hatch', '#F1EFEA', '#364152', -45));

  const title = svgEl('title', { id: 'dose-bar-title' }, isHi ? '3-भाग फेफड़ों की PM2.5 खुराक' : '3-slice daily inhaled PM2.5 dose breakdown');
  const desc = svgEl('desc', { id: 'dose-bar-desc' }, slices.map((s) => `${s.label}: ${s.val} µg/day`).join('; '));

  svg.replaceChildren(title, desc, defs);

  let cursor = 16;
  for (const s of slices) {
    const segW = Math.max(0, (s.val / total) * 608);
    if (segW >= 1) {
      svg.append(svgEl('rect', { x: cursor.toFixed(1), y: 18, width: segW.toFixed(1), height: 36, fill: s.fill, stroke: s.stroke, 'stroke-width': 1 }));
      cursor += segW;
    }
  }

  let legendX = 16;
  for (const s of slices) {
    const pct = Math.round((s.val / total) * 100);
    svg.append(svgEl('rect', { x: legendX, y: 74, width: 14, height: 14, rx: 3, fill: s.fill, stroke: s.stroke, 'stroke-width': 1 }));
    svg.append(svgEl('text', { x: legendX + 20, y: 85, fill: '#141B24', 'font-size': 12, 'font-weight': 600 }, `${s.label}: ${formatNumber(s.val, lang)} µg (${pct}%)`));
    legendX += 206;
  }
}
