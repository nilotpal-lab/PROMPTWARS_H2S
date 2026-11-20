import { state } from './state.js';
import { toHHMM } from '/engine.js';

export class InspectorPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.activeTab = 'connections'; // 'connections' | 'crews'
    this.showAllConns = false;
    this.showAllCrews = false;
    this.bindEvents();
  }

  bindEvents() {
    state.on('simulation_updated', () => this.render());
    state.on('flight_selected', () => this.render());
    state.on('airport_selected', () => this.render());
  }

  render() {
    if (!state.simulation) return;

    this.container.innerHTML = `
      <div class="inspector-box">
        <!-- 1. Flight Root Cause Investigation -->
        <div class="inspector-section" id="why-late-section">
          ${this.renderWhyLate()}
        </div>

        <!-- 2. Detail Tabs (Missed Transfers & Crew Duty) -->
        <div class="tab-strip font-mono" role="tablist">
          <button type="button" class="tab-btn ${this.activeTab === 'connections' ? 'active' : ''}" id="tab-btn-conn" role="tab" aria-selected="${this.activeTab === 'connections'}">
            <span>Transfers (${state.simulation.connections.length})</span>
            ${state.simulation.summary.missedConnections > 0 ? `<span class="tab-badge-alert font-mono">${state.simulation.summary.missedConnections}</span>` : ''}
          </button>
          <button type="button" class="tab-btn ${this.activeTab === 'crews' ? 'active' : ''}" id="tab-btn-crew" role="tab" aria-selected="${this.activeTab === 'crews'}">
            <span>Crew Duty (${state.simulation.crews.length})</span>
            ${state.simulation.summary.crewBreaches > 0 ? `<span class="tab-badge-alert font-mono">${state.simulation.summary.crewBreaches}</span>` : ''}
          </button>
        </div>

        <div class="tab-content-area" role="tabpanel">
          ${this.activeTab === 'connections' ? this.renderConnections() : this.renderCrewDuty()}
        </div>
      </div>
    `;

    this.attachDomHandlers();
  }

  renderWhyLate() {
    const fid = state.selectedFlightId;
    if (!fid) {
      const delayed = state.simulation.flights
        .filter(f => f.status === 'delayed')
        .sort((a, b) => b.arrDelay - a.arrDelay)
        .slice(0, 3);

      return `
        <div class="inspector-empty font-mono">
          <div class="empty-header">
            <div class="empty-header-left">
              <span class="card-icon-beacon card-beacon-cyan" aria-hidden="true"></span>
              <span class="card-title">Flight Investigation</span>
            </div>
            <span class="card-chip">ROOT CAUSE</span>
          </div>
          <p class="empty-hint">Click any flight trajectory arc or Gantt bar to inspect its rotational delay provenance.</p>
          ${delayed.length ? `
            <div class="quick-pick-row">
              <span class="quick-pick-label">Peak Delays:</span>
              <div class="quick-pick-chips">
                ${delayed.map(d => `
                  <button type="button" class="quick-chip font-mono" data-flight-id="${d.flight_id}" title="Inspect flight ${d.flight_id}">
                    ${d.flight_id} (+${d.arrDelay}m)
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    const f = state.simulation.flights.find(x => x.flight_id === fid);
    if (!f) return '';

    const chain = state.getFlightExplanation(fid);

    let statusPill = `<span class="status-pill pill-nominal font-mono">ON TIME</span>`;
    if (f.status === 'delayed') {
      statusPill = `<span class="status-pill pill-warn font-mono">DELAYED +${f.arrDelay}m</span>`;
    } else if (f.status === 'cancelled') {
      statusPill = `<span class="status-pill pill-alert font-mono">CANCELLED</span>`;
    }

    return `
      <div class="root-cause-card">
        <div class="flight-headline">
          <div class="flight-headline-left">
            <span class="flight-fid font-mono">${f.flight_id}</span>
            <span class="flight-pair font-mono">${f.origin} &rarr; ${f.destination}</span>
            ${statusPill}
          </div>
          <button type="button" class="btn-text-close font-mono" id="btn-clear-flight" title="Clear flight selection">&times;</button>
        </div>

        <div class="flight-telemetry-row font-mono">
          <span>Tail: <strong>${f.aircraft}</strong></span>
          <span>Pax: <strong>${f.pax}</strong></span>
          <span>Sched: ${toHHMM(f.schedDep)}&ndash;${toHHMM(f.schedArr)}</span>
          ${f.dep != null ? `<span>Actual: <strong class="text-bright">${toHHMM(f.dep)}&ndash;${toHHMM(f.arr)}</strong></span>` : ''}
        </div>

        <div class="chain-section">
          <span class="chain-header font-mono">ROTATIONAL DELAY CASCADE</span>
          ${chain && chain.length ? `
            <div class="chain-timeline font-mono">
              ${chain.map((c, i) => `
                <div class="chain-step">
                  <span class="step-bullet">${i + 1}</span>
                  <span class="step-text">${this.formatChainStep(c)}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="chain-clear font-mono">Operates on nominal schedule without rotational propagation.</div>
          `}
        </div>
      </div>
    `;
  }

  formatChainStep(text) {
    return text
      .replace(/\+([0-9]+)\s*min/g, '<strong class="text-warn font-mono">+$1m</strong>')
      .replace(/([A-Z]{3})\s*closed/g, '<strong class="text-alert font-mono">$1 closed</strong>')
      .replace(/(DS[0-9]{4})/g, '<strong class="text-bright font-mono">$1</strong>');
  }

  renderConnections() {
    const conns = state.simulation.connections || [];
    const missed = conns.filter(c => c.status === 'missed');
    const intact = conns.filter(c => c.status !== 'missed');

    const displayList = this.showAllConns ? conns : missed;

    return `
      <div class="pane-stack">
        ${missed.length ? `
          <div class="exception-banner font-mono">
            <span>&bull; ${missed.length} Broken Transfers Detected</span>
            <button type="button" class="btn-toggle-subtle" id="toggle-all-conns">
              ${this.showAllConns ? 'Show Missed Only' : `Show All (${conns.length})`}
            </button>
          </div>
        ` : `
          <div class="nominal-banner font-mono">&check; All 21 passenger transfer pairs intact and protected.</div>
        `}

        <div class="conn-scroll-list">
          ${displayList.map(c => {
            const isMissed = c.status === 'missed';
            return `
              <div class="conn-item ${isMissed ? 'conn-item-missed' : ''}">
                <div class="conn-top font-mono">
                  <span class="conn-pair">${c.from_flight} &rarr; ${c.to_flight} <span class="conn-hub">(${c.airport})</span></span>
                  <span class="conn-badge ${isMissed ? 'badge-alert' : 'badge-ok'}">${isMissed ? 'BROKEN' : 'INTACT'}</span>
                </div>
                <div class="conn-sub font-mono">
                  <span><strong>${c.passengers}</strong> pax impacted</span> &bull; 
                  <span>${c.why || `Buffer ${c.min_connect_minutes}m`}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  renderCrewDuty() {
    const crews = state.simulation.crews || [];
    const breached = crews.filter(c => c.breach || c.slack < 0);
    const atRisk = crews.filter(c => !c.breach && c.slack >= 0 && c.atRisk);
    const problemCrews = [...breached, ...atRisk];

    const displayList = this.showAllCrews ? crews : (problemCrews.length ? problemCrews : crews);

    return `
      <div class="pane-stack">
        <div class="exception-banner font-mono">
          <span>&bull; ${breached.length} Breaches &bull; ${atRisk.length} At Risk</span>
          <button type="button" class="btn-toggle-subtle" id="toggle-all-crews">
            ${this.showAllCrews ? 'Show Exceptions' : `Show All (${crews.length})`}
          </button>
        </div>

        <div class="crew-scroll-list">
          ${displayList.map(c => {
            const netCrew = state.network.crews.find(x => x.crew_id === c.crew_id);
            const isBreach = c.breach || c.slack < 0;
            const isRisk = c.atRisk;
            const pct = Math.min(100, Math.round((c.dutyUsed / c.maxDuty) * 100));

            let barColor = 'var(--color-green)';
            let statusText = `+${c.slack}m buffer`;
            if (isBreach) {
              barColor = 'var(--color-red)';
              statusText = `BREACH (${c.dutyUsed}m)`;
            } else if (isRisk) {
              barColor = 'var(--color-amber)';
              statusText = `+${c.slack}m tight`;
            }

            return `
              <div class="crew-item ${isBreach ? 'crew-item-breach' : ''}">
                <div class="crew-top font-mono">
                  <span class="crew-code">${c.crew_id} (${netCrew?.base || 'Base'}) &bull; ${netCrew?.tail_id}</span>
                  <span class="crew-duty-readout font-mono ${isBreach ? 'color-alert' : (isRisk ? 'color-warn' : '')}">
                    ${c.dutyUsed}/${c.maxDuty}m (${statusText})
                  </span>
                </div>
                <div class="crew-bar-track">
                  <div class="crew-bar-fill" style="width: ${pct}%; background-color: ${barColor};"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  attachDomHandlers() {
    const clearBtn = this.container.querySelector('#btn-clear-flight');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => state.selectFlight(null));
    }

    const quickChips = this.container.querySelectorAll('.quick-chip');
    quickChips.forEach(chip => {
      chip.addEventListener('click', () => {
        state.selectFlight(chip.getAttribute('data-flight-id'));
      });
    });

    const tabConn = this.container.querySelector('#tab-btn-conn');
    const tabCrew = this.container.querySelector('#tab-btn-crew');

    if (tabConn) {
      tabConn.addEventListener('click', () => {
        this.activeTab = 'connections';
        this.render();
      });
    }

    if (tabCrew) {
      tabCrew.addEventListener('click', () => {
        this.activeTab = 'crews';
        this.render();
      });
    }

    const toggleConns = this.container.querySelector('#toggle-all-conns');
    if (toggleConns) {
      toggleConns.addEventListener('click', () => {
        this.showAllConns = !this.showAllConns;
        this.render();
      });
    }

    const toggleCrews = this.container.querySelector('#toggle-all-crews');
    if (toggleCrews) {
      toggleCrews.addEventListener('click', () => {
        this.showAllCrews = !this.showAllCrews;
        this.render();
      });
    }
  }
}
