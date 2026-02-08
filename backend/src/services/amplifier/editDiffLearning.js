/**
 * Edit Diff Learning - The Silent Teacher
 * 
 * THE HIGHEST-VALUE LEARNING SIGNAL IN THE ENTIRE SYSTEM.
 * 
 * When a lawyer silently edits an agent-created document — shortening a
 * paragraph, replacing "pursuant to" with "under", moving the conclusion
 * above the analysis — those edits are corrections that carry MORE weight
 * than verbal feedback because the lawyer SHOWED you what they wanted.
 * 
 * Most AI systems throw this signal away. We capture it.
 * 
 * HOW IT WORKS:
 * 
 * 1. TRACK: When the agent creates a document, snapshot its content
 *    and hash in `agent_created_documents`.
 * 
 * 2. DETECT: When that document is later updated (via document editor,
 *    re-upload, or version update), compare the new content to the snapshot.
 * 
 * 3. DECOMPOSE: Break the diff into typed signals:
 *    - SUBSTITUTION: lawyer replaced text → vocabulary/tone preference
 *    - DELETION: lawyer removed text → content was wrong or unwanted
 *    - ADDITION: lawyer added text → content was missing
 *    - RESTRUCTURE: lawyer moved sections → structural preference
 *    - NO_CHANGE: lawyer left text as-is → implicit high-confidence approval
 * 
 * 4. EXTRACT: From each signal, extract a principle about the attorney's
 *    identity (e.g., "prefers plain language over legalese") and feed it
 *    into `attorneyIdentity.js` with confidence 0.90+.
 * 
 * 5. COMPOUND: Over time, edit signals are the fastest path to MIRROR
 *    maturity because each edit produces multiple high-confidence signals.
 * 
 * PRIVACY: All data scoped to user_id + firm_id. Never shared across firms.
 */

import { query } from '../../db/connection.js';
import crypto from 'crypto';

// =====================================================================
// CONFIGURATION
// =====================================================================

const MAX_SNAPSHOT_CHARS = 5000;          // Store first 5000 chars of original
const MIN_EDIT_DISTANCE = 20;            // Ignore trivial changes (< 20 chars diff)
const MAX_SIGNALS_PER_DIFF = 15;         // Cap signals per edit event
const SUBSTITUTION_CONTEXT_CHARS = 80;   // Context around each substitution
const MIN_DOCUMENT_LENGTH = 100;         // Don't track very short documents

// Auto-migration
let _tableEnsured = false;
async function _ensureTable() {
  if (_tableEnsured) return;
  _tableEnsured = true;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS agent_created_documents (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        document_id UUID NOT NULL,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        task_id VARCHAR(100),
        original_content_hash VARCHAR(64) NOT NULL,
        original_content_length INTEGER NOT NULL,
        original_content_snapshot TEXT,
        work_type VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_agent_docs_lookup ON agent_created_documents(document_id)`);
    
    await query(`
      CREATE TABLE IF NOT EXISTS edit_diff_signals (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        document_id UUID NOT NULL,
        task_id VARCHAR(100),
        signal_type VARCHAR(30) NOT NULL,
        signal_data JSONB NOT NULL,
        identity_dimension VARCHAR(50),
        extracted_principle TEXT,
        confidence DECIMAL(3,2) DEFAULT 0.90,
        unchanged_ratio DECIMAL(3,2),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_edit_diff_user ON edit_diff_signals(user_id, firm_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_edit_diff_dimension ON edit_diff_signals(user_id, firm_id, identity_dimension)`);
  } catch (e) {
    if (!e.message?.includes('already exists')) {
      console.log('[EditDiffLearning] Auto-migration note:', e.message);
    }
  }
}

// =====================================================================
// 1. TRACK: Register agent-created documents for future diff detection
// =====================================================================

/**
 * Called when the agent creates a document during task execution.
 * Snapshots the original content so we can diff against edits later.
 * 
 * @param {string} documentId - The created document's ID
 * @param {string} userId - The attorney the agent is working for
 * @param {string} firmId - The firm
 * @param {string} content - The full document content
 * @param {string} taskId - The background task that created it
 * @param {string} workType - The classified work type
 */
export async function trackAgentCreatedDocument(documentId, userId, firmId, content, taskId, workType) {
  if (!content || content.length < MIN_DOCUMENT_LENGTH) return;
  
  await _ensureTable();
  
  try {
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const snapshot = content.substring(0, MAX_SNAPSHOT_CHARS);
    
    await query(`
      INSERT INTO agent_created_documents 
        (document_id, user_id, firm_id, task_id, original_content_hash, original_content_length, original_content_snapshot, work_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (document_id) DO NOTHING
    `, [documentId, userId, firmId, taskId, contentHash, content.length, snapshot, workType]);
    
    console.log(`[EditDiffLearning] Tracking agent-created document ${documentId} (${content.length} chars)`);
  } catch (e) {
    // Non-fatal
    if (!e.message?.includes('agent_created_documents')) {
      console.log('[EditDiffLearning] Track note:', e.message);
    }
  }
}

// =====================================================================
// 2. DETECT & DECOMPOSE: When a document is edited, compute the diff
// =====================================================================

/**
 * Called when a document is updated. Checks if it was agent-created and
 * if so, computes the diff and decomposes it into learning signals.
 * 
 * @param {string} documentId - The document that was updated
 * @param {string} newContent - The new content after editing
 * @param {string} editedBy - The user who edited it
 * @param {string} firmId - The firm
 * @returns {Array} Array of extracted signals, or empty if not agent-created
 */
export async function detectAndLearnFromEdit(documentId, newContent, editedBy, firmId) {
  if (!newContent || newContent.length < MIN_DOCUMENT_LENGTH) return [];
  
  await _ensureTable();
  
  try {
    // Check if this document was created by the agent
    const agentDoc = await query(`
      SELECT user_id, task_id, original_content_hash, original_content_length, 
             original_content_snapshot, work_type
      FROM agent_created_documents
      WHERE document_id = $1
      LIMIT 1
    `, [documentId]);
    
    if (agentDoc.rows.length === 0) return []; // Not agent-created
    
    const original = agentDoc.rows[0];
    
    // Only learn if the attorney who the agent worked for is the one editing
    if (original.user_id !== editedBy) return [];
    
    // Check if content actually changed
    const newHash = crypto.createHash('sha256').update(newContent).digest('hex');
    if (newHash === original.original_content_hash) return []; // No change
    
    const originalContent = original.original_content_snapshot || '';
    if (!originalContent) return [];
    
    // Compute the diff and extract signals
    const signals = decomposeDiff(originalContent, newContent, original);
    
    if (signals.length === 0) return [];
    
    // Calculate unchanged ratio (implicit approval of untouched content)
    const unchangedRatio = calculateUnchangedRatio(originalContent, newContent);
    
    // Store all signals
    for (const signal of signals.slice(0, MAX_SIGNALS_PER_DIFF)) {
      try {
        await query(`
          INSERT INTO edit_diff_signals 
            (user_id, firm_id, document_id, task_id, signal_type, signal_data,
             identity_dimension, extracted_principle, confidence, unchanged_ratio)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          original.user_id, firmId, documentId, original.task_id,
          signal.type, JSON.stringify(signal.data),
          signal.dimension, signal.principle,
          signal.confidence, unchangedRatio,
        ]);
      } catch (e) {
        // Non-fatal
      }
    }
    
    // Feed high-confidence signals into the attorney identity system
    await _feedIntoIdentity(original.user_id, firmId, signals, unchangedRatio);
    
    console.log(`[EditDiffLearning] Extracted ${signals.length} signals from edit of doc ${documentId} (${Math.round(unchangedRatio * 100)}% unchanged = implicit approval)`);
    return signals;
  } catch (e) {
    console.log('[EditDiffLearning] Detect note:', e.message);
    return [];
  }
}

// =====================================================================
// DIFF DECOMPOSITION: Break edits into typed learning signals
// =====================================================================

/**
 * Decompose the difference between original and edited content into
 * typed learning signals.
 */
function decomposeDiff(original, edited, docMeta) {
  const signals = [];
  
  // Split into lines for structural comparison
  const origLines = original.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const editLines = edited.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // 1. SUBSTITUTION detection: find lines that are similar but changed
  const substitutions = findSubstitutions(origLines, editLines);
  for (const sub of substitutions) {
    const principle = extractSubstitutionPrinciple(sub);
    signals.push({
      type: 'substitution',
      data: {
        original_text: sub.original.substring(0, SUBSTITUTION_CONTEXT_CHARS),
        edited_text: sub.edited.substring(0, SUBSTITUTION_CONTEXT_CHARS),
        similarity: sub.similarity,
      },
      dimension: classifySubstitutionDimension(sub),
      principle,
      confidence: 0.92,
    });
  }
  
  // 2. DELETION detection: lines in original that don't appear in edited
  const deletions = findDeletions(origLines, editLines);
  for (const del of deletions) {
    signals.push({
      type: 'deletion',
      data: {
        deleted_text: del.text.substring(0, SUBSTITUTION_CONTEXT_CHARS),
        context: del.context,
      },
      dimension: classifyDeletionDimension(del),
      principle: extractDeletionPrinciple(del),
      confidence: 0.88,
    });
  }
  
  // 3. ADDITION detection: lines in edited that don't appear in original
  const additions = findAdditions(origLines, editLines);
  for (const add of additions) {
    signals.push({
      type: 'addition',
      data: {
        added_text: add.text.substring(0, SUBSTITUTION_CONTEXT_CHARS),
        position: add.position,
      },
      dimension: classifyAdditionDimension(add),
      principle: extractAdditionPrinciple(add),
      confidence: 0.85,
    });
  }
  
  // 4. RESTRUCTURE detection: same content but moved to different position
  const restructures = findRestructures(origLines, editLines);
  for (const restructure of restructures) {
    signals.push({
      type: 'restructure',
      data: {
        moved_text: restructure.text.substring(0, SUBSTITUTION_CONTEXT_CHARS),
        from_position: restructure.fromPosition,
        to_position: restructure.toPosition,
        direction: restructure.toPosition < restructure.fromPosition ? 'moved_earlier' : 'moved_later',
      },
      dimension: 'structure',
      principle: extractRestructurePrinciple(restructure),
      confidence: 0.87,
    });
  }
  
  // 5. Vocabulary-level substitutions (word-for-word replacements within similar lines)
  for (const sub of substitutions) {
    const wordSubs = extractWordSubstitutions(sub.original, sub.edited);
    for (const ws of wordSubs) {
      signals.push({
        type: 'substitution',
        data: {
          original_word: ws.original,
          replacement_word: ws.replacement,
          context: ws.context,
        },
        dimension: 'vocabulary',
        principle: `Prefers "${ws.replacement}" over "${ws.original}"`,
        confidence: 0.93,
      });
    }
  }
  
  return signals;
}

/**
 * Find lines that are similar but changed (substitutions).
 * Uses Jaccard similarity on word sets to find the best match.
 */
function findSubstitutions(origLines, editLines) {
  const substitutions = [];
  const usedEditIndices = new Set();
  
  for (const origLine of origLines) {
    if (origLine.length < 15) continue; // Skip very short lines
    
    let bestMatch = null;
    let bestSim = 0;
    let bestIdx = -1;
    
    for (let i = 0; i < editLines.length; i++) {
      if (usedEditIndices.has(i)) continue;
      if (editLines[i].length < 15) continue;
      
      const sim = jaccardSimilarity(origLine, editLines[i]);
      // Similar but not identical = a substitution
      if (sim > 0.4 && sim < 0.98 && sim > bestSim) {
        bestSim = sim;
        bestMatch = editLines[i];
        bestIdx = i;
      }
    }
    
    if (bestMatch && bestIdx >= 0) {
      usedEditIndices.add(bestIdx);
      substitutions.push({
        original: origLine,
        edited: bestMatch,
        similarity: bestSim,
      });
    }
  }
  
  return substitutions.slice(0, 8); // Cap
}

/**
 * Find lines that were deleted (present in original, not in edited).
 */
function findDeletions(origLines, editLines) {
  const editSet = new Set(editLines.map(l => l.toLowerCase()));
  const deletions = [];
  
  for (let i = 0; i < origLines.length; i++) {
    const line = origLines[i];
    if (line.length < 10) continue;
    
    // Check if this line (or something very similar) exists in edited
    const inEdited = editSet.has(line.toLowerCase()) || 
      editLines.some(el => jaccardSimilarity(line, el) > 0.7);
    
    if (!inEdited) {
      deletions.push({
        text: line,
        position: i,
        context: i > 0 ? origLines[i - 1].substring(0, 40) : 'beginning',
      });
    }
  }
  
  return deletions.slice(0, 5); // Cap
}

/**
 * Find lines that were added (present in edited, not in original).
 */
function findAdditions(origLines, editLines) {
  const origSet = new Set(origLines.map(l => l.toLowerCase()));
  const additions = [];
  
  for (let i = 0; i < editLines.length; i++) {
    const line = editLines[i];
    if (line.length < 10) continue;
    
    const inOriginal = origSet.has(line.toLowerCase()) || 
      origLines.some(ol => jaccardSimilarity(line, ol) > 0.7);
    
    if (!inOriginal) {
      additions.push({
        text: line,
        position: i < editLines.length / 3 ? 'beginning' : i > editLines.length * 2 / 3 ? 'end' : 'middle',
      });
    }
  }
  
  return additions.slice(0, 5); // Cap
}

/**
 * Find content that was moved (same text, different position).
 */
function findRestructures(origLines, editLines) {
  const restructures = [];
  
  for (let origIdx = 0; origIdx < origLines.length; origIdx++) {
    const line = origLines[origIdx];
    if (line.length < 20) continue; // Only track meaningful sections
    
    for (let editIdx = 0; editIdx < editLines.length; editIdx++) {
      if (jaccardSimilarity(line, editLines[editIdx]) > 0.9) {
        // Same content but different position?
        const origRelPos = origIdx / origLines.length;
        const editRelPos = editIdx / editLines.length;
        
        if (Math.abs(origRelPos - editRelPos) > 0.15) { // Moved at least 15% of document
          restructures.push({
            text: line,
            fromPosition: origRelPos,
            toPosition: editRelPos,
          });
          break;
        }
      }
    }
  }
  
  return restructures.slice(0, 3); // Cap
}

/**
 * Extract word-level substitutions from two similar lines.
 */
function extractWordSubstitutions(original, edited) {
  const origWords = original.split(/\s+/);
  const editWords = edited.split(/\s+/);
  const subs = [];
  
  // Simple LCS-based word diff
  const minLen = Math.min(origWords.length, editWords.length);
  for (let i = 0; i < minLen; i++) {
    if (origWords[i] !== editWords[i] && 
        origWords[i].length > 2 && editWords[i].length > 2) {
      // Check this isn't just a position shift
      if (!editWords.includes(origWords[i]) || !origWords.includes(editWords[i])) {
        subs.push({
          original: origWords[i].replace(/[.,;:!?]$/g, ''),
          replacement: editWords[i].replace(/[.,;:!?]$/g, ''),
          context: origWords.slice(Math.max(0, i - 2), i + 3).join(' '),
        });
      }
    }
    if (subs.length >= 5) break;
  }
  
  return subs;
}

// =====================================================================
// SIGNAL CLASSIFICATION: What dimension of identity does each edit inform?
// =====================================================================

function classifySubstitutionDimension(sub) {
  const origLower = sub.original.toLowerCase();
  const editLower = sub.edited.toLowerCase();
  
  // Tone shift
  if (/\b(hereby|whereas|notwithstanding|pursuant|thereof|forthwith)\b/.test(origLower) &&
      !/\b(hereby|whereas|notwithstanding|pursuant|thereof|forthwith)\b/.test(editLower)) {
    return 'tone';
  }
  if (!/\b(hereby|whereas|notwithstanding|pursuant|thereof|forthwith)\b/.test(origLower) &&
      /\b(hereby|whereas|notwithstanding|pursuant|thereof|forthwith)\b/.test(editLower)) {
    return 'tone';
  }
  
  // Detail level (shorter = more concise preference)
  if (sub.edited.length < sub.original.length * 0.7) return 'detail_level';
  if (sub.edited.length > sub.original.length * 1.3) return 'detail_level';
  
  // Default to writing style
  return 'writing_style';
}

function classifyDeletionDimension(del) {
  const text = del.text.toLowerCase();
  
  if (/\b(furthermore|moreover|additionally|in addition|it should be noted)\b/.test(text)) {
    return 'detail_level'; // Removing filler → prefers concise
  }
  if (/\b(risk|caution|caveat|however|notwithstanding)\b/.test(text)) {
    return 'content_preference'; // Removing hedging
  }
  if (/^#{1,4}\s|^[A-Z][A-Z\s]{3,}:/.test(del.text)) {
    return 'structure'; // Removing headers
  }
  return 'content_preference';
}

function classifyAdditionDimension(add) {
  const text = add.text.toLowerCase();
  
  if (/\b(next step|action item|follow.?up|recommend|should)\b/.test(text)) {
    return 'content_preference'; // Adding action items → wants them
  }
  if (/\b(risk|caution|however|important|note)\b/.test(text)) {
    return 'content_preference'; // Adding risk language
  }
  if (/^#{1,4}\s|^[A-Z][A-Z\s]{3,}:/.test(add.text)) {
    return 'structure'; // Adding headers
  }
  return 'writing_style';
}

// =====================================================================
// PRINCIPLE EXTRACTION: The "why" behind each edit
// =====================================================================

function extractSubstitutionPrinciple(sub) {
  if (sub.edited.length < sub.original.length * 0.6) {
    return 'This attorney prefers CONCISE versions — cut the excess, get to the point';
  }
  if (sub.edited.length > sub.original.length * 1.5) {
    return 'This attorney wants MORE detail and thoroughness in this type of content';
  }
  
  // Check for formality shift
  const origFormal = (sub.original.match(/\b(pursuant|hereby|notwithstanding|whereas|thereof)\b/gi) || []).length;
  const editFormal = (sub.edited.match(/\b(pursuant|hereby|notwithstanding|whereas|thereof)\b/gi) || []).length;
  if (origFormal > editFormal) {
    return 'This attorney prefers PLAIN LANGUAGE — replace legalese with clear, direct language';
  }
  if (editFormal > origFormal) {
    return 'This attorney prefers FORMAL legal language in this context';
  }
  
  return `Attorney rewrote this passage — study the revision to match their voice`;
}

function extractDeletionPrinciple(del) {
  const text = del.text.toLowerCase();
  
  if (/\b(furthermore|moreover|additionally|in addition|it should be noted)\b/.test(text)) {
    return 'This attorney removes filler phrases — do NOT include transitional padding';
  }
  if (/\b(placeholder|insert|todo|tbd)\b/i.test(text)) {
    return 'NEVER include placeholder text — write complete content or nothing';
  }
  if (text.length > 100) {
    return 'This attorney deleted a substantial section — this content type is unwanted';
  }
  return 'Attorney removed this content — avoid similar content in future work';
}

function extractAdditionPrinciple(add) {
  const text = add.text.toLowerCase();
  
  if (/\b(next step|action item|follow.?up|recommend)\b/.test(text)) {
    return 'ALWAYS include specific next steps and action items — this attorney expects them';
  }
  if (/\b(deadline|date|by \w+ \d+|due)\b/.test(text)) {
    return 'ALWAYS include specific dates and deadlines — this attorney added them where missing';
  }
  if (/\b(risk|exposure|downside|liability)\b/.test(text)) {
    return 'ALWAYS include risk analysis — this attorney added it where the agent missed it';
  }
  return 'Attorney added content the agent missed — include this type of content proactively';
}

function extractRestructurePrinciple(restructure) {
  if (restructure.toPosition < restructure.fromPosition) {
    return 'This attorney prefers this type of content EARLIER in the document (bottom-line-up-front)';
  }
  return 'This attorney prefers this type of content LATER in the document';
}

// =====================================================================
// FEED INTO IDENTITY SYSTEM
// =====================================================================

async function _feedIntoIdentity(userId, firmId, signals, unchangedRatio) {
  try {
    const { learnFromCorrection, storePreference } = await import('./attorneyIdentity.js');
    
    // Group signals by dimension for stronger principles
    const byDimension = {};
    for (const sig of signals) {
      if (!sig.dimension || !sig.principle) continue;
      if (!byDimension[sig.dimension]) byDimension[sig.dimension] = [];
      byDimension[sig.dimension].push(sig);
    }
    
    // Store the strongest principle per dimension
    for (const [dimension, dimSignals] of Object.entries(byDimension)) {
      // Pick the highest-confidence signal
      dimSignals.sort((a, b) => b.confidence - a.confidence);
      const best = dimSignals[0];
      
      await storePreference(
        userId, firmId, 
        `edit_learned_${dimension}`, 
        best.principle,
        'critical',
        best.confidence
      );
    }
    
    // If the lawyer left most content unchanged, that's an implicit approval signal
    if (unchangedRatio > 0.8) {
      // Boost the identity maturity — high unchanged ratio means the agent
      // is already close to the attorney's voice
      console.log(`[EditDiffLearning] ${Math.round(unchangedRatio * 100)}% unchanged — strong implicit approval`);
    }
    
    // Vocabulary substitutions are especially valuable — store them as correction principles
    const vocabSignals = signals.filter(s => s.dimension === 'vocabulary' && s.type === 'substitution');
    for (const vs of vocabSignals.slice(0, 5)) {
      const feedbackText = `Replace "${vs.data.original_word}" with "${vs.data.replacement_word}" — attorney made this substitution`;
      await learnFromCorrection(userId, firmId, feedbackText, 'document editing');
    }
    
  } catch (e) {
    console.log('[EditDiffLearning] Identity feed note:', e.message);
  }
}

// =====================================================================
// RETRIEVAL: Get edit-learned preferences for prompt injection
// =====================================================================

/**
 * Get the strongest edit-learned signals for this attorney.
 * Returns formatted text for prompt injection.
 */
export async function getEditLearnedPreferences(userId, firmId) {
  await _ensureTable();
  
  try {
    // Get the most impactful edit signals (high confidence, recent)
    const result = await query(`
      SELECT signal_type, identity_dimension, extracted_principle, confidence,
             signal_data, created_at
      FROM edit_diff_signals
      WHERE user_id = $1 AND firm_id = $2
        AND confidence >= 0.85
        AND extracted_principle IS NOT NULL
      ORDER BY confidence DESC, created_at DESC
      LIMIT 10
    `, [userId, firmId]);
    
    if (result.rows.length === 0) return null;
    
    // Deduplicate similar principles
    const seen = new Set();
    const uniquePrinciples = [];
    for (const row of result.rows) {
      const key = row.extracted_principle.toLowerCase().substring(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        uniquePrinciples.push(row);
      }
    }
    
    if (uniquePrinciples.length === 0) return null;
    
    // Get vocabulary substitutions separately (most actionable)
    const vocabResult = await query(`
      SELECT signal_data FROM edit_diff_signals
      WHERE user_id = $1 AND firm_id = $2
        AND identity_dimension = 'vocabulary'
        AND signal_type = 'substitution'
      ORDER BY confidence DESC, created_at DESC
      LIMIT 8
    `, [userId, firmId]);
    
    let output = `\n## LEARNED FROM ATTORNEY'S DOCUMENT EDITS (high confidence)\n`;
    output += `These preferences were learned from how the attorney edited agent work:\n`;
    
    for (const p of uniquePrinciples.slice(0, 5)) {
      output += `- ${p.extracted_principle}\n`;
    }
    
    // Add vocabulary preferences
    if (vocabResult.rows.length >= 2) {
      output += `\n**Vocabulary preferences (attorney's own substitutions):**\n`;
      for (const row of vocabResult.rows.slice(0, 5)) {
        const data = typeof row.signal_data === 'string' ? JSON.parse(row.signal_data) : row.signal_data;
        if (data.original_word && data.replacement_word) {
          output += `- Use "${data.replacement_word}" not "${data.original_word}"\n`;
        }
      }
    }
    
    return output;
  } catch (e) {
    return null;
  }
}

// =====================================================================
// UTILITIES
// =====================================================================

/**
 * Jaccard similarity between two strings (word-level).
 */
function jaccardSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate what fraction of the original content was left unchanged.
 * High unchanged ratio = strong implicit approval of the agent's work.
 */
function calculateUnchangedRatio(original, edited) {
  const origSentences = original.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (origSentences.length === 0) return 0;
  
  let unchanged = 0;
  for (const sentence of origSentences) {
    // Check if this sentence (or very similar) exists in edited
    if (edited.includes(sentence.trim()) || 
        edited.split(/[.!?]+/).some(es => jaccardSimilarity(sentence, es) > 0.85)) {
      unchanged++;
    }
  }
  
  return unchanged / origSentences.length;
}
