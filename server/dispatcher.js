// AI dispatcher layer. The LLM never computes anything: it only writes prose around
// numbers that the deterministic engine already produced, referenced as {{placeholders}}.
// Pipeline: facts (from engine) -> LLM (JSON with placeholders) -> validate -> resolve -> audit.
// If the LLM is unavailable or fails validation twice, a deterministic template is used.
import { recommend, toHHMM } from '../engine.js';

const SUMMARY_KEYS = ['delayedFlights', 'cancelledFlights', 'strandedPax', 'missedConnections', 'crewBreaches', 'totalDelayMin'];
const pick = (s) => Object.fromEntries(SUMMARY_KEYS.map((k) => [k, s[k]]));

/** Build the ONLY data the LLM may reference. Every number is computed by engine.js. */
export function buildFacts(network, scenario, rec = recommend(network, scenario)) {
  const fl = Object.fromEntries(network.flights.map((f) => [f.flight_id, f]));
  const before = pick(rec.baselineDisrupted.summary), after = pick(rec.recovered.summary);
  const c = scenario.closures[0];
  const toM = (t) => (typeof t === 'string' ? t : toHHMM(t));
  return {
    scenario: { airport: c.airport, closeFrom: toM(c.start), closeTo: toM(c.end) },
    overall: {
      before, after,
      strandedSaved: before.strandedPax - after.strandedPax,
      crewBreachesAvoided: before.crewBreaches - after.crewBreaches,
      cancellationsAvoided: before.cancelledFlights - after.cancelledFlights,
      actionCount: rec.plan.length,
    },
    steps: rec.steps.map((s) => {
      const f = fl[s.action.flight_id];
      return {
        n: s.step,
        type: s.action.type,
        flight: s.action.flight_id,
        route: `${f.origin}-${f.destination}`,
        spare: s.action.spare || null,
        before: pick(s.before), after: pick(s.after),
        strandedSaved: s.before.strandedPax - s.after.strandedPax,
      };
    }),
  };
}

export const SYSTEM_PROMPT = `You are an airline operations dispatcher explaining a recovery plan.
RULES (strict):
1. You receive a JSON "facts" object computed by a deterministic engine. You may NOT calculate, estimate, round or invent any number.
2. Whenever you mention a number, write a placeholder naming its path in facts, e.g. {{overall.before.strandedPax}} or {{steps.0.strandedSaved}}. Never type digits yourself.
3. Flight ids (DS0101), tail ids (VT-DS17), airport codes and the times in facts.scenario may be written as plain text.
4. Respond with JSON only: {"headline": string, "steps": [{"action": string, "rationale": string}], "summary": string}.
   "steps" must have exactly one entry per entry in facts.steps, in order. Be concise, concrete and operational.`;

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;
const ID_PATTERNS = [/\bVT-DS\d{2}\b/g, /\bDS\d{4}\b/g, /\b\d{1,2}:\d{2}\b/g];

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function allNumbers(obj, out = new Set()) {
  if (typeof obj === 'number') { out.add(String(obj)); out.add(String(Math.abs(obj))); }
  else if (obj && typeof obj === 'object') for (const v of Object.values(obj)) allNumbers(v, out);
  return out;
}

/** Returns list of problems; empty list = text is safe to resolve. */
export function validateNarrative(n, facts) {
  const problems = [];
  if (!n || typeof n.headline !== 'string' || typeof n.summary !== 'string' || !Array.isArray(n.steps)) return ['bad shape'];
  if (n.steps.length !== facts.steps.length) problems.push(`expected ${facts.steps.length} steps, got ${n.steps.length}`);
  const texts = [n.headline, n.summary, ...n.steps.flatMap((s) => [s.action, s.rationale])];
  for (const t of texts) {
    if (typeof t !== 'string') { problems.push('non-string field'); continue; }
    for (const m of t.matchAll(PLACEHOLDER)) {
      const v = getPath(facts, m[1]);
      if (typeof v !== 'number' && typeof v !== 'string') problems.push(`unknown placeholder {{${m[1]}}}`);
    }
    let bare = t.replace(PLACEHOLDER, ' ');
    for (const p of ID_PATTERNS) bare = bare.replace(p, ' ');
    const digits = bare.match(/\d+(?:\.\d+)?/g);
    if (digits) problems.push(`bare number(s) not from engine: ${digits.join(', ')}`);
  }
  return problems;
}

export function resolveNarrative(n, facts) {
  const r = (t) => t.replace(PLACEHOLDER, (_, p) => String(getPath(facts, p)));
  return { headline: r(n.headline), summary: r(n.summary), steps: n.steps.map((s) => ({ action: r(s.action), rationale: r(s.rationale) })) };
}

/** Final audit on resolved text: every number must exist in facts. */
export function auditNumbers(resolved, facts) {
  const allowed = allNumbers(facts);
  const text = [resolved.headline, resolved.summary, ...resolved.steps.flatMap((s) => [s.action, s.rationale])].join(' ');
  let t = text;
  for (const p of ID_PATTERNS) t = t.replace(p, ' ');
  const bad = (t.match(/\d+(?:\.\d+)?/g) || []).filter((x) => !allowed.has(x));
  return { ok: bad.length === 0, unmatched: bad };
}

/** Deterministic narrative: same shape as the LLM's, numbers inserted directly from facts. */
export function fallbackNarrative(facts) {
  const o = facts.overall, s = facts.scenario;
  const verb = (st) => (st.type === 'cancel' ? `Cancel ${st.flight} (${st.route})` : `Swap spare ${st.spare} onto ${st.flight} (${st.route}) and the rest of its rotation`);
  const why = (st) => st.type === 'cancel'
    ? `Frees the aircraft and crew from a doomed rotation; stranded passengers ${st.before.strandedPax} → ${st.after.strandedPax}.`
    : `A fresh aircraft breaks the delay chain; stranded passengers ${st.before.strandedPax} → ${st.after.strandedPax}, crew breaches ${st.before.crewBreaches} → ${st.after.crewBreaches}.`;
  return {
    headline: `${s.airport} closure ${s.closeFrom}-${s.closeTo}: ${o.actionCount} action(s) cut stranded passengers from ${o.before.strandedPax} to ${o.after.strandedPax}.`,
    steps: facts.steps.map((st) => ({ action: verb(st), rationale: why(st) })),
    summary: `Without action: ${o.before.cancelledFlights} cancelled, ${o.before.delayedFlights} delayed, ${o.before.crewBreaches} crew breaches. With the plan: ${o.after.cancelledFlights} cancelled, ${o.after.delayedFlights} delayed, ${o.after.crewBreaches} crew breaches (${o.strandedSaved} fewer stranded passengers).`,
  };
}

async function callGemini(facts, feedback) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const user = JSON.stringify({ facts, ...(feedback ? { previous_attempt_errors: feedback } : {}) });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

const dispatchCache = new Map();

export function clearDispatchCache() {
  dispatchCache.clear();
}

/** Full dispatcher. `llm` is injectable for tests. Includes intelligent in-memory caching. */
export async function dispatch(network, scenario, { llm = process.env.GEMINI_API_KEY ? callGemini : null, useCache = true } = {}) {
  const cacheKey = JSON.stringify(scenario);
  const isDefaultLlm = (llm === callGemini || llm === null);
  if (useCache && isDefaultLlm && dispatchCache.has(cacheKey)) {
    return JSON.parse(JSON.stringify(dispatchCache.get(cacheKey)));
  }

  const rec = recommend(network, scenario);
  const facts = buildFacts(network, scenario, rec);
  let narrative = null, source = 'deterministic-template', feedback = null, attempts = 0;
  if (llm && rec.steps.length) {
    for (; attempts < 2 && !narrative; attempts++) {
      try {
        const raw = await llm(facts, feedback);
        const problems = validateNarrative(raw, facts);
        if (problems.length) { feedback = problems; continue; }
        const resolved = resolveNarrative(raw, facts);
        if (auditNumbers(resolved, facts).ok) { narrative = resolved; source = 'gemini'; }
      } catch (e) { feedback = [String(e.message)]; }
    }
  }
  if (!narrative) narrative = fallbackNarrative(facts);
  const result = {
    plan: rec.plan,
    before: rec.baselineDisrupted.summary,
    after: rec.recovered.summary,
    facts, narrative,
    verification: { source, numbersVerifiedAgainstEngine: auditNumbers(narrative, facts).ok, llmAttempts: attempts },
  };
  if (useCache && isDefaultLlm) {
    dispatchCache.set(cacheKey, result);
  }
  return result;
}
