/**
 * Focus Guard — Goal Drift Detection & Re-Anchoring for Background Agent
 * 
 * The #1 failure mode of autonomous agents isn't tool errors or hallucinations —
 * it's LOSING FOCUS. The agent reads a document, sees something tangentially
 * interesting, starts investigating THAT instead of the assigned task, and before
 * you know it, 15 minutes have been spent on a side quest.
 * 
 * A real junior attorney has a supervising partner who walks by the desk and asks:
 * "Are you still working on that motion? It's due at 3pm."
 * This module IS that supervising partner.
 * 
 * ## How It Works
 * 
 * 1. **Goal Keyword Extraction** — Parses the task goal into actionable keywords
 *    and intent signals (what the attorney is actually asking for).
 * 
 * 2. **Tool Relevance Scoring** — Each tool call gets a "goal alignment" score
 *    based on how related its arguments are to the extracted goal keywords.
 * 
 * 3. **Rolling Focus Score** — Tracks focus over a sliding window of recent
 *    tool calls. A high focus score means the agent is on-task; a low score
 *    means it's drifting.
 * 
 * 4. **Drift Detection** — When the focus score drops below a threshold,
 *    generates a "focus intervention" message that snaps the agent back.
 * 
 * 5. **Budget Awareness** — Injects iteration/time budget awareness into
 *    periodic focus checks so the agent self-regulates urgency.
 * 
 * 6. **Tangent Tracking** — Records sequences of low-relevance tool calls
 *    to detect sustained tangent patterns (not just one-off reads).
 */

// Configuration
const FOCUS_CHECK_INTERVAL = 5;          // Check focus every 5 iterations
const FOCUS_SCORE_WINDOW = 8;            // Rolling window of recent tool calls for scoring
const DRIFT_THRESHOLD = 0.35;            // Below this = agent is drifting
const SEVERE_DRIFT_THRESHOLD = 0.20;     // Below this = agent is seriously off-task
const TANGENT_STREAK_WARN = 3;           // Warn after 3 consecutive low-relevance calls
const TANGENT_STREAK_INTERVENE = 5;      // Force re-plan after 5 consecutive low-relevance calls
const LOW_RELEVANCE_THRESHOLD = 0.30;    // Tool call below this is "low relevance"
const BUDGET_WARNING_PERCENT = 60;       // Start showing budget warnings at 60% spent
const BUDGET_URGENT_PERCENT = 80;        // Urgent budget warnings at 80% spent

// Tools that are always considered "on task" (meta tools, infrastructure)
const ALWAYS_ON_TASK_TOOLS = new Set([
  'think_and_plan', 'evaluate_progress', 'task_complete',
  'review_created_documents', 'log_work',
]);

// Tools that are inherently goal-aligned when goal involves their domain
const DOMAIN_TOOLS = {
  billing: new Set(['get_my_time_entries', 'list_invoices', 'generate_report', 'get_firm_analytics']),
  calendar: new Set(['get_calendar_events', 'create_calendar_event']),
  documents: new Set(['create_document', 'draft_legal_document', 'read_document_content', 'search_document_content', 'list_documents']),
  matters: new Set(['get_matter', 'search_matters', 'list_my_matters', 'update_matter']),
  tasks: new Set(['create_task', 'list_tasks', 'update_task']),
  notes: new Set(['add_matter_note']),
  research: new Set(['lookup_cplr', 'calculate_cplr_deadline', 'search_case_law']),
  conflicts: new Set(['check_conflicts']),
  clients: new Set(['list_clients', 'get_client']),
};

/**
 * Extract structured goal information from the task goal text.
 * Returns keywords, intent, and expected tool domains.
 */
export function extractGoalSignals(goal) {
  const goalLower = goal.toLowerCase();
  
  // Extract meaningful keywords (exclude stop words)
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
    'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
    'it', 'its', 'they', 'them', 'their', 'all', 'each', 'every',
    'any', 'some', 'no', 'not', 'only', 'very', 'just', 'also',
    'please', 'need', 'want', 'make', 'get', 'take',
  ]);
  
  const words = goalLower
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  const keywords = [...new Set(words)];
  
  // Extract entity names (capitalized words/phrases from original goal)
  const entityPattern = /\b([A-Z][a-z]+(?:\s+(?:v\.|vs\.?|and|&)\s+[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)*)\b/g;
  const entities = [];
  let match;
  while ((match = entityPattern.exec(goal)) !== null) {
    entities.push(match[1].toLowerCase());
  }
  
  // Determine intent
  const intents = [];
  if (/\b(review|assess|evaluate|audit|check|examine)\b/i.test(goal)) intents.push('review');
  if (/\b(draft|write|prepare|create|compose|author)\b/i.test(goal)) intents.push('create');
  if (/\b(research|investigate|find|look\s*up|analyze)\b/i.test(goal)) intents.push('research');
  if (/\b(deadline|calendar|schedule|docket|due\s*date)\b/i.test(goal)) intents.push('deadlines');
  if (/\b(bill|invoice|time|billing|unbilled|receivable)\b/i.test(goal)) intents.push('billing');
  if (/\b(email|letter|update|notify|communicate)\b/i.test(goal)) intents.push('communicate');
  if (/\b(intake|onboard|setup|new\s*matter|new\s*case)\b/i.test(goal)) intents.push('intake');
  if (/\b(conflict|conflicts)\b/i.test(goal)) intents.push('conflicts');
  
  // Map intents to expected tool domains
  const expectedDomains = new Set();
  expectedDomains.add('matters'); // Almost always relevant
  expectedDomains.add('notes');   // Always relevant
  expectedDomains.add('tasks');   // Always relevant
  
  if (intents.includes('create') || intents.includes('communicate')) expectedDomains.add('documents');
  if (intents.includes('research')) { expectedDomains.add('documents'); expectedDomains.add('research'); }
  if (intents.includes('deadlines')) { expectedDomains.add('calendar'); expectedDomains.add('research'); }
  if (intents.includes('billing')) expectedDomains.add('billing');
  if (intents.includes('review')) { expectedDomains.add('documents'); expectedDomains.add('calendar'); }
  if (intents.includes('intake')) { expectedDomains.add('conflicts'); expectedDomains.add('calendar'); }
  if (intents.includes('conflicts')) expectedDomains.add('conflicts');
  
  return {
    keywords,
    entities,
    intents,
    expectedDomains,
    goalLower,
  };
}

/**
 * Score a tool call's relevance to the goal.
 * Returns a score between 0.0 (completely irrelevant) and 1.0 (highly relevant).
 */
export function scoreToolRelevance(toolName, toolArgs, goalSignals) {
  // Meta tools are always on-task
  if (ALWAYS_ON_TASK_TOOLS.has(toolName)) return 1.0;
  
  let score = 0.0;
  const weights = { domain: 0.35, keyword: 0.35, entity: 0.20, phase: 0.10 };
  
  // 1. Domain relevance: is this tool in an expected domain?
  let domainScore = 0.0;
  for (const [domain, tools] of Object.entries(DOMAIN_TOOLS)) {
    if (tools.has(toolName)) {
      domainScore = goalSignals.expectedDomains.has(domain) ? 1.0 : 0.3;
      break;
    }
  }
  // Unrecognized tools get a neutral domain score
  if (domainScore === 0.0) domainScore = 0.5;
  score += domainScore * weights.domain;
  
  // 2. Keyword overlap: do the tool arguments contain goal keywords?
  const argsStr = JSON.stringify(toolArgs || {}).toLowerCase();
  let keywordHits = 0;
  for (const kw of goalSignals.keywords) {
    if (argsStr.includes(kw)) keywordHits++;
  }
  const keywordScore = goalSignals.keywords.length > 0
    ? Math.min(1.0, keywordHits / Math.max(1, Math.min(3, goalSignals.keywords.length)))
    : 0.5;
  score += keywordScore * weights.keyword;
  
  // 3. Entity match: do tool args reference entities from the goal?
  let entityScore = 0.5; // Neutral if no entities
  if (goalSignals.entities.length > 0) {
    let entityHits = 0;
    for (const entity of goalSignals.entities) {
      if (argsStr.includes(entity)) entityHits++;
    }
    entityScore = entityHits > 0 ? 1.0 : 0.2;
  }
  score += entityScore * weights.entity;
  
  // 4. Write tools that CREATE deliverables are generally on-task
  const isWriteTool = ['create_document', 'add_matter_note', 'create_task', 
                        'create_calendar_event', 'draft_legal_document'].includes(toolName);
  const phaseScore = isWriteTool ? 0.8 : 0.5;
  score += phaseScore * weights.phase;
  
  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * FocusGuard — The supervising partner that keeps the agent on-task.
 * Attach one instance to each BackgroundTask.
 */
export class FocusGuard {
  constructor(goal, maxIterations, maxRuntimeMs) {
    this.goalSignals = extractGoalSignals(goal);
    this.goal = goal;
    this.maxIterations = maxIterations;
    this.maxRuntimeMs = maxRuntimeMs;
    
    // Rolling focus tracking
    this.recentScores = [];           // Array of { toolName, score, iteration }
    this.tangentStreak = 0;           // Consecutive low-relevance tool calls
    this.lastFocusCheckIteration = 0; // When we last ran a focus check
    this.focusInterventionCount = 0;  // How many times we've intervened
    this.totalToolCalls = 0;
    this.totalRelevanceSum = 0;
    
    // Track what the agent has accomplished toward the goal
    this.goalProgressMarkers = {
      matterRead: false,
      documentsRead: 0,
      notesCreated: 0,
      documentsCreated: 0,
      tasksCreated: 0,
      eventsCreated: 0,
    };
  }
  
  /**
   * Record a tool call and update focus tracking.
   * Call this after every successful tool execution.
   */
  recordToolCall(toolName, toolArgs, success, iteration) {
    const score = scoreToolRelevance(toolName, toolArgs, this.goalSignals);
    
    this.recentScores.push({ toolName, score, iteration, success });
    if (this.recentScores.length > FOCUS_SCORE_WINDOW * 2) {
      this.recentScores = this.recentScores.slice(-FOCUS_SCORE_WINDOW * 2);
    }
    
    this.totalToolCalls++;
    this.totalRelevanceSum += score;
    
    // Track tangent streaks
    if (score < LOW_RELEVANCE_THRESHOLD && !ALWAYS_ON_TASK_TOOLS.has(toolName)) {
      this.tangentStreak++;
    } else {
      this.tangentStreak = 0;
    }
    
    // Track goal progress
    if (success) {
      if (toolName === 'get_matter') this.goalProgressMarkers.matterRead = true;
      if (toolName === 'read_document_content' || toolName === 'search_document_content') {
        this.goalProgressMarkers.documentsRead++;
      }
      if (toolName === 'add_matter_note') this.goalProgressMarkers.notesCreated++;
      if (toolName === 'create_document' || toolName === 'draft_legal_document') {
        this.goalProgressMarkers.documentsCreated++;
      }
      if (toolName === 'create_task') this.goalProgressMarkers.tasksCreated++;
      if (toolName === 'create_calendar_event') this.goalProgressMarkers.eventsCreated++;
    }
    
    return score;
  }
  
  /**
   * Get the current rolling focus score (0.0 to 1.0).
   */
  getFocusScore() {
    const window = this.recentScores.slice(-FOCUS_SCORE_WINDOW);
    if (window.length === 0) return 1.0; // No data yet = assume focused
    
    const sum = window.reduce((acc, s) => acc + s.score, 0);
    return sum / window.length;
  }
  
  /**
   * Get the overall session focus score.
   */
  getOverallFocusScore() {
    if (this.totalToolCalls === 0) return 1.0;
    return this.totalRelevanceSum / this.totalToolCalls;
  }
  
  /**
   * Check if a focus intervention is needed.
   * Call this from the main agent loop at regular intervals.
   * 
   * @param {number} iteration - Current iteration number
   * @param {number} elapsedMs - Milliseconds elapsed since task start
   * @param {string} currentPhase - Current execution phase
   * @returns {{ needed: boolean, severity: string, message: string }|null}
   */
  checkFocus(iteration, elapsedMs, currentPhase) {
    // Don't check too frequently
    if (iteration - this.lastFocusCheckIteration < FOCUS_CHECK_INTERVAL) {
      return null;
    }
    this.lastFocusCheckIteration = iteration;
    
    const focusScore = this.getFocusScore();
    const budgetPercent = (elapsedMs / this.maxRuntimeMs) * 100;
    const iterationPercent = (iteration / this.maxIterations) * 100;
    const spentPercent = Math.max(budgetPercent, iterationPercent);
    
    // Check for tangent streak (higher priority than focus score)
    if (this.tangentStreak >= TANGENT_STREAK_INTERVENE) {
      this.focusInterventionCount++;
      return {
        needed: true,
        severity: 'critical',
        message: this._buildTangentIntervention(iteration, elapsedMs, currentPhase),
      };
    }
    
    if (this.tangentStreak >= TANGENT_STREAK_WARN) {
      this.focusInterventionCount++;
      return {
        needed: true,
        severity: 'warning',
        message: this._buildTangentWarning(iteration, elapsedMs, currentPhase),
      };
    }
    
    // Check for drift based on rolling focus score
    if (focusScore < SEVERE_DRIFT_THRESHOLD) {
      this.focusInterventionCount++;
      return {
        needed: true,
        severity: 'critical',
        message: this._buildDriftIntervention(focusScore, iteration, elapsedMs, currentPhase),
      };
    }
    
    if (focusScore < DRIFT_THRESHOLD) {
      this.focusInterventionCount++;
      return {
        needed: true,
        severity: 'warning',
        message: this._buildDriftWarning(focusScore, iteration, elapsedMs, currentPhase),
      };
    }
    
    // Budget awareness check (even when focused)
    if (spentPercent >= BUDGET_URGENT_PERCENT && currentPhase !== 'review') {
      return {
        needed: true,
        severity: 'budget_urgent',
        message: this._buildBudgetUrgent(iteration, elapsedMs, currentPhase),
      };
    }
    
    if (spentPercent >= BUDGET_WARNING_PERCENT && currentPhase === 'discovery') {
      return {
        needed: true,
        severity: 'budget_warning',
        message: this._buildBudgetWarning(iteration, elapsedMs, currentPhase),
      };
    }
    
    return null;
  }
  
  /**
   * Build a focus-aware re-prompt for text-only recovery.
   * This replaces the generic "call a tool" message with one that 
   * re-anchors to the goal.
   */
  buildFocusedReprompt(currentPhase, textOnlyStreak) {
    const phaseActions = {
      discovery: `Read the matter file or documents related to: "${this.goal}"`,
      analysis: `Write an analysis note about: "${this.goal}"`,
      action: `Create a deliverable (document, task, or event) for: "${this.goal}"`,
      review: `Call review_created_documents to verify your work on: "${this.goal}"`,
    };
    
    const action = phaseActions[currentPhase] || `Take action on: "${this.goal}"`;
    
    if (textOnlyStreak <= 2) {
      return `STOP. Call a tool NOW. ${action}`;
    }
    
    return `⚠️ You have produced ${textOnlyStreak} text responses without calling any tool. ` +
           `Your assigned task is: "${this.goal}". ` +
           `${action}. Call a tool IMMEDIATELY.`;
  }
  
  /**
   * Build a budget-aware status line for injection into plan messages.
   */
  buildBudgetStatus(iteration, elapsedMs) {
    const budgetPercent = Math.round((elapsedMs / this.maxRuntimeMs) * 100);
    const iterPercent = Math.round((iteration / this.maxIterations) * 100);
    const spentPercent = Math.max(budgetPercent, iterPercent);
    const remainingMin = Math.max(1, Math.round((this.maxRuntimeMs - elapsedMs) / 60000));
    const remainingIters = this.maxIterations - iteration;
    
    let urgency;
    if (spentPercent >= 85) urgency = '🔴 URGENT';
    else if (spentPercent >= 70) urgency = '🟡 HURRY';
    else if (spentPercent >= 50) urgency = '🟢 ON TRACK';
    else urgency = '🟢 PLENTY OF TIME';
    
    return `${urgency} | ${remainingMin}min left | ~${remainingIters} iterations left | ${budgetPercent}% time used`;
  }
  
  /**
   * Build goal-progress summary for injection into focus messages.
   */
  buildProgressSummary() {
    const m = this.goalProgressMarkers;
    const parts = [];
    if (m.matterRead) parts.push('Matter read ✓');
    if (m.documentsRead > 0) parts.push(`${m.documentsRead} doc(s) read`);
    if (m.notesCreated > 0) parts.push(`${m.notesCreated} note(s)`);
    if (m.documentsCreated > 0) parts.push(`${m.documentsCreated} document(s)`);
    if (m.tasksCreated > 0) parts.push(`${m.tasksCreated} task(s)`);
    if (m.eventsCreated > 0) parts.push(`${m.eventsCreated} event(s)`);
    
    if (parts.length === 0) return 'Nothing accomplished yet toward the goal.';
    return `Progress: ${parts.join(', ')}`;
  }
  
  /**
   * Get current focus status for logging/telemetry.
   */
  getStatus() {
    return {
      focusScore: Math.round(this.getFocusScore() * 100) / 100,
      overallFocusScore: Math.round(this.getOverallFocusScore() * 100) / 100,
      tangentStreak: this.tangentStreak,
      interventionCount: this.focusInterventionCount,
      totalToolCalls: this.totalToolCalls,
      goalProgress: this.goalProgressMarkers,
    };
  }
  
  // ===== INTERNAL: Message Builders =====
  
  _buildTangentIntervention(iteration, elapsedMs, currentPhase) {
    const budget = this.buildBudgetStatus(iteration, elapsedMs);
    const progress = this.buildProgressSummary();
    const recentOff = this.recentScores.slice(-5).map(s => s.toolName).join(', ');
    
    return `== ⚠️ FOCUS INTERVENTION (${this.tangentStreak} consecutive off-task actions) ==

**Your assigned task:** "${this.goal}"
**Budget:** ${budget}
**${progress}**

You have made ${this.tangentStreak} consecutive tool calls that appear UNRELATED to your assigned task.
Recent tools: ${recentOff}

STOP what you are doing. Call think_and_plan NOW to refocus on: "${this.goal}"
Your ONLY job is to complete the assigned task. Do NOT investigate tangential issues.
If you found something concerning during your work, note it briefly and move on.

Phase: ${currentPhase.toUpperCase()} — focus on ${this._phaseGoal(currentPhase)}.`;
  }
  
  _buildTangentWarning(iteration, elapsedMs, currentPhase) {
    const budget = this.buildBudgetStatus(iteration, elapsedMs);
    
    return `== FOCUS CHECK ==
**Task:** "${this.goal}" | ${budget}
You appear to be drifting from the task (${this.tangentStreak} potentially off-task actions in a row).
Refocus: ${this._phaseGoal(currentPhase)}. Stay on task.`;
  }
  
  _buildDriftIntervention(focusScore, iteration, elapsedMs, currentPhase) {
    const budget = this.buildBudgetStatus(iteration, elapsedMs);
    const progress = this.buildProgressSummary();
    
    return `== ⚠️ GOAL DRIFT DETECTED (focus score: ${Math.round(focusScore * 100)}%) ==

**Your assigned task:** "${this.goal}"
**Budget:** ${budget}
**${progress}**

Your recent actions are NOT well-aligned with the assigned task.
Call think_and_plan to create a focused plan for completing: "${this.goal}"
Do NOT explore tangential topics. Stay laser-focused on deliverables.

Phase: ${currentPhase.toUpperCase()} — ${this._phaseGoal(currentPhase)}.`;
  }
  
  _buildDriftWarning(focusScore, iteration, elapsedMs, currentPhase) {
    const budget = this.buildBudgetStatus(iteration, elapsedMs);
    
    return `== FOCUS CHECK ==
**Task:** "${this.goal}" | ${budget}
Focus score: ${Math.round(focusScore * 100)}% — some recent actions may be off-task.
Stay focused on: ${this._phaseGoal(currentPhase)}.`;
  }
  
  _buildBudgetUrgent(iteration, elapsedMs, currentPhase) {
    const budget = this.buildBudgetStatus(iteration, elapsedMs);
    const progress = this.buildProgressSummary();
    
    return `== 🔴 BUDGET ALERT ==
**Task:** "${this.goal}" | ${budget}
**${progress}**

You are running low on time. You MUST:
1. STOP gathering new information
2. Create remaining deliverables NOW (notes, documents, tasks)
3. Move to REVIEW phase and call task_complete

Do NOT start any new research or reading. Produce output with what you have.`;
  }
  
  _buildBudgetWarning(iteration, elapsedMs, currentPhase) {
    const budget = this.buildBudgetStatus(iteration, elapsedMs);
    
    return `== BUDGET CHECK ==
**Task:** "${this.goal}" | ${budget}
You are still in ${currentPhase.toUpperCase()} phase. Start moving toward producing deliverables soon.
Don't spend too long reading — shift to creating work product.`;
  }
  
  _phaseGoal(phase) {
    const goals = {
      discovery: `gather information specifically about "${this.goal}"`,
      analysis: `analyze and document findings related to "${this.goal}"`,
      action: `create deliverables (documents, tasks, events) for "${this.goal}"`,
      review: `review your work product and complete the task`,
    };
    return goals[phase] || `complete "${this.goal}"`;
  }
}

/**
 * Factory function to create a FocusGuard for a task.
 */
export function createFocusGuard(goal, maxIterations, maxRuntimeMs) {
  return new FocusGuard(goal, maxIterations, maxRuntimeMs);
}
