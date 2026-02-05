/**
 * Enhanced Amplifier Integration Layer
 * 
 * This module provides the integration between:
 * - Rate limiting
 * - Self-reinforcement learning
 * - Module system
 * - Core amplifierService
 * 
 * Import this instead of amplifierService for full functionality.
 */

import { getRateLimiter } from './rateLimiter.js';
import { 
  extractLearnings, 
  getLearningsForTask, 
  formatLearningsForPrompt,
  recordFeedback 
} from './selfReinforcement.js';
import { 
  detectModule, 
  formatModuleForPrompt,
  getAllModules 
} from './modules/index.js';

// Re-export core amplifier functions
export { 
  startBackgroundTask,
  cancelBackgroundTask,
  getTaskStatus,
  getTaskHistory,
  getActiveTask,
  sendFollowUp,
  getAvailableTools,
} from '../amplifierService.js';

/**
 * Enhanced task starter with module detection and learning integration
 */
export async function startEnhancedTask(userId, firmId, goal, options = {}) {
  const rateLimiter = getRateLimiter();
  
  // Check rate limits before starting
  const estimatedTokens = 8000; // Conservative estimate for a task
  const canProceed = rateLimiter.canProceed(estimatedTokens);
  
  if (!canProceed.allowed) {
    throw new Error(`Rate limit: Please wait ${Math.ceil(canProceed.waitTime / 1000)} seconds before starting a new task`);
  }
  
  // Detect applicable module
  const module = detectModule(goal);
  
  // Get relevant learnings
  const learnings = await getLearningsForTask(firmId, userId, goal);
  
  // Build enhanced options
  const enhancedOptions = {
    ...options,
    module: module?.metadata?.name,
    modulePrompt: module ? formatModuleForPrompt(module, options.inputs || {}) : null,
    learningsPrompt: formatLearningsForPrompt(learnings),
    rateLimiter,
  };
  
  // Import and call the core start function
  const { startBackgroundTask } = await import('../amplifierService.js');
  return startBackgroundTask(userId, firmId, goal, enhancedOptions);
}

/**
 * Record task completion and extract learnings
 */
export async function recordTaskCompletion(task) {
  try {
    // Extract learnings from the completed task
    await extractLearnings(task);
    
    console.log(`[EnhancedAmplifier] Learnings extracted for task ${task.id}`);
  } catch (error) {
    console.error('[EnhancedAmplifier] Failed to extract learnings:', error);
  }
}

/**
 * Submit user feedback
 */
export async function submitFeedback(taskId, firmId, userId, feedback) {
  return recordFeedback(taskId, firmId, userId, feedback);
}

/**
 * Get available modules
 */
export function getModules() {
  return getAllModules();
}

/**
 * Get rate limit status
 */
export function getRateLimitStatus() {
  const rateLimiter = getRateLimiter();
  return rateLimiter.getStatus();
}

/**
 * Integration hooks for amplifierService.js
 * These should be called from the main service at appropriate points
 */
export const hooks = {
  /**
   * Called before making an API request
   */
  async beforeApiCall(estimatedTokens) {
    const rateLimiter = getRateLimiter();
    await rateLimiter.waitForCapacity(estimatedTokens);
    rateLimiter.consume(estimatedTokens);
  },
  
  /**
   * Called after a successful API response
   */
  afterApiSuccess() {
    const rateLimiter = getRateLimiter();
    rateLimiter.recordSuccess();
  },
  
  /**
   * Called after a rate limit error (429)
   */
  afterRateLimit(retryAfterMs) {
    const rateLimiter = getRateLimiter();
    return rateLimiter.recordRateLimit(retryAfterMs);
  },
  
  /**
   * Called when a task completes
   */
  async onTaskComplete(task) {
    await recordTaskCompletion(task);
  },
  
  /**
   * Build enhanced system prompt with module and learnings
   */
  enhanceSystemPrompt(basePrompt, options) {
    let enhanced = basePrompt;
    
    if (options.modulePrompt) {
      enhanced = options.modulePrompt + '\n\n' + enhanced;
    }
    
    if (options.learningsPrompt) {
      enhanced += '\n\n' + options.learningsPrompt;
    }
    
    return enhanced;
  },
};
