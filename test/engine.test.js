import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulate, recommend, explainFlight } from '../engine.js';

const net = JSON.parse(fs.readFileSync(new URL('../flight_network.json', import.meta.url)));
const DEMO = { closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }] };

test('baseline: no closure means schedule is reproduced exactly', () => {
  const r = simulate(net, {});
  assert.equal(r.summary.delayedFlights, 0);
  assert.equal(r.summary.cancelledFlights, 0);
  assert.equal(r.summary.strandedPax, 0);
  assert.ok(r.flights.every((f) => f.depDelay === 0 && f.arrDelay === 0));
  assert.ok(r.crews.every((c) => !c.breach && c.slack >= 0));
  assert.ok(r.connections.every((c) => c.status === 'made'));
});

test('determinism: identical input gives identical output', () => {
  assert.deepEqual(simulate(net, DEMO), simulate(net, DEMO));
});

test('closure delays flights that depart from or land at the closed airport', () => {
  const r = simulate(net, { closures: [{ airport: 'BOM', start: '10:00', end: '11:30' }] });
  const f = Object.fromEntries(r.flights.map((x) => [x.flight_id, x]));
  assert.equal(f.DS0402.arrDelay, 65);          // lands in closure, holds until 11:30
  assert.equal(f.DS0403.arrDelay, 25);          // inherits via turnaround, slack absorbs 40
  assert.equal(f.DS0404.arrDelay, 20);
});

test('domino: delay propagates along an aircraft chain with turnaround slack absorbed', () => {
  const r = simulate(net, { closures: [{ airport: 'BOM', start: '10:00', end: '11:30' }] });
  const chain = explainFlight(r, 'DS0404');
  assert.ok(chain.length >= 2 && chain[chain.length - 1].includes('BOM closed'));
});

test('stranded passengers: no double counting between cancellations and connections', () => {
  const r = simulate(net, DEMO);
  const s = r.summary;
  assert.equal(s.strandedPax, s.strandedFromCancellations + s.strandedFromMissedConnections);
  const cancelledPax = r.flights.filter((f) => f.status === 'cancelled').reduce((n, f) => n + f.pax, 0);
  assert.equal(s.strandedFromCancellations, cancelledPax);
});

test('crew duty: breach cancels the flight and is reported', () => {
  const r = simulate(net, DEMO);
  const breached = r.flights.filter((f) => f.cancelReason === 'crew_duty');
  assert.ok(breached.length > 0);
  assert.equal(r.summary.crewBreaches, r.crews.filter((c) => c.breach).length);
});

test('cancelled leg leaves aircraft out of position, next leg cancelled too', () => {
  const r = simulate(net, { closures: [{ airport: 'DEL', start: '12:00', end: '16:00' }] });
  assert.ok(r.flights.some((f) => f.cancelReason === 'out_of_position'));
});

test('demo scenario headline numbers (quoted in README)', () => {
  const s = simulate(net, DEMO).summary;
  assert.deepEqual([s.delayedFlights, s.cancelledFlights, s.strandedPax, s.crewBreaches], [21, 4, 861, 4]);
});

test('recovery never makes things worse and reduces stranded passengers on demo', () => {
  const rec = recommend(net, DEMO);
  assert.ok(rec.recovered.summary.cost <= rec.baselineDisrupted.summary.cost);
  assert.ok(rec.recovered.summary.strandedPax < rec.baselineDisrupted.summary.strandedPax);
  assert.deepEqual([rec.recovered.summary.strandedPax, rec.recovered.summary.crewBreaches], [534, 2]);
});

test('spare swap: each spare used at most once', () => {
  const r = simulate(net, { ...DEMO, actions: [
    { type: 'swap', flight_id: 'DS1204', spare: 'VT-DS18' },
    { type: 'swap', flight_id: 'DS0704', spare: 'VT-DS18' }] });
  assert.equal(r.flights.filter((f) => f.aircraft === 'VT-DS18').length > 0, true);
  assert.equal(r.flights.find((f) => f.flight_id === 'DS0704').aircraft !== 'VT-DS18', true);
});

test('planner guardrail: no recovery step ever increases stranded passengers', () => {
  for (const [a, st, en] of [['BOM', '07:00', '11:00'], ['BLR', '14:00', '18:00'], ['DEL', '12:00', '16:00'], ['BOM', '08:00', '12:00']]) {
    const rec = recommend(net, { closures: [{ airport: a, start: st, end: en }] });
    for (const step of rec.steps) assert.ok(step.after.strandedPax <= step.before.strandedPax, `${a} step ${step.step}`);
  }
});
