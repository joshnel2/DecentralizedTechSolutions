/**
 * Simple in-memory TTL cache for expensive computations like permission checks.
 * NOT a replacement for Redis -- this is per-process only, suitable for reducing
 * repeated DB hits within a single request lifecycle or short time windows.
 *
 * Usage:
 *   import { createCache } from '../utils/cache.js';
 *   const permCache = createCache({ ttlMs: 30000, maxSize: 500 });
 *   const cached = permCache.get(key);
 *   if (cached !== undefined) return cached;
 *   const result = await expensiveQuery();
 *   permCache.set(key, result);
 */

/**
 * @param {object} options
 * @param {number} options.ttlMs - Time-to-live in milliseconds (default 30s)
 * @param {number} options.maxSize - Max entries before oldest are evicted (default 1000)
 */
export function createCache({ ttlMs = 30000, maxSize = 1000 } = {}) {
  const store = new Map();

  function evictExpired() {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) {
        store.delete(key);
      }
    }
  }

  // Periodic cleanup every 60s to prevent unbounded growth
  const cleanupInterval = setInterval(evictExpired, 60000);
  // Allow the process to exit without waiting for this interval
  if (cleanupInterval.unref) cleanupInterval.unref();

  return {
    /**
     * Get a cached value. Returns undefined if not found or expired.
     */
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },

    /**
     * Set a cached value with TTL.
     */
    set(key, value) {
      // Evict oldest entries if at max size
      if (store.size >= maxSize) {
        const firstKey = store.keys().next().value;
        store.delete(firstKey);
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },

    /**
     * Delete a specific key (e.g., when permissions change).
     */
    delete(key) {
      store.delete(key);
    },

    /**
     * Invalidate all entries matching a prefix (e.g., all entries for a firm).
     */
    invalidatePrefix(prefix) {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          store.delete(key);
        }
      }
    },

    /**
     * Clear all entries.
     */
    clear() {
      store.clear();
    },

    /** Current cache size */
    get size() {
      return store.size;
    },
  };
}
