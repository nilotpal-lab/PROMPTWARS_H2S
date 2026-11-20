import { simulate, explainFlight, toHHMM, DEFAULTS } from '/engine.js';

class AppState {
  constructor() {
    this.network = null;
    this.scenario = { closures: [], actions: [] };
    this.recoveryData = null;
    this.isPlanApplied = false;
    this.simulation = null;
    
    this.selectedFlightId = null;
    this.selectedAirportId = null;
    
    // Time scrub: 05:00 (300 min) to 24:00 (1440 min)
    this.currentTime = 1440; // Default to full day revealed
    this.isPlaying = false;
    this.playbackSpeed = 2; // 2 minutes of sim time per tick
    this.revealAll = true;
    
    this.subscribers = {};
    this.animationTimer = null;
  }

  async init() {
    const res = await fetch('/flight_network.json');
    this.network = await res.json();
    this.runSimulation();
  }

  on(event, cb) {
    if (!this.subscribers[event]) this.subscribers[event] = [];
    this.subscribers[event].push(cb);
  }

  emit(event, data) {
    if (this.subscribers[event]) {
      for (const cb of this.subscribers[event]) {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in subscriber for ${event}:`, err);
        }
      }
    }
  }

  getEffectiveScenario() {
    const actions = this.isPlanApplied && this.recoveryData?.plan
      ? [...this.recoveryData.plan]
      : [...(this.scenario.actions || [])];
    return {
      closures: [...(this.scenario.closures || [])],
      actions
    };
  }

  runSimulation() {
    if (!this.network) return;
    const effectiveScenario = this.getEffectiveScenario();
    this.simulation = simulate(this.network, effectiveScenario);
    
    // If selected flight no longer valid, deselect or keep
    this.emit('simulation_updated', {
      simulation: this.simulation,
      scenario: effectiveScenario,
      isPlanApplied: this.isPlanApplied
    });
  }

  setClosure(airport, startHHMM, durationMin) {
    const [h, m] = startHHMM.split(':').map(Number);
    const start = h * 60 + m;
    const end = start + Number(durationMin);

    this.scenario.closures = [{
      airport,
      start: toHHMM(start),
      end: toHHMM(end)
    }];

    // Reset applied plan when closure scenario changes
    this.isPlanApplied = false;
    this.recoveryData = null;
    this.runSimulation();
    this.emit('scenario_changed', this.scenario);
  }

  resetScenario() {
    this.stopPlayback();
    this.scenario = { closures: [], actions: [] };
    this.recoveryData = null;
    this.isPlanApplied = false;
    this.selectedFlightId = null;
    this.selectedAirportId = null;
    this.currentTime = 1440;
    this.revealAll = true;
    this.runSimulation();
    this.emit('scenario_changed', this.scenario);
    this.emit('flight_selected', null);
    this.emit('airport_selected', null);
    this.emit('time_updated', this.currentTime);
  }

  selectFlight(flightId) {
    if (this.selectedFlightId === flightId) {
      this.selectedFlightId = null; // toggle off
    } else {
      this.selectedFlightId = flightId;
      this.selectedAirportId = null; // flight takes precedence
    }
    this.emit('flight_selected', this.selectedFlightId);
  }

  selectAirport(airportId) {
    if (this.selectedAirportId === airportId) {
      this.selectedAirportId = null; // toggle off
    } else {
      this.selectedAirportId = airportId;
      this.selectedFlightId = null;
    }
    this.emit('airport_selected', this.selectedAirportId);
  }

  setRecoveryPlan(data) {
    this.recoveryData = data;
    this.emit('recovery_plan_loaded', data);
  }

  toggleApplyPlan(applied) {
    this.isPlanApplied = applied !== undefined ? applied : !this.isPlanApplied;
    this.runSimulation();
    this.emit('plan_toggled', this.isPlanApplied);
  }

  setCurrentTime(minutes, revealAll = false) {
    this.currentTime = Math.max(300, Math.min(1440, minutes));
    this.revealAll = revealAll;
    this.emit('time_updated', {
      time: this.currentTime,
      timeHHMM: toHHMM(this.currentTime),
      revealAll: this.revealAll
    });
  }

  startPlayback() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.revealAll = false;
    if (this.currentTime >= 1435) {
      this.currentTime = 300; // Reset to 05:00
    }
    this.emit('playback_state', { isPlaying: true, speed: this.playbackSpeed });

    const stepMs = 50;
    this.animationTimer = setInterval(() => {
      let nextTime = this.currentTime + this.playbackSpeed;
      if (nextTime >= 1440) {
        nextTime = 1440;
        this.stopPlayback();
      }
      this.setCurrentTime(nextTime, false);
    }, stepMs);
  }

  stopPlayback() {
    this.isPlaying = false;
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
    this.emit('playback_state', { isPlaying: false, speed: this.playbackSpeed });
  }

  setSpeed(speed) {
    this.playbackSpeed = Number(speed);
    this.emit('playback_state', { isPlaying: this.isPlaying, speed: this.playbackSpeed });
  }

  getFlightExplanation(flightId) {
    if (!this.simulation || !flightId) return [];
    return explainFlight(this.simulation, flightId);
  }
}

export const state = new AppState();
