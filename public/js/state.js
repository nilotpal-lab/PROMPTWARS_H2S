/**
 * @fileoverview Central Reactive State Store for Domino Sky.
 * Manages the single source of truth for disruption scenarios, active simulations,
 * flight selections, temporal scrubber position, playback animation, and recovery plans.
 *
 * Core architectural invariant:
 * engine.js is the sole source of truth for every delay, passenger and crew number.
 */

import { simulate, explainFlight, toHHMM } from '/engine.js';

/** Default operational parameters for time scrubber and simulation clock */
const MIN_TIME_MIN = 300; // 05:00 IST
const MAX_TIME_MIN = 1440; // 24:00 IST
const REWIND_THRESHOLD_MIN = 1435; // 23:55 IST
const DEFAULT_PLAYBACK_SPEED = 2; // 2 minutes of sim time per tick
const PLAYBACK_TICK_MS = 50;
const MINUTES_PER_HOUR = 60;

/**
 * @typedef {Object} ClosureEntry
 * @property {string} airport - 3-letter IATA code.
 * @property {string} start - HH:MM IST string.
 * @property {string} end - HH:MM IST string.
 */

/**
 * @typedef {Object} ActionEntry
 * @property {'cancel'|'swap'} type - Type of recovery action.
 * @property {string} flight_id - Flight identifier.
 * @property {string} [spare] - Spare tail ID if swap.
 */

/**
 * @typedef {Object} Scenario
 * @property {ClosureEntry[]} closures - Hub airport closure windows.
 * @property {ActionEntry[]} actions - Interventions applied to network.
 */

/**
 * AppState coordinates client-side state transitions, event dispatching,
 * and deterministic simulation invocation.
 */
class AppState {
  /**
   * Initializes the application state instance with nominal defaults.
   */
  constructor() {
    /** @type {Object|null} */
    this.network = null;

    /** @type {Scenario} */
    this.scenario = { closures: [], actions: [] };

    /** @type {Object|null} */
    this.recoveryData = null;

    /** @type {boolean} */
    this.isPlanApplied = false;

    /** @type {Object|null} */
    this.simulation = null;

    /** @type {string|null} */
    this.selectedFlightId = null;

    /** @type {string|null} */
    this.selectedAirportId = null;

    /** @type {number} */
    this.currentTime = MAX_TIME_MIN;

    /** @type {boolean} */
    this.isPlaying = false;

    /** @type {number} */
    this.playbackSpeed = DEFAULT_PLAYBACK_SPEED;

    /** @type {boolean} */
    this.revealAll = true;

    /** @type {Object<string, Array<function(*): void>>} */
    this.subscribers = {};

    /** @type {number|null} */
    this.animationTimer = null;
  }

  /**
   * Loads network topology from server and executes initial nominal simulation.
   * @returns {Promise<void>}
   * @throws {Error} If fetching flight network fails.
   */
  async init() {
    const res = await fetch('/flight_network.json');
    if (!res.ok) {
      throw new Error(`Failed to load flight_network.json: HTTP ${res.status}`);
    }
    this.network = await res.json();
    this.runSimulation();
  }

  /**
   * Subscribes a listener callback to an application state event.
   * @param {string} event - Name of event.
   * @param {function(*): void} cb - Listener callback.
   * @returns {void}
   */
  on(event, cb) {
    if (!this.subscribers[event]) {
      this.subscribers[event] = [];
    }
    this.subscribers[event].push(cb);
  }

  /**
   * Broadcasts an event to all registered listeners.
   * @param {string} event - Name of event.
   * @param {*} [data] - Event payload.
   * @returns {void}
   */
  emit(event, data) {
    const listeners = this.subscribers[event];
    if (listeners && listeners.length) {
      for (const cb of listeners) {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in subscriber for event "${event}":`, err);
        }
      }
    }
  }

  /**
   * Computes the effective scenario reflecting whether the recovery plan is applied.
   * @returns {Scenario}
   */
  getEffectiveScenario() {
    const actions = this.isPlanApplied && this.recoveryData?.plan
      ? [...this.recoveryData.plan]
      : [...(this.scenario.actions || [])];
    return {
      closures: [...(this.scenario.closures || [])],
      actions
    };
  }

  /**
   * Runs deterministic simulation engine with current effective scenario.
   * @returns {void}
   */
  runSimulation() {
    if (!this.network) return;
    const effectiveScenario = this.getEffectiveScenario();
    this.simulation = simulate(this.network, effectiveScenario);

    this.emit('simulation_updated', {
      simulation: this.simulation,
      scenario: effectiveScenario,
      isPlanApplied: this.isPlanApplied
    });
  }

  /**
   * Configures a single hub closure scenario and resets recovery plan.
   * @param {string} airport - 3-letter IATA code of airport to close.
   * @param {string} startHHMM - Start time in HH:MM IST.
   * @param {number|string} durationMin - Duration in minutes.
   * @returns {void}
   */
  setClosure(airport, startHHMM, durationMin) {
    const [h, m] = startHHMM.split(':').map(Number);
    const start = h * MINUTES_PER_HOUR + m;
    const end = start + Number(durationMin);

    this.scenario.closures = [{
      airport,
      start: toHHMM(start),
      end: toHHMM(end)
    }];

    // Invalidate previously computed recovery plan on scenario change
    this.isPlanApplied = false;
    this.recoveryData = null;
    this.runSimulation();
    this.emit('scenario_changed', this.scenario);
  }

  /**
   * Resets simulation to pristine nominal baseline without disruptions.
   * @returns {void}
   */
  resetScenario() {
    this.stopPlayback();
    this.scenario = { closures: [], actions: [] };
    this.recoveryData = null;
    this.isPlanApplied = false;
    this.selectedFlightId = null;
    this.selectedAirportId = null;
    this.currentTime = MAX_TIME_MIN;
    this.revealAll = true;
    this.runSimulation();
    this.emit('scenario_changed', this.scenario);
    this.emit('flight_selected', null);
    this.emit('airport_selected', null);
    this.emit('time_updated', this.currentTime);
  }

  /**
   * Selects or toggles a flight for forensic root cause analysis.
   * @param {string|null} flightId - Flight ID or null to deselect.
   * @returns {void}
   */
  selectFlight(flightId) {
    if (this.selectedFlightId === flightId) {
      this.selectedFlightId = null;
    } else {
      this.selectedFlightId = flightId;
      this.selectedAirportId = null;
    }
    this.emit('flight_selected', this.selectedFlightId);
  }

  /**
   * Selects or toggles an airport for radar focus.
   * @param {string|null} airportId - Airport code or null to deselect.
   * @returns {void}
   */
  selectAirport(airportId) {
    if (this.selectedAirportId === airportId) {
      this.selectedAirportId = null;
    } else {
      this.selectedAirportId = airportId;
      this.selectedFlightId = null;
    }
    this.emit('airport_selected', this.selectedAirportId);
  }

  /**
   * Stores recovery plan returned by AI dispatcher.
   * @param {Object} data - Recovery plan payload.
   * @returns {void}
   */
  setRecoveryPlan(data) {
    this.recoveryData = data;
    this.emit('recovery_plan_loaded', data);
  }

  /**
   * Toggles application of AI recovery actions into live simulation schedule.
   * @param {boolean} [applied] - Explicit state or toggle if undefined.
   * @returns {void}
   */
  toggleApplyPlan(applied) {
    this.isPlanApplied = applied !== undefined ? Boolean(applied) : !this.isPlanApplied;
    this.runSimulation();
    this.emit('plan_toggled', this.isPlanApplied);
  }

  /**
   * Updates playback scrubber position in minutes from midnight.
   * @param {number} minutes - Minutes from 00:00 (clamped to 300-1440).
   * @param {boolean} [revealAll=false] - Whether to show cumulative day state.
   * @returns {void}
   */
  setCurrentTime(minutes, revealAll = false) {
    this.currentTime = Math.max(MIN_TIME_MIN, Math.min(MAX_TIME_MIN, minutes));
    this.revealAll = Boolean(revealAll);
    this.emit('time_updated', {
      time: this.currentTime,
      timeHHMM: toHHMM(this.currentTime),
      revealAll: this.revealAll
    });
  }

  /**
   * Starts playback animation forward through time.
   * @returns {void}
   */
  startPlayback() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.revealAll = false;
    if (this.currentTime >= REWIND_THRESHOLD_MIN) {
      this.currentTime = MIN_TIME_MIN;
    }
    this.emit('playback_state', { isPlaying: true, speed: this.playbackSpeed });

    this.animationTimer = setInterval(() => {
      let nextTime = this.currentTime + this.playbackSpeed;
      if (nextTime >= MAX_TIME_MIN) {
        nextTime = MAX_TIME_MIN;
        this.stopPlayback();
      }
      this.setCurrentTime(nextTime, false);
    }, PLAYBACK_TICK_MS);
  }

  /**
   * Pauses playback animation.
   * @returns {void}
   */
  stopPlayback() {
    this.isPlaying = false;
    if (this.animationTimer !== null) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
    this.emit('playback_state', { isPlaying: false, speed: this.playbackSpeed });
  }

  /**
   * Configures playback velocity multiplier.
   * @param {number|string} speed - Speed multiplier (1, 2, 5, 10).
   * @returns {void}
   */
  setSpeed(speed) {
    this.playbackSpeed = Number(speed);
    this.emit('playback_state', { isPlaying: this.isPlaying, speed: this.playbackSpeed });
  }

  /**
   * Retrieves root cause cascade explanation steps for a given flight.
   * @param {string} flightId - Flight ID.
   * @returns {string[]} List of human-readable root cause explanation strings.
   */
  getFlightExplanation(flightId) {
    if (!this.simulation || !flightId) return [];
    return explainFlight(this.simulation, flightId);
  }
}

/** Singleton instance of application state */
export const state = new AppState();
