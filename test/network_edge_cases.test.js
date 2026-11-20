import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulate, explainFlight } from '../engine.js';

const net = JSON.parse(fs.readFileSync(new URL('../flight_network.json', import.meta.url)));

test('Edge case: multi-hub simultaneous closure (BOM and DEL)', () => {
  const scenario = {
    closures: [
      { airport: 'BOM', start: '08:00', end: '11:00' },
      { airport: 'DEL', start: '09:00', end: '12:00' }
    ]
  };
  const r = simulate(net, scenario);
  assert.ok(r.summary.delayedFlights > 0);
  assert.ok(r.summary.cancelledFlights > 0);
  assert.ok(r.summary.strandedPax > 0);

  // Both closures are registered in simulation result
  assert.equal(r.closures.length, 2);
});

test('Edge case: spoke airport closure during operating hours (GAU 16:00 to 20:00)', () => {
  const scenario = {
    closures: [{ airport: 'GAU', start: '16:00', end: '20:00' }]
  };
  const r = simulate(net, scenario);
  const gauFlights = r.flights.filter((f) => f.origin === 'GAU' || f.destination === 'GAU');
  assert.ok(gauFlights.length > 0);
  assert.ok(gauFlights.some((f) => f.depDelay > 0 || f.arrDelay > 0 || f.status !== 'on_time'));
});

test('Edge case: full-day closure (00:00 to 24:00)', () => {
  const scenario = {
    closures: [{ airport: 'BOM', start: '00:00', end: '24:00' }]
  };
  const r = simulate(net, scenario);
  const bomDeps = r.flights.filter((f) => f.origin === 'BOM');
  assert.ok(bomDeps.every((f) => f.status === 'cancelled'));
});

test('Edge case: input network immutability check', () => {
  const netCopy = JSON.parse(JSON.stringify(net));
  simulate(net, { closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }] });
  assert.deepEqual(net, netCopy, 'simulate must not mutate the input network');
});

test('Edge case: explainFlight returns root-cause chain for all disrupted flights', () => {
  const r = simulate(net, { closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }] });
  const disrupted = r.flights.filter((f) => f.status === 'delayed' || f.status === 'cancelled');
  assert.ok(disrupted.length > 0);
  for (const f of disrupted) {
    const chain = explainFlight(r, f.flight_id);
    assert.ok(Array.isArray(chain));
    assert.ok(chain.length >= 1, `Disrupted flight ${f.flight_id} must have explanation`);
    assert.ok(typeof chain[0] === 'string');
  }

  // On-time flights have empty explanation
  const onTime = r.flights.filter((f) => f.status === 'on_time');
  for (const f of onTime) {
    const chain = explainFlight(r, f.flight_id);
    assert.deepEqual(chain, []);
  }
});
