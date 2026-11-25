import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAqiQuery,
  validatePlanRequest,
  validateChatRequest,
  sanitizePlainText,
  hasForbiddenKeys
} from '../lib/validation.js';

describe('lib/validation.js — Strict Input Validation, Sanitization & Prototype Guards', () => {
  it('blocks __proto__, constructor, and prototype keys including JSON-parsed payloads', () => {
    assert.equal(hasForbiddenKeys({ ok: true, nested: [1, { a: 'b' }] }), false);
    assert.equal(hasForbiddenKeys(JSON.parse('{"__proto__":{"polluted":true}}')), true);
    assert.equal(hasForbiddenKeys({ nested: { constructor: { prototype: {} } } }), true);
    assert.equal(hasForbiddenKeys({ ['prototype']: {} }), true);

    const circular = {};
    circular.self = circular;
    assert.equal(hasForbiddenKeys(circular), true);
  });

  it('strips control chars and angle brackets while preserving Unicode Hindi text', () => {
    const raw = 'Hello\u0000\u0007 <script>alert(1)</script> दिल्ली\tवायु\n';
    const cleaned = sanitizePlainText(raw, 200);
    assert.equal(cleaned, 'Hello scriptalert(1)/script दिल्ली वायु');
    assert.equal(sanitizePlainText('   <<<>>>   ', 50), '');
    assert.equal(sanitizePlainText(12345, 50), '');
  });

  it('validates /api/aqi queries across presets, coordinates, city, and calibration bounds', () => {
    const emptyDefault = validateAqiQuery({});
    assert.equal(emptyDefault.ok, true);
    assert.equal(emptyDefault.data.preset, 'delhi-severe');

    const coords = validateAqiQuery({ lat: '28.6139', lon: '77.2090', calibratedAqi: '420', calibratedPm25: '260' });
    assert.equal(coords.ok, true);
    assert.equal(coords.data.lat, 28.6139);
    assert.equal(coords.data.calibratedAqi, 420);

    assert.equal(validateAqiQuery({ lat: '28.6' }).ok, false);
    assert.equal(validateAqiQuery({ lat: '95', lon: '77.2' }).ok, false);
    assert.equal(validateAqiQuery({ preset: 'unknown-city' }).ok, false);
    assert.equal(validateAqiQuery({ calibratedAqi: '0' }).ok, false);
    assert.equal(validateAqiQuery({ calibratedAqi: '1000' }).ok, false);
    assert.equal(validateAqiQuery({ calibratedPm25: '-1' }).ok, false);
    assert.equal(validateAqiQuery({ calibratedPm25: '1501' }).ok, false);
    assert.equal(validateAqiQuery({ calibratedPm25: true }).ok, false);
    assert.equal(validateAqiQuery({ city: '<<<>>>' }).ok, false);
    assert.equal(validateAqiQuery(JSON.parse('{"__proto__":{"x":1}}')).ok, false);
  });

  it('validates /api/plan payloads strictly with enum allowlists and bounds', () => {
    const valid = validatePlanRequest({
      lang: 'hi',
      profiles: ['infant', 'asthmatic'],
      maskType: 'n95',
      purifierMode: 'diy_cr_box',
      roomVolumeM3: 42,
      noExhaustTadka: true,
      commuteFrom: 'diesel_cab',
      commuteTo: 'metro_bus',
      dailyKm: 24,
      communityActions: ['compost_leaves'],
      lat: 28.6139,
      lon: 77.209
    });
    assert.equal(valid.ok, true);
    assert.deepEqual(valid.data.profiles, ['infant', 'asthmatic']);
    assert.equal(valid.data.lat, 28.6139);
    assert.equal(valid.data.lon, 77.209);

    assert.equal(validatePlanRequest({ lat: 28.6 }).ok, false);
    assert.equal(validatePlanRequest({ lat: 95, lon: 77.2 }).ok, false);
    assert.equal(validatePlanRequest(null).ok, false);
    assert.equal(validatePlanRequest({ maskType: 'bandana' }).ok, false);
    assert.equal(validatePlanRequest({ purifierMode: 'ionizer' }).ok, false);
    assert.equal(validatePlanRequest({ profiles: ['alien'] }).ok, false);
    assert.equal(validatePlanRequest({ noExhaustTadka: 'yes' }).ok, false);
    assert.equal(validatePlanRequest({ roomVolumeM3: 5 }).ok, false);
    assert.equal(validatePlanRequest({ dailyKm: 500 }).ok, false);
    assert.equal(validatePlanRequest(JSON.parse('{"constructor":{"x":1}}')).ok, false);
  });

  it('validates /api/chat messages (1..500 chars) and history (<= 6 turns)', () => {
    const valid = validateChatRequest({
      message: 'Should I open windows at <2pm>?',
      history: [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: 'Hello' }
      ],
      lang: 'en',
      context: { lat: 25.5941, lon: 85.1376, profiles: ['elderly_cardiac'] }
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.data.message, 'Should I open windows at 2pm?');
    assert.equal(valid.data.history.length, 2);
    assert.equal(valid.data.context.lat, 25.5941);
    assert.equal(valid.data.context.lon, 85.1376);

    assert.equal(validateChatRequest({ message: '' }).ok, false);
    assert.equal(validateChatRequest({ message: '<<<>>>' }).ok, false);
    assert.equal(validateChatRequest({ message: 'a'.repeat(501) }).ok, false);

    const sevenTurns = Array.from({ length: 7 }, (_, i) => ({ role: 'user', text: `msg ${i}` }));
    assert.equal(validateChatRequest({ message: 'ok', history: sevenTurns }).ok, false);
    assert.equal(
      validateChatRequest({ message: 'ok', history: [{ role: 'system', text: 'hijack' }] }).ok,
      false
    );
    assert.equal(
      validateChatRequest({ message: 'ok', context: JSON.parse('{"__proto__":{"bad":1}}') }).ok,
      false
    );
  });
});
