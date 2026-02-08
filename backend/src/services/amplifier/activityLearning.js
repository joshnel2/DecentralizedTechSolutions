/**
 * Activity Learning - Learn from EVERYTHING the lawyer does
 * 
 * This module closes the biggest learning gap: the agent only learned from
 * its own task executions and UI interactions, but NOT from the lawyer's
 * actual legal work (creating matters, uploading documents, logging time,
 * creating tasks, sending invoices, etc.)
 * 
 * It works by:
 * 1. Reading recent activity from audit_logs + direct DB queries
 * 2. Extracting patterns (what types of matters they create, how they name
 *    documents, when they do billing, what tasks they create, etc.)
 * 3. Storing these as learning patterns that the agent uses
 * 
 * This runs periodically (every 15 minutes) and on-demand when a background
 * task starts, so the agent always has fresh knowledge of what the lawyer
 * has been doing.
 * 
 * PRIVACY: All data is scoped to (firm_id, user_id). Patterns are aggregated
 * (e.g., "creates 3 tasks per matter on average") not raw data.
 */

import { query } from '../../db/connection.js';

// Cache to avoid redundant DB reads
const activityCache = new Map();
const CACHE_TTL_MS = 900000; // 15 minutes

/**
 * Learn from a lawyer's recent activity.
 * Called at background task start to give the agent fresh context.
 * 
 * Returns a formatted string for the system prompt.
 */
export async function getRecentActivityContext(userId, firmId) {
  const cacheKey = `${firmId}:${userId}`;
  const cached = activityCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.context;
  }
  
  try {
    const context = await buildActivityContext(userId, firmId);
    activityCache.set(cacheKey, { context, timestamp: Date.now() });
    return context;
  } catch (e) {
    console.error('[ActivityLearning] Error building context:', e.message);
    return null;
  }
}

/**
 * Build activity context from the lawyer's recent work.
 */
async function buildActivityContext(userId, firmId) {
  const sections = [];
  
  // 1. Recent matters the lawyer is working on (last 7 days)
  try {
    const recentMatters = await query(`
      SELECT m.name, m.status, m.type, m.updated_at,
             (SELECT COUNT(*) FROM documents d WHERE d.matter_id = m.id AND d.uploaded_at > NOW() - INTERVAL '7 days') as recent_docs,
             (SELECT COUNT(*) FROM matter_notes mn WHERE mn.matter_id = m.id AND mn.created_at > NOW() - INTERVAL '7 days') as recent_notes
      FROM matters m
      WHERE m.firm_id = $1 
        AND (m.responsible_attorney = $2 OR m.created_by = $2 OR m.originating_attorney = $2)
        AND m.updated_at > NOW() - INTERVAL '7 days'
      ORDER BY m.updated_at DESC
      LIMIT 5
    `, [firmId, userId]);
    
    if (recentMatters.rows.length > 0) {
      const matterLines = recentMatters.rows.map(m => 
        `- ${m.name} (${m.status}, ${m.type || 'general'})${m.recent_docs > 0 ? ` - ${m.recent_docs} new docs` : ''}${m.recent_notes > 0 ? ` - ${m.recent_notes} new notes` : ''}`
      );
      sections.push(`**Recently Active Matters:** (last 7 days)\n${matterLines.join('\n')}`);
    }
  } catch (_) {}
  
  // 2. Recent document uploads (what types, what matters)
  try {
    const recentDocs = await query(`
      SELECT d.original_name, d.type, m.name as matter_name, d.uploaded_at
      FROM documents d
      LEFT JOIN matters m ON d.matter_id = m.id
      WHERE d.firm_id = $1 AND d.uploaded_by = $2
        AND d.uploaded_at > NOW() - INTERVAL '7 days'
      ORDER BY d.uploaded_at DESC
      LIMIT 8
    `, [firmId, userId]);
    
    if (recentDocs.rows.length > 0) {
      const docLines = recentDocs.rows.map(d => 
        `- "${d.original_name}" (${d.type || 'unknown'})${d.matter_name ? ` → ${d.matter_name}` : ''}`
      );
      sections.push(`**Recently Uploaded Documents:**\n${docLines.join('\n')}`);
    }
  } catch (_) {}
  
  // 3. Recent time entries (what kind of work they bill for)
  try {
    const recentTime = await query(`
      SELECT te.description, te.hours, te.billable, m.name as matter_name, te.date
      FROM time_entries te
      LEFT JOIN matters m ON te.matter_id = m.id
      WHERE te.firm_id = $1 AND te.user_id = $2
        AND te.date > NOW() - INTERVAL '7 days'
      ORDER BY te.date DESC
      LIMIT 8
    `, [firmId, userId]);
    
    if (recentTime.rows.length > 0) {
      const totalHours = recentTime.rows.reduce((sum, t) => sum + parseFloat(t.hours || 0), 0);
      const timeLines = recentTime.rows.slice(0, 5).map(t => 
        `- ${t.hours}h${t.billable ? '' : ' (non-bill)'}: "${(t.description || '').substring(0, 60)}" → ${t.matter_name || 'no matter'}`
      );
      sections.push(`**Recent Time Entries:** (${totalHours.toFixed(1)}h total this week)\n${timeLines.join('\n')}`);
    }
  } catch (_) {}
  
  // 4. Recent tasks created (what they're tracking)
  try {
    const recentTasks = await query(`
      SELECT t.name as title, t.status, t.priority, t.due_date, m.name as matter_name
      FROM matter_tasks t
      LEFT JOIN matters m ON t.matter_id = m.id
      WHERE t.firm_id = $1 AND t.created_by = $2
        AND t.created_at > NOW() - INTERVAL '14 days'
      ORDER BY t.created_at DESC
      LIMIT 8
    `, [firmId, userId]);
    
    if (recentTasks.rows.length > 0) {
      const pendingTasks = recentTasks.rows.filter(t => t.status !== 'completed');
      const taskLines = pendingTasks.slice(0, 5).map(t =>
        `- [${t.priority || 'normal'}] "${t.title}"${t.matter_name ? ` → ${t.matter_name}` : ''}${t.due_date ? ` (due: ${new Date(t.due_date).toLocaleDateString()})` : ''}`
      );
      if (taskLines.length > 0) {
        sections.push(`**Open Tasks Created by Lawyer:** (${pendingTasks.length} pending)\n${taskLines.join('\n')}`);
      }
    }
  } catch (_) {}
  
  // 5. Recent calendar events (what's coming up)
  try {
    const upcomingEvents = await query(`
      SELECT ce.title, ce.type, ce.start_time, m.name as matter_name
      FROM calendar_events ce
      LEFT JOIN matters m ON ce.matter_id = m.id
      WHERE ce.firm_id = $1 AND ce.created_by = $2
        AND ce.start_time > NOW() AND ce.start_time < NOW() + INTERVAL '14 days'
      ORDER BY ce.start_time ASC
      LIMIT 5
    `, [firmId, userId]);
    
    if (upcomingEvents.rows.length > 0) {
      const eventLines = upcomingEvents.rows.map(e =>
        `- ${new Date(e.start_time).toLocaleDateString()}: "${e.title}" (${e.type || 'general'})${e.matter_name ? ` → ${e.matter_name}` : ''}`
      );
      sections.push(`**Upcoming Events:** (next 14 days)\n${eventLines.join('\n')}`);
    }
  } catch (_) {}
  
  // 6. Recent notes (what they're thinking about)
  try {
    const recentNotes = await query(`
      SELECT mn.content, mn.note_type, m.name as matter_name, mn.created_at
      FROM matter_notes mn
      JOIN matters m ON mn.matter_id = m.id
      WHERE m.firm_id = $1 AND mn.created_by = $2
        AND mn.created_at > NOW() - INTERVAL '7 days'
      ORDER BY mn.created_at DESC
      LIMIT 5
    `, [firmId, userId]);
    
    if (recentNotes.rows.length > 0) {
      const noteLines = recentNotes.rows.map(n =>
        `- [${n.note_type || 'general'}] ${(n.content || '').substring(0, 80)}... → ${n.matter_name}`
      );
      sections.push(`**Recent Notes by Lawyer:**\n${noteLines.join('\n')}`);
    }
  } catch (_) {}
  
  // 7. Learn work patterns (aggregate stats)
  try {
    const patterns = await query(`
      SELECT 
        (SELECT COUNT(*) FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND date > NOW() - INTERVAL '30 days') as monthly_entries,
        (SELECT COALESCE(AVG(hours), 0) FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND date > NOW() - INTERVAL '30 days') as avg_hours_per_entry,
        (SELECT COUNT(*) FROM documents WHERE firm_id = $1 AND uploaded_by = $2 AND uploaded_at > NOW() - INTERVAL '30 days') as monthly_docs,
        (SELECT COUNT(*) FROM matter_notes mn JOIN matters m ON mn.matter_id = m.id WHERE m.firm_id = $1 AND mn.created_by = $2 AND mn.created_at > NOW() - INTERVAL '30 days') as monthly_notes,
        (SELECT COUNT(DISTINCT matter_id) FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND date > NOW() - INTERVAL '30 days') as active_matter_count
    `, [firmId, userId]);
    
    const stats = patterns.rows[0];
    if (stats) {
      const statLines = [];
      if (stats.monthly_entries > 0) statLines.push(`Time entries: ${stats.monthly_entries}/month (avg ${parseFloat(stats.avg_hours_per_entry).toFixed(1)}h each)`);
      if (stats.monthly_docs > 0) statLines.push(`Documents uploaded: ${stats.monthly_docs}/month`);
      if (stats.monthly_notes > 0) statLines.push(`Notes created: ${stats.monthly_notes}/month`);
      if (stats.active_matter_count > 0) statLines.push(`Active matters: ${stats.active_matter_count}`);
      
      if (statLines.length > 0) {
        sections.push(`**Work Volume (30-day):**\n${statLines.join('\n')}`);
      }
    }
  } catch (_) {}
  
  if (sections.length === 0) return null;
  
  return `\n## LAWYER'S RECENT ACTIVITY\nContext from this lawyer's actual work (private, not shared):\n\n${sections.join('\n\n')}\n\nUse this context to understand what the lawyer is currently focused on and prioritize accordingly.\n`;
}

/**
 * Extract and store work patterns from a lawyer's activity.
 * Called periodically (every 15 minutes) to update learning patterns.
 * 
 * This is the "background learning" that happens even when no agent tasks
 * are running. The lawyer's daily work becomes institutional knowledge.
 */
export async function extractWorkPatterns(userId, firmId) {
  try {
    // 1. Document naming patterns (how they name files)
    const docNames = await query(`
      SELECT original_name, type FROM documents 
      WHERE firm_id = $1 AND uploaded_by = $2 AND uploaded_at > NOW() - INTERVAL '90 days'
      ORDER BY uploaded_at DESC LIMIT 50
    `, [firmId, userId]);
    
    if (docNames.rows.length >= 5) {
      // Analyze naming conventions
      const namingPatterns = analyzeNamingPatterns(docNames.rows.map(d => d.original_name));
      if (namingPatterns) {
        await upsertPattern(firmId, userId, 'document_naming', 'preferences', {
          key: 'doc_naming_convention',
          convention: namingPatterns.convention,
          examples: namingPatterns.examples,
          description: namingPatterns.description,
        });
      }
    }
    
    // 2. Time entry description patterns (how they describe work)
    const timeDescriptions = await query(`
      SELECT description FROM time_entries
      WHERE firm_id = $1 AND user_id = $2 AND date > NOW() - INTERVAL '90 days'
        AND description IS NOT NULL AND LENGTH(description) > 10
      ORDER BY date DESC LIMIT 50
    `, [firmId, userId]);
    
    if (timeDescriptions.rows.length >= 5) {
      const descPatterns = analyzeDescriptionPatterns(timeDescriptions.rows.map(t => t.description));
      if (descPatterns) {
        await upsertPattern(firmId, userId, 'time_entry_style', 'preferences', {
          key: 'time_entry_description_style',
          style: descPatterns.style,
          avgLength: descPatterns.avgLength,
          examples: descPatterns.examples,
          description: descPatterns.description,
        });
      }
    }
    
    // 3. Task patterns (how they structure follow-ups)
    const taskPatterns = await query(`
      SELECT name as title, priority FROM matter_tasks
      WHERE firm_id = $1 AND created_by = $2 AND created_at > NOW() - INTERVAL '90 days'
      ORDER BY created_at DESC LIMIT 50
    `, [firmId, userId]);
    
    if (taskPatterns.rows.length >= 5) {
      const priorityDist = {};
      for (const t of taskPatterns.rows) {
        priorityDist[t.priority || 'normal'] = (priorityDist[t.priority || 'normal'] || 0) + 1;
      }
      await upsertPattern(firmId, userId, 'task_priority_preference', 'preferences', {
        key: 'task_priority_distribution',
        distribution: priorityDist,
        total: taskPatterns.rows.length,
        description: `Priority distribution: ${Object.entries(priorityDist).map(([k,v]) => `${k}: ${v}`).join(', ')}`,
      });
    }
    
    // 4. Billing patterns (when and how much they bill)
    const billingPatterns = await query(`
      SELECT 
        EXTRACT(DOW FROM date) as day_of_week,
        hours, billable
      FROM time_entries
      WHERE firm_id = $1 AND user_id = $2 AND date > NOW() - INTERVAL '90 days'
      ORDER BY date DESC LIMIT 200
    `, [firmId, userId]);
    
    if (billingPatterns.rows.length >= 10) {
      const dayDistribution = {};
      let totalBillable = 0, totalNonBillable = 0;
      for (const entry of billingPatterns.rows) {
        const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][entry.day_of_week];
        dayDistribution[day] = (dayDistribution[day] || 0) + parseFloat(entry.hours);
        if (entry.billable) totalBillable += parseFloat(entry.hours);
        else totalNonBillable += parseFloat(entry.hours);
      }
      
      const busiestDay = Object.entries(dayDistribution).sort(([,a],[,b]) => b - a)[0];
      await upsertPattern(firmId, userId, 'billing_schedule', 'timing', {
        key: 'billing_day_distribution',
        distribution: dayDistribution,
        busiestDay: busiestDay?.[0],
        billableRatio: totalBillable / Math.max(1, totalBillable + totalNonBillable),
        description: `Most active: ${busiestDay?.[0]}, billable ratio: ${Math.round(totalBillable / Math.max(1, totalBillable + totalNonBillable) * 100)}%`,
      });
    }
    
    console.log(`[ActivityLearning] Extracted work patterns for user ${userId}`);
  } catch (e) {
    console.error('[ActivityLearning] Pattern extraction error:', e.message);
  }
}

/**
 * Analyze document naming patterns.
 */
function analyzeNamingPatterns(names) {
  if (!names || names.length < 5) return null;
  
  // Check for common conventions
  const hasDatePrefix = names.filter(n => /^\d{4}[-_]\d{2}/.test(n)).length;
  const hasMatterPrefix = names.filter(n => /^[A-Z]{2,}[-_]/.test(n)).length;
  const usesUnderscores = names.filter(n => n.includes('_')).length;
  const usesDashes = names.filter(n => n.includes('-')).length;
  const usesSpaces = names.filter(n => n.includes(' ')).length;
  
  let convention = 'mixed';
  if (hasDatePrefix > names.length * 0.5) convention = 'date_prefixed';
  else if (hasMatterPrefix > names.length * 0.5) convention = 'matter_prefixed';
  else if (usesUnderscores > usesDashes && usesUnderscores > usesSpaces) convention = 'underscore_separated';
  else if (usesDashes > usesUnderscores && usesDashes > usesSpaces) convention = 'dash_separated';
  else if (usesSpaces > usesUnderscores && usesSpaces > usesDashes) convention = 'space_separated';
  
  return {
    convention,
    examples: names.slice(0, 3),
    description: `Naming convention: ${convention} (from ${names.length} documents)`,
  };
}

/**
 * Analyze time entry description patterns.
 */
function analyzeDescriptionPatterns(descriptions) {
  if (!descriptions || descriptions.length < 5) return null;
  
  const avgLength = Math.round(descriptions.reduce((s, d) => s + d.length, 0) / descriptions.length);
  const usesVerbs = descriptions.filter(d => /^(draft|review|prepar|analyz|research|attend|confer|correspond|file)/i.test(d)).length;
  const isDetailed = avgLength > 50;
  
  const style = isDetailed ? 'detailed' : 'concise';
  
  return {
    style,
    avgLength,
    usesActionVerbs: usesVerbs > descriptions.length * 0.3,
    examples: descriptions.slice(0, 3).map(d => d.substring(0, 80)),
    description: `${style} style (avg ${avgLength} chars), ${usesVerbs > descriptions.length * 0.3 ? 'uses action verbs' : 'mixed format'}`,
  };
}

/**
 * Upsert a learning pattern.
 */
async function upsertPattern(firmId, userId, patternType, category, data) {
  try {
    const existing = await query(`
      SELECT id, occurrences FROM ai_learning_patterns
      WHERE firm_id = $1 AND user_id = $2 AND pattern_type = $3 AND pattern_data->>'key' = $4
    `, [firmId, userId, patternType, data.key]);
    
    if (existing.rows.length > 0) {
      await query(`
        UPDATE ai_learning_patterns 
        SET occurrences = occurrences + 1, pattern_data = $2::jsonb,
            last_used_at = NOW(), confidence = LEAST(0.95, confidence + 0.01)
        WHERE id = $1
      `, [existing.rows[0].id, JSON.stringify(data)]);
    } else {
      await query(`
        INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data, confidence)
        VALUES ($1, $2, $3, $4, $5, 0.40)
      `, [firmId, userId, patternType, category, JSON.stringify(data)]);
    }
  } catch (e) {
    if (!e.message?.includes('ai_learning_patterns')) {
      console.error('[ActivityLearning] Upsert error:', e.message);
    }
  }
}

/**
 * Schedule periodic activity learning extraction.
 * Runs every 15 minutes to keep patterns fresh.
 */
let _activityLearningInterval = null;
export function startActivityLearningSchedule() {
  if (_activityLearningInterval) return;
  
  _activityLearningInterval = setInterval(async () => {
    try {
      // Get recently active users
      const result = await query(`
        SELECT DISTINCT user_id, firm_id 
        FROM time_entries 
        WHERE date > NOW() - INTERVAL '1 day'
        LIMIT 20
      `);
      
      for (const row of result.rows) {
        await extractWorkPatterns(row.user_id, row.firm_id).catch(e =>
          console.warn('[ActivityLearning] Extraction skipped:', e.message)
        );
      }
    } catch (e) {
      // Non-fatal
    }
  }, 900000); // Every 15 minutes
  
  if (_activityLearningInterval.unref) _activityLearningInterval.unref();
  console.log('[ActivityLearning] Scheduled periodic pattern extraction (every 15 min)');
}

// Auto-start on module load
try { startActivityLearningSchedule(); } catch (_) {}
