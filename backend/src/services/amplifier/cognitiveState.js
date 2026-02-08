/**
 * Cognitive State Inference Engine
 * 
 * THE SAME LAWYER WANTS DIFFERENT THINGS AT DIFFERENT TIMES.
 * 
 * A partner doing deep case analysis at 8am wants exhaustive, thorough
 * output with every angle covered. The same partner triaging 15 matters
 * at 4pm wants bullet points, executive summaries, and action items.
 * 
 * Current AI systems produce the same output regardless of context.
 * This module infers the lawyer's current cognitive state from observable
 * signals already in the database and adapts the agent's behavior.
 * 
 * COGNITIVE STATES:
 * 
 * - DEEP_WORK: Focused on one matter for extended time. Wants thoroughness,
 *   comprehensive analysis, long documents, every detail explored.
 * 
 * - TRIAGE: Bouncing between matters quickly. Wants bullet points, executive
 *   summaries, action items, quick decisions. Speed over depth.
 * 
 * - URGENT: Approaching deadline. Wants speed, draft-quality output now,
 *   perfect later. Emphasize the critical path.
 * 
 * - REVIEW: End of day/week pattern. Wants status summaries, portfolio
 *   overview, what needs attention. Big picture over detail.
 * 
 * - EXPLORATION: Research mode, early in a case. Wants breadth of options,
 *   multiple angles, questions raised, avenues to explore.
 * 
 * HOW IT WORKS:
 * 
 * 1. OBSERVE: Query recent activity signals already in the database:
 *    task submission frequency, matter switching, time-of-day, deadline
 *    proximity, goal complexity, recent task types.
 * 
 * 2. INFER: Combine signals into a state classification with confidence.
 * 
 * 3. ADAPT: Generate adaptations that modify the agent's behavior:
 *    detail_level, brevity_preference, action_bias, structure_preference.
 * 
 * 4. LEARN: Store time-of-day and day-of-week patterns so the system
 *    gets better at predicting state over time.
 * 
 * PRIVACY: All data scoped to user_id + firm_id.
 */

import { query } from '../../db/connection.js';

// =====================================================================
// CONFIGURATION
// =====================================================================

const STATE_CACHE_TTL_MS = 600000;  // 10 minutes
const stateCache = new Map();

// State definitions with their signal patterns and adaptations
const COGNITIVE_STATES = {
  deep_work: {
    label: 'deep_work',
    description: 'Focused deep work — wants thoroughness and comprehensive analysis',
    adaptations: {
      detail_level: 'exhaustive',
      brevity_preference: 0.2,        // Low brevity = long, thorough output
      action_bias: 'analysis_first',  // Prioritize analysis over quick action
      structure_preference: 'detailed_sections',
      discovery_budget_percent: 35,
      analysis_budget_percent: 30,
      action_budget_percent: 25,
      review_budget_percent: 10,
    },
  },
  triage: {
    label: 'triage',
    description: 'Rapid triage — wants bullet points, summaries, quick action items',
    adaptations: {
      detail_level: 'concise',
      brevity_preference: 0.85,       // High brevity = short, punchy output
      action_bias: 'action_first',    // Prioritize actionable output
      structure_preference: 'bullets_and_lists',
      discovery_budget_percent: 15,
      analysis_budget_percent: 15,
      action_budget_percent: 55,
      review_budget_percent: 15,
    },
  },
  urgent: {
    label: 'urgent',
    description: 'Deadline pressure — wants speed, draft quality now, polish later',
    adaptations: {
      detail_level: 'moderate',
      brevity_preference: 0.6,
      action_bias: 'speed',
      structure_preference: 'whatever_works',
      discovery_budget_percent: 20,
      analysis_budget_percent: 15,
      action_budget_percent: 50,
      review_budget_percent: 15,
    },
  },
  review: {
    label: 'review',
    description: 'Review mode — wants status summaries, portfolio overview, big picture',
    adaptations: {
      detail_level: 'summary',
      brevity_preference: 0.5,
      action_bias: 'reporting',
      structure_preference: 'headers_and_bullets',
      discovery_budget_percent: 30,
      analysis_budget_percent: 25,
      action_budget_percent: 30,
      review_budget_percent: 15,
    },
  },
  exploration: {
    label: 'exploration',
    description: 'Research/exploration — wants breadth, multiple angles, options',
    adaptations: {
      detail_level: 'moderate',
      brevity_preference: 0.4,
      action_bias: 'options',
      structure_preference: 'pros_cons_sections',
      discovery_budget_percent: 40,
      analysis_budget_percent: 30,
      action_budget_percent: 20,
      review_budget_percent: 10,
    },
  },
};

// Auto-migration
let _tableEnsured = false;
async function _ensureTable() {
  if (_tableEnsured) return;
  _tableEnsured = true;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS cognitive_state_snapshots (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        cognitive_state VARCHAR(30) NOT NULL,
        signals JSONB NOT NULL,
        adaptations JSONB NOT NULL,
        confidence DECIMAL(3,2) DEFAULT 0.60,
        valid_from TIMESTAMPTZ DEFAULT NOW(),
        valid_until TIMESTAMPTZ DEFAULT NOW() + INTERVAL '2 hours',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_cog_state_user ON cognitive_state_snapshots(user_id, firm_id, valid_until DESC)`);
    
    await query(`
      CREATE TABLE IF NOT EXISTS cognitive_state_patterns (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        day_of_week INTEGER,
        hour_of_day INTEGER,
        typical_state VARCHAR(30) NOT NULL,
        typical_adaptations JSONB NOT NULL,
        observation_count INTEGER DEFAULT 1,
        confidence DECIMAL(3,2) DEFAULT 0.40,
        last_observed TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, firm_id, day_of_week, hour_of_day)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_cog_patterns_user ON cognitive_state_patterns(user_id, firm_id)`);
  } catch (e) {
    if (!e.message?.includes('already exists')) {
      console.log('[CognitiveState] Auto-migration note:', e.message);
    }
  }
}

// =====================================================================
// CORE: Infer the attorney's current cognitive state
// =====================================================================

/**
 * Infer the current cognitive state for an attorney.
 * Uses observable signals from the database + learned temporal patterns.
 * 
 * @param {string} userId - The attorney
 * @param {string} firmId - The firm
 * @returns {object} { state, adaptations, confidence, signals }
 */
export async function inferCognitiveState(userId, firmId) {
  // Check cache
  const cacheKey = `${userId}:${firmId}`;
  const cached = stateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < STATE_CACHE_TTL_MS) {
    return cached.state;
  }
  
  await _ensureTable();
  
  try {
    // Collect signals from multiple sources
    const signals = await _collectSignals(userId, firmId);
    
    // Score each possible state
    const scores = {};
    for (const [stateName, stateConfig] of Object.entries(COGNITIVE_STATES)) {
      scores[stateName] = _scoreState(stateName, signals);
    }
    
    // Check learned temporal patterns (time-of-day preferences)
    const temporalBoost = await _getTemporalBoost(userId, firmId);
    if (temporalBoost) {
      scores[temporalBoost.state] = (scores[temporalBoost.state] || 0) + temporalBoost.boost;
    }
    
    // Pick the highest-scoring state
    const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
    const bestState = sorted[0][0];
    const bestScore = sorted[0][1];
    const confidence = Math.min(0.95, bestScore / 10); // Normalize to 0-1
    
    const result = {
      state: bestState,
      ...COGNITIVE_STATES[bestState],
      confidence,
      signals,
      scores,
    };
    
    // Cache it
    stateCache.set(cacheKey, { state: result, timestamp: Date.now() });
    
    // Store snapshot for pattern learning
    await _storeSnapshot(userId, firmId, result);
    
    // Update temporal patterns
    await _updateTemporalPattern(userId, firmId, bestState, COGNITIVE_STATES[bestState].adaptations, confidence);
    
    console.log(`[CognitiveState] Inferred state for ${userId}: ${bestState} (confidence: ${confidence.toFixed(2)})`);
    
    return result;
  } catch (e) {
    console.log('[CognitiveState] Inference note:', e.message);
    // Default to deep_work if inference fails
    return {
      state: 'deep_work',
      ...COGNITIVE_STATES.deep_work,
      confidence: 0.3,
      signals: {},
      scores: {},
    };
  }
}

// =====================================================================
// SIGNAL COLLECTION: Gather observable evidence from the database
// =====================================================================

async function _collectSignals(userId, firmId) {
  const signals = {
    taskFrequency: 0,        // Tasks submitted in last 2 hours
    matterSwitchRate: 0,     // Distinct matters touched in last 2 hours
    avgGoalLength: 0,        // Average goal text length (longer = more complex/detailed request)
    hasUpcomingDeadline: false,
    deadlineWithinDays: null,
    hourOfDay: new Date().getHours(),
    dayOfWeek: new Date().getDay(),
    recentWorkTypes: [],     // What types of tasks they've been doing
    isWeekend: [0, 6].includes(new Date().getDay()),
    recentFeedbackAvg: null, // Are they happy or frustrated?
  };
  
  // 1. Recent task frequency and matter switching
  try {
    const recentTasks = await query(`
      SELECT goal, matter_id, 
             EXTRACT(EPOCH FROM (completed_at - started_at)) as duration,
             feedback_rating, review_status
      FROM ai_background_tasks
      WHERE user_id = $1 AND firm_id = $2
        AND created_at > NOW() - INTERVAL '2 hours'
      ORDER BY created_at DESC
      LIMIT 10
    `, [userId, firmId]);
    
    signals.taskFrequency = recentTasks.rows.length;
    
    const distinctMatters = new Set(recentTasks.rows.map(r => r.matter_id).filter(Boolean));
    signals.matterSwitchRate = distinctMatters.size;
    
    if (recentTasks.rows.length > 0) {
      signals.avgGoalLength = Math.round(
        recentTasks.rows.reduce((sum, r) => sum + (r.goal?.length || 0), 0) / recentTasks.rows.length
      );
    }
    
    // Recent feedback
    const rated = recentTasks.rows.filter(r => r.feedback_rating);
    if (rated.length > 0) {
      signals.recentFeedbackAvg = rated.reduce((s, r) => s + r.feedback_rating, 0) / rated.length;
    }
  } catch (_) {}
  
  // 2. Upcoming deadlines
  try {
    const deadlines = await query(`
      SELECT ce.start_time
      FROM calendar_events ce
      WHERE ce.firm_id = $1 
        AND ce.created_by = $2
        AND ce.start_time > NOW()
        AND ce.start_time < NOW() + INTERVAL '3 days'
      ORDER BY ce.start_time ASC
      LIMIT 1
    `, [firmId, userId]);
    
    if (deadlines.rows.length > 0) {
      signals.hasUpcomingDeadline = true;
      const hoursUntil = (new Date(deadlines.rows[0].start_time) - Date.now()) / (1000 * 60 * 60);
      signals.deadlineWithinDays = Math.round(hoursUntil / 24 * 10) / 10;
    }
  } catch (_) {}
  
  // 3. Recent work types
  try {
    const workTypes = await query(`
      SELECT result->>'work_type_id' as work_type
      FROM ai_background_tasks
      WHERE user_id = $1 AND firm_id = $2
        AND completed_at > NOW() - INTERVAL '4 hours'
        AND result IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 5
    `, [userId, firmId]);
    
    signals.recentWorkTypes = workTypes.rows
      .map(r => r.work_type)
      .filter(Boolean);
  } catch (_) {}
  
  return signals;
}

// =====================================================================
// STATE SCORING: How well do signals match each cognitive state?
// =====================================================================

function _scoreState(stateName, signals) {
  let score = 0;
  
  switch (stateName) {
    case 'deep_work':
      // Low task frequency + single matter + long goals = deep work
      if (signals.taskFrequency <= 2) score += 3;
      if (signals.matterSwitchRate <= 1) score += 3;
      if (signals.avgGoalLength > 80) score += 2;
      // Morning hours favor deep work
      if (signals.hourOfDay >= 7 && signals.hourOfDay <= 11) score += 2;
      // Weekday mornings strongly favor deep work
      if (!signals.isWeekend && signals.hourOfDay <= 11) score += 1;
      break;
      
    case 'triage':
      // High task frequency + many matters = triage
      if (signals.taskFrequency >= 4) score += 3;
      if (signals.matterSwitchRate >= 3) score += 3;
      if (signals.avgGoalLength < 50) score += 2; // Short, quick goals
      // Afternoon = more likely triage
      if (signals.hourOfDay >= 14 && signals.hourOfDay <= 17) score += 2;
      break;
      
    case 'urgent':
      // Approaching deadline is the primary signal
      if (signals.hasUpcomingDeadline) score += 4;
      if (signals.deadlineWithinDays !== null && signals.deadlineWithinDays < 1) score += 3;
      if (signals.deadlineWithinDays !== null && signals.deadlineWithinDays < 3) score += 1;
      // Recent frustrated feedback might indicate pressure
      if (signals.recentFeedbackAvg !== null && signals.recentFeedbackAvg < 3) score += 1;
      break;
      
    case 'review':
      // End of day/week, with review-type work
      if (signals.hourOfDay >= 16) score += 2;
      if (signals.dayOfWeek === 5) score += 2; // Friday
      if (signals.recentWorkTypes.includes('billing_review')) score += 2;
      if (signals.recentWorkTypes.includes('matter_review')) score += 2;
      // Low urgency + end of period
      if (!signals.hasUpcomingDeadline && signals.hourOfDay >= 15) score += 1;
      break;
      
    case 'exploration':
      // Research-type work, longer goals, single matter focus
      if (signals.recentWorkTypes.includes('legal_research')) score += 3;
      if (signals.avgGoalLength > 100) score += 2;
      if (signals.matterSwitchRate <= 1) score += 1;
      if (signals.taskFrequency >= 2 && signals.taskFrequency <= 3) score += 1;
      break;
  }
  
  return score;
}

// =====================================================================
// TEMPORAL PATTERNS: Learn time-of-day preferences
// =====================================================================

async function _getTemporalBoost(userId, firmId) {
  try {
    const now = new Date();
    const result = await query(`
      SELECT typical_state, confidence 
      FROM cognitive_state_patterns
      WHERE user_id = $1 AND firm_id = $2
        AND (day_of_week = $3 OR day_of_week IS NULL)
        AND (hour_of_day = $4 OR hour_of_day IS NULL)
        AND confidence >= 0.5
      ORDER BY confidence DESC
      LIMIT 1
    `, [userId, firmId, now.getDay(), now.getHours()]);
    
    if (result.rows.length > 0) {
      return {
        state: result.rows[0].typical_state,
        boost: parseFloat(result.rows[0].confidence) * 3, // Weight by confidence
      };
    }
  } catch (_) {}
  return null;
}

async function _updateTemporalPattern(userId, firmId, state, adaptations, confidence) {
  if (confidence < 0.4) return; // Don't learn from low-confidence inferences
  
  try {
    const now = new Date();
    await query(`
      INSERT INTO cognitive_state_patterns
        (user_id, firm_id, day_of_week, hour_of_day, typical_state, typical_adaptations, confidence)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, firm_id, day_of_week, hour_of_day)
      DO UPDATE SET
        typical_state = CASE
          WHEN cognitive_state_patterns.observation_count > 5 
            AND cognitive_state_patterns.typical_state != $5
          THEN cognitive_state_patterns.typical_state
          ELSE $5
        END,
        typical_adaptations = $6,
        observation_count = cognitive_state_patterns.observation_count + 1,
        confidence = LEAST(0.95, cognitive_state_patterns.confidence + 0.02),
        last_observed = NOW()
    `, [userId, firmId, now.getDay(), now.getHours(), state, JSON.stringify(adaptations), confidence]);
  } catch (_) {}
}

async function _storeSnapshot(userId, firmId, stateResult) {
  try {
    await query(`
      INSERT INTO cognitive_state_snapshots
        (user_id, firm_id, cognitive_state, signals, adaptations, confidence)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      userId, firmId, stateResult.state,
      JSON.stringify(stateResult.signals),
      JSON.stringify(stateResult.adaptations),
      stateResult.confidence,
    ]);
  } catch (_) {}
}

// =====================================================================
// FORMAT FOR PROMPT: How should the agent adapt to the current state?
// =====================================================================

/**
 * Format cognitive state adaptations for injection into the system prompt.
 * Modifies how the agent approaches the task based on inferred state.
 */
export function formatCognitiveStateForPrompt(stateResult) {
  if (!stateResult || stateResult.confidence < 0.35) return '';
  
  const state = COGNITIVE_STATES[stateResult.state];
  if (!state) return '';
  
  const adapt = state.adaptations;
  
  let output = `\n## WORKING MODE: ${stateResult.state.toUpperCase().replace('_', ' ')}\n`;
  output += `${state.description} (${Math.round(stateResult.confidence * 100)}% confidence)\n`;
  
  // Detail level guidance
  switch (adapt.detail_level) {
    case 'exhaustive':
      output += `- **Detail:** Be THOROUGH. Cover every angle. Long, comprehensive analysis.\n`;
      break;
    case 'concise':
      output += `- **Detail:** Be CONCISE. Bullet points. Executive summaries. Get to action items fast.\n`;
      break;
    case 'summary':
      output += `- **Detail:** SUMMARY level. Big picture, status overview, key metrics.\n`;
      break;
    case 'moderate':
      output += `- **Detail:** Balanced detail — enough to be useful, not overwhelming.\n`;
      break;
  }
  
  // Action bias
  switch (adapt.action_bias) {
    case 'analysis_first':
      output += `- **Focus:** Analysis-first. Deep thinking before action. Quality over speed.\n`;
      break;
    case 'action_first':
      output += `- **Focus:** Action-first. Create deliverables quickly. Summaries over essays.\n`;
      break;
    case 'speed':
      output += `- **Focus:** SPEED. Draft quality is fine. Get it done. Polish later.\n`;
      break;
    case 'reporting':
      output += `- **Focus:** Reporting. Status summaries, metrics, what needs attention.\n`;
      break;
    case 'options':
      output += `- **Focus:** Multiple options with pros/cons. Breadth over depth.\n`;
      break;
  }
  
  // Structure preference
  switch (adapt.structure_preference) {
    case 'bullets_and_lists':
      output += `- **Format:** Bullet points and lists. Scannable. No long paragraphs.\n`;
      break;
    case 'detailed_sections':
      output += `- **Format:** Full sections with headers. Detailed narrative where needed.\n`;
      break;
    case 'headers_and_bullets':
      output += `- **Format:** Clear headers with bullet points under each. Overview format.\n`;
      break;
    case 'pros_cons_sections':
      output += `- **Format:** Options format. Each option with pros/cons/recommendation.\n`;
      break;
  }
  
  return output;
}

/**
 * Get adapted time budget based on cognitive state.
 * Overrides the default phase budgets from juniorAttorneyBrief.js.
 */
export function getAdaptedTimeBudget(stateResult) {
  if (!stateResult || stateResult.confidence < 0.35) return null;
  
  const adapt = stateResult.adaptations;
  if (!adapt) return null;
  
  return {
    discovery: `${adapt.discovery_budget_percent}%`,
    analysis: `${adapt.analysis_budget_percent}%`,
    action: `${adapt.action_budget_percent}%`,
    review: `${adapt.review_budget_percent}%`,
  };
}
