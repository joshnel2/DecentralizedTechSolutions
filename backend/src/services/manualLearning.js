/**
 * Manual Learning Service
 * 
 * Captures patterns from manual user actions in the system to improve
 * the AI agent's understanding of how the firm operates.
 * 
 * The agent learns from:
 * - Time entries (billing patterns, descriptions, rates)
 * - Tasks/calendar events (workflow patterns, timing)
 * - Documents (naming conventions, templates used)
 * - Client/matter management (naming, organization)
 * - Note-taking patterns
 */

import { query } from '../db/connection.js';

/**
 * Learn from a manually created time entry
 */
export async function learnFromTimeEntry(timeEntry, userId, firmId) {
  try {
    // Don't learn from AI-generated entries
    if (timeEntry.aiGenerated || timeEntry.entry_type === 'ai_generated') {
      return;
    }

    // Learn billing description patterns
    if (timeEntry.description && timeEntry.description.length > 10) {
      const descPattern = extractDescriptionPattern(timeEntry.description);
      
      await upsertLearningPattern(firmId, userId, 'description_template', 'billing', {
        key: `billing_desc:${descPattern.category}`,
        category: descPattern.category,
        sample: timeEntry.description.substring(0, 200),
        activity_code: timeEntry.activity_code,
        typical_hours: timeEntry.hours,
        billable: timeEntry.billable
      });
    }

    // Learn rate patterns by matter type
    if (timeEntry.matter_id && timeEntry.rate) {
      const matterInfo = await getMatterInfo(timeEntry.matter_id);
      if (matterInfo) {
        await upsertLearningPattern(firmId, userId, 'rate_pattern', 'billing', {
          key: `rate:${matterInfo.matter_type || 'general'}`,
          matter_type: matterInfo.matter_type,
          practice_area: matterInfo.practice_area,
          rate: timeEntry.rate,
          billable: timeEntry.billable
        });
      }
    }

    // Learn activity code usage
    if (timeEntry.activity_code) {
      await upsertLearningPattern(firmId, userId, 'activity_code', 'billing', {
        key: `activity:${timeEntry.activity_code}`,
        code: timeEntry.activity_code,
        avg_hours: timeEntry.hours,
        typical_description: timeEntry.description?.substring(0, 100)
      });
    }

    // Learn timing patterns (when does this user bill)
    const hour = new Date().getHours();
    const timeSlot = hour < 9 ? 'early_morning' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    await upsertLearningPattern(firmId, userId, 'billing_timing', 'workflow', {
      key: `billing_time:${dayOfWeek}:${timeSlot}`,
      day_of_week: dayOfWeek,
      time_slot: timeSlot,
      action: 'time_entry'
    });

  } catch (error) {
    // Silent fail - learning is non-critical
    console.error('[ManualLearning] Time entry learning error:', error.message);
  }
}

/**
 * Learn from a manually created task
 */
export async function learnFromTask(task, userId, firmId) {
  try {
    // Learn task title patterns
    if (task.title) {
      const titlePattern = extractTaskPattern(task.title);
      
      await upsertLearningPattern(firmId, userId, 'task_template', 'tasks', {
        key: `task:${titlePattern.type}`,
        type: titlePattern.type,
        sample_title: task.title,
        has_due_date: !!task.due_date,
        priority: task.priority,
        typical_duration_days: calculateDurationDays(task)
      });
    }

    // Learn priority usage patterns
    if (task.priority) {
      await upsertLearningPattern(firmId, userId, 'priority_usage', 'tasks', {
        key: `priority:${task.priority}`,
        priority: task.priority,
        task_type: extractTaskPattern(task.title).type
      });
    }

    // Learn task scheduling patterns (how far out do they schedule)
    if (task.due_date || task.start_time) {
      const dueDate = new Date(task.due_date || task.start_time);
      const daysAhead = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
      
      await upsertLearningPattern(firmId, userId, 'scheduling_pattern', 'tasks', {
        key: `schedule:${task.priority || 'medium'}`,
        priority: task.priority || 'medium',
        avg_days_ahead: Math.max(0, daysAhead)
      });
    }

  } catch (error) {
    console.error('[ManualLearning] Task learning error:', error.message);
  }
}

/**
 * Learn from a manually created calendar event
 */
export async function learnFromCalendarEvent(event, userId, firmId) {
  try {
    // Learn event type patterns
    if (event.type && event.title) {
      await upsertLearningPattern(firmId, userId, 'event_template', 'calendar', {
        key: `event:${event.type}`,
        type: event.type,
        sample_title: event.title,
        has_location: !!event.location,
        has_attendees: event.attendees && event.attendees.length > 0,
        typical_duration_hours: calculateEventDuration(event)
      });
    }

    // Learn meeting duration patterns
    if (event.type === 'meeting' || event.type === 'hearing' || event.type === 'deposition') {
      const duration = calculateEventDuration(event);
      
      await upsertLearningPattern(firmId, userId, 'duration_pattern', 'calendar', {
        key: `duration:${event.type}`,
        event_type: event.type,
        avg_hours: duration
      });
    }

    // Learn scheduling lead time
    if (event.start_time) {
      const startDate = new Date(event.start_time);
      const daysAhead = Math.ceil((startDate - new Date()) / (1000 * 60 * 60 * 24));
      
      await upsertLearningPattern(firmId, userId, 'event_lead_time', 'calendar', {
        key: `lead:${event.type || 'event'}`,
        event_type: event.type || 'event',
        avg_days_ahead: Math.max(0, daysAhead)
      });
    }

  } catch (error) {
    console.error('[ManualLearning] Calendar event learning error:', error.message);
  }
}

/**
 * Learn from a manually uploaded/created document
 */
export async function learnFromDocument(document, userId, firmId) {
  try {
    // Learn document naming patterns
    if (document.name || document.original_name) {
      const name = document.original_name || document.name;
      const namingPattern = extractDocumentNamingPattern(name);
      
      await upsertLearningPattern(firmId, userId, 'document_naming', 'documents', {
        key: `docname:${namingPattern.category}`,
        category: namingPattern.category,
        pattern: namingPattern.pattern,
        sample: name,
        document_type: document.document_type || document.category
      });
    }

    // Learn document type usage
    if (document.document_type || document.category) {
      const docType = document.document_type || document.category;
      
      await upsertLearningPattern(firmId, userId, 'document_type_usage', 'documents', {
        key: `doctype:${docType}`,
        document_type: docType,
        extension: getFileExtension(document.name || document.original_name)
      });
    }

    // Learn folder organization patterns
    if (document.folder_id || document.folder_path) {
      await upsertLearningPattern(firmId, userId, 'folder_organization', 'documents', {
        key: `folder:${document.document_type || 'general'}`,
        document_type: document.document_type || 'general',
        has_folder: true
      });
    }

  } catch (error) {
    console.error('[ManualLearning] Document learning error:', error.message);
  }
}

/**
 * Learn from a manually created matter
 */
export async function learnFromMatter(matter, userId, firmId) {
  try {
    // Learn matter naming conventions
    if (matter.name) {
      const namingPattern = extractMatterNamingPattern(matter.name);
      
      await upsertLearningPattern(firmId, userId, 'matter_naming', 'matters', {
        key: `matter:${matter.matter_type || 'general'}`,
        matter_type: matter.matter_type,
        pattern: namingPattern.pattern,
        sample: matter.name,
        uses_number: !!matter.number,
        uses_client_name: namingPattern.uses_client_name
      });
    }

    // Learn billing rate preferences
    if (matter.billing_rate) {
      await upsertLearningPattern(firmId, userId, 'matter_rate', 'billing', {
        key: `matterrate:${matter.matter_type || 'general'}`,
        matter_type: matter.matter_type,
        practice_area: matter.practice_area,
        rate: matter.billing_rate,
        billing_type: matter.billing_type
      });
    }

  } catch (error) {
    console.error('[ManualLearning] Matter learning error:', error.message);
  }
}

/**
 * Learn from a manually created note
 */
export async function learnFromNote(note, matterId, userId, firmId) {
  try {
    // Learn note content patterns
    if (note.content && note.content.length > 20) {
      const notePattern = extractNotePattern(note.content);
      
      await upsertLearningPattern(firmId, userId, 'note_pattern', 'notes', {
        key: `note:${notePattern.type}`,
        type: notePattern.type,
        avg_length: note.content.length,
        uses_bullets: notePattern.uses_bullets,
        uses_headers: notePattern.uses_headers,
        sample_start: note.content.substring(0, 100)
      });
    }

    // Learn note type usage
    if (note.note_type) {
      await upsertLearningPattern(firmId, userId, 'note_type_usage', 'notes', {
        key: `notetype:${note.note_type}`,
        note_type: note.note_type
      });
    }

  } catch (error) {
    console.error('[ManualLearning] Note learning error:', error.message);
  }
}

/**
 * Learn from workflow - sequence of manual actions
 */
export async function learnFromWorkflowSequence(actions, userId, firmId) {
  try {
    if (actions.length < 2) return;

    // Only learn sequences of 2-5 actions
    const sequence = actions.slice(-5).map(a => a.action).join(' -> ');
    
    await upsertLearningPattern(firmId, userId, 'manual_workflow', 'workflow', {
      key: `workflow:${sequence}`,
      sequence,
      actions: actions.slice(-5),
      context: actions[0]?.context
    });

  } catch (error) {
    console.error('[ManualLearning] Workflow learning error:', error.message);
  }
}

// ============ Helper Functions ============

/**
 * Extract pattern from time entry description
 */
function extractDescriptionPattern(description) {
  const lowerDesc = description.toLowerCase();
  
  // Categorize by keywords
  if (lowerDesc.includes('draft') || lowerDesc.includes('prepare')) {
    return { category: 'drafting' };
  }
  if (lowerDesc.includes('review') || lowerDesc.includes('analyze')) {
    return { category: 'review' };
  }
  if (lowerDesc.includes('research') || lowerDesc.includes('investigate')) {
    return { category: 'research' };
  }
  if (lowerDesc.includes('call') || lowerDesc.includes('telephone') || lowerDesc.includes('conference')) {
    return { category: 'communication' };
  }
  if (lowerDesc.includes('email') || lowerDesc.includes('correspond')) {
    return { category: 'correspondence' };
  }
  if (lowerDesc.includes('meeting') || lowerDesc.includes('attend')) {
    return { category: 'meeting' };
  }
  if (lowerDesc.includes('court') || lowerDesc.includes('hearing') || lowerDesc.includes('appear')) {
    return { category: 'court' };
  }
  if (lowerDesc.includes('negotiate') || lowerDesc.includes('settlement')) {
    return { category: 'negotiation' };
  }
  if (lowerDesc.includes('file') || lowerDesc.includes('filing')) {
    return { category: 'filing' };
  }
  
  return { category: 'general' };
}

/**
 * Extract pattern from task title
 */
function extractTaskPattern(title) {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('file') || lowerTitle.includes('filing')) {
    return { type: 'filing' };
  }
  if (lowerTitle.includes('deadline') || lowerTitle.includes('due')) {
    return { type: 'deadline' };
  }
  if (lowerTitle.includes('draft') || lowerTitle.includes('prepare')) {
    return { type: 'drafting' };
  }
  if (lowerTitle.includes('review')) {
    return { type: 'review' };
  }
  if (lowerTitle.includes('call') || lowerTitle.includes('contact')) {
    return { type: 'communication' };
  }
  if (lowerTitle.includes('meeting') || lowerTitle.includes('schedule')) {
    return { type: 'meeting' };
  }
  if (lowerTitle.includes('follow up') || lowerTitle.includes('follow-up')) {
    return { type: 'followup' };
  }
  if (lowerTitle.includes('research')) {
    return { type: 'research' };
  }
  
  return { type: 'general' };
}

/**
 * Extract document naming pattern
 */
function extractDocumentNamingPattern(name) {
  // Check for common patterns
  const hasDate = /\d{4}[-_]\d{2}[-_]\d{2}|\d{2}[-_]\d{2}[-_]\d{4}/.test(name);
  const hasVersion = /v\d+|version\s*\d+|draft\s*\d+/i.test(name);
  const hasClientName = name.includes(' - ') || name.includes('_');
  
  let category = 'simple';
  if (hasDate && hasVersion) {
    category = 'dated_versioned';
  } else if (hasDate) {
    category = 'dated';
  } else if (hasVersion) {
    category = 'versioned';
  } else if (hasClientName) {
    category = 'descriptive';
  }
  
  return { 
    category, 
    pattern: `${hasDate ? '[DATE]_' : ''}${hasClientName ? '[CLIENT]_' : ''}[NAME]${hasVersion ? '_v[N]' : ''}` 
  };
}

/**
 * Extract matter naming pattern
 */
function extractMatterNamingPattern(name) {
  const hasVsPattern = /\s+v\.?\s+|\s+vs\.?\s+/i.test(name);
  const hasRePattern = /^(re:|in\s+re:)/i.test(name);
  const hasClientName = name.includes(' - ');
  
  let pattern = 'simple';
  if (hasVsPattern) {
    pattern = '[PARTY1] v. [PARTY2]';
  } else if (hasRePattern) {
    pattern = 'Re: [DESCRIPTION]';
  } else if (hasClientName) {
    pattern = '[CLIENT] - [DESCRIPTION]';
  }
  
  return { pattern, uses_client_name: hasClientName || hasVsPattern };
}

/**
 * Extract note content pattern
 */
function extractNotePattern(content) {
  const usesBullets = /^[\s]*[-*•]\s/m.test(content);
  const usesHeaders = /^#+\s|^[A-Z][A-Za-z\s]+:\s*$/m.test(content);
  const usesNumbering = /^\d+\.\s/m.test(content);
  
  let type = 'prose';
  if (usesBullets || usesNumbering) {
    type = 'list';
  }
  if (usesHeaders) {
    type = usesBullets ? 'structured' : 'headed';
  }
  
  return { type, uses_bullets: usesBullets, uses_headers: usesHeaders };
}

/**
 * Get file extension
 */
function getFileExtension(filename) {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * Calculate duration in days between creation and due date
 */
function calculateDurationDays(task) {
  if (!task.due_date && !task.start_time) return null;
  const dueDate = new Date(task.due_date || task.start_time);
  const created = task.created_at ? new Date(task.created_at) : new Date();
  return Math.ceil((dueDate - created) / (1000 * 60 * 60 * 24));
}

/**
 * Calculate event duration in hours
 */
function calculateEventDuration(event) {
  if (!event.start_time || !event.end_time) return 1; // default 1 hour
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  return Math.max(0.5, (end - start) / (1000 * 60 * 60));
}

/**
 * Get matter info for context
 */
async function getMatterInfo(matterId) {
  try {
    const result = await query(
      'SELECT matter_type, practice_area FROM matters WHERE id = $1',
      [matterId]
    );
    return result.rows[0] || null;
  } catch (error) {
    return null;
  }
}

/**
 * Upsert a learning pattern
 */
async function upsertLearningPattern(firmId, userId, patternType, category, patternData) {
  const patternKey = patternData.key;
  
  try {
    // Check if pattern exists
    const existing = await query(`
      SELECT id, occurrences, pattern_data 
      FROM ai_learning_patterns
      WHERE firm_id = $1 AND user_id = $2 AND pattern_type = $3 AND pattern_data->>'key' = $4
    `, [firmId, userId, patternType, patternKey]);
    
    if (existing.rows.length > 0) {
      // Update existing pattern - merge data and increment occurrences
      const existingData = existing.rows[0].pattern_data;
      const mergedData = mergePatternData(existingData, patternData);
      
      await query(`
        UPDATE ai_learning_patterns 
        SET occurrences = occurrences + 1, 
            last_used_at = NOW(),
            pattern_data = $2::jsonb,
            confidence = LEAST(0.95, confidence + 0.01)
        WHERE id = $1
      `, [existing.rows[0].id, JSON.stringify(mergedData)]);
    } else {
      // Create new pattern
      await query(`
        INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data, confidence)
        VALUES ($1, $2, $3, $4, $5, 0.4)
      `, [firmId, userId, patternType, category, JSON.stringify(patternData)]);
    }
  } catch (error) {
    // Log but don't throw - learning is non-critical
    console.error('[ManualLearning] Pattern upsert error:', error.message);
  }
}

/**
 * Merge pattern data, averaging numeric fields
 */
function mergePatternData(existing, newData) {
  const merged = { ...existing };
  
  for (const [key, value] of Object.entries(newData)) {
    if (typeof value === 'number' && typeof existing[key] === 'number') {
      // Average numeric values
      merged[key] = (existing[key] + value) / 2;
    } else if (key !== 'key') {
      // For non-numeric, keep the newer value
      merged[key] = value;
    }
  }
  
  return merged;
}

export default {
  learnFromTimeEntry,
  learnFromTask,
  learnFromCalendarEvent,
  learnFromDocument,
  learnFromMatter,
  learnFromNote,
  learnFromWorkflowSequence
};
