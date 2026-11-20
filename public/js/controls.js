/**
 * @fileoverview Disruption Setup & Scenario Driver Controller for Domino Sky.
 * Provides accessible, keyboard-navigable controls to close any hub airport
 * across a chosen time window and trigger deterministic cascade propagation.
 *
 * Adheres to WCAG 2.1 AAA accessibility standards and Google clean code principles.
 */

import { state } from './state.js';
import { toHHMM } from '/engine.js';

/** Default operational parameters for disruption simulation */
const DEFAULT_AIRPORT = 'BOM';
const DEFAULT_START_TIME = '07:00';
const DEFAULT_DURATION_MIN = 240;
const BENCHMARK_PS_START_TIME = '15:00';
const BENCHMARK_PS_DURATION_MIN = 90;
const MINUTES_PER_HOUR = 60;

/**
 * ControlPanel manages scenario input controls, preset chips, and closure simulation triggers.
 */
export class ControlPanel {
  /**
   * @param {HTMLElement} containerEl - DOM container mount point.
   */
  constructor(containerEl) {
    if (!containerEl) throw new Error('ControlPanel requires a valid container element');
    this.container = containerEl;
    this.bindEvents();
  }

  /**
   * Binds global state updates to synchronize inputs across scenario changes.
   * @returns {void}
   */
  bindEvents() {
    state.on('simulation_updated', () => this.syncInputs());
    state.on('scenario_changed', () => this.syncInputs());
  }

  /**
   * Helper to broadcast live messages to screen readers.
   * @param {string} message - Message to announce.
   * @returns {void}
   */
  announce(message) {
    const announcer = document.getElementById('a11y-announcer');
    if (announcer) {
      announcer.textContent = message;
    }
  }

  /**
   * Renders the control card and form inputs.
   * @returns {void}
   */
  render() {
    if (!state.network) return;

    const airports = state.network.airports || [];

    this.container.innerHTML = `
      <div class="control-box">
        <div class="card-header">
          <div class="card-header-left">
            <span class="card-icon-beacon card-beacon-red" aria-hidden="true"></span>
            <h2 class="card-title" id="heading-disruption">Disruption Setup</h2>
          </div>
          <span class="card-chip font-mono">SCENARIO DRIVER</span>
        </div>

        <!-- Target Airport -->
        <div class="form-group">
          <div class="label-row">
            <label class="form-label" for="ctrl-airport">Target Closure Hub</label>
            <span class="form-sub-hint font-mono">Airport Capacity Impact</span>
          </div>
          <div class="select-wrapper">
            <select class="form-select font-mono" id="ctrl-airport" aria-label="Select hub airport to close">
              ${airports.map(a => `
                <option value="${a.id}" ${a.id === DEFAULT_AIRPORT ? 'selected' : ''}>
                  ${a.id} &ndash; ${a.city} (${a.capacity_per_hour} fl/hr &bull; ${a.tier.replace('_', ' ')})
                </option>
              `).join('')}
            </select>
            <div class="select-arrow" aria-hidden="true">&#9662;</div>
          </div>
        </div>

        <!-- Closure Start Time -->
        <div class="form-group">
          <div class="label-row">
            <label class="form-label" for="ctrl-start">Closure Start (IST)</label>
            <span class="form-sub-hint font-mono">Peak Bank Departure</span>
          </div>
          <div class="time-control-stack">
            <input type="time" class="form-control font-mono" id="ctrl-start" value="${DEFAULT_START_TIME}" aria-label="Closure start time in Indian Standard Time" />
            <div class="time-preset-strip" role="group" aria-label="Quick Time Presets">
              <button type="button" class="preset-chip font-mono" data-time="06:00" aria-label="Preset 06:00 IST" aria-pressed="false">06:00</button>
              <button type="button" class="preset-chip active font-mono" data-time="07:00" aria-label="Preset 07:00 IST" aria-pressed="true">07:00</button>
              <button type="button" class="preset-chip font-mono" data-time="09:00" aria-label="Preset 09:00 IST" aria-pressed="false">09:00</button>
              <button type="button" class="preset-chip font-mono" data-time="11:00" aria-label="Preset 11:00 IST" aria-pressed="false">11:00</button>
              <button type="button" class="preset-chip font-mono" data-time="14:00" aria-label="Preset 14:00 IST" aria-pressed="false">14:00</button>
            </div>
          </div>
        </div>

        <!-- Duration Slider -->
        <div class="form-group">
          <div class="slider-header-row">
            <label class="form-label" for="ctrl-duration">Closure Duration</label>
            <span class="slider-val font-mono" id="duration-readout" aria-live="polite">240 min (07:00 &ndash; 11:00)</span>
          </div>
          <div class="slider-track-wrap">
            <input
              type="range"
              class="form-range"
              id="ctrl-duration"
              min="30"
              max="300"
              step="15"
              value="${DEFAULT_DURATION_MIN}"
              role="slider"
              aria-label="Closure duration in minutes"
              aria-valuemin="30"
              aria-valuemax="300"
              aria-valuenow="${DEFAULT_DURATION_MIN}"
              aria-valuetext="240 minutes (07:00 to 11:00 IST)"
            />
          </div>
          <div class="slider-tick-labels font-mono" aria-hidden="true">
            <span>30m</span>
            <span>60m</span>
            <span>120m</span>
            <span>180m</span>
            <span>240m</span>
            <span>300m</span>
          </div>
        </div>

        <!-- Action Controls -->
        <div class="control-actions">
          <button class="btn btn-action-disrupt btn-block font-mono" id="btn-run-closure" aria-label="Simulate hub closure scenario">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Simulate Hub Closure
          </button>
          <button class="btn btn-outline-cyan btn-block font-mono" id="btn-load-demo" aria-label="Load benchmark scenario: Mumbai 4-hour closure from 07:00 to 11:00 IST">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Load Benchmark: BOM 07:00&ndash;11:00 (240m)
          </button>
          <button class="btn btn-outline-amber btn-block font-mono" id="btn-load-ps-demo" title="Direct test of Problem Statement thunderstorm cascade" aria-label="Load problem statement thunderstorm scenario: Mumbai 90-minute closure from 15:00 to 16:30 IST">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            PS Prompt: BOM 90m Storm (15:00&ndash;16:30)
          </button>
        </div>

        <!-- Collapsible Rules & Assumptions -->
        <details class="assumptions-card" aria-label="Simulation Rules and Operating Parameters">
          <summary class="assumptions-summary font-mono" aria-label="Expand or collapse simulation rules and parameters">
            <span class="summary-label">Simulation Rules &amp; Parameters</span>
            <span class="summary-chevron" aria-hidden="true">&rsaquo;</span>
          </summary>
          <div class="assumptions-content">
            <div class="rule-row"><span class="rule-k">Cancel threshold</span><span class="rule-v font-mono">&ge; 240m dep delay</span></div>
            <div class="rule-row"><span class="rule-k">Late threshold</span><span class="rule-v font-mono">&ge; 15m arrival delay</span></div>
            <div class="rule-row"><span class="rule-k">Min turnaround buffer</span><span class="rule-v font-mono">30m turnaround</span></div>
            <div class="rule-row"><span class="rule-k">Crew duty maximum</span><span class="rule-v font-mono">600m max FDP</span></div>
            <div class="rule-row"><span class="rule-k">Spare ferry cruise</span><span class="rule-v font-mono">800 km/h + 20m prep</span></div>
            <div class="rule-row"><span class="rule-k">Reopening recovery rate</span><span class="rule-v font-mono">60 / capacity (m/slot)</span></div>
          </div>
        </details>
      </div>
    `;

    this.attachDomHandlers();
  }

  /**
   * Attaches input and click listeners to DOM elements.
   * @returns {void}
   */
  attachDomHandlers() {
    const airportSelect = this.container.querySelector('#ctrl-airport');
    const startTimeInput = this.container.querySelector('#ctrl-start');
    const durationInput = this.container.querySelector('#ctrl-duration');
    const durationReadout = this.container.querySelector('#duration-readout');

    const updateReadout = () => {
      if (!startTimeInput || !durationInput || !durationReadout) return;
      const startVal = startTimeInput.value || DEFAULT_START_TIME;
      const dur = Number(durationInput.value);
      const [h, m] = startVal.split(':').map(Number);
      const startMin = h * MINUTES_PER_HOUR + m;
      const endMin = startMin + dur;
      const text = `${dur} min (${toHHMM(startMin)} \u2013 ${toHHMM(endMin)})`;
      durationReadout.textContent = text;

      // Update ARIA slider values
      durationInput.setAttribute('aria-valuenow', String(dur));
      durationInput.setAttribute('aria-valuetext', `${dur} minutes (${toHHMM(startMin)} to ${toHHMM(endMin)} IST)`);
    };

    if (durationInput) {
      durationInput.addEventListener('input', updateReadout);
    }

    if (startTimeInput) {
      startTimeInput.addEventListener('change', updateReadout);
    }

    const presetChips = this.container.querySelectorAll('.preset-chip');
    presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        presetChips.forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
        const t = chip.getAttribute('data-time');
        if (startTimeInput && t) startTimeInput.value = t;
        updateReadout();
      });
    });

    const runClosureBtn = this.container.querySelector('#btn-run-closure');
    if (runClosureBtn) {
      runClosureBtn.addEventListener('click', () => {
        const ap = airportSelect ? airportSelect.value : DEFAULT_AIRPORT;
        const start = startTimeInput && startTimeInput.value ? startTimeInput.value : DEFAULT_START_TIME;
        const dur = Number(durationInput && durationInput.value ? durationInput.value : DEFAULT_DURATION_MIN);
        state.setClosure(ap, start, dur);
        this.announce(`Simulated closure of ${ap} starting at ${start} for ${dur} minutes.`);
      });
    }

    const loadDemoBtn = this.container.querySelector('#btn-load-demo');
    if (loadDemoBtn) {
      loadDemoBtn.addEventListener('click', () => {
        if (airportSelect) airportSelect.value = DEFAULT_AIRPORT;
        if (startTimeInput) startTimeInput.value = DEFAULT_START_TIME;
        if (durationInput) durationInput.value = String(DEFAULT_DURATION_MIN);
        presetChips.forEach(c => {
          const isActive = c.getAttribute('data-time') === DEFAULT_START_TIME;
          c.classList.toggle('active', isActive);
          c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        updateReadout();
        state.setClosure(DEFAULT_AIRPORT, DEFAULT_START_TIME, DEFAULT_DURATION_MIN);
        this.announce('Loaded benchmark scenario: Mumbai 4-hour closure from 07:00 to 11:00 IST.');
      });
    }

    const loadPsDemoBtn = this.container.querySelector('#btn-load-ps-demo');
    if (loadPsDemoBtn) {
      loadPsDemoBtn.addEventListener('click', () => {
        if (airportSelect) airportSelect.value = DEFAULT_AIRPORT;
        if (startTimeInput) startTimeInput.value = BENCHMARK_PS_START_TIME;
        if (durationInput) durationInput.value = String(BENCHMARK_PS_DURATION_MIN);
        presetChips.forEach(c => {
          const isActive = c.getAttribute('data-time') === BENCHMARK_PS_START_TIME;
          c.classList.toggle('active', isActive);
          c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        updateReadout();
        state.setClosure(DEFAULT_AIRPORT, BENCHMARK_PS_START_TIME, BENCHMARK_PS_DURATION_MIN);
        this.announce('Loaded problem statement thunderstorm scenario: Mumbai 90-minute closure from 15:00 to 16:30 IST.');
      });
    }

    // Top Bar Reset Handler
    const headerResetBtn = document.getElementById('btn-header-reset');
    if (headerResetBtn) {
      headerResetBtn.onclick = () => {
        state.resetScenario();
        this.syncInputs();
        this.announce('Simulation reset to baseline nominal schedule.');
      };
    }
  }

  /**
   * Synchronizes UI inputs with state model.
   * @returns {void}
   */
  syncInputs() {
    const airportSelect = this.container.querySelector('#ctrl-airport');
    const startTimeInput = this.container.querySelector('#ctrl-start');
    const durationInput = this.container.querySelector('#ctrl-duration');
    const durationReadout = this.container.querySelector('#duration-readout');
    const presetChips = this.container.querySelectorAll('.preset-chip');

    const closures = state.scenario.closures || [];
    if (!closures.length) {
      if (airportSelect) airportSelect.value = DEFAULT_AIRPORT;
      if (startTimeInput) startTimeInput.value = DEFAULT_START_TIME;
      if (durationInput) durationInput.value = String(DEFAULT_DURATION_MIN);
      if (durationReadout) durationReadout.textContent = `${DEFAULT_DURATION_MIN} min (07:00 \u2013 11:00)`;
      presetChips.forEach(c => {
        const isActive = c.getAttribute('data-time') === DEFAULT_START_TIME;
        c.classList.toggle('active', isActive);
        c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      return;
    }

    const c = closures[0];
    if (airportSelect) airportSelect.value = c.airport;
    const startStr = typeof c.start === 'string' ? c.start : toHHMM(c.start);
    const endStr = typeof c.end === 'string' ? c.end : toHHMM(c.end);

    if (startTimeInput) startTimeInput.value = startStr.substring(0, 5);

    const sMin = typeof c.start === 'string' ? (Number(c.start.split(':')[0]) * MINUTES_PER_HOUR + Number(c.start.split(':')[1])) : c.start;
    const eMin = typeof c.end === 'string' ? (Number(c.end.split(':')[0]) * MINUTES_PER_HOUR + Number(c.end.split(':')[1])) : c.end;
    const dur = eMin - sMin;

    if (durationInput) {
      durationInput.value = dur;
      durationInput.setAttribute('aria-valuenow', String(dur));
      durationInput.setAttribute('aria-valuetext', `${dur} minutes (${startStr} to ${endStr} IST)`);
    }
    if (durationReadout) durationReadout.textContent = `${dur} min (${startStr} \u2013 ${endStr})`;

    presetChips.forEach(chip => {
      const isActive = chip.getAttribute('data-time') === startStr.substring(0, 5);
      chip.classList.toggle('active', isActive);
      chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }
}
