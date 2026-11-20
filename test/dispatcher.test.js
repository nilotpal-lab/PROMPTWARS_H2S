import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dispatch, buildFacts, validateNarrative, auditNumbers } from '../server/dispatcher.js';

const net = JSON.parse(fs.readFileSync(new URL('../flight_network.json', import.meta.url)));
const SC = { closures: [{ airport: 'BOM', start: '07:00', end: '11:00' }], actions: [] };
const noKey = { llm: null };

test('without an LLM, deterministic template is used and numbers verify', async () => {
  const d = await dispatch(net, SC, noKey);
  assert.equal(d.verification.source, 'deterministic-template');
  assert.equal(d.verification.numbersVerifiedAgainstEngine, true);
  assert.ok(d.narrative.headline.includes(String(d.before.strandedPax)));
  assert.ok(d.narrative.headline.includes(String(d.after.strandedPax)));
});

test('honest LLM using placeholders is accepted and numbers are resolved from engine', async () => {
  const llm = async (facts) => ({
    headline: 'Stranded passengers drop from {{overall.before.strandedPax}} to {{overall.after.strandedPax}}',
    steps: facts.steps.map((s, i) => ({ action: `Step: ${s.type} ${s.flight}`, rationale: `Saves {{steps.${i}.strandedSaved}} passengers` })),
    summary: 'Crew breaches {{overall.before.crewBreaches}} to {{overall.after.crewBreaches}}.',
  });
  const d = await dispatch(net, SC, { llm });
  assert.equal(d.verification.source, 'gemini');
  assert.ok(d.narrative.headline.includes(String(d.before.strandedPax)));
  assert.equal(d.verification.numbersVerifiedAgainstEngine, true);
});

test('LLM that invents numbers is rejected, retried, then replaced by template', async () => {
  let calls = 0;
  const llm = async (facts) => { calls++; return { headline: 'We save 9999 passengers!', steps: facts.steps.map(() => ({ action: 'x', rationale: 'y' })), summary: 'ok' }; };
  const d = await dispatch(net, SC, { llm });
  assert.equal(calls, 2);
  assert.equal(d.verification.source, 'deterministic-template');
  assert.ok(!JSON.stringify(d.narrative).includes('9999'));
});

test('LLM referencing a non-existent placeholder is rejected', () => {
  const facts = buildFacts(net, SC);
  const bad = { headline: '{{overall.nope.strandedPax}}', summary: 's', steps: facts.steps.map(() => ({ action: 'a', rationale: 'r' })) };
  assert.ok(validateNarrative(bad, facts).some((p) => p.includes('unknown placeholder')));
});

test('LLM with wrong step count is rejected', () => {
  const facts = buildFacts(net, SC);
  assert.ok(validateNarrative({ headline: 'h', summary: 's', steps: [] }, facts).length > 0);
});

test('LLM that throws falls back safely', async () => {
  const d = await dispatch(net, SC, { llm: async () => { throw new Error('network down'); } });
  assert.equal(d.verification.source, 'deterministic-template');
});

test('audit catches a number that is not in facts', () => {
  const facts = buildFacts(net, SC);
  const r = { headline: 'We stranded 424242 people', summary: '', steps: [] };
  assert.equal(auditNumbers(r, facts).ok, false);
});

test('flight ids, tail ids and times are not flagged as invented numbers', () => {
  const facts = buildFacts(net, SC);
  const ok = { headline: 'Close 07:00 swap VT-DS17 onto DS0501', summary: 's', steps: facts.steps.map(() => ({ action: 'a', rationale: 'r' })) };
  assert.deepEqual(validateNarrative(ok, facts), []);
});
