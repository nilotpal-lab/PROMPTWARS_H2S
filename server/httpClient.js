/**
 * @fileoverview Hardened outbound HTTP client enforcing HTTPS, strict host allowlist,
 * redirect blocking, AbortController timeouts, streaming byte-cap, and secret redaction.
 */

export const ALLOWED_HOSTS = new Set([
  'air-quality-api.open-meteo.com',
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'api.waqi.info',
  'api.data.gov.in',
  'firms.modaps.eosdis.nasa.gov',
  'generativelanguage.googleapis.com'
]);

const ENV_SECRET_KEYS = [
  'GEMINI_API_KEY',
  'WAQI_API_KEY',
  'DATA_GOV_IN_API_KEY',
  'NASA_FIRMS_MAP_KEY'
];

/**
 * Escape regex metacharacters in a literal secret string.
 * @param {string} literal
 * @returns {string}
 */
function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Collect non-trivial secret values from environment variables and extras.
 * @param {readonly string[]} extraSecrets
 * @returns {string[]}
 */
function collectSecretValues(extraSecrets) {
  const values = [];
  for (const key of ENV_SECRET_KEYS) {
    const val = process.env[key];
    if (typeof val === 'string' && val.trim().length >= 4) {
      values.push(val.trim());
    }
  }
  for (const extra of extraSecrets) {
    if (typeof extra === 'string' && extra.trim().length >= 4) {
      values.push(extra.trim());
    }
  }
  return Array.from(new Set(values)).sort((a, b) => b.length - a.length);
}

/**
 * Scrub known environment secrets, query/path API tokens, and key headers from text.
 * @param {unknown} text
 * @param {readonly string[]} [extraSecrets]
 * @returns {string}
 */
export function redactSecrets(text, extraSecrets = []) {
  if (text === null || text === undefined) {
    return '';
  }
  let output = String(text);

  for (const secret of collectSecretValues(extraSecrets)) {
    output = output.replace(new RegExp(escapeRegExp(secret), 'g'), '[REDACTED]');
  }

  output = output.replace(
    /([?&](?:token|api-key|api_key|key|map_key)=)([^&\s'"`]+)/gi,
    '$1[REDACTED]'
  );
  output = output.replace(/(\/csv\/)([^/\s'"`]+)(\/)/gi, '$1[REDACTED]$3');
  output = output.replace(
    /((?:GEMINI_API_KEY|WAQI_API_KEY|DATA_GOV_IN_API_KEY|NASA_FIRMS_MAP_KEY|x-goog-api-key)\s*[:=]\s*)([^\s,'"`;]+)/gi,
    '$1[REDACTED]'
  );
  output = output.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED]');

  return output;
}

/**
 * Validate outbound URL against HTTPS, credential-free authority, and host allowlist.
 * @param {unknown} rawUrl
 * @returns {URL}
 */
function parseAllowedUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new Error('Blocked malformed outbound URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Blocked non-HTTPS protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Blocked URL containing embedded credentials');
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Blocked non-allowlisted host: ${parsed.hostname}`);
  }
  return parsed;
}

/**
 * Read a Web ReadableStream with strict byte cap, cancelling immediately on overflow.
 * @param {ReadableStream<Uint8Array>} bodyStream
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
async function readStreamWithCap(bodyStream, maxBytes) {
  const reader = bodyStream.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel('Response exceeded maxBytes limit').catch(() => {});
        throw new Error(`Response exceeded ${maxBytes} byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))).toString('utf8');
}

/**
 * Read a Fetch response body safely under a hard byte limit.
 * @param {Response} response
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
async function readResponseTextCapped(response, maxBytes) {
  const contentLength = Number(response.headers?.get?.('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error(`Response Content-Length ${contentLength} exceeds ${maxBytes} byte limit`);
  }
  if (response.body && typeof response.body.getReader === 'function') {
    return readStreamWithCap(response.body, maxBytes);
  }
  const text = typeof response.text === 'function' ? await response.text() : '';
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new Error(`Response exceeded ${maxBytes} byte limit`);
  }
  return text;
}

/**
 * Wrap any fetch/stream error through redactSecrets() while preserving error name.
 * @param {unknown} err
 * @param {readonly string[]} secrets
 * @returns {Error}
 */
function wrapRedactedError(err, secrets) {
  const rawMsg = err instanceof Error ? err.message : String(err);
  const wrapped = new Error(redactSecrets(rawMsg, secrets));
  if (err instanceof Error && err.name) {
    wrapped.name = err.name;
  }
  return wrapped;
}

/**
 * Wrap a capped response body into a Fetch-compatible response object.
 * @param {Response} response
 * @param {string} bodyText
 * @returns {{
 *   ok: boolean,
 *   status: number,
 *   headers: Headers,
 *   bodyText: string,
 *   text: () => Promise<string>,
 *   json: () => Promise<unknown>
 * }}
 */
function buildWrappedResponse(response, bodyText) {
  return {
    ok: Boolean(response.ok),
    status: Number(response.status) || 200,
    headers: response.headers,
    bodyText,
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText)
  };
}

/**
 * Check whether an upstream fetch response represents an HTTP redirect.
 * @param {Response} response
 * @returns {boolean}
 */
function isRedirectResponse(response) {
  return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
}

/**
 * Perform a guarded HTTPS fetch against allowlisted domains with timeout,
 * redirect blocking, streaming byte cap, and secret-redacted error reporting.
 * @param {string | URL} url
 * @param {{
 *   timeoutMs?: number,
 *   maxBytes?: number,
 *   fetchImpl?: typeof globalThis.fetch,
 *   headers?: Record<string, string>,
 *   method?: string,
 *   body?: BodyInit,
 *   secrets?: readonly string[]
 * }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   status: number,
 *   headers: Headers,
 *   bodyText: string,
 *   text: () => Promise<string>,
 *   json: () => Promise<unknown>
 * }>}
 */
export async function safeFetch(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 3500;
  const maxBytes = options.maxBytes ?? 524_288;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const secrets = options.secrets ?? [];
  const parsed = parseAllowedUrl(url);
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation available');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Upstream timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const response = await fetchImpl(parsed.toString(), {
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      body: options.body,
      redirect: 'error',
      signal: controller.signal
    });
    if (isRedirectResponse(response)) {
      throw new Error(`Blocked HTTP redirect status ${response.status}`);
    }
    const bodyText = await readResponseTextCapped(response, maxBytes);
    return buildWrappedResponse(response, bodyText);
  } catch (err) {
    throw wrapRedactedError(err, secrets);
  } finally {
    clearTimeout(timer);
  }
}
