/**
 * Task Analyzer for Amplifier - "Cursor for Lawyers" Intelligence Layer
 * 
 * This module analyzes task contexts BEFORE execution to:
 * 1. Gather ALL relevant data (like Cursor reading the file)
 * 2. Build deep understanding of the situation (like Cursor understanding code)
 * 3. Estimate complexity, risk, and requirements
 * 4. Recommend optimal execution strategy
 * 
 * This transforms Amplifier from a "recipe executor" to an "intelligent orchestrator"
 */

import { query } from '../../db/connection.js';

/**
 * Task Analysis Result
 */
export class TaskAnalysis {
  constructor(goal, userId, firmId) {
    this.goal = goal;
    this.userId = userId;
    this.firmId = firmId;
    this.context = null;
    this.understanding = null;
    this.recommendations = null;
  }

  /**
   * Gather ALL relevant context data
   * Like Cursor reading the entire file/codebase
   */
  async gatherContext() {
    const context = {
      // User/Attorney context
      user: await this.getUserContext(),
      preferences: await this.getUserPreferences(),
      
      // Matter/Case context
      activeMatters: await this.getActiveMatters(),
      matterDetails: await this.getMatterDetails(),
      deadlines: await this.getUpcomingDeadlines(),
      
      // Document context
      documentStats: await this.getDocumentStats(),
      documentTypes: await this.getDocumentTypes(),
      
      // Historical context
      similarPastTasks: await this.getSimilarPastTasks(),
      successPatterns: await this.getSuccessPatterns(),
      failurePatterns: await this.getFailurePatterns(),
      
      // Resource context
      toolAvailability: await this.getToolAvailability(),
      rateLimitStatus: await this.getRateLimitStatus(),
      azureCredits: await this.getAzureCreditStatus(),
      
      // Temporal context
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      urgency: await this.calculateUrgency()
    };

    this.context = context;
    return context;
  }

  /**
   * Build deep understanding from gathered context
   * Like Cursor understanding the codebase structure and patterns
   */
  async buildUnderstanding() {
    if (!this.context) {
      await this.gatherContext();
    }

    const understanding = {
      // Task classification
      taskType: this.classifyTaskType(),
      legalDomain: this.identifyLegalDomain(),
      complexity: this.assessComplexity(),
      
      // Risk assessment
      risks: this.identifyRisks(),
      criticality: this.assessCriticality(),
      deadlinePressure: this.calculateDeadlinePressure(),
      
      // Resource requirements
      estimatedTime: this.estimateTimeRequired(),
      toolRequirements: this.identifyRequiredTools(),
      expertiseLevel: this.determineExpertiseLevel(),
      
      // Historical patterns
      typicalDuration: this.calculateTypicalDuration(),
      successProbability: this.estimateSuccessProbability(),
      commonPitfalls: this.identifyCommonPitfalls(),
      
      // User preferences
      preferredFormat: this.identifyPreferredFormat(),
      detailLevel: this.determineDetailLevel(),
      communicationStyle: this.identifyCommunicationStyle()
    };

    this.understanding = understanding;
    return understanding;
  }

  /**
   * Generate execution recommendations
   */
  async generateRecommendations() {
    if (!this.understanding) {
      await this.buildUnderstanding();
    }

    const recommendations = {
      // Chunking strategy
      shouldChunk: this.shouldChunkTask(),
      optimalChunkSize: this.calculateOptimalChunkSize(),
      chunkCount: this.calculateChunkCount(),
      
      // Execution strategy
      executionApproach: this.determineExecutionApproach(),
      priorityOrder: this.determinePriorityOrder(),
      qualityGates: this.defineQualityGates(),
      
      // Risk mitigation
      fallbackStrategies: this.prepareFallbackStrategies(),
      checkpointFrequency: this.determineCheckpointFrequency(),
      validationSteps: this.defineValidationSteps(),
      
      // Resource optimization
      toolSequence: this.optimizeToolSequence(),
      modelSelection: this.selectOptimalModel(),
      rateLimitStrategy: this.determineRateLimitStrategy(),
      
      // User experience
      progressReporting: this.determineProgressReporting(),
      intermediateUpdates: this.shouldProvideIntermediateUpdates(),
      completionCriteria: this.defineCompletionCriteria()
    };

    this.recommendations = recommendations;
    return recommendations;
  }

  // ============== CONTEXT GATHERING METHODS ==============

  async getUserContext() {
    try {
      const result = await query(
        `SELECT id, email, display_name, role, timezone, notification_preferences 
         FROM users WHERE id = $1 AND firm_id = $2`,
        [this.userId, this.firmId]
      );
      return result.rows[0] || {};
    } catch (error) {
      console.warn('[TaskAnalyzer] Could not fetch user context:', error.message);
      return {};
    }
  }

  async getUserPreferences() {
    try {
      const result = await query(
        `SELECT preference_key, preference_value 
         FROM user_preferences 
         WHERE user_id = $1 AND firm_id = $2`,
        [this.userId, this.firmId]
      );
      
      const preferences = {};
      result.rows.forEach(row => {
        preferences[row.preference_key] = row.preference_value;
      });
      
      return preferences;
    } catch (error) {
      console.warn('[TaskAnalyzer] Could not fetch user preferences:', error.message);
      return {};
    }
  }

  async getActiveMatters() {
    try {
      const result = await query(
        `SELECT id, display_name, matter_type, status, priority, billing_type 
         FROM matters 
         WHERE firm_id = $1 AND status = 'active' 
         ORDER BY priority DESC, updated_at DESC 
         LIMIT 10`,
        [this.firmId]
      );
      return result.rows;
    } catch (error) {
      console.warn('[TaskAnalyzer] Could not fetch active matters:', error.message);
      return [];
    }
  }

  async getDocumentStats() {
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as total_documents,
           COUNT(DISTINCT matter_id) as matters_with_documents,
           AVG(LENGTH(content)) as avg_document_size,
           SUM(LENGTH(content)) as total_document_size
         FROM documents 
         WHERE firm_id = $1 AND deleted_at IS NULL`,
        [this.firmId]
      );
      return result.rows[0] || {};
    } catch (error) {
      console.warn('[TaskAnalyzer] Could not fetch document stats:', error.message);
      return {};
    }
  }

  async getSimilarPastTasks() {
    try {
      const result = await query(
        `SELECT 
           task_id, goal, status, started_at, completed_at, 
           error_message, estimated_minutes, actual_minutes,
           tools_used, success_metrics
         FROM ai_background_tasks 
         WHERE firm_id = $1 AND user_id = $2 
         ORDER BY started_at DESC 
         LIMIT 20`,
        [this.firmId, this.userId]
      );
      
      // Calculate similarity score based on goal keywords
      const similarTasks = result.rows.map(task => {
        const similarity = this.calculateGoalSimilarity(this.goal, task.goal);
        return { ...task, similarity };
      }).filter(task => task.similarity > 0.3); // Only include somewhat similar tasks
      
      return similarTasks;
    } catch (error) {
      console.warn('[TaskAnalyzer] Could not fetch similar past tasks:', error.message);
      return [];
    }
  }

  // ============== UNDERSTANDING METHODS ==============

  classifyTaskType() {
    const goalLower = this.goal.toLowerCase();
    
    const taskTypes = {
      'document': ['review', 'analyze', 'summarize', 'draft', 'edit', 'redline'],
      'research': ['research', 'case law', 'statute', 'precedent', 'legal issue'],
      'administration': ['billing', 'invoice', 'time entry', 'calendar', 'deadline'],
      'communication': ['email', 'letter', 'update', 'communication', 'draft email'],
      'analysis': ['assessment', 'evaluation', 'strategy', 'risk', 'merit'],
      'compliance': ['compliance', 'ethical', 'conflict', 'trust account', 'iola']
    };

    for (const [type, keywords] of Object.entries(taskTypes)) {
      for (const keyword of keywords) {
        if (goalLower.includes(keyword)) {
          return type;
        }
      }
    }

    return 'general';
  }

  assessComplexity() {
    const context = this.context;
    if (!context) return 'medium';

    let complexityScore = 0;

    // Document volume complexity
    if (context.documentStats?.total_documents > 100) complexityScore += 3;
    else if (context.documentStats?.total_documents > 20) complexityScore += 2;
    else if (context.documentStats?.total_documents > 5) complexityScore += 1;

    // Deadline pressure complexity
    if (context.deadlines?.critical_count > 3) complexityScore += 3;
    else if (context.deadlines?.critical_count > 0) complexityScore += 2;

    // Task type complexity
    const taskType = this.classifyTaskType();
    if (taskType === 'research') complexityScore += 2;
    if (taskType === 'analysis') complexityScore += 2;

    // Historical complexity
    const similarTasks = context.similarPastTasks || [];
    if (similarTasks.length > 0) {
      const avgDuration = similarTasks.reduce((sum, task) => sum + (task.actual_minutes || 0), 0) / similarTasks.length;
      if (avgDuration > 120) complexityScore += 2;
      else if (avgDuration > 60) complexityScore += 1;
    }

    // Convert score to level
    if (complexityScore >= 6) return 'high';
    if (complexityScore >= 3) return 'medium';
    return 'low';
  }

  estimateTimeRequired() {
    const understanding = this.understanding;
    if (!understanding) return 60; // Default 60 minutes

    let baseTime = 30; // Base 30 minutes for simple tasks

    // Adjust based on complexity
    if (understanding.complexity === 'high') baseTime *= 4; // 120 minutes
    if (understanding.complexity === 'medium') baseTime *= 2; // 60 minutes

    // Adjust based on document volume
    const docStats = this.context?.documentStats;
    if (docStats?.total_documents > 50) baseTime *= 2;
    if (docStats?.total_documents > 20) baseTime *= 1.5;

    // Adjust based on historical patterns
    const similarTasks = this.context?.similarPastTasks || [];
    if (similarTasks.length > 0) {
      const successfulTasks = similarTasks.filter(t => t.status === 'completed');
      if (successfulTasks.length > 0) {
        const avgTime = successfulTasks.reduce((sum, t) => sum + (t.actual_minutes || t.estimated_minutes || 60), 0) / successfulTasks.length;
        baseTime = Math.max(baseTime, avgTime * 0.8); // Use historical but be optimistic
      }
    }

    // Round to nearest 5 minutes
    return Math.ceil(baseTime / 5) * 5;
  }

  // ============== RECOMMENDATION METHODS ==============

  shouldChunkTask() {
    const estimatedTime = this.estimateTimeRequired();
    const complexity = this.assessComplexity();
    
    // Always chunk if > 60 minutes
    if (estimatedTime > 60) return true;
    
    // Chunk medium+ complexity tasks > 30 minutes
    if (complexity === 'medium' && estimatedTime > 30) return true;
    
    // Chunk high complexity tasks regardless of time
    if (complexity === 'high') return true;
    
    return false;
  }

  calculateOptimalChunkSize() {
    const complexity = this.assessComplexity();
    
    // Simpler tasks can have larger chunks
    if (complexity === 'low') return 45; // 45-minute chunks
    if (complexity === 'medium') return 30; // 30-minute chunks
    if (complexity === 'high') return 20; // 20-minute chunks for complex work
    
    return 30; // Default 30 minutes
  }

  calculateChunkCount() {
    if (!this.shouldChunkTask()) return 1;
    
    const estimatedTime = this.estimateTimeRequired();
    const chunkSize = this.calculateOptimalChunkSize();
    
    return Math.ceil(estimatedTime / chunkSize);
  }

  determineExecutionApproach() {
    const taskType = this.classifyTaskType();
    const complexity = this.assessComplexity();
    
    if (taskType === 'document' && complexity === 'high') {
      return 'risk-first'; // Start with highest risk items first
    }
    
    if (taskType === 'research') {
      return 'breadth-then-depth'; // Quick scan then deep dive
    }
    
    if (taskType === 'analysis') {
      return 'framework-first'; // Create analysis framework then fill
    }
    
    if (this.context?.deadlines?.critical_count > 0) {
      return 'deadline-driven'; // Work backward from deadlines
    }
    
    return 'sequential'; // Default sequential approach
  }

  // ============== HELPER METHODS ==============

  calculateGoalSimilarity(goal1, goal2) {
    if (!goal2) return 0;
    
    const words1 = new Set(goal1.toLowerCase().split(/\s+/));
    const words2 = new Set(goal2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  // ============== PUBLIC INTERFACE ==============

  async analyze() {
    await this.gatherContext();
    await this.buildUnderstanding();
    await this.generateRecommendations();
    
    return {
      goal: this.goal,
      userId: this.userId,
      firmId: this.firmId,
      context: this.context,
      understanding: this.understanding,
      recommendations: this.recommendations,
      summary: this.generateSummary()
    };
  }

  generateSummary() {
    if (!this.recommendations) return '';
    
    return {
      estimatedTime: this.estimateTimeRequired(),
      complexity: this.assessComplexity(),
      shouldChunk: this.shouldChunkTask(),
      chunkCount: this.calculateChunkCount(),
      optimalChunkSize: this.calculateOptimalChunkSize(),
      executionApproach: this.determineExecutionApproach(),
      risks: this.identifyRisks() || []
    };
  }
}

/**
 * Create a task analyzer instance
 */
export function createTaskAnalyzer(goal, userId, firmId) {
  return new TaskAnalysis(goal, userId, firmId);
}

/**
 * Quick analysis function for simple use cases
 */
export async function analyzeTask(goal, userId, firmId) {
  const analyzer = createTaskAnalyzer(goal, userId, firmId);
  return analyzer.analyze();
}