/**
 * @fileoverview AbortController-protected API client for /api/aqi, /api/plan, and /api/chat.
 */

const CONTROLLERS = {
  aqi: null,
  plan: null,
  chat: null
};

function startRequestSignal(channel) {
  if (CONTROLLERS[channel]) {
    CONTROLLERS[channel].abort();
  }
  const controller = new AbortController();
  CONTROLLERS[channel] = controller;
  return controller.signal;
}

async function parseJsonResponse(res) {
  let data = null;
  try {
    data = await res.json();
  } catch (_err) {
    if (res.ok) {
      throw new Error('Unexpected non-JSON response from server');
    }
  }
  if (!res.ok) {
    const msg = data?.error?.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Empty JSON payload from server');
  }
  return data;
}

export function isAbortError(err) {
  return Boolean(err && err.name === 'AbortError');
}

/**
 * Fetch GET /api/aqi with automatic cancellation of stale in-flight queries.
 * @param {Record<string, unknown>} query
 * @returns {Promise<Record<string, unknown>>}
 */
export async function fetchAqiSnapshot(query) {
  const signal = startRequestSignal('aqi');
  const params = new URLSearchParams();
  if (query.city) {
    params.set('city', String(query.city));
  } else if (query.preset) {
    params.set('preset', String(query.preset));
  }
  if (Number.isFinite(query.calibratedAqi) && query.calibratedAqi >= 1) {
    params.set('calibratedAqi', String(Math.round(query.calibratedAqi)));
  }
  params.set('lang', query.lang === 'hi' ? 'hi' : 'en');

  const res = await fetch(`/api/aqi?${params.toString()}`, { signal });
  return parseJsonResponse(res);
}

/**
 * Request POST /api/plan with automatic cancellation of stale debounced requests.
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Record<string, unknown>>}
 */
export async function fetchActionPlan(payload) {
  const signal = startRequestSignal('plan');
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });
  return parseJsonResponse(res);
}

/**
 * Request POST /api/chat for Ask VayuMitra copilot replies.
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Record<string, unknown>>}
 */
export async function postChatMessage(payload) {
  const signal = startRequestSignal('chat');
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });
  return parseJsonResponse(res);
}
