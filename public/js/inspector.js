/**
 * @fileoverview Forensic Root-Cause and Telemetry Inspector for Domino Sky.
 * Investigates rotational delay provenance chains, passenger transfer connections,
 * and crew legal duty flight limits.
 *
 * Adheres to WCAG 2.1 AAA accessibility and Google Clean Code standards.
 */

import { state } from './state.js';
import { toHHMM } from '/engine.js';

export class InspectorPanel {
  /**
   * @param {HTMLElement} containerEl - DOM mount point.
   */
  constructor(containerEl) {
    if (!containerEl) throw new Error('InspectorPanel requires a valid container element');
    this.container = containerEl;
    this.activeTab = 'connections'; // 'connections' | 'crews'
    this.showAllConns = false;
    this.showAllCrews = false;
    this.bindEvents();
  }

  /**
   * Binds to state updates.
   */
  bindEvents() {
    state.on('simulation_updated', () => this.render());
    state.on('flight_selected', () => this.render());
    state.on('airport_selected', () => this.render());
  }

  /**
   * Helper to broadcast live messages to screen readers.
   * @param {string} message - Message to announce.
   */
  announce(message) {
    const announcer = document.getElementById('a11y-announcer');
    if (announcer) {
      announcer.textContent = message;
    }
  }

  /**
   * Renders the inspection deck.
   */
  render() {
    if (!state.simulation) return;

    this.container.innerHTML = `
      <div class="inspector-box" role="region" aria-labelledby="heading-inspector">
        <!-- 1. Flight Root Cause Investigation -->
        <div class="inspector-section" id="why-late-section">
          ${this.renderWhyLate()}
        </div>

        <!-- 2. Detail Tabs (Missed Transfers & Crew Duty) -->
        <div class="tab-strip font-mono" role="tablist" aria-label="Forensic Telemetry Categories">
          <button
            type="button"
            class="tab-btn ${this.activeTab === 'connections' ? 'active' : ''}"
            id="tab-btn-conn"
            role="tab"
            aria-selected="${this.activeTab === 'connections'}"
            aria-controls="tabpanel-content"
            aria-label="Passenger Transfers (${state.simulation.connections.length} total, ${state.simulation.summary.missedConnections} broken)"
          >
            <span>Transfers (${state.simulation.connections.length})</span>
            ${state.simulation.summary.missedConnections > 0 ? `<span class="tab-badge-alert font-mono" aria-hidden="true">${state.simulation.summary.missedConnections}</span>` : ''}
          </button>
          <button
            type="button"
            class="tab-btn ${this.activeTab === 'crews' ? 'active' : ''}"
            id="tab-btn-crew"
            role="tab"
            aria-selected="${this.activeTab === 'crews'}"
            aria-controls="tabpanel-content"
            aria-label="Crew Legal Duty (${state.simulation.crews.length} total, ${state.simulation.summary.crewBreaches} breaches)"
          >
            <span>Crew Duty (${state.simulation.crews.length})</span>
            ${state.simulation.summary.crewBreaches > 0 ? `<span class="tab-badge-alert font-mono" aria-hidden="true">${state.simulation.summary.crewBreaches}</span>` : ''}
          </button>
        </div>

        <div
          class="tab-content-area"
          role="tabpanel"
          id="tabpanel-content"
          aria-labelledby="${this.activeTab === 'connections' ? 'tab-btn-conn' : 'tab-btn-crew'}"
          tabindex="0"
        >
          ${this.activeTab === 'connections' ? this.renderConnections() : this.renderCrewDuty()}
        </div>
      </div>
    `;

    this.attachDomHandlers();
  }

  /**
   * Renders root-cause provenance chain for the selected flight or peak delay prompts.
   * @returns {string} HTML markup.
   */
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
              <h2 class="card-title" id="heading-inspector">Flight Investigation</h2>
            </div>
            <span class="card-chip">ROOT CAUSE</span>
          </div>
          <p class="empty-hint">Click any flight trajectory arc or Gantt bar to inspect its rotational delay provenance.</p>
          ${delayed.length ? `
            <div class="quick-pick-row" role="group" aria-label="Peak delayed flights to inspect">
              <span class="quick-pick-label">Peak Delays:</span>
              <div class="quick-pick-chips">
                ${delayed.map(d => `
                  <button type="button" class="quick-chip font-mono" data-flight-id="${d.flight_id}" aria-label="Inspect flight ${d.flight_id}, delayed by ${d.arrDelay} minutes">
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
      <div class="root-cause-card" role="region" aria-label="Root cause analysis for flight ${f.flight_id}">
        <div class="flight-headline">
          <div class="flight-headline-left">
            <span class="flight-fid font-mono">${f.flight_id}</span>
            <span class="flight-pair font-mono">${f.origin} &rarr; ${f.destination}</span>
            ${statusPill}
          </div>
          <button type="button" class="btn-text-close font-mono" id="btn-clear-flight" aria-label="Clear flight selection" title="Clear flight selection">&times;</button>
        </div>

        <div class="flight-telemetry-row font-mono">
          <span>Tail: <strong>${f.aircraft}</strong></span>
          <span>Pax: <strong>${f.pax}</strong></span>
          <span>Sched: ${toHHMM(f.schedDep)}&ndash;${toHHMM(f.schedArr)}</span>
          ${f.dep != null ? `<span>Actual: <strong class="text-bright">${toHHMM(f.dep)}&ndash;${toHHMM(f.arr)}</strong></span>` : ''}
        </div>

        <div class="chain-section">
          <h3 class="chain-header font-mono">ROTATIONAL DELAY CASCADE</h3>
          ${chain && chain.length ? `
            <ol class="chain-timeline font-mono" aria-label="Cascade causality sequence">
              ${chain.map((c, i) => `
                <li class="chain-step">
                  <span class="step-bullet" aria-hidden="true">${i + 1}</span>
                  <span class="step-text">${this.formatChainStep(c)}</span>
                </li>
              `).join('')}
            </ol>
          ` : `
            <div class="chain-clear font-mono">Operates on nominal schedule without rotational propagation.</div>
          `}
        </div>
      </div>
    `;
  }

  /**
   * Formats cascade step text with semantic styling.
   * @param {string} text - Raw cascade description.
   * @returns {string} Formatted HTML.
   */
  formatChainStep(text) {
    return text
      .replace(/\+([0-9]+)\s*min/g, '<strong class="text-warn font-mono">+$1m</strong>')
      .replace(/([A-Z]{3})\s*closed/g, '<strong class="text-alert font-mono">$1 closed</strong>')
      .replace(/(DS[0-9]{4})/g, '<strong class="text-bright font-mono">$1</strong>');
  }

  /**
   * Renders the passenger transfer connections list.
   * @returns {string} HTML markup.
   */
  renderConnections() {
    const conns = state.simulation.connections || [];
    const missed = conns.filter(c => c.status === 'missed');
    const displayList = this.showAllConns ? conns : missed;

    return `
      <div class="pane-stack">
        ${missed.length ? `
          <div class="exception-banner font-mono" role="status">
            <span>&bull; ${missed.length} Broken Transfers Detected</span>
            <button type="button" class="btn-toggle-subtle" id="toggle-all-conns" aria-label="${this.showAllConns ? 'Show only missed transfers' : 'Show all 21 transfers'}">
              ${this.showAllConns ? 'Show Missed Only' : `Show All (${conns.length})`}
            </button>
          </div>
        ` : `
          <div class="nominal-banner font-mono" role="status">&check; All 21 passenger transfer pairs intact and protected.</div>
        `}

        <div class="conn-scroll-list" role="list" aria-label="Transfer connections list">
          ${displayList.map(c => {
            const isMissed = c.status === 'missed';
            return `
              <div class="conn-item ${isMissed ? 'conn-item-missed' : ''}" role="listitem">
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

  /**
   * Renders the crew legal duty analysis and limit bars.
   * @returns {string} HTML markup.
   */
  renderCrewDuty() {
    const crews = state.simulation.crews || [];
    const breached = crews.filter(c => c.breach || c.slack < 0);
    const atRisk = crews.filter(c => !c.breach && c.slack >= 0 && c.atRisk);
    const problemCrews = [...breached, ...atRisk];
    const displayList = this.showAllCrews ? crews : (problemCrews.length ? problemCrews : crews);

    return `
      <div class="pane-stack">
        <div class="exception-banner font-mono" role="status">
          <span>&bull; ${breached.length} Breaches &bull; ${atRisk.length} At Risk</span>
          <button type="button" class="btn-toggle-subtle" id="toggle-all-crews" aria-label="${this.showAllCrews ? 'Show only breached and at-risk crews' : 'Show all 16 crews'}">
            ${this.showAllCrews ? 'Show Exceptions' : `Show All (${crews.length})`}
          </button>
        </div>

        <div class="crew-scroll-list" role="list" aria-label="Crew duty rosters">
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
              <div class="crew-item ${isBreach ? 'crew-item-breach' : ''}" role="listitem">
                <div class="crew-top font-mono">
                  <span class="crew-code">${c.crew_id} (${netCrew?.base || 'Base'}) &bull; ${netCrew?.tail_id}</span>
                  <span class="crew-duty-readout font-mono ${isBreach ? 'color-alert' : (isRisk ? 'color-warn' : '')}">
                    ${c.dutyUsed}/${c.maxDuty}m (${statusText})
                  </span>
                </div>
                <div class="crew-bar-track" role="progressbar" aria-valuenow="${c.dutyUsed}" aria-valuemin="0" aria-valuemax="${c.maxDuty}" aria-label="Crew ${c.crew_id} duty: ${c.dutyUsed} of ${c.maxDuty} minutes used">
                  <div class="crew-bar-fill" style="width: ${pct}%; background-color: ${barColor};"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Attaches event listeners.
   */
  attachDomHandlers() {
    const clearBtn = this.container.querySelector('#btn-clear-flight');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.selectFlight(null);
        this.announce('Flight selection cleared.');
      });
    }

    const quickChips = this.container.querySelectorAll('.quick-chip');
    quickChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const fid = chip.getAttribute('data-flight-id');
        state.selectFlight(fid);
        this.announce(`Selected flight ${fid} for root cause inspection.`);
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
