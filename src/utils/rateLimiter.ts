/**
 * Client-side rate limiting utilities
 * Helps prevent API abuse and provides better UX during rate limiting
 */

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  retryAfterMs?: number
}

interface RateLimitState {
  count: number
  resetAt: number
  blocked: boolean
  blockedUntil: number | null
}

const rateLimitStates = new Map<string, RateLimitState>()

/**
 * Default rate limits by API category
 */
export const API_RATE_LIMITS: Record<string, RateLimitConfig> = {
  ai: { maxRequests: 20, windowMs: 60000, retryAfterMs: 5000 },
  documents: { maxRequests: 100, windowMs: 60000, retryAfterMs: 1000 },
  matters: { maxRequests: 100, windowMs: 60000, retryAfterMs: 1000 },
  clients: { maxRequests: 100, windowMs: 60000, retryAfterMs: 1000 },
  auth: { maxRequests: 10, windowMs: 60000, retryAfterMs: 30000 },
  background: { maxRequests: 5, windowMs: 60000, retryAfterMs: 10000 },
  default: { maxRequests: 200, windowMs: 60000, retryAfterMs: 1000 }
}

/**
 * Get rate limit key from API endpoint
 */
function getKeyFromEndpoint(endpoint: string): string {
  if (endpoint.includes('/ai/') || endpoint.includes('/v1/agent')) return 'ai'
  if (endpoint.includes('/documents')) return 'documents'
  if (endpoint.includes('/matters')) return 'matters'
  if (endpoint.includes('/clients')) return 'clients'
  if (endpoint.includes('/auth')) return 'auth'
  if (endpoint.includes('/background')) return 'background'
  return 'default'
}

/**
 * Check if a request should be allowed based on rate limits
 */
export function checkRateLimit(endpoint: string): { allowed: boolean; retryAfter?: number } {
  const key = getKeyFromEndpoint(endpoint)
  const config = API_RATE_LIMITS[key] || API_RATE_LIMITS.default
  const now = Date.now()
  
  let state = rateLimitStates.get(key)
  
  // Initialize or reset window
  if (!state || now >= state.resetAt) {
    state = {
      count: 0,
      resetAt: now + config.windowMs,
      blocked: false,
      blockedUntil: null
    }
  }
  
  // Check if blocked
  if (state.blocked && state.blockedUntil && now < state.blockedUntil) {
    return { 
      allowed: false, 
      retryAfter: state.blockedUntil - now 
    }
  }
  
  // Unblock if time has passed
  if (state.blocked && state.blockedUntil && now >= state.blockedUntil) {
    state.blocked = false
    state.blockedUntil = null
    state.count = 0
    state.resetAt = now + config.windowMs
  }
  
  // Check rate limit
  if (state.count >= config.maxRequests) {
    state.blocked = true
    state.blockedUntil = now + (config.retryAfterMs || 1000)
    rateLimitStates.set(key, state)
    return { 
      allowed: false, 
      retryAfter: config.retryAfterMs 
    }
  }
  
  // Increment and allow
  state.count++
  rateLimitStates.set(key, state)
  
  return { allowed: true }
}

/**
 * Record a rate limit response from the server (429)
 */
export function recordRateLimitResponse(endpoint: string, retryAfterMs: number) {
  const key = getKeyFromEndpoint(endpoint)
  const now = Date.now()
  
  rateLimitStates.set(key, {
    count: API_RATE_LIMITS[key]?.maxRequests || 100,
    resetAt: now + retryAfterMs,
    blocked: true,
    blockedUntil: now + retryAfterMs
  })
}

/**
 * Get current rate limit status for all categories
 */
export function getRateLimitStatus(): Record<string, { 
  remaining: number
  total: number
  resetIn: number 
  blocked: boolean 
}> {
  const now = Date.now()
  const status: Record<string, any> = {}
  
  for (const [key, config] of Object.entries(API_RATE_LIMITS)) {
    const state = rateLimitStates.get(key)
    
    if (!state || now >= state.resetAt) {
      status[key] = {
        remaining: config.maxRequests,
        total: config.maxRequests,
        resetIn: 0,
        blocked: false
      }
    } else {
      status[key] = {
        remaining: Math.max(0, config.maxRequests - state.count),
        total: config.maxRequests,
        resetIn: Math.max(0, state.resetAt - now),
        blocked: state.blocked
      }
    }
  }
  
  return status
}

/**
 * Create a rate-limited fetch wrapper
 */
export function createRateLimitedFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    
    // Check client-side rate limit
    const { allowed, retryAfter } = checkRateLimit(url)
    
    if (!allowed) {
      // Create a synthetic 429 response
      return new Response(JSON.stringify({
        error: 'Rate limited',
        message: `Too many requests. Please wait ${Math.ceil((retryAfter || 1000) / 1000)} seconds.`,
        retryAfter: retryAfter
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((retryAfter || 1000) / 1000))
        }
      })
    }
    
    // Make the actual request
    const response = await originalFetch(input, init)
    
    // Handle server-side 429
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('Retry-After')
      const retryMs = retryAfterHeader 
        ? parseInt(retryAfterHeader, 10) * 1000 
        : 5000
      
      recordRateLimitResponse(url, retryMs)
    }
    
    return response
  }
}

/**
 * Debounce function for UI interactions
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Throttle function for rate-limited actions
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastRun = 0
  
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastRun >= limit) {
      lastRun = now
      func(...args)
    }
  }
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    baseDelay?: number
    maxDelay?: number
    shouldRetry?: (error: any) => boolean
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = (err) => err?.status === 429 || err?.status >= 500
  } = options
  
  let lastError: any
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error
      }
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError
}
