/**
 * Learning Service
 * 
 * Captures and learns from all user interactions:
 * - Normal AI chat conversations
 * - AI tool usage patterns
 * - Document edits and changes
 * - Site navigation and interactions
 * - Billing patterns
 * - Calendar management patterns
 */

import { query } from '../db/connection.js';

// Create a db-like wrapper for consistency
const db = { query };

/**
 * Pattern types for learning
 */
export const PATTERN_TYPES = {
  // Communication patterns
  CHAT_STYLE: 'chat_style',
  RESPONSE_PREFERENCE: 'response_preference',
  QUESTION_PATTERN: 'question_pattern',
  
  // Document patterns
  DOCUMENT_EDIT: 'document_edit',
  DOCUMENT_STRUCTURE: 'document_structure',
  WRITING_STYLE: 'writing_style',
  TERMINOLOGY: 'terminology',
  
  // Tool usage patterns
  TOOL_PREFERENCE: 'tool_preference',
  TOOL_SEQUENCE: 'tool_sequence',
  TOOL_PARAMETERS: 'tool_parameters',
  
  // Billing patterns
  TIME_ENTRY_STYLE: 'time_entry_style',
  BILLING_RATE: 'billing_rate',
  ACTIVITY_CODING: 'activity_coding',
  
  // Calendar patterns
  SCHEDULING_PREFERENCE: 'scheduling_preference',
  MEETING_DURATION: 'meeting_duration',
  REMINDER_TIMING: 'reminder_timing',
  
  // Matter management
  MATTER_ORGANIZATION: 'matter_organization',
  TASK_PRIORITY: 'task_priority',
  DEADLINE_HANDLING: 'deadline_handling',
  
  // Site interaction
  NAVIGATION_PATTERN: 'navigation_pattern',
  FEATURE_USAGE: 'feature_usage',
  WORKFLOW_SEQUENCE: 'workflow_sequence'
};

/**
 * Record a learning pattern from user interaction
 */
export async function recordPattern(userId, firmId, patternType, patternData, source = 'user_action', context = {}) {
  try {
    // Check if similar pattern already exists
    const existingPattern = await db.query(`
      SELECT id, confidence, occurrence_count, pattern_data
      FROM ai_learning_patterns
      WHERE user_id = $1 
        AND firm_id = $2 
        AND pattern_type = $3 
        AND pattern_data @> $4::jsonb
      LIMIT 1
    `, [userId, firmId, patternType, JSON.stringify(patternData)]);

    if (existingPattern.rows.length > 0) {
      // Update existing pattern - increase confidence and count
      const existing = existingPattern.rows[0];
      const newCount = (existing.occurrence_count || 1) + 1;
      const newConfidence = Math.min(0.95, existing.confidence + 0.05);

      await db.query(`
        UPDATE ai_learning_patterns
        SET occurrence_count = $1,
            confidence = $2,
            updated_at = NOW(),
            context = context || $3::jsonb
        WHERE id = $4
      `, [newCount, newConfidence, JSON.stringify(context), existing.id]);

      return { updated: true, patternId: existing.id };
    } else {
      // Create new pattern
      const result = await db.query(`
        INSERT INTO ai_learning_patterns (
          firm_id, user_id, pattern_type, pattern_data, source, context, confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [firmId, userId, patternType, JSON.stringify(patternData), source, JSON.stringify(context), 0.3]);

      return { created: true, patternId: result.rows[0].id };
    }
  } catch (error) {
    console.error('Error recording pattern:', error);
    return { error: error.message };
  }
}

/**
 * Learn from a normal AI chat conversation
 */
export async function learnFromChatConversation(userId, firmId, messages, response, toolsUsed = []) {
  const patterns = [];

  try {
    // Analyze user's question style
    const userMessages = messages.filter(m => m.role === 'user');
    for (const msg of userMessages) {
      const content = msg.content || '';
      
      // Detect question patterns
      if (content.includes('?')) {
        const questionType = detectQuestionType(content);
        patterns.push(await recordPattern(
          userId, firmId,
          PATTERN_TYPES.QUESTION_PATTERN,
          { type: questionType, example: content.slice(0, 200) },
          'ai_chat',
          { messageCount: messages.length }
        ));
      }

      // Detect terminology preferences
      const legalTerms = extractLegalTerms(content);
      for (const term of legalTerms) {
        patterns.push(await recordPattern(
          userId, firmId,
          PATTERN_TYPES.TERMINOLOGY,
          { term, context: 'chat' },
          'ai_chat'
        ));
      }
    }

    // Learn from tools used
    if (toolsUsed.length > 0) {
      // Record tool preferences
      for (const tool of toolsUsed) {
        patterns.push(await recordPattern(
          userId, firmId,
          PATTERN_TYPES.TOOL_PREFERENCE,
          { tool: tool.name, frequency: 1 },
          'ai_chat',
          { parameters: tool.parameters }
        ));
      }

      // Record tool sequences
      if (toolsUsed.length > 1) {
        patterns.push(await recordPattern(
          userId, firmId,
          PATTERN_TYPES.TOOL_SEQUENCE,
          { sequence: toolsUsed.map(t => t.name) },
          'ai_chat'
        ));
      }
    }

    // Analyze response preferences based on user follow-ups
    if (userMessages.length > 1) {
      const hasFollowUp = userMessages.some(m => 
        m.content.toLowerCase().includes('more detail') ||
        m.content.toLowerCase().includes('explain') ||
        m.content.toLowerCase().includes('can you')
      );
      
      patterns.push(await recordPattern(
        userId, firmId,
        PATTERN_TYPES.RESPONSE_PREFERENCE,
        { prefers_detail: hasFollowUp },
        'ai_chat'
      ));
    }

  } catch (error) {
    console.error('Error learning from chat:', error);
  }

  return patterns;
}

/**
 * Learn from document edits
 */
export async function learnFromDocumentEdit(userId, firmId, documentId, beforeContent, afterContent, documentType = 'unknown') {
  const patterns = [];

  try {
    // Analyze the changes
    const changes = analyzeDocumentChanges(beforeContent, afterContent);

    // Learn writing style preferences
    if (changes.styleChanges.length > 0) {
      for (const style of changes.styleChanges) {
        patterns.push(await recordPattern(
          userId, firmId,
          PATTERN_TYPES.WRITING_STYLE,
          { 
            documentType,
            change: style.type,
            from: style.from,
            to: style.to
          },
          'document_edit',
          { documentId }
        ));
      }
    }

    // Learn document structure preferences
    if (changes.structureChanges.length > 0) {
      patterns.push(await recordPattern(
        userId, firmId,
        PATTERN_TYPES.DOCUMENT_STRUCTURE,
        {
          documentType,
          preferredStructure: changes.structureChanges
        },
        'document_edit',
        { documentId }
      ));
    }

    // Learn terminology corrections
    if (changes.termChanges.length > 0) {
      for (const term of changes.termChanges) {
        patterns.push(await recordPattern(
          userId, firmId,
          PATTERN_TYPES.TERMINOLOGY,
          {
            avoid: term.from,
            prefer: term.to,
            context: documentType
          },
          'document_edit',
          { documentId }
        ));
      }
    }

    // Record overall edit pattern
    patterns.push(await recordPattern(
      userId, firmId,
      PATTERN_TYPES.DOCUMENT_EDIT,
      {
        documentType,
        changeCount: changes.totalChanges,
        addedLines: changes.addedLines,
        removedLines: changes.removedLines
      },
      'document_edit',
      { documentId }
    ));

  } catch (error) {
    console.error('Error learning from document edit:', error);
  }

  return patterns;
}

/**
 * Learn from time entry patterns
 */
export async function learnFromTimeEntry(userId, firmId, timeEntry) {
  const patterns = [];

  try {
    // Analyze time entry style
    patterns.push(await recordPattern(
      userId, firmId,
      PATTERN_TYPES.TIME_ENTRY_STYLE,
      {
        descriptionLength: timeEntry.description?.length || 0,
        usesActionVerbs: /^(Reviewed?|Draft(?:ed)?|Analyz(?:ed)?|Prepar(?:ed)?|Research(?:ed)?)/i.test(timeEntry.description),
        includesQuantity: /\(\d+\s*page|hour|\d+\s*document/i.test(timeEntry.description),
        hasClientContext: /client|matter|re:/i.test(timeEntry.description)
      },
      'time_entry',
      { hours: timeEntry.hours, activityCode: timeEntry.activity_code }
    ));

    // Learn activity coding patterns
    if (timeEntry.activity_code) {
      patterns.push(await recordPattern(
        userId, firmId,
        PATTERN_TYPES.ACTIVITY_CODING,
        {
          activityCode: timeEntry.activity_code,
          keywords: extractKeywords(timeEntry.description)
        },
        'time_entry'
      ));
    }

  } catch (error) {
    console.error('Error learning from time entry:', error);
  }

  return patterns;
}

/**
 * Learn from calendar/scheduling patterns
 */
export async function learnFromCalendarEvent(userId, firmId, event, action = 'created') {
  const patterns = [];

  try {
    // Learn meeting duration preferences
    if (event.duration_minutes) {
      patterns.push(await recordPattern(
        userId, firmId,
        PATTERN_TYPES.MEETING_DURATION,
        {
          eventType: event.event_type || 'meeting',
          durationMinutes: event.duration_minutes
        },
        'calendar',
        { action }
      ));
    }

    // Learn scheduling time preferences
    if (event.start_time) {
      const startHour = new Date(event.start_time).getHours();
      patterns.push(await recordPattern(
        userId, firmId,
        PATTERN_TYPES.SCHEDULING_PREFERENCE,
        {
          preferredHour: startHour,
          dayOfWeek: new Date(event.start_time).getDay()
        },
        'calendar',
        { eventType: event.event_type }
      ));
    }

    // Learn reminder preferences
    if (event.reminder_minutes) {
      patterns.push(await recordPattern(
        userId, firmId,
        PATTERN_TYPES.REMINDER_TIMING,
        {
          reminderMinutes: event.reminder_minutes,
          eventType: event.event_type || 'meeting'
        },
        'calendar'
      ));
    }

  } catch (error) {
    console.error('Error learning from calendar event:', error);
  }

  return patterns;
}

/**
 * Learn from site navigation/interaction
 */
export async function learnFromSiteInteraction(userId, firmId, interaction) {
  const patterns = [];

  try {
    const { action, page, feature, data } = interaction;

    // Learn navigation patterns
    if (action === 'navigate') {
      patterns.push(await recordPattern(
        userId, firmId,
        PATTERN_TYPES.NAVIGATION_PATTERN,
        {
          from: data?.from,
          to: page,
          frequency: 1
        },
        'site_interaction'
      ));
    }

    // Learn feature usage
    if (action === 'use_feature') {
      patterns.push(await recordPattern(
        userId, firmId,
        PATTERN_TYPES.FEATURE_USAGE,
        {
          feature: feature,
          page: page,
          frequency: 1
        },
        'site_interaction',
        data
      ));
    }

    // Learn workflow sequences
    if (action === 'workflow_step') {
      patterns.push(await recordPattern(
        userId, firmId,
        PATTERN_TYPES.WORKFLOW_SEQUENCE,
        {
          workflowName: data?.workflow,
          step: data?.step,
          stepOrder: data?.stepOrder
        },
        'site_interaction'
      ));
    }

  } catch (error) {
    console.error('Error learning from site interaction:', error);
  }

  return patterns;
}

/**
 * Get all learned patterns for a user
 */
export async function getUserPatterns(userId, firmId, options = {}) {
  const { patternTypes, minConfidence = 0.2, limit = 100 } = options;

  let sql = `
    SELECT *
    FROM ai_learning_patterns
    WHERE user_id = $1 AND firm_id = $2 AND confidence >= $3
  `;
  const params = [userId, firmId, minConfidence];

  if (patternTypes && patternTypes.length > 0) {
    sql += ` AND pattern_type = ANY($4)`;
    params.push(patternTypes);
  }

  sql += ` ORDER BY confidence DESC, updated_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await db.query(sql, params);
  return result.rows;
}

/**
 * Get firm-wide patterns (aggregated from all users)
 */
export async function getFirmPatterns(firmId, options = {}) {
  const { patternTypes, minConfidence = 0.5, limit = 50 } = options;

  let sql = `
    SELECT 
      pattern_type,
      pattern_data,
      AVG(confidence) as avg_confidence,
      SUM(occurrence_count) as total_occurrences,
      COUNT(DISTINCT user_id) as user_count
    FROM ai_learning_patterns
    WHERE firm_id = $1 AND confidence >= $2
  `;
  const params = [firmId, minConfidence];

  if (patternTypes && patternTypes.length > 0) {
    sql += ` AND pattern_type = ANY($3)`;
    params.push(patternTypes);
  }

  sql += ` 
    GROUP BY pattern_type, pattern_data
    HAVING COUNT(DISTINCT user_id) >= 2
    ORDER BY total_occurrences DESC
    LIMIT $${params.length + 1}
  `;
  params.push(limit);

  const result = await db.query(sql, params);
  return result.rows;
}

/**
 * Helper: Detect type of question
 */
function detectQuestionType(content) {
  content = content.toLowerCase();
  if (content.includes('how do i') || content.includes('how to')) return 'how_to';
  if (content.includes('what is') || content.includes('what are')) return 'definition';
  if (content.includes('can you') || content.includes('could you')) return 'request';
  if (content.includes('why')) return 'explanation';
  if (content.includes('when')) return 'timing';
  if (content.includes('where')) return 'location';
  if (content.includes('should i') || content.includes('should we')) return 'advice';
  return 'general';
}

/**
 * Helper: Extract legal terminology from text
 */
function extractLegalTerms(content) {
  const legalTerms = [
    'plaintiff', 'defendant', 'counsel', 'motion', 'discovery', 'deposition',
    'brief', 'memorandum', 'statute', 'jurisdiction', 'venue', 'subpoena',
    'interrogatory', 'affidavit', 'pleading', 'stipulation', 'continuance',
    'settlement', 'arbitration', 'mediation', 'litigation', 'retainer',
    'engagement', 'privilege', 'confidential', 'fiduciary', 'negligence',
    'breach', 'damages', 'injunction', 'restraining order', 'summary judgment'
  ];

  const found = [];
  const lowerContent = content.toLowerCase();
  
  for (const term of legalTerms) {
    if (lowerContent.includes(term)) {
      found.push(term);
    }
  }
  
  return found;
}

/**
 * Helper: Extract keywords from text
 */
function extractKeywords(text) {
  if (!text) return [];
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);
  
  const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'their', 'will', 'would', 'could', 'should']);
  return words.filter(w => !stopWords.has(w)).slice(0, 10);
}

/**
 * Helper: Analyze document changes
 */
function analyzeDocumentChanges(before, after) {
  const beforeLines = (before || '').split('\n');
  const afterLines = (after || '').split('\n');

  const result = {
    totalChanges: 0,
    addedLines: 0,
    removedLines: 0,
    styleChanges: [],
    structureChanges: [],
    termChanges: []
  };

  // Simple diff analysis
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  for (const line of afterLines) {
    if (!beforeSet.has(line)) {
      result.addedLines++;
      result.totalChanges++;
    }
  }

  for (const line of beforeLines) {
    if (!afterSet.has(line)) {
      result.removedLines++;
      result.totalChanges++;
    }
  }

  // Detect style changes (capitalization, formatting)
  const beforeLower = (before || '').toLowerCase();
  const afterLower = (after || '').toLowerCase();
  
  // Check for passive to active voice changes
  const passiveBefore = (before || '').match(/\bwas\s+\w+ed\b/gi) || [];
  const passiveAfter = (after || '').match(/\bwas\s+\w+ed\b/gi) || [];
  if (passiveAfter.length < passiveBefore.length) {
    result.styleChanges.push({ type: 'active_voice', from: 'passive', to: 'active' });
  }

  // Check for formality changes
  const informalBefore = (before || '').match(/\b(gonna|wanna|kinda|gotta)\b/gi) || [];
  const informalAfter = (after || '').match(/\b(gonna|wanna|kinda|gotta)\b/gi) || [];
  if (informalAfter.length < informalBefore.length) {
    result.styleChanges.push({ type: 'formality', from: 'informal', to: 'formal' });
  }

  return result;
}

export default {
  PATTERN_TYPES,
  recordPattern,
  learnFromChatConversation,
  learnFromDocumentEdit,
  learnFromTimeEntry,
  learnFromCalendarEvent,
  learnFromSiteInteraction,
  getUserPatterns,
  getFirmPatterns
};
