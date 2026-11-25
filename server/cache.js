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
