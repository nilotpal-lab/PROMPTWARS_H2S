import { state } from './state.js';
import { toHHMM } from '/engine.js';

export class ControlPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.bindEvents();
  }

  bindEvents() {
    state.on('simulation_updated', () => this.syncInputs());
    state.on('scenario_changed', () => this.syncInputs());
  }

  render() {
    if (!state.network) return;

    const airports = state.network.airports || [];

    this.container.innerHTML = `
      <div class="control-box">
        <div class="card-header">
          <div class="card-header-left">
            <span class="card-icon-beacon card-beacon-red" aria-hidden="true"></span>
            <span class="card-title">Disruption Setup</span>
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
            <select class="form-select font-mono" id="ctrl-airport">
              ${airports.map(a => `
                <option value="${a.id}" ${a.id === 'BOM' ? 'selected' : ''}>
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
            <input type="time" class="form-control font-mono" id="ctrl-start" value="07:00" />
            <div class="time-preset-strip" role="group" aria-label="Quick Time Presets">
              <button type="button" class="preset-chip font-mono" data-time="06:00">06:00</button>
              <button type="button" class="preset-chip active font-mono" data-time="07:00">07:00</button>
              <button type="button" class="preset-chip font-mono" data-time="09:00">09:00</button>
              <button type="button" class="preset-chip font-mono" data-time="11:00">11:00</button>
              <button type="button" class="preset-chip font-mono" data-time="14:00">14:00</button>
            </div>
          </div>
        </div>

        <!-- Duration Slider -->
        <div class="form-group">
          <div class="slider-header-row">
            <label class="form-label" for="ctrl-duration">Closure Duration</label>
            <span class="slider-val font-mono" id="duration-readout">240 min (07:00 &ndash; 11:00)</span>
          </div>
          <div class="slider-track-wrap">
            <input type="range" class="form-range" id="ctrl-duration" min="30" max="300" step="15" value="240" />
          </div>
          <div class="slider-tick-labels font-mono">
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
          <button class="btn btn-action-disrupt btn-block font-mono" id="btn-run-closure">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Simulate Hub Closure
          </button>
          <button class="btn btn-outline-cyan btn-block font-mono" id="btn-load-demo">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Load Benchmark: BOM 07:00&ndash;11:00 (240m)
          </button>
          <button class="btn btn-outline-amber btn-block font-mono" id="btn-load-ps-demo" title="Direct test of Problem Statement thunderstorm cascade">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            PS Prompt: BOM 90m Storm (15:00&ndash;16:30)
          </button>
        </div>

        <!-- Collapsible Rules & Assumptions -->
        <details class="assumptions-card">
          <summary class="assumptions-summary font-mono">
            <span class="summary-label">Simulation Rules &amp; Parameters</span>
            <span class="summary-chevron">&rsaquo;</span>
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

  attachDomHandlers() {
    const airportSelect = this.container.querySelector('#ctrl-airport');
    const startTimeInput = this.container.querySelector('#ctrl-start');
    const durationInput = this.container.querySelector('#ctrl-duration');
    const durationReadout = this.container.querySelector('#duration-readout');

    const updateReadout = () => {
      if (!startTimeInput || !durationInput || !durationReadout) return;
      const startVal = startTimeInput.value || '07:00';
      const dur = Number(durationInput.value);
      const [h, m] = startVal.split(':').map(Number);
      const startMin = h * 60 + m;
      const endMin = startMin + dur;
      durationReadout.textContent = `${dur} min (${toHHMM(startMin)} \u2013 ${toHHMM(endMin)})`;
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
        presetChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const t = chip.getAttribute('data-time');
        if (startTimeInput) startTimeInput.value = t;
        updateReadout();
      });
    });

    const runClosureBtn = this.container.querySelector('#btn-run-closure');
    if (runClosureBtn) {
      runClosureBtn.addEventListener('click', () => {
        const ap = airportSelect.value;
        const start = startTimeInput.value || '07:00';
        const dur = Number(durationInput.value || 240);
        state.setClosure(ap, start, dur);
      });
    }

    const loadDemoBtn = this.container.querySelector('#btn-load-demo');
    if (loadDemoBtn) {
      loadDemoBtn.addEventListener('click', () => {
        if (airportSelect) airportSelect.value = 'BOM';
        if (startTimeInput) startTimeInput.value = '07:00';
        if (durationInput) durationInput.value = '240';
        presetChips.forEach(c => {
          if (c.getAttribute('data-time') === '07:00') c.classList.add('active');
          else c.classList.remove('active');
        });
        updateReadout();
        state.setClosure('BOM', '07:00', 240);
      });
    }

    const loadPsDemoBtn = this.container.querySelector('#btn-load-ps-demo');
    if (loadPsDemoBtn) {
      loadPsDemoBtn.addEventListener('click', () => {
        if (airportSelect) airportSelect.value = 'BOM';
        if (startTimeInput) startTimeInput.value = '15:00';
        if (durationInput) durationInput.value = '90';
        presetChips.forEach(c => c.classList.remove('active'));
        updateReadout();
        state.setClosure('BOM', '15:00', 90);
      });
    }

    // Top Bar Reset Handler
    const headerResetBtn = document.getElementById('btn-header-reset');
    if (headerResetBtn) {
      headerResetBtn.onclick = () => {
        state.resetScenario();
        this.syncInputs();
      };
    }
  }

  syncInputs() {
    const airportSelect = this.container.querySelector('#ctrl-airport');
    const startTimeInput = this.container.querySelector('#ctrl-start');
    const durationInput = this.container.querySelector('#ctrl-duration');
    const durationReadout = this.container.querySelector('#duration-readout');
    const presetChips = this.container.querySelectorAll('.preset-chip');

    const closures = state.scenario.closures || [];
    if (!closures.length) {
      if (airportSelect) airportSelect.value = 'BOM';
      if (startTimeInput) startTimeInput.value = '07:00';
      if (durationInput) durationInput.value = '240';
      if (durationReadout) durationReadout.textContent = '240 min (07:00 \u2013 11:00)';
      presetChips.forEach(c => {
        if (c.getAttribute('data-time') === '07:00') c.classList.add('active');
        else c.classList.remove('active');
      });
      return;
    }

    const c = closures[0];
    if (airportSelect) airportSelect.value = c.airport;
    const startStr = typeof c.start === 'string' ? c.start : toHHMM(c.start);
    const endStr = typeof c.end === 'string' ? c.end : toHHMM(c.end);

    if (startTimeInput) startTimeInput.value = startStr.substring(0, 5);

    const sMin = typeof c.start === 'string' ? (Number(c.start.split(':')[0]) * 60 + Number(c.start.split(':')[1])) : c.start;
    const eMin = typeof c.end === 'string' ? (Number(c.end.split(':')[0]) * 60 + Number(c.end.split(':')[1])) : c.end;
    const dur = eMin - sMin;

    if (durationInput) durationInput.value = dur;
    if (durationReadout) durationReadout.textContent = `${dur} min (${startStr} \u2013 ${endStr})`;

    presetChips.forEach(chip => {
      if (chip.getAttribute('data-time') === startStr.substring(0, 5)) chip.classList.add('active');
      else chip.classList.remove('active');
    });
  }
}
