/**
 * @fileoverview AI Recovery Dispatch Controller for Domino Sky.
 * Interacts with /api/dispatch to retrieve recovery plans computed by the
 * deterministic engine and explained by Gemini AI via audited placeholder substitution.
 *
 * Adheres to WCAG 2.1 AAA accessibility standards and Google clean code principles.
 */

import { state } from './state.js';

/**
 * Escapes unsafe characters for HTML rendering to prevent XSS.
 * @param {string} str - Raw string.
 * @returns {string} Sanitized string.
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * DispatcherPanel manages the AI dispatch solver, impact comparison table, and plan application toggle.
 */
export class DispatcherPanel {
  /**
   * @param {HTMLElement} containerEl - DOM mount point.
   */
  constructor(containerEl) {
    if (!containerEl) throw new Error('DispatcherPanel requires a valid container element');
    this.container = containerEl;
    this.isLoading = false;
    this.error = null;
    this.bindEvents();
  }

  /**
   * Binds global state updates.
   * @returns {void}
   */
  bindEvents() {
    state.on('scenario_changed', () => this.render());
    state.on('recovery_plan_loaded', () => this.render());
    state.on('plan_toggled', () => this.render());
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
   * Fetches an optimized recovery plan from the server endpoint.
   * @returns {Promise<void>}
   */
  async fetchRecoveryPlan() {
    const closures = state.scenario.closures || [];
    if (!closures.length) {
      this.error = 'Select a hub closure scenario before running recovery dispatch.';
      this.render();
      this.announce('Error: Select a hub closure scenario before running recovery dispatch.');
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.render();
    this.announce('Computing optimal recovery dispatch recommendations via engine and Gemini AI...');

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
      if (data.before && data.after) {
        this.announce(
          `Recovery plan solved. Stranded passengers reduced from ${data.before.strandedPax} to ${data.after.strandedPax}. ${data.plan?.length || 0} corrective actions recommended.`
        );
      }
    } catch (err) {
      console.error('Error fetching recovery plan:', err);
      this.error = err.message;
      this.announce(`Recovery dispatch failed: ${err.message}`);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /**
   * Renders the dispatcher UI deck.
   * @returns {void}
   */
  render() {
    const data = state.recoveryData;
    const isPlanApplied = state.isPlanApplied;
    const hasClosure = Boolean(state.scenario.closures && state.scenario.closures.length);

    this.container.innerHTML = `
      <div class="dispatcher-box" role="region" aria-labelledby="heading-dispatcher">
        <div class="card-header">
          <div class="card-header-left">
            <span class="card-icon-beacon card-beacon-cyan" aria-hidden="true"></span>
            <h2 class="card-title" id="heading-dispatcher">AI Recovery Dispatch</h2>
          </div>

          <button
            class="btn btn-primary btn-sm font-mono ${this.isLoading ? 'btn-loading' : ''}"
            id="btn-get-plan"
            aria-label="${data ? 'Re-solve recovery plan using AI dispatcher' : 'Solve recovery plan using AI dispatcher'}"
            aria-busy="${this.isLoading ? 'true' : 'false'}"
            ${this.isLoading ? 'disabled' : ''}
          >
            ${this.isLoading ? `
              <span class="spinner-dot" aria-hidden="true"></span> Solving...
            ` : `
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="12 8 8 12 12 16 12 8"/>
                <line x1="16" y1="12" x2="12" y2="12"/>
              </svg>
              ${data ? 'Re-Solve Plan' : 'Solve Recovery'}
            `}
          </button>
        </div>

        ${this.error ? `
          <div class="alert-box alert-error font-mono" role="alert">
            <span class="alert-icon" aria-hidden="true">&excl;</span>
            <span>${escapeHtml(this.error)}</span>
          </div>
        ` : ''}

        ${!data && !this.isLoading ? `
          <div class="dispatcher-standby-card font-mono" role="status">
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

  /**
   * Renders the computed plan details including verification stamp, metrics comparison, and narrative.
   * @param {Object} data - Recovery plan payload from dispatcher.
   * @param {boolean} isPlanApplied - Current state of plan toggle.
   * @returns {string} HTML markup.
   */
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
      <div class="plan-body" aria-live="polite">
        <!-- Verification Strip -->
        <div class="verification-row font-mono" role="status" aria-label="Verification source: ${sourceLabel}">
          <div class="verification-badge ${isVerified ? 'verified-pass' : 'verified-fail'}">
            <span class="verified-glyph" aria-hidden="true">&check;</span>
            <span class="verified-text">Numbers verified against engine</span>
          </div>
          <span class="verified-origin">${sourceLabel}</span>
        </div>

        <!-- Headline -->
        ${headline ? `
          <div class="plan-callout" role="region" aria-label="Plan Headline">
            <p class="plan-callout-text">${escapeHtml(headline)}</p>
          </div>
        ` : ''}

        <!-- Apply Plan Hardware Switch -->
        <div class="toggle-card">
          <div class="toggle-meta">
            <label class="toggle-title" for="toggle-apply-plan">Apply Recovery Plan</label>
            <span class="toggle-hint font-mono">Inject swaps &amp; cancellations into live timeline</span>
          </div>
          <label class="toggle-switch">
            <input
              type="checkbox"
              id="toggle-apply-plan"
              role="switch"
              aria-checked="${isPlanApplied ? 'true' : 'false'}"
              aria-label="Apply AI recovery plan to flight schedule and live timeline"
              ${isPlanApplied ? 'checked' : ''}
            />
            <span class="toggle-slider" aria-hidden="true"></span>
          </label>
        </div>

        <!-- Before / After Impact Table -->
        <div class="sub-table-wrap">
          <div class="table-header-row">
            <h3 class="sub-table-title font-mono" id="table-impact-title">IMPACT COMPARISON</h3>
            <span class="table-badge font-mono">${isPlanApplied ? 'APPLIED' : 'PREVIEW'}</span>
          </div>
          <table class="data-table font-mono" aria-labelledby="table-impact-title">
            <caption class="sr-only">Detailed breakdown comparing baseline disrupted operations with recovered operations after applying the AI recovery plan.</caption>
            <thead>
              <tr>
                <th scope="col">Telemetry</th>
                <th scope="col" class="num-col">Disrupted</th>
                <th scope="col" class="num-col">Recovered</th>
                <th scope="col" class="num-col">Net Shift</th>
              </tr>
            </thead>
            <tbody>
              <tr class="table-row-hero">
                <th scope="row"><strong class="metric-strong">Stranded Pax</strong></th>
                <td class="num-col text-dim">${b.strandedPax ?? '-'}</td>
                <td class="num-col text-bright">${a.strandedPax ?? '-'}</td>
                <td class="num-col">${renderDelta(deltaPax)}</td>
              </tr>
              <tr>
                <th scope="row">Cancelled Flights</th>
                <td class="num-col text-dim">${b.cancelledFlights ?? '-'}</td>
                <td class="num-col text-bright">${a.cancelledFlights ?? '-'}</td>
                <td class="num-col">${renderDelta(deltaCancel)}</td>
              </tr>
              <tr>
                <th scope="row">Delayed Flights</th>
                <td class="num-col text-dim">${b.delayedFlights ?? '-'}</td>
                <td class="num-col text-bright">${a.delayedFlights ?? '-'}</td>
                <td class="num-col">${renderDelta(deltaDelay)}</td>
              </tr>
              <tr>
                <th scope="row">Crew Breaches</th>
                <td class="num-col text-dim">${b.crewBreaches ?? '-'}</td>
                <td class="num-col text-bright">${a.crewBreaches ?? '-'}</td>
                <td class="num-col">${renderDelta(deltaBreach)}</td>
              </tr>
              <tr>
                <th scope="row">Total Delay</th>
                <td class="num-col text-dim">${b.totalDelayMin != null ? b.totalDelayMin + 'm' : '-'}</td>
                <td class="num-col text-bright">${a.totalDelayMin != null ? a.totalDelayMin + 'm' : '-'}</td>
                <td class="num-col">${renderDelta(deltaTotalDelay, 'm')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Recommended Actions List -->
        <div class="steps-container">
          <h3 class="sub-table-title font-mono" id="heading-dispatch-orders">DISPATCH ORDERS (${steps.length})</h3>
          ${steps.length ? `
            <ol class="step-stack" aria-labelledby="heading-dispatch-orders">
              ${steps.map((s, idx) => `
                <li class="step-row">
                  <div class="step-num font-mono" aria-hidden="true">${idx + 1}</div>
                  <div class="step-detail">
                    <div class="step-action-text font-mono">${escapeHtml(s.action)}</div>
                    <div class="step-rationale-text">${escapeHtml(s.rationale)}</div>
                  </div>
                </li>
              `).join('')}
            </ol>
          ` : `
            <div class="step-empty font-mono">No corrective actions recommended.</div>
          `}
        </div>

        <!-- Operational Summary -->
        ${summary ? `
          <div class="plan-summary-card" role="region" aria-labelledby="heading-operational-rationale">
            <h3 class="summary-caption font-mono" id="heading-operational-rationale">OPERATIONAL RATIONALE</h3>
            <p class="summary-body">${escapeHtml(summary)}</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Attaches event listeners to interactive controls.
   * @returns {void}
   */
  attachDomHandlers() {
    const getPlanBtn = this.container.querySelector('#btn-get-plan');
    if (getPlanBtn) {
      getPlanBtn.addEventListener('click', () => this.fetchRecoveryPlan());
    }

    const toggleInput = this.container.querySelector('#toggle-apply-plan');
    if (toggleInput) {
      toggleInput.addEventListener('change', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        const checked = Boolean(target.checked);
        state.toggleApplyPlan(checked);
        toggleInput.setAttribute('aria-checked', checked ? 'true' : 'false');
        this.announce(checked ? 'AI recovery plan applied to schedule and timeline.' : 'AI recovery plan removed from timeline.');
      });
    }
  }
}
