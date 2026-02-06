/**
 * Task Evaluator - Post-Task Self-Evaluation
 * 
 * After the agent completes a task, this module:
 * 1. Re-reads everything the agent created (documents, notes, tasks)
 * 2. Scores the output on multiple dimensions INCLUDING work-type-specific criteria
 * 3. If score is below threshold, triggers a revision pass
 * 4. Checks for citation integrity issues (hallucinated legal citations)
 * 5. Stores evaluation results for tracking improvement over time
 * 
 * This is the "generator-critic" pattern that separates good agents from great ones.
 * The agent becomes its own quality reviewer before the lawyer ever sees the output.
 */

import { query } from '../../db/connection.js';
import { classifyWork, WORK_TYPES } from './juniorAttorneyBrief.js';

/**
 * Evaluation dimensions for agent output
 */
const EVAL_DIMENSIONS = {
  COMPLETENESS: 'completeness',     // Did the agent address the full goal?
  SPECIFICITY: 'specificity',       // Is the output specific to this matter (not generic)?
  ACTIONABILITY: 'actionability',   // Are there clear next steps?
  PROFESSIONALISM: 'professionalism', // Is the quality worthy of a law firm?
  THOROUGHNESS: 'thoroughness',     // Did the agent do enough work?
  WORK_TYPE_FIT: 'work_type_fit',  // Did the agent meet work-type-specific requirements?
  CITATION_INTEGRITY: 'citation_integrity', // Are legal citations verifiable?
};

// ===== WORK-TYPE-SPECIFIC QUALITY REQUIREMENTS =====
// Each work type has minimum deliverable requirements that go beyond
// the generic quality gate. These reflect what a supervising partner
// would check when reviewing a junior attorney's work.

const WORK_TYPE_REQUIREMENTS = {
  matter_review: {
    minNotesCount: 1,
    minReadActions: 2,      // Must actually read the matter before reviewing
    minTasksCount: 1,
    requiresDocumentRead: true,  // Must read at least 1 document
    requiresMatterRead: true,    // Must call get_matter
    minNoteContentLength: 200,   // Notes must be substantial
    description: 'Matter Review requires reading the matter, documents, and producing a detailed findings note with follow-up tasks.',
  },
  document_drafting: {
    minDocumentsCount: 1,
    minDocContentLength: 500,   // Minimum 500 chars for a real document
    requiresMatterRead: true,
    minNotesCount: 1,           // Must document what was drafted
    minTasksCount: 1,           // Follow-up task for partner review
    noPlaceholders: true,       // No [INSERT], [TODO], etc.
    description: 'Document Drafting requires creating a substantive document (500+ chars) based on actual matter facts, with a summary note and review task.',
  },
  legal_research: {
    minNotesCount: 1,
    minDocumentsCount: 1,       // Research memo required
    minDocContentLength: 800,   // Research memos should be substantial
    requiresMatterRead: true,
    minReadActions: 1,
    description: 'Legal Research requires reading the matter, producing a research memo (800+ chars), and documenting findings.',
  },
  client_communication: {
    minDocumentsCount: 1,       // The communication itself
    requiresMatterRead: true,
    minNotesCount: 1,           // Document what was communicated
    minTasksCount: 1,           // Task to review/send
    minDocContentLength: 300,   // Comms should be substantial
    description: 'Client Communication requires reading the matter, drafting the communication, documenting it, and creating a send/review task.',
  },
  intake_setup: {
    minNotesCount: 1,           // Initial assessment
    minTasksCount: 3,           // Intake checklist items
    requiresMatterRead: true,
    requiresConflictCheck: true,
    description: 'Intake requires reading the matter, running a conflict check, writing an assessment note, and creating 3+ intake tasks.',
  },
  billing_review: {
    minNotesCount: 1,
    requiresTimeCheck: true,    // Must check time entries or invoices
    minNoteContentLength: 200,
    description: 'Billing Review requires checking time/invoice data and producing a findings note with specific numbers.',
  },
  deadline_management: {
    minNotesCount: 1,
    minEventsCount: 1,          // Must create/verify calendar events
    requiresMatterRead: true,
    description: 'Deadline Management requires checking matters, creating/verifying calendar events, and documenting findings.',
  },
  general: {
    minNotesCount: 1,
    minTasksCount: 1,
    requiresMatterRead: false,
    description: 'General tasks require at least one note and one follow-up task.',
  },
};

// ===== CITATION PATTERNS =====
// Regex patterns to detect legal citations in document content.
// Used to flag potential hallucinated citations that need verification.
const CITATION_PATTERNS = [
  // Federal reporter citations: "123 F.3d 456", "456 U.S. 789"
  /\d+\s+(?:F\.(?:2d|3d|4th|Supp\.(?:2d|3d)?)|U\.S\.|S\.Ct\.|L\.Ed\.(?:2d)?|F\.R\.D\.|B\.R\.)\s+\d+/g,
  // State reporter citations: "123 N.Y.2d 456", "789 A.D.3d 012"
  /\d+\s+(?:N\.Y\.(?:2d|3d)?|A\.D\.(?:2d|3d)?|Misc\.(?:2d|3d)?|N\.Y\.S\.(?:2d|3d)?|Cal\.(?:2d|3d|4th|5th)?|N\.E\.(?:2d|3d)?|N\.W\.(?:2d)?|So\.(?:2d|3d)?|S\.E\.(?:2d)?|S\.W\.(?:2d|3d)?|P\.(?:2d|3d)?)\s+\d+/g,
  // Party v. Party citations: "Smith v. Jones" or "Smith v Jones"
  /[A-Z][a-z]+\s+v\.?\s+[A-Z][a-z]+/g,
];

/**
 * Evaluate a completed task by analyzing what was produced.
 * Returns a score object with dimension scores and an overall score.
 */
export async function evaluateTask(task) {
  try {
    const evaluation = {
      taskId: task.id,
      goal: task.goal,
      dimensions: {},
      overallScore: 0,
      issues: [],
      strengths: [],
      revisionNeeded: false,
    };
    
    const actions = task.actionsHistory || [];
    const successfulActions = actions.filter(a => a.success !== false);
    const substantive = task.substantiveActions || {};
    
    // ===== COMPLETENESS =====
    // Did the agent address the full goal?
    let completenessScore = 0;
    if (successfulActions.length >= 5) completenessScore += 25;
    else if (successfulActions.length >= 3) completenessScore += 15;
    else completenessScore += 5;
    
    if (substantive.notes > 0) completenessScore += 20;
    if (substantive.tasks > 0) completenessScore += 15;
    if (substantive.documents > 0) completenessScore += 25;
    if (substantive.events > 0) completenessScore += 10;
    
    // Check if think_and_plan was called (structured approach)
    const hasPlanning = actions.some(a => a.tool === 'think_and_plan');
    if (hasPlanning) completenessScore += 5;
    
    completenessScore = Math.min(100, completenessScore);
    evaluation.dimensions[EVAL_DIMENSIONS.COMPLETENESS] = completenessScore;
    
    if (completenessScore < 50) {
      evaluation.issues.push('Task may be incomplete - missing key deliverables');
    } else if (completenessScore >= 80) {
      evaluation.strengths.push('Comprehensive deliverables produced');
    }
    
    // ===== SPECIFICITY =====
    // Check if notes and documents reference actual matter data
    let specificityScore = 0;
    const noteActions = actions.filter(a => a.tool === 'add_matter_note' && a.success);
    const docActions = actions.filter(a => a.tool === 'create_document' && a.success);
    
    // Did the agent read matter data first? (shows it's working with real info)
    const readActions = actions.filter(a => 
      ['get_matter', 'read_document_content', 'search_document_content'].includes(a.tool) && a.success
    );
    if (readActions.length > 0) specificityScore += 30;
    if (readActions.length >= 3) specificityScore += 20;
    
    // Check if documents have substantial content (not just templates)
    for (const doc of docActions) {
      const content = doc.args?.content || doc.args?.body || '';
      if (content.length > 500) specificityScore += 15;
      if (content.includes('[INSERT') || content.includes('[TODO') || content.includes('PLACEHOLDER')) {
        specificityScore -= 20;
        evaluation.issues.push('Document contains placeholder content');
      }
    }
    
    specificityScore = Math.min(100, Math.max(0, specificityScore));
    evaluation.dimensions[EVAL_DIMENSIONS.SPECIFICITY] = specificityScore;
    
    if (specificityScore < 40) {
      evaluation.issues.push('Output appears generic - may not reference actual matter facts');
    } else if (specificityScore >= 70) {
      evaluation.strengths.push('Output is specific to the matter with real data');
    }
    
    // ===== ACTIONABILITY =====
    let actionabilityScore = 0;
    if (substantive.tasks > 0) actionabilityScore += 40;
    if (substantive.tasks >= 3) actionabilityScore += 20;
    if (substantive.events > 0) actionabilityScore += 20;
    
    // Check if tasks have meaningful titles
    const taskActions = actions.filter(a => a.tool === 'create_task' && a.success);
    for (const t of taskActions) {
      const title = t.args?.title || '';
      if (title.length > 10 && !title.toLowerCase().includes('todo')) {
        actionabilityScore += 5;
      }
    }
    
    actionabilityScore = Math.min(100, actionabilityScore);
    evaluation.dimensions[EVAL_DIMENSIONS.ACTIONABILITY] = actionabilityScore;
    
    if (actionabilityScore < 30) {
      evaluation.issues.push('No clear follow-up actions created');
    } else if (actionabilityScore >= 60) {
      evaluation.strengths.push('Clear actionable follow-up items');
    }
    
    // ===== THOROUGHNESS =====
    const elapsedSeconds = task.endTime 
      ? (task.endTime.getTime() - task.startTime.getTime()) / 1000
      : 0;
    let thoroughnessScore = 0;
    
    if (successfulActions.length >= 10) thoroughnessScore += 30;
    else if (successfulActions.length >= 5) thoroughnessScore += 15;
    
    if (elapsedSeconds >= 120) thoroughnessScore += 20; // At least 2 minutes of work
    if (elapsedSeconds >= 300) thoroughnessScore += 15; // 5+ minutes
    
    if (noteActions.length >= 2) thoroughnessScore += 15;
    if (readActions.length >= 2) thoroughnessScore += 10;
    if (hasPlanning) thoroughnessScore += 10;
    
    thoroughnessScore = Math.min(100, thoroughnessScore);
    evaluation.dimensions[EVAL_DIMENSIONS.THOROUGHNESS] = thoroughnessScore;
    
    if (thoroughnessScore < 40) {
      evaluation.issues.push('Work appears rushed or shallow');
    } else if (thoroughnessScore >= 70) {
      evaluation.strengths.push('Thorough analysis and execution');
    }
    
    // ===== PROFESSIONALISM =====
    let professionalismScore = 50; // Start at baseline
    
    // Positive signals
    if (hasPlanning) professionalismScore += 10;
    if (substantive.notes > 0) professionalismScore += 10;
    if (substantive.documents > 0) professionalismScore += 15;
    
    // Negative signals
    const failedActions = actions.filter(a => a.success === false);
    if (failedActions.length > actions.length * 0.3) {
      professionalismScore -= 15; // Too many failures
    }
    
    // Check for repeated identical tool calls (sign of being stuck)
    const toolSequence = actions.slice(-10).map(a => a.tool);
    const repeated = toolSequence.filter((t, i) => i > 0 && t === toolSequence[i-1]).length;
    if (repeated > 3) professionalismScore -= 10;
    
    professionalismScore = Math.min(100, Math.max(0, professionalismScore));
    evaluation.dimensions[EVAL_DIMENSIONS.PROFESSIONALISM] = professionalismScore;
    
    // ===== WORK-TYPE-SPECIFIC QUALITY =====
    const workTypeFitResult = evaluateWorkTypeFit(task, actions, substantive, noteActions, docActions, readActions);
    evaluation.dimensions[EVAL_DIMENSIONS.WORK_TYPE_FIT] = workTypeFitResult.score;
    evaluation.workType = workTypeFitResult.workType;
    evaluation.issues.push(...workTypeFitResult.issues);
    evaluation.strengths.push(...workTypeFitResult.strengths);
    
    // ===== CITATION INTEGRITY =====
    const citationResult = evaluateCitationIntegrity(task, actions, docActions, noteActions);
    evaluation.dimensions[EVAL_DIMENSIONS.CITATION_INTEGRITY] = citationResult.score;
    evaluation.citationFlags = citationResult.flags;
    evaluation.issues.push(...citationResult.issues);
    if (citationResult.strengths.length > 0) {
      evaluation.strengths.push(...citationResult.strengths);
    }
    
    // ===== OVERALL SCORE =====
    const weights = {
      [EVAL_DIMENSIONS.COMPLETENESS]: 0.20,
      [EVAL_DIMENSIONS.SPECIFICITY]: 0.20,
      [EVAL_DIMENSIONS.ACTIONABILITY]: 0.10,
      [EVAL_DIMENSIONS.THOROUGHNESS]: 0.15,
      [EVAL_DIMENSIONS.PROFESSIONALISM]: 0.10,
      [EVAL_DIMENSIONS.WORK_TYPE_FIT]: 0.15,
      [EVAL_DIMENSIONS.CITATION_INTEGRITY]: 0.10,
    };
    
    evaluation.overallScore = Math.round(
      Object.entries(weights).reduce((sum, [dim, weight]) => {
        return sum + (evaluation.dimensions[dim] || 0) * weight;
      }, 0)
    );
    
    // Determine if revision is needed
    // Revision triggers: low overall score, too many issues, or critical citation problems
    evaluation.revisionNeeded = 
      evaluation.overallScore < 50 || 
      evaluation.issues.length > 2 ||
      (citationResult.flags.length > 0 && citationResult.score < 30);
    
    console.log(`[TaskEvaluator] Task ${task.id} scored ${evaluation.overallScore}/100 ` +
      `(workType: ${workTypeFitResult.workType}, ` +
      `citations: ${citationResult.flags.length} flagged, ` +
      `${evaluation.revisionNeeded ? 'REVISION NEEDED' : 'PASSED'})`);
    
    return evaluation;
  } catch (error) {
    console.error('[TaskEvaluator] Evaluation error:', error.message);
    return { overallScore: -1, revisionNeeded: false, issues: [], strengths: [], dimensions: {} };
  }
}

/**
 * Evaluate work-type-specific quality requirements.
 * Uses the Junior Attorney Brief's work type classification to check
 * whether the agent met the specific requirements for this type of legal work.
 */
function evaluateWorkTypeFit(task, actions, substantive, noteActions, docActions, readActions) {
  const result = {
    score: 70, // Default: assume OK
    workType: 'general',
    issues: [],
    strengths: [],
    unmetRequirements: [],
  };
  
  try {
    // Classify the work type from the goal
    const workType = task.workType || classifyWork(task.goal);
    const typeId = workType?.id || 'general';
    result.workType = typeId;
    
    const requirements = WORK_TYPE_REQUIREMENTS[typeId] || WORK_TYPE_REQUIREMENTS.general;
    
    let score = 100; // Start at max, deduct for unmet requirements
    const deductionPerReq = 15; // Each unmet requirement costs 15 points
    
    // Check minimum notes count
    if (requirements.minNotesCount && substantive.notes < requirements.minNotesCount) {
      score -= deductionPerReq;
      result.unmetRequirements.push(`Need ${requirements.minNotesCount} note(s), created ${substantive.notes}. Use add_matter_note.`);
    }
    
    // Check minimum documents count
    if (requirements.minDocumentsCount && substantive.documents < requirements.minDocumentsCount) {
      score -= deductionPerReq;
      result.unmetRequirements.push(`Need ${requirements.minDocumentsCount} document(s), created ${substantive.documents}. Use create_document.`);
    }
    
    // Check minimum tasks count
    if (requirements.minTasksCount && substantive.tasks < requirements.minTasksCount) {
      score -= deductionPerReq;
      result.unmetRequirements.push(`Need ${requirements.minTasksCount} task(s), created ${substantive.tasks}. Use create_task.`);
    }
    
    // Check minimum events count
    if (requirements.minEventsCount && substantive.events < requirements.minEventsCount) {
      score -= deductionPerReq;
      result.unmetRequirements.push(`Need ${requirements.minEventsCount} calendar event(s), created ${substantive.events}. Use create_calendar_event.`);
    }
    
    // Check minimum read actions
    if (requirements.minReadActions && readActions.length < requirements.minReadActions) {
      score -= deductionPerReq;
      result.unmetRequirements.push(`Need to read at least ${requirements.minReadActions} data sources, read ${readActions.length}. Use get_matter, read_document_content, or search_document_content.`);
    }
    
    // Check if matter was read (if required)
    if (requirements.requiresMatterRead) {
      const hasMatterRead = actions.some(a => a.tool === 'get_matter' && a.success !== false);
      if (!hasMatterRead) {
        score -= deductionPerReq;
        result.unmetRequirements.push('Must read the matter first (get_matter) before producing work product.');
      }
    }
    
    // Check if document was read (if required)
    if (requirements.requiresDocumentRead) {
      const hasDocRead = actions.some(a => 
        (a.tool === 'read_document_content' || a.tool === 'find_and_read_document') && a.success !== false
      );
      if (!hasDocRead) {
        score -= deductionPerReq;
        result.unmetRequirements.push('Should read at least 1 document to produce an informed review.');
      }
    }
    
    // Check if conflict check was run (if required)
    if (requirements.requiresConflictCheck) {
      const hasConflictCheck = actions.some(a => a.tool === 'check_conflicts' && a.success !== false);
      if (!hasConflictCheck) {
        score -= deductionPerReq;
        result.unmetRequirements.push('Must run a conflict check (check_conflicts) during intake.');
      }
    }
    
    // Check if time/billing data was accessed (if required)
    if (requirements.requiresTimeCheck) {
      const hasTimeCheck = actions.some(a => 
        ['get_my_time_entries', 'list_invoices', 'generate_report', 'get_firm_analytics'].includes(a.tool) && a.success !== false
      );
      if (!hasTimeCheck) {
        score -= deductionPerReq;
        result.unmetRequirements.push('Must check time entries or invoices for billing review.');
      }
    }
    
    // Check minimum document content length
    if (requirements.minDocContentLength && docActions.length > 0) {
      const maxDocLength = Math.max(...docActions.map(d => (d.args?.content || d.args?.body || '').length));
      if (maxDocLength < requirements.minDocContentLength) {
        score -= deductionPerReq;
        result.unmetRequirements.push(`Document content too short (${maxDocLength} chars). Need at least ${requirements.minDocContentLength} chars of real content.`);
      } else {
        result.strengths.push(`Document has substantial content (${maxDocLength} chars)`);
      }
    }
    
    // Check minimum note content length
    if (requirements.minNoteContentLength && noteActions.length > 0) {
      const maxNoteLength = Math.max(...noteActions.map(n => (n.args?.content || n.args?.note || '').length));
      if (maxNoteLength < requirements.minNoteContentLength) {
        score -= Math.round(deductionPerReq / 2); // Less severe for notes
        result.unmetRequirements.push(`Note content is thin (${maxNoteLength} chars). Need at least ${requirements.minNoteContentLength} chars.`);
      }
    }
    
    // Check for placeholders in documents (if flagged)
    if (requirements.noPlaceholders && docActions.length > 0) {
      for (const doc of docActions) {
        const content = doc.args?.content || doc.args?.body || '';
        if (/\[INSERT|TODO|PLACEHOLDER|TBD\]/i.test(content)) {
          score -= 20;
          result.unmetRequirements.push('Document contains placeholder text ([INSERT], [TODO], etc.). Write real content.');
        }
      }
    }
    
    result.score = Math.min(100, Math.max(0, score));
    
    if (result.unmetRequirements.length > 0) {
      result.issues.push(`Work-type "${typeId}" has ${result.unmetRequirements.length} unmet requirement(s): ${result.unmetRequirements.join('; ')}`);
    } else {
      result.strengths.push(`All work-type requirements met for "${typeId}"`);
    }
    
  } catch (error) {
    console.error('[TaskEvaluator] Work type evaluation error:', error.message);
    // Non-fatal: return default score
  }
  
  return result;
}

/**
 * Evaluate citation integrity in created documents and notes.
 * Scans for legal citation patterns and flags any that appear to be
 * hallucinated (not from CPLR lookup or firm document search).
 * 
 * This is critical because a fabricated legal citation is a professional
 * ethics violation. Better to flag it than let it through.
 */
function evaluateCitationIntegrity(task, actions, docActions, noteActions) {
  const result = {
    score: 100, // Start at 100, deduct for issues
    flags: [],
    issues: [],
    strengths: [],
    totalCitations: 0,
    verifiedCitations: 0,
    unverifiedCitations: 0,
  };
  
  try {
    // Collect all text content the agent created
    const allCreatedContent = [];
    
    for (const doc of docActions) {
      const content = doc.args?.content || doc.args?.body || '';
      if (content.length > 0) {
        allCreatedContent.push({ type: 'document', name: doc.args?.name || 'untitled', content });
      }
    }
    
    for (const note of noteActions) {
      const content = note.args?.content || note.args?.note || '';
      if (content.length > 0) {
        allCreatedContent.push({ type: 'note', name: 'matter note', content });
      }
    }
    
    if (allCreatedContent.length === 0) {
      // No content to check
      return result;
    }
    
    // Track what legal sources the agent actually consulted
    const consultedSources = new Set();
    for (const action of actions) {
      if (action.success === false) continue;
      if (action.tool === 'lookup_cplr') consultedSources.add('cplr');
      if (action.tool === 'calculate_cplr_deadline') consultedSources.add('cplr_deadline');
      if (action.tool === 'search_document_content') consultedSources.add('doc_search');
      if (action.tool === 'read_document_content') consultedSources.add('doc_read');
    }
    
    // Scan each created content for citations
    for (const item of allCreatedContent) {
      for (const pattern of CITATION_PATTERNS) {
        // Reset regex lastIndex for global patterns
        pattern.lastIndex = 0;
        const matches = item.content.match(pattern) || [];
        
        for (const match of matches) {
          result.totalCitations++;
          
          // Check if this citation was already flagged as [UNVERIFIED]
          const contextStart = Math.max(0, item.content.indexOf(match) - 30);
          const contextEnd = Math.min(item.content.length, item.content.indexOf(match) + match.length + 30);
          const context = item.content.substring(contextStart, contextEnd);
          
          if (/\[UNVERIFIED|NEEDS? (?:CITE )?CHECK|NOT VERIFIED\]/i.test(context)) {
            result.verifiedCitations++; // Properly flagged
            continue;
          }
          
          // Check if it could be from a consulted source
          const isCPLR = /CPLR|N\.Y\.|A\.D\.|Misc\.|N\.Y\.S\./i.test(match);
          if (isCPLR && consultedSources.has('cplr')) {
            result.verifiedCitations++; // Likely from CPLR lookup
            continue;
          }
          
          // This citation has no clear source — flag it
          result.unverifiedCitations++;
          result.flags.push({
            citation: match,
            source: item.type,
            sourceName: item.name,
            context: context.trim(),
            risk: 'Potentially unverified citation. May be from LLM training data, not a verified legal source.',
          });
        }
      }
    }
    
    // Score calculation
    if (result.totalCitations === 0) {
      // No citations found — that's fine for many task types
      result.score = 100;
    } else if (result.unverifiedCitations === 0) {
      result.score = 100;
      result.strengths.push(`All ${result.totalCitations} citation(s) either verified or properly flagged`);
    } else {
      // Deduct based on ratio of unverified citations
      const unverifiedRatio = result.unverifiedCitations / result.totalCitations;
      result.score = Math.max(0, Math.round(100 - (unverifiedRatio * 80)));
      
      if (result.unverifiedCitations <= 2) {
        result.issues.push(
          `${result.unverifiedCitations} legal citation(s) may be unverified. ` +
          `Mark them with [UNVERIFIED - needs cite check] or verify with lookup_cplr/search_document_content. ` +
          `Citations: ${result.flags.map(f => f.citation).join('; ')}`
        );
      } else {
        result.issues.push(
          `${result.unverifiedCitations} of ${result.totalCitations} legal citations appear unverified. ` +
          `This is a significant risk. Mark unverified citations with [UNVERIFIED - needs cite check] ` +
          `and use lookup_cplr or search_document_content to verify where possible.`
        );
      }
    }
    
  } catch (error) {
    console.error('[TaskEvaluator] Citation evaluation error:', error.message);
    // Non-fatal: return default
  }
  
  return result;
}

/**
 * Store evaluation results in the database for tracking improvement over time.
 */
export async function storeEvaluation(taskId, evaluation) {
  try {
    await query(
      `UPDATE ai_background_tasks 
       SET result = jsonb_set(
         COALESCE(result, '{}')::jsonb, 
         '{evaluation}', 
         $1::jsonb
       ),
       updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({
        score: evaluation.overallScore,
        dimensions: evaluation.dimensions,
        issues: evaluation.issues,
        strengths: evaluation.strengths,
      }), taskId]
    );
  } catch (error) {
    console.log('[TaskEvaluator] Store evaluation note:', error.message);
  }
}

/**
 * Format evaluation for display or for the agent to see.
 */
export function formatEvaluationForAgent(evaluation) {
  const lines = [
    `\n== SELF-EVALUATION: Score ${evaluation.overallScore}/100 (Work Type: ${evaluation.workType || 'general'}) ==`,
  ];
  
  for (const [dim, score] of Object.entries(evaluation.dimensions)) {
    const bar = score >= 70 ? '✅' : score >= 40 ? '⚠️' : '❌';
    lines.push(`${bar} ${dim}: ${score}/100`);
  }
  
  if (evaluation.issues.length > 0) {
    lines.push(`\n**Issues to fix:**`);
    for (const issue of evaluation.issues) {
      lines.push(`- ❌ ${issue}`);
    }
  }
  
  // Show unverified citations specifically so the agent can address them
  if (evaluation.citationFlags && evaluation.citationFlags.length > 0) {
    lines.push(`\n**Unverified Citations (mark with [UNVERIFIED] or verify):**`);
    for (const flag of evaluation.citationFlags.slice(0, 5)) {
      lines.push(`- ⚠️ "${flag.citation}" in ${flag.sourceName}`);
    }
    if (evaluation.citationFlags.length > 5) {
      lines.push(`  ... and ${evaluation.citationFlags.length - 5} more`);
    }
  }
  
  if (evaluation.strengths.length > 0) {
    lines.push(`\n**Strengths:**`);
    for (const s of evaluation.strengths) {
      lines.push(`- ✅ ${s}`);
    }
  }
  
  if (evaluation.revisionNeeded) {
    lines.push(`\n⚠️ **REVISION NEEDED**: Score is below threshold. Fix the issues above before completing.`);
  }
  
  return lines.join('\n');
}

// Export the requirements for use in quality gates
export { WORK_TYPE_REQUIREMENTS, CITATION_PATTERNS };
