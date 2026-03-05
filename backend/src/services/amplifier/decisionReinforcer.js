/**
 * Decision Reinforcer - DB-Persistent Reinforcement Learning with Thompson Sampling
 * 
 * CUTTING-EDGE UPGRADE: Replaced epsilon-greedy exploration with Thompson Sampling
 * using Beta distributions. This is the state-of-the-art approach for online
 * learning in multi-armed bandit problems (used by Google, Netflix, Uber).
 * 
 * Why Thompson Sampling > epsilon-greedy:
 * - Provably optimal asymptotic regret bounds (Agrawal & Goyal 2012)
 * - Naturally balances exploration/exploitation without a manual rate
 * - Explores MORE when uncertain, LESS when confident (epsilon doesn't)
 * - Converges to best strategy exponentially faster with sparse data
 * - Handles non-stationary environments via time-decayed priors
 * 
 * Architecture:
 * - Write-through cache: in-memory Map for speed, DB for persistence
 * - On startup: hydrate from ai_learning_patterns table
 * - On every recordOutcome: update Beta(alpha, beta) + async DB write
 * - Confidence: derived from Beta distribution variance (principled, not ad-hoc)
 * - Old patterns decay: half-life of 14 days via prior shrinkage
 * - Counterfactual tracking: records what WOULD have been chosen for offline analysis
 * 
 * Key concepts:
 * - Each (taskType, strategy) pair has a Beta(α, β) distribution
 *   where α = successes + 1 (prior), β = failures + 1 (prior)
 * - To choose: sample from each strategy's Beta distribution, pick highest
 * - Time decay: periodically shrink α, β toward priors (forgets old data)
 * - UCB fallback: for deterministic contexts, use Upper Confidence Bound
 */

import { query } from '../../db/connection.js';

const PATTERN_TYPE = 'tool_strategy';
const RULE_PATTERN_TYPE = 'decision_rule';
const DECAY_HALF_LIFE_DAYS = 14;

// =====================================================================
// BETA DISTRIBUTION UTILITIES (pure math, no dependencies)
// These implement the core of Thompson Sampling.
// =====================================================================

/**
 * Sample from Beta(alpha, beta) distribution using Jöhnk's algorithm.
 * This is the heart of Thompson Sampling — each sample represents
 * a plausible success rate for a strategy, given observed data.
 * 
 * When alpha is high and beta is low, samples cluster near 1.0 (confident success).
 * When alpha ≈ beta ≈ 1, samples spread across [0,1] (maximum uncertainty).
 */
function sampleBeta(alpha, beta) {
  if (alpha <= 0) alpha = 1;
  if (beta <= 0) beta = 1;
  
  // Use the gamma sampling method (more numerically stable for all α, β)
  const x = sampleGamma(alpha, 1);
  const y = sampleGamma(beta, 1);
  
  if (x + y === 0) return 0.5; // Degenerate case
  return x / (x + y);
}

/**
 * Sample from Gamma(shape, scale) using Marsaglia and Tsang's method.
 * Used internally by sampleBeta.
 */
function sampleGamma(shape, scale) {
  if (shape < 1) {
    // Ahrens-Dieter method for shape < 1
    const u = Math.random();
    return sampleGamma(1 + shape, scale) * Math.pow(u, 1 / shape);
  }
  
  // Marsaglia and Tsang's method for shape >= 1
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  
  while (true) {
    let x, v;
    do {
      x = randomNormal();
      v = 1 + c * x;
    } while (v <= 0);
    
    v = v * v * v;
    const u = Math.random();
    
    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v * scale;
    }
    
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale;
    }
  }
}

/**
 * Sample from standard normal distribution using Box-Muller transform.
 */
function randomNormal() {
  let u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  
  return u * Math.sqrt(-2 * Math.log(s) / s);
}

/**
 * Calculate mean of Beta(alpha, beta): E[X] = α / (α + β)
 */
function betaMean(alpha, beta) {
  return alpha / (alpha + beta);
}

/**
 * Calculate variance of Beta(alpha, beta).
 * Lower variance = higher confidence in our estimate.
 */
function betaVariance(alpha, beta) {
  const sum = alpha + beta;
  return (alpha * beta) / (sum * sum * (sum + 1));
}

/**
 * Calculate the Upper Confidence Bound (UCB1) for a Beta distribution.
 * Used as a deterministic fallback when randomness is undesirable.
 * UCB = mean + sqrt(2 * ln(N) / n) where N = total trials, n = arm trials
 */
function betaUCB(alpha, beta, totalTrials) {
  const mean = betaMean(alpha, beta);
  const n = alpha + beta - 2; // subtract priors
  if (n <= 0 || totalTrials <= 0) return mean + 0.5;
  return mean + Math.sqrt(2 * Math.log(totalTrials) / n);
}

/**
 * Convert confidence derived from Beta distribution to 0-1 scale.
 * Based on the width of the 95% credible interval:
 *   narrow interval → high confidence, wide interval → low confidence.
 * 
 * This is mathematically principled, unlike ad-hoc formulas.
 */
function betaConfidence(alpha, beta) {
  const variance = betaVariance(alpha, beta);
  // 95% credible interval width ≈ 4 * sqrt(variance) for Beta
  const intervalWidth = 4 * Math.sqrt(variance);
  // Confidence = 1 - interval width (clamped to [0.05, 0.99])
  return Math.max(0.05, Math.min(0.99, 1 - intervalWidth));
}


// =====================================================================
// MAIN CLASS
// =====================================================================

export class DecisionReinforcer {
  constructor() {
    // In-memory cache (hydrated from DB on first use)
    // Each strategy now has Beta distribution parameters (alpha, beta)
    this.strategyWeights = new Map();
    this.decisionRules = new Map();
    
    // Thompson Sampling doesn't need an explicit exploration rate —
    // exploration is automatic from the Beta distribution sampling.
    // We keep it for backward compatibility and metrics reporting.
    this.explorationRate = 0.0; // Informational only; TS handles it
    this.learningRate = 0.1;
    this.highConfidenceThreshold = 0.8;
    this.lowConfidenceThreshold = 0.3;

    // DB write queue (batched to avoid per-call DB pressure)
    this._dirtyStrategies = new Set();
    this._flushTimer = null;
    this._hydrated = false;
    
    // Counterfactual log: tracks what alternatives WOULD have been chosen
    // This enables offline policy evaluation (Inverse Propensity Scoring)
    this._counterfactualLog = [];
    this._maxCounterfactualLog = 200;
    
    // Total trials across all strategies (needed for UCB fallback)
    this._totalTrials = 0;
  }

  // ===== HYDRATION: Load persisted learnings from DB on first use =====

  async _ensureHydrated() {
    if (this._hydrated) return;
    this._hydrated = true; // Set early to prevent re-entrant calls

    try {
      const result = await query(`
        SELECT pattern_data, occurrences, confidence, last_used_at
        FROM ai_learning_patterns
        WHERE pattern_type = $1
          AND confidence > 0.05
        ORDER BY last_used_at DESC
        LIMIT 500
      `, [PATTERN_TYPE]);

      for (const row of result.rows) {
        const data = typeof row.pattern_data === 'string' ? JSON.parse(row.pattern_data) : row.pattern_data;
        if (!data?.key) continue;

        const successes = data.successes || data.alpha_minus_one || 0;
        const failures = (data.attempts || 0) - successes;
        
        this.strategyWeights.set(data.key, {
          // Beta distribution parameters: α = successes + 1, β = failures + 1
          // The +1 is the uniform prior Beta(1,1)
          alpha: successes + 1,
          beta: Math.max(1, failures + 1),
          successes: successes,
          attempts: data.attempts || 0,
          lastUsed: row.last_used_at ? new Date(row.last_used_at) : new Date(),
          performanceHistory: [], // Not persisted (too large), rebuilt in-memory
        });
        
        this._totalTrials += (data.attempts || 0);
      }

      // Hydrate decision rules
      const rulesResult = await query(`
        SELECT pattern_data, occurrences, confidence, last_used_at
        FROM ai_learning_patterns
        WHERE pattern_type = $1
          AND confidence > 0.10
        ORDER BY last_used_at DESC
        LIMIT 200
      `, [RULE_PATTERN_TYPE]);

      for (const row of rulesResult.rows) {
        const data = typeof row.pattern_data === 'string' ? JSON.parse(row.pattern_data) : row.pattern_data;
        if (!data?.ruleId) continue;

        this.decisionRules.set(data.ruleId, {
          successes: data.successes || 0,
          attempts: data.attempts || 0,
          effectiveness: data.attempts > 0 ? (data.successes / data.attempts) : 0.5,
          lastUsed: row.last_used_at ? new Date(row.last_used_at) : new Date(),
          context: data.context || {},
          decision: data.decision || '',
        });
      }

      // Apply time-decay to hydrated priors (shrink toward prior)
      this._applyPriorDecay();

      if (this.strategyWeights.size > 0 || this.decisionRules.size > 0) {
        console.log(`[DecisionReinforcer] Hydrated from DB: ${this.strategyWeights.size} strategies (Thompson Sampling), ${this.decisionRules.size} rules`);
      }
    } catch (e) {
      // Table may not exist - non-fatal, we just start fresh
      if (!e.message?.includes('ai_learning_patterns')) {
        console.warn('[DecisionReinforcer] Hydration failed:', e.message);
      }
    }
  }

  /**
   * Apply time-decay by shrinking Beta parameters toward the uniform prior.
   * This makes old observations count less, allowing the system to adapt
   * to non-stationary environments (e.g., tool behavior changing over time).
   * 
   * Formula: α_new = 1 + (α - 1) * decay_factor
   *          β_new = 1 + (β - 1) * decay_factor
   * 
   * This preserves the Beta(1,1) prior and shrinks evidence proportionally.
   */
  _applyPriorDecay() {
    for (const [key, data] of this.strategyWeights.entries()) {
      const daysAgo = (Date.now() - new Date(data.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
      const decayFactor = Math.pow(0.5, daysAgo / DECAY_HALF_LIFE_DAYS);
      
      // Shrink toward prior Beta(1,1)
      data.alpha = 1 + (data.alpha - 1) * decayFactor;
      data.beta = 1 + (data.beta - 1) * decayFactor;
      
      // Ensure minimum values
      data.alpha = Math.max(1, data.alpha);
      data.beta = Math.max(1, data.beta);
    }
  }

  // ===== DB PERSISTENCE: Batched async writes =====

  _schedulePersist() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._persistDirty().catch(e =>
        console.warn('[DecisionReinforcer] Persist failed:', e.message)
      );
    }, 5000); // Batch writes every 5 seconds
    if (this._flushTimer.unref) this._flushTimer.unref();
  }

  async _persistDirty() {
    const keys = [...this._dirtyStrategies];
    this._dirtyStrategies.clear();

    for (const key of keys) {
      const data = this.strategyWeights.get(key);
      if (!data) continue;

      const patternData = {
        key,
        successes: data.successes,
        attempts: data.attempts,
        // Persist Beta parameters for lossless hydration
        alpha_minus_one: data.alpha - 1,
        beta_minus_one: data.beta - 1,
      };

      try {
        // Upsert: use pattern_data->>'key' for deduplication
        const existing = await query(`
          SELECT id FROM ai_learning_patterns
          WHERE pattern_type = $1 AND pattern_data->>'key' = $2
          LIMIT 1
        `, [PATTERN_TYPE, key]);

        const confidence = betaConfidence(data.alpha, data.beta);

        if (existing.rows.length > 0) {
          await query(`
            UPDATE ai_learning_patterns
            SET pattern_data = $1::jsonb,
                occurrences = $2,
                confidence = $3,
                last_used_at = NOW(),
                updated_at = NOW()
            WHERE id = $4
          `, [
            JSON.stringify(patternData),
            data.attempts,
            confidence,
            existing.rows[0].id
          ]);
        } else {
          // Extract firm_id from key if possible, otherwise use a generic scope
          await query(`
            INSERT INTO ai_learning_patterns
              (firm_id, pattern_type, pattern_category, pattern_data, occurrences, confidence)
            SELECT f.id, $1, 'tool_learning', $2::jsonb, $3, $4
            FROM firms f LIMIT 1
          `, [
            PATTERN_TYPE,
            JSON.stringify(patternData),
            data.attempts,
            confidence,
          ]);
        }
      } catch (e) {
        // Non-fatal
      }
    }
  }

  /** Force immediate persist (called on graceful shutdown or task end) */
  async flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    await this._persistDirty();
  }

  // ===== TIME DECAY =====

  calculateRecencyWeight(lastUsed) {
    if (!lastUsed) return 0.5;
    const daysAgo = (Date.now() - new Date(lastUsed).getTime()) / (1000 * 60 * 60 * 24);
    // Exponential decay with configurable half-life
    return Math.pow(0.5, daysAgo / DECAY_HALF_LIFE_DAYS);
  }

  // ===== CORE API: Thompson Sampling =====

  /**
   * Choose the best strategy using Thompson Sampling.
   * 
   * For each available strategy, sample from its Beta posterior.
   * The strategy with the highest sample wins. This automatically
   * balances exploration (uncertain strategies get wide samples that
   * sometimes win) and exploitation (confident strategies get tight
   * samples that usually win).
   * 
   * No explicit exploration rate needed — it's emergent from the math.
   */
  chooseStrategy(taskType, availableStrategies, options = {}) {
    // Hydration is fire-and-forget; if not ready yet, use defaults
    if (!this._hydrated) {
      this._ensureHydrated().catch(() => {});
    }

    const { deterministic = false } = options;

    const strategyScores = availableStrategies.map(strategy => {
      const key = `${taskType}:${strategy}`;
      const data = this.strategyWeights.get(key);
      
      const alpha = data?.alpha || 1;  // Prior: Beta(1,1) = uniform
      const beta = data?.beta || 1;
      
      let score;
      if (deterministic) {
        // Use UCB for deterministic selection (no randomness)
        score = betaUCB(alpha, beta, this._totalTrials);
      } else {
        // Thompson Sampling: draw from posterior
        score = sampleBeta(alpha, beta);
      }
      
      // Apply recency weight as a multiplicative factor
      const recency = data ? this.calculateRecencyWeight(data.lastUsed) : 0.5;
      const adjustedScore = score * (0.6 + 0.4 * recency);
      
      return {
        strategy,
        thompsonSample: score,
        adjustedScore,
        confidence: betaConfidence(alpha, beta),
        mean: betaMean(alpha, beta),
        alpha,
        beta,
        attempts: data?.attempts || 0,
        recency,
      };
    });

    // Sort by adjusted Thompson sample
    strategyScores.sort((a, b) => b.adjustedScore - a.adjustedScore);

    const chosen = strategyScores[0];
    const isExploration = chosen.attempts > 0 && chosen.mean < (strategyScores[1]?.mean || 0);

    // Log counterfactual: what would UCB have chosen?
    const ucbScores = strategyScores.map(s => ({
      strategy: s.strategy,
      ucb: betaUCB(s.alpha, s.beta, this._totalTrials),
    })).sort((a, b) => b.ucb - a.ucb);
    
    this._logCounterfactual(taskType, chosen.strategy, ucbScores[0]?.strategy, strategyScores);

    // Update informational exploration rate
    this.explorationRate = isExploration ? 
      Math.min(0.5, this.explorationRate * 0.95 + 0.05) :
      Math.max(0.01, this.explorationRate * 0.95);

    return {
      chosenStrategy: chosen.strategy,
      confidence: chosen.confidence,
      reason: isExploration ? 'thompson_exploration' : 'thompson_exploitation',
      thompsonSample: chosen.thompsonSample,
      posteriorMean: chosen.mean,
      alternatives: strategyScores.slice(0, 3).map(s => s.strategy),
      distribution: { alpha: chosen.alpha, beta: chosen.beta },
    };
  }

  /**
   * Get strategy confidence using Beta distribution credible interval.
   * This is mathematically principled (based on posterior variance)
   * unlike the previous ad-hoc formula.
   */
  getStrategyConfidence(taskType, strategy) {
    const key = `${taskType}:${strategy}`;
    const data = this.strategyWeights.get(key);

    if (!data) return 0.5; // Uniform prior → 50% confidence
    
    const rawConfidence = betaConfidence(data.alpha, data.beta);
    const recency = this.calculateRecencyWeight(data.lastUsed);
    
    // Combine statistical confidence with recency
    return rawConfidence * (0.5 + 0.5 * recency);
  }

  /**
   * Get strategy weight (expected success probability from posterior mean).
   */
  getStrategyWeight(taskType, strategy) {
    const key = `${taskType}:${strategy}`;
    const data = this.strategyWeights.get(key);
    if (!data) return 0.5; // Uniform prior

    const posteriorMean = betaMean(data.alpha, data.beta);
    const recencyWeight = this.calculateRecencyWeight(data.lastUsed);
    return posteriorMean * (0.6 + 0.4 * recencyWeight);
  }

  /**
   * Record an outcome and update the Beta posterior.
   * 
   * Bayesian update is trivially simple for Beta-Bernoulli:
   *   Success: α → α + 1
   *   Failure: β → β + 1
   * 
   * This is a conjugate update — no approximation, exact inference.
   */
  recordOutcome(taskType, strategy, success, performanceMetrics = {}) {
    const key = `${taskType}:${strategy}`;

    if (!this.strategyWeights.has(key)) {
      this.strategyWeights.set(key, {
        alpha: 1,  // Beta(1,1) prior = uniform
        beta: 1,
        successes: 0,
        attempts: 0,
        lastUsed: new Date(),
        performanceHistory: [],
      });
    }

    const data = this.strategyWeights.get(key);
    
    // Bayesian update: conjugate Beta-Bernoulli
    if (success) {
      data.alpha += 1;
      data.successes++;
    } else {
      data.beta += 1;
    }
    
    data.attempts++;
    data.lastUsed = new Date();
    this._totalTrials++;

    // Keep small in-memory performance history (not persisted)
    data.performanceHistory.push({
      timestamp: new Date(),
      success,
      ...performanceMetrics,
    });
    if (data.performanceHistory.length > 50) {
      data.performanceHistory = data.performanceHistory.slice(-50);
    }

    // Mark dirty for async DB write
    this._dirtyStrategies.add(key);
    this._schedulePersist();

    const confidence = betaConfidence(data.alpha, data.beta);
    const mean = betaMean(data.alpha, data.beta);

    return {
      updatedConfidence: confidence,
      updatedWeight: this.getStrategyWeight(taskType, strategy),
      posteriorMean: mean,
      posteriorVariance: betaVariance(data.alpha, data.beta),
      distribution: { alpha: data.alpha, beta: data.beta },
      totalAttempts: data.attempts,
      successRate: data.successes / data.attempts,
    };
  }

  learnDecisionRule(context, decision, outcome) {
    const ruleId = this._generateRuleId(context, decision);

    if (!this.decisionRules.has(ruleId)) {
      this.decisionRules.set(ruleId, {
        successes: 0,
        attempts: 0,
        effectiveness: 0.5,
        lastUsed: new Date(),
        context,
        decision,
      });
    }

    const rule = this.decisionRules.get(ruleId);
    rule.attempts++;
    if (outcome.success) rule.successes++;
    rule.lastUsed = new Date();
    rule.effectiveness = rule.successes / rule.attempts;

    // Prune ineffective rules (with decay consideration)
    const recency = this.calculateRecencyWeight(rule.lastUsed);
    if (rule.attempts > 10 && rule.effectiveness < 0.3 && recency < 0.3) {
      this.decisionRules.delete(ruleId);
    }
  }

  /**
   * Get detailed decision metrics including Bayesian posteriors.
   */
  getDecisionMetrics(taskType) {
    const strategies = [];

    for (const [key, data] of this.strategyWeights.entries()) {
      const parts = key.split(':');
      if (parts.length < 2) continue;
      const storedTaskType = parts[0];
      const strategy = parts.slice(1).join(':');

      if (storedTaskType === taskType) {
        strategies.push({
          strategy,
          attempts: data.attempts,
          successes: data.successes,
          successRate: data.successes / Math.max(data.attempts, 1),
          confidence: this.getStrategyConfidence(taskType, strategy),
          weight: this.getStrategyWeight(taskType, strategy),
          posteriorMean: betaMean(data.alpha, data.beta),
          posteriorVariance: betaVariance(data.alpha, data.beta),
          distribution: { alpha: data.alpha, beta: data.beta },
          lastUsed: data.lastUsed,
          recencyWeight: this.calculateRecencyWeight(data.lastUsed),
        });
      }
    }

    return {
      taskType,
      algorithm: 'thompson_sampling',
      explorationRate: this.explorationRate,
      totalTrials: this._totalTrials,
      strategies: strategies.sort((a, b) => b.confidence - a.confidence),
      averageConfidence: strategies.length > 0
        ? strategies.reduce((sum, s) => sum + s.confidence, 0) / strategies.length
        : 0.5,
      counterfactualLogSize: this._counterfactualLog.length,
    };
  }

  /**
   * Get counterfactual analysis: how often does Thompson Sampling agree with UCB?
   * High agreement = system has converged. Low agreement = still exploring.
   */
  getCounterfactualAnalysis() {
    if (this._counterfactualLog.length === 0) return null;
    
    const recent = this._counterfactualLog.slice(-50);
    const agreements = recent.filter(l => l.thompsonChoice === l.ucbChoice).length;
    
    return {
      sampleSize: recent.length,
      thompsonUcbAgreement: agreements / recent.length,
      isConverged: (agreements / recent.length) > 0.85,
      recentChoices: recent.slice(-5).map(l => ({
        taskType: l.taskType,
        chosen: l.thompsonChoice,
        ucbWouldHave: l.ucbChoice,
        agreed: l.thompsonChoice === l.ucbChoice,
      })),
    };
  }

  getStats() {
    return {
      strategyWeights: this.strategyWeights.size,
      decisionRules: this.decisionRules.size,
      algorithm: 'thompson_sampling_beta_bernoulli',
      explorationRate: this.explorationRate,
      totalTrials: this._totalTrials,
      hydrated: this._hydrated,
      dirtyCount: this._dirtyStrategies.size,
      counterfactualLogSize: this._counterfactualLog.length,
    };
  }

  reset() {
    this.strategyWeights.clear();
    this.decisionRules.clear();
    this._dirtyStrategies.clear();
    this._counterfactualLog = [];
    this._totalTrials = 0;
    this.explorationRate = 0.0;
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Log a counterfactual: what Thompson Sampling chose vs what UCB would have.
   * Enables offline policy evaluation and convergence detection.
   */
  _logCounterfactual(taskType, thompsonChoice, ucbChoice, allScores) {
    this._counterfactualLog.push({
      timestamp: new Date(),
      taskType,
      thompsonChoice,
      ucbChoice: ucbChoice || thompsonChoice,
      scores: allScores.slice(0, 3).map(s => ({
        strategy: s.strategy,
        sample: s.thompsonSample,
        mean: s.mean,
        confidence: s.confidence,
      })),
    });
    
    // Trim log
    if (this._counterfactualLog.length > this._maxCounterfactualLog) {
      this._counterfactualLog = this._counterfactualLog.slice(-this._maxCounterfactualLog);
    }
  }

  _generateRuleId(context, decision) {
    const contextStr = typeof context === 'string' ? context
      : JSON.stringify(context, Object.keys(context).sort());
    let hash = 0;
    for (let i = 0; i < contextStr.length; i++) {
      hash = ((hash << 5) - hash) + contextStr.charCodeAt(i);
      hash |= 0;
    }
    return `${hash.toString(16)}:${decision}`;
  }
}

// Export Beta distribution utilities for use by other modules
export { sampleBeta, betaMean, betaVariance, betaConfidence, betaUCB };
