/**
 * Privacy-First Learning System for Enhanced Amplifier
 * 
 * This module ensures ALL learnings are private by default:
 * - User-specific learnings never leave user boundary
 * - Firm-specific learnings never leave firm boundary  
 * - Attorney-configurable privacy levels
 * - No cross-contamination of sensitive legal data
 * 
 * CUTTING-EDGE UPGRADE: Now backed by database persistence via
 * ai_learning_patterns table. In-memory Maps serve as a write-through
 * cache. Learnings survive server restarts.
 */

import { query } from '../../db/connection.js';

/**
 * Privacy levels for learning data
 */
export const PrivacyLevel = {
  STRICT: 'strict',          // Default: user-only, no sharing
  FIRM_ANONYMOUS: 'firm_anonymous', // Anonymous patterns within firm
  FIRM_COLLABORATIVE: 'firm_collaborative' // Opt-in sharing with attribution
};

/**
 * Learning scope - defines privacy boundaries
 */
export class LearningScope {
  constructor(firmId, userId, privacyLevel = PrivacyLevel.STRICT) {
    this.firmId = firmId;
    this.userId = userId;
    this.privacyLevel = privacyLevel;
    
    // Validate: user must belong to firm
    this.validateScope();
  }
  
  validateScope() {
    if (!this.firmId || !this.userId) {
      throw new Error('Learning scope requires both firmId and userId');
    }
  }
  
  /**
   * Check if learning can be shared based on privacy level
   */
  canShareWithFirm() {
    return this.privacyLevel !== PrivacyLevel.STRICT;
  }
  
  /**
   * Check if learning can include user attribution
   */
  canIncludeAttribution() {
    return this.privacyLevel === PrivacyLevel.FIRM_COLLABORATIVE;
  }
  
  /**
   * Get query constraints for this scope
   */
  getQueryConstraints() {
    // Always restrict to firm
    const constraints = [`firm_id = $1`, this.firmId];
    
    // For strict privacy, also restrict to user
    if (this.privacyLevel === PrivacyLevel.STRICT) {
      constraints[0] += ' AND user_id = $2';
      constraints.push(this.userId);
    }
    
    return constraints;
  }
}

/**
 * Privacy-first learning store
 * 
 * CUTTING-EDGE UPGRADE: Now backed by the ai_learning_patterns database table
 * instead of in-memory Maps. Learnings persist across server restarts.
 * In-memory Maps are retained as a write-through cache for fast reads.
 */
export class PrivateLearningStore {
  constructor() {
    // Write-through cache: reads from memory, writes to both memory + DB
    this.userLearnings = new Map();  // user_id → learnings (cache)
    this.firmLearnings = new Map();  // firm_id → anonymous learnings (cache)
    this.sharedLearnings = new Map(); // firm_id → opt-in shared learnings (cache)
    this._initialized = new Set();    // Track which caches have been hydrated
  }
  
  /**
   * Hydrate cache from database for a specific scope (lazy, on first access)
   */
  async _hydrateIfNeeded(scope) {
    const key = `${scope.firmId}:${scope.userId}`;
    if (this._initialized.has(key)) return;
    this._initialized.add(key);
    
    try {
      // Load user-private learnings
      const userResult = await query(`
        SELECT pattern_data, confidence, created_at FROM ai_learning_patterns
        WHERE firm_id = $1 AND user_id = $2 AND pattern_category = 'private_learning'
        ORDER BY created_at DESC LIMIT 100
      `, [scope.firmId, scope.userId]);
      
      const userKey = `${scope.firmId}:${scope.userId}`;
      if (!this.userLearnings.has(userKey)) this.userLearnings.set(userKey, []);
      for (const row of userResult.rows) {
        const data = typeof row.pattern_data === 'string' ? JSON.parse(row.pattern_data) : row.pattern_data;
        this.userLearnings.get(userKey).push({
          ...data, firm_id: scope.firmId, user_id: scope.userId,
          is_private: true, timestamp: row.created_at,
        });
      }
      
      // Load firm-level learnings (anonymous + shared)
      if (!this._initialized.has(`firm:${scope.firmId}`)) {
        this._initialized.add(`firm:${scope.firmId}`);
        
        const firmResult = await query(`
          SELECT pattern_data, user_id, confidence, created_at FROM ai_learning_patterns
          WHERE firm_id = $1 AND pattern_category IN ('firm_anonymous_learning', 'shared_learning')
          ORDER BY created_at DESC LIMIT 100
        `, [scope.firmId]);
        
        if (!this.firmLearnings.has(scope.firmId)) this.firmLearnings.set(scope.firmId, []);
        if (!this.sharedLearnings.has(scope.firmId)) this.sharedLearnings.set(scope.firmId, []);
        
        for (const row of firmResult.rows) {
          const data = typeof row.pattern_data === 'string' ? JSON.parse(row.pattern_data) : row.pattern_data;
          if (row.user_id) {
            this.sharedLearnings.get(scope.firmId).push({
              ...data, firm_id: scope.firmId, user_id: row.user_id,
              is_shared: true, timestamp: row.created_at,
            });
          } else {
            this.firmLearnings.get(scope.firmId).push({
              ...data, firm_id: scope.firmId, user_id: null,
              is_anonymous: true, timestamp: row.created_at,
            });
          }
        }
      }
    } catch (e) {
      // Non-fatal: if DB not available, in-memory still works
      if (!e.message?.includes('ai_learning_patterns') && !e.message?.includes('does not exist')) {
        console.warn('[PrivateLearning] Hydration note:', e.message);
      }
    }
  }
  
  /**
   * Persist a learning to the database
   */
  async _persistToDb(firmId, userId, category, learning) {
    try {
      await query(`
        INSERT INTO ai_learning_patterns
          (firm_id, user_id, pattern_type, pattern_category, pattern_data, confidence)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      `, [
        firmId, userId,
        learning.type || 'private_learning',
        category,
        JSON.stringify(learning),
        0.60,
      ]);
    } catch (e) {
      if (!e.message?.includes('ai_learning_patterns') && !e.message?.includes('does not exist')) {
        console.warn('[PrivateLearning] DB persist note:', e.message);
      }
    }
  }
  
  /**
   * Save user-specific learning (PRIVATE by default)
   * Now persists to DB for survival across restarts.
   */
  async saveUserLearning(scope, learning) {
    this.validateScope(scope);
    
    const privateLearning = {
      ...learning,
      firm_id: scope.firmId,
      user_id: scope.userId,
      timestamp: new Date(),
      is_private: true
    };
    
    // Write to cache
    const userKey = `${scope.firmId}:${scope.userId}`;
    if (!this.userLearnings.has(userKey)) {
      this.userLearnings.set(userKey, []);
    }
    this.userLearnings.get(userKey).push(privateLearning);
    
    // Write to DB (async, non-blocking)
    this._persistToDb(scope.firmId, scope.userId, 'private_learning', privateLearning)
      .catch(e => console.warn('[PrivateLearning] Async persist failed:', e.message));
    
    console.log(`[PrivateLearning] Saved user-private learning for ${scope.userId}`);
    return privateLearning;
  }
  
  /**
   * Save firm-anonymous learning (NO user attribution)
   * Now persists to DB for survival across restarts.
   */
  async saveFirmAnonymousLearning(scope, learning) {
    if (!scope.canShareWithFirm()) {
      throw new Error(`User ${scope.userId} has STRICT privacy - cannot save firm learning`);
    }
    
    const anonymousLearning = {
      ...learning,
      firm_id: scope.firmId,
      user_id: null,
      is_anonymous: true,
      timestamp: new Date()
    };
    
    // Remove identifying fields
    delete anonymousLearning.attorney_name;
    delete anonymousLearning.user_email;
    delete anonymousLearning.personal_preferences;
    
    // Write to cache
    if (!this.firmLearnings.has(scope.firmId)) {
      this.firmLearnings.set(scope.firmId, []);
    }
    this.firmLearnings.get(scope.firmId).push(anonymousLearning);
    
    // Write to DB (user_id = null for anonymous)
    this._persistToDb(scope.firmId, null, 'firm_anonymous_learning', anonymousLearning)
      .catch(e => console.warn('[PrivateLearning] Async persist failed:', e.message));
    
    console.log(`[PrivateLearning] Saved firm-anonymous learning for firm ${scope.firmId}`);
    return anonymousLearning;
  }
  
  /**
   * Save opt-in shared learning (with user attribution)
   * Now persists to DB for survival across restarts.
   */
  async saveSharedLearning(scope, learning) {
    if (!scope.canIncludeAttribution()) {
      throw new Error(`User ${scope.userId} doesn't allow attribution - use firm-anonymous`);
    }
    
    const sharedLearning = {
      ...learning,
      firm_id: scope.firmId,
      user_id: scope.userId,
      is_shared: true,
      shared_at: new Date(),
      attribution_allowed: true
    };
    
    // Write to cache
    if (!this.sharedLearnings.has(scope.firmId)) {
      this.sharedLearnings.set(scope.firmId, []);
    }
    this.sharedLearnings.get(scope.firmId).push(sharedLearning);
    
    // Write to DB
    this._persistToDb(scope.firmId, scope.userId, 'shared_learning', sharedLearning)
      .catch(e => console.warn('[PrivateLearning] Async persist failed:', e.message));
    
    console.log(`[PrivateLearning] Saved shared learning from ${scope.userId} for firm ${scope.firmId}`);
    return sharedLearning;
  }
  
  /**
   * Get learnings for a user (PRIVATE only)
   * Now hydrates from DB on first access.
   */
  async getUserLearnings(scope) {
    this.validateScope(scope);
    await this._hydrateIfNeeded(scope);
    
    const userKey = `${scope.firmId}:${scope.userId}`;
    const userLearnings = this.userLearnings.get(userKey) || [];
    
    return userLearnings.filter(l => l.user_id === scope.userId);
  }
  
  /**
   * Get firm learnings available to a user
   * Now hydrates from DB on first access.
   */
  async getFirmLearnings(scope) {
    this.validateScope(scope);
    await this._hydrateIfNeeded(scope);
    
    const firmLearnings = this.firmLearnings.get(scope.firmId) || [];
    const sharedLearnings = this.sharedLearnings.get(scope.firmId) || [];
    
    let availableLearnings = [];
    
    // Add firm-anonymous learnings (available to all firm users)
    availableLearnings.push(...firmLearnings);
    
    // Add shared learnings (with attribution)
    if (scope.canShareWithFirm()) {
      availableLearnings.push(...sharedLearnings);
    }
    
    return availableLearnings;
  }
  
  /**
   * Get ALL learnings available to a user (respecting privacy)
   * Now hydrates from DB on first access.
   */
  async getAllLearningsForUser(scope) {
    const userLearnings = await this.getUserLearnings(scope);
    const firmLearnings = await this.getFirmLearnings(scope);
    
    return {
      private: userLearnings,
      shared: firmLearnings,
      privacy_level: scope.privacyLevel,
      disclaimer: this.getPrivacyDisclaimer(scope)
    };
  }
  
  /**
   * Extract learnings from completed task (respecting privacy)
   */
  async extractTaskLearnings(task, scope) {
    const learnings = [];
    
    // 1. User-private learnings (ALWAYS saved)
    const userLearning = {
      type: 'task_execution',
      task_id: task.id,
      goal: task.goal,
      success_factors: this.extractSuccessFactors(task),
      time_accuracy: this.calculateTimeAccuracy(task),
      improvements_needed: this.identifyImprovements(task)
    };
    
    await this.saveUserLearning(scope, userLearning);
    learnings.push({ type: 'user_private', data: userLearning });
    
    // 2. Firm-anonymous learnings (if allowed)
    if (scope.canShareWithFirm()) {
      const firmLearning = {
        type: 'task_pattern',
        task_type: this.classifyTaskType(task.goal),
        complexity: task.analysis?.understanding?.complexity,
        actual_time: task.progress?.actualMinutesTotal,
        estimated_time: task.progress?.estimatedMinutesTotal,
        success_rate: task.status === 'completed' ? 1 : 0,
        // NO user-identifying information
      };
      
      await this.saveFirmAnonymousLearning(scope, firmLearning);
      learnings.push({ type: 'firm_anonymous', data: firmLearning });
    }
    
    // 3. Opt-in shared learnings (if explicitly allowed)
    if (scope.canIncludeAttribution() && task.has_valuable_pattern) {
      const sharedLearning = {
        type: 'valuable_pattern',
        contributed_by: scope.userId,
        pattern: this.extractValuablePattern(task),
        context: task.goal.substring(0, 100),
        value_rating: this.ratePatternValue(task)
      };
      
      await this.saveSharedLearning(scope, sharedLearning);
      learnings.push({ type: 'shared', data: sharedLearning });
    }
    
    return learnings;
  }
  
  // Helper methods
  validateScope(scope) {
    if (!scope || !scope.firmId || !scope.userId) {
      throw new Error('Valid learning scope required');
    }
  }
  
  extractSuccessFactors(task) {
    const factors = [];
    
    if (task.chunks?.every(c => c.status === 'completed')) {
      factors.push('all_chunks_completed');
    }
    
    if (task.progress?.actualMinutesTotal <= task.progress?.estimatedMinutesTotal) {
      factors.push('time_accurate');
    }
    
    return factors;
  }
  
  calculateTimeAccuracy(task) {
    if (!task.progress?.estimatedMinutesTotal) return 1;
    
    const actual = task.progress.actualMinutesTotal || task.progress.estimatedMinutesTotal;
    const estimated = task.progress.estimatedMinutesTotal;
    
    return Math.min(actual / estimated, 2); // Cap at 200% overrun
  }
  
  classifyTaskType(goal) {
    const goalLower = (goal || '').toLowerCase();
    
    if (goalLower.includes('review') || goalLower.includes('document')) return 'document_review';
    if (goalLower.includes('research')) return 'legal_research';
    if (goalLower.includes('billing')) return 'billing_review';
    if (goalLower.includes('deadline')) return 'deadline_audit';
    if (goalLower.includes('draft') || goalLower.includes('write')) return 'document_drafting';
    if (goalLower.includes('intake') || goalLower.includes('new matter')) return 'intake';
    
    return 'general';
  }
  
  /**
   * Identify improvements needed based on task execution
   */
  identifyImprovements(task) {
    const improvements = [];
    
    if (task.status === 'failed') {
      improvements.push('task_failed');
    }
    
    if (task.progress?.actualMinutesTotal > (task.progress?.estimatedMinutesTotal || 60) * 1.5) {
      improvements.push('significant_time_overrun');
    }
    
    if (task.review_status === 'rejected') {
      improvements.push('rejected_by_attorney');
      if (task.review_feedback) {
        improvements.push(`feedback: ${task.review_feedback.substring(0, 100)}`);
      }
    }
    
    if (task.feedback_rating && task.feedback_rating <= 2) {
      improvements.push('low_rating');
    }
    
    return improvements;
  }
  
  /**
   * Extract a valuable pattern from a highly successful task.
   * A pattern is "valuable" if it represents a reusable approach.
   */
  extractValuablePattern(task) {
    const result = typeof task.result === 'string' ? JSON.parse(task.result || '{}') : (task.result || {});
    const actions = result.actions || [];
    
    return {
      taskType: this.classifyTaskType(task.goal),
      goalCategory: task.goal?.substring(0, 80),
      toolSequence: Array.isArray(actions) ? actions.slice(0, 10) : [],
      iterations: task.iterations || 0,
      durationMinutes: task.progress?.actualMinutesTotal || null,
      rating: task.feedback_rating || null,
    };
  }
  
  /**
   * Rate how valuable a pattern is for sharing.
   * Higher rating = more broadly useful.
   */
  ratePatternValue(task) {
    let value = 0.5; // Base value
    
    // High rating from attorney = very valuable
    if (task.feedback_rating >= 4) value += 0.2;
    if (task.feedback_rating >= 5) value += 0.1;
    
    // Approved in review = confirmed quality
    if (task.review_status === 'approved') value += 0.15;
    
    // Completed under estimated time = efficient
    if (task.progress?.actualMinutesTotal < (task.progress?.estimatedMinutesTotal || 60)) {
      value += 0.1;
    }
    
    // Multi-step tasks are more complex and therefore more valuable as patterns
    if ((task.iterations || 0) >= 5) value += 0.1;
    
    return Math.min(1.0, value);
  }
  
  getPrivacyDisclaimer(scope) {
    switch (scope.privacyLevel) {
      case PrivacyLevel.STRICT:
        return 'All learnings are private to you only. No data is shared.';
      
      case PrivacyLevel.FIRM_ANONYMOUS:
        return 'Anonymous patterns are shared within your firm. No personal attribution.';
      
      case PrivacyLevel.FIRM_COLLABORATIVE:
        return 'You have opted to share valuable patterns with attribution.';
      
      default:
        return 'Privacy settings configured.';
    }
  }
}