/**
 * Intelligent Rate Limiter for Azure OpenAI API
 * 
 * Features:
 * - Token-aware rate limiting (tracks TPM)
 * - Request-aware rate limiting (tracks RPM)
 * - Automatic backoff with exponential retry
 * - Queue system for requests during rate limits
 * - Predictive rate limiting (slow down before hitting limits)
 */

// Azure OpenAI limits for GPT-4 deployments
// Adjust these based on your Azure quota
const DEFAULT_LIMITS = {
  requestsPerMinute: 60,    // RPM
  tokensPerMinute: 80000,   // TPM
  requestsPerDay: 10000,    // Daily cap
};

class TokenBucket {
  constructor(capacity, refillRate, refillInterval = 1000) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.refillInterval = refillInterval;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / this.refillInterval) * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  tryConsume(amount) {
    this.refill();
    if (this.tokens >= amount) {
      this.tokens -= amount;
      return true;
    }
    return false;
  }

  getWaitTime(amount) {
    this.refill();
    if (this.tokens >= amount) return 0;
    const deficit = amount - this.tokens;
    return Math.ceil((deficit / this.refillRate) * this.refillInterval);
  }
}

class RateLimiter {
  constructor(options = {}) {
    const limits = { ...DEFAULT_LIMITS, ...options };
    
    // Request rate limiter (RPM)
    this.requestBucket = new TokenBucket(
      limits.requestsPerMinute,
      limits.requestsPerMinute / 60, // Refill per second
      1000
    );
    
    // Token rate limiter (TPM)
    this.tokenBucket = new TokenBucket(
      limits.tokensPerMinute,
      limits.tokensPerMinute / 60, // Refill per second
      1000
    );
    
    // Daily request tracker
    this.dailyRequests = 0;
    this.dailyLimit = limits.requestsPerDay;
    this.dailyResetTime = this.getNextMidnight();
    
    // Backoff state
    this.currentBackoff = 0;
    this.maxBackoff = 120000; // 2 minutes max
    this.baseBackoff = 1000;
    this.consecutiveErrors = 0;
    
    // Request queue for when rate limited
    this.queue = [];
    this.processing = false;
    
    // Stats for monitoring
    this.stats = {
      totalRequests: 0,
      totalTokens: 0,
      rateLimitHits: 0,
      lastRequestTime: null,
      avgResponseTime: 0,
    };
  }

  getNextMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
  }

  checkDailyReset() {
    if (Date.now() >= this.dailyResetTime) {
      this.dailyRequests = 0;
      this.dailyResetTime = this.getNextMidnight();
    }
  }

  /**
   * Estimate token count for a request
   * Rough estimate: ~4 chars per token for English text
   */
  estimateTokens(messages, maxTokens = 4000) {
    let inputTokens = 0;
    for (const msg of messages) {
      if (msg.content) {
        inputTokens += Math.ceil(msg.content.length / 4);
      }
      if (msg.tool_calls) {
        inputTokens += Math.ceil(JSON.stringify(msg.tool_calls).length / 4);
      }
    }
    // Add overhead for message formatting
    inputTokens += messages.length * 10;
    
    // Total = input + expected output
    return inputTokens + maxTokens;
  }

  /**
   * Check if a request can proceed
   * Returns { allowed: boolean, waitTime: number, reason?: string }
   */
  canProceed(estimatedTokens) {
    this.checkDailyReset();
    
    // Check daily limit
    if (this.dailyRequests >= this.dailyLimit) {
      const waitTime = this.dailyResetTime - Date.now();
      return { 
        allowed: false, 
        waitTime, 
        reason: 'Daily limit reached' 
      };
    }
    
    // Check current backoff
    if (this.currentBackoff > 0) {
      return { 
        allowed: false, 
        waitTime: this.currentBackoff, 
        reason: 'In backoff period' 
      };
    }
    
    // Check request rate
    const requestWait = this.requestBucket.getWaitTime(1);
    if (requestWait > 0) {
      return { 
        allowed: false, 
        waitTime: requestWait, 
        reason: 'Request rate limit' 
      };
    }
    
    // Check token rate
    const tokenWait = this.tokenBucket.getWaitTime(estimatedTokens);
    if (tokenWait > 0) {
      return { 
        allowed: false, 
        waitTime: tokenWait, 
        reason: 'Token rate limit' 
      };
    }
    
    return { allowed: true, waitTime: 0 };
  }

  /**
   * Consume rate limit allocation for a request
   */
  consume(estimatedTokens) {
    this.requestBucket.tryConsume(1);
    this.tokenBucket.tryConsume(estimatedTokens);
    this.dailyRequests++;
    this.stats.totalRequests++;
    this.stats.totalTokens += estimatedTokens;
    this.stats.lastRequestTime = Date.now();
  }

  /**
   * Record successful request - reduce backoff
   */
  recordSuccess() {
    this.consecutiveErrors = 0;
    this.currentBackoff = 0;
  }

  /**
   * Record rate limit error - increase backoff
   */
  recordRateLimit(retryAfterMs = null) {
    this.consecutiveErrors++;
    this.stats.rateLimitHits++;
    
    if (retryAfterMs) {
      this.currentBackoff = retryAfterMs;
    } else {
      // Exponential backoff
      this.currentBackoff = Math.min(
        this.maxBackoff,
        this.baseBackoff * Math.pow(2, this.consecutiveErrors)
      );
    }
    
    // Schedule backoff clear
    setTimeout(() => {
      this.currentBackoff = 0;
    }, this.currentBackoff);
    
    return this.currentBackoff;
  }

  /**
   * Wait for rate limit to clear
   */
  async waitForCapacity(estimatedTokens) {
    const check = this.canProceed(estimatedTokens);
    if (check.allowed) return;
    
    console.log(`[RateLimiter] Waiting ${check.waitTime}ms: ${check.reason}`);
    await new Promise(resolve => setTimeout(resolve, check.waitTime));
    
    // Recursive check in case conditions changed
    return this.waitForCapacity(estimatedTokens);
  }

  /**
   * Get current rate limit status for monitoring
   */
  getStatus() {
    this.checkDailyReset();
    return {
      requestsRemaining: Math.floor(this.requestBucket.tokens),
      tokensRemaining: Math.floor(this.tokenBucket.tokens),
      dailyRequestsUsed: this.dailyRequests,
      dailyLimit: this.dailyLimit,
      currentBackoff: this.currentBackoff,
      consecutiveErrors: this.consecutiveErrors,
      stats: this.stats,
    };
  }
}

// Singleton instance
let rateLimiterInstance = null;

export function getRateLimiter(options = {}) {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(options);
  }
  return rateLimiterInstance;
}

export function resetRateLimiter() {
  rateLimiterInstance = null;
}

export { RateLimiter };
