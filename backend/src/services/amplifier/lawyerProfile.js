/**
 * Lawyer Profile System
 * 
 * Builds a comprehensive profile for each lawyer that grows smarter over time.
 * This is the key differentiator - no other legal AI does per-lawyer personalization.
 * 
 * The profile includes:
 * - Practice area focus and matter type preferences
 * - Document style preferences (tone, structure, formality)
 * - Common task patterns and workflows
 * - Feedback history (what they liked/didn't like)
 * - Tool usage patterns (what tools they trigger most)
 * - Quality expectations (based on past ratings)
 * 
 * PRIVACY: All data is scoped to user_id + firm_id. Never shared across firms.
 */

import { query } from '../../db/connection.js';

// In-memory profile cache per user
const profileCache = new Map();
const CACHE_TTL_MS = 300000; // 5 minutes

/**
 * Load or build a comprehensive lawyer profile for the given user.
 * This is injected into the agent's system prompt so it knows the lawyer.
 */
export async function getLawyerProfile(userId, firmId) {
  // Check cache
  const cacheKey = `${userId}:${firmId}`;
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.profile;
  }
  
  try {
    const profile = {
      userId,
      firmId,
      practiceAreas: [],
      matterTypeFrequency: {},
      taskPatterns: [],
      avgRating: null,
      totalTasks: 0,
      completedTasks: 0,
      preferredStyle: null,
      commonGoals: [],
      strengthAreas: [],
      recentFeedback: [],
    };
    
    // 1. Get user info
    const userResult = await query(
      `SELECT first_name, last_name, role, hourly_rate FROM users WHERE id = $1`,
      [userId]
    );
    if (userResult.rows[0]) {
      profile.lawyerName = `${userResult.rows[0].first_name} ${userResult.rows[0].last_name}`;
      profile.role = userResult.rows[0].role;
    }
    
    // 2. Analyze their matters to understand practice areas
    const mattersResult = await query(
      `SELECT type, COUNT(*) as count FROM matters 
       WHERE firm_id = $1 AND (responsible_attorney = $2 OR originating_attorney = $2 OR created_by = $2)
       AND type IS NOT NULL
       GROUP BY type ORDER BY count DESC LIMIT 8`,
      [firmId, userId]
    );
    profile.practiceAreas = mattersResult.rows.map(r => r.type);
    profile.matterTypeFrequency = Object.fromEntries(mattersResult.rows.map(r => [r.type, parseInt(r.count)]));
    
    // 3. Analyze past background tasks for patterns
    const tasksResult = await query(
      `SELECT goal, status, feedback_rating, feedback_text,
              EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds
       FROM ai_background_tasks 
       WHERE user_id = $1 AND firm_id = $2 AND status IN ('completed', 'failed')
       ORDER BY created_at DESC LIMIT 20`,
      [userId, firmId]
    );
    
    profile.totalTasks = tasksResult.rows.length;
    profile.completedTasks = tasksResult.rows.filter(t => t.status === 'completed').length;
    
    // Calculate average rating from feedback
    const rated = tasksResult.rows.filter(t => t.feedback_rating);
    if (rated.length > 0) {
      profile.avgRating = rated.reduce((sum, t) => sum + t.feedback_rating, 0) / rated.length;
    }
    
    // Extract common goal patterns
    const goalWords = {};
    for (const task of tasksResult.rows) {
      const words = task.goal.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      for (const word of words) {
        goalWords[word] = (goalWords[word] || 0) + 1;
      }
    }
    profile.commonGoals = Object.entries(goalWords)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
    
    // Extract recent feedback
    profile.recentFeedback = tasksResult.rows
      .filter(t => t.feedback_text)
      .slice(0, 5)
      .map(t => ({
        goal: t.goal.substring(0, 80),
        rating: t.feedback_rating,
        feedback: t.feedback_text.substring(0, 200),
      }));
    
    // 4. Get learned patterns for this user
    const patternsResult = await query(
      `SELECT pattern_type, pattern_data, confidence, occurrences 
       FROM ai_learning_patterns 
       WHERE (user_id = $1 OR (firm_id = $2 AND user_id IS NULL))
       AND confidence > 0.5
       ORDER BY confidence DESC, occurrences DESC 
       LIMIT 10`,
      [userId, firmId]
    );
    profile.taskPatterns = patternsResult.rows.map(r => ({
      type: r.pattern_type,
      data: r.pattern_data,
      confidence: parseFloat(r.confidence),
    }));
    
    // 5. Get document style preferences
    const styleResult = await query(
      `SELECT content FROM ai_learnings 
       WHERE user_id = $1 AND firm_id = $2 AND learning_type = 'user_preference'
       AND confidence > 0.6
       ORDER BY confidence DESC LIMIT 5`,
      [userId, firmId]
    );
    if (styleResult.rows.length > 0) {
      profile.preferredStyle = styleResult.rows.map(r => r.content);
    }
    
    // Cache the profile
    profileCache.set(cacheKey, { profile, timestamp: Date.now() });
    
    return profile;
  } catch (error) {
    console.error('[LawyerProfile] Error building profile:', error.message);
    return null;
  }
}

/**
 * Format the lawyer profile for injection into the agent's system prompt.
 * This is what makes the agent "know" the lawyer.
 */
export function formatProfileForPrompt(profile) {
  if (!profile) return '';
  
  const parts = [`\n## THIS LAWYER'S PROFILE`];
  
  if (profile.lawyerName) {
    parts.push(`You are working for **${profile.lawyerName}** (${profile.role || 'attorney'}).`);
  }
  
  if (profile.practiceAreas.length > 0) {
    parts.push(`**Practice areas:** ${profile.practiceAreas.join(', ')}`);
  }
  
  if (profile.totalTasks > 0) {
    parts.push(`**Task history:** ${profile.completedTasks}/${profile.totalTasks} tasks completed${profile.avgRating ? ` (avg rating: ${profile.avgRating.toFixed(1)}/5)` : ''}`);
  }
  
  if (profile.recentFeedback.length > 0) {
    parts.push(`\n**Recent feedback from this lawyer:**`);
    for (const fb of profile.recentFeedback) {
      parts.push(`- "${fb.feedback}" (${fb.rating ? fb.rating + '/5' : 'no rating'}) on: ${fb.goal}`);
    }
    parts.push(`Use this feedback to improve your work for this lawyer.`);
  }
  
  if (profile.taskPatterns.length > 0) {
    const highConfidence = profile.taskPatterns.filter(p => p.confidence > 0.7);
    if (highConfidence.length > 0) {
      parts.push(`\n**Learned patterns for this lawyer:**`);
      for (const p of highConfidence.slice(0, 5)) {
        const desc = typeof p.data === 'string' ? p.data : 
                     p.data?.description || p.data?.pattern || JSON.stringify(p.data).substring(0, 100);
        parts.push(`- ${p.type}: ${desc} (confidence: ${(p.confidence * 100).toFixed(0)}%)`);
      }
    }
  }
  
  if (profile.preferredStyle && profile.preferredStyle.length > 0) {
    parts.push(`\n**Style preferences:**`);
    for (const style of profile.preferredStyle.slice(0, 3)) {
      const desc = typeof style === 'string' ? style :
                   style?.description || style?.preference || JSON.stringify(style).substring(0, 100);
      parts.push(`- ${desc}`);
    }
  }
  
  return parts.join('\n');
}

/**
 * Update the lawyer profile after a task completes.
 * Extracts patterns and stores them for future use.
 */
export async function updateProfileAfterTask(userId, firmId, task) {
  try {
    // 1. Extract goal pattern
    const goalPattern = categorizeGoal(task.goal);
    if (goalPattern) {
      await upsertLearningPattern(userId, firmId, 'workflow', {
        pattern: goalPattern,
        description: `Common task type: ${goalPattern}`,
        goal_example: task.goal.substring(0, 100),
      });
    }
    
    // 2. Extract successful tool sequences
    const successfulTools = (task.actionsHistory || [])
      .filter(a => a.success)
      .map(a => a.tool);
    
    if (successfulTools.length >= 3) {
      const toolSequence = successfulTools.slice(0, 10).join(' → ');
      await upsertLearningPattern(userId, firmId, 'tool_sequence', {
        pattern: toolSequence,
        description: `Effective tool sequence for: ${goalPattern || 'general task'}`,
        tools_used: successfulTools.length,
      });
    }
    
    // 3. If there's feedback, store it as a preference
    if (task.feedback_rating || task.feedback_text) {
      await storeLearning(userId, firmId, 'user_preference', {
        task_goal: task.goal.substring(0, 100),
        rating: task.feedback_rating,
        feedback: task.feedback_text,
        what_worked: task.feedback_rating >= 4 ? 'positive' : 'needs_improvement',
      }, task.feedback_rating >= 4 ? 0.8 : 0.5);
    }
    
    // Invalidate cache so next task gets fresh profile
    profileCache.delete(`${userId}:${firmId}`);
    
    console.log(`[LawyerProfile] Updated profile for user ${userId} after task`);
  } catch (error) {
    console.error('[LawyerProfile] Error updating profile:', error.message);
  }
}

// ===== HELPERS =====

function categorizeGoal(goal) {
  const goalLower = goal.toLowerCase();
  const categories = [
    { keywords: ['review', 'analyze', 'assessment'], category: 'case_review' },
    { keywords: ['draft', 'write', 'create document', 'memo', 'letter', 'brief'], category: 'document_drafting' },
    { keywords: ['research', 'find', 'search', 'look up'], category: 'legal_research' },
    { keywords: ['billing', 'invoice', 'time entries', 'unbilled'], category: 'billing_review' },
    { keywords: ['new matter', 'intake', 'new case', 'new client'], category: 'matter_intake' },
    { keywords: ['deadline', 'calendar', 'schedule', 'sol', 'statute'], category: 'deadline_management' },
    { keywords: ['close', 'closing', 'settlement', 'resolve'], category: 'matter_closing' },
    { keywords: ['discovery', 'deposition', 'interrogat'], category: 'litigation_support' },
    { keywords: ['contract', 'agreement', 'negotiate'], category: 'contract_work' },
  ];
  
  for (const cat of categories) {
    if (cat.keywords.some(k => goalLower.includes(k))) {
      return cat.category;
    }
  }
  return 'general';
}

async function upsertLearningPattern(userId, firmId, patternType, patternData) {
  try {
    await query(
      `INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_data, confidence, occurrences, level)
       VALUES ($1, $2, $3, $4, 0.6, 1, 'user')
       ON CONFLICT (firm_id, user_id, pattern_type, pattern_data) 
       DO UPDATE SET occurrences = ai_learning_patterns.occurrences + 1,
                     last_used_at = NOW(),
                     updated_at = NOW()`,
      [firmId, userId, patternType, JSON.stringify(patternData)]
    );
  } catch (error) {
    // Table might not exist yet, or conflict clause might not match
    console.log('[LawyerProfile] Pattern upsert note:', error.message);
  }
}

async function storeLearning(userId, firmId, learningType, content, confidence) {
  try {
    await query(
      `INSERT INTO ai_learnings (firm_id, user_id, learning_type, content, confidence, source, occurrence_count)
       VALUES ($1, $2, $3, $4, $5, 'task_feedback', 1)
       ON CONFLICT (firm_id, learning_type, content_hash) 
       DO UPDATE SET occurrence_count = ai_learnings.occurrence_count + 1,
                     confidence = GREATEST(ai_learnings.confidence, $5),
                     updated_at = NOW()`,
      [firmId, userId, learningType, JSON.stringify(content), confidence]
    );
  } catch (error) {
    console.log('[LawyerProfile] Learning store note:', error.message);
  }
}
