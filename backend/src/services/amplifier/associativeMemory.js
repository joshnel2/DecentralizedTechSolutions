/**
 * Associative Memory Network
 * 
 * THE MISSING COGNITIVE LAYER: Maps how each lawyer uniquely connects
 * concepts during their reasoning process.
 * 
 * Current AI systems learn WHAT tools to use (tool chains) and WHAT style
 * to write in (identity). But they don't learn the invisible step between:
 * HOW the lawyer connects what they SEE to what they THINK OF next.
 * 
 * When a lawyer reads a contract and spots an indemnification clause, then
 * immediately searches for "breach of fiduciary duty" — that associative
 * leap IS their expertise. Another lawyer seeing the same clause would
 * reach for a different concept. The connection is the cognition.
 * 
 * HOW IT WORKS:
 * 
 * 1. During task execution, analyze ADJACENT action pairs with content:
 *    - read_document_content returns text containing "indemnification"
 *    - Next action is search_document_content("breach of fiduciary duty")
 *    - Store: {source: "indemnification", target: "breach of fiduciary duty"}
 * 
 * 2. Over time, edges strengthen (approved tasks) or weaken (rejections).
 *    The graph becomes a unique map of THIS lawyer's reasoning patterns.
 * 
 * 3. At task time, when the agent reads content containing a concept that
 *    has strong association edges, inject: "This attorney typically connects
 *    [X] with [Y] — consider whether that applies here."
 * 
 * 4. Cross-matter transfer: associations learned on personal injury cases
 *    can inform how the lawyer approaches commercial disputes, because
 *    cognitive patterns transfer across matter types.
 * 
 * PRIVACY: All edges scoped to user_id + firm_id. Never shared.
 */

import { query } from '../../db/connection.js';

// =====================================================================
// CONFIGURATION
// =====================================================================

const MAX_CONCEPT_LENGTH = 200;
const MAX_EDGES_PER_TASK = 10;          // Cap associations extracted per task
const MIN_STRENGTH_FOR_PROMPT = 0.55;   // Min edge strength to inject
const MAX_ASSOCIATIONS_IN_PROMPT = 4;   // Cap associations injected per task
const STRENGTH_BOOST_ON_APPROVAL = 0.08;
const STRENGTH_DECAY_ON_REJECTION = 0.15;
const MIN_OBSERVATIONS_FOR_PROMPT = 2;  // Need at least 2 observations

// Concept extraction patterns
const LEGAL_CONCEPT_PATTERNS = [
  // Contract concepts
  /\b(indemnif(?:y|ication)|hold harmless|limitation of liability|force majeure|liquidated damages|warranty|representation|covenant|condition precedent|termination|non-compete|confidentiality|assignment|waiver|arbitration|governing law|choice of law|severability)\b/gi,
  // Litigation concepts
  /\b(discovery|deposition|interrogator(?:y|ies)|motion to dismiss|summary judgment|preliminary injunction|class action|statute of limitations|standing|jurisdiction|venue|damages|negligence|breach of contract|fraud|fiduciary duty|due process|equal protection)\b/gi,
  // Regulatory / compliance
  /\b(compliance|regulatory|HIPAA|GDPR|ADA|OSHA|SEC|antitrust|environmental|zoning|permitting|licensing)\b/gi,
  // Case management concepts
  /\b(sol|statute of limitation|deadline|filing|service|motion|brief|hearing|trial|settlement|mediation|appeal)\b/gi,
  // Financial concepts in legal context
  /\b(billing|retainer|contingency|hourly rate|fee agreement|trust account|escrow|receivable|collection)\b/gi,
];

// Read tools (what was seen)
const READ_TOOLS = new Set([
  'get_matter', 'read_document_content', 'search_document_content',
  'find_and_read_document', 'list_documents', 'web_search',
  'search_case_law', 'read_webpage', 'lookup_cplr',
]);

// Action tools (what was done next)
const ACTION_TOOLS = new Set([
  'search_document_content', 'web_search', 'search_case_law',
  'lookup_cplr', 'create_document', 'add_matter_note',
  'create_task', 'think_and_plan', 'draft_legal_document',
]);

// Auto-migration
let _tableEnsured = false;
async function _ensureTable() {
  if (_tableEnsured) return;
  _tableEnsured = true;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS associative_memory_edges (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        source_concept VARCHAR(200) NOT NULL,
        target_concept VARCHAR(200) NOT NULL,
        association_type VARCHAR(30) NOT NULL,
        context_work_type VARCHAR(50),
        context_matter_type VARCHAR(50),
        strength DECIMAL(3,2) DEFAULT 0.50,
        observation_count INTEGER DEFAULT 1,
        source_task_ids TEXT[],
        first_observed TIMESTAMPTZ DEFAULT NOW(),
        last_observed TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, firm_id, source_concept, target_concept, association_type)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_assoc_memory_user ON associative_memory_edges(user_id, firm_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_assoc_memory_source ON associative_memory_edges(user_id, firm_id, source_concept)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_assoc_memory_strength ON associative_memory_edges(user_id, firm_id, strength DESC)`);
  } catch (e) {
    if (!e.message?.includes('already exists')) {
      console.log('[AssociativeMemory] Auto-migration note:', e.message);
    }
  }
}

// =====================================================================
// EXTRACTION: Analyze task execution to find associative patterns
// =====================================================================

/**
 * Extract associative edges from a completed task's action history.
 * Called after task completion (before approval/rejection).
 * 
 * @param {string} userId - The attorney
 * @param {string} firmId - The firm
 * @param {string} taskId - The completed task
 * @param {Array} actionsHistory - The task's action sequence
 * @param {string} workType - Classified work type
 * @param {string} matterType - The matter's type (if known)
 */
export async function extractAssociations(userId, firmId, taskId, actionsHistory, workType, matterType) {
  if (!actionsHistory || actionsHistory.length < 3) return [];
  
  await _ensureTable();
  
  const edges = [];
  
  try {
    // Walk through adjacent action pairs
    for (let i = 0; i < actionsHistory.length - 1; i++) {
      const current = actionsHistory[i];
      const next = actionsHistory[i + 1];
      
      // Skip failed actions
      if (current.success === false || next.success === false) continue;
      
      // Pattern 1: READ → SEARCH (content triggered a search)
      if (READ_TOOLS.has(current.tool) && ACTION_TOOLS.has(next.tool)) {
        const readContent = _getActionContent(current);
        const nextQuery = _getActionQuery(next);
        
        if (readContent && nextQuery) {
          const sourceConcepts = extractConcepts(readContent);
          const targetConcepts = extractConcepts(nextQuery);
          
          // Also treat the raw search query as a concept
          if (nextQuery.length > 3 && nextQuery.length < MAX_CONCEPT_LENGTH) {
            targetConcepts.push(nextQuery.toLowerCase().trim());
          }
          
          for (const source of sourceConcepts) {
            for (const target of targetConcepts) {
              if (source !== target && source.length > 2 && target.length > 2) {
                edges.push({
                  source: source.substring(0, MAX_CONCEPT_LENGTH),
                  target: target.substring(0, MAX_CONCEPT_LENGTH),
                  type: 'content_to_search',
                });
              }
            }
          }
        }
      }
      
      // Pattern 2: READ → CREATE (reading led to creating something)
      if (READ_TOOLS.has(current.tool) && 
          ['create_document', 'add_matter_note', 'draft_legal_document'].includes(next.tool)) {
        const readContent = _getActionContent(current);
        const createdContent = _getActionContent(next);
        
        if (readContent && createdContent) {
          const readConcepts = extractConcepts(readContent);
          const createdConcepts = extractConcepts(createdContent);
          
          // Find concepts in the created content that WEREN'T in the read content
          // These represent the lawyer's added insight / associative leap
          for (const created of createdConcepts) {
            if (!readConcepts.includes(created)) {
              // This concept appeared in the output but not the input = associative connection
              for (const read of readConcepts.slice(0, 3)) {
                if (read !== created) {
                  edges.push({
                    source: read.substring(0, MAX_CONCEPT_LENGTH),
                    target: created.substring(0, MAX_CONCEPT_LENGTH),
                    type: 'finding_to_recommendation',
                  });
                }
              }
            }
          }
        }
      }
      
      // Pattern 3: THINK_AND_PLAN → ACTION (planned thinking led to specific action)
      if (current.tool === 'think_and_plan' && ACTION_TOOLS.has(next.tool)) {
        const planContent = _getActionContent(current);
        const actionQuery = _getActionQuery(next);
        
        if (planContent && actionQuery) {
          const planConcepts = extractConcepts(planContent);
          if (actionQuery.length > 3) {
            for (const concept of planConcepts.slice(0, 3)) {
              edges.push({
                source: concept.substring(0, MAX_CONCEPT_LENGTH),
                target: actionQuery.substring(0, MAX_CONCEPT_LENGTH).toLowerCase(),
                type: 'concept_to_concept',
              });
            }
          }
        }
      }
    }
    
    // Deduplicate and store
    const uniqueEdges = _deduplicateEdges(edges).slice(0, MAX_EDGES_PER_TASK);
    
    for (const edge of uniqueEdges) {
      await _storeEdge(userId, firmId, taskId, edge, workType, matterType);
    }
    
    if (uniqueEdges.length > 0) {
      console.log(`[AssociativeMemory] Extracted ${uniqueEdges.length} associative edges from task ${taskId}`);
    }
    
    return uniqueEdges;
  } catch (e) {
    console.log('[AssociativeMemory] Extraction note:', e.message);
    return [];
  }
}

/**
 * Reinforce associations from an approved task (edges get stronger).
 */
export async function reinforceAssociations(userId, firmId, taskId) {
  try {
    await query(`
      UPDATE associative_memory_edges
      SET strength = LEAST(0.99, strength + $1),
          last_observed = NOW()
      WHERE user_id = $2 AND firm_id = $3 
        AND $4 = ANY(source_task_ids)
    `, [STRENGTH_BOOST_ON_APPROVAL, userId, firmId, taskId]);
  } catch (e) {
    // Non-fatal
  }
}

/**
 * Weaken associations from a rejected task (edges get weaker).
 */
export async function weakenAssociations(userId, firmId, taskId) {
  try {
    await query(`
      UPDATE associative_memory_edges
      SET strength = GREATEST(0.05, strength - $1),
          last_observed = NOW()
      WHERE user_id = $2 AND firm_id = $3
        AND $4 = ANY(source_task_ids)
    `, [STRENGTH_DECAY_ON_REJECTION, userId, firmId, taskId]);
  } catch (e) {
    // Non-fatal
  }
}

// =====================================================================
// RETRIEVAL: Find relevant associations for a new task
// =====================================================================

/**
 * Given the content the agent has read so far in a task, find
 * associations that this attorney typically makes.
 * 
 * @param {string} userId - The attorney
 * @param {string} firmId - The firm
 * @param {string} currentContent - Content the agent has read so far
 * @returns {string|null} Formatted associations for prompt injection
 */
export async function getRelevantAssociations(userId, firmId, currentContent) {
  if (!currentContent || currentContent.length < 50) return null;
  
  await _ensureTable();
  
  try {
    // Extract concepts from the current content
    const currentConcepts = extractConcepts(currentContent);
    if (currentConcepts.length === 0) return null;
    
    // Find strong edges where the source concept matches what we're reading
    const placeholders = currentConcepts.slice(0, 10).map((_, i) => `$${i + 4}`).join(', ');
    
    const result = await query(`
      SELECT source_concept, target_concept, association_type, 
             strength, observation_count, context_work_type
      FROM associative_memory_edges
      WHERE user_id = $1 AND firm_id = $2
        AND strength >= $3
        AND observation_count >= ${MIN_OBSERVATIONS_FOR_PROMPT}
        AND source_concept IN (${placeholders})
      ORDER BY strength DESC, observation_count DESC
      LIMIT ${MAX_ASSOCIATIONS_IN_PROMPT + 2}
    `, [userId, firmId, MIN_STRENGTH_FOR_PROMPT, ...currentConcepts.slice(0, 10)]);
    
    if (result.rows.length === 0) return null;
    
    // Format for prompt injection
    let output = `\n## ATTORNEY'S REASONING PATTERNS (learned from their work)\n`;
    output += `When this attorney encounters certain concepts, they typically connect them to:\n`;
    
    const seen = new Set();
    let count = 0;
    for (const row of result.rows) {
      const key = `${row.source_concept}->${row.target_concept}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      const strength = Math.round(parseFloat(row.strength) * 100);
      output += `- When seeing "${row.source_concept}" → consider "${row.target_concept}" (${strength}% confidence, observed ${row.observation_count}x)\n`;
      count++;
      if (count >= MAX_ASSOCIATIONS_IN_PROMPT) break;
    }
    
    output += `Apply these connections if relevant to the current task.\n`;
    
    return output;
  } catch (e) {
    return null;
  }
}

/**
 * Get the attorney's strongest associative patterns overall (not task-specific).
 * Used for the identity profile / cognitive signature.
 */
export async function getTopAssociations(userId, firmId, limit = 15) {
  await _ensureTable();
  
  try {
    const result = await query(`
      SELECT source_concept, target_concept, association_type,
             strength, observation_count, context_work_type
      FROM associative_memory_edges
      WHERE user_id = $1 AND firm_id = $2
        AND strength >= 0.50
        AND observation_count >= 2
      ORDER BY strength * observation_count DESC
      LIMIT $3
    `, [userId, firmId, limit]);
    
    return result.rows;
  } catch (e) {
    return [];
  }
}

// =====================================================================
// CONCEPT EXTRACTION
// =====================================================================

/**
 * Extract legal concepts from text content.
 * Uses pattern matching for known legal terms + NP extraction heuristics.
 */
export function extractConcepts(text) {
  if (!text || text.length < 10) return [];
  
  const concepts = new Set();
  const textLower = text.toLowerCase();
  
  // 1. Match known legal concept patterns
  for (const pattern of LEGAL_CONCEPT_PATTERNS) {
    const matches = textLower.match(pattern);
    if (matches) {
      for (const match of matches) {
        concepts.add(match.toLowerCase().trim());
      }
    }
  }
  
  // 2. Extract capitalized multi-word phrases (likely proper nouns / legal terms)
  const capitalizedPhrases = text.match(/(?:[A-Z][a-z]+(?:\s+(?:of|for|and|the|in|to|v\.?)\s+)?){2,4}[A-Z][a-z]+/g);
  if (capitalizedPhrases) {
    for (const phrase of capitalizedPhrases.slice(0, 5)) {
      if (phrase.length > 5 && phrase.length < MAX_CONCEPT_LENGTH) {
        concepts.add(phrase.toLowerCase().trim());
      }
    }
  }
  
  // 3. Extract CPLR section references
  const cplrRefs = text.match(/CPLR\s*§?\s*\d+[\w.]*/gi);
  if (cplrRefs) {
    for (const ref of cplrRefs) {
      concepts.add(ref.toLowerCase().trim());
    }
  }
  
  // 4. Extract statute references
  const statRefs = text.match(/\d+\s+(?:U\.S\.C|N\.Y\.|C\.F\.R)\.?\s*§?\s*\d+/g);
  if (statRefs) {
    for (const ref of statRefs) {
      concepts.add(ref.toLowerCase().trim());
    }
  }
  
  return [...concepts].slice(0, 20);
}

// =====================================================================
// INTERNAL HELPERS
// =====================================================================

function _getActionContent(action) {
  // Try to get readable content from an action's args or result
  if (action.args?.content) return action.args.content.substring(0, 3000);
  if (action.args?.search_term) return action.args.search_term;
  if (action.args?.query) return action.args.query;
  if (action.result && typeof action.result === 'string') return action.result.substring(0, 3000);
  if (action.result?.content) return action.result.content.substring(0, 3000);
  if (action.result?.text) return action.result.text.substring(0, 3000);
  // For think_and_plan
  if (action.args?.analysis) return action.args.analysis;
  if (action.args?.plan) return action.args.plan;
  return null;
}

function _getActionQuery(action) {
  // Get the "query" aspect of an action (what was searched for / intended)
  if (action.args?.search_term) return action.args.search_term;
  if (action.args?.query) return action.args.query;
  if (action.args?.name) return action.args.name;
  if (action.args?.title) return action.args.title;
  if (action.args?.section) return `CPLR ${action.args.section}`;
  return null;
}

function _deduplicateEdges(edges) {
  const seen = new Map();
  for (const edge of edges) {
    const key = `${edge.source}|${edge.target}|${edge.type}`;
    if (!seen.has(key)) {
      seen.set(key, edge);
    }
  }
  return [...seen.values()];
}

async function _storeEdge(userId, firmId, taskId, edge, workType, matterType) {
  try {
    await query(`
      INSERT INTO associative_memory_edges
        (user_id, firm_id, source_concept, target_concept, association_type,
         context_work_type, context_matter_type, strength, observation_count, source_task_ids)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0.50, 1, ARRAY[$8]::text[])
      ON CONFLICT (user_id, firm_id, source_concept, target_concept, association_type)
      DO UPDATE SET
        strength = LEAST(0.99, associative_memory_edges.strength + 0.05),
        observation_count = associative_memory_edges.observation_count + 1,
        source_task_ids = array_append(associative_memory_edges.source_task_ids, $8),
        last_observed = NOW()
    `, [userId, firmId, edge.source, edge.target, edge.type, workType, matterType, taskId]);
  } catch (e) {
    // Non-fatal: table might not exist yet
  }
}
