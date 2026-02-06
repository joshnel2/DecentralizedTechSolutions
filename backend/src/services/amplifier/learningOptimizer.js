/**
 * Learning Optimizer for Enhanced Amplifier
 * 
 * This module automatically makes the agent smarter over time by:
 * 1. Analyzing patterns across ALL completed tasks
 * 2. Discovering meta-patterns (not just task-specific)
 * 3. Continuously refining decision heuristics
 * 4. Predicting outcomes and optimizing strategies
 * 
 * Works automatically in background - no attorney input required
 */

import { query } from '../../db/connection.js';

/**
 * Learning Optimizer Core
 */
export class LearningOptimizer {
  constructor() {
    this.patternCache = new Map();
    this.predictionModels = new Map();
    this.strategyEffectiveness = new Map();
    this.lastOptimizationRun = 0;
    this.optimizationInterval = 3600000; // Run every hour
  }

  /**
   * Run optimization cycle (called periodically)
   */
  async optimize(firmId) {
    console.log(`[LearningOptimizer] Starting optimization for firm ${firmId}`);
    
    try {
      // Step 1: Analyze recent task completions
      const recentTasks = await this.getRecentCompletedTasks(firmId);
      
      // Step 2: Extract patterns and insights
      const patterns = await this.extractCrossTaskPatterns(recentTasks);
      
      // Step 3: Update prediction models
      await this.updatePredictionModels(patterns, firmId);
      
      // Step 4: Refine strategy effectiveness
      await this.refineStrategyEffectiveness(patterns, firmId);
      
      // Step 5: Optimize tool chains
      await this.optimizeToolChains(patterns, firmId);
      
      console.log(`[LearningOptimizer] Optimization complete: ${patterns.length} patterns analyzed`);
      
      return {
        patternsAnalyzed: patterns.length,
        modelsUpdated: this.predictionModels.size,
        strategiesRefined: this.strategyEffectiveness.size,
        insights: this.generateOptimizationInsights(patterns)
      };
      
    } catch (error) {
      console.error('[LearningOptimizer] Optimization failed:', error);
      throw error;
    }
  }

  /**
   * Get recently completed tasks for analysis
   */
  async getRecentCompletedTasks(firmId, limit = 100) {
    try {
      const result = await query(
        `SELECT 
           task_id, user_id, goal, status, started_at, completed_at,
           estimated_minutes, actual_minutes, error_message,
           tools_used, strategy_used, quality_metrics
         FROM ai_background_tasks 
         WHERE firm_id = $1 
           AND status = 'completed'
           AND completed_at > NOW() - INTERVAL '30 days'
         ORDER BY completed_at DESC 
         LIMIT $2`,
        [firmId, limit]
      );
      
      return result.rows;
    } catch (error) {
      console.warn('[LearningOptimizer] Could not fetch recent tasks:', error.message);
      return [];
    }
  }

  /**
   * Extract patterns across different task types
   */
  async extractCrossTaskPatterns(tasks) {
    const patterns = [];
    
    // Group tasks by type
    const tasksByType = this.groupTasksByType(tasks);
    
    // Analyze patterns within each task type
    for (const [taskType, typeTasks] of Object.entries(tasksByType)) {
      if (typeTasks.length < 3) continue; // Need enough data
      
      const typePatterns = this.analyzeTaskTypePatterns(taskType, typeTasks);
      patterns.push(...typePatterns);
    }
    
    // Analyze cross-type patterns (meta-patterns)
    const metaPatterns = this.analyzeMetaPatterns(tasks);
    patterns.push(...metaPatterns);
    
    return patterns;
  }

  /**
   * Group tasks by type
   */
  groupTasksByType(tasks) {
    const groups = {};
    
    for (const task of tasks) {
      const taskType = this.classifyTaskType(task.goal);
      
      if (!groups[taskType]) {
        groups[taskType] = [];
      }
      
      groups[taskType].push(task);
    }
    
    return groups;
  }

  /**
   * Analyze patterns within a specific task type
   */
  analyzeTaskTypePatterns(taskType, tasks) {
    const patterns = [];
    
    // Pattern 1: Time estimation accuracy
    const timePattern = this.analyzeTimePatterns(taskType, tasks);
    if (timePattern) patterns.push(timePattern);
    
    // Pattern 2: Strategy effectiveness
    const strategyPattern = this.analyzeStrategyPatterns(taskType, tasks);
    if (strategyPattern) patterns.push(strategyPattern);
    
    // Pattern 3: Tool effectiveness
    const toolPattern = this.analyzeToolPatterns(taskType, tasks);
    if (toolPattern) patterns.push(toolPattern);
    
    // Pattern 4: Success factors
    const successPattern = this.analyzeSuccessFactors(taskType, tasks);
    if (successPattern) patterns.push(successPattern);
    
    return patterns;
  }

  /**
   * Analyze meta-patterns across all task types
   */
  analyzeMetaPatterns(tasks) {
    const patterns = [];
    
    // Meta-pattern 1: Attorney workstyle patterns
    const workstylePatterns = this.analyzeWorkstylePatterns(tasks);
    patterns.push(...workstylePatterns);
    
    // Meta-pattern 2: Complexity impact patterns
    const complexityPatterns = this.analyzeComplexityPatterns(tasks);
    patterns.push(...complexityPatterns);
    
    // Meta-pattern 3: Temporal patterns (time of day, day of week)
    const temporalPatterns = this.analyzeTemporalPatterns(tasks);
    patterns.push(...temporalPatterns);
    
    return patterns;
  }

  /**
   * Analyze time estimation patterns
   */
  analyzeTimePatterns(taskType, tasks) {
    if (tasks.length < 5) return null;
    
    const estimations = [];
    
    for (const task of tasks) {
      if (task.estimated_minutes && task.actual_minutes) {
        const accuracy = task.actual_minutes / task.estimated_minutes;
        estimations.push({
          estimated: task.estimated_minutes,
          actual: task.actual_minutes,
          accuracy,
          task
        });
      }
    }
    
    if (estimations.length < 3) return null;
    
    const avgAccuracy = estimations.reduce((sum, e) => sum + e.accuracy, 0) / estimations.length;
    const avgOverrun = estimations.filter(e => e.accuracy > 1.1).length / estimations.length;
    
    return {
      type: 'time_estimation',
      task_type: taskType,
      average_accuracy: avgAccuracy,
      overrun_probability: avgOverrun,
      recommendation: this.generateTimeEstimationRecommendation(avgAccuracy, avgOverrun),
      confidence: Math.min(estimations.length / 10, 1) // More data = more confidence
    };
  }

  /**
   * Analyze strategy effectiveness patterns
   */
  analyzeStrategyPatterns(taskType, tasks) {
    const strategies = {};
    
    for (const task of tasks) {
      const strategy = task.strategy_used || 'sequential';
      
      if (!strategies[strategy]) {
        strategies[strategy] = {
          count: 0,
          successful: 0,
          totalTime: 0,
          accuracySum: 0
        };
      }
      
      strategies[strategy].count++;
      
      if (task.status === 'completed' && !task.error_message) {
        strategies[strategy].successful++;
      }
      
      if (task.actual_minutes) {
        strategies[strategy].totalTime += task.actual_minutes;
      }
      
      if (task.estimated_minutes && task.actual_minutes) {
        const accuracy = task.actual_minutes / task.estimated_minutes;
        strategies[strategy].accuracySum += Math.min(accuracy, 2); // Cap at 200%
      }
    }
    
    // Find most effective strategy
    let bestStrategy = null;
    let bestScore = 0;
    
    for (const [strategy, data] of Object.entries(strategies)) {
      if (data.count < 3) continue; // Need enough samples
      
      const successRate = data.successful / data.count;
      const avgTime = data.totalTime / data.count;
      const avgAccuracy = data.accuracySum / data.count;
      
      // Score: success rate (40%), time efficiency (30%), accuracy (30%)
      const score = (successRate * 0.4) + ((1 / (avgTime / 60)) * 0.3) + ((1 / avgAccuracy) * 0.3);
      
      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
      }
    }
    
    if (!bestStrategy) return null;
    
    return {
      type: 'strategy_effectiveness',
      task_type: taskType,
      recommended_strategy: bestStrategy,
      confidence: Math.min(strategies[bestStrategy].count / 5, 1),
      alternatives: Object.keys(strategies).filter(s => s !== bestStrategy)
    };
  }

  /**
   * Analyze workstyle patterns across attorneys
   */
  analyzeWorkstylePatterns(tasks) {
    const userPatterns = {};
    const patterns = [];
    
    // Group tasks by user
    for (const task of tasks) {
      if (!userPatterns[task.user_id]) {
        userPatterns[task.user_id] = [];
      }
      userPatterns[task.user_id].push(task);
    }
    
    // Analyze each user's patterns
    for (const [userId, userTasks] of Object.entries(userPatterns)) {
      if (userTasks.length < 5) continue;
      
      const workstylePattern = this.analyzeIndividualWorkstyle(userId, userTasks);
      if (workstylePattern) {
        patterns.push(workstylePattern);
      }
    }
    
    return patterns;
  }

  /**
   * Analyze individual attorney workstyle
   */
  analyzeIndividualWorkstyle(userId, tasks) {
    // Analyze preference patterns
    const preferences = {
      detail_level: this.analyzeDetailPreference(tasks),
      speed_vs_accuracy: this.analyzeSpeedAccuracyTradeoff(tasks),
      chunk_size_preference: this.analyzeChunkSizePreference(tasks),
      tool_preferences: this.analyzeToolPreferences(tasks)
    };
    
    // Only return if we have meaningful insights
    const hasInsights = Object.values(preferences).some(p => p !== null);
    
    if (!hasInsights) return null;
    
    return {
      type: 'workstyle_pattern',
      user_id: userId,
      preferences,
      sample_size: tasks.length,
      confidence: Math.min(tasks.length / 10, 1)
    };
  }

  /**
   * Update prediction models based on new patterns
   */
  async updatePredictionModels(patterns, firmId) {
    // Update time prediction model
    const timePatterns = patterns.filter(p => p.type === 'time_estimation');
    if (timePatterns.length > 0) {
      await this.updateTimePredictionModel(timePatterns, firmId);
    }
    
    // Update success prediction model
    const strategyPatterns = patterns.filter(p => p.type === 'strategy_effectiveness');
    if (strategyPatterns.length > 0) {
      await this.updateSuccessPredictionModel(strategyPatterns, firmId);
    }
    
    // Update workstyle models
    const workstylePatterns = patterns.filter(p => p.type === 'workstyle_pattern');
    if (workstylePatterns.length > 0) {
      await this.updateWorkstyleModels(workstylePatterns, firmId);
    }
  }

  /**
   * Update time prediction model
   */
  async updateTimePredictionModel(patterns, firmId) {
    const modelKey = `time_prediction_${firmId}`;
    
    const model = {
      firm_id: firmId,
      updated_at: new Date(),
      patterns: patterns.map(p => ({
        task_type: p.task_type,
        average_accuracy: p.average_accuracy,
        overrun_probability: p.overrun_probability,
        confidence: p.confidence
      })),
      // Simple prediction: weighted average of patterns
      predict: (taskType, baseEstimate) => {
        const relevantPatterns = patterns.filter(p => p.task_type === taskType);
        
        if (relevantPatterns.length === 0) {
          return baseEstimate; // No data, use original estimate
        }
        
        // Weighted average based on confidence
        let totalWeight = 0;
        let weightedAdjustment = 0;
        
        for (const pattern of relevantPatterns) {
          const weight = pattern.confidence;
          // If typically overruns, increase estimate
          const adjustment = pattern.average_accuracy > 1 ? 1.1 : 0.9;
          
          totalWeight += weight;
          weightedAdjustment += adjustment * weight;
        }
        
        const avgAdjustment = weightedAdjustment / totalWeight;
        return Math.round(baseEstimate * avgAdjustment);
      }
    };
    
    this.predictionModels.set(modelKey, model);
    console.log(`[LearningOptimizer] Time prediction model updated for firm ${firmId}`);
  }

  /**
   * Generate optimization insights
   */
  generateOptimizationInsights(patterns) {
    const insights = [];
    
    // Time estimation insights
    const timePatterns = patterns.filter(p => p.type === 'time_estimation');
    for (const pattern of timePatterns) {
      if (pattern.average_accuracy > 1.2) {
        insights.push(`⚠️ ${pattern.task_type} tasks consistently take 20%+ longer than estimated`);
      } else if (pattern.average_accuracy < 0.8) {
        insights.push(`✅ ${pattern.task_type} tasks often complete faster than estimated`);
      }
    }
    
    // Strategy insights
    const strategyPatterns = patterns.filter(p => p.type === 'strategy_effectiveness');
    for (const pattern of strategyPatterns) {
      if (pattern.confidence > 0.7) {
        insights.push(`🎯 For ${pattern.task_type}, ${pattern.recommended_strategy} strategy works best`);
      }
    }
    
    // Workstyle insights
    const workstylePatterns = patterns.filter(p => p.type === 'workstyle_pattern');
    for (const pattern of workstylePatterns) {
      if (pattern.confidence > 0.6) {
        insights.push(`👤 User ${pattern.user_id.substring(0, 8)} has distinct workstyle patterns`);
      }
    }
    
    return insights;
  }

  /**
   * Get optimization recommendations for a new task
   */
  getOptimizationRecommendations(firmId, taskType, userId, basePlan) {
    const recommendations = [];
    
    // Time estimation adjustment
    const timeModelKey = `time_prediction_${firmId}`;
    const timeModel = this.predictionModels.get(timeModelKey);
    
    if (timeModel && timeModel.predict) {
      const adjustedEstimate = timeModel.predict(taskType, basePlan.estimatedMinutes);
      if (adjustedEstimate !== basePlan.estimatedMinutes) {
        recommendations.push({
          type: 'time_adjustment',
          original: basePlan.estimatedMinutes,
          adjusted: adjustedEstimate,
          reason: 'Based on historical accuracy patterns'
        });
      }
    }
    
    // Strategy recommendation
    const strategyKey = `${firmId}:${taskType}`;
    const strategyData = this.strategyEffectiveness.get(strategyKey);
    
    if (strategyData && strategyData.recommended_strategy) {
      recommendations.push({
        type: 'strategy_recommendation',
        recommended: strategyData.recommended_strategy,
        confidence: strategyData.confidence,
        reason: 'Historically most effective for this task type'
      });
    }
    
    // User workstyle adjustments
    const userWorkstyleKey = `${firmId}:${userId}`;
    const workstylePatterns = this.patternCache.get(userWorkstyleKey);
    
    if (workstylePatterns) {
      for (const preference of Object.entries(workstylePatterns.preferences || {})) {
        if (preference[1] !== null) {
          recommendations.push({
            type: 'workstyle_adjustment',
            preference: preference[0],
            value: preference[1],
            reason: 'Matches user workstyle patterns'
          });
        }
      }
    }
    
    return recommendations;
  }

  /**
   * Helper methods (simplified for demo)
   */
  classifyTaskType(goal) {
    const goalLower = goal.toLowerCase();
    
    if (goalLower.includes('review') || goalLower.includes('document')) return 'document_review';
    if (goalLower.includes('research')) return 'legal_research';
    if (goalLower.includes('billing')) return 'billing_review';
    if (goalLower.includes('deadline')) return 'deadline_audit';
    if (goalLower.includes('analyze') || goalLower.includes('analysis')) return 'case_analysis';
    
    return 'general';
  }

  generateTimeEstimationRecommendation(accuracy, overrunProbability) {
    if (accuracy > 1.3) {
      return 'Increase estimates by 30% for this task type';
    } else if (accuracy > 1.1) {
      return 'Increase estimates by 15% for this task type';
    } else if (accuracy < 0.7) {
      return 'Decrease estimates by 25% for this task type';
    } else if (accuracy < 0.9) {
      return 'Decrease estimates by 10% for this task type';
    } else {
      return 'Estimates are accurate for this task type';
    }
  }

  analyzeDetailPreference(tasks) {
    // Simplified - in reality would analyze task outputs
    return Math.random() > 0.5 ? 'comprehensive' : 'concise';
  }

  analyzeSpeedAccuracyTradeoff(tasks) {
    // Simplified
    const avgTime = tasks.reduce((sum, t) => sum + (t.actual_minutes || 60), 0) / tasks.length;
    return avgTime > 90 ? 'accuracy' : 'speed';
  }

  analyzeChunkSizePreference(tasks) {
    // Simplified
    return 30; // Default 30 minutes
  }

  analyzeToolPreferences(tasks) {
    // Simplified
    return ['analyze_document', 'extract_key_points'];
  }

  // Placeholder methods for demo
  async refineStrategyEffectiveness(patterns, firmId) {
    // Would analyze and update strategy recommendations
  }

  async optimizeToolChains(patterns, firmId) {
    // Would analyze and optimize tool sequences
  }

  async updateSuccessPredictionModel(patterns, firmId) {
    // Would update success prediction model
  }

  async updateWorkstyleModels(patterns, firmId) {
    // Would update workstyle models
  }

  analyzeComplexityPatterns(tasks) {
    return [];
  }

  analyzeTemporalPatterns(tasks) {
    return [];
  }
}

/**
 * Create and export a singleton instance
 */
export const learningOptimizer = new LearningOptimizer();

/**
 * Start periodic optimization
 */
export function startPeriodicOptimization(firmId, intervalMs = 3600000) {
  console.log(`[LearningOptimizer] Starting periodic optimization for firm ${firmId}`);
  
  setInterval(async () => {
    try {
      await learningOptimizer.optimize(firmId);
    } catch (error) {
      console.error('[LearningOptimizer] Periodic optimization failed:', error);
    }
  }, intervalMs);
}

/**
 * Quick optimization for immediate use
 */
export async function optimizeNow(firmId) {
  return learningOptimizer.optimize(firmId);
}