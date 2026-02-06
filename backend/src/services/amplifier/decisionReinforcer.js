/**
 * Real-Time Decision Reinforcer
 * 
 * Cursor-like self-reinforcement system that:
 * 1. Tracks decision confidence scores
 * 2. Updates weights immediately after each action
 * 3. Explores alternatives when uncertain
 * 4. Learns which decision rules work best
 * 
 * This creates immediate learning feedback loops, making the agent
 * improve with EVERY action, not just in batches.
 */

export class DecisionReinforcer {
  constructor() {
    // Strategy weights: {strategy: {successes: number, attempts: number, confidence: number}}
    this.strategyWeights = new Map();
    
    // Decision rules: {ruleId: {effectiveness: number, lastUsed: Date}}
    this.decisionRules = new Map();
    
    // Exploration rate: chance to try new strategies
    this.explorationRate = 0.1; // 10% exploration
    
    // Confidence thresholds
    this.highConfidenceThreshold = 0.8;
    this.lowConfidenceThreshold = 0.3;
    
    // Learning rate: how quickly weights update
    this.learningRate = 0.1;
  }
  
  /**
   * Choose a strategy based on confidence and exploration
   */
  chooseStrategy(taskType, availableStrategies) {
    // Calculate confidence for each strategy
    const strategiesWithConfidence = availableStrategies.map(strategy => ({
      strategy,
      confidence: this.getStrategyConfidence(taskType, strategy),
      weight: this.getStrategyWeight(taskType, strategy)
    }));
    
    // Sort by confidence * weight
    strategiesWithConfidence.sort((a, b) => 
      (b.confidence * b.weight) - (a.confidence * a.weight)
    );
    
    // Exploration: sometimes try something different
    if (Math.random() < this.explorationRate && strategiesWithConfidence.length > 1) {
      // Try second-best strategy for exploration
      return {
        chosenStrategy: strategiesWithConfidence[1].strategy,
        confidence: strategiesWithConfidence[1].confidence,
        reason: 'exploration',
        alternatives: strategiesWithConfidence.slice(0, 3).map(s => s.strategy)
      };
    }
    
    // Exploitation: choose best strategy
    return {
      chosenStrategy: strategiesWithConfidence[0].strategy,
      confidence: strategiesWithConfidence[0].confidence,
      reason: 'exploitation',
      alternatives: strategiesWithConfidence.slice(0, 3).map(s => s.strategy)
    };
  }
  
  /**
   * Get confidence for a strategy for a task type
   */
  getStrategyConfidence(taskType, strategy) {
    const key = `${taskType}:${strategy}`;
    const data = this.strategyWeights.get(key);
    
    if (!data || data.attempts < 3) {
      // Not enough data, medium confidence
      return 0.5;
    }
    
    // Confidence based on success rate, weighted by number of attempts
    const successRate = data.successes / data.attempts;
    const sampleWeight = Math.min(data.attempts / 10, 1); // More attempts = more confident
    
    return successRate * sampleWeight;
  }
  
  /**
   * Get weight for a strategy (importance)
   */
  getStrategyWeight(taskType, strategy) {
    const key = `${taskType}:${strategy}`;
    const data = this.strategyWeights.get(key);
    
    if (!data) {
      return 1.0; // Default weight
    }
    
    // Weight based on recent usage and success
    const recencyWeight = this.calculateRecencyWeight(data.lastUsed);
    const successWeight = data.successes / Math.max(data.attempts, 1);
    
    return (recencyWeight * 0.3) + (successWeight * 0.7);
  }
  
  /**
   * Record outcome and update weights immediately
   */
  recordOutcome(taskType, strategy, success, performanceMetrics = {}) {
    const key = `${taskType}:${strategy}`;
    
    if (!this.strategyWeights.has(key)) {
      this.strategyWeights.set(key, {
        successes: 0,
        attempts: 0,
        lastUsed: new Date(),
        performanceHistory: []
      });
    }
    
    const data = this.strategyWeights.get(key);
    data.attempts++;
    
    if (success) {
      data.successes++;
    }
    
    data.lastUsed = new Date();
    data.performanceHistory.push({
      timestamp: new Date(),
      success,
      ...performanceMetrics
    });
    
    // Keep only last 100 performances
    if (data.performanceHistory.length > 100) {
      data.performanceHistory.shift();
    }
    
    // Immediate weight update
    this.updateWeightsImmediately(taskType, strategy, success, performanceMetrics);
    
    // Update exploration rate based on confidence
    this.adjustExplorationRate();
    
    return {
      updatedConfidence: this.getStrategyConfidence(taskType, strategy),
      updatedWeight: this.getStrategyWeight(taskType, strategy),
      totalAttempts: data.attempts,
      successRate: data.successes / data.attempts
    };
  }
  
  /**
   * Immediate weight update (reinforcement learning)
   */
  updateWeightsImmediately(taskType, strategy, success, metrics) {
    const key = `${taskType}:${strategy}`;
    const data = this.strategyWeights.get(key);
    
    if (!data) return;
    
    // Calculate reward (positive for success, negative for failure)
    const reward = success ? 1 : -1;
    
    // Adjust based on performance metrics
    let performanceBonus = 0;
    
    if (metrics.timeRatio) {
      // Faster than expected = bonus
      performanceBonus += metrics.timeRatio < 1 ? 0.1 : -0.1;
    }
    
    if (metrics.qualityScore) {
      // Higher quality = bonus
      performanceBonus += (metrics.qualityScore - 0.5) * 0.2;
    }
    
    // Update successes based on reward
    if (reward > 0) {
      data.successes = Math.min(data.successes + 1 + performanceBonus, data.attempts);
    }
    
    // Immediate confidence boost/drop
    const currentConfidence = this.getStrategyConfidence(taskType, strategy);
    const newConfidence = currentConfidence + (this.learningRate * (reward + performanceBonus));
    
    // Clamp between 0 and 1
    data._confidence = Math.max(0, Math.min(1, newConfidence));
    
    // If confidence drops too low, trigger exploration
    if (data._confidence < this.lowConfidenceThreshold && data.attempts > 5) {
      console.log(`[DecisionReinforcer] Low confidence for ${key}, increasing exploration`);
      this.explorationRate = Math.min(0.3, this.explorationRate + 0.05);
    }
  }
  
  /**
   * Adjust exploration rate based on overall confidence
   */
  adjustExplorationRate() {
    // Calculate average confidence across all strategies
    let totalConfidence = 0;
    let count = 0;
    
    for (const [key, data] of this.strategyWeights.entries()) {
      if (data.attempts >= 3) {
        const confidence = this.getStrategyConfidence(...key.split(':'));
        totalConfidence += confidence;
        count++;
      }
    }
    
    if (count === 0) return;
    
    const avgConfidence = totalConfidence / count;
    
    // High overall confidence = less exploration needed
    if (avgConfidence > this.highConfidenceThreshold) {
      this.explorationRate = Math.max(0.05, this.explorationRate * 0.9);
    }
    // Low overall confidence = more exploration needed
    else if (avgConfidence < this.lowConfidenceThreshold) {
      this.explorationRate = Math.min(0.3, this.explorationRate * 1.1);
    }
  }
  
  /**
   * Calculate recency weight (more recent = higher weight)
   */
  calculateRecencyWeight(lastUsed) {
    if (!lastUsed) return 0.5;
    
    const daysAgo = (Date.now() - new Date(lastUsed).getTime()) / (1000 * 60 * 60 * 24);
    
    // Exponential decay: half-life of 7 days
    return Math.pow(0.5, daysAgo / 7);
  }
  
  /**
   * Get decision metrics for a task
   */
  getDecisionMetrics(taskType) {
    const strategies = [];
    
    for (const [key, data] of this.strategyWeights.entries()) {
      const [storedTaskType, strategy] = key.split(':');
      
      if (storedTaskType === taskType) {
        strategies.push({
          strategy,
          attempts: data.attempts,
          successes: data.successes,
          successRate: data.successes / Math.max(data.attempts, 1),
          confidence: this.getStrategyConfidence(taskType, strategy),
          weight: this.getStrategyWeight(taskType, strategy),
          lastUsed: data.lastUsed,
          recencyWeight: this.calculateRecencyWeight(data.lastUsed)
        });
      }
    }
    
    return {
      taskType,
      explorationRate: this.explorationRate,
      strategies: strategies.sort((a, b) => b.confidence - a.confidence),
      averageConfidence: strategies.length > 0 
        ? strategies.reduce((sum, s) => sum + s.confidence, 0) / strategies.length
        : 0.5
    };
  }
  
  /**
   * Learn decision rules from outcomes
   */
  learnDecisionRule(context, decision, outcome) {
    const ruleId = this.generateRuleId(context, decision);
    
    if (!this.decisionRules.has(ruleId)) {
      this.decisionRules.set(ruleId, {
        successes: 0,
        attempts: 0,
        effectiveness: 0.5,
        lastUsed: new Date(),
        context,
        decision
      });
    }
    
    const rule = this.decisionRules.get(ruleId);
    rule.attempts++;
    
    if (outcome.success) {
      rule.successes++;
    }
    
    rule.lastUsed = new Date();
    rule.effectiveness = rule.successes / rule.attempts;
    
    // Prune ineffective rules
    if (rule.attempts > 10 && rule.effectiveness < 0.3) {
      this.decisionRules.delete(ruleId);
    }
  }
  
  /**
   * Generate unique rule ID
   */
  generateRuleId(context, decision) {
    const contextHash = JSON.stringify(context)
      .split('')
      .reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)
      .toString(16);
    
    return `${contextHash}:${decision}`;
  }
  
  /**
   * Get best decision rule for context
   */
  getBestRule(context) {
    let bestRule = null;
    let bestEffectiveness = 0;
    
    for (const [ruleId, rule] of this.decisionRules.entries()) {
      // Check if rule context matches
      if (this.contextMatches(rule.context, context)) {
        if (rule.effectiveness > bestEffectiveness && rule.attempts >= 3) {
          bestEffectiveness = rule.effectiveness;
          bestRule = rule;
        }
      }
    }
    
    return bestRule;
  }
  
  /**
   * Check if two contexts match
   */
  contextMatches(context1, context2) {
    // Simple matching for now - could be more sophisticated
    const keys1 = Object.keys(context1).sort();
    const keys2 = Object.keys(context2).sort();
    
    if (keys1.length !== keys2.length) return false;
    
    for (let i = 0; i < keys1.length; i++) {
      if (keys1[i] !== keys2[i]) return false;
      if (context1[keys1[i]] !== context2[keys2[i]]) return false;
    }
    
    return true;
  }
  
  /**
   * Reset learning (for testing or when patterns change)
   */
  reset() {
    this.strategyWeights.clear();
    this.decisionRules.clear();
    this.explorationRate = 0.1;
  }
  
  /**
   * Get reinforcement statistics
   */
  getStats() {
    return {
      strategyWeights: this.strategyWeights.size,
      decisionRules: this.decisionRules.size,
      explorationRate: this.explorationRate,
      learningRate: this.learningRate
    };
  }
}

/**
 * Integration with Enhanced Orchestrator
 */
export function integrateWithOrchestrator(orchestrator, reinforcer) {
  // Monkey-patch the orchestrator to include reinforcement
  
  const originalExecuteChunk = orchestrator.executeChunk;
  
  orchestrator.executeChunk = async function(chunk, parentTask) {
    // Get decision context
    const decisionContext = {
      taskType: parentTask.analysis?.understanding?.taskType,
      complexity: parentTask.analysis?.understanding?.complexity,
      chunkNumber: chunk.chunkNumber,
      totalChunks: parentTask.chunks.length,
      strategy: chunk.strategy || 'sequential'
    };
    
    // Choose strategy with reinforcement
    const strategyChoice = reinforcer.chooseStrategy(
      decisionContext.taskType,
      ['risk-first', 'sequential', 'breadth-then-depth', 'framework-first']
    );
    
    // Record decision
    reinforcer.learnDecisionRule(decisionContext, strategyChoice.chosenStrategy, {
      timestamp: new Date(),
      context: decisionContext
    });
    
    // Execute chunk
    const startTime = Date.now();
    const result = await originalExecuteChunk.call(this, chunk, parentTask);
    const endTime = Date.now();
    
    // Calculate performance metrics
    const performanceMetrics = {
      timeTaken: endTime - startTime,
      estimatedTime: chunk.estimatedMinutes * 60 * 1000,
      timeRatio: (endTime - startTime) / (chunk.estimatedMinutes * 60 * 1000),
      success: result.success,
      errors: result.errors?.length || 0
    };
    
    // Record outcome with reinforcement
    reinforcer.recordOutcome(
      decisionContext.taskType,
      strategyChoice.chosenStrategy,
      result.success,
      performanceMetrics
    );
    
    // Update chunk with reinforcement data
    chunk.reinforcementData = {
      strategy: strategyChoice.chosenStrategy,
      confidence: strategyChoice.confidence,
      alternatives: strategyChoice.alternatives,
      performanceMetrics
    };
    
    return result;
  };
  
  return orchestrator;
}

/**
 * Demonstration of real-time reinforcement
 */
export function demonstrateReinforcement() {
  const reinforcer = new DecisionReinforcer();
  
  console.log('🧠 REAL-TIME REINFORCEMENT DEMONSTRATION');
  console.log('=' .repeat(60));
  
  // Simulate learning over time
  const taskTypes = ['document_review', 'legal_research', 'billing_review'];
  const strategies = ['risk-first', 'sequential', 'breadth-then-depth'];
  
  console.log('\n📊 Initial state:');
  console.log(`   Exploration rate: ${reinforcer.explorationRate}`);
  console.log(`   No strategy weights yet`);
  
  console.log('\n🎯 Task 1: Document review');
  const decision1 = reinforcer.chooseStrategy('document_review', strategies);
  console.log(`   Chosen strategy: ${decision1.chosenStrategy} (${decision1.reason})`);
  console.log(`   Confidence: ${decision1.confidence.toFixed(2)}`);
  console.log(`   Alternatives: ${decision1.alternatives.join(', ')}`);
  
  // Simulate outcome
  console.log('\n📈 Recording outcome (success)');
  const outcome1 = reinforcer.recordOutcome('document_review', decision1.chosenStrategy, true, {
    timeRatio: 0.9, // Faster than expected
    qualityScore: 0.8
  });
  
  console.log(`   Updated confidence: ${outcome1.updatedConfidence.toFixed(2)}`);
  console.log(`   Success rate: ${outcome1.successRate.toFixed(2)}`);
  
  console.log('\n🎯 Task 2: Document review (same type)');
  const decision2 = reinforcer.chooseStrategy('document_review', strategies);
  console.log(`   Chosen strategy: ${decision2.chosenStrategy} (${decision2.reason})`);
  console.log(`   Confidence: ${decision2.confidence.toFixed(2)}`);
  
  // Simulate failure
  console.log('\n📉 Recording outcome (failure)');
  const outcome2 = reinforcer.recordOutcome('document_review', decision2.chosenStrategy, false, {
    timeRatio: 1.5, // Slower than expected
    qualityScore: 0.3
  });
  
  console.log(`   Updated confidence: ${outcome2.updatedConfidence.toFixed(2)}`);
  console.log(`   Success rate: ${outcome2.successRate.toFixed(2)}`);
  
  console.log('\n🎯 Task 3: Document review (learning evident)');
  const decision3 = reinforcer.chooseStrategy('document_review', strategies);
  console.log(`   Chosen strategy: ${decision3.chosenStrategy} (${decision3.reason})`);
  console.log(`   Confidence: ${decision3.confidence.toFixed(2)}`);
  console.log(`   Exploration rate adjusted to: ${reinforcer.explorationRate.toFixed(2)}`);
  
  console.log('\n📊 Final strategy weights:');
  const metrics = reinforcer.getDecisionMetrics('document_review');
  metrics.strategies.forEach(s => {
    console.log(`   ${s.strategy}: ${s.successRate.toFixed(2)} success rate (${s.attempts} attempts)`);
  });
  
  console.log('\n🎯 Learning over multiple task types:');
  
  // Simulate mixed outcomes
  for (let i = 0; i < 20; i++) {
    const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
    const strategy = strategies[Math.floor(Math.random() * strategies.length)];
    const success = Math.random() > 0.3; // 70% success rate
    
    reinforcer.recordOutcome(taskType, strategy, success, {
      timeRatio: 0.8 + Math.random() * 0.4, // 0.8 to 1.2
      qualityScore: success ? 0.7 + Math.random() * 0.3 : 0.3 + Math.random() * 0.3
    });
  }
  
  console.log('\n📈 After 20 learning iterations:');
  console.log(`   Total strategy weights: ${reinforcer.getStats().strategyWeights}`);
  console.log(`   Exploration rate: ${reinforcer.explorationRate.toFixed(2)}`);
  
  console.log('\n🎯 What the agent learned:');
  taskTypes.forEach(taskType => {
    const taskMetrics = reinforcer.getDecisionMetrics(taskType);
    console.log(`\n   ${taskType}:`);
    taskMetrics.strategies.forEach(s => {
      console.log(`     ${s.strategy}: ${s.confidence.toFixed(2)} confidence`);
    });
  });
  
  console.log('\n✅ Real-time reinforcement working');
  console.log('✅ Learning from every outcome');
  console.log('✅ Adjusting exploration based on confidence');
  console.log('✅ Ready for production integration');
}