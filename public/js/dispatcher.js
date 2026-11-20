import { state } from './state.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class DispatcherPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.isLoading = false;
    this.error = null;
    this.bindEvents();
  }

  bindEvents() {
    state.on('scenario_changed', () => this.render());
    state.on('recovery_plan_loaded', () => this.render());
    state.on('plan_toggled', () => this.render());
  }

  async fetchRecoveryPlan() {
    const closures = state.scenario.closures || [];
    if (!closures.length) {
      this.error = 'Select a hub closure scenario before running recovery dispatch.';
      this.render();
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closures,
          actions: []
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Dispatch request returned HTTP ${res.status}`);
      }

      const data = await res.json();
      state.setRecoveryPlan(data);
      const announcer = document.getElementById('a11y-announcer');
      if (announcer && data.before && data.after) {
        announcer.textContent = `Recovery plan generated. Stranded passengers reduced from ${data.before.strandedPax} to ${data.after.strandedPax}.`;
      }
    } catch (err) {
      console.error('Error fetching recovery plan:', err);
      this.error = err.message;
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  render() {
    const data = state.recoveryData;
    const isPlanApplied = state.isPlanApplied;
    const hasClosure = !!(state.scenario.closures && state.scenario.closures.length);

    this.container.innerHTML = `
      <div class="dispatcher-box">
        <div class="card-header">
          <div class="card-header-left">
            <span class="card-icon-beacon card-beacon-cyan" aria-hidden="true"></span>
            <span class="card-title">AI Recovery Dispatch</span>
          </div>

          <button class="btn btn-primary btn-sm font-mono ${this.isLoading ? 'btn-loading' : ''}" id="btn-get-plan" ${this.isLoading ? 'disabled' : ''}>
            ${this.isLoading ? `
              <span class="spinner-dot"></span> Solving...
            ` : `
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="12 8 8 12 12 16 12 8"/>
                <line x1="16" y1="12" x2="12" y2="12"/>
              </svg>
              ${data ? 'Re-Solve Plan' : 'Solve Recovery'}
            `}
          </button>
        </div>

        ${this.error ? `
          <div class="alert-box alert-error font-mono">
            <span class="alert-icon">&excl;</span>
            <span>${escapeHtml(this.error)}</span>
          </div>
        ` : ''}

        ${!data && !this.isLoading ? `
          <div class="dispatcher-standby-card font-mono">
            <div class="standby-status-row">
              <span class="standby-tag ${hasClosure ? 'tag-ready' : 'tag-idle'}">${hasClosure ? 'READY TO SOLVE' : 'AWAITING DISRUPTION'}</span>
              <span class="standby-slots">Spare Fleet: 2 Aircraft (DEL, BLR)</span>
            </div>
            <p class="standby-text">
              ${hasClosure
                ? 'Hub disruption detected. Click <strong>Solve Recovery</strong> to compute optimal spare ferry swaps and proactive cancellation chains.'
                : 'Run a hub disruption above, then dispatch AI optimization to protect connecting passengers and clear rotational bottlenecks.'}
            </p>
          </div>
        ` : ''}

        ${data ? this.renderPlanDetails(data, isPlanApplied) : ''}
      </div>
    `;

    this.attachDomHandlers();
  }

  renderPlanDetails(data, isPlanApplied) {
    const b = data.before || {};
    const a = data.after || {};
    const narrative = data.narrative || {};
    const headline = narrative.headline || '';
    const summary = narrative.summary || '';
    const steps = narrative.steps || [];
    const verification = data.verification || {};
    const isVerified = verification.numbersVerifiedAgainstEngine;
    const sourceLabel = verification.source === 'gemini' ? 'Gemini AI (Placeholder-Verified)' : 'Deterministic Engine Template';

    const deltaPax = (a.strandedPax || 0) - (b.strandedPax || 0);
    const deltaCancel = (a.cancelledFlights || 0) - (b.cancelledFlights || 0);
    const deltaDelay = (a.delayedFlights || 0) - (b.delayedFlights || 0);
    const deltaBreach = (a.crewBreaches || 0) - (b.crewBreaches || 0);
    const deltaTotalDelay = (a.totalDelayMin || 0) - (b.totalDelayMin || 0);

    const renderDelta = (val, suffix = '', inverse = false) => {
      if (val === 0) return `<span class="delta-flat font-mono">0${suffix}</span>`;
      const isImprovement = inverse ? val > 0 : val < 0;
      const sign = val > 0 ? '+' : '';
      return `<span class="delta-chip font-mono ${isImprovement ? 'delta-pos' : 'delta-neg'}">${sign}${val}${suffix}</span>`;
    };

    return `
      <div class="plan-body">
        <!-- Verification Strip -->
        <div class="verification-row font-mono">
          <div class="verification-badge ${isVerified ? 'verified-pass' : 'verified-fail'}">
            <span class="verified-glyph">&check;</span>
            <span class="verified-text">Numbers verified against engine</span>
          </div>
          <span class="verified-origin">${sourceLabel}</span>
        </div>

        <!-- Headline -->
        ${headline ? `
          <div class="plan-callout">
            <p class="plan-callout-text">${escapeHtml(headline)}</p>
          </div>
        ` : ''}

        <!-- Apply Plan Hardware Switch -->
        <div class="toggle-card">
          <div class="toggle-meta">
            <span class="toggle-title">Apply Recovery Plan</span>
            <span class="toggle-hint font-mono">Inject swaps &amp; cancellations into live timeline</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="toggle-apply-plan" ${isPlanApplied ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <!-- Before / After Impact Table -->
        <div class="sub-table-wrap">
          <div class="table-header-row">
            <span class="sub-table-title font-mono">IMPACT COMPARISON</span>
            <span class="table-badge font-mono">${isPlanApplied ? 'APPLIED' : 'PREVIEW'}</span>
          </div>
          <table class="data-table font-mono">
            <thead>
              <tr>
                <th>Telemetry</th>
                <th class="num-col">Disrupted</th>
                <th class="num-col">Recovered</th>
                <th class="num-col">Net Shift</th>
              </tr>
            </thead>
            <tbody>
              <tr class="table-row-hero">
                <td><strong class="metric-strong">Stranded Pax</strong></td>
                <td class="num-col text-dim">${b.strandedPax ?? '-'}</td>
                <td class="num-col text-bright">${a.strandedPax ?? '-'}</td>
                <td class="num-col">${renderDelta(deltaPax)}</td>
              </tr>
              <tr>
                <td>Cancelled Flights</td>
                <td class="num-col text-dim">${b.cancelledFlights ?? '-'}</td>
                <td class="num-col text-bright">${a.cancelledFlights ?? '-'}</td>
                <td class="num-col">${renderDelta(deltaCancel)}</td>
              </tr>
              <tr>
                <td>Delayed Flights</td>
                <td class="num-col text-dim">${b.delayedFlights ?? '-'}</td>
                <td class="num-col text-bright">${a.delayedFlights ?? '-'}</td>
                <td class="num-col">${renderDelta(deltaDelay)}</td>
              </tr>
              <tr>
                <td>Crew Breaches</td>
                <td class="num-col text-dim">${b.crewBreaches ?? '-'}</td>
                <td class="num-col text-bright">${a.crewBreaches ?? '-'}</td>
                <td class="num-col">${renderDelta(deltaBreach)}</td>
              </tr>
              <tr>
                <td>Total Delay</td>
                <td class="num-col text-dim">${b.totalDelayMin != null ? b.totalDelayMin + 'm' : '-'}</td>
                <td class="num-col text-bright">${a.totalDelayMin != null ? a.totalDelayMin + 'm' : '-'}</td>
                <td class="num-col">${renderDelta(deltaTotalDelay, 'm')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Recommended Actions List -->
        <div class="steps-container">
          <span class="sub-table-title font-mono">DISPATCH ORDERS (${steps.length})</span>
          ${steps.length ? `
            <div class="step-stack">
              ${steps.map((s, idx) => `
                <div class="step-row">
                  <div class="step-num font-mono">${idx + 1}</div>
                  <div class="step-detail">
                    <div class="step-action-text font-mono">${escapeHtml(s.action)}</div>
                    <div class="step-rationale-text">${escapeHtml(s.rationale)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="step-empty font-mono">No corrective actions recommended.</div>
          `}
        </div>

        <!-- Operational Summary -->
        ${summary ? `
          <div class="plan-summary-card">
            <span class="summary-caption font-mono">OPERATIONAL RATIONALE</span>
            <p class="summary-body">${escapeHtml(summary)}</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  attachDomHandlers() {
    const getPlanBtn = this.container.querySelector('#btn-get-plan');
    if (getPlanBtn) {
      getPlanBtn.addEventListener('click', () => this.fetchRecoveryPlan());
    }

    const toggleInput = this.container.querySelector('#toggle-apply-plan');
    if (toggleInput) {
      toggleInput.addEventListener('change', (e) => {
        state.toggleApplyPlan(e.target.checked);
      });
    }
  }
}
