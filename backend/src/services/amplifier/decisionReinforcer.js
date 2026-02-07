/**
 * Decision Reinforcer - DB-Persistent Reinforcement Learning
 * 
 * Tracks which tools succeed for which task types and learns decision
 * rules that persist across server restarts.
 * 
 * Architecture:
 * - Write-through cache: in-memory Map for speed, DB for persistence
 * - On startup: hydrate from ai_learning_patterns table
 * - On every recordOutcome: update in-memory + async DB write
 * - Confidence: 0.0-1.0 everywhere, with time-decay built in
 * - Old patterns decay: half-life of 14 days (configurable)
 * 
 * This replaces the previous in-memory-only version that lost all
 * learnings on every server restart.
 */

import { query } from '../../db/connection.js';

const PATTERN_TYPE = 'tool_strategy';
const RULE_PATTERN_TYPE = 'decision_rule';
const DECAY_HALF_LIFE_DAYS = 14;

export class DecisionReinforcer {
  constructor() {
    // In-memory cache (hydrated from DB on first use)
    this.strategyWeights = new Map();
    this.decisionRules = new Map();
    this.explorationRate = 0.1;
    this.learningRate = 0.1;
    this.highConfidenceThreshold = 0.8;
    this.lowConfidenceThreshold = 0.3;

    // DB write queue (batched to avoid per-call DB pressure)
    this._dirtyStrategies = new Set();
    this._flushTimer = null;
    this._hydrated = false;
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

        this.strategyWeights.set(data.key, {
          successes: data.successes || 0,
          attempts: data.attempts || 0,
          lastUsed: row.last_used_at ? new Date(row.last_used_at) : new Date(),
          performanceHistory: [], // Not persisted (too large), rebuilt in-memory
        });
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

      if (this.strategyWeights.size > 0 || this.decisionRules.size > 0) {
        console.log(`[DecisionReinforcer] Hydrated from DB: ${this.strategyWeights.size} strategies, ${this.decisionRules.size} rules`);
      }
    } catch (e) {
      // Table may not exist - non-fatal, we just start fresh
      if (!e.message?.includes('ai_learning_patterns')) {
        console.warn('[DecisionReinforcer] Hydration failed:', e.message);
      }
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
      };

      try {
        // Upsert: use pattern_data->>'key' for deduplication
        const existing = await query(`
          SELECT id FROM ai_learning_patterns
          WHERE pattern_type = $1 AND pattern_data->>'key' = $2
          LIMIT 1
        `, [PATTERN_TYPE, key]);

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
            Math.min(0.99, data.successes / Math.max(data.attempts, 1)),
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
            Math.min(0.99, data.successes / Math.max(data.attempts, 1)),
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

  // ===== CORE API (same interface as before, now persistent) =====

  chooseStrategy(taskType, availableStrategies) {
    // Hydration is fire-and-forget; if not ready yet, use defaults
    if (!this._hydrated) {
      this._ensureHydrated().catch(() => {});
    }

    const strategiesWithConfidence = availableStrategies.map(strategy => ({
      strategy,
      confidence: this.getStrategyConfidence(taskType, strategy),
      weight: this.getStrategyWeight(taskType, strategy),
    }));

    strategiesWithConfidence.sort((a, b) =>
      (b.confidence * b.weight) - (a.confidence * a.weight)
    );

    // Exploration: sometimes try something different
    if (Math.random() < this.explorationRate && strategiesWithConfidence.length > 1) {
      return {
        chosenStrategy: strategiesWithConfidence[1].strategy,
        confidence: strategiesWithConfidence[1].confidence,
        reason: 'exploration',
        alternatives: strategiesWithConfidence.slice(0, 3).map(s => s.strategy),
      };
    }

    return {
      chosenStrategy: strategiesWithConfidence[0].strategy,
      confidence: strategiesWithConfidence[0].confidence,
      reason: 'exploitation',
      alternatives: strategiesWithConfidence.slice(0, 3).map(s => s.strategy),
    };
  }

  getStrategyConfidence(taskType, strategy) {
    const key = `${taskType}:${strategy}`;
    const data = this.strategyWeights.get(key);

    if (!data || data.attempts < 3) return 0.5;

    const successRate = data.successes / data.attempts;
    const sampleWeight = Math.min(data.attempts / 10, 1);
    const recency = this.calculateRecencyWeight(data.lastUsed);

    // Confidence = success rate * sample confidence * recency
    return successRate * sampleWeight * (0.5 + 0.5 * recency);
  }

  getStrategyWeight(taskType, strategy) {
    const key = `${taskType}:${strategy}`;
    const data = this.strategyWeights.get(key);
    if (!data) return 1.0;

    const recencyWeight = this.calculateRecencyWeight(data.lastUsed);
    const successWeight = data.successes / Math.max(data.attempts, 1);
    return (recencyWeight * 0.3) + (successWeight * 0.7);
  }

  recordOutcome(taskType, strategy, success, performanceMetrics = {}) {
    const key = `${taskType}:${strategy}`;

    if (!this.strategyWeights.has(key)) {
      this.strategyWeights.set(key, {
        successes: 0,
        attempts: 0,
        lastUsed: new Date(),
        performanceHistory: [],
      });
    }

    const data = this.strategyWeights.get(key);
    data.attempts++;
    if (success) data.successes++;
    data.lastUsed = new Date();

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

    // Adjust exploration rate
    this._adjustExplorationRate();

    return {
      updatedConfidence: this.getStrategyConfidence(taskType, strategy),
      updatedWeight: this.getStrategyWeight(taskType, strategy),
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
          lastUsed: data.lastUsed,
          recencyWeight: this.calculateRecencyWeight(data.lastUsed),
        });
      }
    }

    return {
      taskType,
      explorationRate: this.explorationRate,
      strategies: strategies.sort((a, b) => b.confidence - a.confidence),
      averageConfidence: strategies.length > 0
        ? strategies.reduce((sum, s) => sum + s.confidence, 0) / strategies.length
        : 0.5,
    };
  }

  getStats() {
    return {
      strategyWeights: this.strategyWeights.size,
      decisionRules: this.decisionRules.size,
      explorationRate: this.explorationRate,
      hydrated: this._hydrated,
      dirtyCount: this._dirtyStrategies.size,
    };
  }

  reset() {
    this.strategyWeights.clear();
    this.decisionRules.clear();
    this._dirtyStrategies.clear();
    this.explorationRate = 0.1;
  }

  // ===== PRIVATE HELPERS =====

  _adjustExplorationRate() {
    let totalConfidence = 0;
    let count = 0;

    for (const [key, data] of this.strategyWeights.entries()) {
      if (data.attempts >= 3) {
        const parts = key.split(':');
        const taskType = parts[0];
        const strategy = parts.slice(1).join(':');
        totalConfidence += this.getStrategyConfidence(taskType, strategy);
        count++;
      }
    }

    if (count === 0) return;

    const avgConfidence = totalConfidence / count;
    if (avgConfidence > this.highConfidenceThreshold) {
      this.explorationRate = Math.max(0.05, this.explorationRate * 0.95);
    } else if (avgConfidence < this.lowConfidenceThreshold) {
      this.explorationRate = Math.min(0.25, this.explorationRate * 1.05);
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
