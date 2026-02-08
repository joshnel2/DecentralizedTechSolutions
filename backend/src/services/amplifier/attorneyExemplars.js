/**
 * Attorney Exemplar System
 * 
 * COMBINES THREE APPROACHES to match the attorney's voice:
 * 
 * 1. APPROVED EXEMPLARS — When an attorney approves agent work, store the
 *    best excerpt as a style reference. "Write like this."
 * 
 * 2. CORRECTION PAIRS — When an attorney rejects with feedback, store what
 *    the agent wrote alongside what the attorney wanted. "Don't write X, write Y."
 * 
 * 3. EMBEDDING SIMILARITY — When a new task comes in, use vector similarity
 *    to find the most relevant exemplar, not just work-type matching.
 *    A demand letter task finds the attorney's best approved demand letter,
 *    not just any random approved work.
 * 
 * WHY THIS IS BETTER THAN TRAIT LABELS:
 * Telling a model "short sentences, semiformal, assertive" loses the texture.
 * SHOWING it a 400-char excerpt of how the attorney actually writes carries
 * the rhythm, word choices, structure, argument flow — everything the labels miss.
 * 
 * MEMORY MANAGEMENT:
 * - Max 30 exemplars per attorney (oldest pruned when exceeded)
 * - Max 20 correction pairs per attorney (oldest pruned)
 * - Each excerpt is 400-500 chars max (tight, not wasteful)
 * - Prompt injection: 1-2 exemplars + 1 correction pair = ~1200 chars max
 * - Embeddings enable smart retrieval without loading everything
 * 
 * PRIVACY: All data scoped to user_id + firm_id. Never shared across firms.
 */

import { query } from '../../db/connection.js';
import { generateEmbedding } from '../embeddingService.js';

// =====================================================================
// CONFIGURATION
// =====================================================================

const MAX_EXEMPLARS_PER_ATTORNEY = 30;
const MAX_CORRECTIONS_PER_ATTORNEY = 20;
const MAX_EXCERPT_CHARS = 500;
const MAX_CORRECTION_AGENT_CHARS = 300;
const MAX_CORRECTION_FEEDBACK_CHARS = 300;
const PROMPT_MAX_EXEMPLARS = 2;          // Inject at most 2 exemplars
const PROMPT_MAX_CORRECTIONS = 1;        // Inject at most 1 correction pair
const SIMILARITY_THRESHOLD = 0.55;       // Min similarity for embedding match

// Auto-migration flag
let _tableEnsured = false;

async function _ensureTable() {
  if (_tableEnsured) return;
  _tableEnsured = true;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS attorney_exemplars (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        exemplar_type VARCHAR(20) NOT NULL CHECK (exemplar_type IN ('approved', 'correction')),
        work_type VARCHAR(50),
        excerpt TEXT NOT NULL,
        agent_wrote TEXT,                    -- For corrections: what the agent produced
        attorney_wanted TEXT,                -- For corrections: what the attorney said
        task_id UUID,                        -- Source task
        goal_text VARCHAR(300),              -- The original task goal (for context)
        embedding VECTOR(1536),              -- For semantic similarity matching
        confidence DECIMAL(3,2) DEFAULT 0.70,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_attorney_exemplars_user ON attorney_exemplars(user_id, firm_id, exemplar_type)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_attorney_exemplars_worktype ON attorney_exemplars(user_id, firm_id, work_type)`);
  } catch (e) {
    if (!e.message?.includes('already exists')) {
      console.log('[AttorneyExemplars] Auto-migration note:', e.message);
    }
  }
}

// =====================================================================
// CAPTURE: Store exemplars from approved/rejected tasks
// =====================================================================

/**
 * Capture an approved exemplar.
 * Called from the review queue approve endpoint.
 * Grabs the best excerpt from the task's deliverables and stores it.
 * 
 * @param {string} userId - The attorney who approved
 * @param {string} firmId - The firm
 * @param {string} taskId - The task that was approved
 * @param {string} goal - The original task goal
 * @param {string} workType - Classified work type (e.g. 'document_drafting')
 * @param {object} deliverables - The task's deliverables (documents, notes)
 */
export async function captureApprovedExemplar(userId, firmId, taskId, goal, workType, deliverables) {
  await _ensureTable();
  
  try {
    // Find the best excerpt from deliverables
    const excerpt = _extractBestExcerpt(deliverables);
    if (!excerpt || excerpt.length < 50) {
      console.log('[AttorneyExemplars] No usable excerpt from approved task');
      return null;
    }

    // Generate embedding for semantic matching
    let embedding = null;
    try {
      const result = await generateEmbedding(excerpt, firmId);
      embedding = result.embedding;
    } catch (e) {
      console.log('[AttorneyExemplars] Embedding generation skipped:', e.message);
      // Continue without embedding — work-type matching still works
    }

    // Store the exemplar
    await query(`
      INSERT INTO attorney_exemplars
        (user_id, firm_id, exemplar_type, work_type, excerpt, task_id, goal_text, embedding, confidence)
      VALUES ($1, $2, 'approved', $3, $4, $5, $6, $7, 0.80)
    `, [userId, firmId, workType, excerpt, taskId, (goal || '').substring(0, 300), embedding]);

    // Prune old exemplars if over limit
    await _pruneExemplars(userId, firmId, 'approved', MAX_EXEMPLARS_PER_ATTORNEY);

    console.log(`[AttorneyExemplars] Stored approved exemplar (${excerpt.length} chars, work_type=${workType})`);
    return { stored: true, excerptLength: excerpt.length };
  } catch (error) {
    console.log('[AttorneyExemplars] Capture approved note:', error.message);
    return null;
  }
}

/**
 * Capture a correction pair from a rejected task.
 * Stores what the agent wrote alongside what the attorney said was wrong.
 * 
 * @param {string} userId - The attorney who rejected
 * @param {string} firmId - The firm
 * @param {string} taskId - The task that was rejected
 * @param {string} goal - The original task goal
 * @param {string} workType - Classified work type
 * @param {string} feedback - The attorney's rejection feedback
 * @param {object} deliverables - The task's deliverables (what the agent produced)
 */
export async function captureCorrectionPair(userId, firmId, taskId, goal, workType, feedback, deliverables) {
  await _ensureTable();
  
  try {
    // Get a sample of what the agent wrote
    const agentWrote = _extractBestExcerpt(deliverables, MAX_CORRECTION_AGENT_CHARS);
    if (!agentWrote || agentWrote.length < 30) {
      // If no deliverable excerpt, still store the correction with just the feedback
    }

    const attorneyWanted = (feedback || '').substring(0, MAX_CORRECTION_FEEDBACK_CHARS).trim();
    if (!attorneyWanted || attorneyWanted.length < 10) {
      console.log('[AttorneyExemplars] No usable feedback text for correction pair');
      return null;
    }

    // Build a combined text for embedding (so we can match similar corrections)
    const combinedForEmbedding = `Goal: ${(goal || '').substring(0, 100)}. Feedback: ${attorneyWanted}`;
    
    let embedding = null;
    try {
      const result = await generateEmbedding(combinedForEmbedding, firmId);
      embedding = result.embedding;
    } catch (e) {
      console.log('[AttorneyExemplars] Correction embedding skipped:', e.message);
    }

    await query(`
      INSERT INTO attorney_exemplars
        (user_id, firm_id, exemplar_type, work_type, excerpt, agent_wrote, attorney_wanted, 
         task_id, goal_text, embedding, confidence)
      VALUES ($1, $2, 'correction', $3, $4, $5, $6, $7, $8, $9, 0.85)
    `, [
      userId, firmId, workType,
      attorneyWanted,  // The excerpt IS the attorney's correction
      agentWrote || null,
      attorneyWanted,
      taskId,
      (goal || '').substring(0, 300),
      embedding,
    ]);

    // Prune old corrections if over limit
    await _pruneExemplars(userId, firmId, 'correction', MAX_CORRECTIONS_PER_ATTORNEY);

    console.log(`[AttorneyExemplars] Stored correction pair (agent=${(agentWrote || '').length} chars, feedback=${attorneyWanted.length} chars)`);
    return { stored: true };
  } catch (error) {
    console.log('[AttorneyExemplars] Capture correction note:', error.message);
    return null;
  }
}

// =====================================================================
// RETRIEVAL: Find the best exemplars for a new task
// =====================================================================

/**
 * Get the most relevant exemplars for a new task.
 * 
 * STRATEGY: Try embedding similarity first (most accurate).
 * Fall back to work-type matching if no embeddings or no close matches.
 * 
 * @param {string} userId - The attorney
 * @param {string} firmId - The firm
 * @param {string} goal - The new task's goal (used for embedding matching)
 * @param {string} workType - Classified work type (fallback matching)
 * @returns {object} { exemplars: [...], corrections: [...] }
 */
export async function getRelevantExemplars(userId, firmId, goal, workType) {
  await _ensureTable();
  
  const result = {
    exemplars: [],      // Approved work samples: "write like this"
    corrections: [],    // Correction pairs: "don't write X, write Y"
    matchMethod: 'none',
  };

  try {
    // ===== STRATEGY 1: Embedding similarity (best accuracy) =====
    let usedEmbedding = false;
    try {
      const goalEmbedding = await generateEmbedding(goal, firmId);
      
      if (goalEmbedding?.embedding) {
        // Find nearest approved exemplars
        const approvedResults = await query(`
          SELECT excerpt, work_type, goal_text, confidence,
                 1 - (embedding <=> $1::vector) AS similarity
          FROM attorney_exemplars
          WHERE user_id = $2 AND firm_id = $3 
            AND exemplar_type = 'approved'
            AND embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT $4
        `, [goalEmbedding.embedding, userId, firmId, PROMPT_MAX_EXEMPLARS + 2]);

        for (const row of approvedResults.rows) {
          if (row.similarity >= SIMILARITY_THRESHOLD && result.exemplars.length < PROMPT_MAX_EXEMPLARS) {
            result.exemplars.push({
              excerpt: row.excerpt,
              workType: row.work_type,
              goalContext: row.goal_text,
              similarity: parseFloat(row.similarity).toFixed(2),
              matchMethod: 'embedding',
            });
          }
        }

        // Find nearest correction pairs
        const correctionResults = await query(`
          SELECT excerpt, agent_wrote, attorney_wanted, work_type, goal_text, confidence,
                 1 - (embedding <=> $1::vector) AS similarity
          FROM attorney_exemplars
          WHERE user_id = $2 AND firm_id = $3
            AND exemplar_type = 'correction'
            AND embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT $4
        `, [goalEmbedding.embedding, userId, firmId, PROMPT_MAX_CORRECTIONS + 2]);

        for (const row of correctionResults.rows) {
          if (row.similarity >= SIMILARITY_THRESHOLD && result.corrections.length < PROMPT_MAX_CORRECTIONS) {
            result.corrections.push({
              agentWrote: row.agent_wrote,
              attorneyWanted: row.attorney_wanted,
              workType: row.work_type,
              goalContext: row.goal_text,
              similarity: parseFloat(row.similarity).toFixed(2),
              matchMethod: 'embedding',
            });
          }
        }

        if (result.exemplars.length > 0 || result.corrections.length > 0) {
          usedEmbedding = true;
          result.matchMethod = 'embedding';
        }
      }
    } catch (e) {
      // Embedding not available — fall through to work-type matching
      console.log('[AttorneyExemplars] Embedding retrieval skipped:', e.message);
    }

    // ===== STRATEGY 2: Work-type fallback (if embedding didn't produce results) =====
    if (!usedEmbedding) {
      // Get approved exemplars by work type
      if (result.exemplars.length < PROMPT_MAX_EXEMPLARS) {
        const approvedFallback = await query(`
          SELECT excerpt, work_type, goal_text, confidence
          FROM attorney_exemplars
          WHERE user_id = $1 AND firm_id = $2
            AND exemplar_type = 'approved'
            AND (work_type = $3 OR work_type IS NULL)
          ORDER BY confidence DESC, created_at DESC
          LIMIT $4
        `, [userId, firmId, workType, PROMPT_MAX_EXEMPLARS - result.exemplars.length]);

        for (const row of approvedFallback.rows) {
          result.exemplars.push({
            excerpt: row.excerpt,
            workType: row.work_type,
            goalContext: row.goal_text,
            similarity: null,
            matchMethod: 'work_type',
          });
        }
      }

      // Get correction pairs by work type
      if (result.corrections.length < PROMPT_MAX_CORRECTIONS) {
        const correctionFallback = await query(`
          SELECT excerpt, agent_wrote, attorney_wanted, work_type, goal_text, confidence
          FROM attorney_exemplars
          WHERE user_id = $1 AND firm_id = $2
            AND exemplar_type = 'correction'
            AND (work_type = $3 OR work_type IS NULL)
          ORDER BY confidence DESC, created_at DESC
          LIMIT $4
        `, [userId, firmId, workType, PROMPT_MAX_CORRECTIONS - result.corrections.length]);

        for (const row of correctionFallback.rows) {
          result.corrections.push({
            agentWrote: row.agent_wrote,
            attorneyWanted: row.attorney_wanted,
            workType: row.work_type,
            goalContext: row.goal_text,
            similarity: null,
            matchMethod: 'work_type',
          });
        }
      }

      if (result.exemplars.length > 0 || result.corrections.length > 0) {
        result.matchMethod = 'work_type';
      }
    }

    if (result.exemplars.length > 0 || result.corrections.length > 0) {
      console.log(`[AttorneyExemplars] Retrieved ${result.exemplars.length} exemplars + ${result.corrections.length} corrections (method: ${result.matchMethod})`);
    }

    return result;
  } catch (error) {
    console.log('[AttorneyExemplars] Retrieval note:', error.message);
    return result;
  }
}

// =====================================================================
// FORMAT FOR PROMPT
// =====================================================================

/**
 * Format retrieved exemplars for injection into the agent's prompt.
 * This replaces abstract trait labels with actual writing samples.
 * 
 * Total budget: ~1200 chars max (2 exemplars + 1 correction)
 */
export function formatExemplarsForPrompt(exemplarData) {
  if (!exemplarData) return '';
  
  const { exemplars, corrections } = exemplarData;
  if ((!exemplars || exemplars.length === 0) && (!corrections || corrections.length === 0)) {
    return '';
  }

  const parts = [];
  parts.push(`\n## MATCH THIS ATTORNEY'S VOICE`);

  // Approved exemplars: "write like this"
  if (exemplars && exemplars.length > 0) {
    parts.push(`**This attorney's approved work looks like this:**`);
    for (const ex of exemplars.slice(0, PROMPT_MAX_EXEMPLARS)) {
      const context = ex.goalContext ? ` (from: ${ex.goalContext.substring(0, 60)})` : '';
      parts.push(`> "${ex.excerpt}"${context}`);
    }
    parts.push(`Match this voice: the rhythm, word choices, structure, level of detail.`);
  }

  // Correction pairs: "don't write X, write Y"
  if (corrections && corrections.length > 0) {
    parts.push(``);
    parts.push(`**This attorney corrected the agent before:**`);
    for (const corr of corrections.slice(0, PROMPT_MAX_CORRECTIONS)) {
      if (corr.agentWrote) {
        parts.push(`Agent wrote: "${corr.agentWrote.substring(0, 200)}"`);
      }
      parts.push(`Attorney said: "${corr.attorneyWanted}"`);
      parts.push(`Learn from this. Do NOT repeat the same mistake.`);
    }
  }

  return parts.join('\n');
}

// =====================================================================
// HELPERS
// =====================================================================

/**
 * Extract the best excerpt from task deliverables.
 * Looks for the most substantive piece of content.
 */
function _extractBestExcerpt(deliverables, maxChars = MAX_EXCERPT_CHARS) {
  if (!deliverables) return null;

  const candidates = [];

  // From documents
  if (deliverables.documents) {
    for (const doc of deliverables.documents) {
      const text = doc.contentPreview || doc.content_text || doc.content;
      if (text && text.length > 50) {
        candidates.push({ text, length: text.length, source: 'document' });
      }
    }
  }

  // From notes
  if (deliverables.notes) {
    for (const note of deliverables.notes) {
      const text = note.content || note.contentPreview;
      if (text && text.length > 50) {
        candidates.push({ text, length: text.length, source: 'note' });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Pick the longest substantive candidate (most representative)
  candidates.sort((a, b) => b.length - a.length);
  const best = candidates[0].text;

  // Extract the best 400-500 char window
  // Prefer the opening section (it usually sets the tone)
  if (best.length <= maxChars) return best.trim();

  // Find a sentence boundary near the limit
  const cutRegion = best.substring(maxChars - 80, maxChars + 20);
  const sentenceEnd = cutRegion.search(/[.!?]\s/);
  const cutPoint = sentenceEnd >= 0 ? (maxChars - 80 + sentenceEnd + 1) : maxChars;

  return best.substring(0, cutPoint).trim();
}

/**
 * Prune oldest exemplars when over the limit.
 */
async function _pruneExemplars(userId, firmId, exemplarType, maxCount) {
  try {
    const countResult = await query(`
      SELECT COUNT(*) as cnt FROM attorney_exemplars
      WHERE user_id = $1 AND firm_id = $2 AND exemplar_type = $3
    `, [userId, firmId, exemplarType]);

    const count = parseInt(countResult.rows[0]?.cnt || 0);
    if (count <= maxCount) return;

    // Delete oldest beyond the limit
    const toDelete = count - maxCount;
    await query(`
      DELETE FROM attorney_exemplars
      WHERE id IN (
        SELECT id FROM attorney_exemplars
        WHERE user_id = $1 AND firm_id = $2 AND exemplar_type = $3
        ORDER BY created_at ASC
        LIMIT $4
      )
    `, [userId, firmId, exemplarType, toDelete]);

    console.log(`[AttorneyExemplars] Pruned ${toDelete} old ${exemplarType} exemplars`);
  } catch (e) {
    // Non-fatal
  }
}

// =====================================================================
// DB MIGRATION SQL (for reference / manual application)
// =====================================================================

export const EXEMPLAR_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS attorney_exemplars (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  exemplar_type VARCHAR(20) NOT NULL CHECK (exemplar_type IN ('approved', 'correction')),
  work_type VARCHAR(50),
  excerpt TEXT NOT NULL,
  agent_wrote TEXT,
  attorney_wanted TEXT,
  task_id UUID,
  goal_text VARCHAR(300),
  embedding VECTOR(1536),
  confidence DECIMAL(3,2) DEFAULT 0.70,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attorney_exemplars_user 
  ON attorney_exemplars(user_id, firm_id, exemplar_type);
CREATE INDEX IF NOT EXISTS idx_attorney_exemplars_worktype 
  ON attorney_exemplars(user_id, firm_id, work_type);
`;
