/**
 * @fileoverview Rotational Fleet Gantt Timeline Deck for Domino Sky.
 * Renders aircraft rotations, scheduled vs actual flight execution bars,
 * delay brackets, spare positioning ferry flights, and time-scrubbed interactive cursors.
 *
 * Adheres to WCAG 2.1 AAA accessibility standards and Google clean code principles.
 */

import { state } from './state.js';
import { toHHMM } from '/engine.js';

/** Timeline temporal bounds in minutes from 00:00 */
const T_START = 300; // 05:00 IST
const T_END = 1440;  // 24:00 IST
const T_TOTAL = T_END - T_START; // 1140 minutes
const TIME_STEP_HOUR = 60;
const TIME_STEP_SCRUB = 15;
const OPERATIONAL_FLEET_SIZE = 16;

/**
 * GanttTimeline coordinates rotational timeline rendering, playback scrubbing,
 * and flight leg selection.
 */
export class GanttTimeline {
  /**
   * @param {HTMLElement} containerEl - DOM container mount point.
   */
  constructor(containerEl) {
    if (!containerEl) throw new Error('GanttTimeline requires a valid container element');
    this.container = containerEl;
    this.gridEl = null;
    this.cursorLineEl = null;
    this.clockEl = null;
    this.playBtnEl = null;
    this.sliderEl = null;

    this.initStructure();
    this.bindEvents();
  }

  /**
   * Initializes timeline DOM skeleton and transport controls.
   * @returns {void}
   */
  initStructure() {
    this.container.innerHTML = `
      <div class="gantt-root">
        <!-- Gantt Controls Header -->
        <div class="gantt-top-bar">
          <div class="gantt-bar-title">
            <span class="gantt-deck-beacon" aria-hidden="true"></span>
            <h2 class="bar-title-text" id="heading-gantt">Rotational Fleet Schedule</h2>
            <span class="bar-title-sub font-mono">05:00 &ndash; 24:00 IST &bull; 18 Aircraft Tails</span>
          </div>

          <div class="gantt-transport-controls" role="group" aria-label="Timeline Playback & Transport Controls">
            <button type="button" class="transport-btn" id="gantt-btn-rewind" title="Rewind to 05:00" aria-label="Rewind timeline to 05:00 IST">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
            </button>
            <button type="button" class="transport-btn" id="gantt-btn-step-back" title="Step Back 15 min" aria-label="Step back 15 minutes">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M14 18V6l-7 6 7 6z"/></svg>
            </button>
            <button type="button" class="transport-btn transport-play-btn font-mono" id="gantt-btn-play" title="Toggle Play / Pause Simulation" aria-label="Play timeline simulation" aria-pressed="false">
              <svg class="play-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span id="gantt-play-label">Play</span>
            </button>
            <button type="button" class="transport-btn" id="gantt-btn-step-fwd" title="Step Forward 15 min" aria-label="Step forward 15 minutes">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10 18V6l7 6-7 6z"/></svg>
            </button>

            <!-- Time Scrubber Slider -->
            <div class="scrub-container">
              <input
                type="range"
                class="timeline-range"
                id="gantt-time-slider"
                min="${T_START}"
                max="${T_END}"
                step="5"
                value="${T_END}"
                role="slider"
                aria-label="Timeline time scrubber"
                aria-valuemin="${T_START}"
                aria-valuemax="${T_END}"
                aria-valuenow="${T_END}"
                aria-valuetext="24:00 IST"
              />
              <div class="time-readout-box font-mono" aria-live="polite">
                <span class="readout-clock" id="gantt-digital-clock">24:00 IST</span>
              </div>
            </div>

            <!-- Speed selector -->
            <div class="speed-selector font-mono" role="group" aria-label="Playback Velocity">
              <button type="button" class="speed-chip" data-speed="1" aria-label="Speed 1x" aria-pressed="false">1x</button>
              <button type="button" class="speed-chip active" data-speed="2" aria-label="Speed 2x" aria-pressed="true">2x</button>
              <button type="button" class="speed-chip" data-speed="5" aria-label="Speed 5x" aria-pressed="false">5x</button>
              <button type="button" class="speed-chip" data-speed="10" aria-label="Speed 10x" aria-pressed="false">10x</button>
            </div>

            <button type="button" class="btn btn-xs btn-deck-action font-mono" id="gantt-btn-reveal-all" title="Snap to end-of-day cumulative state" aria-label="Show full day cumulative results">Full Day</button>
          </div>
        </div>

        <!-- Timeline Scroll Area -->
        <div class="gantt-viewport-scroll">
          <div class="gantt-canvas">
            <!-- Left Fixed Tails Column -->
            <div class="gantt-tails-col" id="gantt-tails-col"></div>

            <!-- Right Scrollable Chart -->
            <div class="gantt-chart-area" id="gantt-viewport">
              <!-- Hours Ticks Header -->
              <div class="gantt-time-header" id="gantt-time-axis"></div>

              <!-- Shaded Closure Band Overlay -->
              <div class="gantt-closure-layer" id="gantt-closure-overlay"></div>

              <!-- Scrub Cursor Line -->
              <div class="gantt-scrub-line" id="gantt-cursor">
                <div class="scrub-head font-mono" id="cursor-tag">05:00</div>
              </div>

              <!-- Aircraft Rows -->
              <div class="gantt-rows-layer" id="gantt-rows"></div>
            </div>
          </div>
        </div>

        <!-- Subtle Legend Footer -->
        <div class="gantt-footer-legend font-mono">
          <span class="legend-swatch-item"><span class="swatch-box swatch-sched"></span> Scheduled Slot</span>
          <span class="legend-swatch-item"><span class="swatch-box swatch-ontime"></span> On Time</span>
          <span class="legend-swatch-item"><span class="swatch-box swatch-delayed"></span> Rotational Delay</span>
          <span class="legend-swatch-item"><span class="swatch-box swatch-cancelled"></span> Cancelled Leg</span>
          <span class="legend-swatch-item"><span class="swatch-box swatch-spare"></span> Spare Recovery / Ferry</span>
          <span class="legend-swatch-item"><span class="swatch-box swatch-closure"></span> Airport Closure Zone</span>
        </div>
      </div>
    `;

    this.playBtnEl = this.container.querySelector('#gantt-btn-play');
    this.sliderEl = this.container.querySelector('#gantt-time-slider');
    this.clockEl = this.container.querySelector('#gantt-digital-clock');
    this.cursorLineEl = this.container.querySelector('#gantt-cursor');
    this.gridEl = this.container.querySelector('#gantt-rows');

    this.renderTimeAxis();
    this.attachDomHandlers();
  }

  /**
   * Generates hour markers along horizontal time axis.
   * @returns {void}
   */
  renderTimeAxis() {
    const axisEl = this.container.querySelector('#gantt-time-axis');
    if (!axisEl) return;
    let html = '';
    for (let m = T_START; m <= T_END; m += TIME_STEP_HOUR) {
      const pct = ((m - T_START) / T_TOTAL) * 100;
      html += `
        <div class="axis-hour-tick" style="left: ${pct}%;">
          <span class="hour-text font-mono">${toHHMM(m)}</span>
          <div class="axis-guideline"></div>
        </div>
      `;
    }
    axisEl.innerHTML = html;
  }

  /**
   * Attaches click and transport event handlers.
   * @returns {void}
   */
  attachDomHandlers() {
    if (this.playBtnEl) {
      this.playBtnEl.addEventListener('click', () => {
        if (state.isPlaying) state.stopPlayback();
        else state.startPlayback();
      });
    }

    const rewindBtn = this.container.querySelector('#gantt-btn-rewind');
    if (rewindBtn) {
      rewindBtn.addEventListener('click', () => {
        state.stopPlayback();
        state.setCurrentTime(T_START, false);
      });
    }

    const stepBackBtn = this.container.querySelector('#gantt-btn-step-back');
    if (stepBackBtn) {
      stepBackBtn.addEventListener('click', () => {
        state.stopPlayback();
        state.setCurrentTime(state.currentTime - TIME_STEP_SCRUB, false);
      });
    }

    const stepFwdBtn = this.container.querySelector('#gantt-btn-step-fwd');
    if (stepFwdBtn) {
      stepFwdBtn.addEventListener('click', () => {
        state.stopPlayback();
        state.setCurrentTime(state.currentTime + TIME_STEP_SCRUB, false);
      });
    }

    if (this.sliderEl) {
      this.sliderEl.addEventListener('input', (e) => {
        state.stopPlayback();
        const target = /** @type {HTMLInputElement} */ (e.target);
        state.setCurrentTime(Number(target.value), false);
      });
    }

    const revealAllBtn = this.container.querySelector('#gantt-btn-reveal-all');
    if (revealAllBtn) {
      revealAllBtn.addEventListener('click', () => {
        state.stopPlayback();
        state.setCurrentTime(T_END, true);
      });
    }

    const speedBtns = this.container.querySelectorAll('.speed-chip');
    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        speedBtns.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        const speed = btn.getAttribute('data-speed');
        if (speed) state.setSpeed(speed);
      });
    });
  }

  /**
   * Binds global state updates.
   * @returns {void}
   */
  bindEvents() {
    state.on('simulation_updated', () => this.render());
    state.on('flight_selected', () => this.updateSelection());
    state.on('time_updated', (data) => this.onTimeUpdated(data));
    state.on('playback_state', (data) => this.onPlaybackUpdated(data));
  }

  /**
   * Updates play/pause button state.
   * @param {{isPlaying: boolean, speed: number}} data - Playback state payload.
   * @returns {void}
   */
  onPlaybackUpdated(data) {
    const label = this.container.querySelector('#gantt-play-label');
    if (!label || !this.playBtnEl) return;
    if (data.isPlaying) {
      label.textContent = 'Pause';
      this.playBtnEl.classList.add('playing');
      this.playBtnEl.setAttribute('aria-pressed', 'true');
    } else {
      label.textContent = 'Play';
      this.playBtnEl.classList.remove('playing');
      this.playBtnEl.setAttribute('aria-pressed', 'false');
    }
  }

  /**
   * Synchronizes timeline scrubber cursor and readouts with current time.
   * @param {number|{time: number}} data - Time update payload.
   * @returns {void}
   */
  onTimeUpdated(data) {
    const t = typeof data === 'object' && data !== null ? data.time : Number(data);
    if (this.sliderEl) this.sliderEl.value = String(t);
    if (this.clockEl) this.clockEl.textContent = `${toHHMM(t)} IST`;

    const pct = Math.max(0, Math.min(100, ((t - T_START) / T_TOTAL) * 100));
    if (this.cursorLineEl) this.cursorLineEl.style.left = `${pct}%`;
    const cursorTag = this.container.querySelector('#cursor-tag');
    if (cursorTag) cursorTag.textContent = toHHMM(t);

    this.updateFlightVisibilities();
  }

  /**
   * Renders the complete Gantt deck with aircraft tails and flight bars.
   * @returns {void}
   */
  render() {
    if (!state.network || !state.simulation) return;

    this.renderClosureOverlay();

    const tailsCol = this.container.querySelector('#gantt-tails-col');
    const rowsContainer = this.container.querySelector('#gantt-rows');
    if (!tailsCol || !rowsContainer) return;

    const operationalTails = [];
    for (let i = 1; i <= OPERATIONAL_FLEET_SIZE; i++) {
      operationalTails.push(`VT-DS${String(i).padStart(2, '0')}`);
    }
    const spareTails = (state.network.spare_aircraft || []).map(s => s.tail_id);
    const allTails = [...operationalTails, ...spareTails];

    let tailsHtml = '';
    for (const tail of allTails) {
      const isSpare = spareTails.includes(tail);
      const spareObj = isSpare ? state.network.spare_aircraft.find(s => s.tail_id === tail) : null;
      const baseLabel = isSpare && spareObj ? `Spare ${spareObj.base}` : 'Fleet';

      tailsHtml += `
        <div class="tail-item ${isSpare ? 'tail-is-spare' : ''}" data-tail="${tail}">
          <span class="tail-code font-mono">${tail}</span>
          <span class="tail-tag font-mono ${isSpare ? 'tag-spare' : 'tag-fleet'}">${baseLabel}</span>
        </div>
      `;
    }
    tailsCol.innerHTML = tailsHtml;

    const flights = state.simulation.flights || [];
    const flightsByTail = {};
    for (const tail of allTails) flightsByTail[tail] = [];

    for (const f of flights) {
      const tail = f.aircraft;
      if (flightsByTail[tail]) {
        flightsByTail[tail].push(f);
      }
    }

    let rowsHtml = '';
    for (const tail of allTails) {
      const isSpare = spareTails.includes(tail);
      const tailFlights = flightsByTail[tail] || [];

      rowsHtml += `
        <div class="rotation-row ${isSpare ? 'rotation-row-spare' : ''}" data-tail="${tail}">
          <div class="row-guide"></div>
          <div class="row-legs-container">
            ${tailFlights.map(f => this.renderFlightBar(f)).join('')}
          </div>
        </div>
      `;
    }
    rowsContainer.innerHTML = rowsHtml;

    const bars = rowsContainer.querySelectorAll('.leg-bar-group');
    bars.forEach(bar => {
      const fid = bar.getAttribute('data-flight-id');
      if (!fid) return;
      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectFlight(fid);
      });
      bar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          state.selectFlight(fid);
        }
      });
    });

    this.onTimeUpdated(state.currentTime);
    this.updateSelection();
  }

  /**
   * Generates markup for an individual scheduled and executed flight leg bar.
   * @param {Object} f - Flight record from simulation engine.
   * @returns {string} HTML markup.
   */
  renderFlightBar(f) {
    const sd = f.schedDep;
    const sa = f.schedArr;
    const dep = f.dep;
    const arr = f.arr;

    const schedLeft = Math.max(0, ((sd - T_START) / T_TOTAL) * 100);
    const schedWidth = Math.max(1.0, ((sa - sd) / T_TOTAL) * 100);

    const isCancelled = f.status === 'cancelled';
    const isDelayed = f.status === 'delayed';
    const isSwap = Boolean(f.swap);

    let actualBarHtml = '';
    let delayLineHtml = '';

    if (isCancelled) {
      actualBarHtml = `
        <div class="bar-actual bar-cancelled" style="left: ${schedLeft}%; width: ${schedWidth}%;">
          <span class="bar-cancel-text font-mono">&times; ${f.flight_id} CANCELLED</span>
        </div>
      `;
    } else {
      const actLeft = Math.max(0, ((dep - T_START) / T_TOTAL) * 100);
      const actWidth = Math.max(1.0, ((arr - dep) / T_TOTAL) * 100);

      if (isDelayed && dep > sd) {
        const gapLeft = schedLeft;
        const gapWidth = Math.max(0.3, actLeft - schedLeft);
        delayLineHtml = `
          <div class="bar-delay-bracket" style="left: ${gapLeft}%; width: ${gapWidth}%;"></div>
        `;
      }

      let ferryHtml = '';
      if (isSwap && f.swap && f.swap.ferryMin > 0 && f.swap.spare === f.aircraft) {
        const ferryStart = Math.max(0, ((dep - f.swap.ferryMin - T_START) / T_TOTAL) * 100);
        const ferryWidth = Math.max(0.6, (f.swap.ferryMin / T_TOTAL) * 100);
        ferryHtml = `
          <div class="bar-ferry-block" style="left: ${ferryStart}%; width: ${ferryWidth}%;" title="Ferry positioning ${f.swap.ferryMin}m">
            <span class="ferry-text font-mono">Ferry</span>
          </div>
        `;
      }

      const statusClass = isDelayed ? 'bar-delayed' : 'bar-ontime';
      const delayBadge = isDelayed ? `<span class="delay-tag font-mono">+${f.arrDelay}m</span>` : '';

      actualBarHtml = `
        ${ferryHtml}
        ${delayLineHtml}
        <div class="bar-actual ${statusClass} ${isSwap ? 'bar-spare-swap' : ''}" style="left: ${actLeft}%; width: ${actWidth}%;">
          <span class="bar-label-group font-mono">
            <span class="bar-code">${f.flight_id}</span>
            <span class="bar-route">${f.origin}&ndash;${f.destination}</span>
            ${delayBadge}
          </span>
        </div>
      `;
    }

    const a11yStatus = isCancelled ? 'Cancelled' : (isDelayed ? `Delayed by ${f.arrDelay} minutes` : 'On Time');
    const a11yLabel = `Flight ${f.flight_id}, ${f.origin} to ${f.destination}, scheduled ${toHHMM(sd)} to ${toHHMM(sa)}, status ${a11yStatus}`;

    return `
      <div
        class="leg-bar-group"
        data-flight-id="${f.flight_id}"
        data-sched-dep="${sd}"
        data-sched-arr="${sa}"
        data-dep="${dep || sd}"
        data-arr="${arr || sa}"
        data-status="${f.status}"
        tabindex="0"
        role="button"
        aria-pressed="${f.flight_id === state.selectedFlightId ? 'true' : 'false'}"
        aria-label="${a11yLabel}"
      >
        <div class="bar-scheduled-outline" style="left: ${schedLeft}%; width: ${schedWidth}%;" title="Scheduled ${toHHMM(sd)} - ${toHHMM(sa)}" aria-hidden="true"></div>
        ${actualBarHtml}
      </div>
    `;
  }

  /**
   * Renders red shaded vertical bands indicating airport closures.
   * @returns {void}
   */
  renderClosureOverlay() {
    const overlayEl = this.container.querySelector('#gantt-closure-overlay');
    if (!overlayEl) return;
    const closures = state.simulation.closures || [];
    if (!closures.length) {
      overlayEl.innerHTML = '';
      return;
    }

    let html = '';
    for (const c of closures) {
      const s = typeof c.start === 'string' ? (Number(c.start.split(':')[0]) * TIME_STEP_HOUR + Number(c.start.split(':')[1])) : c.start;
      const e = typeof c.end === 'string' ? (Number(c.end.split(':')[0]) * TIME_STEP_HOUR + Number(c.end.split(':')[1])) : c.end;

      const left = Math.max(0, ((s - T_START) / T_TOTAL) * 100);
      const width = Math.max(0.5, ((e - s) / T_TOTAL) * 100);

      html += `
        <div class="closure-stripe" style="left: ${left}%; width: ${width}%;">
          <span class="closure-stripe-label font-mono">${c.airport} CLOSED ${toHHMM(s)}&ndash;${toHHMM(e)}</span>
        </div>
      `;
    }
    overlayEl.innerHTML = html;
  }

  /**
   * Updates opacity of flight bars according to current simulation playback clock.
   * @returns {void}
   */
  updateFlightVisibilities() {
    const t = state.currentTime;
    const revealAll = state.revealAll;

    const bars = this.container.querySelectorAll('.leg-bar-group');
    bars.forEach(bar => {
      const sd = Number(bar.getAttribute('data-sched-dep'));
      const dep = Number(bar.getAttribute('data-dep'));
      const arr = Number(bar.getAttribute('data-arr'));

      const actualEl = bar.querySelector('.bar-actual');
      const schedEl = bar.querySelector('.bar-scheduled-outline');
      const delayEl = bar.querySelector('.bar-delay-bracket');

      if (revealAll) {
        bar.style.opacity = '1.0';
        if (actualEl) actualEl.style.opacity = '1.0';
        if (schedEl) schedEl.style.opacity = '0.5';
        if (delayEl) delayEl.style.opacity = '0.8';
        return;
      }

      const effectiveDep = dep || sd;
      if (effectiveDep > t) {
        bar.style.opacity = '0.35';
        if (actualEl) actualEl.style.opacity = '0.12';
        if (schedEl) schedEl.style.opacity = '0.35';
        if (delayEl) delayEl.style.opacity = '0.1';
      } else {
        bar.style.opacity = '1.0';
        if (actualEl) {
          actualEl.style.opacity = '1.0';
          if (t >= effectiveDep && t <= arr) {
            actualEl.classList.add('leg-airborne');
          } else {
            actualEl.classList.remove('leg-airborne');
          }
        }
        if (schedEl) schedEl.style.opacity = '0.5';
        if (delayEl) delayEl.style.opacity = '0.8';
      }
    });
  }

  /**
   * Highlights rotational row and flight bar corresponding to selected flight.
   * @returns {void}
   */
  updateSelection() {
    const fid = state.selectedFlightId;
    const rows = this.container.querySelectorAll('.rotation-row');
    const bars = this.container.querySelectorAll('.leg-bar-group');

    bars.forEach(bar => {
      const isSelected = bar.getAttribute('data-flight-id') === fid;
      bar.classList.toggle('leg-selected', isSelected);
      bar.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    rows.forEach(row => {
      const hasSelected = Boolean(fid && row.querySelector(`.leg-bar-group[data-flight-id="${fid}"]`));
      if (hasSelected) {
        row.classList.add('row-selected');
      } else {
        row.classList.remove('row-selected');
      }
    });
  }
}
