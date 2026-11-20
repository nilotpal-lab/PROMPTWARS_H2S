import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { project, VB_WIDTH, VB_HEIGHT, INDIA_MAINLAND, AIRSPACE_FIRS } from '../public/js/india_geo.js';
import { buildFacts, fallbackNarrative, auditNumbers } from '../server/dispatcher.js';
import { simulate } from '../engine.js';

const net = JSON.parse(fs.readFileSync(new URL('../flight_network.json', import.meta.url)));

test('Geo: all 16 airports project within visible SVG radar bounds', () => {
  for (const ap of net.airports) {
    const { x, y } = project(ap.lat, ap.lng);
    assert.ok(x >= 30 && x <= VB_WIDTH - 30, `${ap.id} x coord (${x}) out of bounds`);
    assert.ok(y >= 30 && y <= VB_HEIGHT - 30, `${ap.id} y coord (${y}) out of bounds`);
  }
});

test('Geo: official India mainland coordinates within sovereign geographic bounds', () => {
  assert.ok(INDIA_MAINLAND.length > 500, 'Mainland vector must have high precision');
  for (const [lat, lng] of INDIA_MAINLAND) {
    assert.ok(lat >= 6.5 && lat <= 37.5, `Lat ${lat} out of sovereign bounds`);
    assert.ok(lng >= 68.0 && lng <= 97.6, `Lng ${lng} out of sovereign bounds`);
  }
});

test('Geo: all 4 official FIR sectors defined with valid coordinates', () => {
  assert.equal(AIRSPACE_FIRS.length, 4);
  const firCodes = new Set(AIRSPACE_FIRS.map((f) => f.code));
  assert.ok(firCodes.has('VIDF')); // Delhi
  assert.ok(firCodes.has('VABF')); // Mumbai
  assert.ok(firCodes.has('VECC')); // Kolkata
  assert.ok(firCodes.has('VOMF')); // Chennai
});

test('UI Contract: simulation summary always provides non-negative integers', () => {
  const r = simulate(net, { closures: [{ airport: 'BLR', start: '12:00', end: '16:00' }] });
  const s = r.summary;
  const keys = ['delayedFlights', 'cancelledFlights', 'strandedPax', 'missedConnections', 'crewBreaches', 'totalDelayMin'];
  for (const k of keys) {
    assert.ok(Number.isInteger(s[k]) && s[k] >= 0, `${k} must be non-negative integer`);
  }
});

test('UI Contract: dispatcher fallback narrative passes audit across random scenarios', () => {
  const testScenarios = [
    { closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }] },
    { closures: [{ airport: 'DEL', start: '12:00', end: '16:00' }] },
    { closures: [{ airport: 'BLR', start: '14:00', end: '18:00' }] },
    { closures: [{ airport: 'HYD', start: '08:00', end: '12:00' }] }
  ];

  for (const sc of testScenarios) {
    const facts = buildFacts(net, sc);
    const narrative = fallbackNarrative(facts);
    const audit = auditNumbers(narrative, facts);
    assert.equal(audit.ok, true, `Audit failed for ${sc.closures[0].airport}: ${audit.unmatched}`);
    assert.ok(narrative.headline.length > 10);
    assert.ok(narrative.summary.length > 10);
  }
});
