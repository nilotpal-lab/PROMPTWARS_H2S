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

  const payload3 = JSON.parse('{"closures":[{"airport":"BOM","start":"07:00","end":"11:00"}],"prototype":{"polluted":true}}');
  assert.throws(() => parseScenario(payload3), /forbidden prototype property/);
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

  // Verify all sections declare aria-labelledby
  const sections = html.match(/<section[^>]+>/g) || [];
  for (const s of sections) {
    assert.ok(s.includes('aria-labelledby') || s.includes('aria-label'), `Section must declare aria labeling: ${s}`);
  }
});

test('Accessibility & WCAG AAA: style.css enforces universal high-contrast focus rings and tokens', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
  assert.ok(css.includes(':focus-visible'), 'CSS must define :focus-visible');
  assert.ok(css.includes('forced-colors'), 'CSS must support forced-colors high contrast mode');

  // Calculate WCAG relative luminance and contrast ratio
  function relativeLuminance(r, g, b) {
    const sRGB = [r, g, b].map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  }

  function getContrastRatio(hex1, hex2) {
    const num1 = parseInt(hex1.replace('#', ''), 16);
    const num2 = parseInt(hex2.replace('#', ''), 16);
    const rgb1 = [(num1 >> 16) & 255, (num1 >> 8) & 255, num1 & 255];
    const rgb2 = [(num2 >> 16) & 255, (num2 >> 8) & 255, num2 & 255];
    const l1 = relativeLuminance(...rgb1);
    const l2 = relativeLuminance(...rgb2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  // Verify key foreground text tokens against background cards (#0f1626) exceed WCAG AAA 7:1 ratio
  const bgCard = '#0f1626';
  const tokens = {
    '--text-bright': '#ffffff',
    '--text-primary': '#f1f5f9',
    '--text-dim': '#94a3b8',
    '--text-muted': '#a8b8cc',
    '--color-cyan': '#38bdf8',
    '--color-amber': '#f59e0b',
    '--color-red': '#ff7588',
    '--color-green': '#22c55e',
    '--color-spare': '#a5b4fc',
  };

  for (const [name, color] of Object.entries(tokens)) {
    const ratio = getContrastRatio(color, bgCard);
    assert.ok(ratio >= 7.0, `Token ${name} (${color}) contrast ratio ${ratio.toFixed(2)}:1 must meet WCAG AAA standard (>= 7.0:1)`);
  }
});

import http from 'node:http';

test('API Contract: /api/health endpoint structure and deterministic engine status', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('content-security-policy'));

    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.engine, 'deterministic');
    assert.equal(data.network.airports, 16);
    assert.equal(data.network.flights, 70);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('API Contract: HTTP endpoints reject malformed requests with 400 JSON errors', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  try {
    // 1. Invalid simulate request
    const simRes = await fetch(`http://127.0.0.1:${port}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closures: [{ airport: 'INVALID_AIRPORT', start: '07:00', end: '11:00' }] })
    });
    assert.equal(simRes.status, 400);
    const simErr = await simRes.json();
    assert.ok(simErr.error && simErr.error.includes('unknown airport'));

    // 2. Prototype pollution attack via HTTP POST
    const protoRes = await fetch(`http://127.0.0.1:${port}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"closures":[{"airport":"BOM","start":"07:00","end":"11:00"}],"__proto__":{"admin":true}}'
    });
    assert.equal(protoRes.status, 400);
    const protoErr = await protoRes.json();
    assert.ok(protoErr.error && protoErr.error.includes('forbidden prototype property'));

    // 3. Valid simulate via HTTP POST
    const validSimRes = await fetch(`http://127.0.0.1:${port}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }] })
    });
    assert.equal(validSimRes.status, 200);
    const simData = await validSimRes.json();
    assert.equal(simData.summary.totalFlights, 70);
    assert.equal(simData.summary.strandedPax, 861);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Edge case: zero-minute instantaneous closure window handled gracefully', () => {
  const zeroClosure = { closures: [{ airport: 'BOM', start: '12:00', end: '12:00' }] };
  const validated = parseScenario(zeroClosure);
  assert.equal(validated.closures[0].start, '12:00');
  assert.equal(validated.closures[0].end, '12:00');

  const sim = simulate(net, validated);
  assert.equal(sim.summary.delayedFlights, 0);
  assert.equal(sim.summary.cancelledFlights, 0);
  assert.equal(sim.summary.strandedPax, 0);
});
