/**
 * Self-Reinforcement Learning System for Amplifier
 * 
 * This module enables the agent to learn from:
 * - Successful task completions
 * - Failed attempts and their recoveries
 * - User feedback (explicit and implicit)
 * - Tool usage patterns that work well
 * 
 * The learnings are stored and used to improve future tasks.
 */

import { query } from '../../db/connection.js';

// In-memory cache of learnings for fast access
let learningsCache = new Map();
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 300000; // 5 minutes

/**
 * Learning types that the system tracks
 */
export const LearningType = {
  TOOL_PATTERN: 'tool_pattern',        // Successful tool sequences
  ERROR_RECOVERY: 'error_recovery',    // How to recover from errors
  TASK_TEMPLATE: 'task_template',      // Effective task execution patterns
  DOMAIN_KNOWLEDGE: 'domain_knowledge', // Legal/domain-specific learnings
  USER_PREFERENCE: 'user_preference',  // User's preferred workflows
  QUALITY_STANDARD: 'quality_standard', // What constitutes good output
};

/**
 * Extract learnings from a completed task
 */
export async function extractLearnings(task) {
  const learnings = [];
  
  try {
    // 1. Extract successful tool patterns
    const toolPatterns = extractToolPatterns(task);
    for (const pattern of toolPatterns) {
      learnings.push({
        type: LearningType.TOOL_PATTERN,
        content: pattern,
        confidence: calculateConfidence(task, pattern),
        source: 'task_completion',
      });
    }
    
    // 2. Extract error recovery patterns
    const recoveries = extractErrorRecoveries(task);
    for (const recovery of recoveries) {
      learnings.push({
        type: LearningType.ERROR_RECOVERY,
        content: recovery,
        confidence: 0.7,
        source: 'error_handling',
      });
    }
    
    // 3. Extract task template if it was successful
    if (task.status === 'completed' && task.actionsHistory?.length >= 5) {
      const template = extractTaskTemplate(task);
      if (template) {
        learnings.push({
          type: LearningType.TASK_TEMPLATE,
          content: template,
          confidence: task.substantiveActions ? 0.9 : 0.7,
          source: 'successful_task',
        });
      }
    }
    
    // 4. Extract quality standards from highly-rated tasks
    if (task.feedbackRating >= 4) {
      const standards = extractQualityStandards(task);
      for (const standard of standards) {
        learnings.push({
          type: LearningType.QUALITY_STANDARD,
          content: standard,
          confidence: task.feedbackRating / 5,
          source: 'positive_feedback',
        });
      }
    }
    
    // Store learnings
    for (const learning of learnings) {
      await storeLearning(task.firmId, task.userId, learning);
    }
    
    console.log(`[SelfReinforcement] Extracted ${learnings.length} learnings from task ${task.id}`);
    return learnings;
    
  } catch (error) {
    console.error('[SelfReinforcement] Error extracting learnings:', error);
    return [];
  }
}

/**
 * Extract successful tool patterns from task history
 */
function extractToolPatterns(task) {
  const patterns = [];
  const history = task.actionsHistory || [];
  
  if (history.length < 3) return patterns;
  
  // Find sequences of successful tools
  const successfulSequences = [];
  let currentSequence = [];
  
  for (const action of history) {
    if (action.success !== false) {
      currentSequence.push(action.tool);
      if (currentSequence.length >= 3) {
        successfulSequences.push([...currentSequence]);
      }
    } else {
      if (currentSequence.length >= 3) {
        // Save the sequence before the failure
        successfulSequences.push([...currentSequence]);
      }
      currentSequence = [];
    }
  }
  
  // Add the final sequence if long enough
  if (currentSequence.length >= 3) {
    successfulSequences.push(currentSequence);
  }
  
  // Extract unique patterns
  const seenPatterns = new Set();
  for (const seq of successfulSequences) {
    // Get 3-tool subsequences
    for (let i = 0; i <= seq.length - 3; i++) {
      const pattern = seq.slice(i, i + 3).join(' -> ');
      if (!seenPatterns.has(pattern)) {
        seenPatterns.add(pattern);
        patterns.push({
          sequence: seq.slice(i, i + 3),
          context: task.goal?.substring(0, 100),
          frequency: 1,
        });
      }
    }
  }
  
  return patterns;
}

/**
 * Extract error recovery patterns
 */
function extractErrorRecoveries(task) {
  const recoveries = [];
  const history = task.actionsHistory || [];
  
  for (let i = 0; i < history.length - 1; i++) {
    const action = history[i];
    const nextAction = history[i + 1];
    
    // Look for failed action followed by successful alternative
    if (action.success === false && nextAction.success !== false) {
      recoveries.push({
        failedTool: action.tool,
        failedArgs: action.args,
        errorType: action.result?.error?.substring(0, 100) || 'unknown',
        recoveryTool: nextAction.tool,
        recoveryArgs: nextAction.args,
      });
    }
  }
  
  return recoveries;
}

/**
 * Extract a reusable task template
 */
function extractTaskTemplate(task) {
  const history = task.actionsHistory || [];
  if (history.length < 5) return null;
  
  // Identify the key phases
  const phases = {
    discovery: [],
    analysis: [],
    action: [],
    completion: [],
  };
  
  for (const action of history) {
    const tool = action.tool;
    
    if (['get_matter', 'search_matters', 'list_documents', 'read_document_content', 'list_clients'].includes(tool)) {
      phases.discovery.push(tool);
    } else if (['think_and_plan', 'evaluate_progress', 'search_document_content'].includes(tool)) {
      phases.analysis.push(tool);
    } else if (['create_document', 'add_matter_note', 'create_task', 'create_calendar_event', 'update_matter'].includes(tool)) {
      phases.action.push(tool);
    } else if (['task_complete', 'log_work'].includes(tool)) {
      phases.completion.push(tool);
    }
  }
  
  return {
    goalPattern: categorizeGoal(task.goal),
    phases: phases,
    totalSteps: history.length,
    successRate: history.filter(a => a.success !== false).length / history.length,
    substantiveActions: task.substantiveActions || {},
  };
}

/**
 * Categorize a goal into a reusable pattern
 */
function categorizeGoal(goal) {
  const goalLower = goal?.toLowerCase() || '';
  
  if (goalLower.includes('review') || goalLower.includes('analyze')) {
    return 'review_analysis';
  }
  if (goalLower.includes('draft') || goalLower.includes('create document')) {
    return 'document_creation';
  }
  if (goalLower.includes('research') || goalLower.includes('statute')) {
    return 'legal_research';
  }
  if (goalLower.includes('intake') || goalLower.includes('new matter')) {
    return 'matter_intake';
  }
  if (goalLower.includes('billing') || goalLower.includes('invoice')) {
    return 'billing_review';
  }
  if (goalLower.includes('deadline') || goalLower.includes('calendar')) {
    return 'deadline_management';
  }
  if (goalLower.includes('client') || goalLower.includes('communication')) {
    return 'client_communication';
  }
  
  return 'general_task';
}

/**
 * Extract quality standards from highly-rated tasks
 */
function extractQualityStandards(task) {
  const standards = [];
  const history = task.actionsHistory || [];
  
  // Count substantive actions
  const substantiveCount = history.filter(a => 
    ['create_document', 'add_matter_note', 'create_task'].includes(a.tool) &&
    a.success !== false
  ).length;
  
  if (substantiveCount >= 3) {
    standards.push({
      metric: 'substantive_action_count',
      minValue: substantiveCount,
      description: 'Minimum substantive actions for quality output',
    });
  }
  
  // Check for note creation
  const hasNotes = history.some(a => a.tool === 'add_matter_note' && a.success !== false);
  if (hasNotes) {
    standards.push({
      metric: 'includes_notes',
      value: true,
      description: 'Quality tasks include matter notes',
    });
  }
  
  // Check for task creation
  const hasTasks = history.some(a => a.tool === 'create_task' && a.success !== false);
  if (hasTasks) {
    standards.push({
      metric: 'includes_follow_up_tasks',
      value: true,
      description: 'Quality tasks create follow-up items',
    });
  }
  
  return standards;
}

/**
 * Calculate confidence score for a learning
 */
function calculateConfidence(task, pattern) {
  let confidence = 0.5; // Base confidence
  
  // Increase confidence for completed tasks
  if (task.status === 'completed') confidence += 0.2;
  
  // Increase confidence for positive feedback
  if (task.feedbackRating >= 4) confidence += 0.2;
  
  // Increase confidence for longer patterns
  if (pattern.sequence?.length >= 4) confidence += 0.1;
  
  return Math.min(1.0, confidence);
}

/**
 * Store a learning in the database
 */
async function storeLearning(firmId, userId, learning) {
  try {
    await query(`
      INSERT INTO ai_learnings (
        firm_id, user_id, learning_type, content, confidence, source, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (firm_id, learning_type, content_hash)
      DO UPDATE SET
        confidence = GREATEST(ai_learnings.confidence, EXCLUDED.confidence),
        occurrence_count = ai_learnings.occurrence_count + 1,
        updated_at = NOW()
    `, [
      firmId,
      userId,
      learning.type,
      JSON.stringify(learning.content),
      learning.confidence,
      learning.source,
    ]);
  } catch (error) {
    // Table might not exist yet - that's OK
    if (!error.message.includes('ai_learnings')) {
      console.error('[SelfReinforcement] Error storing learning:', error);
    }
  }
}

/**
 * Get relevant learnings for a new task
 */
export async function getLearningsForTask(firmId, userId, goal) {
  const now = Date.now();
  
  // Check cache freshness
  if (now - lastCacheRefresh > CACHE_TTL_MS) {
    await refreshCache(firmId);
  }
  
  const cacheKey = `${firmId}`;
  const allLearnings = learningsCache.get(cacheKey) || [];
  
  // Filter learnings relevant to this goal
  const goalCategory = categorizeGoal(goal);
  const relevantLearnings = allLearnings.filter(learning => {
    // Include high-confidence learnings
    if (learning.confidence >= 0.8) return true;
    
    // Include learnings that match the goal category
    if (learning.content?.goalPattern === goalCategory) return true;
    
    // Include recent learnings from this user
    if (learning.user_id === userId && learning.confidence >= 0.6) return true;
    
    return false;
  });
  
  return relevantLearnings.slice(0, 10); // Limit to top 10
}

/**
 * Refresh the learnings cache from database
 */
async function refreshCache(firmId) {
  try {
    const result = await query(`
      SELECT * FROM ai_learnings
      WHERE firm_id = $1
        AND confidence >= 0.5
      ORDER BY confidence DESC, occurrence_count DESC
      LIMIT 100
    `, [firmId]);
    
    learningsCache.set(`${firmId}`, result.rows);
    lastCacheRefresh = Date.now();
  } catch (error) {
    // Table might not exist - use empty cache
    if (!error.message.includes('ai_learnings')) {
      console.error('[SelfReinforcement] Error refreshing cache:', error);
    }
    learningsCache.set(`${firmId}`, []);
    lastCacheRefresh = Date.now();
  }
}

/**
 * Format learnings as context for the agent prompt
 */
export function formatLearningsForPrompt(learnings) {
  if (!learnings || learnings.length === 0) return '';
  
  const sections = [];
  
  // Group by type
  const byType = {};
  for (const learning of learnings) {
    const type = learning.learning_type || learning.type;
    if (!byType[type]) byType[type] = [];
    byType[type].push(learning);
  }
  
  // Format tool patterns
  if (byType[LearningType.TOOL_PATTERN]) {
    const patterns = byType[LearningType.TOOL_PATTERN]
      .slice(0, 5)
      .map(l => `- ${l.content?.sequence?.join(' → ') || JSON.stringify(l.content)}`);
    if (patterns.length > 0) {
      sections.push(`**Proven Tool Sequences:**\n${patterns.join('\n')}`);
    }
  }
  
  // Format error recoveries
  if (byType[LearningType.ERROR_RECOVERY]) {
    const recoveries = byType[LearningType.ERROR_RECOVERY]
      .slice(0, 3)
      .map(l => `- If ${l.content?.failedTool} fails: try ${l.content?.recoveryTool}`);
    if (recoveries.length > 0) {
      sections.push(`**Error Recovery Strategies:**\n${recoveries.join('\n')}`);
    }
  }
  
  // Format quality standards
  if (byType[LearningType.QUALITY_STANDARD]) {
    const standards = byType[LearningType.QUALITY_STANDARD]
      .slice(0, 3)
      .map(l => `- ${l.content?.description || JSON.stringify(l.content)}`);
    if (standards.length > 0) {
      sections.push(`**Quality Standards (from feedback):**\n${standards.join('\n')}`);
    }
  }
  
  if (sections.length === 0) return '';
  
  return `\n## LEARNED PATTERNS\n\nBased on past successful tasks:\n\n${sections.join('\n\n')}\n`;
}

/**
 * Record user feedback and update learnings
 */
export async function recordFeedback(taskId, firmId, userId, feedback) {
  try {
    const { rating, feedbackText, correction } = feedback;
    
    // Update task with feedback
    await query(`
      UPDATE ai_background_tasks
      SET feedback_rating = $1,
          feedback_text = $2,
          feedback_correction = $3,
          feedback_at = NOW()
      WHERE id = $4
    `, [rating, feedbackText, correction, taskId]);
    
    // If positive feedback, boost confidence of related learnings
    if (rating >= 4) {
      await query(`
        UPDATE ai_learnings
        SET confidence = LEAST(1.0, confidence + 0.1),
            updated_at = NOW()
        WHERE firm_id = $1
          AND user_id = $2
          AND created_at > NOW() - INTERVAL '1 day'
      `, [firmId, userId]);
    }
    
    // If negative feedback with correction, store as new learning
    if (rating <= 2 && correction) {
      await storeLearning(firmId, userId, {
        type: LearningType.USER_PREFERENCE,
        content: {
          originalTask: taskId,
          correction: correction,
          feedbackText: feedbackText,
        },
        confidence: 0.8,
        source: 'negative_feedback',
      });
    }
    
    console.log(`[SelfReinforcement] Recorded feedback for task ${taskId}: rating=${rating}`);
    
  } catch (error) {
    console.error('[SelfReinforcement] Error recording feedback:', error);
  }
}
