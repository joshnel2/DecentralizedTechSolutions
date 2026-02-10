/**
 * User AI Memory File Service
 * 
 * Each user gets a persistent "memory file" that the AI reads on every interaction.
 * As the attorney uses the platform, the system automatically adds entries:
 * - Practice area preferences from their matters
 * - Writing style observations from their documents
 * - Workflow preferences from how they use the software
 * - Corrections from negative feedback on AI tasks
 * - Active context from what they're currently working on
 * 
 * The memory file is periodically cleaned up to:
 * 1. Merge duplicate/overlapping entries
 * 2. Expire stale active context entries
 * 3. Lower confidence on entries that haven't been reinforced
 * 4. Remove low-confidence entries that exceed the cap
 * 
 * PRIVACY: All memory is scoped to user_id + firm_id. Never shared across firms or users.
 */

import { query } from '../db/connection.js';

// ===== CONFIGURATION =====
const MAX_MEMORY_ENTRIES = 50;          // Hard cap per user
const MAX_PROMPT_ENTRIES = 15;          // Max entries injected into prompt
const MAX_PROMPT_CHARS = 2000;          // Character budget for memory in prompt
const CONFIDENCE_DECAY_DAYS = 30;       // Days before confidence starts decaying
const ACTIVE_CONTEXT_EXPIRY_DAYS = 14;  // Active context entries expire after 2 weeks
const MIN_CONFIDENCE_THRESHOLD = 0.3;   // Entries below this get pruned
const CONSOLIDATION_INTERVAL_HOURS = 24; // How often cleanup runs

// In-memory cache per user
const memoryCache = new Map();
const CACHE_TTL_MS = 120000; // 2 minutes

/**
 * Get the full memory file for a user (all active entries).
 */
export async function getUserMemoryFile(userId, firmId) {
  try {
    const result = await query(
      `SELECT id, category, content, source, confidence, reinforcement_count,
              pinned, created_at, updated_at, last_used_at, expires_at
       FROM user_ai_memory
       WHERE user_id = $1 AND firm_id = $2 AND dismissed = false
       ORDER BY 
         pinned DESC,
         category = 'core_identity' DESC,
         category = 'correction' DESC,
         confidence DESC,
         updated_at DESC
       LIMIT $3`,
      [userId, firmId, MAX_MEMORY_ENTRIES]
    );
    return result.rows;
  } catch (error) {
    // Table might not exist yet
    if (error.message?.includes('user_ai_memory')) {
      console.log('[UserAIMemory] Table not available yet');
      return [];
    }
    throw error;
  }
}

/**
 * Get the memory context formatted for AI prompt injection.
 * This is the key function - called on every AI interaction.
 * 
 * Returns a formatted string ready to be inserted into the system prompt,
 * or null if no meaningful memories exist.
 */
export async function getMemoryForPrompt(userId, firmId) {
  // Check cache first
  const cacheKey = `${userId}:${firmId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.formatted;
  }

  try {
    const result = await query(
      `SELECT id, category, content, source, confidence, pinned
       FROM user_ai_memory
       WHERE user_id = $1 AND firm_id = $2 
         AND dismissed = false
         AND confidence >= $3
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY 
         pinned DESC,
         category = 'core_identity' DESC,
         category = 'correction' DESC,
         category = 'working_style' DESC,
         confidence DESC,
         updated_at DESC
       LIMIT $4`,
      [userId, firmId, MIN_CONFIDENCE_THRESHOLD, MAX_PROMPT_ENTRIES]
    );

    if (result.rows.length === 0) {
      memoryCache.set(cacheKey, { formatted: null, timestamp: Date.now() });
      return null;
    }

    // Update last_used_at for included entries (non-blocking)
    const ids = result.rows.map(r => r.id);
    query(
      `UPDATE user_ai_memory SET last_used_at = NOW() WHERE id = ANY($1)`,
      [ids]
    ).catch(() => {}); // Fire and forget

    // Format for prompt
    const formatted = formatMemoryForPrompt(result.rows);
    memoryCache.set(cacheKey, { formatted, timestamp: Date.now() });
    return formatted;
  } catch (error) {
    if (error.message?.includes('user_ai_memory')) {
      return null;
    }
    console.error('[UserAIMemory] Error getting memory for prompt:', error.message);
    return null;
  }
}

/**
 * Format memory entries into a prompt-ready string.
 */
function formatMemoryForPrompt(entries) {
  if (!entries || entries.length === 0) return null;

  const categoryLabels = {
    core_identity: 'WHO THIS ATTORNEY IS',
    working_style: 'HOW THEY PREFER THINGS DONE',
    active_context: 'WHAT THEY\'RE CURRENTLY FOCUSED ON',
    learned_preference: 'LEARNED PREFERENCES',
    correction: 'IMPORTANT CORRECTIONS (from feedback)',
    insight: 'OBSERVED PATTERNS',
  };

  // Group entries by category
  const grouped = {};
  for (const entry of entries) {
    const cat = entry.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(entry);
  }

  // Build the prompt section
  let output = '\n## YOUR MEMORY FILE FOR THIS ATTORNEY\n';
  output += 'These are things you\'ve learned about this specific attorney over time. Use them to personalize your work.\n';

  let charCount = output.length;

  // Priority order for categories
  const categoryOrder = ['core_identity', 'correction', 'working_style', 'active_context', 'learned_preference', 'insight'];

  for (const cat of categoryOrder) {
    const catEntries = grouped[cat];
    if (!catEntries || catEntries.length === 0) continue;

    const sectionHeader = `\n**${categoryLabels[cat] || cat}:**\n`;
    if (charCount + sectionHeader.length > MAX_PROMPT_CHARS) break;

    output += sectionHeader;
    charCount += sectionHeader.length;

    for (const entry of catEntries) {
      const pin = entry.pinned ? ' [PINNED]' : '';
      const line = `- ${entry.content}${pin}\n`;
      if (charCount + line.length > MAX_PROMPT_CHARS) break;
      output += line;
      charCount += line.length;
    }
  }

  return output;
}

/**
 * Add a new memory entry for a user.
 * Handles deduplication via content_hash unique constraint.
 */
export async function addMemoryEntry(userId, firmId, {
  category = 'learned_preference',
  content,
  source = 'ai_inferred',
  confidence = 0.7,
  pinned = false,
  expiresInDays = null,
}) {
  if (!content || content.trim().length === 0) return null;
  
  // Normalize content
  const normalizedContent = content.trim();
  if (normalizedContent.length > 1000) {
    console.log('[UserAIMemory] Content too long, truncating to 1000 chars');
  }
  const truncatedContent = normalizedContent.substring(0, 1000);

  const expiresAt = expiresInDays 
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  try {
    const result = await query(
      `INSERT INTO user_ai_memory (user_id, firm_id, category, content, source, confidence, pinned, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, firm_id, category, content_hash) WHERE dismissed = false
       DO UPDATE SET 
         reinforcement_count = user_ai_memory.reinforcement_count + 1,
         confidence = GREATEST(user_ai_memory.confidence, EXCLUDED.confidence),
         updated_at = NOW(),
         last_used_at = NOW(),
         -- If re-added, extend expiry
         expires_at = CASE 
           WHEN EXCLUDED.expires_at IS NOT NULL THEN EXCLUDED.expires_at
           ELSE user_ai_memory.expires_at
         END
       RETURNING id, reinforcement_count`,
      [userId, firmId, category, truncatedContent, source, confidence, pinned, expiresAt]
    );

    // Invalidate cache
    memoryCache.delete(`${userId}:${firmId}`);

    const row = result.rows[0];
    if (row.reinforcement_count > 1) {
      console.log(`[UserAIMemory] Reinforced memory entry (count: ${row.reinforcement_count})`);
    } else {
      console.log(`[UserAIMemory] Added new memory: [${category}] ${truncatedContent.substring(0, 60)}...`);
    }

    return row;
  } catch (error) {
    if (error.message?.includes('user_ai_memory')) {
      console.log('[UserAIMemory] Table not available yet');
      return null;
    }
    console.error('[UserAIMemory] Error adding memory:', error.message);
    return null;
  }
}

/**
 * Update an existing memory entry.
 */
export async function updateMemoryEntry(userId, firmId, entryId, updates) {
  const setClauses = [];
  const values = [];
  let paramIdx = 1;

  if (updates.content !== undefined) {
    setClauses.push(`content = $${paramIdx++}`);
    values.push(updates.content.substring(0, 1000));
  }
  if (updates.category !== undefined) {
    setClauses.push(`category = $${paramIdx++}`);
    values.push(updates.category);
  }
  if (updates.confidence !== undefined) {
    setClauses.push(`confidence = $${paramIdx++}`);
    values.push(updates.confidence);
  }
  if (updates.pinned !== undefined) {
    setClauses.push(`pinned = $${paramIdx++}`);
    values.push(updates.pinned);
  }
  if (updates.dismissed !== undefined) {
    setClauses.push(`dismissed = $${paramIdx++}`);
    values.push(updates.dismissed);
  }

  if (setClauses.length === 0) return null;
  
  setClauses.push('updated_at = NOW()');
  values.push(entryId, userId, firmId);

  try {
    const result = await query(
      `UPDATE user_ai_memory 
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIdx++} AND user_id = $${paramIdx++} AND firm_id = $${paramIdx}
       RETURNING id, category, content, confidence, pinned, dismissed`,
      values
    );

    memoryCache.delete(`${userId}:${firmId}`);
    return result.rows[0] || null;
  } catch (error) {
    console.error('[UserAIMemory] Error updating memory:', error.message);
    return null;
  }
}

/**
 * Dismiss (soft-delete) a memory entry.
 */
export async function dismissMemoryEntry(userId, firmId, entryId) {
  return updateMemoryEntry(userId, firmId, entryId, { dismissed: true });
}

/**
 * Toggle pinned state of a memory entry.
 */
export async function togglePinMemory(userId, firmId, entryId) {
  try {
    const result = await query(
      `UPDATE user_ai_memory 
       SET pinned = NOT pinned, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND firm_id = $3
       RETURNING id, pinned`,
      [entryId, userId, firmId]
    );
    memoryCache.delete(`${userId}:${firmId}`);
    return result.rows[0] || null;
  } catch (error) {
    console.error('[UserAIMemory] Error toggling pin:', error.message);
    return null;
  }
}

/**
 * Get memory file statistics for a user.
 */
export async function getMemoryStats(userId, firmId) {
  try {
    const result = await query(
      `SELECT 
         COUNT(*) FILTER (WHERE dismissed = false) as total_active,
         COUNT(*) FILTER (WHERE dismissed = true) as total_dismissed,
         COUNT(*) FILTER (WHERE pinned = true AND dismissed = false) as total_pinned,
         COUNT(*) FILTER (WHERE source = 'user_explicit' AND dismissed = false) as user_created,
         COUNT(*) FILTER (WHERE source != 'user_explicit' AND dismissed = false) as ai_learned,
         AVG(confidence) FILTER (WHERE dismissed = false) as avg_confidence,
         MAX(updated_at) as last_updated,
         json_object_agg(
           COALESCE(category, 'unknown'),
           cat_count
         ) FILTER (WHERE cat_count > 0) as categories
       FROM user_ai_memory
       LEFT JOIN LATERAL (
         SELECT category as cat, COUNT(*) as cat_count
         FROM user_ai_memory sub
         WHERE sub.user_id = user_ai_memory.user_id 
           AND sub.firm_id = user_ai_memory.firm_id
           AND sub.dismissed = false
         GROUP BY category
       ) cats ON true
       WHERE user_id = $1 AND firm_id = $2`,
      [userId, firmId]
    );

    // Simpler stats query
    const statsResult = await query(
      `SELECT 
         COUNT(*) FILTER (WHERE dismissed = false) as total_active,
         COUNT(*) FILTER (WHERE dismissed = true) as total_dismissed,
         COUNT(*) FILTER (WHERE pinned = true AND dismissed = false) as total_pinned,
         COUNT(*) FILTER (WHERE source = 'user_explicit' AND dismissed = false) as user_created,
         COUNT(*) FILTER (WHERE source != 'user_explicit' AND dismissed = false) as ai_learned,
         ROUND(AVG(confidence)::numeric, 2) FILTER (WHERE dismissed = false) as avg_confidence,
         MAX(updated_at) as last_updated
       FROM user_ai_memory
       WHERE user_id = $1 AND firm_id = $2`,
      [userId, firmId]
    );

    const categoryResult = await query(
      `SELECT category, COUNT(*) as count
       FROM user_ai_memory
       WHERE user_id = $1 AND firm_id = $2 AND dismissed = false
       GROUP BY category
       ORDER BY count DESC`,
      [userId, firmId]
    );

    const lastConsolidation = await query(
      `SELECT created_at, entries_before, entries_after, entries_merged, entries_expired, entries_pruned
       FROM user_ai_memory_consolidation_log
       WHERE user_id = $1 AND firm_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [userId, firmId]
    );

    const stats = statsResult.rows[0] || {};
    return {
      totalActive: parseInt(stats.total_active) || 0,
      totalDismissed: parseInt(stats.total_dismissed) || 0,
      totalPinned: parseInt(stats.total_pinned) || 0,
      userCreated: parseInt(stats.user_created) || 0,
      aiLearned: parseInt(stats.ai_learned) || 0,
      avgConfidence: parseFloat(stats.avg_confidence) || 0,
      lastUpdated: stats.last_updated,
      categories: Object.fromEntries(categoryResult.rows.map(r => [r.category, parseInt(r.count)])),
      lastConsolidation: lastConsolidation.rows[0] || null,
      maxEntries: MAX_MEMORY_ENTRIES,
    };
  } catch (error) {
    if (error.message?.includes('user_ai_memory')) {
      return { totalActive: 0, totalDismissed: 0, totalPinned: 0, maxEntries: MAX_MEMORY_ENTRIES };
    }
    console.error('[UserAIMemory] Error getting stats:', error.message);
    return { totalActive: 0, maxEntries: MAX_MEMORY_ENTRIES };
  }
}

// ===== MEMORY CONSOLIDATION (CLEANUP) =====

/**
 * Run periodic memory consolidation for a user.
 * This is the "cleanup" that keeps the memory file healthy:
 * 
 * 1. Expire entries past their expiry date
 * 2. Decay confidence on old, unreinforced entries
 * 3. Prune low-confidence entries if over the cap
 * 4. Log the consolidation for audit
 */
export async function consolidateMemory(userId, firmId) {
  console.log(`[UserAIMemory] Starting memory consolidation for user ${userId}`);
  
  let entriesBefore = 0;
  let entriesExpired = 0;
  let entriesPruned = 0;
  let entriesMerged = 0;

  try {
    // Count current entries
    const countResult = await query(
      `SELECT COUNT(*) as count FROM user_ai_memory WHERE user_id = $1 AND firm_id = $2 AND dismissed = false`,
      [userId, firmId]
    );
    entriesBefore = parseInt(countResult.rows[0]?.count) || 0;

    if (entriesBefore === 0) {
      console.log('[UserAIMemory] No entries to consolidate');
      return;
    }

    // 1. Expire old entries
    const expireResult = await query(
      `UPDATE user_ai_memory 
       SET dismissed = true, updated_at = NOW()
       WHERE user_id = $1 AND firm_id = $2 
         AND dismissed = false
         AND expires_at IS NOT NULL 
         AND expires_at < NOW()`,
      [userId, firmId]
    );
    entriesExpired = expireResult.rowCount || 0;

    // 2. Decay confidence on old, low-reinforcement entries
    // Entries not used in CONFIDENCE_DECAY_DAYS lose confidence gradually
    await query(
      `UPDATE user_ai_memory 
       SET confidence = GREATEST($3, confidence * 0.85),
           updated_at = NOW()
       WHERE user_id = $1 AND firm_id = $2
         AND dismissed = false
         AND pinned = false
         AND source != 'user_explicit'
         AND last_used_at < NOW() - INTERVAL '${CONFIDENCE_DECAY_DAYS} days'
         AND reinforcement_count < 3`,
      [userId, firmId, MIN_CONFIDENCE_THRESHOLD]
    );

    // 3. Prune low-confidence entries if over the cap
    const currentCount = await query(
      `SELECT COUNT(*) as count FROM user_ai_memory WHERE user_id = $1 AND firm_id = $2 AND dismissed = false`,
      [userId, firmId]
    );
    const currentTotal = parseInt(currentCount.rows[0]?.count) || 0;

    if (currentTotal > MAX_MEMORY_ENTRIES) {
      const toPrune = currentTotal - MAX_MEMORY_ENTRIES;
      const pruneResult = await query(
        `UPDATE user_ai_memory 
         SET dismissed = true, updated_at = NOW()
         WHERE id IN (
           SELECT id FROM user_ai_memory
           WHERE user_id = $1 AND firm_id = $2
             AND dismissed = false
             AND pinned = false
             AND source != 'user_explicit'
           ORDER BY confidence ASC, reinforcement_count ASC, updated_at ASC
           LIMIT $3
         )`,
        [userId, firmId, toPrune]
      );
      entriesPruned = pruneResult.rowCount || 0;
    }

    // 4. Also prune entries with confidence below threshold
    const pruneLowResult = await query(
      `UPDATE user_ai_memory 
       SET dismissed = true, updated_at = NOW()
       WHERE user_id = $1 AND firm_id = $2
         AND dismissed = false
         AND pinned = false
         AND source != 'user_explicit'
         AND confidence < $3`,
      [userId, firmId, MIN_CONFIDENCE_THRESHOLD]
    );
    entriesPruned += pruneLowResult.rowCount || 0;

    // Count final entries
    const finalCount = await query(
      `SELECT COUNT(*) as count FROM user_ai_memory WHERE user_id = $1 AND firm_id = $2 AND dismissed = false`,
      [userId, firmId]
    );
    const entriesAfter = parseInt(finalCount.rows[0]?.count) || 0;

    // Log consolidation
    await query(
      `INSERT INTO user_ai_memory_consolidation_log 
       (user_id, firm_id, action, entries_before, entries_after, entries_merged, entries_expired, entries_pruned)
       VALUES ($1, $2, 'periodic_cleanup', $3, $4, $5, $6, $7)`,
      [userId, firmId, entriesBefore, entriesAfter, entriesMerged, entriesExpired, entriesPruned]
    );

    // Invalidate cache
    memoryCache.delete(`${userId}:${firmId}`);

    console.log(`[UserAIMemory] Consolidation complete: ${entriesBefore} -> ${entriesAfter} entries (expired: ${entriesExpired}, pruned: ${entriesPruned})`);
  } catch (error) {
    if (error.message?.includes('user_ai_memory')) {
      return; // Table not ready
    }
    console.error('[UserAIMemory] Consolidation error:', error.message);
  }
}

// ===== AUTO-LEARNING HOOKS =====
// These functions are called from other parts of the system to automatically
// populate the memory file as the attorney uses the platform.

/**
 * Learn from a completed background task.
 * Called after each background agent task completes.
 */
export async function learnFromTask(userId, firmId, task) {
  try {
    // If the task revealed a practice area focus
    if (task.goal) {
      const practiceAreas = detectPracticeAreas(task.goal);
      for (const area of practiceAreas) {
        await addMemoryEntry(userId, firmId, {
          category: 'core_identity',
          content: `Works on ${area} matters`,
          source: 'system_observed',
          confidence: 0.6,
        });
      }
    }

    // If there was positive feedback, learn what they liked
    if (task.feedback_rating >= 4 && task.feedback_text) {
      await addMemoryEntry(userId, firmId, {
        category: 'working_style',
        content: `Liked this about AI work: "${task.feedback_text.substring(0, 200)}"`,
        source: 'task_feedback',
        confidence: 0.8,
      });
    }

    // If there was negative feedback, record the correction
    if (task.feedback_rating && task.feedback_rating <= 2 && task.feedback_text) {
      await addMemoryEntry(userId, firmId, {
        category: 'correction',
        content: `Correction: "${task.feedback_text.substring(0, 200)}" (on task: ${task.goal?.substring(0, 100)})`,
        source: 'task_feedback',
        confidence: 0.9,
        pinned: false,
      });
    }
  } catch (error) {
    console.log('[UserAIMemory] Error learning from task:', error.message);
  }
}

/**
 * Learn from a chat interaction.
 * Called when the AI identifies something memorable from a conversation.
 */
export async function learnFromChat(userId, firmId, insight, category = 'learned_preference') {
  try {
    await addMemoryEntry(userId, firmId, {
      category,
      content: insight,
      source: 'chat_interaction',
      confidence: 0.65,
    });
  } catch (error) {
    console.log('[UserAIMemory] Error learning from chat:', error.message);
  }
}

/**
 * Learn from document patterns.
 * Called when document learning detects a new style preference.
 */
export async function learnFromDocument(userId, firmId, insight) {
  try {
    await addMemoryEntry(userId, firmId, {
      category: 'working_style',
      content: insight,
      source: 'document_analysis',
      confidence: 0.6,
    });
  } catch (error) {
    console.log('[UserAIMemory] Error learning from document:', error.message);
  }
}

/**
 * Update active context (what the user is currently focused on).
 * These entries auto-expire after ACTIVE_CONTEXT_EXPIRY_DAYS.
 */
export async function updateActiveContext(userId, firmId, contextEntry) {
  try {
    await addMemoryEntry(userId, firmId, {
      category: 'active_context',
      content: contextEntry,
      source: 'system_observed',
      confidence: 0.7,
      expiresInDays: ACTIVE_CONTEXT_EXPIRY_DAYS,
    });
  } catch (error) {
    console.log('[UserAIMemory] Error updating active context:', error.message);
  }
}

// ===== HELPERS =====

function detectPracticeAreas(goal) {
  const goalLower = goal.toLowerCase();
  const areas = [];
  
  const areaKeywords = {
    'real estate': ['real estate', 'property', 'deed', 'title', 'closing', 'lease', 'landlord', 'tenant'],
    'litigation': ['litigation', 'lawsuit', 'complaint', 'motion', 'discovery', 'deposition', 'trial'],
    'corporate': ['corporate', 'merger', 'acquisition', 'shareholder', 'board', 'bylaws', 'incorporation'],
    'family law': ['divorce', 'custody', 'family', 'matrimonial', 'child support', 'prenup'],
    'criminal defense': ['criminal', 'defense', 'arraignment', 'bail', 'plea', 'sentencing'],
    'estate planning': ['estate', 'will', 'trust', 'probate', 'inheritance', 'executor'],
    'intellectual property': ['patent', 'trademark', 'copyright', 'ip', 'intellectual property'],
    'immigration': ['immigration', 'visa', 'asylum', 'deportation', 'citizenship', 'green card'],
    'employment law': ['employment', 'labor', 'discrimination', 'wrongful termination', 'wage'],
    'personal injury': ['personal injury', 'accident', 'negligence', 'malpractice', 'damages'],
    'bankruptcy': ['bankruptcy', 'debt', 'creditor', 'chapter 7', 'chapter 11', 'chapter 13'],
    'tax law': ['tax', 'irs', 'audit', 'tax return', 'tax planning'],
    'contract law': ['contract', 'agreement', 'breach', 'negotiate', 'terms'],
  };

  for (const [area, keywords] of Object.entries(areaKeywords)) {
    if (keywords.some(kw => goalLower.includes(kw))) {
      areas.push(area);
    }
  }
  
  return areas.slice(0, 3); // Cap at 3 detected areas per task
}

// ===== PERIODIC CONSOLIDATION SCHEDULER =====

let _consolidationInterval = null;

/**
 * Start the periodic memory consolidation scheduler.
 * Called once when the server starts.
 */
export function startMemoryConsolidationScheduler() {
  if (_consolidationInterval) return;

  console.log('[UserAIMemory] Starting memory consolidation scheduler');

  _consolidationInterval = setInterval(async () => {
    try {
      // Find users who have memory entries and haven't been consolidated recently
      const usersToConsolidate = await query(
        `SELECT DISTINCT m.user_id, m.firm_id
         FROM user_ai_memory m
         LEFT JOIN user_ai_memory_consolidation_log l 
           ON m.user_id = l.user_id AND m.firm_id = l.firm_id
         WHERE m.dismissed = false
         GROUP BY m.user_id, m.firm_id
         HAVING MAX(l.created_at) IS NULL 
            OR MAX(l.created_at) < NOW() - INTERVAL '${CONSOLIDATION_INTERVAL_HOURS} hours'
         LIMIT 10`
      );

      for (const { user_id, firm_id } of usersToConsolidate.rows) {
        await consolidateMemory(user_id, firm_id);
      }

      if (usersToConsolidate.rows.length > 0) {
        console.log(`[UserAIMemory] Consolidated memory for ${usersToConsolidate.rows.length} users`);
      }
    } catch (error) {
      if (!error.message?.includes('user_ai_memory')) {
        console.error('[UserAIMemory] Scheduler error:', error.message);
      }
    }
  }, CONSOLIDATION_INTERVAL_HOURS * 60 * 60 * 1000); // Run periodically

  // Also run once shortly after startup (30 seconds delay)
  setTimeout(async () => {
    try {
      const users = await query(
        `SELECT DISTINCT user_id, firm_id FROM user_ai_memory WHERE dismissed = false LIMIT 5`
      );
      for (const { user_id, firm_id } of (users?.rows || [])) {
        await consolidateMemory(user_id, firm_id);
      }
    } catch (e) {
      // Non-fatal
    }
  }, 30000);
}

/**
 * Stop the consolidation scheduler (for testing/shutdown).
 */
export function stopMemoryConsolidationScheduler() {
  if (_consolidationInterval) {
    clearInterval(_consolidationInterval);
    _consolidationInterval = null;
  }
}
