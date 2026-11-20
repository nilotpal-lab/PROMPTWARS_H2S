// Domino Sky — deterministic engine. No AI, no randomness. Works in browser and Node (ES module).
// All times are minutes since 00:00 IST.

export const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const toHHMM = (m) => {
  const d = Math.floor(m / 1440); m = ((m % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + (d ? `+${d}` : '');
};

// ---- Tunable, documented assumptions (show these in the UI) ----
export const DEFAULTS = {
  cancelThresholdMin: 240,   // a flight whose departure delay >= this is cancelled
  lateThresholdMin: 15,      // arrival delay >= this counts as "late"
  ferrySpeedKmh: 800,        // spare positioning flight
  ferryOverheadMin: 20,
  costDelayMinPerPaxPoint: 600, // objective = stranded pax + paxDelayMin/600 (1 stranded pax ≈ 10 pax-hours of delay)
};

function haversineKm(a, b) {
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * simulate(network, scenario)
 * scenario = {
 *   closures: [{ airport:'BOM', start:'14:00'|minutes, end:'15:30'|minutes }],
 *   actions:  [{ type:'cancel', flight_id } | { type:'swap', flight_id, spare:'VT-DS17' }],
 *   cancelThresholdMin?: number
 * }
 */
export function simulate(network, scenario = {}) {
  const cfg = { ...DEFAULTS, ...(scenario.cancelThresholdMin != null ? { cancelThresholdMin: scenario.cancelThresholdMin } : {}) };
  const minTurn = network.meta.min_turnaround_minutes;
  const ap = Object.fromEntries(network.airports.map((a) => [a.id, a]));
  const closures = (scenario.closures || []).map((c) => ({
    airport: c.airport,
    start: typeof c.start === 'string' ? toMin(c.start) : c.start,
    end: typeof c.end === 'string' ? toMin(c.end) : c.end,
  }));
  const actions = scenario.actions || [];
  const cancelSet = new Set(actions.filter((a) => a.type === 'cancel').map((a) => a.flight_id));
  const swaps = actions.filter((a) => a.type === 'swap');

  const fl = Object.fromEntries(network.flights.map((f) => [f.flight_id, f]));
  const crewOf = {};
  for (const c of network.crews) for (const id of c.flight_ids) crewOf[id] = c;

  // ---- Build aircraft chains (apply spare swaps) ----
  const chains = {}; // aircraftId -> { legs:[flight], loc, readyAt, isSpare }
  for (const f of [...network.flights].sort((a, b) => a.leg_order - b.leg_order)) {
    (chains[f.tail_id] ||= { legs: [], loc: null, readyAt: 0 }).legs.push(f);
  }
  for (const c of Object.values(chains)) { c.loc = c.legs[0].origin; c.readyAt = 0; }
  const swapInfo = {}; // flight_id -> {spare, ferryMin}
  const usedSpares = new Set();
  for (const s of swaps) {
    const f = fl[s.flight_id]; const spare = network.spare_aircraft.find((x) => x.tail_id === s.spare);
    if (!f || !spare || usedSpares.has(s.spare)) continue;
    const orig = chains[f.tail_id]; if (!orig) continue;
    const idx = orig.legs.findIndex((l) => l.flight_id === f.flight_id); if (idx < 0) continue;
    const moved = orig.legs.splice(idx); // this leg and all later legs move to the spare
    const ferry = spare.base === f.origin ? 0
      : Math.round((haversineKm(ap[spare.base], ap[f.origin]) / cfg.ferrySpeedKmh) * 60 + cfg.ferryOverheadMin);
    chains[spare.tail_id] = { legs: moved, loc: spare.base, readyAt: toMin(spare.available_from) + ferry, isSpare: true };
    for (const m of moved) swapInfo[m.flight_id] = { spare: spare.tail_id, ferryMin: ferry, replaced: f.tail_id };
    usedSpares.add(s.spare);
  }

  // ---- Event loop: process flights in chronological order of readiness ----
  const res = {};            // flight_id -> result
  const idxOf = {};          // aircraft -> next leg index
  const slot = {};           // airport -> next free departure slot (post-closure queue metering)
  const lastOpFlight = {};   // aircraft -> last operated flight id (for cause chain)
  for (const k of Object.keys(chains)) idxOf[k] = 0;

  const inWin = (t, c) => t >= c.start && t < c.end;
  const total = Object.values(chains).reduce((n, c) => n + c.legs.length, 0);

  for (let done = 0; done < total; done++) {
    // pick the aircraft whose next leg can leave earliest
    let best = null;
    for (const [id, c] of Object.entries(chains)) {
      const f = c.legs[idxOf[id]]; if (!f) continue;
      const key = Math.max(toMin(f.dep), c.readyAt);
      if (!best || key < best.key || (key === best.key && toMin(f.dep) < best.sd)) best = { id, c, f, key, sd: toMin(f.dep) };
    }
    const { id, c, f } = best; idxOf[id]++;
    const sd = toMin(f.dep), sa = toMin(f.arr);
    const r = { flight_id: f.flight_id, aircraft: id, origin: f.origin, destination: f.destination, pax: f.pax,
      schedDep: sd, schedArr: sa, dep: null, arr: null, depDelay: 0, arrDelay: 0, status: 'on_time',
      causes: [], cancelReason: null, swap: swapInfo[f.flight_id] || null };
    res[f.flight_id] = r;

    const cancel = (reason, detail) => { r.status = 'cancelled'; r.cancelReason = reason; r.cancelDetail = detail; };

    if (cancelSet.has(f.flight_id)) { cancel('dispatcher', 'Cancelled by dispatcher action'); continue; }
    if (c.loc !== f.origin) {
      cancel('out_of_position', `${id} is at ${c.loc}, not ${f.origin}, because an earlier leg was cancelled`);
      continue;
    }

    let dep = sd;
    if (c.readyAt > sd) {
      const prev = lastOpFlight[id];
      r.causes.push({ type: c.isSpare && !prev ? 'spare_positioning' : 'aircraft_late', minutes: c.readyAt - sd,
        fromFlight: c.isSpare && !prev ? null : prev,
        detail: c.isSpare && !prev ? `Spare ${id} positioning/availability` : `Aircraft ${id} arrived late on ${prev}; needs ${minTurn} min turnaround` });
      dep = c.readyAt;
    }
    // origin closure
    for (const cl of closures) if (cl.airport === f.origin && inWin(dep, cl)) {
      r.causes.push({ type: 'closure_origin', minutes: cl.end - dep, detail: `${f.origin} closed until ${toHHMM(cl.end)}` });
      dep = cl.end; slot[f.origin] = Math.max(slot[f.origin] || 0, 0); slot[`${f.origin}:bk`] = true;
    }
    // post-closure queue metering (airport capacity)
    if (slot[`${f.origin}:bk`] && slot[f.origin] != null && dep < slot[f.origin]) {
      r.causes.push({ type: 'airport_queue', minutes: slot[f.origin] - dep, detail: `${f.origin} departure queue after reopening (capacity ${ap[f.origin].capacity_per_hour}/h)` });
      dep = slot[f.origin];
    }
    let arr = dep + f.block_minutes;
    for (const cl of closures) if (cl.airport === f.destination && inWin(arr, cl)) {
      r.causes.push({ type: 'closure_arrival', minutes: cl.end - arr, detail: `${f.destination} closed; holding until ${toHHMM(cl.end)}` });
      arr = cl.end;
    }
    r.depDelay = dep - sd;
    // cancellation rules
    if (r.depDelay >= cfg.cancelThresholdMin) {
      cancel('delay_threshold', `Departure delay ${r.depDelay} min exceeds ${cfg.cancelThresholdMin} min limit`); r.causes = []; continue;
    }
    const crew = crewOf[f.flight_id];
    if (crew && arr - toMin(crew.duty_start) > crew.max_duty_mins) {
      cancel('crew_duty', `Crew ${crew.crew_id} would reach ${arr - toMin(crew.duty_start)} min duty (max ${crew.max_duty_mins})`);
      r.crewBreach = crew.crew_id; continue;
    }
    // operate
    r.dep = dep; r.arr = arr; r.arrDelay = arr - sa;
    r.status = r.arrDelay >= cfg.lateThresholdMin || r.depDelay >= cfg.lateThresholdMin ? 'delayed' : 'on_time';
    if (slot[`${f.origin}:bk`]) slot[f.origin] = Math.max(slot[f.origin] || 0, dep + Math.ceil(60 / ap[f.origin].capacity_per_hour));
    c.loc = f.destination; c.readyAt = arr + minTurn; lastOpFlight[id] = f.flight_id;
  }

  // ---- Connections ----
  const connections = network.connections.map((x) => {
    const a = res[x.from_flight], b = res[x.to_flight];
    let status = 'made', why = null;
    if (a.status === 'cancelled') { status = 'missed'; why = `Inbound ${a.flight_id} cancelled`; }
    else if (b.status === 'cancelled') { status = 'missed'; why = `Outbound ${b.flight_id} cancelled`; }
    else if (b.dep < a.arr + x.min_connect_minutes) {
      status = 'missed'; why = `Only ${b.dep - a.arr} min between ${a.flight_id} arrival and ${b.flight_id} departure; ${x.min_connect_minutes} needed`;
    }
    const bothOperate = a.status !== 'cancelled' && b.status !== 'cancelled';
    return { ...x, status, why, countedSeparately: status === 'missed' && bothOperate };
  });

  // ---- Crews ----
  const crews = network.crews.map((c) => {
    const ops = c.flight_ids.map((i) => res[i]).filter((r) => r.status !== 'cancelled');
    const last = ops.length ? Math.max(...ops.map((r) => r.arr)) : toMin(c.duty_start);
    const used = last - toMin(c.duty_start);
    const breach = c.flight_ids.some((i) => res[i].crewBreach);
    return { crew_id: c.crew_id, dutyUsed: used, maxDuty: c.max_duty_mins, slack: c.max_duty_mins - used, breach,
      atRisk: !breach && c.max_duty_mins - used <= 30 };
  });

  // ---- Summary ----
  const rows = Object.values(res);
  const cancelled = rows.filter((r) => r.status === 'cancelled');
  const operated = rows.filter((r) => r.status !== 'cancelled');
  const delayed = operated.filter((r) => r.status === 'delayed');
  const missed = connections.filter((x) => x.status === 'missed');
  const strandedCancelled = cancelled.reduce((n, r) => n + r.pax, 0);
  const strandedConn = missed.filter((x) => x.countedSeparately).reduce((n, x) => n + x.passengers, 0);
  const paxDelayMin = operated.reduce((n, r) => n + r.pax * Math.max(0, r.arrDelay), 0);
  const summary = {
    totalFlights: rows.length,
    operated: operated.length,
    delayedFlights: delayed.length,
    cancelledFlights: cancelled.length,
    totalDelayMin: operated.reduce((n, r) => n + Math.max(0, r.arrDelay), 0),
    maxDelayMin: operated.reduce((m, r) => Math.max(m, r.arrDelay), 0),
    paxDelayMin,
    strandedPax: strandedCancelled + strandedConn,
    strandedFromCancellations: strandedCancelled,
    strandedFromMissedConnections: strandedConn,
    missedConnections: missed.length,
    crewBreaches: crews.filter((c) => c.breach).length,
    airportsAffected: new Set(rows.filter((r) => r.status !== 'on_time').flatMap((r) => [r.origin, r.destination])).size,
    cost: strandedCancelled + strandedConn + paxDelayMin / cfg.costDelayMinPerPaxPoint,
  };
  summary.cost = Math.round(summary.cost * 10) / 10;

  return { flights: rows, connections, crews, summary, closures, actions, config: cfg };
}

/** Human-readable root-cause chain for one flight, e.g. closure → DS0701 → DS0702 */
export function explainFlight(result, flightId) {
  const by = Object.fromEntries(result.flights.map((f) => [f.flight_id, f]));
  const chain = []; let cur = by[flightId], guard = 0;
  while (cur && guard++ < 20) {
    if (cur.status === 'cancelled') { chain.push(`${cur.flight_id} cancelled: ${cur.cancelDetail}`); break; }
    const main = [...cur.causes].sort((a, b) => b.minutes - a.minutes)[0];
    if (!main) break;
    chain.push(`${cur.flight_id} +${main.minutes} min: ${main.detail}`);
    cur = main.fromFlight ? by[main.fromFlight] : null;
  }
  return chain;
}

/**
 * Recovery search: greedy up to `maxActions` steps. Each candidate is fully simulated.
 * Returns ranked candidate list + the chosen plan with before/after summaries.
 * The AI dispatcher only ever sees this output — it never computes numbers.
 */
export function recommend(network, scenario, maxActions = 3) {
  const baseline = simulate(network, { ...scenario, actions: [] });
  let plan = [...(scenario.actions || [])];
  let current = simulate(network, { ...scenario, actions: plan });
  const steps = [];
  for (let k = 0; k < maxActions; k++) {
    const touched = current.flights.filter((f) => f.status !== 'on_time');
    const cands = [];
    const usedSpares = new Set(plan.filter((a) => a.type === 'swap').map((a) => a.spare));
    for (const f of touched) {
      if (f.status !== 'cancelled' && !plan.some((a) => a.flight_id === f.flight_id)) cands.push({ type: 'cancel', flight_id: f.flight_id });
      for (const s of network.spare_aircraft) if (!usedSpares.has(s.tail_id))
        cands.push({ type: 'swap', flight_id: f.flight_id, spare: s.tail_id });
    }
    const seen = new Set(); const scored = [];
    for (const a of cands) {
      const key = JSON.stringify(a); if (seen.has(key)) continue; seen.add(key);
      const r = simulate(network, { ...scenario, actions: [...plan, a] });
      scored.push({ action: a, summary: r.summary, gain: Math.round((current.summary.cost - r.summary.cost) * 10) / 10 });
    }
    // Guardrail: stranded passengers is the headline metric; a step may never increase it.
    for (let i = scored.length - 1; i >= 0; i--) if (scored[i].summary.strandedPax > current.summary.strandedPax) scored.splice(i, 1);
    scored.sort((x, y) => y.gain - x.gain || x.summary.cancelledFlights - y.summary.cancelledFlights);
    const top = scored[0];
    if (!top || top.gain <= 0) break;
    plan = [...plan, top.action];
    steps.push({ step: k + 1, action: top.action, before: current.summary, after: top.summary, gain: top.gain, alternatives: scored.slice(1, 4) });
    current = simulate(network, { ...scenario, actions: plan });
  }
  return { baselineDisrupted: baseline, recovered: current, plan, steps };
}
