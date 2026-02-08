/**
 * Identity Replay Engine
 * 
 * THE CORE IDEA: Instead of telling the model "this attorney prefers concise
 * output" (a label), or showing it "here's an excerpt" (an exemplar), we
 * REPLAY the attorney's actual decision-making process.
 * 
 * Every approved task is a recorded firing pattern — what the attorney's
 * brain did when faced with a problem. When a similar problem arises, we
 * don't approximate. We replay.
 * 
 * HOW IT WORKS:
 * 
 * 1. CAPTURE: When a task is approved, store its full execution trace:
 *    - What tools were called, in what order, with what arguments
 *    - What was read before anything was written
 *    - How the deliverable was structured (note length, doc sections, task count)
 *    - The final approved result shape
 *    - Embed the goal for similarity matching
 * 
 * 2. MATCH: When a new task comes in, embed the goal and find the 3 closest
 *    approved execution traces by vector similarity.
 * 
 * 3. COMPRESS: Turn those raw traces into a "decision replay" — a reasoning
 *    skeleton that captures the HOW and WHY, not just the WHAT.
 * 
 * 4. INJECT: The replay becomes the PRIMARY instruction. Not supplementary
 *    to the brief — it IS the brief. The agent follows the attorney's own
 *    approved decision path, adapted to new facts.
 * 
 * THIS IS TODAY'S NEURALINK:
 * We can't read thoughts. But we can replay decisions. The attorney's 
 * approved execution traces ARE their thought process, recorded. Over months,
 * the library grows until every new task is just a variation of something
 * the attorney has already done and approved. The gap between "what the AI
 * does" and "what the attorney would do" approaches zero.
 * 
 * MEMORY MANAGEMENT:
 * - Max 100 replay traces per attorney (oldest pruned)
 * - Each compressed replay is ~600-800 chars in the prompt
 * - Only 1-2 replays injected per task (best match + optional second)
 * - Embeddings reuse existing Azure OpenAI infrastructure
 */

import { query } from '../../db/connection.js';
import { generateEmbedding } from '../embeddingService.js';

// =====================================================================
// CONFIGURATION
// =====================================================================

const MAX_REPLAYS_PER_ATTORNEY = 100;
const MAX_REPLAYS_IN_PROMPT = 2;
const SIMILARITY_THRESHOLD = 0.50;
const MAX_REPLAY_PROMPT_CHARS = 1500;     // Budget for replay in prompt
const MAX_TRACE_TOOLS = 25;               // Cap tool sequence length stored
const MIN_ACTIONS_FOR_REPLAY = 5;         // Don't store trivially short tasks

// Auto-migration
let _tableEnsured = false;

async function _ensureTable() {
  if (_tableEnsured) return;
  _tableEnsured = true;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS identity_replays (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        task_id UUID NOT NULL,
        goal_text TEXT NOT NULL,
        work_type VARCHAR(50),
        
        -- The execution trace (the "recorded neuron firing")
        tool_sequence TEXT[] NOT NULL,                -- Ordered list of tools called
        tool_args_summary JSONB,                      -- Condensed args (what was read, what was created)
        phase_sequence TEXT[],                         -- Phase transitions: ['discovery','analysis','action','review']
        
        -- The outcome shape (what "done" looked like)
        deliverable_shape JSONB NOT NULL,              -- { documents: [{name, chars}], notes: count, tasks: [{title}], events: count }
        reading_before_writing TEXT[],                 -- What was read before the first write tool
        first_write_tool VARCHAR(50),                  -- What the first creative action was
        document_structure TEXT,                        -- Headers/sections of the main deliverable
        
        -- Quality signal
        evaluation_score INTEGER,                      -- 0-100 from evaluateTask
        approval_strength VARCHAR(20) DEFAULT 'approved', -- 'approved', 'approved_with_feedback'
        
        -- Compressed reasoning skeleton (the replay itself)
        reasoning_skeleton TEXT,                        -- Human-readable compressed replay
        
        -- For semantic matching
        goal_embedding VECTOR(1536),
        
        -- Metadata
        duration_seconds INTEGER,
        iteration_count INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_identity_replays_user ON identity_replays(user_id, firm_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_identity_replays_worktype ON identity_replays(user_id, firm_id, work_type)`);
  } catch (e) {
    if (!e.message?.includes('already exists')) {
      console.log('[IdentityReplay] Auto-migration note:', e.message);
    }
  }
}

// =====================================================================
// CAPTURE: Record an approved task's execution trace as a replay
// =====================================================================

/**
 * Capture an approved task's execution trace for future replay.
 * Called from the review queue approve endpoint.
 * 
 * @param {string} userId - The attorney who approved
 * @param {string} firmId - The firm
 * @param {string} taskId - The approved task
 * @param {object} taskData - Task data: { goal, workType, actionsHistory, result, evaluation, duration, iterations }
 */
export async function captureReplay(userId, firmId, taskId, taskData) {
  await _ensureTable();

  try {
    const {
      goal, workType, actionsHistory, result,
      evaluationScore, duration, iterations, approvalFeedback,
    } = taskData;

    if (!actionsHistory || actionsHistory.length < MIN_ACTIONS_FOR_REPLAY) {
      console.log(`[IdentityReplay] Skipping capture: only ${actionsHistory?.length || 0} actions (min ${MIN_ACTIONS_FOR_REPLAY})`);
      return null;
    }

    // ===== Extract the execution trace =====
    
    // 1. Tool sequence (ordered list of tools called)
    const toolSequence = actionsHistory
      .filter(a => a.success !== false)
      .map(a => a.tool)
      .slice(0, MAX_TRACE_TOOLS);

    // 2. Condensed tool args (what was actually read/created, not raw args)
    const toolArgsSummary = _extractToolArgsSummary(actionsHistory);

    // 3. Phase sequence (how the agent moved through phases)
    const phaseSequence = _extractPhaseSequence(actionsHistory);

    // 4. Reading before writing (what context was gathered before creating)
    const readingBeforeWriting = _extractReadingBeforeWriting(actionsHistory);

    // 5. First write tool
    const writeTools = ['add_matter_note', 'create_document', 'create_task', 'create_calendar_event', 'update_matter'];
    const firstWrite = actionsHistory.find(a => writeTools.includes(a.tool) && a.success !== false);
    const firstWriteTool = firstWrite?.tool || null;

    // 6. Deliverable shape
    const deliverableShape = _extractDeliverableShape(actionsHistory, result);

    // 7. Document structure (if a document was created)
    const documentStructure = _extractDocumentStructure(actionsHistory);

    // 8. Build the reasoning skeleton (the compressed replay)
    const reasoningSkeleton = _buildReasoningSkeleton({
      goal, workType, toolSequence, toolArgsSummary,
      readingBeforeWriting, firstWriteTool, deliverableShape,
      documentStructure, phaseSequence, duration, iterations,
    });

    // 9. Embed the goal for similarity matching
    let goalEmbedding = null;
    try {
      const embResult = await generateEmbedding(goal, firmId);
      goalEmbedding = embResult.embedding;
    } catch (e) {
      console.log('[IdentityReplay] Embedding skipped:', e.message);
    }

    // 10. Determine approval strength
    const approvalStrength = approvalFeedback ? 'approved_with_feedback' : 'approved';

    // Store the replay
    await query(`
      INSERT INTO identity_replays (
        user_id, firm_id, task_id, goal_text, work_type,
        tool_sequence, tool_args_summary, phase_sequence,
        deliverable_shape, reading_before_writing, first_write_tool,
        document_structure, evaluation_score, approval_strength,
        reasoning_skeleton, goal_embedding,
        duration_seconds, iteration_count
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16,
        $17, $18
      )
    `, [
      userId, firmId, taskId, goal, workType,
      toolSequence, JSON.stringify(toolArgsSummary), phaseSequence,
      JSON.stringify(deliverableShape), readingBeforeWriting, firstWriteTool,
      documentStructure, evaluationScore, approvalStrength,
      reasoningSkeleton, goalEmbedding,
      duration, iterations,
    ]);

    // Prune old replays
    await _pruneReplays(userId, firmId);

    console.log(`[IdentityReplay] Captured replay for task ${taskId}: ${toolSequence.length} tools, skeleton ${reasoningSkeleton.length} chars`);
    return { stored: true, toolCount: toolSequence.length };
  } catch (error) {
    console.log('[IdentityReplay] Capture note:', error.message);
    return null;
  }
}

// =====================================================================
// MATCH: Find the closest approved execution traces for a new task
// =====================================================================

/**
 * Find the most relevant replays for a new task.
 * Uses embedding similarity on goal text, falls back to work-type matching.
 * 
 * @param {string} userId - The attorney
 * @param {string} firmId - The firm
 * @param {string} goal - The new task's goal
 * @param {string} workType - Classified work type
 * @returns {Array} Matching replays, ordered by relevance
 */
export async function findMatchingReplays(userId, firmId, goal, workType) {
  await _ensureTable();

  try {
    let replays = [];

    // ===== Strategy 1: Embedding similarity (best accuracy) =====
    try {
      const goalEmb = await generateEmbedding(goal, firmId);
      if (goalEmb?.embedding) {
        const results = await query(`
          SELECT id, goal_text, work_type, tool_sequence, reasoning_skeleton,
                 deliverable_shape, reading_before_writing, first_write_tool,
                 document_structure, evaluation_score, approval_strength,
                 duration_seconds, iteration_count,
                 1 - (goal_embedding <=> $1::vector) AS similarity
          FROM identity_replays
          WHERE user_id = $2 AND firm_id = $3
            AND goal_embedding IS NOT NULL
          ORDER BY goal_embedding <=> $1::vector
          LIMIT $4
        `, [goalEmb.embedding, userId, firmId, MAX_REPLAYS_IN_PROMPT + 3]);

        for (const row of results.rows) {
          if (parseFloat(row.similarity) >= SIMILARITY_THRESHOLD) {
            replays.push({
              ...row,
              similarity: parseFloat(row.similarity),
              matchMethod: 'embedding',
            });
          }
        }
      }
    } catch (e) {
      console.log('[IdentityReplay] Embedding search skipped:', e.message);
    }

    // ===== Strategy 2: Work-type fallback =====
    if (replays.length < MAX_REPLAYS_IN_PROMPT) {
      const needed = MAX_REPLAYS_IN_PROMPT - replays.length;
      const existingIds = replays.map(r => r.id);
      
      const fallbackResults = await query(`
        SELECT id, goal_text, work_type, tool_sequence, reasoning_skeleton,
               deliverable_shape, reading_before_writing, first_write_tool,
               document_structure, evaluation_score, approval_strength,
               duration_seconds, iteration_count
        FROM identity_replays
        WHERE user_id = $1 AND firm_id = $2
          AND work_type = $3
          ${existingIds.length > 0 ? `AND id NOT IN (${existingIds.map((_, i) => `$${i + 5}`).join(',')})` : ''}
        ORDER BY evaluation_score DESC NULLS LAST, created_at DESC
        LIMIT $4
      `, [userId, firmId, workType, needed, ...existingIds]);

      for (const row of fallbackResults.rows) {
        replays.push({
          ...row,
          similarity: null,
          matchMethod: 'work_type',
        });
      }
    }

    if (replays.length > 0) {
      console.log(`[IdentityReplay] Found ${replays.length} matching replays (method: ${replays[0].matchMethod})`);
    }

    return replays.slice(0, MAX_REPLAYS_IN_PROMPT);
  } catch (error) {
    console.log('[IdentityReplay] Match note:', error.message);
    return [];
  }
}

// =====================================================================
// COMPRESS: Build the reasoning skeleton from execution trace
// =====================================================================

/**
 * Build a human-readable reasoning skeleton from execution trace data.
 * This is the compressed "replay" that gets injected into the prompt.
 */
function _buildReasoningSkeleton(data) {
  const {
    goal, workType, toolSequence, toolArgsSummary,
    readingBeforeWriting, firstWriteTool, deliverableShape,
    documentStructure, phaseSequence, duration, iterations,
  } = data;

  const parts = [];

  // 1. What type of task and how it was handled
  parts.push(`Task type: ${workType || 'general'} | ${iterations || '?'} iterations | ${Math.round((duration || 0) / 60)}min`);

  // 2. What was read first (the preparation phase)
  if (readingBeforeWriting && readingBeforeWriting.length > 0) {
    parts.push(`Preparation: Read ${readingBeforeWriting.slice(0, 5).join(', ')} before writing anything`);
  }

  // 3. The decision flow (condensed tool sequence)
  const condensedFlow = _condenseToolSequence(toolSequence);
  if (condensedFlow) {
    parts.push(`Decision flow: ${condensedFlow}`);
  }

  // 4. What was created (deliverables)
  const deliverableDesc = [];
  if (deliverableShape.documents?.length > 0) {
    for (const doc of deliverableShape.documents) {
      deliverableDesc.push(`doc: "${doc.name}" (~${doc.chars} chars)`);
    }
  }
  if (deliverableShape.noteCount > 0) deliverableDesc.push(`${deliverableShape.noteCount} note(s)`);
  if (deliverableShape.tasks?.length > 0) {
    deliverableDesc.push(`${deliverableShape.tasks.length} task(s): ${deliverableShape.tasks.slice(0, 3).map(t => t.title).join(', ')}`);
  }
  if (deliverableShape.eventCount > 0) deliverableDesc.push(`${deliverableShape.eventCount} calendar event(s)`);
  
  if (deliverableDesc.length > 0) {
    parts.push(`Deliverables: ${deliverableDesc.join(' | ')}`);
  }

  // 5. Document structure (if applicable)
  if (documentStructure) {
    parts.push(`Document structure: ${documentStructure}`);
  }

  // 6. First write action (what the attorney chose to create first)
  if (firstWriteTool) {
    parts.push(`First creative action: ${firstWriteTool.replace(/_/g, ' ')}`);
  }

  return parts.join('\n');
}

/**
 * Condense a tool sequence into a readable decision flow.
 * e.g. "get_matter → read_document(x3) → think_and_plan → add_matter_note → create_document → create_task(x2) → task_complete"
 */
function _condenseToolSequence(tools) {
  if (!tools || tools.length === 0) return null;

  const condensed = [];
  let current = null;
  let count = 0;

  for (const tool of tools) {
    if (tool === current) {
      count++;
    } else {
      if (current) {
        condensed.push(count > 1 ? `${current.replace(/_/g, ' ')}(x${count})` : current.replace(/_/g, ' '));
      }
      current = tool;
      count = 1;
    }
  }
  if (current) {
    condensed.push(count > 1 ? `${current.replace(/_/g, ' ')}(x${count})` : current.replace(/_/g, ' '));
  }

  return condensed.join(' → ');
}

// =====================================================================
// FORMAT FOR PROMPT — The replay injection
// =====================================================================

/**
 * Format matching replays for injection into the agent's prompt.
 * This is the PRIMARY instruction when replays are available.
 * 
 * At high identity maturity + available replays, this REPLACES the brief.
 */
export function formatReplayForPrompt(replays) {
  if (!replays || replays.length === 0) return '';

  let output = `\n## IDENTITY REPLAY: Follow this attorney's proven approach\n`;
  output += `An identical type of task was previously completed and APPROVED by this attorney.\n`;
  output += `Follow the same decision path, adapted to the new facts.\n\n`;

  let totalChars = output.length;

  for (let i = 0; i < replays.length && i < MAX_REPLAYS_IN_PROMPT; i++) {
    const replay = replays[i];
    const skeleton = replay.reasoning_skeleton || '';
    const similarity = replay.similarity ? ` (${Math.round(replay.similarity * 100)}% match)` : '';
    const score = replay.evaluation_score ? ` | Quality: ${replay.evaluation_score}/100` : '';
    const approval = replay.approval_strength === 'approved' ? 'APPROVED' : 'APPROVED (with feedback)';

    const section = `**Replay ${i + 1}${similarity}** [${approval}${score}]\n` +
      `Previous goal: "${(replay.goal_text || '').substring(0, 120)}"\n` +
      `${skeleton}\n\n` +
      `Follow this exact approach. Same tool order. Same deliverable shape. Same level of detail.\n` +
      `Adapt the CONTENT to the new facts, but follow the same PROCESS.\n\n`;

    if (totalChars + section.length > MAX_REPLAY_PROMPT_CHARS) break;
    output += section;
    totalChars += section.length;
  }

  return output;
}

/**
 * Check if replays are strong enough to replace the brief.
 * Returns true if we have a high-similarity replay from the same work type.
 */
export function shouldReplayReplaceBrief(replays) {
  if (!replays || replays.length === 0) return false;
  
  // Need at least one replay with high similarity and a good eval score
  const strongReplay = replays.find(r => 
    (r.similarity && r.similarity >= 0.70) ||
    (r.evaluation_score && r.evaluation_score >= 80)
  );
  
  return !!strongReplay;
}

// =====================================================================
// TRACE EXTRACTION HELPERS
// =====================================================================

function _extractToolArgsSummary(actionsHistory) {
  const summary = {
    mattersRead: [],
    documentsRead: [],
    documentsCreated: [],
    notesAdded: 0,
    tasksCreated: [],
    eventsCreated: [],
    searchesPerformed: [],
  };

  for (const action of actionsHistory) {
    if (action.success === false) continue;
    
    switch (action.tool) {
      case 'get_matter':
      case 'search_matters':
        if (action.args?.matter_id) summary.mattersRead.push(action.args.matter_id);
        break;
      case 'read_document_content':
        if (action.args?.document_id) summary.documentsRead.push(action.args.document_id);
        break;
      case 'create_document':
        summary.documentsCreated.push({
          name: action.args?.name || 'untitled',
          chars: (action.args?.content || '').length,
        });
        break;
      case 'add_matter_note':
        summary.notesAdded++;
        break;
      case 'create_task':
        summary.tasksCreated.push({ title: action.args?.title || 'untitled' });
        break;
      case 'create_calendar_event':
        summary.eventsCreated.push({ title: action.args?.title || 'event' });
        break;
      case 'search_document_content':
      case 'web_search':
      case 'search_case_law':
        summary.searchesPerformed.push(action.args?.search_term || action.args?.query || 'search');
        break;
    }
  }

  return summary;
}

function _extractPhaseSequence(actionsHistory) {
  // Infer phases from tool types
  const phases = [];
  let lastPhase = null;

  for (const action of actionsHistory) {
    if (action.success === false) continue;
    
    let phase;
    if (['get_matter', 'search_matters', 'list_documents', 'read_document_content', 'list_clients', 'search_document_content', 'web_search', 'search_case_law', 'read_webpage'].includes(action.tool)) {
      phase = 'discovery';
    } else if (['think_and_plan', 'evaluate_progress'].includes(action.tool)) {
      phase = 'analysis';
    } else if (['create_document', 'add_matter_note', 'create_task', 'create_calendar_event', 'update_matter', 'draft_legal_document'].includes(action.tool)) {
      phase = 'action';
    } else if (['review_created_documents', 'task_complete'].includes(action.tool)) {
      phase = 'review';
    }

    if (phase && phase !== lastPhase) {
      phases.push(phase);
      lastPhase = phase;
    }
  }

  return phases;
}

function _extractReadingBeforeWriting(actionsHistory) {
  const readTools = ['get_matter', 'search_matters', 'read_document_content', 'list_documents', 'search_document_content', 'web_search', 'search_case_law', 'read_webpage', 'list_clients', 'get_calendar_events', 'list_tasks'];
  const writeTools = ['add_matter_note', 'create_document', 'create_task', 'create_calendar_event', 'update_matter', 'draft_legal_document'];

  const readBeforeWrite = [];
  for (const action of actionsHistory) {
    if (action.success === false) continue;
    if (writeTools.includes(action.tool)) break; // Stop at first write
    if (readTools.includes(action.tool)) {
      readBeforeWrite.push(action.tool.replace(/_/g, ' '));
    }
  }

  return [...new Set(readBeforeWrite)]; // Deduplicate
}

function _extractDeliverableShape(actionsHistory, result) {
  const shape = {
    documents: [],
    noteCount: 0,
    tasks: [],
    eventCount: 0,
  };

  for (const action of actionsHistory) {
    if (action.success === false) continue;
    
    if (action.tool === 'create_document') {
      shape.documents.push({
        name: action.args?.name || 'untitled',
        chars: (action.args?.content || '').length,
      });
    } else if (action.tool === 'add_matter_note') {
      shape.noteCount++;
    } else if (action.tool === 'create_task') {
      shape.tasks.push({ title: action.args?.title || 'untitled' });
    } else if (action.tool === 'create_calendar_event') {
      shape.eventCount++;
    }
  }

  return shape;
}

function _extractDocumentStructure(actionsHistory) {
  // Find the main document creation and extract its structure
  const docCreation = actionsHistory.find(a => a.tool === 'create_document' && a.success !== false && a.args?.content);
  if (!docCreation) return null;

  const content = docCreation.args.content || '';
  
  // Extract headers/sections
  const headers = [];
  const headerRegex = /^#{1,4}\s+(.+?)$/gm;
  let match;
  while ((match = headerRegex.exec(content)) !== null) {
    headers.push(match[1].trim());
  }

  // Also check for uppercase section headers
  if (headers.length === 0) {
    const upperRegex = /^([A-Z][A-Z\s]{3,}):?\s*$/gm;
    while ((match = upperRegex.exec(content)) !== null) {
      headers.push(match[1].trim());
    }
  }

  if (headers.length === 0) return null;
  return headers.slice(0, 8).join(' → ');
}

async function _pruneReplays(userId, firmId) {
  try {
    const countResult = await query(
      `SELECT COUNT(*) as cnt FROM identity_replays WHERE user_id = $1 AND firm_id = $2`,
      [userId, firmId]
    );
    const count = parseInt(countResult.rows[0]?.cnt || 0);
    if (count <= MAX_REPLAYS_PER_ATTORNEY) return;

    const toDelete = count - MAX_REPLAYS_PER_ATTORNEY;
    await query(`
      DELETE FROM identity_replays WHERE id IN (
        SELECT id FROM identity_replays
        WHERE user_id = $1 AND firm_id = $2
        ORDER BY evaluation_score ASC NULLS FIRST, created_at ASC
        LIMIT $3
      )
    `, [userId, firmId, toDelete]);

    console.log(`[IdentityReplay] Pruned ${toDelete} old replays`);
  } catch (e) {
    // Non-fatal
  }
}
