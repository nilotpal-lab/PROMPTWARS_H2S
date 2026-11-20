/**
 * @fileoverview Tactical Airspace Radar Display for Indian Skies.
 * Renders Survey-of-India compliant vector geometry, FIR boundaries,
 * real-time flight arcs, active aircraft, and airport telemetry.
 *
 * Adheres to WCAG 2.1 AAA accessibility standards and Google clean code principles.
 */

import { state } from './state.js';
import { toHHMM } from '/engine.js';
import {
  VB_WIDTH,
  VB_HEIGHT,
  project,
  INDIA_MAINLAND,
  INDIA_ISLANDS,
  SRI_LANKA,
  AIRSPACE_FIRS
} from './india_geo.js';

/** Radar layout and calculation constants */
const RADAR_CENTER_LNG = 82.5;
const RADAR_CENTER_LAT = 22.5;
const TOOLTIP_OFFSET_PX = 12;
const TOOLTIP_MARGIN_PX = 10;
const MAX_CURVATURE_OFFSET = 46;
const MIN_CURVATURE_OFFSET = 12;
const CURVATURE_FACTOR = 0.14;

/**
 * Tactical Airspace Radar Display for Indian Skies.
 */
export class NetworkMap {
  /**
   * @param {HTMLElement} containerEl - DOM mount point.
   * @param {HTMLElement} tooltipEl - Tooltip floating overlay element.
   */
  constructor(containerEl, tooltipEl) {
    if (!containerEl) throw new Error('NetworkMap requires a valid container element');
    this.container = containerEl;
    this.tooltip = tooltipEl;
    this.svg = null;
    this.airportsGroup = null;
    this.arcsGroup = null;
    this.planesGroup = null;
    this.firsGroup = null;
    this.airportPositions = {};
    this.activeFilter = 'all'; // 'all' | 'delayed' | 'cancelled'

    this.initSvg();
    this.bindEvents();
  }

  /**
   * Initializes SVG canvas, background radar grids, FIR sectors, and filters.
   * @returns {void}
   */
  initSvg() {
    this.container.innerHTML = `
      <div class="radar-top-controls">
        <div class="radar-filters font-mono" role="group" aria-label="Flight Route Filter">
          <span class="filter-label">ROUTE VECTORS:</span>
          <button type="button" class="radar-filter-btn active" data-filter="all" aria-pressed="true" aria-label="Show all 70 flight routes">
            <span class="filter-dot dot-all" aria-hidden="true"></span>
            <span>ALL ROUTES</span>
          </button>
          <button type="button" class="radar-filter-btn btn-warn" data-filter="delayed" aria-pressed="false" aria-label="Show delayed flight routes only">
            <span class="filter-dot dot-warn" aria-hidden="true"></span>
            <span>DELAYED ONLY</span>
          </button>
          <button type="button" class="radar-filter-btn btn-alert" data-filter="cancelled" aria-pressed="false" aria-label="Show cancelled flight routes only">
            <span class="filter-dot dot-alert" aria-hidden="true"></span>
            <span>CANCELLED ONLY</span>
          </button>
        </div>
        <div class="radar-coords-readout font-mono" id="radar-live-coords" role="note" aria-label="Airspace radar coordinates: 82.5 degrees East, 22.5 degrees North">
          <span class="coords-beacon" aria-hidden="true"></span>
          CENTRAL RADAR &bull; ${RADAR_CENTER_LNG}&deg;E / ${RADAR_CENTER_LAT}&deg;N
        </div>
      </div>

      <svg class="radar-viewport-svg" viewBox="0 0 ${VB_WIDTH} ${VB_HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="radar-map-title radar-map-desc">
        <title id="radar-map-title">Tactical Radar Map of Indian Airspace</title>
        <desc id="radar-map-desc">Interactive geographic radar view of Indian airspace showing 16 major hub airports, flight routes, active aircraft, and FIR sectors.</desc>
        <defs>
          <!-- Tactical Radar Atmospheric Gradient -->
          <radialGradient id="airspace-bg" cx="50%" cy="46%" r="65%">
            <stop offset="0%" stop-color="#0c1629"/>
            <stop offset="55%" stop-color="#070d18"/>
            <stop offset="100%" stop-color="#04060c"/>
          </radialGradient>

          <!-- Glow Filter for Radar Tracks -->
          <filter id="track-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.0" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <!-- Coastal Landmass Depth Filter -->
          <filter id="land-shadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="2.0" stdDeviation="3.5" flood-color="#01040a" flood-opacity="0.9"/>
          </filter>

          <!-- Radar Sweep Rotating Gradient -->
          <linearGradient id="sweep-beam" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.10"/>
            <stop offset="70%" stop-color="#38bdf8" stop-opacity="0.02"/>
            <stop offset="100%" stop-color="transparent" stop-opacity="0"/>
          </linearGradient>
        </defs>

        <!-- Airspace Base Grid -->
        <rect width="${VB_WIDTH}" height="${VB_HEIGHT}" fill="url(#airspace-bg)" />

        <!-- Geographical Coordinate Grid (Graticule) -->
        <g class="geo-grid" opacity="0.18">
          ${[10, 15, 20, 25, 30, 35].map(lat => {
            const y = project(lat, RADAR_CENTER_LNG).y;
            return `
              <line x1="20" y1="${y}" x2="${VB_WIDTH - 20}" y2="${y}" stroke="#38bdf8" stroke-dasharray="2,8" />
              <text x="24" y="${y - 4}" fill="#64748b" font-size="8.5" font-family="monospace">${lat}°N</text>
            `;
          }).join('')}
          ${[70, 75, 80, 85, 90, 95].map(lng => {
            const x = project(RADAR_CENTER_LAT, lng).x;
            return `
              <line x1="${x}" y1="20" x2="${x}" y2="${VB_HEIGHT - 20}" stroke="#38bdf8" stroke-dasharray="2,8" />
              <text x="${x + 4}" y="${VB_HEIGHT - 24}" fill="#64748b" font-size="8.5" font-family="monospace">${lng}°E</text>
            `;
          }).join('')}
        </g>

        <!-- Tactical Range Rings (Centered near central airspace) -->
        <g class="tactical-rings" opacity="0.08" stroke="#38bdf8" fill="none">
          <circle cx="280" cy="400" r="120" stroke-dasharray="3,6" />
          <circle cx="280" cy="400" r="240" stroke-dasharray="3,8" />
          <circle cx="280" cy="400" r="360" stroke-dasharray="4,10" />
        </g>

        <!-- Maritime Context (Sri Lanka) -->
        <path class="sri-lanka-path" d="${this.buildPolyPath(SRI_LANKA)}" fill="#0b1322" stroke="#1c2c47" stroke-width="0.9" opacity="0.75" />

        <!-- High-Precision Official India Landmass -->
        <g class="landmass-group" filter="url(#land-shadow)">
          <!-- Coastal Shelf Aura -->
          <path class="india-shelf" d="${this.buildPolyPath(INDIA_MAINLAND)}" fill="none" stroke="#0ea5e9" stroke-width="5.0" opacity="0.12" />
          <!-- Mainland -->
          <path class="subcontinent-path" d="${this.buildPolyPath(INDIA_MAINLAND)}" fill="#0e172a" stroke="#253a5e" stroke-width="1.4" />
          <!-- Islands (Andaman, Nicobar, Lakshadweep) -->
          ${INDIA_ISLANDS.map(isle => `
            <path class="island-path" d="${this.buildPolyPath(isle)}" fill="#0e172a" stroke="#253a5e" stroke-width="1.1" />
          `).join('')}
        </g>

        <!-- Airspace Flight Information Regions (FIRs) -->
        <g class="firs-layer"></g>

        <!-- Flight Arcs Layer -->
        <g class="arcs-layer"></g>

        <!-- Active Flying Planes Layer -->
        <g class="planes-layer"></g>

        <!-- Airports Layer -->
        <g class="airports-layer"></g>
      </svg>
    `;

    this.svg = this.container.querySelector('svg');
    if (this.svg) {
      this.firsGroup = this.svg.querySelector('.firs-layer');
      this.arcsGroup = this.svg.querySelector('.arcs-layer');
      this.planesGroup = this.svg.querySelector('.planes-layer');
      this.airportsGroup = this.svg.querySelector('.airports-layer');
    }

    this.renderFirs();
    this.attachFilterEvents();
  }

  /**
   * Converts polygon coordinates to an SVG closed path string.
   * @param {Array<[number, number]>} coords - Latitude/longitude coordinate pairs.
   * @returns {string} SVG path string.
   */
  buildPolyPath(coords) {
    if (!coords || coords.length === 0) return '';
    const points = coords.map(([lat, lng]) => project(lat, lng));
    return 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ') + ' Z';
  }

  /**
   * Converts polyline coordinates to an SVG line path string.
   * @param {Array<[number, number]>} coords - Latitude/longitude coordinate pairs.
   * @returns {string} SVG path string.
   */
  buildLinePath(coords) {
    if (!coords || coords.length === 0) return '';
    const points = coords.map(([lat, lng]) => project(lat, lng));
    return 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ');
  }

  /**
   * Renders FIR sector boundaries and ICAO callsign labels.
   * @returns {void}
   */
  renderFirs() {
    if (!this.firsGroup) return;
    let html = '';
    for (const fir of AIRSPACE_FIRS) {
      const lineD = this.buildLinePath(fir.boundary);
      const lp = project(fir.labelPos[0], fir.labelPos[1]);
      html += `
        <g class="fir-sector" data-fir="${fir.code}">
          <path d="${lineD}" fill="none" stroke="#38bdf8" stroke-width="0.8" stroke-dasharray="3,5" opacity="0.25" />
          <text x="${lp.x}" y="${lp.y}" fill="#38bdf8" font-size="8" font-weight="700" font-family="monospace" opacity="0.40" text-anchor="middle">
            ${fir.code} &bull; ${fir.name}
          </text>
        </g>
      `;
    }
    this.firsGroup.innerHTML = html;
  }

  /**
   * Attaches route filter click events.
   * @returns {void}
   */
  attachFilterEvents() {
    const filterBtns = this.container.querySelectorAll('.radar-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        this.activeFilter = btn.dataset.filter || 'all';
        this.updateHighlights();
      });
    });
  }

  /**
   * Binds global state updates.
   * @returns {void}
   */
  bindEvents() {
    state.on('simulation_updated', () => this.render());
    state.on('flight_selected', () => this.updateHighlights());
    state.on('airport_selected', () => this.updateHighlights());
    state.on('time_updated', () => this.renderPlanes());
  }

  /**
   * Renders radar elements on simulation update.
   * @returns {void}
   */
  render() {
    if (!state.network || !state.simulation) return;

    for (const ap of state.network.airports) {
      this.airportPositions[ap.id] = project(ap.lat, ap.lng);
    }

    this.renderArcs();
    this.renderAirports();
    this.renderPlanes();
    this.updateHighlights();
  }

  /**
   * Renders parabolic flight trajectory arcs across the network.
   * @returns {void}
   */
  renderArcs() {
    if (!this.arcsGroup) return;
    const flights = state.simulation.flights || [];

    let html = '';
    for (const f of flights) {
      const p1 = this.airportPositions[f.origin];
      const p2 = this.airportPositions[f.destination];
      if (!p1 || !p2) continue;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) continue;

      // Tactical curve (counter-clockwise normal)
      const nx = -dy / dist;
      const ny = dx / dist;
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;

      const offset = Math.min(MAX_CURVATURE_OFFSET, Math.max(MIN_CURVATURE_OFFSET, dist * CURVATURE_FACTOR));
      const cx = Math.round(mx + nx * offset);
      const cy = Math.round(my + ny * offset);

      const pathD = `M ${p1.x} ${p1.y} Q ${cx} ${cy}, ${p2.x} ${p2.y}`;

      let strokeClass = 'arc-ontime';
      let strokeColor = 'rgba(56, 189, 248, 0.35)';
      let dashAttr = '';

      if (f.status === 'delayed') {
        strokeClass = 'arc-delayed';
        strokeColor = '#f59e0b';
      } else if (f.status === 'cancelled') {
        strokeClass = 'arc-cancelled';
        strokeColor = '#ff7588';
        dashAttr = 'stroke-dasharray="4,4"';
      }

      html += `
        <g class="trajectory-group" data-flight-id="${f.flight_id}" data-origin="${f.origin}" data-destination="${f.destination}" data-status="${f.status}" tabindex="0" role="button" aria-label="Flight ${f.flight_id}: ${f.origin} to ${f.destination}, ${f.status}">
          <path class="trajectory-hitbox" d="${pathD}" fill="none" stroke="transparent" stroke-width="12" style="cursor: pointer;" />
          <path class="trajectory-line ${strokeClass}" id="arc-${f.flight_id}" d="${pathD}" fill="none" stroke="${strokeColor}" ${dashAttr} />
        </g>
      `;
    }

    this.arcsGroup.innerHTML = html;

    const groups = this.arcsGroup.querySelectorAll('.trajectory-group');
    groups.forEach(g => {
      const fid = g.getAttribute('data-flight-id');
      if (!fid) return;
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectFlight(fid);
      });
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          state.selectFlight(fid);
        }
      });

      g.addEventListener('mouseenter', (e) => this.showFlightTooltip(e, fid));
      g.addEventListener('mousemove', (e) => this.moveTooltip(e));
      g.addEventListener('mouseleave', () => this.hideTooltip());
    });
  }

  /**
   * Renders airport hub markers and closed hazard zones.
   * @returns {void}
   */
  renderAirports() {
    if (!this.airportsGroup) return;
    const airports = state.network.airports || [];
    const closures = state.simulation.closures || [];
    const closedMap = new Map(closures.map(c => [c.airport, c]));

    let html = '';
    for (const ap of airports) {
      const pos = this.airportPositions[ap.id];
      if (!pos) continue;

      const isClosed = closedMap.has(ap.id);
      const isMegaHub = ap.tier === 'mega_hub';
      const isRegional = ap.tier === 'regional_hub';
      const r = isClosed ? 6.5 : (isMegaHub ? 5.5 : (isRegional ? 4.5 : 3.5));

      let labelDx = 9;
      let labelDy = 3.5;
      let textAnchor = 'start';
      if (ap.id === 'BOM' || ap.id === 'GAU' || ap.id === 'TRV') {
        labelDx = -10;
        labelDy = 3.5;
        textAnchor = 'end';
      } else if (ap.id === 'PNQ') {
        labelDx = 9;
        labelDy = 10;
      }

      html += `
        <g class="hub-marker ${isClosed ? 'hub-closed' : ''} ${isMegaHub ? 'hub-megahub' : ''}" data-airport-id="${ap.id}" transform="translate(${pos.x}, ${pos.y})" tabindex="0" role="button" aria-label="Airport ${ap.id}, ${ap.city}, ${ap.tier.replace('_', ' ')}${isClosed ? ', currently closed' : ''}">
          ${isClosed ? `
            <circle class="hazard-wave wave-1" r="${r + 2}" stroke="#ff7588" fill="none" />
            <circle class="hazard-wave wave-2" r="${r + 2}" stroke="#ff7588" fill="none" />
          ` : ''}

          <circle class="hub-outer-ring" r="${r + 2.5}" fill="none" stroke="${isClosed ? '#ff7588' : (isMegaHub ? '#38bdf8' : '#475569')}" stroke-width="1.0" />
          <circle class="hub-core" r="${r}" fill="${isClosed ? '#ff7588' : (isMegaHub ? '#0284c7' : '#1e293b')}" stroke="${isClosed ? '#fda4af' : '#38bdf8'}" stroke-width="1.2" />

          <text class="hub-code-label font-mono" x="${labelDx}" y="${labelDy}" text-anchor="${textAnchor}" fill="${isClosed ? '#fecdd3' : '#f1f5f9'}">${ap.id}</text>
          
          ${isClosed ? `
            <g class="hazard-tag-wrap" transform="translate(${labelDx > 0 ? labelDx : labelDx - 54}, ${labelDy + 8})">
              <rect x="0" y="0" width="54" height="13" rx="2" fill="#4c0519" stroke="#ff7588" stroke-width="0.9" />
              <text x="27" y="9.5" text-anchor="middle" fill="#fecdd3" font-size="8" font-weight="700" font-family="monospace">CLOSED</text>
            </g>
          ` : ''}

          <circle class="hub-hitbox" r="16" fill="transparent" style="cursor: pointer;" />
        </g>
      `;
    }

    this.airportsGroup.innerHTML = html;

    const nodes = this.airportsGroup.querySelectorAll('.hub-marker');
    nodes.forEach(n => {
      const apId = n.getAttribute('data-airport-id');
      if (!apId) return;
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectAirport(apId);
      });
      n.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          state.selectAirport(apId);
        }
      });

      n.addEventListener('mouseenter', (e) => this.showAirportTooltip(e, apId));
      n.addEventListener('mousemove', (e) => this.moveTooltip(e));
      n.addEventListener('mouseleave', () => this.hideTooltip());
    });
  }

  /**
   * Renders active aircraft blips positioned along trajectory curves at current time.
   * @returns {void}
   */
  renderPlanes() {
    if (!this.planesGroup) return;
    if (!state.simulation || state.revealAll) {
      this.planesGroup.innerHTML = '';
      return;
    }

    const t = state.currentTime;
    const flights = state.simulation.flights || [];
    let html = '';

    for (const f of flights) {
      if (f.status === 'cancelled') continue;
      if (f.dep == null || f.arr == null) continue;

      if (t >= f.dep && t <= f.arr) {
        const p1 = this.airportPositions[f.origin];
        const p2 = this.airportPositions[f.destination];
        if (!p1 || !p2) continue;

        const frac = (t - f.dep) / Math.max(1, f.arr - f.dep);

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const nx = -dy / dist;
        const ny = dx / dist;
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const offset = Math.min(MAX_CURVATURE_OFFSET, Math.max(MIN_CURVATURE_OFFSET, dist * CURVATURE_FACTOR));
        const cx = mx + nx * offset;
        const cy = my + ny * offset;

        const inv = 1 - frac;
        const px = inv * inv * p1.x + 2 * inv * frac * cx + frac * frac * p2.x;
        const py = inv * inv * p1.y + 2 * inv * frac * cy + frac * frac * p2.y;

        // Tangent heading angle
        const tx = 2 * (1 - frac) * (cx - p1.x) + 2 * frac * (p2.x - cx);
        const ty = 2 * (1 - frac) * (cy - p1.y) + 2 * frac * (p2.y - cy);
        const angle = Math.atan2(ty, tx) * (180 / Math.PI);

        const isDelayed = f.status === 'delayed';
        const color = isDelayed ? '#f59e0b' : '#38bdf8';

        html += `
          <g class="plane-blip" transform="translate(${px.toFixed(1)}, ${py.toFixed(1)})" data-flight-id="${f.flight_id}">
            <circle r="4" fill="${color}" stroke="#fff" stroke-width="1.0" />
            <g transform="rotate(${angle.toFixed(1)})">
              <polygon points="6,0 -3,-3 -1,0 -3,3" fill="${color}" stroke="#0f172a" stroke-width="0.5" />
            </g>
            <text x="7" y="-5" fill="${color}" font-size="7.5" font-weight="700" font-family="monospace">${f.flight_id}</text>
          </g>
        `;
      }
    }

    this.planesGroup.innerHTML = html;
  }

  /**
   * Updates visual highlights and opacity based on selection state and route filter.
   * @returns {void}
   */
  updateHighlights() {
    if (!this.arcsGroup || !this.airportsGroup) return;
    const selectedFid = state.selectedFlightId;
    const selectedAid = state.selectedAirportId;
    const t = state.currentTime;
    const revealAll = state.revealAll;
    const filter = this.activeFilter;

    const arcGroups = this.arcsGroup.querySelectorAll('.trajectory-group');
    arcGroups.forEach(g => {
      const fid = g.getAttribute('data-flight-id');
      const orig = g.getAttribute('data-origin');
      const dest = g.getAttribute('data-destination');
      const status = g.getAttribute('data-status');
      const line = g.querySelector('.trajectory-line');
      if (!line) return;

      // Check route filter
      if (filter === 'delayed' && status !== 'delayed') {
        g.style.display = 'none';
        return;
      }
      if (filter === 'cancelled' && status !== 'cancelled') {
        g.style.display = 'none';
        return;
      }
      g.style.display = '';

      const isFlightSelected = selectedFid === fid;
      const isAirportRelated = Boolean(selectedAid && (orig === selectedAid || dest === selectedAid));

      let isFuture = false;
      if (!revealAll && state.simulation) {
        const flightData = (state.simulation.flights || []).find(x => x.flight_id === fid);
        if (flightData && flightData.schedDep > t && (flightData.dep == null || flightData.dep > t)) {
          isFuture = true;
        }
      }

      if (selectedFid) {
        if (isFlightSelected) {
          g.classList.add('selected');
          line.style.opacity = '1.0';
          line.style.strokeWidth = '3.0px';
          line.setAttribute('filter', 'url(#track-glow)');
          if (g.parentNode) g.parentNode.appendChild(g);
        } else {
          g.classList.remove('selected');
          line.style.opacity = '0.08';
          line.style.strokeWidth = '1.0px';
          line.removeAttribute('filter');
        }
      } else if (selectedAid) {
        if (isAirportRelated) {
          g.classList.add('selected');
          line.style.opacity = '0.90';
          line.style.strokeWidth = '2.2px';
        } else {
          g.classList.remove('selected');
          line.style.opacity = '0.06';
          line.style.strokeWidth = '0.8px';
        }
        line.removeAttribute('filter');
      } else {
        g.classList.remove('selected');
        line.removeAttribute('filter');
        if (isFuture) {
          line.style.opacity = '0.12';
          line.style.strokeWidth = '1.0px';
        } else {
          const isDelayed = line.classList.contains('arc-delayed');
          const isCancelled = line.classList.contains('arc-cancelled');
          line.style.opacity = isCancelled ? '0.90' : (isDelayed ? '0.85' : '0.28');
          line.style.strokeWidth = isCancelled || isDelayed ? '1.8px' : '1.0px';
        }
      }
    });

    const airportNodes = this.airportsGroup.querySelectorAll('.hub-marker');
    airportNodes.forEach(n => {
      const apId = n.getAttribute('data-airport-id');
      if (selectedAid === apId) n.classList.add('hub-selected');
      else n.classList.remove('hub-selected');
    });
  }

  /**
   * Surfaces a high-precision tooltip for an inspected flight arc.
   * @param {MouseEvent} e - Mouse event.
   * @param {string} flightId - Flight ID.
   * @returns {void}
   */
  showFlightTooltip(e, flightId) {
    if (!state.simulation || !this.tooltip) return;
    const f = (state.simulation.flights || []).find(x => x.flight_id === flightId);
    if (!f) return;

    let statusPill = `<span class="tip-pill pill-nominal">ON TIME</span>`;
    let detailLine = `Arr: ${toHHMM(f.arr || f.schedArr)}`;
    if (f.status === 'delayed') {
      statusPill = `<span class="tip-pill pill-warn">+${f.arrDelay}m</span>`;
      detailLine = `Actual Arr: ${toHHMM(f.arr)} (Sched: ${toHHMM(f.schedArr)})`;
    } else if (f.status === 'cancelled') {
      statusPill = `<span class="tip-pill pill-alert">CANCELLED</span>`;
      detailLine = `Reason: ${f.cancelDetail || f.cancelReason || 'Disrupted'}`;
    }

    this.tooltip.innerHTML = `
      <div class="tip-top">
        <span class="tip-code font-mono">${f.flight_id}</span>
        ${statusPill}
      </div>
      <div class="tip-route font-mono">${f.origin} &rarr; ${f.destination}</div>
      <div class="tip-grid font-mono">
        <div>Tail: <strong>${f.aircraft}</strong></div>
        <div>Pax: <strong>${f.pax}</strong></div>
        <div>Dep: <strong>${toHHMM(f.dep || f.schedDep)}</strong> (Sched ${toHHMM(f.schedDep)})</div>
        <div>${detailLine}</div>
      </div>
      ${f.swap ? `<div class="tip-spare">Spare Swap: ${f.swap.spare}</div>` : ''}
    `;

    this.tooltip.style.display = 'block';
    this.moveTooltip(e);
  }

  /**
   * Surfaces a high-precision tooltip for an inspected airport hub.
   * @param {MouseEvent} e - Mouse event.
   * @param {string} airportId - Airport code.
   * @returns {void}
   */
  showAirportTooltip(e, airportId) {
    if (!state.network || !state.simulation || !this.tooltip) return;
    const ap = (state.network.airports || []).find(x => x.id === airportId);
    if (!ap) return;

    const flights = state.simulation.flights || [];
    const depFlights = flights.filter(f => f.origin === airportId);
    const arrFlights = flights.filter(f => f.destination === airportId);
    const closures = state.simulation.closures || [];
    const closure = closures.find(c => c.airport === airportId);

    const delayedDeps = depFlights.filter(f => f.status === 'delayed').length;
    const cancelledDeps = depFlights.filter(f => f.status === 'cancelled').length;

    this.tooltip.innerHTML = `
      <div class="tip-top">
        <span class="tip-code font-mono">${ap.id} &bull; ${ap.city}</span>
        <span class="tip-pill ${closure ? 'pill-alert' : 'pill-info'}">${closure ? 'CLOSED' : ap.tier.replace('_', ' ')}</span>
      </div>
      <div class="tip-route">${ap.name}</div>
      <div class="tip-grid">
        <div>Capacity: <strong>${ap.capacity_per_hour} fl/hr</strong></div>
        <div>Departures: <strong>${depFlights.length}</strong> (${delayedDeps} late, ${cancelledDeps} cancelled)</div>
        <div>Arrivals: <strong>${arrFlights.length}</strong></div>
        ${closure ? `<div class="text-alert font-mono">Closure Window: ${closure.start}&ndash;${closure.end}</div>` : ''}
      </div>
    `;

    this.tooltip.style.display = 'block';
    this.moveTooltip(e);
  }

  /**
   * Repositions floating tooltip beside cursor with viewport collision avoidance.
   * @param {MouseEvent} e - Mouse event.
   * @returns {void}
   */
  moveTooltip(e) {
    if (!this.tooltip) return;
    let x = e.clientX + TOOLTIP_OFFSET_PX;
    let y = e.clientY + TOOLTIP_OFFSET_PX;
    const w = this.tooltip.offsetWidth;
    const h = this.tooltip.offsetHeight;
    if (x + w > window.innerWidth - TOOLTIP_MARGIN_PX) x = e.clientX - w - TOOLTIP_OFFSET_PX;
    if (y + h > window.innerHeight - TOOLTIP_MARGIN_PX) y = e.clientY - h - TOOLTIP_OFFSET_PX;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  /**
   * Hides floating tooltip on mouse exit.
   * @returns {void}
   */
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }
}
