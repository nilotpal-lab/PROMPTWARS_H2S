import { state } from './state.js';

export class KpiPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.bindEvents();
  }

  bindEvents() {
    state.on('simulation_updated', () => this.render());
    state.on('plan_toggled', () => this.render());
  }

  render() {
    if (!state.simulation || !state.simulation.summary) {
      this.container.innerHTML = `<div class="kpi-empty font-mono">Awaiting simulation data...</div>`;
      return;
    }

    const s = state.simulation.summary;
    const isPlanApplied = state.isPlanApplied;

    const formatHours = (m) => {
      const h = Math.floor(m / 60);
      const rem = m % 60;
      return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
    };

    const hasImpact = s.strandedPax > 0 || s.cancelledFlights > 0 || s.delayedFlights > 0;

    this.container.innerHTML = `
      <div class="kpi-deck">
        <div class="card-header">
          <div class="card-header-left">
            <span class="card-icon-beacon ${hasImpact ? 'card-beacon-amber' : 'card-beacon-green'}" aria-hidden="true"></span>
            <span class="card-title">Network Impact</span>
          </div>
          <span class="card-chip font-mono ${isPlanApplied ? 'chip-applied' : 'chip-disrupted'}">
            ${isPlanApplied ? 'PLAN APPLIED' : (hasImpact ? 'DISRUPTED' : 'NOMINAL')}
          </span>
        </div>

        <!-- 1. HERO METRIC: Stranded Passengers -->
        <div class="metric-hero ${s.strandedPax > 0 ? 'metric-alert' : 'metric-nominal'}">
          <div class="hero-top">
            <div class="hero-title-group">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span class="hero-label">Stranded Passengers</span>
            </div>
            <span class="hero-chip font-mono ${s.strandedPax > 0 ? 'hero-chip-alert' : 'hero-chip-ok'}">
              ${s.strandedPax > 0 ? 'Direct Impact' : 'Zero Disruption'}
            </span>
          </div>

          <div class="hero-figure-row">
            <span class="hero-number font-mono ${s.strandedPax > 0 ? 'color-alert' : 'color-nominal'}">${s.strandedPax.toLocaleString()}</span>
            <span class="hero-denom font-mono">passengers stranded</span>
          </div>

          <div class="hero-split-bar font-mono">
            <span class="split-item">
              <strong class="split-num font-mono">${s.strandedFromCancellations.toLocaleString()}</strong> via Cancellations
            </span>
            <span class="split-sep" aria-hidden="true">&bull;</span>
            <span class="split-item">
              <strong class="split-num font-mono">${s.strandedFromMissedConnections.toLocaleString()}</strong> Broken Transfers
            </span>
          </div>
        </div>

        <!-- 2. COMPACT SECONDARY METRICS: 2x2 Grid -->
        <div class="kpi-quad">
          <div class="quad-card ${s.delayedFlights > 0 ? 'card-warn' : ''}">
            <div class="quad-header">
              <span class="quad-label">Delayed Flights</span>
              <span class="quad-dot ${s.delayedFlights > 0 ? 'dot-warn' : 'dot-ok'}" aria-hidden="true"></span>
            </div>
            <div class="quad-figure">
              <span class="quad-val font-mono">${s.delayedFlights}</span>
              <span class="quad-denom font-mono">/ ${s.operated}</span>
            </div>
            <span class="quad-sub font-mono">${s.delayedFlights > 0 ? `Max +${s.maxDelayMin}m` : 'Nominal'}</span>
          </div>

          <div class="quad-card ${s.cancelledFlights > 0 ? 'card-alert' : ''}">
            <div class="quad-header">
              <span class="quad-label">Cancelled Flights</span>
              <span class="quad-dot ${s.cancelledFlights > 0 ? 'dot-alert' : 'dot-ok'}" aria-hidden="true"></span>
            </div>
            <div class="quad-figure">
              <span class="quad-val font-mono ${s.cancelledFlights > 0 ? 'color-alert' : ''}">${s.cancelledFlights}</span>
              <span class="quad-denom font-mono">/ ${s.totalFlights}</span>
            </div>
            <span class="quad-sub font-mono">${s.cancelledFlights > 0 ? `${Math.round((s.cancelledFlights / s.totalFlights) * 100)}% of fleet` : 'All Operating'}</span>
          </div>

          <div class="quad-card ${s.missedConnections > 0 ? 'card-alert' : ''}">
            <div class="quad-header">
              <span class="quad-label">Missed Transfers</span>
              <span class="quad-dot ${s.missedConnections > 0 ? 'dot-alert' : 'dot-ok'}" aria-hidden="true"></span>
            </div>
            <div class="quad-figure">
              <span class="quad-val font-mono ${s.missedConnections > 0 ? 'color-alert' : ''}">${s.missedConnections}</span>
              <span class="quad-denom font-mono">/ 21</span>
            </div>
            <span class="quad-sub font-mono">${s.missedConnections > 0 ? `${s.strandedFromMissedConnections} pax lost` : 'All Intact'}</span>
          </div>

          <div class="quad-card ${s.crewBreaches > 0 ? 'card-alert' : ''}">
            <div class="quad-header">
              <span class="quad-label">Crew Breaches</span>
              <span class="quad-dot ${s.crewBreaches > 0 ? 'dot-alert' : 'dot-ok'}" aria-hidden="true"></span>
            </div>
            <div class="quad-figure">
              <span class="quad-val font-mono ${s.crewBreaches > 0 ? 'color-alert' : ''}">${s.crewBreaches}</span>
              <span class="quad-denom font-mono">/ 16</span>
            </div>
            <span class="quad-sub font-mono">${s.crewBreaches > 0 ? 'FDP Exceeded' : 'All Legal'}</span>
          </div>
        </div>

        <!-- 3. FLEET DELAY STRIP -->
        <div class="metric-strip ${s.totalDelayMin > 0 ? 'strip-warn' : ''}">
          <div class="strip-left">
            <span class="strip-label">Fleet Cumulative Delay</span>
            <span class="strip-meta font-mono">${s.airportsAffected} Hubs Impacted &bull; ${formatHours(s.totalDelayMin)} total</span>
          </div>
          <span class="strip-number font-mono ${s.totalDelayMin > 0 ? 'color-warn' : 'color-nominal'}">${s.totalDelayMin.toLocaleString()}m</span>
        </div>
      </div>
    `;
  }
}
