/**
 * Document Cache Service
 * 
 * Provides in-memory caching for document listing queries to reduce database load.
 * Uses a time-based cache with automatic invalidation on document changes.
 * 
 * Cache Strategy:
 * - User document counts: Cached for 30 seconds (changes frequently)
 * - Matter document lists: Cached for 60 seconds (more stable)
 * - Firm document counts: Cached for 120 seconds (admin stats)
 * 
 * In production, this can be replaced with Redis for multi-instance support.
 */

// Cache storage
const cache = new Map();

// Default TTL values (in milliseconds)
const TTL = {
  USER_DOC_COUNT: 30 * 1000,      // 30 seconds
  MATTER_DOCUMENTS: 60 * 1000,    // 60 seconds
  FIRM_DOC_COUNT: 120 * 1000,     // 2 minutes
  USER_MATTERS: 60 * 1000,        // 60 seconds (for accessible matter IDs)
  DOCUMENT_LIST: 30 * 1000,       // 30 seconds
};

// Statistics for monitoring
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
};

/**
 * Generate a cache key from parameters
 * @param {string} prefix - Cache key prefix (e.g., 'user_docs', 'matter_docs')
 * @param  {...any} parts - Key parts to join
 * @returns {string} Cache key
 */
function makeKey(prefix, ...parts) {
  return `${prefix}:${parts.filter(p => p !== undefined && p !== null).join(':')}`;
}

/**
 * Get a value from cache
 * @param {string} key - Cache key
 * @returns {any|null} Cached value or null if expired/missing
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) {
    stats.misses++;
    return null;
  }
  
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    stats.misses++;
    return null;
  }
  
  stats.hits++;
  return entry.value;
}

/**
 * Set a value in cache
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in milliseconds
 */
function set(key, value, ttl) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
    createdAt: Date.now(),
  });
  stats.sets++;
}

/**
 * Invalidate cache entries matching a pattern
 * @param {string} pattern - Pattern to match (prefix)
 */
function invalidate(pattern) {
  for (const key of cache.keys()) {
    if (key.startsWith(pattern)) {
      cache.delete(key);
      stats.invalidations++;
    }
  }
}

/**
 * Clear all cache entries for a firm
 * @param {string} firmId - Firm ID
 */
function invalidateFirm(firmId) {
  invalidate(`user_docs:${firmId}`);
  invalidate(`matter_docs:${firmId}`);
  invalidate(`firm_docs:${firmId}`);
  invalidate(`doc_list:${firmId}`);
  invalidate(`user_matters:${firmId}`);
}

/**
 * Clear all cache entries
 */
function clearAll() {
  const size = cache.size;
  cache.clear();
  console.log(`[DOC_CACHE] Cleared ${size} entries`);
}

/**
 * Get cache statistics
 * @returns {object} Cache statistics
 */
function getStats() {
  const hitRate = stats.hits + stats.misses > 0 
    ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(1)
    : 0;
  
  return {
    ...stats,
    hitRate: `${hitRate}%`,
    size: cache.size,
    memoryEstimate: `${(cache.size * 500 / 1024).toFixed(1)} KB`, // Rough estimate
  };
}

// ============================================
// HIGH-LEVEL CACHING FUNCTIONS
// ============================================

/**
 * Cache user's accessible matter IDs
 * This is expensive to compute and changes infrequently
 * 
 * @param {string} firmId - Firm ID
 * @param {string} userId - User ID
 * @param {function} fetchFn - Function to fetch if not cached
 * @returns {Promise<string[]>} Array of matter IDs
 */
async function getUserAccessibleMatterIds(firmId, userId, fetchFn) {
  const key = makeKey('user_matters', firmId, userId);
  let result = get(key);
  
  if (result !== null) {
    return result;
  }
  
  result = await fetchFn();
  set(key, result, TTL.USER_MATTERS);
  return result;
}

/**
 * Cache document count for a firm
 * 
 * @param {string} firmId - Firm ID
 * @param {function} fetchFn - Function to fetch if not cached
 * @returns {Promise<number>} Document count
 */
async function getFirmDocumentCount(firmId, fetchFn) {
  const key = makeKey('firm_docs', firmId, 'count');
  let result = get(key);
  
  if (result !== null) {
    return result;
  }
  
  result = await fetchFn();
  set(key, result, TTL.FIRM_DOC_COUNT);
  return result;
}

/**
 * Cache document list query results
 * 
 * @param {string} firmId - Firm ID
 * @param {string} userId - User ID
 * @param {object} filters - Query filters
 * @param {function} fetchFn - Function to fetch if not cached
 * @returns {Promise<object>} Cached result
 */
async function getDocumentList(firmId, userId, filters, fetchFn) {
  // Create a deterministic key from filters
  const filterKey = JSON.stringify(filters, Object.keys(filters).sort());
  const key = makeKey('doc_list', firmId, userId, Buffer.from(filterKey).toString('base64').substring(0, 32));
  
  let result = get(key);
  
  if (result !== null) {
    return { ...result, cached: true };
  }
  
  result = await fetchFn();
  set(key, result, TTL.DOCUMENT_LIST);
  return { ...result, cached: false };
}

/**
 * Invalidate document caches when a document is created/updated/deleted
 * 
 * @param {string} firmId - Firm ID
 * @param {string} matterId - Optional matter ID
 */
function onDocumentChange(firmId, matterId = null) {
  invalidateFirm(firmId);
  if (matterId) {
    invalidate(`matter_docs:${firmId}:${matterId}`);
  }
}

// ============================================
// CACHE MAINTENANCE
// ============================================

// Periodic cleanup of expired entries (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[DOC_CACHE] Cleaned up ${cleaned} expired entries`);
  }
}

// Start cleanup interval
const cleanupInterval = setInterval(cleanup, CLEANUP_INTERVAL);

// Prevent cleanup interval from keeping Node.js process alive
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

export {
  get,
  set,
  invalidate,
  invalidateFirm,
  clearAll,
  getStats,
  makeKey,
  TTL,
  // High-level functions
  getUserAccessibleMatterIds,
  getFirmDocumentCount,
  getDocumentList,
  onDocumentChange,
};

export default {
  get,
  set,
  invalidate,
  invalidateFirm,
  clearAll,
  getStats,
  makeKey,
  TTL,
  getUserAccessibleMatterIds,
  getFirmDocumentCount,
  getDocumentList,
  onDocumentChange,
};
