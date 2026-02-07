/**
 * Harness Intelligence Layer
 * 
 * The cutting edge of the agent harness. Four interconnected systems:
 * 
 * 1. REJECTION LEARNING: Attorney rejections automatically tighten quality gates
 * 2. DETERMINISTIC TOOL CHAINS: Proven sequences skip the model for workflow decisions
 * 3. PER-MATTER MEMORY: Agent remembers what it found on previous tasks for the same matter
 * 4. CONFIDENCE-GATED COMPLETION: Per-section confidence scores tell attorneys where to look
 * 
 * These systems make the 100th task dramatically better than the 1st task,
 * automatically, with zero human tuning. That's the edge.
 */

import { query } from '../../db/connection.js';

// =====================================================================
// 1. REJECTION LEARNING
// When an attorney rejects work, the harness learns what went wrong
// and permanently adjusts quality gates for that lawyer + work type.
// =====================================================================

/**
 * Process a rejection from the review queue and create quality overrides.
 * Called from the review-queue/:id/reject endpoint.
 * 
 * @param {string} taskId - The rejected task
 * @param {string} userId - The attorney who rejected
 * @param {string} firmId - The firm
 * @param {string} feedback - What the attorney said was wrong
 * @param {object} taskResult - The task's result object (has work_type, stats, etc.)
 */
export async function learnFromRejection(taskId, userId, firmId, feedback, taskResult) {
  if (!feedback || !firmId) return;
  
  const feedbackLower = feedback.toLowerCase();
  const workType = taskResult?.work_type_id || taskResult?.workType?.id || 'all';
  const overrides = [];
  
  console.log(`[HarnessIntelligence] Learning from rejection of task ${taskId}: "${feedback.substring(0, 100)}"`);
  
  // Analyze the feedback text to determine what quality gates to tighten
  
  // --- "too generic" / "not specific" / "boilerplate" ---
  if (/generic|boilerplate|not specific|vague|general|cookie.?cutter|template/i.test(feedbackLower)) {
    overrides.push({
      rule_type: 'prompt_modifier',
      rule_value: {
        injection: 'CRITICAL: This attorney has rejected previous work as too generic. You MUST reference SPECIFIC facts, dates, names, and details from the matter. Generic analysis is NOT acceptable. Every paragraph must contain matter-specific information.',
        priority: 'high',
      },
      reason: `Rejected as generic: "${feedback.substring(0, 150)}"`,
    });
    
    // Also increase minimum document length
    overrides.push({
      rule_type: 'min_document_length',
      rule_value: { min_chars: 800, previous_min: 500 },
      reason: `Generic work often correlates with thin content`,
    });
  }
  
  // --- "too short" / "not enough detail" / "shallow" ---
  if (/too short|not enough|shallow|thin|brief|incomplete|more detail|more thorough/i.test(feedbackLower)) {
    overrides.push({
      rule_type: 'min_document_length',
      rule_value: { min_chars: 1200, previous_min: 500 },
      reason: `Rejected as too short: "${feedback.substring(0, 150)}"`,
    });
    
    overrides.push({
      rule_type: 'min_actions',
      rule_value: { min_substantive: 5, previous_min: 3 },
      reason: `More substantive actions needed for thoroughness`,
    });
  }
  
  // --- "missed deadline" / "didn't check calendar" ---
  if (/deadline|calendar|date|due|sol|statute of limitation|filing/i.test(feedbackLower)) {
    overrides.push({
      rule_type: 'required_tool',
      rule_value: { tool: 'get_calendar_events', phase: 'discovery', must_call: true },
      reason: `Rejected for missing deadline check: "${feedback.substring(0, 150)}"`,
    });
    
    overrides.push({
      rule_type: 'required_tool',
      rule_value: { tool: 'get_upcoming_deadlines', phase: 'discovery', must_call: true },
      reason: `Must check deadlines after previous rejection`,
    });
  }
  
  // --- "didn't read the documents" / "missed information" ---
  if (/didn.t read|did not read|missed|overlooked|should have read|check the doc|review the doc/i.test(feedbackLower)) {
    overrides.push({
      rule_type: 'required_tool',
      rule_value: { tool: 'read_document_content', phase: 'discovery', min_calls: 2 },
      reason: `Rejected for insufficient document review: "${feedback.substring(0, 150)}"`,
    });
    
    overrides.push({
      rule_type: 'phase_budget',
      rule_value: { phase: 'discovery', min_percent: 30, previous: 25 },
      reason: `Needs more time in discovery phase`,
    });
  }
  
  // --- "wrong tone" / "too formal" / "too casual" ---
  if (/tone|formal|casual|professional|aggressive|softer|harder|voice|style/i.test(feedbackLower)) {
    overrides.push({
      rule_type: 'prompt_modifier',
      rule_value: {
        injection: `TONE FEEDBACK: This attorney gave specific tone feedback: "${feedback.substring(0, 200)}". Adjust your writing style accordingly.`,
        priority: 'medium',
      },
      reason: `Tone/style feedback: "${feedback.substring(0, 150)}"`,
    });
  }
  
  // --- "wrong format" / "structure" ---
  if (/format|structure|heading|section|organize|layout/i.test(feedbackLower)) {
    overrides.push({
      rule_type: 'prompt_modifier',
      rule_value: {
        injection: `FORMATTING: This attorney has specific formatting preferences: "${feedback.substring(0, 200)}". Follow this structure in future documents.`,
        priority: 'medium',
      },
      reason: `Format/structure feedback: "${feedback.substring(0, 150)}"`,
    });
  }
  
  // --- General catch-all: always store the feedback as a prompt modifier ---
  if (overrides.length === 0) {
    overrides.push({
      rule_type: 'prompt_modifier',
      rule_value: {
        injection: `PREVIOUS FEEDBACK: The supervising attorney previously rejected similar work with this feedback: "${feedback.substring(0, 250)}". Address this concern in your current work.`,
        priority: 'medium',
      },
      reason: `General rejection feedback: "${feedback.substring(0, 150)}"`,
    });
  }
  
  // Store all overrides
  for (const override of overrides) {
    try {
      await query(
        `INSERT INTO harness_quality_overrides 
         (firm_id, user_id, work_type, rule_type, rule_value, reason, source_task_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [firmId, userId, workType, override.rule_type, override.rule_value, override.reason, taskId]
      );
    } catch (e) {
      // Table may not exist yet - non-fatal
      if (!e.message?.includes('harness_quality_overrides')) {
        console.error('[HarnessIntelligence] Error storing override:', e.message);
      }
    }
  }
  
  console.log(`[HarnessIntelligence] Created ${overrides.length} quality overrides from rejection`);
  return overrides;
}

/**
 * Load quality overrides for a specific user + work type.
 * Called at task start to modify quality gates and prompts.
 * 
 * @returns {object} { promptModifiers: string[], qualityGates: object }
 */
export async function getQualityOverrides(userId, firmId, workType) {
  try {
    const result = await query(
      `SELECT rule_type, rule_value, reason 
       FROM harness_quality_overrides
       WHERE firm_id = $1 AND (user_id = $2 OR user_id IS NULL)
         AND (work_type = $3 OR work_type = 'all')
         AND is_active = true
       ORDER BY created_at DESC
       LIMIT 20`,
      [firmId, userId, workType]
    );
    
    const overrides = {
      promptModifiers: [],
      minDocumentLength: null,
      minActions: null,
      requiredTools: [],
      phaseBudgets: {},
    };
    
    for (const row of result.rows) {
      const value = typeof row.rule_value === 'string' ? JSON.parse(row.rule_value) : row.rule_value;
      
      switch (row.rule_type) {
        case 'prompt_modifier':
          overrides.promptModifiers.push(value.injection);
          break;
        case 'min_document_length':
          overrides.minDocumentLength = Math.max(overrides.minDocumentLength || 0, value.min_chars);
          break;
        case 'min_actions':
          overrides.minActions = Math.max(overrides.minActions || 0, value.min_substantive);
          break;
        case 'required_tool':
          overrides.requiredTools.push(value);
          break;
        case 'phase_budget':
          overrides.phaseBudgets[value.phase] = Math.max(
            overrides.phaseBudgets[value.phase] || 0, 
            value.min_percent
          );
          break;
      }
    }
    
    if (result.rows.length > 0) {
      console.log(`[HarnessIntelligence] Loaded ${result.rows.length} quality overrides for user ${userId}, workType ${workType}`);
    }
    
    // Mark overrides as applied
    try {
      await query(
        `UPDATE harness_quality_overrides 
         SET applied_count = applied_count + 1, updated_at = NOW()
         WHERE firm_id = $1 AND (user_id = $2 OR user_id IS NULL)
           AND (work_type = $3 OR work_type = 'all')
           AND is_active = true`,
        [firmId, userId, workType]
      );
    } catch (_) {}
    
    return overrides;
  } catch (e) {
    // Table may not exist yet
    return { promptModifiers: [], minDocumentLength: null, minActions: null, requiredTools: [], phaseBudgets: {} };
  }
}

/**
 * Record that a task succeeded after quality overrides were applied.
 * This tracks effectiveness of the rejection learning.
 */
export async function recordOverrideSuccess(userId, firmId, workType) {
  try {
    await query(
      `UPDATE harness_quality_overrides 
       SET success_after = success_after + 1, updated_at = NOW()
       WHERE firm_id = $1 AND (user_id = $2 OR user_id IS NULL)
         AND (work_type = $3 OR work_type = 'all')
         AND is_active = true`,
      [firmId, userId, workType]
    );
  } catch (_) {}
}


// =====================================================================
// 2. DETERMINISTIC TOOL CHAINS
// After enough successful executions, the harness knows the optimal
// tool sequence for a work type and can execute it without asking
// the model to decide each step.
// =====================================================================

/**
 * Record a completed tool chain for a work type.
 * Called after every successful task completion.
 */
export async function recordToolChain(firmId, workType, toolSequence, qualityScore, durationSeconds) {
  if (!firmId || !workType || !toolSequence || toolSequence.length < 3) return;
  
  // Normalize the sequence to just the tool names (remove duplicates in a row)
  const normalized = [];
  for (const tool of toolSequence) {
    if (normalized.length === 0 || normalized[normalized.length - 1] !== tool) {
      normalized.push(tool);
    }
  }
  
  try {
    // Check if a similar chain already exists
    const existing = await query(
      `SELECT id, success_count, total_count, avg_quality_score, avg_duration_seconds
       FROM proven_tool_chains
       WHERE firm_id = $1 AND work_type = $2 AND tool_sequence = $3`,
      [firmId, workType, normalized]
    );
    
    if (existing.rows.length > 0) {
      // Update existing chain
      const row = existing.rows[0];
      const newSuccessCount = row.success_count + 1;
      const newTotalCount = row.total_count + 1;
      const newAvgQuality = qualityScore 
        ? ((parseFloat(row.avg_quality_score || 0) * row.success_count) + qualityScore) / newSuccessCount
        : row.avg_quality_score;
      const newAvgDuration = durationSeconds
        ? ((parseInt(row.avg_duration_seconds || 0) * row.success_count) + durationSeconds) / newSuccessCount
        : row.avg_duration_seconds;
      const newConfidence = Math.min(0.99, 0.50 + (0.49 * (1 - Math.exp(-newSuccessCount / 5))));
      const canBeDeterministic = newConfidence > 0.85 && newTotalCount >= 5;
      
      await query(
        `UPDATE proven_tool_chains 
         SET success_count = $1, total_count = $2, avg_quality_score = $3,
             avg_duration_seconds = $4, confidence = $5, deterministic = $6, updated_at = NOW()
         WHERE id = $7`,
        [newSuccessCount, newTotalCount, newAvgQuality, Math.round(newAvgDuration), newConfidence, canBeDeterministic, row.id]
      );
      
      if (canBeDeterministic && !row.deterministic) {
        console.log(`[HarnessIntelligence] Tool chain for "${workType}" promoted to DETERMINISTIC (${newSuccessCount} successes, ${(newConfidence * 100).toFixed(0)}% confidence)`);
      }
    } else {
      // Insert new chain
      await query(
        `INSERT INTO proven_tool_chains (firm_id, work_type, tool_sequence, avg_quality_score, avg_duration_seconds)
         VALUES ($1, $2, $3, $4, $5)`,
        [firmId, workType, normalized, qualityScore || null, durationSeconds || null]
      );
    }
  } catch (e) {
    if (!e.message?.includes('proven_tool_chains')) {
      console.error('[HarnessIntelligence] Error recording tool chain:', e.message);
    }
  }
}

/**
 * Record a failed tool chain (task failed or was rejected).
 */
export async function recordToolChainFailure(firmId, workType, toolSequence) {
  if (!firmId || !workType || !toolSequence || toolSequence.length < 3) return;
  
  const normalized = [];
  for (const tool of toolSequence) {
    if (normalized.length === 0 || normalized[normalized.length - 1] !== tool) {
      normalized.push(tool);
    }
  }
  
  try {
    await query(
      `UPDATE proven_tool_chains 
       SET total_count = total_count + 1, 
           confidence = GREATEST(0.10, confidence - 0.05),
           deterministic = false,
           updated_at = NOW()
       WHERE firm_id = $1 AND work_type = $2 AND tool_sequence = $3`,
      [firmId, workType, normalized]
    );
  } catch (_) {}
}

/**
 * Get the best proven tool chain for a work type.
 * Returns null if no chain has enough confidence yet.
 * 
 * @returns {object|null} { tools: string[], confidence: number, deterministic: boolean, avgQuality: number }
 */
export async function getProvenToolChain(firmId, workType) {
  try {
    const result = await query(
      `SELECT tool_sequence, confidence, deterministic, avg_quality_score, avg_duration_seconds, success_count
       FROM proven_tool_chains
       WHERE firm_id = $1 AND work_type = $2 AND confidence > 0.60
       ORDER BY confidence DESC, success_count DESC
       LIMIT 1`,
      [firmId, workType]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      tools: row.tool_sequence,
      confidence: parseFloat(row.confidence),
      deterministic: row.deterministic,
      avgQuality: parseFloat(row.avg_quality_score || 0),
      avgDuration: parseInt(row.avg_duration_seconds || 0),
      successCount: row.success_count,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Format a proven tool chain for injection into the agent's prompt.
 * When deterministic, this tells the agent to follow the exact sequence.
 * When guidance-only, this suggests the sequence.
 */
export function formatToolChainForPrompt(chain) {
  if (!chain) return '';
  
  const sequence = chain.tools.join(' → ');
  
  if (chain.deterministic) {
    return `\n## PROVEN WORKFLOW (follow this exact sequence)
This firm has a proven tool sequence for this work type with ${(chain.confidence * 100).toFixed(0)}% confidence (${chain.successCount} successful runs, avg quality ${chain.avgQuality?.toFixed(0) || '?'}/100):
**${sequence}**
Follow this EXACT sequence. Only deviate if a tool fails or returns unexpected results. This sequence produces the best results for this type of work.\n`;
  } else {
    return `\n## SUGGESTED WORKFLOW (${(chain.confidence * 100).toFixed(0)}% confidence)
Based on ${chain.successCount} past successful tasks, this tool sequence works well:
${sequence}
Use this as your starting approach. Adapt as needed based on what you find.\n`;
  }
}


// =====================================================================
// 3. PER-MATTER PERSISTENT MEMORY
// Stores what the agent found on each matter, so the next task on
// the same matter starts with institutional knowledge.
// =====================================================================

/**
 * Store a memory entry for a matter.
 * Called during task execution when the agent discovers something noteworthy.
 */
export async function storeMatterMemory(firmId, matterId, memory) {
  if (!firmId || !matterId || !memory?.content) return;
  
  try {
    await query(
      `INSERT INTO matter_agent_memory 
       (firm_id, matter_id, memory_type, content, source_task_id, source_tool, confidence, importance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        firmId, matterId, 
        memory.type || 'finding',
        memory.content,
        memory.taskId || null,
        memory.tool || null,
        memory.confidence || 0.70,
        memory.importance || 'medium',
      ]
    );
  } catch (e) {
    // Table may not exist yet - non-fatal
    if (!e.message?.includes('matter_agent_memory')) {
      console.error('[HarnessIntelligence] Error storing matter memory:', e.message);
    }
  }
}

/**
 * Store multiple memory entries at once (batch, after task completion).
 */
export async function storeMatterMemories(firmId, matterId, taskId, memories) {
  for (const mem of memories) {
    await storeMatterMemory(firmId, matterId, { ...mem, taskId });
  }
}

/**
 * Load matter memory for injection into the agent's context.
 * Returns a formatted string ready for the system prompt.
 */
export async function getMatterMemory(firmId, matterId) {
  try {
    const result = await query(
      `SELECT memory_type, content, importance, confidence, source_task_id, created_at
       FROM matter_agent_memory
       WHERE firm_id = $1 AND matter_id = $2 AND is_resolved = false
         AND expires_at > NOW()
       ORDER BY 
         CASE importance WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at DESC
       LIMIT 20`,
      [firmId, matterId]
    );
    
    if (result.rows.length === 0) return null;
    
    const memories = result.rows;
    const critical = memories.filter(m => m.importance === 'critical' || m.importance === 'high');
    const findings = memories.filter(m => m.memory_type === 'finding');
    const risks = memories.filter(m => m.memory_type === 'risk');
    const gaps = memories.filter(m => m.memory_type === 'gap');
    const deadlines = memories.filter(m => m.memory_type === 'deadline');
    const completedWork = memories.filter(m => m.memory_type === 'completed_work');
    
    let memoryStr = `\n## MATTER MEMORY (from ${memories.length} previous observations)\n`;
    memoryStr += `The agent has worked on this matter before. Here's what was found:\n\n`;
    
    if (critical.length > 0) {
      memoryStr += `**CRITICAL/HIGH PRIORITY:**\n`;
      for (const m of critical) {
        memoryStr += `- [${m.memory_type.toUpperCase()}] ${m.content}\n`;
      }
      memoryStr += '\n';
    }
    
    if (risks.length > 0) {
      memoryStr += `**Identified Risks:**\n`;
      for (const m of risks) {
        memoryStr += `- ${m.content}\n`;
      }
      memoryStr += '\n';
    }
    
    if (deadlines.length > 0) {
      memoryStr += `**Deadline Notes:**\n`;
      for (const m of deadlines) {
        memoryStr += `- ${m.content}\n`;
      }
      memoryStr += '\n';
    }
    
    if (gaps.length > 0) {
      memoryStr += `**Gaps/Issues Identified:**\n`;
      for (const m of gaps) {
        memoryStr += `- ${m.content}\n`;
      }
      memoryStr += '\n';
    }
    
    if (completedWork.length > 0) {
      memoryStr += `**Previously Completed Work:**\n`;
      for (const m of completedWork.slice(0, 5)) {
        memoryStr += `- ${m.content}\n`;
      }
      memoryStr += '\n';
    }
    
    if (findings.length > 0 && findings.length > critical.length) {
      const otherFindings = findings.filter(f => f.importance !== 'critical' && f.importance !== 'high');
      if (otherFindings.length > 0) {
        memoryStr += `**Other Findings:**\n`;
        for (const m of otherFindings.slice(0, 5)) {
          memoryStr += `- ${m.content}\n`;
        }
        memoryStr += '\n';
      }
    }
    
    memoryStr += `Use this institutional knowledge. Don't re-discover what's already known. Focus on what's new or changed.\n`;
    
    return memoryStr;
  } catch (e) {
    return null;
  }
}

/**
 * Mark a matter memory as resolved (e.g., a gap was filled, a risk was addressed).
 */
export async function resolveMatterMemory(firmId, matterId, memoryType, resolvedBy) {
  try {
    await query(
      `UPDATE matter_agent_memory 
       SET is_resolved = true, resolved_at = NOW(), resolved_by = $4
       WHERE firm_id = $1 AND matter_id = $2 AND memory_type = $3 AND is_resolved = false`,
      [firmId, matterId, memoryType, resolvedBy]
    );
  } catch (_) {}
}

/**
 * Extract memories from a completed task's action history.
 * Automatically identifies findings, risks, gaps, and completed work.
 */
export function extractMemoriesFromTask(task) {
  const memories = [];
  if (!task?.actionsHistory) return memories;
  
  // Track what was created
  const docsCreated = task.actionsHistory.filter(a => a.tool === 'create_document' && a.success !== false);
  const notesCreated = task.actionsHistory.filter(a => a.tool === 'add_matter_note' && a.success !== false);
  const tasksCreated = task.actionsHistory.filter(a => a.tool === 'create_task' && a.success !== false);
  const eventsCreated = task.actionsHistory.filter(a => a.tool === 'create_calendar_event' && a.success !== false);
  
  // Record completed work
  for (const doc of docsCreated) {
    memories.push({
      type: 'completed_work',
      content: `Created document: "${doc.args?.name || 'untitled'}"`,
      tool: 'create_document',
      importance: 'medium',
    });
  }
  
  for (const task_item of tasksCreated) {
    memories.push({
      type: 'completed_work',
      content: `Created task: "${task_item.args?.title || 'untitled'}"`,
      tool: 'create_task',
      importance: 'low',
    });
  }
  
  for (const event of eventsCreated) {
    memories.push({
      type: 'deadline',
      content: `Scheduled: "${event.args?.title || 'event'}" on ${event.args?.start_time || 'TBD'}`,
      tool: 'create_calendar_event',
      importance: 'high',
    });
  }
  
  // Extract key findings from the structured plan
  if (task.structuredPlan?.keyFindings) {
    for (const finding of task.structuredPlan.keyFindings.slice(0, 8)) {
      memories.push({
        type: 'finding',
        content: finding,
        importance: 'medium',
        confidence: 0.75,
      });
    }
  }
  
  // Extract from the task result summary
  if (task.result?.remaining_work) {
    for (const gap of task.result.remaining_work) {
      memories.push({
        type: 'gap',
        content: gap,
        importance: 'high',
        confidence: 0.80,
      });
    }
  }
  
  // Extract evaluation issues as risks
  if (task.result?.evaluation?.issues) {
    for (const issue of task.result.evaluation.issues) {
      memories.push({
        type: 'risk',
        content: issue,
        importance: 'high',
        confidence: 0.85,
      });
    }
  }
  
  return memories;
}


// =====================================================================
// 4. CONFIDENCE-GATED COMPLETION
// Instead of binary pass/fail, output per-section confidence scores
// so the attorney knows exactly where to focus review.
// =====================================================================

/**
 * Calculate confidence scores for the completed task's deliverables.
 * Returns a structured confidence report that the attorney can scan in seconds.
 * 
 * @param {object} task - The completed BackgroundTask
 * @returns {object} confidence report
 */
export function calculateConfidenceReport(task) {
  const report = {
    overallConfidence: 0,
    sections: [],
    reviewGuidance: '',
    estimatedReviewMinutes: 0,
  };
  
  const sections = [];
  
  // 1. Matter comprehension confidence
  const matterRead = task.actionsHistory?.some(a => a.tool === 'get_matter' && a.success !== false);
  const docsRead = task.actionsHistory?.filter(a => 
    (a.tool === 'read_document_content' || a.tool === 'find_and_read_document') && a.success !== false
  ).length || 0;
  const notesRead = task.actionsHistory?.some(a => a.tool === 'list_tasks' && a.success !== false);
  
  const comprehensionScore = Math.min(100,
    (matterRead ? 40 : 0) +
    (Math.min(docsRead, 5) * 10) +
    (notesRead ? 10 : 0)
  );
  sections.push({
    name: 'Matter Comprehension',
    confidence: comprehensionScore,
    detail: matterRead 
      ? `Read matter details and ${docsRead} document(s)`
      : 'Did not read matter details - LOW confidence in factual accuracy',
    needsReview: comprehensionScore < 60,
  });
  
  // 2. Document quality confidence (if documents were created)
  const docsCreated = task.actionsHistory?.filter(a => a.tool === 'create_document' && a.success !== false) || [];
  if (docsCreated.length > 0) {
    const selfReviewed = task.actionsHistory?.some(a => a.tool === 'review_created_documents' && a.success !== false);
    const contentLengths = docsCreated.map(d => (d.args?.content || '').length);
    const avgLength = contentLengths.reduce((s, l) => s + l, 0) / contentLengths.length;
    const hasPlaceholders = docsCreated.some(d => /\[INSERT|TODO|PLACEHOLDER|TBD\]/i.test(d.args?.content || ''));
    
    const docScore = Math.min(100,
      (avgLength > 1000 ? 30 : avgLength > 500 ? 20 : 10) +
      (selfReviewed ? 30 : 0) +
      (hasPlaceholders ? 0 : 20) +
      (docsRead > 0 ? 20 : 0) // Based on source material
    );
    
    for (const doc of docsCreated) {
      const contentLen = (doc.args?.content || '').length;
      const docHasPlaceholders = /\[INSERT|TODO|PLACEHOLDER|TBD\]/i.test(doc.args?.content || '');
      const docHasCitations = /\d+\s+(?:F\.|U\.S\.|S\.Ct\.|N\.Y\.)/i.test(doc.args?.content || '');
      
      const individualScore = Math.min(100,
        (contentLen > 1000 ? 35 : contentLen > 500 ? 25 : 10) +
        (selfReviewed ? 25 : 0) +
        (docHasPlaceholders ? 0 : 20) +
        (docHasCitations ? 0 : 20) // Citations are a risk factor, not a bonus
      );
      
      sections.push({
        name: `Document: "${doc.args?.name || 'untitled'}"`,
        confidence: individualScore,
        detail: [
          `${contentLen} chars`,
          selfReviewed ? 'self-reviewed' : 'NOT self-reviewed',
          docHasPlaceholders ? 'HAS PLACEHOLDERS' : null,
          docHasCitations ? 'CONTAINS CITATIONS (verify)' : null,
        ].filter(Boolean).join(', '),
        needsReview: individualScore < 70 || docHasPlaceholders || docHasCitations,
      });
    }
  }
  
  // 3. Analysis confidence
  const notesCreated = task.actionsHistory?.filter(a => a.tool === 'add_matter_note' && a.success !== false) || [];
  if (notesCreated.length > 0) {
    const totalNoteContent = notesCreated.reduce((s, n) => s + (n.args?.content || '').length, 0);
    const analysisScore = Math.min(100,
      (totalNoteContent > 2000 ? 40 : totalNoteContent > 500 ? 25 : 10) +
      (docsRead >= 2 ? 30 : docsRead >= 1 ? 15 : 0) +
      (matterRead ? 20 : 0) +
      (notesCreated.length >= 2 ? 10 : 0)
    );
    
    sections.push({
      name: 'Analysis & Notes',
      confidence: analysisScore,
      detail: `${notesCreated.length} note(s), ${totalNoteContent} total chars, based on ${docsRead} document(s) read`,
      needsReview: analysisScore < 60,
    });
  }
  
  // 4. Follow-up completeness
  const tasksCreated = task.actionsHistory?.filter(a => a.tool === 'create_task' && a.success !== false) || [];
  const eventsCreated = task.actionsHistory?.filter(a => a.tool === 'create_calendar_event' && a.success !== false) || [];
  
  const followUpScore = Math.min(100,
    (tasksCreated.length >= 3 ? 40 : tasksCreated.length >= 1 ? 25 : 0) +
    (eventsCreated.length >= 1 ? 30 : 0) +
    (tasksCreated.length + eventsCreated.length >= 4 ? 30 : 15)
  );
  
  sections.push({
    name: 'Follow-up Actions',
    confidence: followUpScore,
    detail: `${tasksCreated.length} task(s), ${eventsCreated.length} event(s) created`,
    needsReview: followUpScore < 50,
  });
  
  // Calculate overall confidence (weighted average)
  const weights = sections.map(s => s.name.startsWith('Document') ? 3 : s.name === 'Matter Comprehension' ? 2 : 1);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  report.overallConfidence = Math.round(
    sections.reduce((sum, s, i) => sum + s.confidence * weights[i], 0) / totalWeight
  );
  report.sections = sections;
  
  // Generate review guidance
  const needsReview = sections.filter(s => s.needsReview);
  if (needsReview.length === 0) {
    report.reviewGuidance = 'All sections are high confidence. Quick scan recommended.';
    report.estimatedReviewMinutes = 2;
  } else if (needsReview.length <= 2) {
    report.reviewGuidance = `Focus review on: ${needsReview.map(s => s.name).join(', ')}. Other sections are high confidence.`;
    report.estimatedReviewMinutes = 5;
  } else {
    report.reviewGuidance = `Thorough review recommended. ${needsReview.length} sections need attention: ${needsReview.map(s => s.name).join(', ')}.`;
    report.estimatedReviewMinutes = 10;
  }
  
  return report;
}

/**
 * Format the confidence report for display in the review queue.
 */
export function formatConfidenceForReview(report) {
  if (!report) return null;
  
  return {
    overall: report.overallConfidence,
    reviewGuidance: report.reviewGuidance,
    estimatedReviewMinutes: report.estimatedReviewMinutes,
    sections: report.sections.map(s => ({
      name: s.name,
      confidence: s.confidence,
      needsReview: s.needsReview,
      detail: s.detail,
    })),
  };
}
