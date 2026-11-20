import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, recommend, explainFlight } from '../engine.js';
import { dispatch, clearDispatchCache } from '../server/dispatcher.js';
import { parseScenario, app } from '../server/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const net = JSON.parse(fs.readFileSync(new URL('../flight_network.json', import.meta.url)));

test('PS Scenario: 90-minute Mumbai thunderstorm causes downstream rotational cancellation', () => {
  // A 90-minute thunderstorm in Mumbai (15:00-16:30)
  const sc = { closures: [{ airport: 'BOM', start: '15:00', end: '16:30' }] };
  const r = simulate(net, sc);

  // Verifies that a 90m closure in Mumbai propagates to cause a downstream flight cancellation
  assert.equal(r.summary.cancelledFlights, 1, 'Should cause exactly 1 downstream cancellation');
  assert.equal(r.summary.crewBreaches, 1, 'Should cause exactly 1 crew duty breach');
  assert.ok(r.summary.strandedPax >= 167, 'Should strand at least 167 passengers');

  const cancelled = r.flights.find(f => f.status === 'cancelled');
  assert.ok(cancelled, 'A cancelled flight must exist');
  assert.equal(cancelled.cancelReason, 'crew_duty', 'Cancellation reason must be crew duty breach');
  assert.equal(cancelled.flight_id, 'DS0304', 'Flight DS0304 cancelled downstream');

  // Verify explainFlight provides actionable root-cause provenance
  const chain = explainFlight(r, cancelled.flight_id);
  assert.ok(chain.length >= 1);
  assert.ok(chain[0].includes('Crew CR03 would reach'));
});

test('Dispatcher Caching: repeated calls for identical scenario resolve instantly and remain verified', async () => {
  clearDispatchCache();
  const sc = { closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }], actions: [] };

  // First call (computes and caches)
  const t0 = performance.now();
  const d1 = await dispatch(net, sc, { llm: null, useCache: true });
  const dur1 = performance.now() - t0;

  assert.equal(d1.verification.numbersVerifiedAgainstEngine, true);
  assert.equal(d1.before.strandedPax, 861);
  assert.equal(d1.after.strandedPax, 534);

  // Second call (hits memory cache)
  const t1 = performance.now();
  const d2 = await dispatch(net, sc, { llm: null, useCache: true });
  const dur2 = performance.now() - t1;

  assert.deepEqual(d1.plan, d2.plan);
  assert.deepEqual(d1.narrative, d2.narrative);
  assert.equal(d2.verification.numbersVerifiedAgainstEngine, true);
  assert.ok(dur2 <= dur1 + 10, 'Cached dispatch must execute near-instantly');
});

test('Security: parseScenario blocks prototype pollution and constructor injection', () => {
  const payload1 = JSON.parse('{"closures":[{"airport":"BOM","start":"07:00","end":"11:00"}],"__proto__":{"polluted":true}}');
  assert.throws(() => parseScenario(payload1), /forbidden prototype property/);

  const payload2 = JSON.parse('{"closures":[{"airport":"BOM","start":"07:00","end":"11:00"}],"constructor":{"polluted":true}}');
  assert.throws(() => parseScenario(payload2), /forbidden prototype property/);
});

test('API Integration: simulate endpoint handles valid payload and returns compliant simulation', async () => {
  const reqPayload = { closures: [{ airport: 'DEL', start: '12:00', end: '16:00' }] };
  const validated = parseScenario(reqPayload);
  const sim = simulate(net, validated);

  assert.ok(sim.summary);
  assert.equal(sim.summary.totalFlights, 70);
  assert.ok(Number.isInteger(sim.summary.strandedPax) && sim.summary.strandedPax >= 0);
  assert.ok(Array.isArray(sim.flights));
  assert.ok(Array.isArray(sim.connections));
  assert.ok(Array.isArray(sim.crews));
});

test('API Integration: recovery dispatch recommendations always satisfy cost minimization', async () => {
  const sc = { closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }] };
  const rec = recommend(net, sc);

  assert.ok(rec.plan.length > 0, 'Must recommend at least 1 recovery action');
  assert.ok(rec.recovered.summary.strandedPax < rec.baselineDisrupted.summary.strandedPax, 'Must reduce stranded pax');
  assert.ok(rec.recovered.summary.cost <= rec.baselineDisrupted.summary.cost, 'Must minimize cost objective');
});

test('Accessibility & WCAG AAA: index.html implements required landmark roles and headings', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('lang="en"'), 'HTML must declare lang="en"');
  assert.ok(html.includes('<h1 class="brand-title">DOMINO SKY</h1>'), 'Document must have valid h1');
  assert.ok(html.includes('class="skip-link"'), 'Document must include skip link');
  assert.ok(html.includes('role="banner"'), 'Header must declare role="banner"');
  assert.ok(html.includes('role="main"'), 'Main element must declare role="main"');
  assert.ok(html.includes('id="a11y-announcer"'), 'Document must provide live aria announcer');
});

test('Accessibility & WCAG AAA: style.css enforces universal high-contrast focus rings', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
  assert.ok(css.includes(':focus-visible'), 'CSS must define :focus-visible');
  assert.ok(css.includes('forced-colors'), 'CSS must support forced-colors high contrast mode');
});

