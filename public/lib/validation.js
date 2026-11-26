/**
 * @fileoverview Strict isomorphic input validation, prototype-pollution guards,
 * control-character/angle-bracket sanitization, and JSON-safe prompt preparation.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const VALID_PRESETS = new Set(['delhi-severe', 'igp-very-poor', 'coastal-moderate']);
const VALID_LANGS = new Set(['en', 'hi']);
const VALID_PROFILES = new Set([
  'infant',
  'school_child',
  'elderly_cardiac',
  'asthmatic',
  'commuter',
  'outdoor_worker'
]);
const VALID_MASKS = new Set(['none', 'cloth', 'surgical', 'n95']);
const VALID_PURIFIERS = new Set(['none', 'diy_cr_box', 'hepa_purifier']);
const VALID_COMMUTES = new Set([
  'petrol_car',
  'diesel_cab',
  'two_wheeler',
  'metro_bus',
  'ev',
  'wfh',
  'anti_idling'
]);
const VALID_COMMUNITY_ACTIONS = new Set([
  'compost_leaves',
  'watchman_thermal_gear',
  'school_no_idling_dg_stagger'
]);
const VALID_CHAT_ROLES = new Set(['user', 'assistant', 'model']);

const PLAN_NUMERIC_BOUNDS = Object.freeze([
  ['roomVolumeM3', 10, 500],
  ['outdoorHours', 0, 16],
  ['dailyKm', 0, 200],
  ['commuteDaysPerWeek', 1, 7],
  ['pm25', 0, 1500],
  ['naqi', 0, 999],
  ['calibratedAqi', 1, 999],
  ['calibratedPm25', 0, 1500]
]);

const PLAN_BOOLEAN_FIELDS = Object.freeze([
  'noExhaustTadka',
  'indoorIncenseOrCoil',
  'dryJhaduSweeping',
  'sealed24hNoFlush'
]);

/**
 * Check if a non-array or array object has an unexpected prototype chain.
 * @param {object} value
 * @returns {boolean}
 */
function hasTamperedPrototype(value) {
  const expectedProto = Array.isArray(value) ? Array.prototype : Object.prototype;
  const actualProto = Object.getPrototypeOf(value);
  return actualProto !== null && actualProto !== expectedProto;
}

/**
 * Recursively inspect an object graph for forbidden keys, cycles, or deep nesting.
 * @param {unknown} value
 * @param {WeakSet<object>} seen
 * @param {number} depth
 * @returns {boolean}
 */
function inspectForbiddenNode(value, seen, depth) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (depth > 20 || seen.has(value)) {
    return true;
  }
  seen.add(value);
  if (hasTamperedPrototype(value)) {
    return true;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_KEYS.has(key) || inspectForbiddenNode(value[key], seen, depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Check recursively whether an object or array contains prototype-pollution keys
 * (__proto__, constructor, prototype) or a tampered prototype chain.
 * @param {unknown} value
 * @returns {boolean}
 */
export function hasForbiddenKeys(value) {
  return inspectForbiddenNode(value, new WeakSet(), 0);
}

/**
 * Normalize a single character, stripping control chars and angle brackets.
 * @param {string} ch
 * @returns {string}
 */
function sanitizeChar(ch) {
  const code = ch.codePointAt(0) ?? 0;
  if (code === 9 || code === 10 || code === 13) {
    return ' ';
  }
  if (code >= 32 && code !== 127 && ch !== '<' && ch !== '>') {
    return ch;
  }
  return '';
}

/**
 * Strip ASCII control characters (\u0000-\u001F, \u007F) and angle brackets (<, >)
 * for safe text display and JSON-serialized LLM prompt boundaries.
 * @param {unknown} input
 * @param {number} [maxLength]
 * @returns {string}
 */
export function sanitizePlainText(input, maxLength = 500) {
  if (typeof input !== 'string') {
    return '';
  }
  const limit = Number.isFinite(maxLength) ? maxLength : 500;
  let cleaned = '';
  for (const ch of input) {
    cleaned += sanitizeChar(ch);
  }
  return cleaned.replace(/ {2,}/g, ' ').trim().slice(0, limit);
}

/**
 * Parse a strict finite number from string or number input within [min, max].
 * @param {unknown} raw
 * @param {number} min
 * @param {number} max
 * @returns {{ valid: boolean, value: number | null }}
 */
function parseBoundedNumber(raw, min, max) {
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return { valid: false, value: null };
  }
  const str = typeof raw === 'number' ? String(raw) : raw.trim();
  if (str.length === 0) {
    return { valid: false, value: null };
  }
  const num = Number(str);
  if (!Number.isFinite(num) || num < min || num > max) {
    return { valid: false, value: null };
  }
  return { valid: true, value: num };
}

/**
 * Check if value is a plain non-array object without forbidden keys.
 * @param {unknown} value
 * @returns {boolean}
 */
function isSafePlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !hasForbiddenKeys(value);
}

/**
 * Validate optional bounded numeric fields against a bounds table.
 * @param {Record<string, unknown>} obj
 * @param {readonly (readonly [string, number, number])[]} boundsTable
 * @param {Record<string, unknown>} out
 * @returns {string | null}
 */
function assignOptionalNumbers(obj, boundsTable, out) {
  for (const [field, min, max] of boundsTable) {
    if (obj[field] === undefined || obj[field] === '') {
      continue;
    }
    const parsed = parseBoundedNumber(obj[field], min, max);
    if (!parsed.valid) {
      return `${field} must be between ${min} and ${max}`;
    }
    out[field] = parsed.value;
  }
  return null;
}

/**
 * Validate coordinate pair (lat & lon together within [-90, 90] and [-180, 180]).
 * @param {Record<string, unknown>} q
 * @param {Record<string, unknown>} out
 * @returns {string | null}
 */
function validateCoordinates(q, out) {
  const hasLat = q.lat !== undefined && q.lat !== '';
  const hasLon = q.lon !== undefined && q.lon !== '';
  if (!hasLat && !hasLon) {
    return null;
  }
  if (hasLat !== hasLon) {
    return 'Both lat and lon must be provided together';
  }
  const latParsed = parseBoundedNumber(q.lat, -90, 90);
  const lonParsed = parseBoundedNumber(q.lon, -180, 180);
  if (!latParsed.valid || !lonParsed.valid) {
    return 'Coordinates out of range (lat -90..90, lon -180..180)';
  }
  out.lat = latParsed.value;
  out.lon = lonParsed.value;
  return null;
}

/**
 * Validate optional city query string.
 * @param {Record<string, unknown>} q
 * @param {Record<string, unknown>} out
 * @returns {string | null}
 */
function validateCityField(q, out) {
  if (q.city === undefined || q.city === '') {
    return null;
  }
  if (typeof q.city !== 'string' || q.city.trim().length > 80) {
    return 'city must be a string up to 80 characters';
  }
  const city = sanitizePlainText(q.city, 80);
  if (city.length === 0) {
    return 'city contains no valid characters';
  }
  out.city = city;
  return null;
}

/**
 * Validate optional preset field.
 * @param {Record<string, unknown>} obj
 * @param {Record<string, unknown>} out
 * @returns {string | null}
 */
function validatePresetField(obj, out) {
  if (obj.preset === undefined || obj.preset === '') {
    return null;
  }
  if (typeof obj.preset !== 'string' || !VALID_PRESETS.has(obj.preset)) {
    return 'Invalid preset ID';
  }
  out.preset = obj.preset;
  return null;
}

/**
 * Run all optional field validators for /api/aqi query parameters.
 * @param {Record<string, unknown>} q
 * @param {Record<string, unknown>} out
 * @returns {string | null}
 */
function runAqiFieldValidators(q, out) {
  return (
    validatePresetField(q, out) ??
    validateCoordinates(q, out) ??
    validateCityField(q, out) ??
    assignOptionalNumbers(q, [['calibratedAqi', 1, 999], ['calibratedPm25', 0, 1500]], out)
  );
}

/**
 * Apply default Delhi preset when no location query or preset is supplied.
 * @param {Record<string, unknown>} out
 * @returns {void}
 */
function applyDefaultAqiPreset(out) {
  if (!out.preset && out.lat === undefined && !out.city) {
    out.preset = 'delhi-severe';
  }
}

/**
 * Validate optional language field without coercing non-primitive objects.
 * @param {unknown} rawLang
 * @returns {'en' | 'hi' | null}
 */
function validateLangField(rawLang) {
  const lang = rawLang === undefined ? 'en' : rawLang;
  if (typeof lang !== 'string' || !VALID_LANGS.has(lang)) {
    return null;
  }
  return /** @type {'en' | 'hi'} */ (lang);
}

/**
 * Validate /api/aqi query parameters cleanly.
 * @param {unknown} [query]
 * @returns {{ ok: true, data: Record<string, unknown> } | { ok: false, error: string }}
 */
export function validateAqiQuery(query) {
  const q = query === undefined ? {} : query;
  if (!isSafePlainObject(q)) {
    return { ok: false, error: 'Invalid query object' };
  }

  const lang = validateLangField(q.lang);
  if (!lang) {
    return { ok: false, error: 'lang must be en or hi' };
  }

  const out = { lang };
  const err = runAqiFieldValidators(q, out);
  if (err) {
    return { ok: false, error: err };
  }
  applyDefaultAqiPreset(out);
  return { ok: true, data: out };
}

/**
 * Validate an array of allowlisted enum string values.
 * @param {unknown} value
 * @param {Set<string>} allowSet
 * @param {number} maxItems
 * @param {string} fieldName
 * @returns {{ ok: true, items: string[] } | { ok: false, error: string }}
 */
function validateEnumArray(value, allowSet, maxItems, fieldName) {
  if (!Array.isArray(value) || value.length > maxItems) {
    return { ok: false, error: `${fieldName} must be an array of at most ${maxItems} items` };
  }
  const cleaned = [];
  for (const item of value) {
    if (typeof item !== 'string' || !allowSet.has(item)) {
      return { ok: false, error: `Invalid ${fieldName} entry` };
    }
    if (!cleaned.includes(item)) {
      cleaned.push(item);
    }
  }
  return { ok: true, items: cleaned };
}

/**
 * Validate optional boolean toggle fields inside plan body.
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>} out
 * @returns {string | null}
 */
function validatePlanBooleans(body, out) {
  for (const field of PLAN_BOOLEAN_FIELDS) {
    if (body[field] === undefined) {
      out[field] = false;
      continue;
    }
    if (typeof body[field] !== 'boolean') {
      return `${field} must be a boolean`;
    }
    out[field] = body[field];
  }
  return null;
}

/**
 * Validate enum fields of /api/plan request body.
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>} out
 * @returns {string | null}
 */
function validatePlanEnums(body, out) {
  const checks = [
    ['lang', VALID_LANGS, 'en'],
    ['maskType', VALID_MASKS, 'n95'],
    ['purifierMode', VALID_PURIFIERS, 'none'],
    ['commuteFrom', VALID_COMMUTES, 'petrol_car'],
    ['commuteTo', VALID_COMMUTES, 'metro_bus']
  ];
  for (const [key, allowSet, fallback] of checks) {
    const val = body[key] === undefined ? fallback : body[key];
    if (typeof val !== 'string' || !allowSet.has(val)) {
      return `Invalid ${key}`;
    }
    out[key] = val;
  }
  if (body.profile !== undefined) {
    if (typeof body.profile !== 'string' || !VALID_PROFILES.has(body.profile)) {
      return 'Invalid profile';
    }
    out.profile = body.profile;
  }
  return null;
}

/**
 * Validate profiles and communityActions arrays in /api/plan body.
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>} out
 * @returns {string | null}
 */
function validatePlanArrays(body, out) {
  const defaultProfiles = out.profile ? [out.profile] : ['commuter'];
  if (body.profiles !== undefined) {
    const res = validateEnumArray(body.profiles, VALID_PROFILES, 6, 'profiles');
    if (!res.ok) {
      return res.error;
    }
    out.profiles = res.items.length > 0 ? res.items : defaultProfiles;
  } else {
    out.profiles = defaultProfiles;
  }
  out.profile = out.profile ?? out.profiles[0];

  if (body.communityActions !== undefined) {
    const res = validateEnumArray(body.communityActions, VALID_COMMUNITY_ACTIONS, 3, 'communityActions');
    if (!res.ok) {
      return res.error;
    }
    out.communityActions = res.items;
  } else {
    out.communityActions = [];
  }
  return null;
}

/**
 * Run all field validators for /api/plan request payloads.
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>} out
 * @returns {string | null}
 */
function runPlanFieldValidators(body, out) {
  return (
    validatePlanEnums(body, out) ??
    validatePlanBooleans(body, out) ??
    validatePlanArrays(body, out) ??
    assignOptionalNumbers(body, PLAN_NUMERIC_BOUNDS, out) ??
    validatePresetField(body, out) ??
    validateCoordinates(body, out) ??
    validateCityField(body, out)
  );
}

/**
 * Validate /api/plan request payload.
 * @param {unknown} body
 * @returns {{ ok: true, data: Record<string, unknown> } | { ok: false, error: string }}
 */
export function validatePlanRequest(body) {
  if (!isSafePlainObject(body)) {
    return { ok: false, error: 'Request body must be a plain object' };
  }

  const out = {};
  const err = runPlanFieldValidators(body, out);
  if (err) {
    return { ok: false, error: err };
  }
  return { ok: true, data: out };
}

/**
 * Validate chat history turns (max 6 turns, sanitized text).
 * @param {unknown} history
 * @returns {{ ok: true, items: { role: string, text: string }[] } | { ok: false, error: string }}
 */
function validateChatHistory(history) {
  if (history === undefined) {
    return { ok: true, items: [] };
  }
  if (!Array.isArray(history) || history.length > 6) {
    return { ok: false, error: 'history must be an array of at most 6 turns' };
  }
  const items = [];
  for (const turn of history) {
    if (!isSafePlainObject(turn) || typeof turn.role !== 'string' || !VALID_CHAT_ROLES.has(turn.role)) {
      return { ok: false, error: 'Invalid chat history entry' };
    }
    const text = sanitizePlainText(turn.text ?? turn.content, 500);
    if (text.length === 0) {
      return { ok: false, error: 'Chat history turn text cannot be empty' };
    }
    items.push({ role: turn.role, text });
  }
  return { ok: true, items };
}

/**
 * Validate /api/chat request payload (message 1..500 chars, history <= 6 turns).
 * @param {unknown} body
 * @returns {{ ok: true, data: Record<string, unknown> } | { ok: false, error: string }}
 */
export function validateChatRequest(body) {
  if (!isSafePlainObject(body)) {
    return { ok: false, error: 'Request body must be a plain object' };
  }
  const lang = validateLangField(body.lang);
  if (!lang) {
    return { ok: false, error: 'lang must be en or hi' };
  }
  if (typeof body.message !== 'string' || body.message.trim().length > 500) {
    return { ok: false, error: 'message must be 1 to 500 characters' };
  }
  const message = sanitizePlainText(body.message, 500);
  if (message.length === 0) {
    return { ok: false, error: 'message must not be empty' };
  }

  const historyRes = validateChatHistory(body.history);
  if (!historyRes.ok) {
    return historyRes;
  }

  const out = { message, history: historyRes.items, lang };
  if (body.context !== undefined) {
    const ctxRes = validatePlanRequest(body.context);
    if (!ctxRes.ok) {
      return { ok: false, error: `Invalid context: ${ctxRes.error}` };
    }
    out.context = ctxRes.data;
  }
  return { ok: true, data: out };
}
