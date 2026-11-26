/**
 * @fileoverview Bounded LRU/TTL in-memory cache and sliding-window rate limiter
 * with injectable monotonic/mock clock for deterministic testing.
 */

/**
 * Resolve positive integer configuration with safe bounds.
 * @param {unknown} raw
 * @param {number} fallback
 * @param {number} min
 * @returns {number}
 */
function resolvePositiveInt(raw, fallback, min = 1) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return fallback;
  }
  return Math.max(min, Math.trunc(raw));
}

/**
 * Refresh LRU recency by moving an existing key to the Map insertion tail.
 * @template K, V
 * @param {Map<K, V>} store
 * @param {K} key
 * @param {V} entry
 */
function touchEntry(store, key, entry) {
  store.delete(key);
  store.set(key, entry);
}

/**
 * Create a bounded LRU + TTL cache.
 * @param {{ maxEntries?: number, now?: () => number }} [options]
 * @returns {{
 *   get: (key: string) => unknown,
 *   set: (key: string, value: unknown, ttlMs?: number) => boolean,
 *   has: (key: string) => boolean,
 *   delete: (key: string) => boolean,
 *   clear: () => void,
 *   readonly size: number,
 *   readonly maxEntries: number
 * }}
 */
export function createTtlCache(options = {}) {
  const maxEntries = resolvePositiveInt(options.maxEntries, 200);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) {
      return undefined;
    }
    if (now() >= entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    touchEntry(store, key, entry);
    return entry.value;
  }

  function set(key, value, ttlMs = 300_000) {
    if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      store.delete(key);
      return false;
    }
    if (store.has(key)) {
      store.delete(key);
    } else if (store.size >= maxEntries) {
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) {
        store.delete(oldestKey);
      }
    }
    store.set(key, { value, expiresAt: now() + ttlMs });
    return true;
  }

  function has(key) {
    const entry = store.get(key);
    if (!entry) {
      return false;
    }
    if (now() >= entry.expiresAt) {
      store.delete(key);
      return false;
    }
    return true;
  }

  return {
    get,
    set,
    has,
    delete: (key) => store.delete(key),
    clear: () => store.clear(),
    get size() {
      return store.size;
    },
    get maxEntries() {
      return maxEntries;
    }
  };
}

/**
 * Create a bounded sliding-window rate limiter with LRU IP eviction.
 * @param {{
 *   windowMs?: number,
 *   maxRequests?: number,
 *   maxEntries?: number,
 *   now?: () => number
 * }} [options]
 * @returns {{
 *   consume: (key: string) => {
 *     allowed: boolean,
 *     remaining: number,
 *     limit: number,
 *     retryAfterSec: number,
 *     resetAt: number
 *   },
 *   clear: () => void,
 *   readonly size: number
 * }}
 */
export function createSlidingRateLimiter(options = {}) {
  const windowMs = resolvePositiveInt(options.windowMs, 60_000);
  const maxRequests = resolvePositiveInt(options.maxRequests, 60);
  const maxEntries = resolvePositiveInt(options.maxEntries, 5000);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const buckets = new Map();

  function evictIfFull(key) {
    if (buckets.has(key)) {
      buckets.delete(key);
      return;
    }
    if (buckets.size >= maxEntries) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) {
        buckets.delete(oldestKey);
      }
    }
  }

  function pruneStamps(stamps, cutoff) {
    let firstValid = 0;
    while (firstValid < stamps.length && stamps[firstValid] <= cutoff) {
      firstValid += 1;
    }
    return firstValid > 0 ? stamps.slice(firstValid) : stamps;
  }

  function consume(rawKey) {
    const key = String(rawKey || 'anonymous');
    const currentMs = now();
    const active = pruneStamps(buckets.get(key) ?? [], currentMs - windowMs);
    evictIfFull(key);

    if (active.length >= maxRequests) {
      buckets.set(key, active);
      const oldest = active[0] ?? currentMs;
      const retryAfterMs = Math.max(1, oldest + windowMs - currentMs);
      return {
        allowed: false,
        remaining: 0,
        limit: maxRequests,
        retryAfterSec: Math.ceil(retryAfterMs / 1000),
        resetAt: oldest + windowMs
      };
    }

    active.push(currentMs);
    buckets.set(key, active);
    return {
      allowed: true,
      remaining: maxRequests - active.length,
      limit: maxRequests,
      retryAfterSec: 0,
      resetAt: active[0] + windowMs
    };
  }

  return {
    consume,
    clear: () => buckets.clear(),
    get size() {
      return buckets.size;
    }
  };
}

/**
 * Validate Upstash REST base URL (HTTPS required, or localhost/127.0.0.1 for local tests).
 * @param {string} rawUrl
 * @returns {string | null}
 */
function normalizeRedisBaseUrl(rawUrl) {
  const trimmed = String(rawUrl ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    if (parsed.protocol !== 'https:' && !isLocal) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Execute an Upstash Redis REST pipeline (INCR + PEXPIRE) for a fixed-window bucket key.
 * @param {{
 *   baseUrl: string,
 *   token: string,
 *   bucketKey: string,
 *   windowMs: number,
 *   fetchImpl: typeof globalThis.fetch
 * }} cfg
 * @returns {Promise<number>}
 */
async function incrementUpstashBucket(cfg) {
  const res = await cfg.fetchImpl(`${cfg.baseUrl}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([
      ['INCR', cfg.bucketKey],
      ['PEXPIRE', cfg.bucketKey, cfg.windowMs]
    ]),
    signal: AbortSignal.timeout(1500)
  });
  if (!res.ok) {
    throw new Error(`Upstash REST returned ${res.status}`);
  }
  const payload = await res.json();
  const count = Number(payload?.[0]?.result);
  if (!Array.isArray(payload) || payload[0]?.error || !Number.isFinite(count) || count < 1) {
    throw new Error('Invalid Upstash REST pipeline response');
  }
  return count;
}

/**
 * Create an optional Upstash Redis REST distributed rate limiter (`INCR` + `PEXPIRE`)
 * with automatic graceful fallback to an in-memory sliding-window rate limiter.
 * @param {{
 *   redisUrl?: string,
 *   redisToken?: string,
 *   windowMs?: number,
 *   maxRequests?: number,
 *   fallbackLimiter?: ReturnType<typeof createSlidingRateLimiter>,
 *   fetchImpl?: typeof globalThis.fetch,
 *   now?: () => number
 * }} [options]
 */
export function createDistributedRateLimiter(options = {}) {
  const windowMs = resolvePositiveInt(options.windowMs, 60_000);
  const maxRequests = resolvePositiveInt(options.maxRequests, 60);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const fallbackLimiter =
    options.fallbackLimiter ?? createSlidingRateLimiter({ windowMs, maxRequests, now });
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = normalizeRedisBaseUrl(options.redisUrl);
  const token = String(options.redisToken ?? '').trim();
  const configured = Boolean(baseUrl && token && typeof fetchImpl === 'function');

  async function consume(rawKey) {
    const key = String(rawKey || 'anonymous');
    if (!configured) {
      return fallbackLimiter.consume(key);
    }
    const currentMs = now();
    const windowIndex = Math.floor(currentMs / windowMs);
    const resetAt = (windowIndex + 1) * windowMs;
    const bucketKey = `rl:${key}:${windowIndex}`;

    try {
      const count = await incrementUpstashBucket({ baseUrl, token, bucketKey, windowMs, fetchImpl });
      const allowed = count <= maxRequests;
      return {
        allowed,
        remaining: Math.max(0, maxRequests - count),
        limit: maxRequests,
        retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((resetAt - currentMs) / 1000)),
        resetAt
      };
    } catch {
      return fallbackLimiter.consume(key);
    }
  }

  return {
    consume,
    clear: () => fallbackLimiter.clear(),
    get size() {
      return fallbackLimiter.size;
    }
  };
}
