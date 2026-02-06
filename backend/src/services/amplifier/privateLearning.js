/**
 * Privacy-First Learning System for Enhanced Amplifier
 * 
 * This module ensures ALL learnings are private by default:
 * - User-specific learnings never leave user boundary
 * - Firm-specific learnings never leave firm boundary  
 * - Attorney-configurable privacy levels
 * - No cross-contamination of sensitive legal data
 */

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
 */
export class PrivateLearningStore {
  constructor() {
    this.userLearnings = new Map();  // user_id → learnings
    this.firmLearnings = new Map();  // firm_id → anonymous learnings
    this.sharedLearnings = new Map(); // firm_id → opt-in shared learnings
  }
  
  /**
   * Save user-specific learning (PRIVATE by default)
   */
  async saveUserLearning(scope, learning) {
    this.validateScope(scope);
    
    // Ensure learning is properly scoped
    const privateLearning = {
      ...learning,
      firm_id: scope.firmId,
      user_id: scope.userId,
      timestamp: new Date(),
      is_private: true
    };
    
    // Store in user-specific map
    const userKey = `${scope.firmId}:${scope.userId}`;
    if (!this.userLearnings.has(userKey)) {
      this.userLearnings.set(userKey, []);
    }
    
    this.userLearnings.get(userKey).push(privateLearning);
    
    console.log(`[PrivateLearning] Saved user-private learning for ${scope.userId}`);
    return privateLearning;
  }
  
  /**
   * Save firm-anonymous learning (NO user attribution)
   */
  async saveFirmAnonymousLearning(scope, learning) {
    if (!scope.canShareWithFirm()) {
      throw new Error(`User ${scope.userId} has STRICT privacy - cannot save firm learning`);
    }
    
    // Remove any user-identifying information
    const anonymousLearning = {
      ...learning,
      firm_id: scope.firmId,
      user_id: null,  // Explicitly null
      is_anonymous: true,
      timestamp: new Date()
    };
    
    // Remove any potentially identifying fields
    delete anonymousLearning.attorney_name;
    delete anonymousLearning.user_email;
    delete anonymousLearning.personal_preferences;
    
    // Store in firm map
    if (!this.firmLearnings.has(scope.firmId)) {
      this.firmLearnings.set(scope.firmId, []);
    }
    
    this.firmLearnings.get(scope.firmId).push(anonymousLearning);
    
    console.log(`[PrivateLearning] Saved firm-anonymous learning for firm ${scope.firmId}`);
    return anonymousLearning;
  }
  
  /**
   * Save opt-in shared learning (with user attribution)
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
    
    // Store in shared map
    if (!this.sharedLearnings.has(scope.firmId)) {
      this.sharedLearnings.set(scope.firmId, []);
    }
    
    this.sharedLearnings.get(scope.firmId).push(sharedLearning);
    
    console.log(`[PrivateLearning] Saved shared learning from ${scope.userId} for firm ${scope.firmId}`);
    return sharedLearning;
  }
  
  /**
   * Get learnings for a user (PRIVATE only)
   */
  async getUserLearnings(scope) {
    this.validateScope(scope);
    
    const userKey = `${scope.firmId}:${scope.userId}`;
    const userLearnings = this.userLearnings.get(userKey) || [];
    
    // Only return learnings for THIS user
    return userLearnings.filter(l => l.user_id === scope.userId);
  }
  
  /**
   * Get firm learnings available to a user
   */
  async getFirmLearnings(scope) {
    this.validateScope(scope);
    
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
   */
  async getAllLearningsForUser(scope) {
    const userLearnings = await this.getUserLearnings(scope);
    const firmLearnings = await this.getFirmLearnings(scope);
    
    return {
      private: userLearnings,      // User's private learnings
      shared: firmLearnings,       // Learnings shared within firm
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
    const goalLower = goal.toLowerCase();
    
    if (goalLower.includes('review') || goalLower.includes('document')) return 'document_review';
    if (goalLower.includes('research')) return 'legal_research';
    if (goalLower.includes('billing')) return 'billing_review';
    if (goalLower.includes('deadline')) return 'deadline_audit';
    
    return 'general';
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