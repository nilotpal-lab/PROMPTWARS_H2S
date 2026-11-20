import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScenario } from '../server/index.js';

test('Security: parseScenario rejects non-object payloads', () => {
  assert.throws(() => parseScenario(null), /Invalid request/);
  assert.throws(() => parseScenario('string'), /Invalid request/);
  assert.throws(() => parseScenario([1, 2, 3]), /Invalid request/);
});

test('Security: parseScenario requires non-empty closures array', () => {
  assert.throws(() => parseScenario({}), /closures\[\] required/);
  assert.throws(() => parseScenario({ closures: [] }), /closures\[\] required/);
});

test('Security: parseScenario rejects prototype pollution via __proto__, constructor, and prototype', () => {
  const p1 = JSON.parse('{"closures":[{"airport":"BOM","start":"07:00","end":"11:00"}],"__proto__":{"polluted":true}}');
  assert.throws(() => parseScenario(p1), /forbidden prototype property/);

  const p2 = JSON.parse('{"closures":[{"airport":"BOM","start":"07:00","end":"11:00"}],"constructor":{"polluted":true}}');
  assert.throws(() => parseScenario(p2), /forbidden prototype property/);

  const p3 = JSON.parse('{"closures":[{"airport":"BOM","start":"07:00","end":"11:00"}],"prototype":{"polluted":true}}');
  assert.throws(() => parseScenario(p3), /forbidden prototype property/);
});

test('Security: parseScenario rejects unknown airport codes (whitelist enforcement)', () => {
  assert.throws(
    () => parseScenario({ closures: [{ airport: 'XYZ', start: '07:00', end: '11:00' }] }),
    /unknown airport XYZ/
  );
  assert.throws(
    () => parseScenario({ closures: [{ airport: '../etc/passwd', start: '07:00', end: '11:00' }] }),
    /unknown airport/
  );
  assert.throws(
    () => parseScenario({ closures: [{ airport: '<script>alert(1)</script>', start: '07:00', end: '11:00' }] }),
    /unknown airport/
  );
});

test('Security: parseScenario rejects malformed time formats and injections', () => {
  assert.throws(
    () => parseScenario({ closures: [{ airport: 'BOM', start: '25:00', end: '11:00' }] }),
    /bad start time/
  );
  assert.throws(
    () => parseScenario({ closures: [{ airport: 'BOM', start: '07:00', end: 'invalid' }] }),
    /bad end time/
  );
  assert.throws(
    () => parseScenario({ closures: [{ airport: 'BOM', start: -10, end: 120 }] }),
    /bad start time/
  );
  assert.throws(
    () => parseScenario({ closures: [{ airport: 'BOM', start: 1500, end: 1600 }] }),
    /bad start time/
  );
  assert.throws(
    () => parseScenario({ closures: [{ airport: 'BOM', start: '07:00', end: 1500 }] }),
    /bad end time/
  );
});

test('Security: parseScenario rejects inverted time window (start > end)', () => {
  assert.throws(
    () => parseScenario({ closures: [{ airport: 'BOM', start: '14:00', end: '10:00' }] }),
    /cannot be after end/
  );
});

test('Security: parseScenario enforces max limits on closures and actions (DoS prevention)', () => {
  const massiveClosures = Array.from({ length: 25 }, () => ({
    airport: 'BOM',
    start: '07:00',
    end: '08:00'
  }));
  assert.throws(() => parseScenario({ closures: massiveClosures }), /exceeded maximum limit/);

  const massiveActions = Array.from({ length: 25 }, () => ({
    type: 'cancel',
    flight_id: 'DS0101'
  }));
  assert.throws(() => parseScenario({ closures: [{ airport: 'BOM', start: '07:00', end: '08:00' }], actions: massiveActions }), /exceeded maximum limit/);
});

test('Security: parseScenario strictly validates optional actions', () => {
  const badAction = {
    closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }],
    actions: [{ type: 'malicious_type', flight_id: 'DS0101' }]
  };
  assert.throws(() => parseScenario(badAction), /invalid action type/);

  const unknownFlight = {
    closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }],
    actions: [{ type: 'cancel', flight_id: 'DS9999' }]
  };
  assert.throws(() => parseScenario(unknownFlight), /unknown flight_id/);

  const invalidSpare = {
    closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }],
    actions: [{ type: 'swap', flight_id: 'DS0101', spare: 'MALICIOUS_SPARE' }]
  };
  assert.throws(() => parseScenario(invalidSpare), /unknown spare aircraft/);

  const nonArrayActions = {
    closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }],
    actions: 'not an array'
  };
  assert.throws(() => parseScenario(nonArrayActions), /actions must be an array/);
});

test('Security: parseScenario accepts valid inputs and normalizes numeric/string times', () => {
  const res1 = parseScenario({
    closures: [{ airport: 'DEL', start: '08:30', end: '12:00' }]
  });
  assert.deepEqual(res1.closures, [{ airport: 'DEL', start: '08:30', end: '12:00' }]);

  const res2 = parseScenario({
    closures: [{ airport: 'BLR', start: 480, end: 600 }]
  });
  assert.deepEqual(res2.closures, [{ airport: 'BLR', start: '08:00', end: '10:00' }]);

  const res3 = parseScenario({
    closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }],
    actions: [{ type: 'swap', flight_id: 'DS0101', spare: 'VT-DS17' }]
  });
  assert.equal(res3.actions.length, 1);
  assert.equal(res3.actions[0].spare, 'VT-DS17');
});
