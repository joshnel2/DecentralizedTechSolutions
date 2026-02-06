/**
 * Task Evaluator - Post-Task Self-Evaluation
 * 
 * After the agent completes a task, this module:
 * 1. Re-reads everything the agent created (documents, notes, tasks)
 * 2. Scores the output on multiple dimensions
 * 3. If score is below threshold, triggers a revision pass
 * 4. Stores evaluation results for tracking improvement over time
 * 
 * This is the "generator-critic" pattern that separates good agents from great ones.
 * The agent becomes its own quality reviewer before the lawyer ever sees the output.
 */

import { query } from '../../db/connection.js';

/**
 * Evaluation dimensions for agent output
 */
const EVAL_DIMENSIONS = {
  COMPLETENESS: 'completeness',     // Did the agent address the full goal?
  SPECIFICITY: 'specificity',       // Is the output specific to this matter (not generic)?
  ACTIONABILITY: 'actionability',   // Are there clear next steps?
  PROFESSIONALISM: 'professionalism', // Is the quality worthy of a law firm?
  THOROUGHNESS: 'thoroughness',     // Did the agent do enough work?
};

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
    
    // ===== OVERALL SCORE =====
    const weights = {
      [EVAL_DIMENSIONS.COMPLETENESS]: 0.25,
      [EVAL_DIMENSIONS.SPECIFICITY]: 0.25,
      [EVAL_DIMENSIONS.ACTIONABILITY]: 0.15,
      [EVAL_DIMENSIONS.THOROUGHNESS]: 0.20,
      [EVAL_DIMENSIONS.PROFESSIONALISM]: 0.15,
    };
    
    evaluation.overallScore = Math.round(
      Object.entries(weights).reduce((sum, [dim, weight]) => {
        return sum + (evaluation.dimensions[dim] || 0) * weight;
      }, 0)
    );
    
    // Determine if revision is needed
    evaluation.revisionNeeded = evaluation.overallScore < 50 || evaluation.issues.length > 2;
    
    console.log(`[TaskEvaluator] Task ${task.id} scored ${evaluation.overallScore}/100 (${evaluation.revisionNeeded ? 'REVISION NEEDED' : 'PASSED'})`);
    
    return evaluation;
  } catch (error) {
    console.error('[TaskEvaluator] Evaluation error:', error.message);
    return { overallScore: -1, revisionNeeded: false, issues: [], strengths: [], dimensions: {} };
  }
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
    `\n== SELF-EVALUATION: Score ${evaluation.overallScore}/100 ==`,
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
