/**
 * Amplifier Integration Hooks
 * 
 * Extracted from enhancedAmplifier.js to avoid circular dependency chain:
 * amplifierService.js -> enhancedAmplifier.js -> enhancedOrchestrator.js -> amplifierService.js
 * 
 * These hooks are called from the main amplifierService.js at key execution points.
 * They only depend on standalone modules (rateLimiter, selfReinforcement) with no
 * circular imports.
 */

import { getRateLimiter } from './rateLimiter.js';
import { extractLearnings } from './selfReinforcement.js';

/**
 * Integration hooks for amplifierService.js
 * Called from the main service at appropriate execution points
 */
export const hooks = {
  /**
   * Called before making an Azure OpenAI API request.
   * Waits for rate limiter capacity to prevent 429s proactively.
   */
  async beforeApiCall(estimatedTokens) {
    const rateLimiter = getRateLimiter();
    await rateLimiter.waitForCapacity(estimatedTokens);
    rateLimiter.consume(estimatedTokens);
  },
  
  /**
   * Called after a successful API response.
   * Updates rate limiter state to track successful throughput.
   */
  afterApiSuccess() {
    const rateLimiter = getRateLimiter();
    rateLimiter.recordSuccess();
  },
  
  /**
   * Called after a rate limit error (429).
   * Records the rate limit event for adaptive backoff.
   */
  afterRateLimit(retryAfterMs) {
    const rateLimiter = getRateLimiter();
    return rateLimiter.recordRateLimit(retryAfterMs);
  },
  
  /**
   * Called when a task completes.
   * Extracts learnings from the completed task for the self-reinforcement system.
   */
  async onTaskComplete(task) {
    try {
      await extractLearnings(task);
      console.log(`[AmplifierHooks] Learnings extracted for task ${task.id}`);
    } catch (error) {
      console.error('[AmplifierHooks] Failed to extract learnings:', error.message);
    }
  },
};
