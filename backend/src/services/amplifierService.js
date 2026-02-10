/**
 * Enhanced Amplifier Background Agent Service
 * 
 * This service provides a powerful background agent powered by Microsoft Amplifier
 * with FULL access to all platform tools and learning capabilities.
 * 
 * Features:
 * - Access to all tools the normal AI agent has
 * - Learning from user interactions
 * - Long-running autonomous task support
 * - Workflow templates for common operations
 * - Progress tracking and checkpointing
 */

import { EventEmitter } from 'events';
import { query } from '../db/connection.js';
import { getUserContext, getMatterContext, getLearningContext } from './amplifier/platformContext.js';
import { getLawyerProfile, formatProfileForPrompt as formatLawyerProfile, updateProfileAfterTask } from './amplifier/lawyerProfile.js';
import { DEFAULT_TIMEZONE, getTodayInTimezone, getDatePartsInTimezone } from '../utils/dateUtils.js';
import { evaluateTask, storeEvaluation, formatEvaluationForAgent } from './amplifier/taskEvaluator.js';
import { AMPLIFIER_TOOLS, AMPLIFIER_OPENAI_TOOLS, executeTool } from './amplifier/toolBridge.js';
import { pushAgentEvent, updateAgentProgress } from '../routes/agentStream.js';
import { getCPLRContextForPrompt, getCPLRGuidanceForMatter } from './amplifier/legalKnowledge/nyCPLR.js';
import { getUserDocumentProfile, formatProfileForPrompt, onDocumentAccessed } from './amplifier/documentLearning.js';
import { createCheckpointRewindManager } from './amplifier/checkpointRewind.js';
import { createAgentMemory, recursiveCompact, AgentMemory } from './amplifier/recursiveSummarizer.js';
import { generateBrief, classifyWork, getTimeBudget } from './amplifier/juniorAttorneyBrief.js';
// Attorney Identity: deep learning of WHO the attorney is (writing style, thinking patterns, corrections)
// This progressively replaces the generic junior attorney brief as it learns
import { getAttorneyIdentity, formatIdentityForPrompt, learnFromCorrection } from './amplifier/attorneyIdentity.js';
// Attorney Exemplars: approved work samples + correction pairs, matched by embedding similarity
// "Show don't tell" — actual excerpts of the attorney's voice, not abstract trait labels
import { getRelevantExemplars, formatExemplarsForPrompt } from './amplifier/attorneyExemplars.js';
// Identity Replay: replay the attorney's actual decision-making process from approved tasks
// Today's Neuralink — the agent follows the attorney's own recorded footsteps
import { findMatchingReplays, formatReplayForPrompt, shouldReplayReplaceBrief } from './amplifier/identityReplay.js';

// ===== NEWLY CONNECTED: Previously-dormant Amplifier harness modules =====
// Decision Reinforcer: real-time learning from every tool outcome
import { DecisionReinforcer } from './amplifier/decisionReinforcer.js';
// Module System: pre-built workflow templates for legal task types
import { detectModule, formatModuleForPrompt } from './amplifier/modules/index.js';
// Amplifier hooks: rate limiting + learning extraction on API calls
// Uses dedicated amplifierHooks.js to avoid circular dependency chain
import { hooks as enhancedAmplifierHooks } from './amplifier/amplifierHooks.js';
// Learning Optimizer: cross-task pattern refinement (periodic)
import { LearningOptimizer } from './amplifier/learningOptimizer.js';
// Harness Intelligence: rejection learning, tool chains, matter memory, confidence scoring
import {
  getQualityOverrides, recordOverrideSuccess, learnFromRejection,
  getProvenToolChain, formatToolChainForPrompt, recordToolChain, recordToolChainFailure,
  getMatterMemory, storeMatterMemories, extractMemoriesFromTask,
  calculateConfidenceReport, formatConfidenceForReview,
} from './amplifier/harnessIntelligence.js';
// Interaction learning: how the lawyer uses the software (pages, features, workflows)
import { getUserInteractionProfile, formatInteractionProfileForPrompt } from '../services/interactionLearning.js';
// Activity learning: what the lawyer actually does (matters, docs, time entries)
import { getRecentActivityContext } from './amplifier/activityLearning.js';
// Unified learning context: selective, budgeted prompt injection from ALL learning sources
import { buildUnifiedLearningContext } from './amplifier/unifiedLearningContext.js';
// ===== COGNITIVE IMPRINTING: The next evolution of attorney learning =====
// Cognitive State: infers deep_work/triage/urgent mode from observable signals
import { inferCognitiveState, formatCognitiveStateForPrompt } from './amplifier/cognitiveState.js';
// Cognitive Signature: model-agnostic mathematical representation of attorney identity
import { getCognitiveSignature, renderSignatureForPrompt } from './amplifier/cognitiveSignature.js';
// Edit Diff Learning: captures silent edits to agent-created documents as high-confidence signals
import { getEditLearnedPreferences, trackAgentCreatedDocument } from './amplifier/editDiffLearning.js';
// Associative Memory: maps how the lawyer uniquely connects legal concepts during reasoning
import { extractAssociations, getRelevantAssociations, reinforceAssociations, weakenAssociations } from './amplifier/associativeMemory.js';
// Resonance Memory: the living cognitive graph that connects all memory systems
import { loadResonanceGraph, renderGraphForPrompt, invalidateGraphCache } from './amplifier/resonanceMemory.js';
// Focus Guard: goal drift detection, re-anchoring, budget awareness
// The supervising partner that keeps the agent laser-focused on the assigned task
import { createFocusGuard } from './amplifier/focusGuard.js';
// User AI Memory File: persistent per-user memory that grows as the attorney uses the platform
// Automatically populated from tasks, documents, interactions, and chat
import { getMemoryForPrompt, learnFromTask as memoryLearnFromTask, updateActiveContext } from '../services/userAIMemory.js';

// ===== SINGLETON INSTANCES for cross-task learning =====
// These persist across tasks so learnings accumulate over the service lifetime
const globalDecisionReinforcer = new DecisionReinforcer();
const globalLearningOptimizer = new LearningOptimizer();

// Schedule periodic learning optimization (every hour)
let _learningOptimizerInterval = null;
function startLearningOptimizerSchedule() {
  if (_learningOptimizerInterval) return;
  _learningOptimizerInterval = setInterval(async () => {
    try {
      // Get distinct firm IDs from recent tasks
      const result = await query(
        `SELECT DISTINCT firm_id FROM ai_background_tasks 
         WHERE completed_at > NOW() - INTERVAL '24 hours' LIMIT 10`
      );
      for (const row of (result?.rows || [])) {
        await globalLearningOptimizer.optimize(row.firm_id).catch(e => 
          console.warn('[LearningOptimizer] Optimization cycle skipped:', e.message)
        );
      }
    } catch (e) {
      // Non-fatal: table may not exist yet
      if (!e.message?.includes('ai_background_tasks')) {
        console.warn('[LearningOptimizer] Schedule error:', e.message);
      }
    }
  }, 3600000); // Every hour
  console.log('[AmplifierService] Learning optimizer scheduled (hourly)');
}
// Start the scheduler on module load (non-blocking)
try { startLearningOptimizerSchedule(); } catch (_) {}

// Store active tasks per user
const activeTasks = new Map();

// Task status types
const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  WAITING_INPUT: 'waiting_input'
};

// Azure OpenAI configuration - model-agnostic, config-driven
// Swap models by changing AZURE_OPENAI_DEPLOYMENT env var in Azure App Service
// The harness works with any model that supports function calling:
// GPT-4o, GPT-4o-mini, GPT-4.1, o1, o3, or any future Azure-hosted model
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';

// Background agent runtime defaults (tuned for DEEP, THOROUGH legal work)
// The agent should NEVER give up early - push through rate limits, errors, and complexity.
// A junior attorney wouldn't stop after 15 minutes; neither should the agent.
const DEFAULT_MAX_ITERATIONS = 350;       // Up from 200: more room to be thorough
const DEFAULT_MAX_RUNTIME_MINUTES = 90;   // Up from 45: 60 min target + 30 min buffer
const EXTENDED_MAX_ITERATIONS = 800;      // Up from 400: deep-dive complex projects
const EXTENDED_MAX_RUNTIME_MINUTES = 480; // Up from 120: 8 hours for major projects
const CHECKPOINT_INTERVAL_MS = 10000;     // Down from 15s: save progress more often
const MESSAGE_COMPACT_MAX_CHARS = 20000;  // Tightened from 24000: reduce per-call token cost
const MESSAGE_COMPACT_MAX_MESSAGES = 28;  // Tightened from 36: compact sooner to stay lean
const MEMORY_MESSAGE_PREFIX = '## TASK MEMORY';
const PLAN_MESSAGE_PREFIX = '## EXECUTION PLAN';

// Execution phases for structured 30-minute task management
const ExecutionPhase = {
  DISCOVERY: 'discovery',   // Gather info, read docs, understand context (first ~20%)
  ANALYSIS: 'analysis',     // Analyze findings, identify issues (next ~20%)
  ACTION: 'action',         // Create deliverables: docs, notes, tasks (next ~40%)
  REVIEW: 'review',         // Verify work, create follow-ups, finalize (last ~20%)
};

const PHASE_CONFIG = {
  [ExecutionPhase.DISCOVERY]: {
    maxIterationPercent: 25,  // spend at most 25% of iterations here
    tokenBudget: 3000,       // Up from 2000: richer context gathering
    temperature: 0.3,
    description: 'Gathering information and understanding context',
    requiredBefore: null,
  },
  [ExecutionPhase.ANALYSIS]: {
    maxIterationPercent: 25,
    tokenBudget: 4000,       // Up from 3000: deeper analysis responses
    temperature: 0.4,
    description: 'Analyzing findings and identifying issues',
    requiredBefore: ExecutionPhase.DISCOVERY,
  },
  [ExecutionPhase.ACTION]: {
    maxIterationPercent: 35,
    tokenBudget: 4000,       // longer responses for document creation
    temperature: 0.5,
    description: 'Creating deliverables and work product',
    requiredBefore: ExecutionPhase.ANALYSIS,
  },
  [ExecutionPhase.REVIEW]: {
    maxIterationPercent: 15,
    tokenBudget: 4000,       // Up from 3000: thorough review responses
    temperature: 0.3,
    description: 'Reviewing work, creating follow-ups, finalizing',
    requiredBefore: ExecutionPhase.ACTION,
  },
};

// Task complexity estimation for better progress tracking
// Increased step counts and time estimates to encourage thoroughness
const TASK_COMPLEXITY = {
  simple: { estimatedSteps: 15, estimatedMinutes: 10 },
  moderate: { estimatedSteps: 30, estimatedMinutes: 25 },
  complex: { estimatedSteps: 60, estimatedMinutes: 50 },
  major: { estimatedSteps: 120, estimatedMinutes: 80 }
};

/**
 * Estimate task complexity based on goal keywords
 */
function estimateTaskComplexity(goal) {
  const goalLower = goal.toLowerCase();
  
  // Major complexity indicators
  const majorKeywords = ['comprehensive', 'full review', 'entire', 'all matters', 'audit', 'overhaul', 'complete analysis', 'deep dive'];
  if (majorKeywords.some(k => goalLower.includes(k))) {
    return 'major';
  }
  
  // Complex indicators
  const complexKeywords = ['research', 'analyze', 'review', 'prepare', 'draft memo', 'legal memo', 'case assessment', 'strategy', 'litigation'];
  if (complexKeywords.some(k => goalLower.includes(k))) {
    return 'complex';
  }
  
  // Moderate indicators
  const moderateKeywords = ['update', 'create document', 'draft letter', 'schedule', 'organize', 'summarize'];
  if (moderateKeywords.some(k => goalLower.includes(k))) {
    return 'moderate';
  }
  
  // Default to simple
  return 'simple';
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Scan document content for hallucination patterns BEFORE saving.
 * 
 * This catches the most dangerous LLM failure mode for legal work:
 * fabricated case citations that look real but don't exist. A partner
 * who files a brief with a hallucinated citation faces ethics sanctions.
 * 
 * Returns an array of issue strings (empty = no issues detected).
 * 
 * IMPORTANT: This is intentionally conservative. It flags potential
 * issues for the agent to address (mark [UNVERIFIED] or remove), 
 * rather than blocking all citations. CPLR citations from lookup_cplr
 * are not flagged because they come from a verified source.
 */
function _scanForHallucinations(content, documentName) {
  const issues = [];
  if (!content || content.length < 100) return issues;
  
  // 1. Detect suspicious case citations that follow "v." pattern
  //    with specific reporter citations (e.g., "Smith v. Jones, 123 F.3d 456 (2d Cir. 2019)")
  //    These are the highest-risk hallucinations because they look authoritative.
  const fullCaseCitations = content.match(
    /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+v\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,?\s+\d+\s+(?:F\.(?:2d|3d|4th|Supp\.(?:2d|3d)?)|U\.S\.|S\.Ct\.|L\.Ed\.(?:2d)?|N\.Y\.(?:2d|3d)?|A\.D\.(?:2d|3d)?|Misc\.(?:2d|3d)?|N\.Y\.S\.(?:2d|3d)?)\s+\d+/g
  ) || [];
  
  // Check each citation: if it's not marked as [UNVERIFIED] in surrounding context, flag it
  for (const citation of fullCaseCitations) {
    const idx = content.indexOf(citation);
    if (idx === -1) continue;
    const surroundingContext = content.substring(
      Math.max(0, idx - 50), 
      Math.min(content.length, idx + citation.length + 50)
    );
    
    // Skip if already flagged
    if (/\[UNVERIFIED|NEEDS? (?:CITE )?CHECK|NOT VERIFIED|VERIFY BEFORE|CITATION NEEDED\]/i.test(surroundingContext)) {
      continue;
    }
    
    // Skip if it's referencing a CPLR section (those come from verified lookup)
    if (/CPLR\s*§?\s*\d/i.test(surroundingContext)) {
      continue;
    }
    
    issues.push(`Unverified case citation: "${citation.substring(0, 80)}". Mark with [UNVERIFIED - VERIFY BEFORE FILING] or remove`);
    
    // Cap at 3 issues to keep the error message manageable
    if (issues.length >= 3) break;
  }
  
  // 2. Detect fabricated statute citations (non-CPLR)
  //    e.g., "42 U.S.C. § 1983" is real, but "42 U.S.C. § 99999" is suspicious
  const federalStatuteCitations = content.match(/\d+\s+U\.S\.C\.?\s*§+\s*\d+/g) || [];
  for (const statute of federalStatuteCitations) {
    const sectionNum = parseInt((statute.match(/§+\s*(\d+)/) || [])[1] || '0');
    // Very high section numbers are suspicious (most titles don't go above ~20000)
    if (sectionNum > 50000) {
      issues.push(`Suspicious federal statute citation: "${statute}". Section number is unusually high.`);
    }
  }
  
  // 3. Detect completely fabricated-looking legal Latin or boilerplate
  //    that LLMs sometimes generate to sound authoritative
  const fabricatedPatterns = [
    /(?:pursuant to|under)\s+the\s+doctrine\s+of\s+[a-z]+\s+[a-z]+\s+[a-z]+\s+[a-z]+\s+[a-z]+/i,
  ];
  // (Intentionally minimal to avoid false positives)
  
  return issues;
}

const getRetryAfterMs = (response, errorText) => {
  if (response?.headers) {
    const retryAfterHeader = response.headers.get('retry-after');
    if (retryAfterHeader) {
      const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1000;
      }
    }
  }
  
  if (typeof errorText === 'string') {
    const match = errorText.match(/retry after (\d+)\s*seconds/i);
    if (match) {
      const retryAfterSeconds = Number.parseInt(match[1], 10);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1000;
      }
    }
  }
  
  return null;
};

let persistenceAvailable = true;
let persistenceWarningLogged = false;

function markPersistenceUnavailable(error) {
  if (!error?.message) return;
  if (error.message.includes('ai_background_tasks')) {
    persistenceAvailable = false;
    if (!persistenceWarningLogged) {
      persistenceWarningLogged = true;
      console.warn('[AmplifierService] Background task persistence disabled (ai_background_tasks missing). Apply migration to enable checkpoints.');
    }
  }
}

/**
 * Get Azure OpenAI configuration - uses constants read at module load
 */
function getAzureConfig() {
  return {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME
  };
}

/**
 * Generate a unique task ID
 */
function generateTaskId() {
  return `amp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Call Azure OpenAI with function calling
 * Uses the SAME configuration and request format as the normal AI agent (aiAgent.js)
 * This ensures the background agent behaves identically to the normal agent
 */
async function callAzureOpenAI(messages, tools = [], options = {}) {
  const config = getAzureConfig();
  
  // Validate configuration before making request
  if (!config.endpoint || !config.apiKey || !config.deployment) {
    throw new Error('Azure OpenAI not configured: missing endpoint, API key, or deployment');
  }
  
  // Build URL - EXACT same format as aiAgent.js
  // aiAgent.js uses: `${AZURE_ENDPOINT}openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`
  // The endpoint should include trailing slash, but we handle both cases
  const baseEndpoint = config.endpoint.endsWith('/') ? config.endpoint : `${config.endpoint}/`;
  const url = `${baseEndpoint}openai/deployments/${config.deployment}/chat/completions?api-version=${API_VERSION}`;
  
  // Match the EXACT request body format as aiAgent.js for consistency
  const body = {
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 4000,
  };
  
  // Add tools for function calling (agent mode) - EXACT same as aiAgent.js
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
    body.parallel_tool_calls = true; // Enable parallel tool calls for speed
  }
  
  console.log(`[Amplifier] Calling Azure OpenAI: ${config.deployment} with ${tools.length} tools`);
  console.log(`[Amplifier] Request URL: ${url}`);
  
  // ===== ENHANCED AMPLIFIER HOOK: Pre-API rate limiting =====
  // Wait for rate limiter capacity before making the request
  const estimatedTokens = (options.max_tokens || 4000) + messages.reduce((sum, m) => sum + (m.content?.length || 0) / 4, 0);
  try {
    await enhancedAmplifierHooks.beforeApiCall(Math.round(estimatedTokens));
  } catch (rateLimitErr) {
    // If rate limiter says to wait, respect it but don't fail the whole call
    console.warn(`[Amplifier] Rate limiter pre-check: ${rateLimitErr.message}`);
  }
  
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);
  const maxAttempts = 8; // Up from 5: push through transient failures harder
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
      },
      body: JSON.stringify(body),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`[Amplifier] Azure OpenAI response received, choices: ${data.choices?.length || 0}`);
      // ===== ENHANCED AMPLIFIER HOOK: Record successful API call =====
      try { enhancedAmplifierHooks.afterApiSuccess(); } catch (_) {}
      return data;
    }
    
    const errorText = await response.text();
    const isRetryable = retryableStatuses.has(response.status);
    const retryAfterMs = response.status === 429 ? getRetryAfterMs(response, errorText) : null;
    
    // Enhanced error logging for debugging
    console.error(`[Amplifier] Azure OpenAI error (attempt ${attempt}/${maxAttempts}):`);
    console.error('[Amplifier]   Status:', response.status);
    console.error('[Amplifier]   URL:', url);
    console.error('[Amplifier]   Deployment:', config.deployment);
    console.error('[Amplifier]   API Key present:', !!config.apiKey, '(length:', config.apiKey?.length || 0, ')');
    console.error('[Amplifier]   Error:', errorText.substring(0, 500));
    
    if (!isRetryable || attempt === maxAttempts) {
      let errorMessage = `Azure OpenAI API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        errorMessage = `Azure OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`;
      }
      throw new Error(errorMessage);
    }
    
    const baseDelay = 1000 * Math.pow(2, attempt - 1);
    const delay = retryAfterMs ? Math.max(baseDelay, retryAfterMs) : baseDelay;
    const delaySeconds = Math.round(delay / 1000);
    console.warn(`[Amplifier] Retryable error, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
    
    // Log rate limit specifically for monitoring
    if (response.status === 429) {
      console.warn(`[Amplifier] Rate limited by Azure OpenAI, waiting ${delaySeconds}s`);
      // ===== ENHANCED AMPLIFIER HOOK: Record rate limit for adaptive backoff =====
      try { enhancedAmplifierHooks.afterRateLimit(delay); } catch (_) {}
    }
    
    await sleep(delay);
  }
}

/**
 * Convert our tool definitions to OpenAI function format
 * Uses the EXACT same tools as aiAgent.js for consistency
 */
function getOpenAITools() {
  // ALWAYS prefer the imported AGENT_TOOLS from aiAgent.js
  // This ensures background agent uses EXACTLY the same tools as normal AI chat
  if (Array.isArray(AMPLIFIER_OPENAI_TOOLS) && AMPLIFIER_OPENAI_TOOLS.length > 0) {
    console.log(`[Amplifier] Using ${AMPLIFIER_OPENAI_TOOLS.length} tools from aiAgent.js`);
    return AMPLIFIER_OPENAI_TOOLS;
  }
  
  console.warn('[Amplifier] AMPLIFIER_OPENAI_TOOLS not available, falling back to AMPLIFIER_TOOLS conversion');
  
  return Object.entries(AMPLIFIER_TOOLS).map(([name, tool]) => ({
    type: 'function',
    function: {
      name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(tool.parameters || {}).map(([key, desc]) => {
            const descStr = String(desc || '');
            const typePart = descStr.split(' - ')[0] || 'string';
            const descPart = descStr.split(' - ')[1] || '';
            
            // Handle array types - OpenAI requires an "items" schema for arrays
            if (typePart === 'array') {
              return [key, {
                type: 'array',
                description: descPart,
                items: {
                  type: 'object',
                  properties: {},
                  additionalProperties: true
                }
              }];
            }
            
            return [key, { type: typePart, description: descPart }];
          })
        ),
        required: tool.required || []
      }
    }
  }));
}

/**
 * Enhanced Background Task class
 */
class BackgroundTask extends EventEmitter {
  constructor(taskId, userId, firmId, goal, options = {}) {
    super();
    this.id = taskId;
    this.userId = userId;
    this.firmId = firmId;
    this.goal = goal;
    this.options = options;
    this.status = TaskStatus.PENDING;
    this.progress = {
      currentStep: 'Initializing...',
      progressPercent: 0,
      iterations: 0,
      totalSteps: 0,
      completedSteps: 0
    };
    this.messages = [];
    this.actionsHistory = [];
    this.result = null;
    this.error = null;
    this.startTime = new Date();
    this.endTime = null;
    this.cancelled = false;
    // Support "extended" mode for long-running complex legal projects
    const isExtended = options.extended || options.mode === 'extended' || options.mode === 'long';
    const baseIterations = isExtended ? EXTENDED_MAX_ITERATIONS : DEFAULT_MAX_ITERATIONS;
    const baseRuntimeMinutes = isExtended ? EXTENDED_MAX_RUNTIME_MINUTES : DEFAULT_MAX_RUNTIME_MINUTES;
    
    this.maxIterations = options.maxIterations || options.max_iterations || baseIterations;
    this.maxRuntimeMs = (options.maxRuntimeMinutes || options.max_runtime_minutes || baseRuntimeMinutes) * 60 * 1000;
    this.isExtendedMode = isExtended;
    this.lastCheckpointAt = 0;
    this.plan = null;
    this.recentTools = [];
    
    // User and firm context
    this.userContext = null;
    this.learningContext = null;
    this.systemPrompt = null;
    this.userRecord = null;
    
    // Task complexity estimation for better progress tracking
    this.complexity = estimateTaskComplexity(goal);
    this.estimatedSteps = TASK_COMPLEXITY[this.complexity].estimatedSteps;
    this.estimatedMinutes = TASK_COMPLEXITY[this.complexity].estimatedMinutes;
    
    // Track substantive actions for quality assurance
    this.substantiveActions = {
      notes: 0,
      documents: 0,
      tasks: 0,
      events: 0,
      research: 0
    };
    
    // Track failed tools to avoid repeating failures
    this.failedTools = new Map();
    
    // Matter context cache
    this.matterContext = null;
    
    // Matter resolution confidence tracking
    this.matterConfidence = null;  // 'exact' | 'high' | 'medium' | 'ambiguous' | 'low' | 'none'
    this.matterCandidates = [];    // All candidate matters from resolution
    this._verifiedMatterIds = new Set(); // Matters confirmed via get_matter read
    
    // ===== PHASE-BASED EXECUTION (for reliable 30-minute tasks) =====
    this.executionPhase = ExecutionPhase.DISCOVERY;
    this.phaseIterationCounts = {
      [ExecutionPhase.DISCOVERY]: 0,
      [ExecutionPhase.ANALYSIS]: 0,
      [ExecutionPhase.ACTION]: 0,
      [ExecutionPhase.REVIEW]: 0,
    };
    // Structured plan that SURVIVES compaction (stored as object, not just in messages)
    this.structuredPlan = null;
    
    // Rate limit tracking for adaptive token management
    this.rateLimitWaitMs = 0;
    this.rateLimitCount = 0;
    this.lastPlanInjectionIteration = 0;
    
    // Track text-only responses more aggressively
    this.textOnlyStreak = 0;
    
    // Track consecutive API errors for crash-proofing
    this.consecutiveErrors = 0;
    
    // ===== TOOL RESULT CACHE (prevent redundant API calls) =====
    // Caches results from read-only tools so the agent doesn't re-fetch the same data
    this.toolCache = new Map(); // key: "toolName:argHash" -> { result, timestamp }
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache TTL
    
    // Lawyer profile (grows smarter over time)
    this.lawyerProfile = null;
    
    // Attorney identity (deep identity learning: writing style, thinking patterns, corrections)
    this.attorneyIdentity = null;
    
    // Attorney exemplars (approved work samples + correction pairs for voice matching)
    this.attorneyExemplars = null;
    
    // Identity replays (approved execution traces for decision replay)
    this.identityReplays = null;
    this.replayReplaceBrief = false;
    
    // ===== FOLLOW-UP MESSAGE QUEUE =====
    // Pending follow-ups are queued here and injected at the START of the next
    // iteration, avoiding race conditions when addFollowUp() is called while
    // the agent is mid-API-call.
    this.pendingFollowUps = [];
    this.followUps = [];
    
    // ===== CHECKPOINT & REWIND SYSTEM =====
    // Maintains a stack of known-good snapshots. When the agent hits a loop
    // or consecutive errors, rewind() rolls back to the last good state and
    // injects "tried paths" so the model takes a different Legal Path.
    this.rewindManager = createCheckpointRewindManager();
    
    // ===== RECURSIVE SUMMARIZATION (Short-Term vs Long-Term Memory) =====
    // Long-Term Memory: 30-minute mission goal + key facts (always in context)
    // Mid-Term Memory: recursive summaries of old messages (compressed history)
    // Short-Term Memory: recent messages only (current sub-task)
    this.agentMemory = createAgentMemory(goal);
    
    // ===== FOCUS GUARD (Goal Drift Detection & Re-Anchoring) =====
    // The supervising partner that checks "are you still working on the assigned task?"
    // Tracks goal-relevance of tool calls, detects tangent patterns, injects focus
    // interventions when the agent drifts, and provides budget awareness signals.
    this.focusGuard = createFocusGuard(goal, this.maxIterations, this.maxRuntimeMs);
    
    // Tools that are safe to cache (read-only, no side effects)
    this.CACHEABLE_TOOLS = new Set([
      'get_matter', 'list_my_matters', 'search_matters', 'list_clients', 'get_client',
      'list_documents', 'read_document_content', 'search_document_content',
      'get_calendar_events', 'list_tasks', 'list_invoices', 'get_firm_analytics',
      'list_team_members', 'get_upcoming_deadlines', 'lookup_cplr',
      'find_and_read_document', 'get_document', 'get_document_versions',
      'get_matter_documents_content',
    ]);
    
    // Longer TTL for tools that return stable data (matter details don't change mid-task)
    this.STABLE_CACHE_TOOLS = new Set([
      'get_matter', 'get_client', 'lookup_cplr', 'list_team_members',
      'get_firm_analytics', 'list_my_matters', 'search_matters',
    ]);
    this.STABLE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes for stable data
    
    // ===== DECISION REINFORCER (real-time learning per tool outcome) =====
    // Uses the global singleton so learnings persist across tasks
    this.decisionReinforcer = globalDecisionReinforcer;
    
    // ===== MODULE SYSTEM (pre-built workflow guidance) =====
    // Detect applicable module from goal keywords and store it for prompt injection
    this.detectedModule = null;
    try {
      this.detectedModule = detectModule(goal);
      if (this.detectedModule) {
        console.log(`[Amplifier] Module detected: ${this.detectedModule.metadata?.name || 'unknown'}`);
      }
    } catch (e) {
      console.warn('[Amplifier] Module detection skipped:', e.message);
    }
    
    // ===== MID-TASK EVALUATION tracking =====
    // Track whether we've run mid-task quality checks at phase transitions
    this.phaseEvaluationsDone = new Set();
    
    // ===== HARNESS INTELLIGENCE =====
    // Loaded at initializeContext time - stores rejection-learned quality overrides,
    // proven tool chains, and per-matter memory
    this.qualityOverrides = null;
    this.provenToolChain = null;
    this.matterMemory = null;
  }

  /**
   * Push real-time event to Glass Cockpit UI via SSE
   */
  streamEvent(eventType, message, data = {}) {
    try {
      pushAgentEvent(this.id, eventType, {
        message,
        timestamp: new Date().toISOString(),
        ...data
      });
    } catch (e) {
      // Streaming is best-effort, don't fail if it errors
    }
  }

  /**
   * Update progress in Glass Cockpit UI
   */
  streamProgress() {
    try {
      const elapsedSeconds = (Date.now() - this.startTime.getTime()) / 1000;
      updateAgentProgress(this.id, {
        task_id: this.id,
        status: this.status,
        current_step: this.progress.currentStep,
        progress_percent: this.progress.progressPercent,
        total_steps: this.progress.totalSteps,
        completed_steps: this.progress.completedSteps,
        elapsed_seconds: elapsedSeconds,
        actions_count: this.actionsHistory.length
      });
    } catch (e) {
      // Streaming is best-effort
    }
  }

  // ===== PHASE MANAGEMENT METHODS =====

  /**
   * Determine if the agent should transition to the next phase.
   * Called after each iteration to check phase boundaries.
   */
  shouldTransitionPhase() {
    const phases = [ExecutionPhase.DISCOVERY, ExecutionPhase.ANALYSIS, ExecutionPhase.ACTION, ExecutionPhase.REVIEW];
    const currentIdx = phases.indexOf(this.executionPhase);
    if (currentIdx >= phases.length - 1) return false; // Already in REVIEW
    
    const config = PHASE_CONFIG[this.executionPhase];
    const maxItersForPhase = Math.ceil(this.maxIterations * config.maxIterationPercent / 100);
    const itersInPhase = this.phaseIterationCounts[this.executionPhase];
    
    // Time-based: if we've spent too long in this phase relative to total budget
    const elapsedMs = Date.now() - this.startTime.getTime();
    const elapsedPercent = (elapsedMs / this.maxRuntimeMs) * 100;
    
    // Force transition if we've exceeded the phase's iteration budget
    if (itersInPhase >= maxItersForPhase) return true;
    
    // Force transition based on time pressure
    if (this.executionPhase === ExecutionPhase.DISCOVERY && elapsedPercent > 30) return true;
    if (this.executionPhase === ExecutionPhase.ANALYSIS && elapsedPercent > 50) return true;
    if (this.executionPhase === ExecutionPhase.ACTION && elapsedPercent > 85) return true;
    
    // Auto-transition from DISCOVERY to ANALYSIS after getting matter info
    // If matter was pre-loaded, allow faster transition (1 research action instead of 2)
    const discoveryResearchThreshold = this.preloadedMatterId ? 1 : 2;
    const discoveryIterThreshold = this.preloadedMatterId ? 2 : 3;
    if (this.executionPhase === ExecutionPhase.DISCOVERY && this.substantiveActions.research >= discoveryResearchThreshold && itersInPhase >= discoveryIterThreshold) {
      return true;
    }
    
    // Auto-transition from ANALYSIS to ACTION after creating at least 1 note
    if (this.executionPhase === ExecutionPhase.ANALYSIS && this.substantiveActions.notes >= 1 && itersInPhase >= 2) {
      return true;
    }
    
    // Auto-transition from ACTION to REVIEW after creating substantive deliverables
    if (this.executionPhase === ExecutionPhase.ACTION && 
        (this.substantiveActions.documents >= 1 || this.substantiveActions.tasks >= 2) && itersInPhase >= 3) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Transition to the next execution phase with SELF-CRITIQUE (Reflexion pattern).
   * Before moving on, the agent reflects on what it accomplished and what's missing.
   * This is the key technique from the Reflexion paper that dramatically improves output quality.
   */
  transitionPhase() {
    const phases = [ExecutionPhase.DISCOVERY, ExecutionPhase.ANALYSIS, ExecutionPhase.ACTION, ExecutionPhase.REVIEW];
    const currentIdx = phases.indexOf(this.executionPhase);
    if (currentIdx >= phases.length - 1) return;
    
    const oldPhase = this.executionPhase;
    this.executionPhase = phases[currentIdx + 1];
    
    console.log(`[Amplifier] Phase transition: ${oldPhase} → ${this.executionPhase} (with reflection)`);
    
    this.streamEvent('phase_change', `🔄 Reflecting on ${oldPhase}, moving to ${PHASE_CONFIG[this.executionPhase].description}`, {
      from: oldPhase,
      to: this.executionPhase,
      icon: 'refresh-cw',
      color: 'purple'
    });
    
    // ===== MID-TASK EVALUATION at phase transition =====
    // Run a lightweight quality check when transitioning out of ANALYSIS or ACTION
    // so we can catch issues BEFORE the final review
    if ((oldPhase === ExecutionPhase.ANALYSIS || oldPhase === ExecutionPhase.ACTION) && 
        !this.phaseEvaluationsDone.has(oldPhase)) {
      this.phaseEvaluationsDone.add(oldPhase);
      try {
        const midEval = this._quickPhaseEvaluation(oldPhase);
        if (midEval.issues.length > 0) {
          console.log(`[Amplifier] Mid-task evaluation found ${midEval.issues.length} issues at ${oldPhase} transition`);
          this.streamEvent('mid_evaluation', `🔍 Phase quality check: ${midEval.issues.length} issue(s) to address`, {
            phase: oldPhase,
            issues: midEval.issues,
            icon: 'alert-circle',
            color: 'yellow'
          });
        }
      } catch (evalError) {
        // Non-fatal
      }
    }
    
    // ===== RECURSIVE SUMMARIZATION: Record phase reflection in mid-term memory =====
    if (this.agentMemory) {
      const completedActions = this.actionsHistory
        .filter(a => a.success !== false)
        .slice(-5)
        .map(a => a.tool)
        .join(', ');
      this.agentMemory.addPhaseReflection(oldPhase, 
        `Completed ${oldPhase} phase with actions: ${completedActions}. ` +
        `Notes: ${this.substantiveActions.notes}, Docs: ${this.substantiveActions.documents}, Tasks: ${this.substantiveActions.tasks}`
      );
    }
    
    // Inject REFLECTION prompt + phase transition guidance
    this.messages.push({
      role: 'user',
      content: this.buildReflectionPrompt(oldPhase)
    });
  }
  
  /**
   * Quick phase evaluation - lightweight quality check at phase transitions.
   * Unlike the full evaluateTask() which runs at completion, this is fast
   * and catches obvious issues early (e.g., no notes after ANALYSIS).
   */
  _quickPhaseEvaluation(completedPhase) {
    const issues = [];
    const suggestions = [];
    
    if (completedPhase === ExecutionPhase.DISCOVERY) {
      if (this.substantiveActions.research < 1) {
        issues.push('No documents or data read during DISCOVERY - the agent may lack context');
        suggestions.push('Read at least one matter or document before proceeding');
      }
    }
    
    if (completedPhase === ExecutionPhase.ANALYSIS) {
      if (this.substantiveActions.notes < 1) {
        issues.push('No notes created during ANALYSIS - findings are not documented');
        suggestions.push('Add at least one matter note before moving to ACTION');
      }
      if (!this.structuredPlan) {
        issues.push('No structured plan created - the agent may lack direction');
        suggestions.push('Call think_and_plan to create an execution plan');
      }
    }
    
    if (completedPhase === ExecutionPhase.ACTION) {
      if (this.substantiveActions.documents < 1 && this.substantiveActions.tasks < 1) {
        issues.push('No deliverables created during ACTION phase');
        suggestions.push('Create at least one document or task before review');
      }
    }
    
    return { phase: completedPhase, issues, suggestions, timestamp: new Date() };
  }

  /**
   * Build a reflection/self-critique prompt for the phase transition.
   * Forces the model to evaluate its own work before proceeding.
   */
  buildReflectionPrompt(completedPhase) {
    const elapsedMs = Date.now() - this.startTime.getTime();
    const elapsedMin = Math.round(elapsedMs / 60000);
    const remainingMin = Math.max(1, Math.round((this.maxRuntimeMs - elapsedMs) / 60000));
    
    // Build a summary of what was done in the completed phase
    const recentActions = this.actionsHistory.slice(-10).map(a => 
      `- ${a.tool}${a.success ? '' : ' (FAILED)'}`
    ).join('\n');
    
    const findings = (this.structuredPlan?.keyFindings || []).slice(-5).map(f => `- ${f}`).join('\n');
    
    // Reference the brief's expected deliverables so the agent knows what's still needed
    const briefDeliverables = this.workType?.expectedDeliverables 
      ? this.workType.expectedDeliverables.map(d => `- ${d}`).join('\n')
      : '';
    const briefReminder = briefDeliverables 
      ? `\n**From your brief, expected deliverables:**\n${briefDeliverables}\n`
      : '';
    
    // Budget awareness from FocusGuard
    let budgetLine = `${elapsedMin}min elapsed, ${remainingMin}min left`;
    if (this.focusGuard) {
      try {
        budgetLine = this.focusGuard.buildBudgetStatus(this.progress.iterations, elapsedMs);
      } catch (_) {}
    }
    
    // Goal alignment reminder (added to every reflection)
    const goalAnchor = `\n**ASSIGNED TASK (stay focused):** "${this.goal}"`;
    
    const reflectionPrompts = {
      [ExecutionPhase.DISCOVERY]: `
== SELF-CRITIQUE: DISCOVERY phase complete (${budgetLine}) ==
${goalAnchor}

**What you did:**
${recentActions}

**Key findings:**
${findings || '(none recorded)'}
${briefReminder}
**REFLECT before moving to ANALYSIS:**
- Did I gather enough information to analyze this matter thoroughly?
- Is everything I read RELEVANT to the assigned task, or did I go on tangents?
- What key documents or data did I NOT read that I should have?
- Are there any gaps in my understanding?
- Did I follow the approach order from my brief?

If critical info is missing, call one more tool to get it. Then proceed to ANALYSIS: use add_matter_note to document your findings and analysis using IRAC methodology. Do NOT go back to reading more documents unless absolutely necessary.`,

      [ExecutionPhase.ANALYSIS]: `
== SELF-CRITIQUE: ANALYSIS phase complete (${budgetLine}) ==
${goalAnchor}

**What you documented:**
Notes: ${this.substantiveActions.notes} | Research actions: ${this.substantiveActions.research}
${briefReminder}
**REFLECT before moving to ACTION:**
- Is my analysis specific to THIS matter (not generic)?
- Is my analysis focused on the assigned task, or did I analyze tangential issues?
- Did I identify all key legal issues?
- Did I note risks and deadlines?
- Is my analysis thorough enough for a supervising partner to rely on?
- Am I on track to produce all the deliverables from my brief?

If your analysis is thin, add one more note with deeper analysis. Then proceed to ACTION: create formal deliverables (documents, tasks, calendar events). Stay focused on the assigned task.`,

      [ExecutionPhase.ACTION]: `
== SELF-CRITIQUE: ACTION phase complete (${budgetLine}) ==
${goalAnchor}

**What you created:**
Documents: ${this.substantiveActions.documents} | Tasks: ${this.substantiveActions.tasks} | Events: ${this.substantiveActions.events}

**QUALITY CHECK before REVIEW:**
- Do my deliverables directly address the assigned task?
- Do my documents contain REAL content (no [INSERT] or [TODO] placeholders)?
- Are my documents specific to this matter with actual facts?
- Did I create actionable follow-up tasks?
- Did I set any critical deadlines?

If any deliverable is weak, fix it now with another tool call. Then proceed to REVIEW: verify everything and call task_complete.`,
    };
    
    return reflectionPrompts[completedPhase] || `Phase ${completedPhase} complete. Continue with: ${this.goal}`;
  }

  /**
   * Build the persistent plan message that survives compaction.
   * This is always re-injected after compaction so the agent never loses the thread.
   */
  buildPlanMessage() {
    if (!this.structuredPlan) return null;
    
    const elapsedMs = Date.now() - this.startTime.getTime();
    const elapsedMin = Math.round(elapsedMs / 60000);
    const remainingMin = Math.max(1, Math.round((this.maxRuntimeMs - elapsedMs) / 60000));
    
    let planText = `${PLAN_MESSAGE_PREFIX}\n`;
    planText += `**GOAL: ${this.structuredPlan.goal}**\n`;
    
    // Budget status line from FocusGuard (adds urgency signals)
    if (this.focusGuard) {
      try {
        planText += `${this.focusGuard.buildBudgetStatus(this.progress.iterations, elapsedMs)}\n`;
      } catch (_) {
        planText += `Phase: ${this.executionPhase.toUpperCase()} | Time: ${elapsedMin}min elapsed, ~${remainingMin}min remaining\n`;
      }
    } else {
      planText += `Phase: ${this.executionPhase.toUpperCase()} | Time: ${elapsedMin}min elapsed, ~${remainingMin}min remaining\n`;
    }
    planText += '\n';
    
    // Show plan steps with completion status
    if (this.structuredPlan.steps && this.structuredPlan.steps.length > 0) {
      planText += 'Steps:\n';
      for (const step of this.structuredPlan.steps) {
        const icon = step.done ? '✅' : (step.inProgress ? '🔄' : '⬜');
        planText += `${icon} ${step.text}\n`;
      }
    }
    
    // Key findings that must persist
    if (this.structuredPlan.keyFindings && this.structuredPlan.keyFindings.length > 0) {
      planText += '\nKey findings:\n';
      for (const finding of this.structuredPlan.keyFindings.slice(-8)) {
        planText += `- ${finding}\n`;
      }
    }
    
    // What's been created
    const created = [];
    if (this.substantiveActions.documents > 0) created.push(`${this.substantiveActions.documents} document(s)`);
    if (this.substantiveActions.notes > 0) created.push(`${this.substantiveActions.notes} note(s)`);
    if (this.substantiveActions.tasks > 0) created.push(`${this.substantiveActions.tasks} task(s)`);
    if (this.substantiveActions.events > 0) created.push(`${this.substantiveActions.events} event(s)`);
    if (created.length > 0) planText += `\nCreated: ${created.join(', ')}\n`;
    
    // What's still needed (based on quality gates)
    const needed = [];
    if (this.substantiveActions.notes === 0) needed.push('at least 1 note (add_matter_note)');
    if (this.substantiveActions.tasks === 0) needed.push('at least 1 task (create_task)');
    if (this.actionsHistory.length < 5) needed.push(`${5 - this.actionsHistory.length} more tool calls`);
    if (needed.length > 0) planText += `Still required: ${needed.join(', ')}\n`;
    
    // Goal re-anchor: always end with the goal so it's the last thing the model reads
    planText += `\n**STAY FOCUSED ON: ${this.goal}**\n`;
    
    return { role: 'system', content: planText };
  }
  
  /**
   * Update the structured plan when think_and_plan is called
   */
  updateStructuredPlan(planArgs) {
    const steps = (planArgs.steps || []).map(s => ({
      text: typeof s === 'string' ? s : s.text || String(s),
      done: false,
      inProgress: false,
    }));
    
    this.structuredPlan = {
      goal: this.goal,
      steps,
      keyFindings: this.structuredPlan?.keyFindings || [],
    };
    
    console.log(`[Amplifier] Structured plan created with ${steps.length} steps`);
  }
  
  /**
   * Record a key finding that should persist through compaction
   */
  addKeyFinding(finding) {
    if (!this.structuredPlan) {
      this.structuredPlan = { goal: this.goal, steps: [], keyFindings: [] };
    }
    this.structuredPlan.keyFindings.push(finding);
    // Keep only the 12 most recent findings to prevent bloat
    if (this.structuredPlan.keyFindings.length > 12) {
      this.structuredPlan.keyFindings = this.structuredPlan.keyFindings.slice(-12);
    }
  }
  
  /**
   * Mark a plan step as done based on the tool that was executed
   */
  markPlanStepProgress(toolName) {
    if (!this.structuredPlan?.steps) return;
    
    // Find a step that matches this tool action and mark it done
    for (const step of this.structuredPlan.steps) {
      if (step.done) continue;
      const stepLower = step.text.toLowerCase();
      
      const toolStepMap = {
        'get_matter': ['gather', 'review', 'load', 'get matter', 'check matter'],
        'read_document_content': ['read', 'review document', 'examine'],
        'search_document_content': ['search', 'find'],
        'add_matter_note': ['note', 'document finding', 'write note', 'analysis note'],
        'create_document': ['create document', 'draft', 'memo', 'letter', 'brief', 'write'],
        'create_task': ['task', 'follow-up', 'action item', 'checklist'],
        'create_calendar_event': ['schedule', 'deadline', 'calendar', 'event'],
        'evaluate_progress': ['evaluate', 'review progress', 'check progress'],
      };
      
      const keywords = toolStepMap[toolName] || [];
      if (keywords.some(k => stepLower.includes(k))) {
        step.done = true;
        break;
      }
    }
  }

  isPlanMessage(message) {
    return message?.role === 'system' && message?.content?.startsWith(PLAN_MESSAGE_PREFIX);
  }

  // ===== TOOL RESULT CACHING =====
  
  /**
   * Get a cache key for a tool call
   */
  getToolCacheKey(toolName, args) {
    // Create a deterministic key from tool name + sorted args
    const sortedArgs = Object.keys(args).sort().map(k => `${k}=${args[k]}`).join('&');
    return `${toolName}:${sortedArgs}`;
  }
  
  /**
   * Check if a cached result exists and is still valid
   */
  getCachedResult(toolName, args) {
    if (!this.CACHEABLE_TOOLS.has(toolName)) return null;
    
    const key = this.getToolCacheKey(toolName, args);
    const cached = this.toolCache.get(key);
    if (!cached) return null;
    
    // Use longer TTL for stable data tools (matter details don't change mid-task)
    const ttl = this.STABLE_CACHE_TOOLS.has(toolName) ? this.STABLE_CACHE_TTL_MS : this.CACHE_TTL_MS;
    if (Date.now() - cached.timestamp > ttl) {
      this.toolCache.delete(key);
      return null;
    }
    
    console.log(`[Amplifier] Cache HIT for ${toolName} (${cached.result?._preloaded ? 'pre-loaded' : 'cached'})`);
    return cached.result;
  }
  
  /**
   * Store a tool result in the cache
   */
  cacheToolResult(toolName, args, result) {
    if (!this.CACHEABLE_TOOLS.has(toolName)) return;
    if (result?.error) return; // Don't cache errors
    
    const key = this.getToolCacheKey(toolName, args);
    this.toolCache.set(key, { result, timestamp: Date.now() });
  }

  // ===== TOOL RESULT TRIMMING =====

  /**
   * Trim a tool result before adding to messages to prevent context window bloat.
   * The full result is still returned to the tracking/history, but the message
   * version is trimmed so it doesn't eat the entire context window.
   */
  trimToolResultForMessage(toolName, result) {
    const MAX_RESULT_CHARS = 2500; // Tighter cap: saves ~500 tokens per large result
    
    // Tool-specific trimming strategies (applied BEFORE size check for proactive trimming)
    try {
      if (toolName === 'read_document_content' && result?.content) {
        // For document content, keep first 1800 chars
        const maxContent = 1800;
        if (result.content.length > maxContent) {
          return JSON.stringify({
            name: result.name,
            id: result.id,
            content: result.content.substring(0, maxContent) + '\n\n[... TRIMMED - full document is ' + result.content.length + ' chars]',
            trimmed: true,
            originalLength: result.content.length,
          });
        }
      }
      
      if (toolName === 'find_and_read_document' && result?.content) {
        const maxContent = 1800;
        if (result.content.length > maxContent) {
          return JSON.stringify({
            name: result.name,
            id: result.id,
            content: result.content.substring(0, maxContent) + '\n\n[... TRIMMED]',
            trimmed: true,
          });
        }
      }
      
      if (toolName === 'get_matter_documents_content') {
        // Aggressively trim - only keep document names and short previews
        const docs = result?.documents || result?.results || [];
        const trimmedDocs = docs.slice(0, 10).map(d => ({
          id: d.id,
          name: d.name || d.original_name,
          type: d.type || d.document_type,
          preview: (d.content || d.content_preview || '').substring(0, 200),
        }));
        return JSON.stringify({
          documents: trimmedDocs,
          count: docs.length,
          trimmed: docs.length > 10,
        });
      }
      
      // For list results: strip to essential fields ONLY
      if (toolName === 'list_my_matters' || toolName === 'search_matters') {
        const matters = result?.matters || [];
        const trimmedMatters = matters.slice(0, 10).map(m => ({
          id: m.id, name: m.name, number: m.number, status: m.status, type: m.type,
          client_name: m.client_name,
        }));
        return JSON.stringify({
          matters: trimmedMatters,
          count: matters.length,
          trimmed: matters.length > 10,
          message: matters.length > 10 ? `Showing 10 of ${matters.length}. Use search_matters for specific ones.` : undefined,
        });
      }
      
      if (toolName === 'list_documents') {
        const docs = result?.documents || [];
        const trimmedDocs = docs.slice(0, 10).map(d => ({
          id: d.id, name: d.original_name || d.name, matter_id: d.matter_id, 
          type: d.type, uploaded_at: d.uploaded_at,
        }));
        return JSON.stringify({
          documents: trimmedDocs,
          count: docs.length,
          trimmed: docs.length > 10,
        });
      }
      
      if (toolName === 'list_clients') {
        const clients = result?.clients || [];
        const trimmedClients = clients.slice(0, 10).map(c => ({
          id: c.id, display_name: c.display_name, email: c.email, type: c.type,
        }));
        return JSON.stringify({
          clients: trimmedClients,
          count: clients.length,
          trimmed: clients.length > 10,
        });
      }
      
      if (toolName === 'list_tasks') {
        const tasks = result?.tasks || [];
        const trimmedTasks = tasks.slice(0, 12).map(t => ({
          id: t.id, title: t.title, status: t.status, priority: t.priority,
          due_date: t.due_date, matter_id: t.matter_id,
        }));
        return JSON.stringify({
          tasks: trimmedTasks,
          count: tasks.length,
          trimmed: tasks.length > 12,
        });
      }
      
      if (toolName === 'search_document_content' && Array.isArray(result?.results)) {
        const trimmedResults = result.results.slice(0, 6).map(r => ({
          id: r.id, name: r.name || r.document_name,
          content: r.content ? r.content.substring(0, 250) + '...' : undefined,
          matter_id: r.matter_id,
        }));
        return JSON.stringify({
          results: trimmedResults,
          totalResults: result.results.length,
          trimmed: result.results.length > 6,
        });
      }
      
      if (toolName === 'get_matter' && result?.matter) {
        const matter = { ...result.matter };
        // Strip description to 300 chars
        if (matter.description && matter.description.length > 300) {
          matter.description = matter.description.substring(0, 300) + '...';
        }
        // Strip nested arrays to counts only
        if (Array.isArray(matter.documents)) {
          matter.document_count = matter.documents.length;
          matter.documents = matter.documents.slice(0, 5).map(d => ({ id: d.id, name: d.name || d.original_name }));
        }
        if (Array.isArray(matter.notes)) {
          matter.note_count = matter.notes.length;
          matter.notes = matter.notes.slice(0, 3).map(n => ({ id: n.id, type: n.note_type, preview: (n.content || '').substring(0, 100) }));
        }
        if (Array.isArray(matter.tasks)) {
          matter.task_count = matter.tasks.length;
          matter.tasks = matter.tasks.slice(0, 5).map(t => ({ id: t.id, title: t.title, status: t.status }));
        }
        // Preserve ambiguity warnings - these MUST survive trimming so the agent sees them
        const trimmedResult = { matter, success: true };
        if (result._warning) trimmedResult._warning = result._warning;
        if (result._resolution) trimmedResult._resolution = result._resolution;
        return JSON.stringify(trimmedResult);
      }
      
      if (toolName === 'get_calendar_events') {
        const events = result?.events || [];
        const trimmedEvents = events.slice(0, 10).map(e => ({
          id: e.id, title: e.title, start_time: e.start_time, end_time: e.end_time,
          type: e.type, matter_id: e.matter_id,
        }));
        return JSON.stringify({
          events: trimmedEvents,
          count: events.length,
        });
      }
    } catch (e) {
      // Fall through to size-based trimming
    }
    
    const resultStr = JSON.stringify(result);
    
    // If it's already small enough, return as-is
    if (resultStr.length <= MAX_RESULT_CHARS) {
      return resultStr;
    }
    
    // Generic trimming: cap the JSON string
    return resultStr.substring(0, MAX_RESULT_CHARS) + '... [TRIMMED - result was ' + resultStr.length + ' chars]';
  }

  // ===== PRE-FLIGHT ARGUMENT VALIDATION =====

  // Write tools that modify matter data - these require verified matter context
  static MATTER_WRITE_TOOLS = new Set([
    'add_matter_note', 'create_document', 'create_task', 'create_calendar_event',
    'update_matter', 'close_matter', 'archive_matter', 'draft_legal_document',
    'draft_email_for_matter', 'set_critical_deadline',
  ]);
  
  // Read tools that verify the agent has loaded a matter
  static MATTER_READ_TOOLS = new Set([
    'get_matter', 'search_matters', 'list_my_matters', 'list_documents',
    'read_document_content', 'get_matter_documents_content',
  ]);

  /**
   * Track that the agent has verified a matter by reading its details.
   * Called after successful execution of matter-reading tools.
   */
  markMatterVerified(matterId) {
    if (!this._verifiedMatterIds) {
      this._verifiedMatterIds = new Set();
    }
    this._verifiedMatterIds.add(matterId);
    console.log(`[Amplifier] Matter ${matterId} marked as verified`);
  }
  
  /**
   * Check if a matter has been verified (agent has read its details).
   */
  isMatterVerified(matterId) {
    // If confidence was exact/high from extractMatterContext, the pre-load counts as verification
    if (this.matterConfidence === 'exact' || this.matterConfidence === 'high') {
      if (matterId === this.preloadedMatterId) return true;
    }
    return this._verifiedMatterIds?.has(matterId) || false;
  }

  /**
   * Validate tool arguments before execution to prevent wasted iterations.
   * Returns null if valid, or an error message string if invalid.
   * 
   * Now includes MATTER VERIFICATION GUARDRAIL:
   * Write tools that target a matter are blocked until the agent has verified
   * the matter identity through a read operation. This prevents the agent from
   * creating documents/notes/tasks on the wrong matter when the match was ambiguous.
   */
  validateToolArgs(toolName, args) {
    // Check for obviously invalid UUIDs (common GPT hallucination)
    const uuidFields = ['matter_id', 'client_id', 'document_id', 'invoice_id', 'task_id'];
    for (const field of uuidFields) {
      if (args[field] && typeof args[field] === 'string') {
        // Valid UUID or valid-looking name (for flexible matching)
        const val = args[field];
        // If it looks like a made-up ID (not a UUID and not a plausible name), flag it
        if (val.length < 3 && !val.match(/^[0-9a-f]{8}-/i)) {
          return `Invalid ${field}: "${val}" is too short. Use the actual ID from a previous tool result, or use search_matters/list_clients to find the correct ID.`;
        }
      }
    }
    
    // ===== MATTER VERIFICATION GUARDRAIL =====
    // Block write operations on a matter that hasn't been verified when confidence is not high.
    // This is the hard gate that prevents working on the wrong matter.
    // A junior attorney wouldn't start drafting for "the Smith case" without first pulling the file
    // and confirming it's the RIGHT Smith case.
    const isWriteTool = BackgroundTask.MATTER_WRITE_TOOLS.has(toolName);
    const targetMatterId = args.matter_id || args.matterId;
    
    if (isWriteTool && targetMatterId) {
      const needsVerification = this.matterConfidence === 'ambiguous' || 
                                 this.matterConfidence === 'low' || 
                                 this.matterConfidence === 'none' ||
                                 this.matterConfidence === 'medium';
      
      if (needsVerification && !this.isMatterVerified(targetMatterId)) {
        const verifiedList = this._verifiedMatterIds ? Array.from(this._verifiedMatterIds).join(', ') : 'none';
        return `MATTER VERIFICATION REQUIRED: You are trying to ${toolName} on matter "${targetMatterId}" but the matter has NOT been verified yet. ` +
               `The initial matter match confidence was ${(this.matterConfidence || 'unknown').toUpperCase()}. ` +
               `Before ANY write operation, you MUST first call get_matter with this matter_id to load and verify it is the correct matter. ` +
               `Verified matters so far: [${verifiedList}]. ` +
               `Do NOT skip this step - working on the wrong matter is a serious error.`;
      }
    }
    
    // Tool-specific validation
    if (toolName === 'create_document') {
      if (!args.name && !args.title) return 'create_document requires a "name" parameter.';
      if (!args.content && !args.body) return 'create_document requires "content" parameter with the actual document text. Do NOT use placeholders.';
      const content = args.content || args.body || '';
      if (content.includes('[INSERT') || content.includes('[TODO') || content.includes('[PLACEHOLDER')) {
        return 'Document content contains placeholders like [INSERT]. Write the actual content based on your analysis. Do NOT use placeholders.';
      }
      
      // ===== HALLUCINATION GUARDRAIL =====
      // Scan document content for known-bad patterns BEFORE saving to database.
      // It's cheaper to catch fabricated content here than after it's in Azure Storage.
      const hallucinationIssues = _scanForHallucinations(content, args.name || '');
      if (hallucinationIssues.length > 0) {
        return `HALLUCINATION GUARDRAIL: The document content has ${hallucinationIssues.length} potential issue(s): ${hallucinationIssues.join('; ')}. Fix these before creating the document. Mark any uncertain citations with [UNVERIFIED - VERIFY BEFORE FILING].`;
      }
    }
    
    if (toolName === 'add_matter_note') {
      if (!args.matter_id) return 'add_matter_note requires "matter_id". Use get_matter or search_matters first to find the matter ID.';
      if (!args.content && !args.note) return 'add_matter_note requires "content" with the note text.';
      
      // Hallucination check for notes with legal citations
      const noteContent = args.content || args.note || '';
      if (noteContent.length > 200) {
        const hallucinationIssues = _scanForHallucinations(noteContent, 'matter note');
        if (hallucinationIssues.length > 0) {
          return `HALLUCINATION GUARDRAIL: Note content has potential issue(s): ${hallucinationIssues.join('; ')}. Mark uncertain citations with [UNVERIFIED - VERIFY BEFORE FILING].`;
        }
      }
    }
    
    if (toolName === 'create_task') {
      if (!args.title && !args.name) return 'create_task requires a "title" parameter.';
    }
    
    if (toolName === 'log_time' || toolName === 'log_billable_work') {
      return 'NEVER log time. Time entries are for humans to create manually. Skip this and continue with your other work.';
    }
    
    return null; // Valid
  }

  /**
   * Initialize context for the task
   */
  async initializeContext() {
    try {
      // Get user info
      const userResult = await query(
        'SELECT u.*, f.name as firm_name FROM users u JOIN firms f ON u.firm_id = f.id WHERE u.id = $1',
        [this.userId]
      );
      const user = userResult.rows[0];
      const firm = { name: user?.firm_name };
      
      this.userRecord = user ? {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        firmId: user.firm_id,
        twoFactorEnabled: user.two_factor_enabled,
      } : null;
      
      // Each context source is independently guarded so one failure
      // never kills the rest. The agent must always get real data.
      
      try {
        this.userContext = getUserContext(user, firm);
      } catch (e) {
        console.error('[Amplifier] Failed to build user context:', e.message);
        this.userContext = null;
      }
      
      try {
        this.learningContext = await getLearningContext(query, this.firmId, this.userId);
      } catch (e) {
        console.error('[Amplifier] Failed to load learning context:', e.message);
        this.learningContext = null;
      }
      
      // Load user's document profile (PRIVATE per-user learnings from their documents)
      try {
        this.userDocumentProfile = await getUserDocumentProfile(this.userId, this.firmId);
        if (this.userDocumentProfile) {
          console.log(`[Amplifier] Loaded document profile for user ${this.userId}`);
        }
      } catch (profileError) {
        console.log('[Amplifier] Document profile not available (new user or table pending)');
        this.userDocumentProfile = null;
      }
      
      // Load comprehensive lawyer profile (per-lawyer personalization)
      try {
        this.lawyerProfile = await getLawyerProfile(this.userId, this.firmId);
        if (this.lawyerProfile) {
          console.log(`[Amplifier] Loaded lawyer profile for ${this.lawyerProfile.lawyerName || this.userId} (${this.lawyerProfile.totalTasks} past tasks)`);
        }
      } catch (profileError) {
        console.log('[Amplifier] Lawyer profile not available:', profileError.message);
        this.lawyerProfile = null;
      }
      
      // ===== ATTORNEY IDENTITY: Deep identity learning =====
      // This is the "become the attorney" system. Loads writing style, thinking
      // patterns, correction principles, preference hierarchy. As maturity grows,
      // this progressively replaces the generic junior attorney brief.
      try {
        this.attorneyIdentity = await getAttorneyIdentity(this.userId, this.firmId);
        if (this.attorneyIdentity) {
          const maturity = this.attorneyIdentity.maturity;
          const level = this.attorneyIdentity.maturityLevel?.label || 'nascent';
          const principles = this.attorneyIdentity.correctionPrinciples?.length || 0;
          console.log(`[Amplifier] Attorney identity loaded: maturity=${maturity}/100 (${level}), ${principles} correction principles, brief weight=${this.attorneyIdentity.maturityLevel?.briefWeight ?? 1.0}`);
        }
      } catch (identityError) {
        console.log('[Amplifier] Attorney identity not available:', identityError.message);
        this.attorneyIdentity = null;
      }
      
      // ===== ATTORNEY EXEMPLARS: Load style samples matched to this task =====
      // Uses embedding similarity to find the most relevant approved work and
      // correction pairs. These are actual excerpts of the attorney's voice —
      // "show don't tell" style matching.
      try {
        const workType = classifyWork(this.goal);
        this.attorneyExemplars = await getRelevantExemplars(
          this.userId, this.firmId, this.goal, workType.id
        );
        if (this.attorneyExemplars) {
          const exCount = this.attorneyExemplars.exemplars?.length || 0;
          const corrCount = this.attorneyExemplars.corrections?.length || 0;
          if (exCount > 0 || corrCount > 0) {
            console.log(`[Amplifier] Loaded ${exCount} exemplars + ${corrCount} corrections (method: ${this.attorneyExemplars.matchMethod})`);
          }
        }
      } catch (exError) {
        console.log('[Amplifier] Exemplars not available:', exError.message);
        this.attorneyExemplars = null;
      }
      
      // ===== IDENTITY REPLAY: Find matching approved execution traces =====
      // This is the "today's Neuralink" — replay the attorney's actual decision
      // process from a similar previously-approved task. When a strong replay
      // is found, it REPLACES the generic brief entirely.
      try {
        const workType = classifyWork(this.goal);
        this.identityReplays = await findMatchingReplays(
          this.userId, this.firmId, this.goal, workType.id
        );
        if (this.identityReplays && this.identityReplays.length > 0) {
          this.replayReplaceBrief = shouldReplayReplaceBrief(this.identityReplays);
          const bestSim = this.identityReplays[0].similarity;
          console.log(`[Amplifier] Found ${this.identityReplays.length} identity replays (best: ${bestSim ? Math.round(bestSim * 100) + '%' : 'work-type'} match, replaces brief: ${this.replayReplaceBrief})`);
        }
      } catch (replayError) {
        console.log('[Amplifier] Identity replay not available:', replayError.message);
        this.identityReplays = null;
      }
      
      // Get workflow templates
      try {
        const workflowResult = await query(
          'SELECT name, description, trigger_phrases, steps FROM ai_workflow_templates WHERE firm_id = $1 AND is_active = true',
          [this.firmId]
        );
        this.workflowTemplates = workflowResult.rows;
      } catch (e) {
        console.log('[Amplifier] Workflow templates not available:', e.message);
        this.workflowTemplates = [];
      }
      
      // Try to extract matter context from goal if mentioned
      try {
        this.matterContext = await this.extractMatterContext();
      } catch (e) {
        console.error('[Amplifier] Failed to extract matter context:', e.message);
        this.matterContext = null;
      }
      
      // ===== INTERACTION LEARNING: How this lawyer uses the software =====
      try {
        this.interactionProfile = await getUserInteractionProfile(this.firmId, this.userId);
        if (this.interactionProfile) {
          console.log(`[Amplifier] Loaded interaction profile for user ${this.userId} (${this.interactionProfile.mostUsedPages?.length || 0} pages, ${this.interactionProfile.mostUsedFeatures?.length || 0} features tracked)`);
        }
      } catch (e) {
        this.interactionProfile = null;
      }
      
      // ===== ACTIVITY LEARNING: What the lawyer has been doing recently =====
      try {
        this.activityContext = await getRecentActivityContext(this.userId, this.firmId);
        if (this.activityContext) {
          console.log(`[Amplifier] Loaded recent activity context for user ${this.userId}`);
        }
      } catch (e) {
        this.activityContext = null;
      }
      
      // ===== HARNESS INTELLIGENCE: Load learned quality overrides =====
      const workType = classifyWork(this.goal);
      try {
        this.qualityOverrides = await getQualityOverrides(this.userId, this.firmId, workType.id);
        if (this.qualityOverrides.promptModifiers.length > 0) {
          console.log(`[Amplifier] Loaded ${this.qualityOverrides.promptModifiers.length} rejection-learned prompt modifiers`);
        }
      } catch (e) {
        this.qualityOverrides = null;
      }
      
      // ===== HARNESS INTELLIGENCE: Load proven tool chain =====
      try {
        this.provenToolChain = await getProvenToolChain(this.firmId, workType.id);
        if (this.provenToolChain) {
          console.log(`[Amplifier] Found proven tool chain for "${workType.id}" (${(this.provenToolChain.confidence * 100).toFixed(0)}% confidence, deterministic: ${this.provenToolChain.deterministic})`);
        }
      } catch (e) {
        this.provenToolChain = null;
      }
      
      // ===== HARNESS INTELLIGENCE: Load per-matter memory =====
      if (this.preloadedMatterId) {
        try {
          this.matterMemory = await getMatterMemory(this.firmId, this.preloadedMatterId);
          if (this.matterMemory) {
            console.log(`[Amplifier] Loaded matter memory for "${this.preloadedMatterName}" - agent has institutional knowledge from previous tasks`);
          }
        } catch (e) {
          this.matterMemory = null;
        }
      }
      
      // ===== USER AI MEMORY FILE: Persistent per-user learned context =====
      // This is the "memory file" that accumulates as the attorney uses the platform.
      // It contains things like practice areas, style preferences, corrections, and
      // active context — everything the agent needs to "remember" about this person.
      try {
        this.userMemoryContext = await getMemoryForPrompt(this.userId, this.firmId);
        if (this.userMemoryContext) {
          console.log(`[Amplifier] Loaded user AI memory file for user ${this.userId}`);
        }
      } catch (e) {
        console.log('[Amplifier] User AI memory file not available:', e.message);
        this.userMemoryContext = null;
      }
      
      // ===== COGNITIVE IMPRINTING: Infer current cognitive state =====
      // Detects deep_work/triage/urgent/review mode from observable DB signals
      // and adapts detail level, brevity, structure, and phase budgets
      try {
        this.cognitiveState = await inferCognitiveState(this.userId, this.firmId);
        if (this.cognitiveState) {
          console.log(`[Amplifier] Cognitive state: ${this.cognitiveState.state} (confidence: ${this.cognitiveState.confidence?.toFixed(2)})`);
        }
      } catch (e) {
        console.log('[Amplifier] Cognitive state not available:', e.message);
        this.cognitiveState = null;
      }
      
      // ===== COGNITIVE IMPRINTING: Compute cognitive signature =====
      // Model-agnostic mathematical representation of attorney identity (18 continuous dimensions)
      try {
        this.cognitiveSignature = await getCognitiveSignature(this.userId, this.firmId, this.attorneyIdentity);
        if (this.cognitiveSignature) {
          console.log(`[Amplifier] Cognitive signature: ${this.cognitiveSignature.observedDimensions}/${this.cognitiveSignature.totalDimensions} dimensions, maturity=${this.cognitiveSignature.maturity?.toFixed(1)}`);
        }
      } catch (e) {
        console.log('[Amplifier] Cognitive signature not available:', e.message);
        this.cognitiveSignature = null;
      }
      
      // ===== COGNITIVE IMPRINTING: Load edit-learned preferences =====
      // High-confidence signals from silent edits the lawyer made to agent-created docs
      try {
        this.editLearnedPreferences = await getEditLearnedPreferences(this.userId, this.firmId);
        if (this.editLearnedPreferences) {
          console.log(`[Amplifier] Loaded edit-learned preferences from document edits`);
        }
      } catch (e) {
        this.editLearnedPreferences = null;
      }
      
      // ===== COGNITIVE IMPRINTING: Load resonance memory graph =====
      // The living cognitive graph that connects all memory systems
      try {
        this.resonanceGraph = await loadResonanceGraph(this.userId, this.firmId);
        if (this.resonanceGraph?.loaded) {
          const summary = this.resonanceGraph.getSummary();
          console.log(`[Amplifier] Resonance graph: ${summary.totalNodes} nodes, ${summary.totalEdges} edges`);
        }
      } catch (e) {
        console.log('[Amplifier] Resonance graph not available:', e.message);
        this.resonanceGraph = null;
      }
      
    } catch (error) {
      console.error('[Amplifier] Context initialization error:', error);
    }
  }
  
  /**
   * Extract matter context from goal if a matter is mentioned.
   * This pre-loads relevant matter info so the agent starts with context
   * and warm-seeds the tool cache to avoid redundant API calls.
   * 
   * RELIABILITY: Uses a multi-strategy approach with STRICT disambiguation:
   * 1. Regex extraction of matter name from goal text
   * 2. Scored matching against ALL candidate matters (not LIMIT 1)
   * 3. Confidence classification: EXACT (100%), HIGH (80%+), AMBIGUOUS, NONE
   * 4. Ambiguous matches force the agent to VERIFY before any write operations
   * 5. Pre-loads matter data into the tool cache so get_matter calls are instant
   * 
   * A junior attorney would NEVER guess which file to work on.
   * Neither should this agent.
   */
  async extractMatterContext() {
    try {
      const goalLower = this.goal.toLowerCase();
      
      // Look for matter name patterns in the goal (expanded patterns)
      const matterPatterns = [
        /(?:for|on|about|regarding|re:?)\s+(?:the\s+)?(?:matter\s+)?["']([^"']+)["']/i,    // quoted matter name
        /(?:for|on|about|regarding|re:?)\s+(?:the\s+)?(?:matter\s+)?["']?([^"'.,;!?\n]+?)(?:\s+(?:matter|case|file))?\s*$/i, // trailing matter name
        /(?:for|on|about|regarding|re:?)\s+(?:the\s+)?(?:matter\s+)?["']?([^"'.,;!?\n]+)["']?/i,
        /matter\s+(?:named?\s+)?["']?([^"'.,;!?\n]+)["']?/i,
        /["']([^"']+)["']\s+(?:matter|case)/i,
        /(?:v\.\s*\w+|vs?\.\s+\w+)/i, // "v." or "vs." pattern (e.g., "Smith v. Jones")
      ];
      
      let potentialMatterName = null;
      let wasQuoted = false; // Quoted names get higher confidence
      for (const pattern of matterPatterns) {
        const match = this.goal.match(pattern);
        if (match && match[1] && match[1].trim().length > 2) {
          potentialMatterName = match[1].trim();
          // Clean up common trailing words that aren't part of the matter name
          potentialMatterName = potentialMatterName.replace(/\s+(?:and|then|also|please|asap|urgently|quickly)\s*$/i, '').trim();
          // Check if the original match was quoted (first pattern)
          wasQuoted = /["']/.test(this.goal.charAt(this.goal.indexOf(potentialMatterName) - 1) || '');
          break;
        }
        // For v. pattern, match the whole phrase
        if (match && match[0] && pattern.source.includes('v\\.')) {
          // Extract the full "Party v. Party" from surrounding context
          const vMatch = this.goal.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\s+v\.?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
          if (vMatch) {
            potentialMatterName = vMatch[1].trim();
            break;
          }
        }
      }
      
      // ===== SCORED MATTER RESOLUTION =====
      // Instead of LIMIT 1, fetch ALL candidates and score them.
      // This prevents silently picking the wrong matter when names are similar.
      
      let allCandidates = [];
      
      if (potentialMatterName) {
        // Strategy 1: Search by extracted name - get ALL matches, not just first
        const candidateResult = await query(`
          SELECT m.id, m.name, m.number, m.status, m.type, m.description, m.billing_type,
                 m.created_at, m.open_date, c.display_name as client_name, c.id as client_id, c.email as client_email,
                 (SELECT COUNT(*) FROM documents d WHERE d.matter_id = m.id) as doc_count,
                 (SELECT COUNT(*) FROM matter_notes mn WHERE mn.matter_id = m.id) as note_count,
                 (SELECT COUNT(*) FROM matter_tasks t WHERE t.matter_id = m.id) as task_count,
                 CASE
                   WHEN LOWER(m.name) = LOWER($2) THEN 100
                   WHEN LOWER(m.number) = LOWER($2) THEN 95
                   WHEN LOWER(m.name) = LOWER($3) THEN 90
                   WHEN LOWER(m.number) = LOWER($3) THEN 85
                   WHEN LOWER(m.name) LIKE LOWER($3) || '%' THEN 75
                   WHEN LOWER(m.number) LIKE LOWER($3) || '%' THEN 70
                   WHEN LOWER(m.name) LIKE '%' || LOWER($3) || '%' THEN 60
                   WHEN LOWER(m.number) LIKE '%' || LOWER($3) || '%' THEN 55
                   WHEN LOWER(c.display_name) LIKE '%' || LOWER($3) || '%' THEN 45
                   ELSE 30
                 END as match_score
          FROM matters m
          LEFT JOIN clients c ON m.client_id = c.id
          WHERE m.firm_id = $1 
            AND (
              LOWER(m.name) LIKE '%' || LOWER($3) || '%' 
              OR LOWER(m.number) LIKE '%' || LOWER($3) || '%'
              OR LOWER(c.display_name) LIKE '%' || LOWER($3) || '%'
            )
          ORDER BY match_score DESC, m.status = 'active' DESC, m.updated_at DESC NULLS LAST
          LIMIT 10
        `, [this.firmId, potentialMatterName, potentialMatterName.toLowerCase()]);
        
        allCandidates = candidateResult.rows;
      }
      
      // Strategy 2: If no match found and goal mentions generic "matter"/"case", check active matters
      if (allCandidates.length === 0 && !potentialMatterName) {
        if (/\b(?:the\s+)?(?:matter|case|file)\b/i.test(goalLower) || /\b(?:review|check|update|draft|prepare)\b/i.test(goalLower)) {
          const recentMatterResult = await query(`
            SELECT m.id, m.name, m.number, m.status, m.type, m.description, m.billing_type,
                   m.created_at, m.open_date, c.display_name as client_name, c.id as client_id, c.email as client_email,
                   (SELECT COUNT(*) FROM documents d WHERE d.matter_id = m.id) as doc_count,
                   (SELECT COUNT(*) FROM matter_notes mn WHERE mn.matter_id = m.id) as note_count,
                   (SELECT COUNT(*) FROM matter_tasks t WHERE t.matter_id = m.id) as task_count,
                   0 as match_score
            FROM matters m
            LEFT JOIN clients c ON m.client_id = c.id
            WHERE m.firm_id = $1 AND m.status = 'active'
            ORDER BY m.updated_at DESC NULLS LAST, m.created_at DESC
            LIMIT 5
          `, [this.firmId]);
          
          if (recentMatterResult.rows.length === 1) {
            // Exactly one active matter - unambiguous by elimination
            allCandidates = recentMatterResult.rows;
            allCandidates[0].match_score = 80; // High confidence: only one option
            console.log(`[Amplifier] No matter name in goal, but only 1 active matter exists: ${allCandidates[0].name}`);
          } else if (recentMatterResult.rows.length > 1) {
            // Multiple active matters with no name specified - AMBIGUOUS
            this._warmCacheMattersList(recentMatterResult.rows);
            console.log(`[Amplifier] ${recentMatterResult.rows.length} active matters found, no name specified - agent MUST identify which one`);
            
            // Return disambiguation context instead of guessing
            this.matterConfidence = 'none';
            this.matterCandidates = recentMatterResult.rows;
            return this._buildMatterDisambiguationContext(null, recentMatterResult.rows, 'no_name_multiple_matters');
          }
        }
      }
      
      if (allCandidates.length === 0) {
        return null;
      }
      
      // ===== CONFIDENCE CLASSIFICATION =====
      // Score the match and classify confidence level
      const topMatch = allCandidates[0];
      const secondMatch = allCandidates.length > 1 ? allCandidates[1] : null;
      const topScore = parseInt(topMatch.match_score);
      const secondScore = secondMatch ? parseInt(secondMatch.match_score) : 0;
      const scoreDelta = topScore - secondScore;
      
      let confidence;
      if (topScore >= 95) {
        // Exact name or number match
        confidence = 'exact';
      } else if (topScore >= 80 && (allCandidates.length === 1 || scoreDelta >= 25)) {
        // Strong match with clear separation from next candidate
        confidence = 'high';
      } else if (topScore >= 60 && scoreDelta >= 20 && allCandidates.length <= 2) {
        // Good match with reasonable separation
        confidence = wasQuoted ? 'high' : 'medium';
      } else if (allCandidates.length > 1 && scoreDelta < 15) {
        // Multiple close matches - AMBIGUOUS, must not guess
        confidence = 'ambiguous';
      } else if (topScore < 50) {
        // Weak match - might be wrong entirely
        confidence = 'low';
      } else {
        confidence = 'medium';
      }
      
      console.log(`[Amplifier] Matter resolution: "${potentialMatterName}" -> "${topMatch.name}" (score: ${topScore}, delta: ${scoreDelta}, confidence: ${confidence}, candidates: ${allCandidates.length})`);
      
      // Store confidence for use in system prompt and guardrails
      this.matterConfidence = confidence;
      this.matterCandidates = allCandidates;
      
      // ===== AMBIGUOUS: Force disambiguation - do NOT guess =====
      if (confidence === 'ambiguous') {
        console.log(`[Amplifier] AMBIGUOUS matter match: top=${topMatch.name} (${topScore}), second=${secondMatch?.name} (${secondScore}) - forcing agent to verify`);
        this._warmCacheMattersList(allCandidates);
        return this._buildMatterDisambiguationContext(potentialMatterName, allCandidates, 'ambiguous_matches');
      }
      
      // ===== LOW CONFIDENCE: Warn agent heavily =====
      if (confidence === 'low') {
        console.log(`[Amplifier] LOW confidence matter match: "${potentialMatterName}" -> "${topMatch.name}" (score: ${topScore}) - agent must verify`);
        this._warmCacheMattersList(allCandidates);
        return this._buildMatterDisambiguationContext(potentialMatterName, allCandidates, 'low_confidence');
      }
      
      // ===== EXACT or HIGH CONFIDENCE: Pre-load the matter =====
      const matter = topMatch;
      const isEmpty = parseInt(matter.doc_count) === 0 && parseInt(matter.note_count) === 0;
      
      // Warm the tool cache
      this._warmCacheMatter(matter);
      
      let contextStr = `
## PRE-LOADED MATTER CONTEXT (Confidence: ${confidence.toUpperCase()})

The goal mentions a matter. Here's what I found:

**Matter:** ${matter.name} (${matter.number || 'No number'})
**Matter ID:** ${matter.id}
**Status:** ${matter.status}
**Type:** ${matter.type || 'General'}
**Client:** ${matter.client_name || 'No client assigned'}${matter.client_id ? ` (ID: ${matter.client_id})` : ''}
**Created:** ${matter.created_at ? new Date(matter.created_at).toLocaleDateString() : 'Unknown'}
**Match Confidence:** ${confidence.toUpperCase()} (score: ${topScore}/100${secondMatch ? `, next closest: "${secondMatch.name}" at ${secondScore}/100` : ''})

**Current State:**
- Documents: ${matter.doc_count}
- Notes: ${matter.note_count}  
- Tasks: ${matter.task_count}

**IMPORTANT:** The matter ID is \`${matter.id}\`. Use this ID directly in tool calls (get_matter, add_matter_note, create_document, create_task, etc.) - no need to search for it.
`;

      // For MEDIUM confidence, add a verification reminder
      if (confidence === 'medium') {
        contextStr += `
⚠️ **MEDIUM CONFIDENCE MATCH** - I matched "${potentialMatterName}" to "${matter.name}" but the match is not exact.
**BEFORE creating any documents, notes, or tasks:** Call get_matter with ID \`${matter.id}\` and verify this is the correct matter for the user's request.
If the matter details don't match what the user described, use search_matters to find the right one.
`;
      }
      
      if (isEmpty) {
        contextStr += `
⚠️ **THIS IS AN EMPTY/NEW MATTER** - No documents or notes exist yet.
Follow the EMPTY MATTER PROTOCOL to build the foundation this matter needs.
`;
      }
      
      // Add CPLR-specific guidance based on matter type
      try {
        const cplrGuidance = getCPLRGuidanceForMatter(matter.type, matter.description || matter.name);
        if (cplrGuidance && (cplrGuidance.relevantArticles.length > 0 || cplrGuidance.keyDeadlines.length > 0)) {
          contextStr += `
### APPLICABLE NY CPLR GUIDANCE FOR THIS MATTER

`;
          if (cplrGuidance.relevantArticles.length > 0) {
            contextStr += `**Relevant CPLR Articles:** ${cplrGuidance.relevantArticles.join(', ')}\n\n`;
          }
          if (cplrGuidance.keyDeadlines.length > 0) {
            contextStr += `**Key Deadlines to Track:**\n`;
            for (const deadline of cplrGuidance.keyDeadlines) {
              contextStr += `- **${deadline.name}**: ${deadline.period} (${deadline.citation})\n`;
            }
            contextStr += '\n';
          }
          if (cplrGuidance.warnings.length > 0) {
            contextStr += `**⚠️ WARNINGS:**\n`;
            for (const warning of cplrGuidance.warnings) {
              contextStr += `- ${warning}\n`;
            }
            contextStr += '\n';
          }
          if (cplrGuidance.discoveryNotes.length > 0) {
            contextStr += `**Discovery Notes:**\n`;
            for (const note of cplrGuidance.discoveryNotes) {
              contextStr += `- ${note}\n`;
            }
            contextStr += '\n';
          }
          if (cplrGuidance.commonMotions.length > 0) {
            contextStr += `**Common Motions:** ${cplrGuidance.commonMotions.join('; ')}\n`;
          }
        }
      } catch (cplrError) {
        console.error('[Amplifier] Error getting CPLR guidance:', cplrError.message);
      }
      
      // Store matter ID for quick reference
      this.preloadedMatterId = matter.id;
      this.preloadedMatterName = matter.name;
      
      console.log(`[Amplifier] Pre-loaded matter context: ${matter.name} (confidence: ${confidence}, ${isEmpty ? 'EMPTY' : 'has content'})`);
      
      return contextStr;
      
    } catch (error) {
      console.error('[Amplifier] Error extracting matter context:', error.message);
      return null;
    }
  }

  /**
   * Build disambiguation context when the matter cannot be confidently identified.
   * Instead of guessing, this tells the agent EXACTLY what to do: verify before writing.
   * 
   * A junior attorney who gets handed "the Smith file" when there are 3 Smith files
   * would walk back to the partner's office and ask. This is the digital equivalent.
   */
  _buildMatterDisambiguationContext(searchedName, candidates, reason) {
    const candidateList = candidates.slice(0, 5).map((m, i) => {
      const score = m.match_score ? ` (match: ${m.match_score}/100)` : '';
      return `  ${i + 1}. **${m.name}** (${m.number || 'no number'}) - ${m.status} - Client: ${m.client_name || 'none'}${score} [ID: ${m.id}]`;
    }).join('\n');
    
    let contextStr;
    
    if (reason === 'no_name_multiple_matters') {
      contextStr = `
## ⚠️ MATTER IDENTIFICATION REQUIRED - NO MATTER SPECIFIED

The goal does not specify which matter to work on, and there are multiple active matters.

**Active matters in this firm:**
${candidateList}

## MANDATORY FIRST STEPS - DO NOT SKIP
1. **Call \`list_my_matters\`** to see all available matters
2. **Analyze the goal** to determine which matter is most relevant
3. **Call \`get_matter\`** on the identified matter to load its details
4. **Only then** proceed with the actual work

**CRITICAL:** Do NOT create any documents, notes, tasks, or calendar events until you have positively identified and loaded the correct matter. Working on the wrong matter is a SERIOUS ERROR that wastes attorney time and creates misfiled work product.
`;
    } else if (reason === 'ambiguous_matches') {
      contextStr = `
## ⚠️ AMBIGUOUS MATTER MATCH - VERIFICATION REQUIRED

The goal mentions "${searchedName}" but multiple matters match with similar scores:

${candidateList}

## MANDATORY FIRST STEPS - DO NOT SKIP
1. **Call \`get_matter\`** on the TOP candidate (ID: \`${candidates[0].id}\`) to review its details
2. **Compare** the matter details against what the user's goal describes
3. If the matter looks correct, proceed. If NOT, try the next candidate.
4. **Only after confirming the correct matter** should you create any documents, notes, tasks, or events.

**CRITICAL:** These matters have similar names. You MUST verify you have the right one by reading its details before doing ANY write operations. A junior attorney would confirm which file to work on before spending hours on it. So must you.
`;
    } else if (reason === 'low_confidence') {
      contextStr = `
## ⚠️ LOW CONFIDENCE MATTER MATCH - VERIFICATION REQUIRED

The goal mentions "${searchedName}" but the best match is weak:

${candidateList}

## MANDATORY FIRST STEPS - DO NOT SKIP
1. **Call \`search_matters\`** with search term "${searchedName}" to find better matches
2. If no good match found, call \`list_my_matters\` to browse all matters
3. **Call \`get_matter\`** on the correct matter to load its full details
4. **Only after confirming the correct matter** should you create any documents, notes, tasks, or events.

**CRITICAL:** The match confidence is LOW. The matter "${candidates[0]?.name}" may NOT be what the user intended. You MUST verify before doing any work. Working on the wrong matter wastes attorney time and creates compliance risks.
`;
    }
    
    console.log(`[Amplifier] Matter disambiguation context generated (reason: ${reason}, candidates: ${candidates.length})`);
    
    return contextStr;
  }

  /**
   * Warm the tool cache with a pre-loaded matter so the agent doesn't re-fetch it.
   * This saves 1-2 iterations and 1 API call per task.
   */
  _warmCacheMatter(matterRow) {
    if (!matterRow?.id) return;
    
    // Build a result that matches what executeTool('get_matter', ...) would return
    const matterResult = {
      matter: {
        id: matterRow.id,
        name: matterRow.name,
        number: matterRow.number,
        status: matterRow.status,
        type: matterRow.type,
        description: matterRow.description,
        billing_type: matterRow.billing_type,
        created_at: matterRow.created_at,
        open_date: matterRow.open_date,
        client_name: matterRow.client_name,
        client_id: matterRow.client_id,
        client_email: matterRow.client_email,
        doc_count: parseInt(matterRow.doc_count) || 0,
        note_count: parseInt(matterRow.note_count) || 0,
        task_count: parseInt(matterRow.task_count) || 0,
      },
      success: true,
      _preloaded: true,
    };
    
    // Cache under both the matter ID and the matter name (since the agent might use either)
    const cacheKeyById = this.getToolCacheKey('get_matter', { matter_id: matterRow.id });
    const cacheKeyByName = this.getToolCacheKey('get_matter', { matter_id: matterRow.name });
    
    this.toolCache.set(cacheKeyById, { result: matterResult, timestamp: Date.now() });
    this.toolCache.set(cacheKeyByName, { result: matterResult, timestamp: Date.now() });
    
    // Also cache a search_matters result for this matter
    const searchKey = this.getToolCacheKey('search_matters', { search: matterRow.name });
    this.toolCache.set(searchKey, {
      result: { matters: [matterResult.matter], count: 1, success: true, _preloaded: true },
      timestamp: Date.now()
    });
    
    console.log(`[Amplifier] Warm-cached matter "${matterRow.name}" (ID: ${matterRow.id}) - agent get_matter calls will be instant`);
  }

  /**
   * Warm the tool cache with a list of matters for list_my_matters.
   */
  _warmCacheMattersList(matterRows) {
    if (!Array.isArray(matterRows) || matterRows.length === 0) return;
    
    const matters = matterRows.map(m => ({
      id: m.id,
      name: m.name,
      number: m.number,
      status: m.status,
      type: m.type,
      description: m.description,
      client_name: m.client_name,
      created_at: m.created_at,
    }));
    
    // Cache for list_my_matters with status=active
    const cacheKey = this.getToolCacheKey('list_my_matters', { status: 'active' });
    this.toolCache.set(cacheKey, {
      result: { matters, count: matters.length, success: true, _preloaded: true },
      timestamp: Date.now()
    });
    
    // Also cache without status parameter (default call)
    const defaultKey = this.getToolCacheKey('list_my_matters', {});
    this.toolCache.set(defaultKey, {
      result: { matters, count: matters.length, success: true, _preloaded: true },
      timestamp: Date.now()
    });
    
    console.log(`[Amplifier] Warm-cached ${matters.length} matters for list_my_matters - agent's first call will be instant`);
  }

  isMemoryMessage(message) {
    return message?.role === 'system' && message?.content?.startsWith(MEMORY_MESSAGE_PREFIX);
  }

  buildMemorySummary() {
    const successfulActions = this.actionsHistory.filter(a => !a.result?.error);
    const failedActions = this.actionsHistory.filter(a => a.result?.error);
    const elapsedMin = Math.round((Date.now() - this.startTime.getTime()) / 60000);
    const remainingMin = Math.max(1, Math.round((this.maxRuntimeMs - (Date.now() - this.startTime.getTime())) / 60000));
    
    const createdItems = successfulActions
      .filter(a => ['create_document', 'add_matter_note', 'create_task', 'create_calendar_event'].includes(a.tool))
      .map(a => {
        if (a.tool === 'create_document') return `- Doc: ${a.args?.name || 'untitled'}`;
        if (a.tool === 'add_matter_note') return `- Note added to matter`;
        if (a.tool === 'create_task') return `- Task: ${a.args?.title || 'untitled'}`;
        if (a.tool === 'create_calendar_event') return `- Event: ${a.args?.title || 'untitled'}`;
        return null;
      }).filter(Boolean);
    
    const keyFindings = (this.structuredPlan?.keyFindings || []).slice(-6);

    const summaryParts = [
      `${MEMORY_MESSAGE_PREFIX}`,
      `Goal: ${this.goal}`,
      `Phase: ${this.executionPhase.toUpperCase()} | ${elapsedMin}min elapsed | ~${remainingMin}min remaining`,
      `Stats: ${this.actionsHistory.length} actions | Notes: ${this.substantiveActions.notes} | Tasks: ${this.substantiveActions.tasks} | Docs: ${this.substantiveActions.documents}`,
      keyFindings.length ? `\nKEY FINDINGS:\n${keyFindings.map(f => `- ${f}`).join('\n')}` : null,
      createdItems.length ? `\nCREATED:\n${createdItems.join('\n')}` : null,
      failedActions.length > 0 ? `\nFAILED (avoid): ${[...new Set(failedActions.map(a => a.tool))].join(', ')}` : null,
    ].filter(Boolean);

    const summary = summaryParts.join('\n');
    return summary.length > 3000 ? `${summary.substring(0, 3000)}…` : summary;
  }
  
  /**
   * Calculate progress percentage based on task complexity and actions taken
   */
  calculateProgressPercent() {
    // Phase-based progress: each phase maps to a range
    const phaseRanges = {
      [ExecutionPhase.DISCOVERY]: { min: 5, max: 20 },
      [ExecutionPhase.ANALYSIS]: { min: 20, max: 40 },
      [ExecutionPhase.ACTION]: { min: 40, max: 75 },
      [ExecutionPhase.REVIEW]: { min: 75, max: 90 },
    };
    
    const range = phaseRanges[this.executionPhase] || { min: 5, max: 90 };
    const config = PHASE_CONFIG[this.executionPhase];
    const maxItersForPhase = Math.ceil(this.maxIterations * config.maxIterationPercent / 100);
    const itersInPhase = this.phaseIterationCounts[this.executionPhase];
    const phaseProgress = Math.min(1, itersInPhase / Math.max(1, maxItersForPhase));
    
    const baseProgress = range.min + (range.max - range.min) * phaseProgress;
    
    // Milestone bonuses
    let bonus = 0;
    if (this.structuredPlan) bonus += 3;
    if (this.substantiveActions.notes > 0) bonus += 3;
    if (this.substantiveActions.tasks > 0) bonus += 2;
    if (this.substantiveActions.documents > 0) bonus += 5;
    
    return Math.min(90, Math.max(5, Math.round(baseProgress + bonus)));
  }

  compactMessagesIfNeeded() {
    const totalChars = this.messages.reduce((sum, message) => {
      const contentSize = message?.content?.length || 0;
      const toolSize = message?.tool_calls ? JSON.stringify(message.tool_calls).length : 0;
      return sum + contentSize + toolSize;
    }, 0);

    if (this.messages.length <= MESSAGE_COMPACT_MAX_MESSAGES && totalChars <= MESSAGE_COMPACT_MAX_CHARS) {
      return;
    }

    console.log(`[Amplifier] Compacting messages: ${this.messages.length} messages, ${totalChars} chars`);

    // ===== RECURSIVE SUMMARIZATION =====
    // Instead of simply dropping old messages, fold them into compressed
    // summaries that preserve information at decreasing fidelity.
    // Long-Term Memory (mission goal) stays permanent in the context.
    // Mid-Term Memory (recursive summaries) compresses old conversation.
    // Short-Term Memory (recent messages) stays in full fidelity.
    if (this.agentMemory) {
      try {
        const compactedMessages = recursiveCompact(this, this.agentMemory);
        this.messages = this.normalizeMessages(compactedMessages);
        
        console.log(`[Amplifier] Recursive summarization: ${totalChars} chars -> ${this.messages.length} messages. ` +
          `Memory layers: ${this.agentMemory.midTerm.summaryLayers.length}, ` +
          `total summarized: ${this.agentMemory.midTerm.totalMessagesSummarized}`);
        return;
      } catch (summarizerError) {
        console.warn(`[Amplifier] Recursive summarizer failed, falling back to basic compaction:`, summarizerError.message);
        // Fall through to basic compaction below
      }
    }

    // Fallback: basic compaction (original approach)
    // The system prompt is always first and always preserved
    const systemMessage = this.messages.find(message => message.role === 'system' && !this.isMemoryMessage(message) && !this.isPlanMessage(message));
    
    // Keep recent messages (reduced from 12 to 10 to leave more room for plan + memory)
    const recentMessages = this.messages.slice(-10).filter(message => 
      !this.isMemoryMessage(message) && !this.isPlanMessage(message)
    );
    
    // Rescue follow-up messages from older messages that would be dropped
    const olderMessages = this.messages.slice(0, -12);
    const rescuedFollowUps = olderMessages.filter(message =>
      message?.role === 'user' && message?.content?.includes('FOLLOW-UP INSTRUCTION FROM USER')
    );
    
    // Build fresh memory summary
    const memoryMessage = { role: 'system', content: this.buildMemorySummary() };
    
    // Build fresh plan message (this is the KEY improvement - plan always survives)
    const planMessage = this.buildPlanMessage();

    this.messages = this.normalizeMessages([
      systemMessage, 
      memoryMessage, 
      planMessage,    // Plan ALWAYS re-injected after compaction
      ...rescuedFollowUps, // Follow-up instructions survive compaction
      ...recentMessages
    ].filter(Boolean));
    
    console.log(`[Amplifier] Basic compaction: ${this.messages.length} messages (plan preserved, ${rescuedFollowUps.length} follow-ups rescued)`);
  }

  normalizeMessages(messages) {
    const normalized = [];

    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i];
      if (!message) continue;

      if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        const toolCallIds = new Set(message.tool_calls.map(toolCall => toolCall?.id).filter(Boolean));
        const toolMessages = [];
        let j = i + 1;

        for (; j < messages.length; j += 1) {
          const next = messages[j];
          if (!next || next.role !== 'tool') break;
          if (next.tool_call_id && toolCallIds.has(next.tool_call_id)) {
            toolMessages.push(next);
            toolCallIds.delete(next.tool_call_id);
          } else {
            // Ignore tool responses that don't match the current tool_call group
          }
        }

        if (toolCallIds.size === 0) {
          normalized.push(message, ...toolMessages);
        } else {
          console.warn('[Amplifier] Dropping incomplete tool_call group before model call');
        }

        i = j - 1;
        continue;
      }

      if (message.role === 'tool') {
        // Skip orphan tool messages to avoid Azure errors
        continue;
      }

      normalized.push(message);
    }

    return normalized;
  }

  getToolStepLabel(toolName, toolArgs = {}) {
    switch (toolName) {
      case 'create_document':
        return `Drafting document${toolArgs.name ? `: ${toolArgs.name}` : ''}`;
      case 'read_document_content':
        return `Reading document${toolArgs.document_id ? ` (${toolArgs.document_id})` : ''}`;
      case 'search_document_content':
        return `Searching documents for "${toolArgs.search_term || 'text'}"`;
      case 'create_invoice':
        return `Preparing invoice${toolArgs.client_id ? ` for client ${toolArgs.client_id}` : ''}`;
      case 'send_invoice':
        return `Sending invoice${toolArgs.invoice_id ? ` ${toolArgs.invoice_id}` : ''}`;
      case 'log_time':
        return `Logging time${toolArgs.matter_id ? ` to ${toolArgs.matter_id}` : ''}`;
      case 'create_task':
        return `Creating task${toolArgs.title ? `: ${toolArgs.title}` : ''}`;
      case 'create_calendar_event':
        return `Scheduling event${toolArgs.title ? `: ${toolArgs.title}` : ''}`;
      case 'create_matter':
        return `Creating matter${toolArgs.name ? `: ${toolArgs.name}` : ''}`;
      case 'update_matter':
        return `Updating matter${toolArgs.matter_id ? ` ${toolArgs.matter_id}` : ''}`;
      case 'close_matter':
        return `Closing matter${toolArgs.matter_id ? ` ${toolArgs.matter_id}` : ''}`;
      case 'list_clients':
        return 'Reviewing clients';
      case 'list_matters':
      case 'list_my_matters':
        return 'Reviewing matters';
      case 'list_documents':
        return 'Reviewing documents';
      default:
        return `Executing: ${toolName}`;
    }
  }

  /**
   * Get detailed, human-readable description of what tool is doing
   * Used for precise live activity feed updates
   */
  getDetailedToolDescription(toolName, toolArgs = {}) {
    switch (toolName) {
      case 'create_document':
        const docName = toolArgs.name || toolArgs.title || 'document';
        const docType = toolArgs.document_type || 'legal document';
        return `📄 Creating ${docType}: "${docName}"`;
      
      case 'read_document_content':
        return `📖 Reading document content (ID: ${toolArgs.document_id || 'unknown'})`;
      
      case 'search_document_content':
        return `🔍 Searching documents for: "${toolArgs.search_term || toolArgs.query || 'keywords'}"`;
      
      case 'add_matter_note':
        const notePreview = (toolArgs.content || toolArgs.note || '').substring(0, 50);
        return `📝 Adding note to matter: "${notePreview}${notePreview.length >= 50 ? '...' : ''}"`;
      
      case 'create_task':
        return `✅ Creating task: "${toolArgs.title || toolArgs.name || 'new task'}"`;
      
      case 'create_calendar_event':
        return `📅 Scheduling: "${toolArgs.title || 'event'}" on ${toolArgs.date || toolArgs.start_date || 'TBD'}`;
      
      case 'create_invoice':
        return `💰 Preparing invoice${toolArgs.amount ? ` for $${toolArgs.amount}` : ''}`;
      
      case 'send_invoice':
        return `📤 Sending invoice to client`;
      
      case 'log_time':
        const hours = toolArgs.hours || toolArgs.duration || '?';
        return `⏱️ Logging ${hours} hours: "${toolArgs.description || 'billable work'}"`;
      
      case 'create_matter':
        return `📁 Opening new matter: "${toolArgs.name || toolArgs.title || 'new matter'}"`;
      
      case 'update_matter':
        return `📝 Updating matter status/details`;
      
      case 'close_matter':
        return `✔️ Closing matter`;
      
      case 'list_clients':
        return `👥 Fetching client list`;
      
      case 'list_matters':
      case 'list_my_matters':
        return `📋 Fetching matters list`;
      
      case 'list_documents':
        return `📂 Fetching document list`;
      
      case 'get_matter':
      case 'get_matter_details':
        return `📋 Loading matter details (ID: ${toolArgs.matter_id || 'unknown'})`;
      
      case 'draft_email_for_matter':
        return `✉️ Drafting email: "${toolArgs.subject || 'communication'}"`;
      
      case 'task_complete':
        return `🎯 Completing task with summary`;
      
      case 'request_user_input':
        return `❓ Requesting user input: "${toolArgs.question || 'feedback needed'}"`;
      
      default:
        // Convert snake_case to readable format
        const readable = toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `⚙️ ${readable}`;
    }
  }

  /**
   * Get detailed completion message for tool result
   */
  getDetailedCompletionMessage(toolName, toolArgs, result, success) {
    if (!success) {
      return `❌ Failed: ${result.error || result.message || toolName}`;
    }
    
    switch (toolName) {
      case 'create_document':
        const docName = result.document?.name || result.name || toolArgs.name || 'document';
        return `✅ Document created: "${docName}"`;
      
      case 'add_matter_note':
        return `✅ Note added to matter successfully`;
      
      case 'create_task':
        const taskTitle = result.task?.title || toolArgs.title || 'task';
        return `✅ Task created: "${taskTitle}"`;
      
      case 'create_calendar_event':
        return `✅ Event scheduled: "${toolArgs.title || 'event'}"`;
      
      case 'log_time':
        return `✅ Time logged: ${toolArgs.hours || '?'} hours`;
      
      case 'create_matter':
        return `✅ Matter opened: "${result.matter?.name || toolArgs.name || 'new matter'}"`;
      
      case 'list_clients':
        const clientCount = result.clients?.length || 0;
        return `✅ Found ${clientCount} client${clientCount !== 1 ? 's' : ''}`;
      
      case 'list_matters':
      case 'list_my_matters':
        const matterCount = result.matters?.length || 0;
        return `✅ Found ${matterCount} matter${matterCount !== 1 ? 's' : ''}`;
      
      case 'list_documents':
        const docCount = result.documents?.length || 0;
        return `✅ Found ${docCount} document${docCount !== 1 ? 's' : ''}`;
      
      case 'search_document_content':
        const resultCount = result.results?.length || 0;
        return `✅ Found ${resultCount} result${resultCount !== 1 ? 's' : ''} for "${toolArgs.search_term || 'query'}"`;
      
      case 'read_document_content':
        return `✅ Document content loaded`;
      
      case 'draft_email_for_matter':
        return `✅ Email draft prepared`;
      
      default:
        return `✅ ${toolName.replace(/_/g, ' ')} completed`;
    }
  }

  buildCheckpointPayload() {
    this.compactMessagesIfNeeded();

    return {
      messages: JSON.parse(JSON.stringify(this.normalizeMessages(this.messages))),
      actionsHistory: this.actionsHistory.slice(-200),
      progress: this.progress,
      result: this.result,
      error: this.error,
      iterations: this.progress.iterations,
      plan: this.plan,
      structuredPlan: this.structuredPlan,
      executionPhase: this.executionPhase,
      phaseIterationCounts: this.phaseIterationCounts,
      substantiveActions: this.substantiveActions,
      systemPrompt: this.systemPrompt,
      lastCheckpointAt: new Date().toISOString(),
      // Persist rewind system state (failed paths, rewind history)
      rewindState: this.rewindManager ? this.rewindManager.getSerializableState() : null,
      // Persist recursive summarization memory
      agentMemoryState: this.agentMemory ? this.agentMemory.serialize() : null,
      // Persist work type classification from the brief
      workTypeId: this.workType?.id || null,
      // Persist matter verification state so it survives restarts
      matterConfidence: this.matterConfidence || null,
      verifiedMatterIds: this._verifiedMatterIds ? Array.from(this._verifiedMatterIds) : [],
    };
  }

  async saveCheckpoint(reason = 'periodic') {
    if (!persistenceAvailable) return;
    const now = Date.now();
    if (now - this.lastCheckpointAt < CHECKPOINT_INTERVAL_MS && reason === 'periodic') {
      return;
    }
    this.lastCheckpointAt = now;

    const checkpoint = this.buildCheckpointPayload();

    try {
      await query(
        `INSERT INTO ai_background_tasks (
          id, firm_id, user_id, goal, status, progress, result, error, started_at, iterations,
          max_iterations, options, checkpoint, checkpoint_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          progress = EXCLUDED.progress,
          result = EXCLUDED.result,
          error = EXCLUDED.error,
          iterations = EXCLUDED.iterations,
          max_iterations = EXCLUDED.max_iterations,
          options = EXCLUDED.options,
          checkpoint = EXCLUDED.checkpoint,
          checkpoint_at = NOW(),
          updated_at = NOW()`,
        [
          this.id,
          this.firmId,
          this.userId,
          this.goal,
          this.status,
          this.progress,
          this.result,
          this.error,
          this.startTime,
          this.progress.iterations,
          this.maxIterations,
          this.options || {},
          checkpoint
        ]
      );
    } catch (error) {
      markPersistenceUnavailable(error);
      if (persistenceAvailable) {
        console.error('[Amplifier] Failed to save checkpoint:', error.message);
      }
    }
  }

  loadCheckpoint(checkpoint) {
    if (!checkpoint) return;
    this.messages = Array.isArray(checkpoint.messages) ? checkpoint.messages : this.messages;
    this.actionsHistory = Array.isArray(checkpoint.actionsHistory) ? checkpoint.actionsHistory : this.actionsHistory;
    this.progress = checkpoint.progress || this.progress;
    this.result = checkpoint.result || this.result;
    this.error = checkpoint.error || this.error;
    this.plan = checkpoint.plan || this.plan;
    this.structuredPlan = checkpoint.structuredPlan || this.structuredPlan;
    this.executionPhase = checkpoint.executionPhase || this.executionPhase;
    this.phaseIterationCounts = checkpoint.phaseIterationCounts || this.phaseIterationCounts;
    this.substantiveActions = checkpoint.substantiveActions || this.substantiveActions;
    this.systemPrompt = checkpoint.systemPrompt || this.systemPrompt;
    
    // Restore matter verification state (so the guardrail doesn't re-block after restart)
    if (checkpoint.matterConfidence) {
      this.matterConfidence = checkpoint.matterConfidence;
    }
    if (Array.isArray(checkpoint.verifiedMatterIds) && checkpoint.verifiedMatterIds.length > 0) {
      this._verifiedMatterIds = new Set(checkpoint.verifiedMatterIds);
      console.log(`[Amplifier] Restored ${this._verifiedMatterIds.size} verified matter IDs from checkpoint`);
    }
    
    // Restore rewind system state (failed paths survive restarts)
    if (checkpoint.rewindState && this.rewindManager) {
      this.rewindManager.loadSerializableState(checkpoint.rewindState);
    }
    
    // Restore recursive summarization memory
    if (checkpoint.agentMemoryState) {
      this.agentMemory = AgentMemory.deserialize(checkpoint.agentMemoryState, this.goal);
    }
    
    // Restore work type classification using already-imported classifyWork
    if (checkpoint.workTypeId) {
      this.workType = classifyWork(this.goal);
    }
  }

  async persistCompletion(status, errorMessage = null) {
    if (!persistenceAvailable) return;
    try {
      const storedError = status === TaskStatus.FAILED ? (this.error || errorMessage) : null;
      const completedAt = this.endTime || new Date(); // Defensive guard against null endTime
      await query(
        `UPDATE ai_background_tasks
         SET status = $1,
             progress = $2,
             result = $3,
             error = $4,
             completed_at = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [
          status,
          this.progress,
          this.result,
          storedError,
          completedAt,
          this.id
        ]
      );
    } catch (error) {
      markPersistenceUnavailable(error);
      if (persistenceAvailable) {
        console.error('[Amplifier] Failed to persist completion:', error.message);
      }
    }
  }

  /**
   * Build the system prompt with full context
   * This prompt enables FULLY AUTONOMOUS operation at JUNIOR ATTORNEY level
   */
  buildSystemPrompt() {
    const totalMinutes = Math.round(this.maxRuntimeMs / 60000);
    
    // ===== DATE CONTEXT =====
    // Critical: without this, the model defaults to its training data cutoff (2024)
    // and produces stale date references in legal documents, deadlines, and analysis.
    const todayStr = getTodayInTimezone(DEFAULT_TIMEZONE);
    const now = new Date();
    const dateParts = getDatePartsInTimezone(now, DEFAULT_TIMEZONE);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[now.getDay()];
    const currentYear = dateParts.year;
    
    // ===== LEAN SYSTEM PROMPT =====
    // Only include what the model NEEDS. GPT already knows what legal matters, clients, etc. are.
    // This saves ~2000 tokens per API call = dramatically fewer rate limits over 30 min.
    
    // ===== LEAN SYSTEM PROMPT (optimized for token efficiency) =====
    // Only include what the model NEEDS for this specific task.
    // Every unnecessary token here costs across ALL iterations.
    
    const matterContextStr = this.matterContext || '';
    const hasMatterPreloaded = !!this.preloadedMatterId;
    const matterConfidence = this.matterConfidence || (hasMatterPreloaded ? 'high' : 'none');
    const matterIsVerified = matterConfidence === 'exact' || matterConfidence === 'high';
    const matterNeedsVerification = matterConfidence === 'ambiguous' || matterConfidence === 'low' || matterConfidence === 'medium' || matterConfidence === 'none';
    
    let prompt = `You are the APEX LEGAL BACKGROUND AGENT - a FULLY AUTONOMOUS junior attorney AI with COMPLETE tool access to a legal practice management platform.

**Today:** ${dayOfWeek}, ${todayStr} (${currentYear}) | **Current Time:** ${String(dateParts.hours).padStart(2, '0')}:${String(dateParts.minutes).padStart(2, '0')} ET
**Task:** ${this.goal}
**Complexity:** ${this.complexity} | **Budget:** ~${totalMinutes} min | **Phase:** ${this.executionPhase.toUpperCase()}

${this.userContext || ''}
${matterContextStr}

## RULES
- FULLY AUTONOMOUS. Call tools immediately. NEVER respond with text only.
- STAY FOCUSED on the assigned task. Do NOT investigate tangential issues or go down rabbit holes. If you find something unrelated but concerning, note it briefly and move on.
- NEVER use log_time or log_billable_work.
- NO placeholders [INSERT], [TODO] in documents. Write REAL content only.
- Before task_complete: ≥8 tool calls, ≥1 note, ≥1 task, ≥120s elapsed.
- IRAC for legal analysis. Be thorough. Push through failures.
- Budget your time: spend ~25% reading, ~25% analyzing, ~35% creating deliverables, ~15% reviewing. Do NOT over-read.
${hasMatterPreloaded && matterIsVerified
  ? `- Matter "${this.preloadedMatterName}" is pre-loaded with ${matterConfidence.toUpperCase()} confidence (ID: ${this.preloadedMatterId}). Use this ID directly - no need to search.`
  : hasMatterPreloaded && !matterIsVerified
  ? `- ⚠️ Matter "${this.preloadedMatterName}" was matched with ${matterConfidence.toUpperCase()} confidence. You MUST call get_matter to verify it before creating any documents, notes, or tasks. If it's the wrong matter, use search_matters to find the right one.`
  : '- No matter was identified from the goal. Search for the relevant matter first with search_matters or list_my_matters. You MUST verify the correct matter before any write operations.'}
${matterNeedsVerification ? `- **MATTER SAFETY GATE**: Write tools (add_matter_note, create_document, create_task, etc.) are BLOCKED until you call get_matter and verify the correct matter. This prevents working on the wrong file.` : ''}

## TOOLS
**Read:** get_matter, search_matters, list_clients, read_document_content, search_document_content, list_documents, get_calendar_events, list_tasks
**Write:** add_matter_note (notes), create_document (formal .docx), create_task (follow-ups), create_calendar_event (deadlines)
**Meta:** think_and_plan, evaluate_progress, review_created_documents (REVIEW phase), task_complete

## PHASES (current: ${this.executionPhase.toUpperCase()})
${hasMatterPreloaded && matterIsVerified
  ? `- **DISCOVERY**: Read documents and notes for the pre-loaded matter. Skip searching.`
  : `- **DISCOVERY**: ${matterNeedsVerification ? 'FIRST verify the correct matter with get_matter/search_matters, THEN ' : 'Find and '}read the matter, its documents, notes, calendar.`}
- **ANALYSIS**: Document findings with add_matter_note.
- **ACTION**: Create deliverables: documents, tasks, events.
- **REVIEW**: Call review_created_documents, verify quality, then task_complete.
`;

    // Only include CPLR context if task involves NY law or litigation
    const needsCPLR = /\b(?:cplr|ny |new york|litigation|motion|discovery|filing|statute|deadline|sol\b)/i.test(this.goal);
    if (needsCPLR) {
      prompt += getCPLRContextForPrompt() + '\n';
    }

    // Only include rewind/failed paths if they exist
    if (this.rewindManager && this.rewindManager.failedPaths.length > 0) {
      prompt += this.rewindManager.getFailedPathsSummary() + '\n';
    }

    // Only include module guidance if detected and relevant
    if (this.detectedModule) {
      prompt += formatModuleForPrompt(this.detectedModule) + '\n';
    }

    // Only include learning context if meaningful
    if (this.learningContext && this.learningContext.trim().length > 20) {
      prompt += this.learningContext + '\n';
    }

    // ===== HARNESS INTELLIGENCE: Inject per-matter memory =====
    if (this.matterMemory) {
      prompt += this.matterMemory;
    }

    // ===== HARNESS INTELLIGENCE: Inject proven tool chain =====
    if (this.provenToolChain) {
      prompt += formatToolChainForPrompt(this.provenToolChain);
    }

    // ===== HARNESS INTELLIGENCE: Inject rejection-learned modifiers =====
    if (this.qualityOverrides?.promptModifiers?.length > 0) {
      prompt += '\n## QUALITY REQUIREMENTS (learned from previous feedback)\n';
      for (const modifier of this.qualityOverrides.promptModifiers.slice(0, 3)) {
        prompt += `${modifier}\n`;
      }
      prompt += '\n';
    }

    // ===== ATTORNEY IDENTITY: Inject deep identity profile =====
    // This is the "become the attorney" system. As maturity grows, this section
    // gets richer and the junior attorney brief gets thinner — until eventually
    // the identity IS the brief and the agent writes as the attorney would write.
    if (this.attorneyIdentity && this.attorneyIdentity.maturity > 0) {
      const identityPrompt = formatIdentityForPrompt(this.attorneyIdentity);
      if (identityPrompt) {
        prompt += identityPrompt + '\n';
      }
    }

    // ===== ATTORNEY EXEMPLARS: Show, don't tell =====
    // Instead of "short sentences, semiformal tone" (labels that lose texture),
    // inject actual excerpts of the attorney's approved work and corrections.
    // The model matches rhythm, word choices, structure — the REAL voice.
    if (this.attorneyExemplars) {
      const exemplarPrompt = formatExemplarsForPrompt(this.attorneyExemplars);
      if (exemplarPrompt) {
        prompt += exemplarPrompt + '\n';
      }
    }

    // ===== IDENTITY REPLAY: Replay the attorney's decision process =====
    // This is the highest-fidelity learning signal. Instead of describing
    // what the attorney wants (labels) or showing excerpts (exemplars),
    // we replay their actual decision-making process from an approved task.
    // When a strong replay exists, it becomes the PRIMARY instruction.
    if (this.identityReplays && this.identityReplays.length > 0) {
      const replayPrompt = formatReplayForPrompt(this.identityReplays);
      if (replayPrompt) {
        prompt += replayPrompt + '\n';
      }
    }

    // ===== COGNITIVE IMPRINTING: Inject cognitive state adaptations =====
    // Adapts the agent's behavior based on inferred working mode (deep_work/triage/urgent)
    if (this.cognitiveState && this.cognitiveState.confidence > 0.35) {
      const statePrompt = formatCognitiveStateForPrompt(this.cognitiveState);
      if (statePrompt) {
        prompt += statePrompt + '\n';
      }
    }

    // ===== COGNITIVE IMPRINTING: Inject cognitive signature =====
    // Model-agnostic continuous dimensions of the attorney's cognitive profile
    if (this.cognitiveSignature && this.cognitiveSignature.observedDimensions >= 3) {
      const sigPrompt = renderSignatureForPrompt(this.cognitiveSignature);
      if (sigPrompt) {
        prompt += sigPrompt + '\n';
      }
    }

    // ===== COGNITIVE IMPRINTING: Inject edit-learned preferences =====
    // High-confidence signals from the attorney's silent edits to agent-created documents
    if (this.editLearnedPreferences) {
      prompt += this.editLearnedPreferences + '\n';
    }

    // ===== COGNITIVE IMPRINTING: Inject resonance memory =====
    // Charge-weighted output from the living cognitive graph
    if (this.resonanceGraph?.loaded) {
      const resonancePrompt = renderGraphForPrompt(this.resonanceGraph);
      if (resonancePrompt) {
        prompt += resonancePrompt + '\n';
      }
    }

    // ===== USER AI MEMORY FILE =====
    // The persistent per-user memory that grows as the attorney uses the platform.
    // Includes things like practice areas, style preferences, corrections, and active context.
    // Placed BEFORE "BEGIN NOW" so the model reads who this attorney is before starting work.
    if (this.userMemoryContext && this.userMemoryContext.trim().length > 20) {
      prompt += this.userMemoryContext + '\n';
    }

    // Confidence-aware start instructions
    let startInstruction;
    if (hasMatterPreloaded && matterIsVerified) {
      startInstruction = `Start with think_and_plan, then immediately work on matter "${this.preloadedMatterName}".`;
    } else if (hasMatterPreloaded && matterNeedsVerification) {
      startInstruction = `Start by calling get_matter with ID "${this.preloadedMatterId}" to VERIFY it is the correct matter for this task. Check the matter name, client, and status. If correct, proceed. If NOT, use search_matters to find the right one. Do NOT create any documents, notes, or tasks until verified.`;
    } else {
      startInstruction = `Call think_and_plan first, then use search_matters or list_my_matters to identify the correct matter before doing any work.`;
    }
    prompt += `\nBEGIN NOW. ${startInstruction}\n`;

    // ===== UNIFIED LEARNING CONTEXT =====
    // All learning sources are combined into a single, selective, budgeted section.
    // This replaces the previous scattered approach where each module independently
    // appended its own section (causing prompt bloat and inconsistent prioritization).
    try {
      const unifiedContext = buildUnifiedLearningContext({
        goal: this.goal,
        workTypeId: this.workType?.id || this.complexity || 'general',
        matterId: this.preloadedMatterId || null,
        lawyerProfile: this.lawyerProfile,
        interactionProfile: this.interactionProfile,
        qualityOverrides: this.qualityOverrides,
        provenToolChain: this.provenToolChain,
        matterMemory: this.matterMemory,
        activityContext: this.activityContext,
        documentProfile: this.userDocumentProfile,
        attorneyIdentity: this.attorneyIdentity,
      });
      if (unifiedContext) {
        prompt += unifiedContext;
      }
    } catch (e) {
      // Fallback: inject critical overrides only
      if (this.qualityOverrides?.promptModifiers?.length > 0) {
        prompt += '\n## QUALITY REQUIREMENTS\n';
        for (const mod of this.qualityOverrides.promptModifiers.slice(0, 2)) {
          prompt += `${mod}\n`;
        }
      }
    }

    return prompt;
  }

  /**
   * Start the background task
   * This begins AUTONOMOUS execution without human intervention
   */
  async start({ resumeFromCheckpoint = false } = {}) {
    this.status = TaskStatus.RUNNING;
    this.progress.currentStep = resumeFromCheckpoint ? 'Resuming autonomous agent...' : 'Initializing autonomous agent...';
    this.emit('progress', this.getStatus());

    try {
      console.log(`[Amplifier] Starting autonomous task ${this.id}: ${this.goal}`);
      
      // Stream task start event to Glass Cockpit UI
      this.streamEvent('task_start', `🚀 Task started: "${this.goal.substring(0, 80)}${this.goal.length > 80 ? '...' : ''}"`, {
        goal: this.goal,
        icon: 'rocket',
        color: 'green'
      });
      this.streamProgress();
      
      if (!resumeFromCheckpoint) {
        // Initialize context (user info, firm data, learnings)
        this.streamEvent('context_init', '🔧 Loading user context, firm data, and historical learnings...', {
          icon: 'settings',
          color: 'gray'
        });
        await this.initializeContext();
        
        // Build initial messages with a STRONG action prompt
        // The user message must clearly instruct the AI to take action immediately
        this.systemPrompt = this.buildSystemPrompt();
        
        // ===== JUNIOR ATTORNEY BRIEF (ADAPTIVE) =====
        // The brief now has THREE override layers:
        // 1. Identity maturity: generic brief fades as identity grows
        // 2. Identity replay: if a strong replay exists, brief yields entirely
        // 3. Both can stack: replay provides the PROCESS, identity provides the VOICE
        const workType = classifyWork(this.goal);
        const totalMinutes = Math.round(this.maxRuntimeMs / 60000);
        
        // If a strong replay exists, generate a minimal brief (replay IS the primary instruction)
        const hasStrongReplay = this.replayReplaceBrief && this.identityReplays?.length > 0;
        
        const brief = hasStrongReplay
          ? generateBrief(this.goal, this.matterContext, {
              totalMinutes,
              attorneyIdentity: { 
                ...(this.attorneyIdentity || {}),
                // Force MIRROR level when replay replaces brief
                maturity: Math.max(this.attorneyIdentity?.maturity || 0, 76),
                maturityLevel: { min: 76, max: 100, briefWeight: 0.0, identityWeight: 1.0, label: 'replay' },
              },
            })
          : generateBrief(this.goal, this.matterContext, { 
              totalMinutes,
              attorneyIdentity: this.attorneyIdentity,
            });
        
        const identityMaturity = this.attorneyIdentity?.maturity || 0;
        const identityLevel = this.attorneyIdentity?.maturityLevel?.label || 'nascent';
        const replayCount = this.identityReplays?.length || 0;
        const briefMode = hasStrongReplay ? 'replay (attorney\'s own decision path)' :
                          identityMaturity >= 76 ? 'mirror (identity replaces brief)' :
                          identityMaturity >= 56 ? 'minimal (identity drives style)' :
                          identityMaturity >= 36 ? 'thinned (identity supplements brief)' :
                          'full (learning this attorney)';
        
        this.streamEvent('brief_generated', `📋 ${workType.name} | Identity: ${identityLevel} (${identityMaturity}/100) | Brief: ${briefMode}${replayCount > 0 ? ` | ${replayCount} replay(s)` : ''}`, {
          work_type: workType.id,
          identity_maturity: identityMaturity,
          identity_level: identityLevel,
          brief_mode: briefMode,
          replay_count: replayCount,
          replay_replaces_brief: hasStrongReplay,
          icon: hasStrongReplay ? 'repeat' : 'book-open',
          color: hasStrongReplay ? 'green' : identityMaturity >= 56 ? 'purple' : identityMaturity >= 36 ? 'blue' : 'gray'
        });
        
        console.log(`[Amplifier] Task classified as "${workType.name}" - brief: ${briefMode} (${brief.length} chars, identity: ${identityMaturity}/100, replays: ${replayCount})`);
        
        // Store work type for phase budget adjustments
        this.workType = workType;
        
        // ===== RECURSIVE SUMMARIZATION: Inject Long-Term Memory header =====
        // The mission goal header persists through the entire session, ensuring
        // the agent never loses sight of its 30-minute objective even after
        // many rounds of message compaction.
        const longTermHeader = this.agentMemory 
          ? { role: 'system', content: this.agentMemory.buildLongTermHeader() }
          : null;
        
        // Build initial messages - more concise when matter is pre-loaded
        const executionPrompt = this.preloadedMatterId
          ? `EXECUTE NOW: ${this.goal}\n\nMatter "${this.preloadedMatterName}" (ID: ${this.preloadedMatterId}) is pre-loaded. Follow the brief above. Call think_and_plan then start calling tools immediately. Do NOT respond with text only.`
          : `EXECUTE THIS TASK NOW: ${this.goal}\n\nFollow the brief above. Call think_and_plan to create your execution plan, then immediately start calling tools. Do NOT respond with just text - you MUST call tools.`;
        
        this.messages = [
          { role: 'system', content: this.systemPrompt },
          longTermHeader, // Long-Term Memory: mission goal + key facts
          { 
            role: 'user', 
            content: brief  // Junior Attorney Brief: how to approach this work
          },
          { 
            role: 'user', 
            content: executionPrompt
          }
        ].filter(Boolean);
      }

      await this.saveCheckpoint('start');
      
      console.log(`[Amplifier] Task ${this.id} context initialized, starting agent loop`);
      
      this.streamEvent('context_ready', '✅ Context loaded. Beginning autonomous execution...', {
        icon: 'check-circle',
        color: 'green'
      });
      
      // Run the agentic loop (autonomous execution)
      await this.runAgentLoop();
      
    } catch (error) {
      this.status = TaskStatus.FAILED;
      this.error = error.message;
      this.endTime = new Date();
      console.error(`[Amplifier] Task ${this.id} failed:`, error);
      console.error(`[Amplifier] Error stack:`, error.stack);
      await this.saveTaskHistory();
      await this.persistCompletion(TaskStatus.FAILED, error.message);
      this.emit('error', error);
    }
  }

  /**
   * Run the autonomous agent loop
   * This loop executes tools repeatedly until the task is complete
   * The agent works WITHOUT human intervention
   */
  async runAgentLoop() {
    const MAX_ITERATIONS = this.maxIterations;
    const MAX_TEXT_ONLY_STREAK = 2; // Tightened: 2 text-only responses before intervention (saves iterations)
    const PLAN_REINJECTION_INTERVAL = 8; // Up from 6: reduce overhead of plan injection
    const tools = getOpenAITools();
    
    console.log(`[Amplifier] Starting agent loop with ${tools.length} tools, phase: ${this.executionPhase}`);
    
    while (this.progress.iterations < MAX_ITERATIONS && !this.cancelled) {
      const elapsedMs = Date.now() - this.startTime.getTime();
      if (elapsedMs > this.maxRuntimeMs) {
        console.warn(`[Amplifier] Task ${this.id} reached max runtime (${this.maxRuntimeMs}ms)`);
        
        // SMART COMPLETION SEQUENCE (time limit reached)
        // Unlike before, we now run a REAL quality evaluation even at timeout.
        // This ensures the supervising attorney gets an honest assessment.
        this.progress.progressPercent = 90;
        this.progress.currentStep = 'Time limit reached - evaluating work quality...';
        this.streamEvent('finishing', `🎯 Reached time limit (${Math.round(elapsedMs / 60000)}min), running quality evaluation...`, { icon: 'clock', color: 'yellow' });
        this.streamProgress();
        
        // ===== RUN REAL EVALUATION AT TIMEOUT =====
        // Don't just dump whatever we have. Run the same evaluator that normal
        // completion uses so the supervising attorney knows the quality level.
        let timeoutEvaluation = null;
        try {
          this.endTime = new Date(); // Set endTime before evaluateTask needs it
          timeoutEvaluation = await evaluateTask(this);
          await storeEvaluation(this.id, timeoutEvaluation);
          console.log(`[Amplifier] Timeout evaluation score: ${timeoutEvaluation.overallScore}/100`);
        } catch (evalErr) {
          console.warn('[Amplifier] Timeout evaluation failed (non-fatal):', evalErr.message);
        }
        
        // Build detailed completion summary
        const elapsedMin = Math.round(elapsedMs / 60000);
        const successActions = this.actionsHistory.filter(a => a.success !== false);
        const createdDocs = successActions.filter(a => a.tool === 'create_document').map(a => a.args?.name || 'document');
        const createdNotes = successActions.filter(a => a.tool === 'add_matter_note').length;
        const createdTasks = successActions.filter(a => a.tool === 'create_task').map(a => a.args?.title || 'task');
        const createdEvents = successActions.filter(a => a.tool === 'create_calendar_event').map(a => a.args?.title || 'event');
        const keyFindings = (this.structuredPlan?.keyFindings || []).slice(-5);
        
        const summaryParts = [`Task ran for ${elapsedMin} minutes (${this.progress.iterations} iterations, phase: ${this.executionPhase}).`];
        
        if (createdDocs.length > 0) summaryParts.push(`Documents created: ${createdDocs.join(', ')}`);
        if (createdNotes > 0) summaryParts.push(`Notes added: ${createdNotes}`);
        if (createdTasks.length > 0) summaryParts.push(`Tasks created: ${createdTasks.join(', ')}`);
        if (createdEvents.length > 0) summaryParts.push(`Events scheduled: ${createdEvents.join(', ')}`);
        if (keyFindings.length > 0) summaryParts.push(`Key findings: ${keyFindings.join('; ')}`);
        
        // ===== STRUCTURED WHAT-DONE / WHAT-REMAINS =====
        // Identify what phases were NOT completed and what the next attorney should do
        const phases = ['discovery', 'analysis', 'action', 'review'];
        const currentPhaseIdx = phases.indexOf(this.executionPhase);
        const completedPhases = phases.slice(0, currentPhaseIdx + 1);
        const remainingPhases = currentPhaseIdx < phases.length - 1 
          ? phases.slice(currentPhaseIdx + 1) 
          : [];
        
        // Build structured remaining work assessment
        const remainingWork = [];
        if (!this.actionsHistory.some(a => a.tool === 'review_created_documents' && a.success !== false)) {
          remainingWork.push('Self-review of created documents not completed - review all deliverables for quality');
        }
        if (this.substantiveActions.documents === 0 && ['document_drafting', 'legal_research', 'client_communication'].includes(this.workType?.id)) {
          remainingWork.push(`No formal document created yet - ${this.workType.name} requires a document deliverable`);
        }
        if (this.substantiveActions.tasks === 0) {
          remainingWork.push('No follow-up tasks created - create action items for next steps');
        }
        if (timeoutEvaluation?.issues?.length > 0) {
          remainingWork.push(...timeoutEvaluation.issues.slice(0, 3));
        }
        
        if (remainingPhases.length > 0) {
          summaryParts.push(`Phases completed: ${completedPhases.join(', ')}. Phases remaining: ${remainingPhases.join(', ')}.`);
        }
        if (remainingWork.length > 0) {
          summaryParts.push(`Outstanding items: ${remainingWork.join('; ')}`);
        }
        summaryParts.push('Consider running a follow-up task to complete outstanding work.');
        
        // Add quality score to summary so the attorney sees it immediately
        if (timeoutEvaluation?.overallScore >= 0) {
          summaryParts.push(`Quality evaluation score: ${timeoutEvaluation.overallScore}/100.`);
        }
        
        this.progress.progressPercent = 98;
        this.progress.currentStep = 'Saving results...';
        this.streamProgress();
        await sleep(400);
        
        this.status = TaskStatus.COMPLETED;
        this.progress.progressPercent = 100;
        this.progress.currentStep = 'Completed (time limit reached)';
        this.result = {
          summary: summaryParts.join(' '),
          actions: this.actionsHistory.map(a => a.tool),
          deliverables: {
            documents: createdDocs,
            notes: createdNotes,
            tasks: createdTasks,
            events: createdEvents,
          },
          phase_reached: this.executionPhase,
          phases_completed: completedPhases,
          phases_remaining: remainingPhases,
          remaining_work: remainingWork,
          key_findings: keyFindings,
          evaluation: timeoutEvaluation ? {
            score: timeoutEvaluation.overallScore,
            dimensions: timeoutEvaluation.dimensions,
            issues: timeoutEvaluation.issues,
            strengths: timeoutEvaluation.strengths,
          } : null,
          stats: {
            duration_minutes: elapsedMin,
            total_actions: this.actionsHistory.length,
            successful_actions: successActions.length,
            iterations: this.progress.iterations,
          }
        };
        
        await this.saveTaskHistory();
        await this.persistCompletion(TaskStatus.COMPLETED);
        await sleep(400);
        
        this.streamEvent('task_complete', `✅ ${summaryParts[0]} ${createdDocs.length + createdNotes + createdTasks.length} deliverable(s) created. Quality: ${timeoutEvaluation?.overallScore ?? '?'}/100.`, { 
          actions_count: this.actionsHistory.length,
          evaluation_score: timeoutEvaluation?.overallScore,
          icon: 'check-circle', 
          color: 'green' 
        });
        this.streamProgress();
        await sleep(300);
        
        this.emit('complete', this.getStatus());
        return;
      }

      this.progress.iterations++;
      this.phaseIterationCounts[this.executionPhase]++;
      
      // If totalSteps was never set by think_and_plan, estimate from complexity
      if (!this.progress.totalSteps || this.progress.totalSteps === 0) {
        this.progress.totalSteps = this.estimatedSteps || 15;
      }
      
      this.progress.currentStep = `${this.executionPhase.toUpperCase()}: step ${this.progress.completedSteps || 0} of ${this.progress.totalSteps}`;
      this.emit('progress', this.getStatus());
      
      // ===== DRAIN FOLLOW-UP QUEUE =====
      // Inject any pending follow-up messages BEFORE the API call so the
      // model sees them in the correct chronological position.
      this._drainFollowUpQueue();
      
      // ===== PHASE TRANSITION CHECK =====
      if (this.shouldTransitionPhase()) {
        this.transitionPhase();
      }
      
      // ===== FOCUS GUARD: Periodic goal-drift check =====
      // The supervising partner walks by and asks: "Still working on the assignment?"
      // This catches the agent when it's spending too many iterations on tangential
      // reading or when it's burning through its budget without producing deliverables.
      if (this.focusGuard) {
        try {
          const elapsedMs = Date.now() - this.startTime.getTime();
          const focusCheck = this.focusGuard.checkFocus(
            this.progress.iterations, elapsedMs, this.executionPhase
          );
          if (focusCheck?.needed) {
            this.messages.push({ role: 'user', content: focusCheck.message });
            if (focusCheck.severity === 'critical') {
              console.warn(`[Amplifier] FOCUS INTERVENTION (${focusCheck.severity}): task ${this.id} at iteration ${this.progress.iterations}`);
              this.streamEvent('focus_intervention', `🎯 Focus intervention: agent may be drifting from task`, {
                severity: focusCheck.severity,
                focusScore: this.focusGuard.getFocusScore(),
                tangentStreak: this.focusGuard.tangentStreak,
                icon: 'target',
                color: 'orange'
              });
            } else if (focusCheck.severity === 'budget_urgent') {
              console.log(`[Amplifier] Budget urgent: task ${this.id} at ${Math.round(elapsedMs / 60000)}min`);
              this.streamEvent('budget_alert', `⏰ Budget alert: running low on time`, {
                severity: focusCheck.severity,
                icon: 'clock',
                color: 'red'
              });
            }
          }
        } catch (focusErr) {
          // Focus guard is best-effort — never crash the agent loop
        }
      }
      
      // ===== PERIODIC PLAN RE-INJECTION =====
      // Every N iterations, re-inject the plan so the agent never loses the thread
      if (this.structuredPlan && 
          (this.progress.iterations - this.lastPlanInjectionIteration) >= PLAN_REINJECTION_INTERVAL) {
        const freshPlan = this.buildPlanMessage();
        if (freshPlan) {
          // Remove old plan messages and add fresh one
          this.messages = this.messages.filter(m => !this.isPlanMessage(m));
          // Insert after system message
          const sysIdx = this.messages.findIndex(m => m.role === 'system');
          this.messages.splice(sysIdx + 1, 0, freshPlan);
          this.lastPlanInjectionIteration = this.progress.iterations;
        }
      }
      
      try {
        const phaseConfig = PHASE_CONFIG[this.executionPhase];
        
        console.log(`[Amplifier] Iteration ${this.progress.iterations} [${this.executionPhase}]: calling Azure OpenAI`);
        
        // Stream thinking event with phase context
        const thinkingContext = this.actionsHistory.length === 0 
          ? 'Analyzing task and creating plan...'
          : `[${this.executionPhase.toUpperCase()}] ${phaseConfig.description}`;
        
        this.streamEvent('thought_start', `🧠 ${thinkingContext}`, {
          iteration: this.progress.iterations,
          phase: this.executionPhase,
          actions_so_far: this.actionsHistory.length,
          icon: 'brain',
          color: 'blue'
        });

        this.messages = this.normalizeMessages(this.messages);
        this.compactMessagesIfNeeded();
        
        // ===== ADAPTIVE TOKEN BUDGET =====
        // Use phase-specific token budget, reduce if rate limited heavily
        let tokenBudget = phaseConfig.tokenBudget;
        let temperature = phaseConfig.temperature;
        if (this.rateLimitCount > 3) {
          tokenBudget = Math.max(1500, Math.round(tokenBudget * 0.7));
          console.log(`[Amplifier] Reducing token budget to ${tokenBudget} due to ${this.rateLimitCount} rate limits`);
        }
        
        // Call Azure OpenAI with phase-aware settings
        const response = await callAzureOpenAI(this.messages, tools, {
          temperature: this.options?.temperature ?? temperature,
          max_tokens: this.options?.max_tokens ?? tokenBudget
        });
        const choice = response.choices[0];
        const message = choice.message;
        
        // Reset consecutive error counter on successful API call
        this.consecutiveErrors = 0;
        
        // Add assistant message to history
        this.messages.push(message);
        
        // Check for tool calls (this is what makes it an AGENT)
        if (message.tool_calls && message.tool_calls.length > 0) {
          this.textOnlyStreak = 0; // Reset text-only counter
          
          const toolNames = message.tool_calls.map(tc => tc.function?.name || 'unknown');
          console.log(`[Amplifier] Iteration ${this.progress.iterations}: ${message.tool_calls.length} tool(s) to execute: ${toolNames.join(', ')}`);
          
          // Stream what we're about to do
          this.streamEvent('planning', `📋 Planned ${message.tool_calls.length} action${message.tool_calls.length > 1 ? 's' : ''}: ${toolNames.join(', ')}`, {
            tools_planned: toolNames,
            icon: 'clipboard-list',
            color: 'purple'
          });
          
          // ===== PARSE AND VALIDATE ALL TOOL CALLS =====
          const parsedCalls = [];
          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs = {};
            try {
              toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (parseError) {
              console.error(`[Amplifier] Failed to parse args for ${toolName}:`, toolCall.function.arguments);
              toolArgs = {};
            }
            
            const validationError = this.validateToolArgs(toolName, toolArgs);
            parsedCalls.push({ toolCall, toolName, toolArgs, validationError });
          }
          
          // ===== PARALLEL EXECUTION for read-only tools =====
          // If ALL tool calls are cacheable (read-only), execute them in parallel
          const allReadOnly = parsedCalls.every(c => !c.validationError && this.CACHEABLE_TOOLS.has(c.toolName));
          const TOOL_TIMEOUT_MS = 60000;
          
          if (allReadOnly && parsedCalls.length > 1) {
            console.log(`[Amplifier] Executing ${parsedCalls.length} read-only tools in PARALLEL`);
            this.streamEvent('parallel_exec', `⚡ Running ${parsedCalls.length} tools in parallel`, {
              tools: parsedCalls.map(c => c.toolName), icon: 'zap', color: 'blue'
            });
            
            const parallelResults = await Promise.all(parsedCalls.map(async (pc) => {
              // Check cache first
              let result = this.getCachedResult(pc.toolName, pc.toolArgs);
              if (!result) {
                try {
                  const toolPromise = executeTool(pc.toolName, pc.toolArgs, {
                    userId: this.userId, firmId: this.firmId, user: this.userRecord
                  });
                  result = await Promise.race([
                    toolPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TOOL_TIMEOUT_MS))
                  ]);
                  this.cacheToolResult(pc.toolName, pc.toolArgs, result);
                } catch (err) {
                  result = { error: err?.message || 'Tool execution failed' };
                }
              }
              return { ...pc, result };
            }));
            
            // Process all parallel results
            for (const pr of parallelResults) {
              if (this.cancelled) break;
              const { toolCall: tc, toolName: tn, toolArgs: ta, result: res } = pr;
              const success = res.success !== undefined ? res.success : !res.error;
              
              this.actionsHistory.push({ tool: tn, args: ta, result: res, timestamp: new Date(), success });
              
              // ===== STEP TRACKING (parallel path) =====
              if (success && !['think_and_plan', 'evaluate_progress', 'task_complete', 'log_work'].includes(tn)) {
                this.progress.completedSteps = (this.progress.completedSteps || 0) + 1;
                if (this.progress.completedSteps >= this.progress.totalSteps - 2 && this.executionPhase !== 'review') {
                  this.progress.totalSteps = Math.max(this.progress.totalSteps, this.progress.completedSteps + 5);
                }
                this.progress.currentStep = `Step ${this.progress.completedSteps} of ${this.progress.totalSteps}: ${this.getToolStepLabel(tn, ta)}`;
              }
              
              // ===== REWIND SYSTEM: Record tool call for loop detection (parallel path) =====
              this.rewindManager.recordToolCall(tn, ta, success);
              
              // ===== FOCUS GUARD: Record tool call for goal-drift tracking (parallel path) =====
              try {
                if (this.focusGuard) {
                  this.focusGuard.recordToolCall(tn, ta, success, this.progress.iterations);
                }
              } catch (_) {} // Non-fatal
              
              // ===== DECISION REINFORCER: Real-time learning (parallel path) =====
              try {
                const taskType = this.workType?.id || this.complexity || 'general';
                this.decisionReinforcer.recordOutcome(taskType, tn, success, {
                  timeRatio: 1.0,
                  qualityScore: success ? 0.7 : 0.2,
                });
              } catch (_) {}
              
              if (success && (tn === 'read_document_content' || tn === 'search_document_content')) {
                this.substantiveActions.research++;
                // ===== DOCUMENT LEARNING: Feed access event (parallel path) =====
                try {
                  if (tn === 'read_document_content' && res?.id) {
                    onDocumentAccessed(this.userId, this.firmId, {
                      documentId: res.id,
                      documentName: res.name || 'unknown',
                      documentType: res.document_type || res.type || 'general',
                      accessType: 'read',
                      matterId: ta.matter_id || this.preloadedMatterId || null,
                    });
                  }
                } catch (_) {}
              }
              
              // Add key findings from reads
              if (success && tn === 'get_matter' && res?.matter) {
                this.addKeyFinding(`Matter: ${res.matter.name} (${res.matter.status})`);
                // ===== RECURSIVE SUMMARIZER: Extract key facts (parallel path) =====
                this.agentMemory?.addKeyFact(`Matter: "${res.matter.name}" (ID: ${res.matter?.id || 'unknown'})`);
              }
              if (success && tn === 'read_document_content' && res?.name) {
                this.addKeyFinding(`Read: ${res.name}`);
                this.agentMemory?.addKeyFact(`Document: "${res.name}"`);
                // Progressive context: extract key info from document
                if (res.content) {
                  const preview = res.content.substring(0, 500).replace(/\n+/g, ' ');
                  this.addKeyFinding(`Doc summary (${res.name}): ${preview.substring(0, 200)}...`);
                }
              }
              
              if (success) {
                this.markPlanStepProgress(tn);
                // ===== REWIND SYSTEM: Take checkpoint after success (parallel path) =====
                this.rewindManager.takeCheckpoint(this, `success:${tn}`);
              }
              
              this.messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: this.trimToolResultForMessage(tn, res)
              });
              
              this.streamEvent('tool_end', this.getDetailedCompletionMessage(tn, ta, res, success), {
                tool: tn, success, icon: success ? 'check-circle' : 'x-circle', color: success ? 'green' : 'red'
              });
            }
            
            this.progress.progressPercent = this.calculateProgressPercent();
            this.streamProgress();
            await this.saveCheckpoint('periodic');
            
          } else {
          // ===== SEQUENTIAL EXECUTION (for write tools or mixed batches) =====
          for (const { toolCall, toolName, toolArgs, validationError } of parsedCalls) {
            if (this.cancelled) break;
            
            if (validationError) {
              console.log(`[Amplifier] Validation failed for ${toolName}: ${validationError}`);
              this.messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: validationError, validation_failed: true })
              });
              this.streamEvent('tool_error', `⚠️ ${toolName}: ${validationError.substring(0, 80)}`, {
                tool: toolName, icon: 'alert-triangle', color: 'yellow'
              });
              continue;
            }
            
            console.log(`[Amplifier] Executing tool: ${toolName}`);
            this.progress.currentStep = `[${this.executionPhase.toUpperCase()}] ${this.getToolStepLabel(toolName, toolArgs)}`;
            this.emit('progress', this.getStatus());
            
            const toolDescription = this.getDetailedToolDescription(toolName, toolArgs);
            this.streamEvent('tool_start', toolDescription, { 
              tool: toolName, args: toolArgs, icon: 'tool', color: 'blue'
            });
            this.streamProgress();
            
            // Check cache first
            let result = this.getCachedResult(toolName, toolArgs);
            
            if (result) {
              this.streamEvent('tool_end', `⚡ ${toolName} (cached)`, {
                tool: toolName, success: true, cached: true, icon: 'zap', color: 'green'
              });
            } else {
              try {
                const toolPromise = executeTool(toolName, toolArgs, {
                  userId: this.userId, firmId: this.firmId, user: this.userRecord
                });
                result = await Promise.race([
                  toolPromise,
                  new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool ${toolName} timed out after ${TOOL_TIMEOUT_MS/1000}s`)), TOOL_TIMEOUT_MS))
                ]);
                this.cacheToolResult(toolName, toolArgs, result);
              } catch (toolError) {
                console.error(`[Amplifier] Tool ${toolName} execution failed:`, toolError);
                result = { error: toolError?.message || 'Tool execution failed' };
                this.streamEvent('tool_error', `❌ Error in ${toolName}: ${toolError?.message}`, {
                  tool: toolName, icon: 'x-circle', color: 'red'
                });
              }
            }
            
            const toolSuccess = result.success !== undefined ? result.success : !result.error;
            console.log(`[Amplifier] Tool ${toolName} result:`, toolSuccess ? 'success' : 'failed');
            
            // Stream tool completion event with detailed result
            const completionMessage = this.getDetailedCompletionMessage(toolName, toolArgs, result, toolSuccess);
            this.streamEvent('tool_end', completionMessage, {
              tool: toolName,
              success: toolSuccess,
              icon: toolSuccess ? 'check-circle' : 'x-circle',
              color: toolSuccess ? 'green' : 'red',
              result_preview: result.message || (toolSuccess ? 'Success' : 'Failed')
            });
            
            // Track action in history
            this.actionsHistory.push({
              tool: toolName,
              args: toolArgs,
              result: result,
              timestamp: new Date(),
              success: toolSuccess
            });
            
            // ===== STEP TRACKING: Increment completedSteps on successful tool calls =====
            // Meta tools (think_and_plan, evaluate_progress, task_complete) don't count as steps.
            // Only real work tools count so the step counter reflects actual progress.
            if (toolSuccess && !['think_and_plan', 'evaluate_progress', 'task_complete', 'log_work'].includes(toolName)) {
              this.progress.completedSteps = (this.progress.completedSteps || 0) + 1;
              
              // Dynamically adjust totalSteps if we're approaching the estimate
              if (this.progress.completedSteps >= this.progress.totalSteps - 2 && this.executionPhase !== 'review') {
                // We're not done yet but approaching the estimate — extend it
                this.progress.totalSteps = Math.max(this.progress.totalSteps, this.progress.completedSteps + 5);
              }
              
              // Update the step label with the actual tool description
              this.progress.currentStep = `Step ${this.progress.completedSteps} of ${this.progress.totalSteps}: ${this.getToolStepLabel(toolName, toolArgs)}`;
            }
            
            // ===== REWIND SYSTEM: Record tool call for loop detection =====
            this.rewindManager.recordToolCall(toolName, toolArgs, toolSuccess);
            
            // ===== FOCUS GUARD: Record tool call for goal-drift tracking =====
            try {
              if (this.focusGuard) {
                this.focusGuard.recordToolCall(toolName, toolArgs, toolSuccess, this.progress.iterations);
              }
            } catch (_) {} // Non-fatal: focus guard is best-effort
            
            // ===== DECISION REINFORCER: Real-time learning from tool outcome =====
            try {
              const taskType = this.workType?.id || this.complexity || 'general';
              this.decisionReinforcer.recordOutcome(taskType, toolName, toolSuccess, {
                timeRatio: 1.0, // Could track actual vs expected per tool
                qualityScore: toolSuccess ? 0.7 : 0.2,
              });
              // Also learn decision rules: "in this phase, using this tool" → outcome
              this.decisionReinforcer.learnDecisionRule(
                { phase: this.executionPhase, taskType, iteration: this.progress.iterations },
                toolName,
                { success: toolSuccess }
              );
            } catch (reinforcerError) {
              // Non-fatal: reinforcer is best-effort
            }
            
            // Track substantive actions for quality assurance
            if (toolSuccess) {
              if (toolName === 'add_matter_note' || toolName === 'create_note') {
                this.substantiveActions.notes++;
              } else if (toolName === 'create_document' || toolName === 'draft_legal_document') {
                this.substantiveActions.documents++;
              } else if (toolName === 'create_task') {
                this.substantiveActions.tasks++;
              } else if (toolName === 'create_calendar_event') {
                this.substantiveActions.events++;
              } else if (toolName === 'read_document_content' || toolName === 'search_document_content') {
                this.substantiveActions.research++;
                // ===== DOCUMENT LEARNING: Feed access event so profile learns =====
                try {
                  if (toolName === 'read_document_content' && result?.id) {
                    onDocumentAccessed(this.userId, this.firmId, {
                      documentId: result.id,
                      documentName: result.name || 'unknown',
                      documentType: result.document_type || result.type || 'general',
                      accessType: 'read',
                      matterId: toolArgs.matter_id || this.preloadedMatterId || null,
                    });
                  }
                } catch (docLearnErr) {
                  // Non-fatal: document learning is best-effort
                }
              }
              
              // ===== MATTER VERIFICATION TRACKING =====
              // When the agent successfully reads matter details, mark the matter as verified.
              // This unlocks the write-tool guardrail for that matter ID.
              if (BackgroundTask.MATTER_READ_TOOLS.has(toolName)) {
                // Extract matter ID from the result depending on which tool was used
                let verifiedMatterId = null;
                if (toolName === 'get_matter') {
                  // get_matter result may have matter at top level (from aiAgent.js) 
                  // or nested under .matter (from warm cache)
                  verifiedMatterId = result?.matter?.id || result?.id || null;
                } else if (toolName === 'search_matters' && result?.matters?.length === 1) {
                  // Only auto-verify if search returned exactly one result (unambiguous)
                  verifiedMatterId = result.matters[0].id;
                } else if (toolName === 'list_documents' && toolArgs.matter_id) {
                  // Reading docs for a matter implies the agent has identified it
                  verifiedMatterId = toolArgs.matter_id;
                } else if (toolName === 'read_document_content' && result?.matter_id) {
                  verifiedMatterId = result.matter_id;
                } else if (toolName === 'get_matter_documents_content' && toolArgs.matter_id) {
                  verifiedMatterId = toolArgs.matter_id;
                }
                
                if (verifiedMatterId) {
                  this.markMatterVerified(verifiedMatterId);
                }
              }
            } else {
              // Track failed tools to avoid repeating
              const failCount = this.failedTools.get(toolName) || 0;
              this.failedTools.set(toolName, failCount + 1);
            }
            
            // Update progress and push to UI
            this.progress.progressPercent = this.calculateProgressPercent();
            this.streamProgress();
            
            // Add TRIMMED tool result to messages (prevents context window bloat)
            this.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: this.trimToolResultForMessage(toolName, result)
            });

            this.recentTools.push(toolName);
            if (this.recentTools.length > 8) this.recentTools.shift();
            
            // If a tool has failed 3+ times, add guidance to avoid it
            if (this.failedTools.get(toolName) >= 3) {
              this.messages.push({
                role: 'user',
                content: `Note: The tool "${toolName}" has failed multiple times. Try an alternative approach or skip this step if possible.`
              });
            }
            
            // Check for explicit task completion
            if (toolName === 'task_complete') {
              // QUALITY GATE: Enforce minimum work requirements
              // Uses BOTH generic minimums AND work-type-specific requirements
              const elapsedSeconds = (Date.now() - this.startTime.getTime()) / 1000;
              const actionCount = this.actionsHistory.length;
              const substantiveActions = this.actionsHistory.filter(a => 
                ['create_document', 'create_note', 'add_matter_note', 'create_task', 
                 'create_calendar_event', 'update_matter', 'draft_email_for_matter',
                 'search_case_law', 'summarize_document'].includes(a.tool)
              ).length;
              
              // Check for specific required actions
              const hasNote = this.actionsHistory.some(a => a.tool === 'add_matter_note' && a.success !== false);
              const hasTask = this.actionsHistory.some(a => a.tool === 'create_task' && a.success !== false);
              const hasDocument = this.actionsHistory.some(a => a.tool === 'create_document' && a.success !== false);
              const hasMatterRead = this.actionsHistory.some(a => a.tool === 'get_matter' && a.success !== false);
              const hasDocRead = this.actionsHistory.some(a => 
                (a.tool === 'read_document_content' || a.tool === 'find_and_read_document') && a.success !== false
              );
              const hasConflictCheck = this.actionsHistory.some(a => a.tool === 'check_conflicts' && a.success !== false);
              const hasTimeCheck = this.actionsHistory.some(a => 
                ['get_my_time_entries', 'list_invoices', 'generate_report', 'get_firm_analytics'].includes(a.tool) && a.success !== false
              );
              const hasSelfReview = this.actionsHistory.some(a => a.tool === 'review_created_documents' && a.success !== false);
              
              // Generic minimums (may be overridden by rejection learning)
              const MIN_SECONDS = 120;
              const MIN_ACTIONS = Math.max(8, this.qualityOverrides?.minActions || 0);
              const MIN_SUBSTANTIVE = Math.max(3, this.qualityOverrides?.minActions ? Math.ceil(this.qualityOverrides.minActions * 0.6) : 0);
              
              // Build missing requirements message
              const missing = [];
              if (elapsedSeconds < MIN_SECONDS) missing.push(`Time: ${elapsedSeconds.toFixed(0)}s / ${MIN_SECONDS}s minimum`);
              if (actionCount < MIN_ACTIONS) missing.push(`Actions: ${actionCount} / ${MIN_ACTIONS} minimum`);
              if (substantiveActions < MIN_SUBSTANTIVE) missing.push(`Substantive work: ${substantiveActions} / ${MIN_SUBSTANTIVE} minimum`);
              if (!hasNote) missing.push('MISSING: You must add at least 1 note using add_matter_note');
              if (!hasTask) missing.push('MISSING: You must create at least 1 task using create_task');
              
              // ===== ENFORCE REVIEW PHASE =====
              // The agent MUST reach the REVIEW phase before completing.
              // This prevents skipping the self-review step that catches quality issues.
              if (this.executionPhase !== ExecutionPhase.REVIEW) {
                missing.push(`MISSING: You are still in ${this.executionPhase.toUpperCase()} phase. You MUST reach the REVIEW phase before completing. Continue working through your phases.`);
              }
              
              // ===== ENFORCE SELF-REVIEW (review_created_documents) =====
              // If the agent created documents or notes, it MUST call review_created_documents
              // to re-read its own work product and verify quality before completing.
              // This closes the blind spot where the agent never verifies what it actually saved.
              if ((hasDocument || this.substantiveActions.notes >= 1) && !hasSelfReview) {
                missing.push('MISSING: You created documents/notes but did NOT call review_created_documents. You MUST review your own work product before completing. Call review_created_documents NOW to verify quality.');
              }
              
              // ===== ENFORCE CITATION INTEGRITY =====
              // If review_created_documents found citation issues, block completion until addressed.
              // Check the most recent review_created_documents result for unresolved issues.
              const lastReview = this.actionsHistory
                .filter(a => a.tool === 'review_created_documents' && a.success !== false)
                .slice(-1)[0];
              if (lastReview?.result) {
                const reviewResult = lastReview.result;
                const allItems = [...(reviewResult.documents || []), ...(reviewResult.notes || [])];
                const citationIssues = allItems
                  .flatMap(item => (item.issues || []))
                  .filter(issue => issue.toLowerCase().includes('citation'));
                
                // Only block if there are citation issues AND no subsequent document fix
                if (citationIssues.length > 0) {
                  const reviewTimestamp = lastReview.timestamp ? new Date(lastReview.timestamp).getTime() : 0;
                  const fixedAfterReview = this.actionsHistory.some(a => 
                    (a.tool === 'create_document' || a.tool === 'add_matter_note') && 
                    a.success !== false &&
                    new Date(a.timestamp).getTime() > reviewTimestamp
                  );
                  if (!fixedAfterReview) {
                    missing.push(`CITATION INTEGRITY: Your self-review found ${citationIssues.length} citation issue(s): ${citationIssues.slice(0, 2).join('; ')}. You must either mark citations as [UNVERIFIED - VERIFY BEFORE FILING], remove them, or recreate the document with corrected citations before completing.`);
                  }
                }
              }
              
              // ===== WORK-TYPE-SPECIFIC REQUIREMENTS =====
              // Import the requirements for the detected work type
              const workTypeId = this.workType?.id || 'general';
              const WT_REQS = {
                matter_review: () => {
                  if (!hasMatterRead) missing.push('MISSING (matter_review): Must read the matter first with get_matter');
                  if (!hasDocRead && this.substantiveActions.research < 2) missing.push('MISSING (matter_review): Should read documents or search for data');
                },
                document_drafting: () => {
                  if (!hasMatterRead) missing.push('MISSING (document_drafting): Must read the matter before drafting');
                  if (!hasDocument) missing.push('MISSING (document_drafting): Must create at least 1 document with create_document');
                  // Check document content length
                  const docs = this.actionsHistory.filter(a => a.tool === 'create_document' && a.success !== false);
                  const maxLen = Math.max(0, ...docs.map(d => (d.args?.content || '').length));
                  if (maxLen < 500 && docs.length > 0) missing.push(`MISSING (document_drafting): Document too short (${maxLen} chars). Need 500+ chars of real content.`);
                },
                legal_research: () => {
                  if (!hasMatterRead) missing.push('MISSING (legal_research): Must read the matter for context');
                  if (!hasDocument) missing.push('MISSING (legal_research): Must create a research memo with create_document');
                },
                client_communication: () => {
                  if (!hasMatterRead) missing.push('MISSING (client_communication): Must read the matter before drafting communication');
                  if (!hasDocument) missing.push('MISSING (client_communication): Must draft the communication with create_document');
                },
                intake_setup: () => {
                  if (!hasMatterRead) missing.push('MISSING (intake): Must read the matter');
                  if (!hasConflictCheck) missing.push('MISSING (intake): Must run check_conflicts for new matter intake');
                  if (this.substantiveActions.tasks < 3) missing.push(`MISSING (intake): Need at least 3 intake tasks, created ${this.substantiveActions.tasks}`);
                },
                billing_review: () => {
                  if (!hasTimeCheck) missing.push('MISSING (billing_review): Must check time entries/invoices with get_my_time_entries or list_invoices');
                },
                deadline_management: () => {
                  if (!hasMatterRead) missing.push('MISSING (deadline_management): Must read matters to check deadlines');
                  if (this.substantiveActions.events < 1) missing.push('MISSING (deadline_management): Must create or verify calendar events');
                },
              };
              
              if (WT_REQS[workTypeId]) {
                WT_REQS[workTypeId]();
              }
              
              // ===== HARNESS INTELLIGENCE: Rejection-learned required tools =====
              if (this.qualityOverrides?.requiredTools?.length > 0) {
                for (const req of this.qualityOverrides.requiredTools) {
                  const toolCalled = this.actionsHistory.some(a => a.tool === req.tool && a.success !== false);
                  if (!toolCalled && req.must_call) {
                    missing.push(`REQUIRED (learned from feedback): Must call ${req.tool}. Previous work was rejected because this step was skipped.`);
                  }
                  if (req.min_calls) {
                    const callCount = this.actionsHistory.filter(a => a.tool === req.tool && a.success !== false).length;
                    if (callCount < req.min_calls) {
                      missing.push(`REQUIRED (learned from feedback): Must call ${req.tool} at least ${req.min_calls} times (called ${callCount}).`);
                    }
                  }
                }
              }
              
              // ===== HARNESS INTELLIGENCE: Minimum document length from rejection learning =====
              if (this.qualityOverrides?.minDocumentLength && hasDocument) {
                const docs = this.actionsHistory.filter(a => a.tool === 'create_document' && a.success !== false);
                const maxLen = Math.max(0, ...docs.map(d => (d.args?.content || '').length));
                if (maxLen < this.qualityOverrides.minDocumentLength) {
                  missing.push(`REQUIRED (learned from feedback): Document must be at least ${this.qualityOverrides.minDocumentLength} chars (current: ${maxLen}). Previous work was rejected as too short.`);
                }
              }
              
              if (missing.length > 0) {
                console.log(`[Amplifier] Task ${this.id} attempted early completion [${workTypeId}]: ${elapsedSeconds.toFixed(0)}s, ${actionCount} actions, ${substantiveActions} substantive, hasNote=${hasNote}, hasTask=${hasTask}, hasMatterRead=${hasMatterRead}`);
                
                // Reject early completion - push message to continue
                this.messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    rejected: true,
                    reason: `Task completion rejected. Requirements not met for "${workTypeId}" work:
${missing.map(m => '- ' + m).join('\n')}

You MUST address the items above before completing. This is a "${workTypeId}" task.
Keep working on: "${this.goal}"`
                  })
                });
                
                // Don't mark complete - continue the loop
                continue;
              }
              
              console.log(`[Amplifier] Task ${this.id} passed quality gates [${workTypeId}] (${elapsedSeconds.toFixed(0)}s, ${actionCount} actions, ${substantiveActions} substantive)`);
              
              // ===== POST-TASK SELF-EVALUATION (Generator-Critic pattern) =====
              this.progress.progressPercent = 92;
              this.progress.currentStep = 'Self-evaluating work quality...';
              this.streamEvent('evaluating', '🔍 Running self-evaluation on work product...', {
                icon: 'search', color: 'purple'
              });
              this.streamProgress();
              
              const evaluation = await evaluateTask(this);
              await storeEvaluation(this.id, evaluation);
              
              // If evaluation says revision needed AND we have time, go back for fixes
              const timeLeftMs = this.maxRuntimeMs - (Date.now() - this.startTime.getTime());
              this._revisionAttempts = (this._revisionAttempts || 0);
              if (evaluation.revisionNeeded && timeLeftMs > 60000 && this._revisionAttempts < 3) {
                this._revisionAttempts++; // Allow up to 3 revision passes (up from 1)
                console.log(`[Amplifier] Task ${this.id} needs revision (score: ${evaluation.overallScore}/100)`);
                
                this.streamEvent('revision', `⚠️ Self-evaluation score: ${evaluation.overallScore}/100 - revising...`, {
                  score: evaluation.overallScore, icon: 'edit', color: 'yellow'
                });
                
                // Inject evaluation feedback and continue the loop
                this.messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    rejected: true,
                    reason: `Self-evaluation scored ${evaluation.overallScore}/100. ${formatEvaluationForAgent(evaluation)}\n\nFix the issues listed above, then call task_complete again.`
                  })
                });
                continue; // Go back to the agent loop for revision
              }
              
              console.log(`[Amplifier] Task ${this.id} passed evaluation (score: ${evaluation.overallScore}/100)`);
              
              // ===== UPDATE LAWYER PROFILE (learn from this task) =====
              try {
                await updateProfileAfterTask(this.userId, this.firmId, this);
              } catch (profileError) {
                console.log('[Amplifier] Profile update note:', profileError.message);
              }
              
              // ===== USER AI MEMORY FILE: Learn from this completed task =====
              try {
                await memoryLearnFromTask(this.userId, this.firmId, {
                  goal: this.goal,
                  feedback_rating: this.feedbackRating || toolArgs?.feedback_rating,
                  feedback_text: this.feedbackText || toolArgs?.feedback_text,
                });
                // Also update active context with what they're working on
                if (this.preloadedMatterName) {
                  await updateActiveContext(this.userId, this.firmId, 
                    `Recently worked on matter: "${this.preloadedMatterName}" - task: ${this.goal.substring(0, 100)}`
                  );
                }
              } catch (memError) {
                console.log('[Amplifier] Memory file update note:', memError.message);
              }
              
              // ===== HARNESS INTELLIGENCE: Store per-matter memory =====
              if (this.preloadedMatterId) {
                try {
                  const memories = extractMemoriesFromTask(this);
                  if (memories.length > 0) {
                    await storeMatterMemories(this.firmId, this.preloadedMatterId, this.id, memories);
                    console.log(`[Amplifier] Stored ${memories.length} memories for matter "${this.preloadedMatterName}"`);
                  }
                } catch (memError) {
                  console.log('[Amplifier] Matter memory storage note:', memError.message);
                }
              }
              
              // ===== HARNESS INTELLIGENCE: Record proven tool chain =====
              try {
                const successfulTools = this.actionsHistory
                  .filter(a => a.success !== false)
                  .map(a => a.tool);
                await recordToolChain(
                  this.firmId, workTypeId, successfulTools,
                  evaluation?.overallScore || null,
                  Math.round(elapsedSeconds)
                );
              } catch (chainError) {
                console.log('[Amplifier] Tool chain recording note:', chainError.message);
              }
              
              // ===== HARNESS INTELLIGENCE: Record override success =====
              if (this.qualityOverrides?.promptModifiers?.length > 0) {
                try {
                  await recordOverrideSuccess(this.userId, this.firmId, workTypeId);
                } catch (_) {}
              }
              
              // ===== HARNESS INTELLIGENCE: Calculate confidence report =====
              let confidenceReport = null;
              try {
                confidenceReport = calculateConfidenceReport(this);
                console.log(`[Amplifier] Confidence report: overall ${confidenceReport.overallConfidence}%, review guidance: "${confidenceReport.reviewGuidance}"`);
              } catch (confError) {
                console.log('[Amplifier] Confidence report note:', confError.message);
              }
              
              // ===== COGNITIVE IMPRINTING: Track agent-created documents for edit diff learning =====
              try {
                const createdDocs = this.actionsHistory.filter(a => a.tool === 'create_document' && a.success !== false);
                for (const doc of createdDocs) {
                  if (doc.result?.id && doc.args?.content) {
                    await trackAgentCreatedDocument(
                      doc.result.id, this.userId, this.firmId,
                      doc.args.content, this.id, workTypeId
                    );
                  }
                }
                if (createdDocs.length > 0) {
                  console.log(`[Amplifier] Tracked ${createdDocs.length} agent-created documents for edit diff learning`);
                }
              } catch (editTrackErr) {
                console.log('[Amplifier] Edit diff tracking note:', editTrackErr.message);
              }
              
              // ===== COGNITIVE IMPRINTING: Extract associative memory edges =====
              try {
                const matterType = this.preloadedMatterType || null;
                const assocEdges = await extractAssociations(
                  this.userId, this.firmId, this.id,
                  this.actionsHistory, workTypeId, matterType
                );
                if (assocEdges.length > 0) {
                  console.log(`[Amplifier] Extracted ${assocEdges.length} associative memory edges`);
                }
              } catch (assocErr) {
                console.log('[Amplifier] Associative memory note:', assocErr.message);
              }
              
              // ===== COGNITIVE IMPRINTING: Propagate task_complete through resonance graph =====
              try {
                if (this.resonanceGraph?.loaded) {
                  this.resonanceGraph.processEvent('task_complete', { workType: workTypeId });
                  await this.resonanceGraph.persist();
                  console.log('[Amplifier] Resonance graph updated for task completion');
                }
              } catch (resErr) {
                console.log('[Amplifier] Resonance propagation note:', resErr.message);
              }
              
              // SMOOTH COMPLETION SEQUENCE
              this.progress.progressPercent = 95;
              this.progress.currentStep = 'Wrapping up...';
              this.streamEvent('finishing', '🎯 Finalizing work product...', {
                icon: 'loader',
                color: 'purple'
              });
              this.streamProgress();
              await sleep(800);
              
              // Step 2: Show saving (97%)
              this.progress.progressPercent = 97;
              this.progress.currentStep = 'Saving results...';
              this.streamEvent('saving', '💾 Saving task results...', {
                icon: 'save',
                color: 'blue'
              });
              this.streamProgress();
              
              // Step 3: Show complete (100%)
              this.status = TaskStatus.COMPLETED;
              this.progress.progressPercent = 100;
              this.progress.currentStep = 'Completed successfully';
              this.endTime = new Date();
              
              // Calculate efficiency metrics for the completed task
              const focusStatus = this.focusGuard ? this.focusGuard.getStatus() : null;
              const efficiencyMetrics = {
                duration_seconds: elapsedSeconds,
                total_actions: actionCount,
                substantive_actions: substantiveActions,
                total_iterations: this.progress.iterations,
                iterations_per_action: actionCount > 0 ? Math.round((this.progress.iterations / actionCount) * 100) / 100 : 0,
                actions_per_minute: elapsedSeconds > 60 ? Math.round((actionCount / (elapsedSeconds / 60)) * 10) / 10 : actionCount,
                matter_preloaded: !!this.preloadedMatterId,
                cache_entries: this.toolCache.size,
                rate_limits_hit: this.rateLimitCount,
                phases_completed: Object.entries(this.phaseIterationCounts).filter(([_, c]) => c > 0).map(([p]) => p),
                focus_score: focusStatus?.overallFocusScore ?? null,
                focus_interventions: focusStatus?.interventionCount ?? 0,
              };
              
              console.log(`[Amplifier] Task ${this.id} EFFICIENCY REPORT:`,
                `Duration: ${Math.round(elapsedSeconds)}s |`,
                `Iterations: ${this.progress.iterations} |`,
                `Actions: ${actionCount} |`,
                `Iter/Action: ${efficiencyMetrics.iterations_per_action} |`,
                `Actions/min: ${efficiencyMetrics.actions_per_minute} |`,
                `Cache entries: ${this.toolCache.size} |`,
                `Matter pre-loaded: ${!!this.preloadedMatterId} |`,
                `Rate limits: ${this.rateLimitCount} |`,
                `Focus score: ${focusStatus?.overallFocusScore ?? 'N/A'} |`,
                `Focus interventions: ${focusStatus?.interventionCount ?? 0}`
              );
              
              this.result = {
                summary: toolArgs.summary || 'Task completed',
                actions: toolArgs.actions_taken || this.actionsHistory.map(a => a.tool),
                recommendations: toolArgs.recommendations || [],
                stats: efficiencyMetrics,
                confidence: confidenceReport ? formatConfidenceForReview(confidenceReport) : null,
                evaluation: evaluation ? {
                  score: evaluation.overallScore,
                  dimensions: evaluation.dimensions,
                  issues: evaluation.issues,
                  strengths: evaluation.strengths,
                } : null,
              };
              
              // Save to history and extract learnings (endTime must be set first)
              await this.saveTaskHistory();
              await this.persistCompletion(TaskStatus.COMPLETED);
              await sleep(500);
              
              // Stream completion event to Glass Cockpit UI
              this.streamEvent('task_complete', `✅ ${toolArgs.summary || 'Task completed successfully'}`, {
                actions_count: actionCount,
                duration_seconds: elapsedSeconds,
                summary: toolArgs.summary,
                icon: 'check-circle',
                color: 'green'
              });
              this.streamProgress();
              
              // Small delay so UI can show the completion state
              await sleep(300);
              
              this.emit('complete', this.getStatus());
              return;
            }
            
            // Update structured plan and progress based on tool results
            if (toolName === 'think_and_plan') {
              this.plan = toolArgs;
              this.updateStructuredPlan(toolArgs);
              this.progress.totalSteps = (toolArgs.steps || []).length;
            }
            
            // Track key findings from info-gathering tools
            if (toolSuccess && toolName === 'get_matter' && result?.matter) {
              this.addKeyFinding(`Matter: ${result.matter.name} (${result.matter.status}, type: ${result.matter.type || 'general'})`);
            }
            if (toolSuccess && toolName === 'read_document_content' && result?.name) {
              this.addKeyFinding(`Read doc: ${result.name} (${result.truncated ? 'partial' : 'full'})`);
            }
            if (toolSuccess && toolName === 'search_document_content' && result?.results) {
              this.addKeyFinding(`Search "${toolArgs.search_term}": ${result.results.length} results`);
            }
            
            // Mark plan steps as done
            if (toolSuccess) {
              this.markPlanStepProgress(toolName);
              
              // ===== REWIND SYSTEM: Take checkpoint after successful tool =====
              this.rewindManager.takeCheckpoint(this, `success:${toolName}`);
              
              // ===== RECURSIVE SUMMARIZATION: Extract key facts for long-term memory =====
              if (toolName === 'get_matter' && result?.matter?.name) {
                this.agentMemory.addKeyFact(`Matter: "${result.matter.name}" (ID: ${result.matter?.id || 'unknown'})`);
              }
              if (toolName === 'read_document_content' && result?.name) {
                this.agentMemory.addKeyFact(`Document: "${result.name}"`);
              }
              if (toolName === 'list_my_matters' && result?.matters?.length) {
                this.agentMemory.addKeyFact(`Found ${result.matters.length} matters`);
              }
            }
            
            if (toolName === 'evaluate_progress') {
              const completed = (toolArgs.completed_steps || []).length;
              const total = completed + (toolArgs.remaining_steps || []).length;
              if (total > 0) {
                this.progress.completedSteps = completed;
                this.progress.progressPercent = Math.min(90, Math.round(15 + (75 * completed / total)));
              }
              if (toolArgs.remaining_steps && toolArgs.remaining_steps.length > 0) {
                this.progress.currentStep = `Next: ${toolArgs.remaining_steps[0]}`;
              }
            }
            
            if (toolName === 'log_work') {
              // Increment progress for each logged work item
              this.progress.progressPercent = Math.min(90, Math.round(this.progress.progressPercent + 5));
              if (this.progress.totalSteps > 0) {
                this.progress.completedSteps = Math.min(
                  this.progress.totalSteps,
                  (this.progress.completedSteps || 0) + 1
                );
              }
              if (toolArgs.next_step) {
                this.progress.currentStep = toolArgs.next_step;
              }
            }

            if (this.recentTools.length === 8 && this.recentTools.every(t => t === toolName)) {
              this.messages.push({
                role: 'user',
                content: `You have used ${toolName} repeatedly without progress. Try a different tool or a new approach to complete: "${this.goal}".`
              });
            }

            await this.saveCheckpoint('periodic');
            
            // ===== REWIND SYSTEM: Detect loops and rewind if needed =====
            const loopDetected = this.rewindManager.detectLoop(this);
            if (loopDetected) {
              console.warn(`[Amplifier] Loop detected in task ${this.id}: ${loopDetected.type} - ${loopDetected.details.message}`);
              this.streamEvent('loop_detected', `🔄 Loop detected: ${loopDetected.details.message}. Attempting rewind...`, {
                loop_type: loopDetected.type,
                icon: 'rotate-ccw',
                color: 'orange'
              });
              
              const rewindResult = this.rewindManager.rewind(this, loopDetected);
              if (rewindResult.success) {
                this.agentMemory.addFailedPath(loopDetected.details.message);
                this.agentMemory.addConstraint(`Do not repeat the approach that caused: ${loopDetected.details.message}`);
                
                this.streamEvent('rewind_success', `⏪ Rewound to checkpoint (iteration ${rewindResult.checkpoint.iteration}). Trying different approach...`, {
                  rewind_number: this.rewindManager.rewindCount,
                  icon: 'rotate-ccw',
                  color: 'blue'
                });
                
                // Break out of the tool execution loop to restart from the rewound state
                break;
              } else {
                console.warn(`[Amplifier] Rewind failed: ${rewindResult.message}`);
                this.streamEvent('rewind_failed', `⚠️ Could not rewind: ${rewindResult.message}`, {
                  icon: 'alert-triangle',
                  color: 'yellow'
                });
              }
            }
          }
          } // end else (sequential execution)
        } else {
          // No tool calls - AI just responded with text
          this.textOnlyStreak++;
          console.log(`[Amplifier] Iteration ${this.progress.iterations}: text-only response (streak: ${this.textOnlyStreak})`);
          
          // ===== REWIND SYSTEM: Record text response for loop detection =====
          this.rewindManager.recordTextResponse(message.content || '');
          
          const responsePreview = message.content ? message.content.substring(0, 80) : '';
          this.streamEvent('thought_response', `💭 "${responsePreview}${responsePreview.length >= 80 ? '...' : ''}"`, {
            iteration: this.progress.iterations,
            icon: 'message-square',
            color: 'gray'
          });
          
          // ===== AGGRESSIVE TEXT-ONLY RECOVERY =====
          // The model is drifting - snap it back to tool usage
          
          if (choice.finish_reason === 'stop' && this.actionsHistory.length > 0 && this.executionPhase === ExecutionPhase.REVIEW) {
            // In REVIEW phase with work done - allow completion
            console.log(`[Amplifier] Task ${this.id} completing from REVIEW phase`);
            
            this.progress.progressPercent = 95;
            this.progress.currentStep = 'Wrapping up...';
            this.streamEvent('finishing', '🎯 Finalizing...', { icon: 'loader', color: 'purple' });
            this.streamProgress();
            await sleep(600);
            
            this.status = TaskStatus.COMPLETED;
            this.progress.progressPercent = 100;
            this.progress.currentStep = 'Completed';
            this.result = {
              summary: message.content || `Completed: ${this.goal}`,
              actions: this.actionsHistory.map(a => a.tool)
            };
            this.endTime = new Date();
            
            await this.saveTaskHistory();
            await this.persistCompletion(TaskStatus.COMPLETED);
            
            this.streamEvent('task_complete', `✅ Task completed`, { 
              actions_count: this.actionsHistory.length,
              icon: 'check-circle', 
              color: 'green' 
            });
            this.streamProgress();
            await sleep(300);
            
            this.emit('complete', this.getStatus());
            return;
          }
          
          // Text-only streak handling - TIGHTENED escalating intervention
          // The key insight: every text-only response wastes an iteration and produces nothing.
          // Rewind EARLIER (at streak 5 instead of 9+) and fail SOONER (at streak 8 instead of 12+).
          if (this.textOnlyStreak <= MAX_TEXT_ONLY_STREAK) {
            // Mild re-prompt (streaks 1-2) — goal-anchored via FocusGuard
            const reprompt = this.focusGuard
              ? this.focusGuard.buildFocusedReprompt(this.executionPhase, this.textOnlyStreak)
              : `STOP writing text. You MUST call a tool NOW. Your goal: "${this.goal}"`;
            this.messages.push({
              role: 'user',
              content: reprompt
            });
          } else if (this.textOnlyStreak <= MAX_TEXT_ONLY_STREAK + 2) {
            // Strong intervention at streak 4-5 - re-inject plan and force tool use
            console.warn(`[Amplifier] Text-only streak ${this.textOnlyStreak} - forcing plan re-injection`);
            const planMsg = this.buildPlanMessage();
            if (planMsg) {
              this.messages.push(planMsg);
            }
            this.messages.push({
              role: 'user',
              content: `⚠️ CRITICAL: You have responded ${this.textOnlyStreak} times without calling any tool. This is UNACCEPTABLE. You are a tool-calling agent. Your assigned task is: "${this.goal}". Call think_and_plan RIGHT NOW to refocus on this task, then call action tools immediately. DO NOT RESPOND WITH TEXT.`
            });
          } else if (this.textOnlyStreak <= MAX_TEXT_ONLY_STREAK + 4) {
            // Rewind attempt at streak 5-7 (earlier than before)
            console.warn(`[Amplifier] Text-only streak ${this.textOnlyStreak} - attempting rewind recovery`);
            if (this.rewindManager.getStatus().canRewind) {
              const rewindResult = this.rewindManager.rewind(this, `Text-only streak: ${this.textOnlyStreak}`);
              if (rewindResult.success) {
                this.textOnlyStreak = 0; // Reset after rewind
                this.agentMemory.addFailedPath(`Text-only loop at iteration ${this.progress.iterations}`);
                this.agentMemory.addConstraint('You MUST call tools. Do NOT respond with text only.');
                this.streamEvent('rewind_success', `⏪ Recovered from text loop via rewind`, {
                  icon: 'rotate-ccw', color: 'blue'
                });
                continue;
              }
            }
            // If rewind failed, try one more aggressive push
            this.messages.push({
              role: 'user',
              content: `FINAL WARNING: Call a tool NOW or the task will fail. You MUST use tools. Call think_and_plan if stuck. Goal: "${this.goal}"`
            });
          } else {
            // Terminal failure at streak 8 (tightened from 12+)
            console.error(`[Amplifier] Task ${this.id} failed: ${this.textOnlyStreak} consecutive text-only responses`);
            this.status = TaskStatus.FAILED;
            this.error = `Agent stopped using tools after ${this.textOnlyStreak} text-only responses.`;
            this.endTime = new Date();
            await this.saveTaskHistory();
            await this.persistCompletion(TaskStatus.FAILED);
            this.emit('error', new Error(this.error));
            return;
          }
        }
        
        // Gradual progress update
        if (this.progress.progressPercent < 90) {
          const increment = Math.max(1, Math.round(60 / Math.max(1, MAX_ITERATIONS)));
          this.progress.progressPercent = Math.min(90, Math.round(this.progress.progressPercent + increment));
        }

        await this.saveCheckpoint('periodic');
        
      } catch (error) {
        console.error(`[Amplifier] Iteration ${this.progress.iterations} error:`, error);

        const rateLimitMatch = typeof error.message === 'string'
          ? error.message.match(/retry after (\d+)\s*seconds/i)
          : null;
        if (error.message?.includes('RateLimitReached') || error.message?.includes('rate limit') || rateLimitMatch) {
          const retryAfterMs = rateLimitMatch ? Number.parseInt(rateLimitMatch[1], 10) * 1000 : 30000;
          const safeDelay = Number.isFinite(retryAfterMs) ? Math.max(5000, retryAfterMs) : 30000;
          const waitSeconds = Math.round(safeDelay / 1000);
          
          // ===== RATE LIMIT TRACKING =====
          this.rateLimitWaitMs += safeDelay;
          this.rateLimitCount++;
          const totalRLWaitSec = Math.round(this.rateLimitWaitMs / 1000);
          console.warn(`[Amplifier] Rate limit #${this.rateLimitCount}, total wait: ${totalRLWaitSec}s`);
          
          this.progress.currentStep = `Rate limited - retrying in ${waitSeconds}s (total waits: ${totalRLWaitSec}s)`;
          
          this.streamEvent('rate_limit', `⏳ Rate limited - waiting ${waitSeconds}s (${this.rateLimitCount} total)`, {
            wait_seconds: waitSeconds,
            total_rate_limits: this.rateLimitCount,
            icon: 'clock',
            color: 'yellow'
          });
          
          // Send heartbeats during long waits so frontend knows we're still alive
          const heartbeatInterval = 5000; // Every 5 seconds
          let waited = 0;
          while (waited < safeDelay && !this.cancelled) {
            const waitChunk = Math.min(heartbeatInterval, safeDelay - waited);
            await sleep(waitChunk);
            waited += waitChunk;
            
            if (waited < safeDelay && !this.cancelled) {
              const remaining = Math.round((safeDelay - waited) / 1000);
              this.progress.currentStep = `Rate limited - retrying in ${remaining}s`;
              this.streamEvent('heartbeat', `⏳ Waiting... ${remaining}s remaining`, {
                remaining_seconds: remaining,
                icon: 'clock',
                color: 'yellow'
              });
              this.streamProgress();
            }
          }
          
          if (!this.cancelled) {
            this.streamEvent('recovery', `✅ Rate limit cleared, resuming work...`, {
              icon: 'check-circle',
              color: 'green'
            });
          }
          continue;
        }
        
        // If it's a configuration error, fail immediately
        if (error.message.includes('not configured') || error.message.includes('401') || error.message.includes('403')) {
          this.status = TaskStatus.FAILED;
          this.error = error.message;
          this.endTime = new Date();
          await this.saveTaskHistory();
          await this.persistCompletion(TaskStatus.FAILED, error.message);
          this.emit('error', error);
          return;
        }
        
        // For other errors: fix message array integrity, then let AI recover
        // This prevents cascading failures where a broken message array
        // causes every subsequent API call to fail
        this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
        
        // ===== REWIND SYSTEM: Try rewind before giving up =====
        // At 3 consecutive errors, attempt a rewind to last known-good state
        if (this.consecutiveErrors >= 3 && this.rewindManager.getStatus().canRewind) {
          console.warn(`[Amplifier] Task ${this.id}: ${this.consecutiveErrors} consecutive errors, attempting rewind`);
          this.streamEvent('error_rewind', `⏪ ${this.consecutiveErrors} errors in a row - rewinding to last good state...`, {
            error_count: this.consecutiveErrors,
            icon: 'rotate-ccw',
            color: 'orange'
          });
          
          const rewindResult = this.rewindManager.rewind(this, `${this.consecutiveErrors} consecutive errors: ${error.message?.substring(0, 100)}`);
          if (rewindResult.success) {
            this.consecutiveErrors = 0; // Reset error counter after rewind
            this.agentMemory.addFailedPath(`Error cascade: ${error.message?.substring(0, 100)}`);
            this.agentMemory.addConstraint(`Avoid approach that caused: ${error.message?.substring(0, 80)}`);
            
            this.streamEvent('rewind_success', `⏪ Rewound to checkpoint (iteration ${rewindResult.checkpoint.iteration}). Trying different approach...`, {
              rewind_number: this.rewindManager.rewindCount,
              icon: 'rotate-ccw',
              color: 'blue'
            });
            
            await this.saveCheckpoint('rewind');
            continue; // Retry from the rewound state
          }
        }
        
        if (this.consecutiveErrors >= 8) {
          // 8 consecutive errors (up from 5) = something is fundamentally broken, stop gracefully
          console.error(`[Amplifier] Task ${this.id} failed: ${this.consecutiveErrors} consecutive errors`);
          this.status = TaskStatus.COMPLETED; // Complete with partial results, don't lose work
          this.progress.progressPercent = 100;
          this.progress.currentStep = 'Completed (recovered from errors)';
          this.result = {
            summary: `Task completed with partial results after encountering errors. ${this.actionsHistory.length} actions were completed successfully. ${this.rewindManager.rewindCount} recovery attempts were made.`,
            actions: this.actionsHistory.filter(a => a.success).map(a => a.tool),
            partial: true,
            rewinds: this.rewindManager.rewindCount
          };
          this.endTime = new Date();
          await this.saveTaskHistory();
          await this.persistCompletion(TaskStatus.COMPLETED);
          this.streamEvent('task_complete', `✅ Task completed (partial - recovered from errors, ${this.rewindManager.rewindCount} rewinds)`, {
            actions_count: this.actionsHistory.length, icon: 'check-circle', color: 'yellow'
          });
          this.streamProgress();
          this.emit('complete', this.getStatus());
          return;
        }
        
        this.streamEvent('recovery', `⚠️ Recovering from error (${this.consecutiveErrors}/5): ${error.message?.substring(0, 80)}...`, {
          error: error.message,
          icon: 'alert-triangle',
          color: 'yellow'
        });
        
        // Fix message array: normalize to remove broken tool_call/tool pairs
        this.messages = this.normalizeMessages(this.messages);
        
        this.messages.push({
          role: 'user',
          content: `An error occurred: ${error.message}. Please continue with an alternative approach or call task_complete if the goal has been achieved.`
        });

        await this.saveCheckpoint('periodic');
      }
    }
    
    // Max iterations reached
    if (!this.cancelled) {
      console.log(`[Amplifier] Task ${this.id} reached max iterations (${MAX_ITERATIONS})`);
      
      // SMOOTH COMPLETION SEQUENCE
      this.progress.progressPercent = 95;
      this.progress.currentStep = 'Wrapping up (iteration limit)...';
      this.streamEvent('finishing', '🎯 Reached iteration limit, finalizing...', { icon: 'loader', color: 'yellow' });
      this.streamProgress();
      await sleep(600);
      
      this.progress.progressPercent = 98;
      this.progress.currentStep = 'Saving results...';
      this.streamProgress();
      
      this.status = TaskStatus.COMPLETED;
      this.progress.progressPercent = 100;
      this.progress.currentStep = 'Completed (max iterations)';
      this.result = {
        summary: `Task processed over ${this.progress.iterations} iterations. Actions: ${this.actionsHistory.map(a => a.tool).join(', ')}`,
        actions: this.actionsHistory.map(a => a.tool)
      };
      this.endTime = new Date();
      
      await this.saveTaskHistory();
      await this.persistCompletion(TaskStatus.COMPLETED);
      await sleep(400);
      
      this.streamEvent('task_complete', `✅ Task completed (${this.progress.iterations} iterations)`, { 
        actions_count: this.actionsHistory.length,
        icon: 'check-circle', 
        color: 'green' 
      });
      this.streamProgress();
      await sleep(300);
      
      this.emit('complete', this.getStatus());
    }
  }

  /**
   * Save task to history and extract learnings
   */
  async saveTaskHistory() {
    try {
      // Ensure endTime is set (defensive guard against null endTime)
      const completedAt = this.endTime || new Date();
      const durationSeconds = Math.max(0, Math.round((completedAt - this.startTime) / 1000));
      
      // Save to task history
      await query(`
        INSERT INTO ai_task_history (
          firm_id, user_id, task_id, goal, status, started_at, completed_at, duration_seconds,
          iterations, summary, actions_taken, result, error
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        this.firmId,
        this.userId,
        this.id,
        this.goal,
        this.status,
        this.startTime,
        completedAt,
        durationSeconds,
        this.progress.iterations,
        this.result?.summary,
        JSON.stringify(this.actionsHistory.map(a => ({ tool: a.tool, args: a.args }))),
        JSON.stringify(this.result),
        this.error
      ]);
      
      // Extract and save learnings
      await this.extractLearnings();
      
      // ===== ENHANCED AMPLIFIER HOOK: Notify learning system of task completion =====
      try {
        await enhancedAmplifierHooks.onTaskComplete(this);
      } catch (hookError) {
        // Non-fatal: learning extraction from enhanced amplifier is best-effort
        console.warn('[Amplifier] Enhanced learning hook skipped:', hookError.message);
      }
      
    } catch (error) {
      console.error('[Amplifier] Error saving task history:', error);
    }
  }

  /**
   * Extract learning patterns from the task
   * Enhanced to learn from ANY task, not just complex ones
   */
  async extractLearnings() {
    try {
      console.log(`[Amplifier] Extracting learnings from task with ${this.actionsHistory.length} actions`);
      
      // 1. Learn from ANY task with actions (lowered from 3 to 1)
      if (this.actionsHistory.length >= 1) {
        const toolSequence = this.actionsHistory.map(a => a.tool).join(' -> ');
        
        // Check if this pattern exists
        const existing = await query(`
          SELECT id, occurrences FROM ai_learning_patterns
          WHERE firm_id = $1 AND pattern_type = 'workflow' AND pattern_data->>'sequence' = $2
        `, [this.firmId, toolSequence]);
        
        if (existing.rows.length > 0) {
          // Update occurrence count
          await query(`
            UPDATE ai_learning_patterns SET occurrences = occurrences + 1, last_used_at = NOW()
            WHERE id = $1
          `, [existing.rows[0].id]);
          console.log(`[Amplifier] Updated existing workflow pattern: ${toolSequence}`);
        } else {
          // Create new pattern
          await query(`
            INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data)
            VALUES ($1, $2, 'workflow', 'task_execution', $3)
          `, [this.firmId, this.userId, JSON.stringify({
            sequence: toolSequence,
            goal_keywords: this.goal.toLowerCase().split(' ').slice(0, 10),
            tools_used: [...new Set(this.actionsHistory.map(a => a.tool))],
            duration_seconds: Math.round((this.endTime - this.startTime) / 1000),
            success: this.status === 'completed'
          })]);
          console.log(`[Amplifier] Created new workflow pattern: ${toolSequence}`);
        }
      }
      
      // 2. Learn user request patterns (what kind of things they ask for)
      await this.learnRequestPattern();
      
      // 3. Learn naming patterns from created entities
      for (const action of this.actionsHistory) {
        if (action.tool === 'create_matter' && action.args?.name) {
          await this.learnNamingPattern('matter', action.args.name);
        }
        if (action.tool === 'create_client' && action.args?.display_name) {
          await this.learnNamingPattern('client', action.args.display_name);
        }
        if (action.tool === 'create_document' && action.args?.name) {
          await this.learnNamingPattern('document', action.args.name);
        }
        if (action.tool === 'create_calendar_event' && action.args?.title) {
          await this.learnNamingPattern('event', action.args.title);
        }
      }
      
      // 4. Learn timing preferences (when user submits tasks)
      await this.learnTimingPattern();
      
      // 5. Learn billing preferences
      await this.learnBillingPatterns();
      
      console.log(`[Amplifier] Learning extraction complete for task ${this.id}`);
      
    } catch (error) {
      console.error('[Amplifier] Error extracting learnings:', error);
    }
  }
  
  /**
   * Learn what kinds of requests users make
   */
  async learnRequestPattern() {
    try {
      const goalLower = this.goal.toLowerCase();
      
      // Categorize the request
      let category = 'general';
      if (goalLower.match(/invoice|bill|payment|charge/)) category = 'billing';
      else if (goalLower.match(/time|hour|log|track/)) category = 'time_tracking';
      else if (goalLower.match(/document|file|upload|draft/)) category = 'documents';
      else if (goalLower.match(/client|customer|contact/)) category = 'clients';
      else if (goalLower.match(/matter|case|project/)) category = 'matters';
      else if (goalLower.match(/calendar|event|meeting|schedule/)) category = 'scheduling';
      else if (goalLower.match(/task|todo|reminder/)) category = 'tasks';
      else if (goalLower.match(/report|analytics|summary/)) category = 'reporting';
      
      // Extract key verbs
      const verbs = [];
      if (goalLower.match(/create|add|new|make/)) verbs.push('create');
      if (goalLower.match(/update|change|modify|edit/)) verbs.push('update');
      if (goalLower.match(/delete|remove|cancel/)) verbs.push('delete');
      if (goalLower.match(/find|search|look|get|show|list/)) verbs.push('query');
      if (goalLower.match(/send|email|notify/)) verbs.push('communicate');
      
      const patternKey = `${category}:${verbs.sort().join(',')}`;
      
      // Check if pattern exists
      const existing = await query(`
        SELECT id, occurrences FROM ai_learning_patterns
        WHERE firm_id = $1 AND user_id = $2 AND pattern_type = 'request' AND pattern_data->>'key' = $3
      `, [this.firmId, this.userId, patternKey]);
      
      if (existing.rows.length > 0) {
        await query(`
          UPDATE ai_learning_patterns SET occurrences = occurrences + 1, last_used_at = NOW()
          WHERE id = $1
        `, [existing.rows[0].id]);
      } else {
        await query(`
          INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data)
          VALUES ($1, $2, 'request', $3, $4)
        `, [this.firmId, this.userId, category, JSON.stringify({
          key: patternKey,
          category,
          verbs,
          sample_goal: this.goal.substring(0, 200)
        })]);
      }
    } catch (error) {
      console.error('[Amplifier] Error learning request pattern:', error);
    }
  }
  
  /**
   * Learn when users typically submit tasks
   */
  async learnTimingPattern() {
    try {
      const hour = this.startTime.getHours();
      const dayOfWeek = this.startTime.getDay();
      const timeSlot = hour < 9 ? 'early_morning' : 
                       hour < 12 ? 'morning' : 
                       hour < 14 ? 'midday' : 
                       hour < 17 ? 'afternoon' : 
                       hour < 20 ? 'evening' : 'night';
      
      const patternKey = `${dayOfWeek}:${timeSlot}`;
      
      const existing = await query(`
        SELECT id, occurrences FROM ai_learning_patterns
        WHERE firm_id = $1 AND user_id = $2 AND pattern_type = 'timing' AND pattern_data->>'key' = $3
      `, [this.firmId, this.userId, patternKey]);
      
      if (existing.rows.length > 0) {
        await query(`
          UPDATE ai_learning_patterns SET occurrences = occurrences + 1, last_used_at = NOW()
          WHERE id = $1
        `, [existing.rows[0].id]);
      } else {
        await query(`
          INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data)
          VALUES ($1, $2, 'timing', 'usage', $3)
        `, [this.firmId, this.userId, JSON.stringify({
          key: patternKey,
          day_of_week: dayOfWeek,
          time_slot: timeSlot,
          hour
        })]);
      }
    } catch (error) {
      console.error('[Amplifier] Error learning timing pattern:', error);
    }
  }
  
  /**
   * Learn billing patterns from time entries and invoices
   */
  async learnBillingPatterns() {
    try {
      for (const action of this.actionsHistory) {
        if (action.tool === 'log_time' && action.args) {
          const { hours, billable } = action.args;
          const patternKey = `time:${billable ? 'billable' : 'non_billable'}`;
          
          const existing = await query(`
            SELECT id, occurrences, pattern_data FROM ai_learning_patterns
            WHERE firm_id = $1 AND user_id = $2 AND pattern_type = 'billing' AND pattern_data->>'key' = $3
          `, [this.firmId, this.userId, patternKey]);
          
          if (existing.rows.length > 0) {
            // Update with running average
            const data = existing.rows[0].pattern_data;
            const newAvg = ((data.avg_hours || 0) * existing.rows[0].occurrences + hours) / (existing.rows[0].occurrences + 1);
            
            await query(`
              UPDATE ai_learning_patterns 
              SET occurrences = occurrences + 1, 
                  last_used_at = NOW(),
                  pattern_data = pattern_data || $2::jsonb
              WHERE id = $1
            `, [existing.rows[0].id, JSON.stringify({ avg_hours: newAvg })]);
          } else {
            await query(`
              INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data)
              VALUES ($1, $2, 'billing', 'time_entry', $3)
            `, [this.firmId, this.userId, JSON.stringify({
              key: patternKey,
              billable,
              avg_hours: hours
            })]);
          }
        }
      }
    } catch (error) {
      console.error('[Amplifier] Error learning billing pattern:', error);
    }
  }

  /**
   * Learn naming patterns
   */
  async learnNamingPattern(entityType, name) {
    try {
      // Simple pattern extraction (first word, format hints)
      const words = name.split(/[\s\-_]+/);
      const pattern = {
        entity: entityType,
        wordCount: words.length,
        startsWithArticle: ['the', 'a', 'an'].includes(words[0]?.toLowerCase()),
        containsNumbers: /\d/.test(name),
        format: name.includes(' - ') ? 'hyphenated' : name.includes('v.') ? 'legal_case' : 'simple'
      };
      
      await query(`
        INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data)
        VALUES ($1, $2, 'naming', $3, $4)
        ON CONFLICT DO NOTHING
      `, [this.firmId, this.userId, entityType, JSON.stringify(pattern)]);
      
    } catch (error) {
      // Ignore naming pattern errors
    }
  }

  /**
   * Cancel the task
   */
  cancel() {
    if (this.status !== TaskStatus.RUNNING && this.status !== TaskStatus.WAITING_INPUT) {
      return false;
    }
    
    this.cancelled = true;
    this.status = TaskStatus.CANCELLED;
    this.progress.currentStep = 'Cancelled';
    this.endTime = new Date();
    
    console.log(`[Amplifier] Task ${this.id} cancelled`);
    this.persistCompletion(TaskStatus.CANCELLED).catch(err => {
      console.error(`[Amplifier] Failed to persist cancellation for task ${this.id}:`, err.message);
    });
    this.emit('cancelled', this.getStatus());
    return true;
  }

  /**
   * Add follow-up instructions to the task.
   * 
   * Instead of pushing directly into this.messages (which can race with the
   * agent loop mid-API-call), we queue the follow-up. The agent loop drains
   * the queue at the TOP of each iteration, ensuring correct message ordering.
   * 
   * Follow-ups are also persisted in long-term memory so they survive
   * message compaction/summarization.
   */
  addFollowUp(message) {
    if (!message || typeof message !== 'string') {
      throw new Error('Follow-up message must be a non-empty string');
    }
    
    const followUp = {
      message: message.trim(),
      timestamp: new Date().toISOString()
    };
    
    // Queue for injection at the next iteration (avoids race condition)
    this.pendingFollowUps.push(followUp);
    
    // Store for tracking / frontend display
    this.followUps.push(followUp);
    
    // Persist the follow-up instruction in long-term memory so it survives
    // any message compaction or recursive summarization
    if (this.agentMemory) {
      this.agentMemory.addKeyFact(`[USER FOLLOW-UP]: ${message.trim().substring(0, 200)}`);
      this.agentMemory.addFinding(`User redirected task: ${message.trim().substring(0, 100)}`);
    }
    
    console.log(`[Amplifier] Follow-up queued for task ${this.id}: ${message.substring(0, 50)}...`);
    
    // Emit event for real-time updates
    this.emit('followup', followUp);
  }

  /**
   * Drain pending follow-up queue into the message array.
   * Called at the TOP of each agent loop iteration, before the API call,
   * so the model always sees follow-ups in the correct position.
   */
  _drainFollowUpQueue() {
    if (this.pendingFollowUps.length === 0) return;
    
    const pending = this.pendingFollowUps.splice(0); // atomically drain
    
    for (const followUp of pending) {
      this.messages.push({
        role: 'user',
        content: `[FOLLOW-UP INSTRUCTION FROM USER]: ${followUp.message}

Please acknowledge this follow-up and adjust your approach accordingly. Continue with the task while incorporating this new guidance.`
      });
      
      console.log(`[Amplifier] Follow-up injected into messages for task ${this.id}: ${followUp.message.substring(0, 50)}...`);
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    // Compute efficiency metrics
    const cacheHits = [...this.toolCache.values()].filter(v => v.result?._preloaded).length;
    const totalTools = this.actionsHistory.length;
    const successfulTools = this.actionsHistory.filter(a => a.success !== false).length;
    const uniqueTools = [...new Set(this.actionsHistory.map(a => a.tool))].length;
    const elapsedSec = (this.endTime || new Date()) - this.startTime;
    
    return {
      id: this.id,
      userId: this.userId,
      firmId: this.firmId,
      goal: this.goal,
      status: this.status,
      progress: this.progress,
      actionsCount: this.actionsHistory.length,
      result: this.result,
      error: this.error,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: elapsedSec / 1000,
      // Work type classification from Junior Attorney Brief
      workType: this.workType ? { id: this.workType.id, name: this.workType.name } : null,
      // Rewind system status
      rewind: this.rewindManager ? this.rewindManager.getStatus() : null,
      // Memory system status
      memory: this.agentMemory ? {
        longTermFacts: this.agentMemory.longTerm.keyFacts.length,
        midTermLayers: this.agentMemory.midTerm.summaryLayers.length,
        totalSummarized: this.agentMemory.midTerm.totalMessagesSummarized,
        failedPaths: this.agentMemory.longTerm.failedPaths.length
      } : null,
      // Follow-up messages sent by the user
      followUps: this.followUps || [],
      pendingFollowUps: this.pendingFollowUps?.length || 0,
      // Efficiency metrics
      efficiency: {
        matterPreloaded: !!this.preloadedMatterId,
        preloadedMatterName: this.preloadedMatterName || null,
        cacheHits: this.toolCache.size,
        totalToolCalls: totalTools,
        successfulToolCalls: successfulTools,
        uniqueToolsUsed: uniqueTools,
        toolSuccessRate: totalTools > 0 ? Math.round((successfulTools / totalTools) * 100) : 0,
        iterationsPerAction: totalTools > 0 ? Math.round((this.progress.iterations / totalTools) * 100) / 100 : 0,
        actionsPerMinute: elapsedSec > 60000 ? Math.round((totalTools / (elapsedSec / 60000)) * 10) / 10 : totalTools,
        rateLimitsHit: this.rateLimitCount,
        textOnlyResponses: this.textOnlyStreak,
        messageCompactions: this.agentMemory?.midTerm?.totalMessagesSummarized || 0,
        focusScore: this.focusGuard?.getFocusScore() ?? null,
        focusInterventions: this.focusGuard?.focusInterventionCount ?? 0,
      }
    };
  }
}

/**
 * AmplifierService - Main service class
 */
class AmplifierService {
  constructor() {
    this.tasks = new Map();
    this.configured = false;
  }

  /**
   * Check if service is available
   * Uses the SAME environment variables as the normal AI chat (aiAgent.js)
   */
  async checkAvailability() {
    // Check if Azure OpenAI is configured (read at runtime)
    // These are the EXACT same env vars used by aiAgent.js
    const config = getAzureConfig();
    const available = !!(config.endpoint && config.apiKey && config.deployment);
    
    // Don't count placeholder values as valid
    if (config.apiKey === 'PASTE_YOUR_KEY_HERE' || config.apiKey === 'your-azure-openai-api-key') {
      console.warn('[AmplifierService] API key contains placeholder value');
      return false;
    }
    
    return available;
  }

  /**
   * Configure the service
   * Uses the SAME Azure OpenAI configuration as the normal AI chat
   * Always returns true - actual API errors will be handled at runtime
   */
  async configure() {
    if (this.configured) return true;
    
    const available = await this.checkAvailability();
    if (!available) {
      const config = getAzureConfig();
      console.warn('[AmplifierService] Azure OpenAI credentials not configured');
      console.warn('[AmplifierService] AZURE_OPENAI_ENDPOINT:', config.endpoint ? `set (${config.endpoint})` : 'MISSING');
      console.warn('[AmplifierService] AZURE_OPENAI_API_KEY:', config.apiKey ? `set (length: ${config.apiKey.length})` : 'MISSING');
      console.warn('[AmplifierService] AZURE_OPENAI_DEPLOYMENT_NAME:', config.deployment ? `set (${config.deployment})` : 'MISSING');
      return false;
    }

    const config = getAzureConfig();
    
    const tools = getOpenAITools();
    if (!tools || tools.length === 0) {
      console.error('[AmplifierService] No tools available - check import from aiAgent.js');
      return false;
    }
    
    this.configured = true;
    console.log('[AmplifierService] Configured with Azure OpenAI');
    console.log('[AmplifierService] Endpoint:', config.endpoint);
    console.log('[AmplifierService] Deployment:', config.deployment);
    console.log('[AmplifierService] Tools available:', tools.length);
    
    this.resumePendingTasks().catch(err => {
      console.error('[AmplifierService] Error resuming pending tasks:', err.message);
    });
    
    return true;
  }

  /**
   * Resume background tasks from checkpoints after restart
   * 
   * This is called at server startup to resume any tasks that were
   * interrupted by a server restart. Tasks are resumed from their
   * last checkpoint and continue where they left off.
   */
  async resumePendingTasks() {
    if (!persistenceAvailable) return;
    try {
      const result = await query(
        `SELECT id, firm_id, user_id, goal, status, progress, result, error, iterations, max_iterations, options, checkpoint, started_at
         FROM ai_background_tasks
         WHERE status IN ('running', 'pending') AND checkpoint IS NOT NULL
         ORDER BY started_at DESC`
      );

      if (result.rows.length === 0) {
        console.log('[AmplifierService] No interrupted tasks to resume');
        return;
      }

      console.log(`[AmplifierService] Found ${result.rows.length} interrupted task(s) to resume`);

      for (const row of result.rows) {
        if (this.tasks.has(row.id)) {
          console.log(`[AmplifierService] Task ${row.id} already active, skipping`);
          continue;
        }
        
        // Calculate how long the task was interrupted
        const interruptedAt = row.checkpoint?.lastCheckpointAt 
          ? new Date(row.checkpoint.lastCheckpointAt) 
          : row.started_at ? new Date(row.started_at) : new Date();
        const interruptedMinutes = Math.round((Date.now() - interruptedAt.getTime()) / 60000);
        
        console.log(`[AmplifierService] Resuming task ${row.id}: "${row.goal.substring(0, 50)}..." (interrupted ${interruptedMinutes} min ago)`);
        
        const task = new BackgroundTask(row.id, row.user_id, row.firm_id, row.goal, row.options || {});
        task.progress = row.progress || task.progress;
        task.result = row.result || null;
        task.error = row.error || null;
        task.startTime = row.started_at ? new Date(row.started_at) : task.startTime;
        task.progress.iterations = row.iterations || task.progress.iterations;
        task.maxIterations = row.max_iterations || task.maxIterations;
        task.status = TaskStatus.RUNNING;
        task.loadCheckpoint(row.checkpoint);

        this.tasks.set(task.id, task);
        activeTasks.set(task.userId, task.id);

        task.on('complete', () => activeTasks.delete(task.userId));
        task.on('error', () => activeTasks.delete(task.userId));
        task.on('cancelled', () => activeTasks.delete(task.userId));

        // Create notification for the user that their task is resuming
        try {
          await query(
            `INSERT INTO notifications (
              firm_id, user_id, type, title, message, priority,
              entity_type, entity_id, action_url, metadata
            ) VALUES ($1, $2, 'ai_agent', $3, $4, 'normal', 'background_task', $5, $6, $7)`,
            [
              row.firm_id,
              row.user_id,
              'Background Task Resumed',
              `Your task "${row.goal.substring(0, 50)}${row.goal.length > 50 ? '...' : ''}" is resuming after a server restart.`,
              row.id,
              '/app/background-agent',
              JSON.stringify({
                taskId: row.id,
                resumedAt: new Date().toISOString(),
                interruptedMinutes,
                iteration: row.iterations || 0
              })
            ]
          );
        } catch (notifError) {
          // Non-fatal - notification creation failed
          console.warn(`[AmplifierService] Failed to create resume notification for task ${row.id}:`, notifError.message);
        }

        task.start({ resumeFromCheckpoint: true }).catch(err => {
          console.error(`[AmplifierService] Resumed task ${row.id} failed:`, err);
        });
        
        console.log(`[AmplifierService] Task ${row.id} resumed successfully`);
      }
      
      console.log(`[AmplifierService] Finished resuming ${result.rows.length} task(s)`);
    } catch (error) {
      markPersistenceUnavailable(error);
      if (persistenceAvailable) {
        console.error('[AmplifierService] Failed to resume background tasks:', error.message);
      }
    }
  }

  /**
   * Start a new background task
   */
  async startTask(userId, firmId, goal, options = {}) {
    // Check if user already has an active task
    const existingTask = await this.getActiveTask(userId);
    if (existingTask) {
      throw new Error('User already has an active background task');
    }

    const taskId = generateTaskId();
    const task = new BackgroundTask(taskId, userId, firmId, goal, options);
    
    // Store task
    this.tasks.set(taskId, task);
    activeTasks.set(userId, taskId);
    
    // Set up event handlers
    task.on('complete', () => {
      activeTasks.delete(userId);
    });
    
    task.on('error', () => {
      activeTasks.delete(userId);
    });
    
    task.on('cancelled', () => {
      activeTasks.delete(userId);
    });
    
    // Start the task (async)
    task.start().catch(err => {
      console.error(`[AmplifierService] Task ${taskId} failed:`, err);
    });
    
    return task.getStatus();
  }

  /**
   * Get task by ID
   */
  async getTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task) return task.getStatus();
    if (!persistenceAvailable) return null;
    
    try {
      const result = await query(
        `SELECT id, firm_id, user_id, goal, status, progress, result, error, iterations, max_iterations, options,
                started_at, completed_at, checkpoint
         FROM ai_background_tasks WHERE id = $1`,
        [taskId]
      );
      if (!result.rows.length) return null;
      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        firmId: row.firm_id,
        goal: row.goal,
        status: row.status,
        progress: row.progress,
        actionsCount: Array.isArray(row.checkpoint?.actionsHistory) ? row.checkpoint.actionsHistory.length : 0,
        result: row.result,
        error: row.error,
        startTime: row.started_at,
        endTime: row.completed_at,
        duration: row.started_at ? (new Date(row.completed_at || Date.now()) - new Date(row.started_at)) / 1000 : null
      };
    } catch (error) {
      markPersistenceUnavailable(error);
      if (persistenceAvailable) {
        console.error('[AmplifierService] Error fetching task from storage:', error.message);
      }
      return null;
    }
  }

  /**
   * Get active task for user
   */
  async getActiveTask(userId) {
    const taskId = activeTasks.get(userId);
    if (taskId) {
      const task = this.tasks.get(taskId);
      if (task) return task.getStatus();
      activeTasks.delete(userId);
    }
    
    if (!persistenceAvailable) return null;
    
    try {
      const result = await query(
        `SELECT id, firm_id, user_id, goal, status, progress, result, error, iterations, max_iterations, options, checkpoint, started_at
         FROM ai_background_tasks
         WHERE user_id = $1 AND status IN ('running', 'pending')
         ORDER BY updated_at DESC
         LIMIT 1`,
        [userId]
      );
      
      if (!result.rows.length) return null;
      const row = result.rows[0];
      
      if (!this.tasks.has(row.id)) {
        const task = new BackgroundTask(row.id, row.user_id, row.firm_id, row.goal, row.options || {});
        task.progress = row.progress || task.progress;
        task.result = row.result || null;
        task.error = row.error || null;
        task.startTime = row.started_at ? new Date(row.started_at) : task.startTime;
        task.progress.iterations = row.iterations || task.progress.iterations;
        task.maxIterations = row.max_iterations || task.maxIterations;
        task.status = TaskStatus.RUNNING;
        task.loadCheckpoint(row.checkpoint);

        this.tasks.set(task.id, task);
        activeTasks.set(task.userId, task.id);

        task.on('complete', () => activeTasks.delete(task.userId));
        task.on('error', () => activeTasks.delete(task.userId));
        task.on('cancelled', () => activeTasks.delete(task.userId));

        task.start({ resumeFromCheckpoint: true }).catch(err => {
          console.error(`[AmplifierService] On-demand resume failed for ${task.id}:`, err);
        });

        return task.getStatus();
      }
      
      return this.tasks.get(row.id)?.getStatus() || null;
    } catch (error) {
      markPersistenceUnavailable(error);
      if (persistenceAvailable) {
        console.error('[AmplifierService] Error checking active task:', error.message);
      }
      return null;
    }
  }

  /**
   * Get all tasks for user
   */
  async getUserTasks(userId, limit = 10) {
    const inMemoryTasks = [];
    
    for (const task of this.tasks.values()) {
      if (task.userId === userId) {
        inMemoryTasks.push(task.getStatus());
      }
    }
    
    if (!persistenceAvailable) {
      return inMemoryTasks.slice(0, limit);
    }
    
    try {
      const result = await query(
        `SELECT id, firm_id, user_id, goal, status, progress, result, error, started_at, completed_at, iterations
         FROM ai_background_tasks
         WHERE user_id = $1
         ORDER BY COALESCE(completed_at, started_at) DESC
         LIMIT $2`,
        [userId, limit]
      );
      
      const storedTasks = result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        firmId: row.firm_id,
        goal: row.goal,
        status: row.status,
        progress: row.progress,
        iterations: row.iterations,
        result: row.result,
        error: row.error,
        startTime: row.started_at,
        endTime: row.completed_at,
        duration: row.started_at ? (new Date(row.completed_at || Date.now()) - new Date(row.started_at)) / 1000 : null
      }));
      
      const merged = new Map();
      for (const task of storedTasks) merged.set(task.id, task);
      for (const task of inMemoryTasks) merged.set(task.id, task);
      
      return Array.from(merged.values()).sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, limit);
    } catch (error) {
      markPersistenceUnavailable(error);
      if (persistenceAvailable) {
        console.error('[AmplifierService] Error loading stored tasks:', error.message);
      }
      return inMemoryTasks.slice(0, limit);
    }
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId, userId) {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      // Attempt to cancel stored task that isn't loaded in memory
      if (persistenceAvailable) {
        query(
          `UPDATE ai_background_tasks
           SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND user_id = $2`,
          [taskId, userId]
        ).catch(error => {
          markPersistenceUnavailable(error);
          if (persistenceAvailable) {
            console.error('[AmplifierService] Failed to cancel stored task:', error.message);
          }
        });
      }
      return true;
    }
    
    if (task.userId !== userId) {
      throw new Error('Not authorized to cancel this task');
    }
    
    return task.cancel();
  }

  /**
   * Send follow-up instructions to a running task
   */
  async sendFollowUp(taskId, message, userId) {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return { success: false, error: 'Task not found or not running' };
    }
    
    if (task.userId !== userId) {
      return { success: false, error: 'Not authorized to send follow-up to this task' };
    }
    
    if (task.status !== 'running' && task.status !== 'thinking' && task.status !== 'executing') {
      return { success: false, error: 'Task is not currently running' };
    }
    
    try {
      // Add the follow-up as a user message that will be processed in the next iteration
      task.addFollowUp(message);
      
      // Stream event to show the follow-up was received
      task.streamEvent('followup_received', `Follow-up received: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`, {
        icon: 'message-circle',
        color: 'purple'
      });
      
      console.log(`[AmplifierService] Follow-up added to task ${taskId}: ${message.substring(0, 50)}...`);
      
      return { success: true, task: task.getStatus() };
    } catch (error) {
      console.error(`[AmplifierService] Failed to send follow-up to task ${taskId}:`, error);
      return { success: false, error: error.message || 'Failed to send follow-up' };
    }
  }

  /**
   * Get task history from database
   */
  async getTaskHistory(userId, firmId, limit = 20) {
    try {
      const result = await query(`
        SELECT * FROM ai_task_history
        WHERE firm_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        LIMIT $3
      `, [firmId, userId, limit]);
      
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get learned patterns
   */
  async getLearnedPatterns(firmId, userId, limit = 50) {
    try {
      const result = await query(`
        SELECT * FROM ai_learning_patterns
        WHERE firm_id = $1 AND (user_id = $2 OR user_id IS NULL)
        ORDER BY confidence DESC, occurrences DESC
        LIMIT $3
      `, [firmId, userId, limit]);
      
      return result.rows;
    } catch (error) {
      console.error('[AmplifierService] Error getting learned patterns:', error);
      return [];
    }
  }

  /**
   * Record user feedback on a completed task
   * This is crucial for learning from user satisfaction
   */
  async recordFeedback(taskId, userId, firmId, feedback) {
    try {
      const { rating, feedback: feedbackText, correction } = feedback;
      
      console.log(`[AmplifierService] Recording feedback for task ${taskId}: rating=${rating}`);
      
      // Update task history with feedback
      const updateResult = await query(`
        UPDATE ai_task_history
        SET 
          learnings = COALESCE(learnings, '{}'::jsonb) || $4::jsonb
        WHERE task_id = $1 AND user_id = $2 AND firm_id = $3
        RETURNING *
      `, [taskId, userId, firmId, JSON.stringify({
        user_rating: rating,
        user_feedback: feedbackText,
        user_correction: correction,
        feedback_at: new Date().toISOString()
      })]);
      
      if (updateResult.rows.length === 0) {
        return { success: false, error: 'Task not found in history' };
      }
      
      const taskHistory = updateResult.rows[0];
      
      // Learn from the feedback
      if (rating) {
        // Learn satisfaction pattern
        const satisfactionLevel = rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral';
        
        // If positive, reinforce the workflow pattern
        if (satisfactionLevel === 'positive' && taskHistory.actions_taken) {
          const actions = typeof taskHistory.actions_taken === 'string' 
            ? JSON.parse(taskHistory.actions_taken) 
            : taskHistory.actions_taken;
          
          if (actions.length > 0) {
            const sequence = actions.map(a => a.tool).join(' -> ');
            
            // Boost confidence for this workflow
            await query(`
              UPDATE ai_learning_patterns
              SET confidence = LEAST(0.99, confidence + 0.05),
                  occurrences = occurrences + 1,
                  last_used_at = NOW()
              WHERE firm_id = $1 AND pattern_type = 'workflow' AND pattern_data->>'sequence' = $2
            `, [firmId, sequence]);
            
            console.log(`[AmplifierService] Boosted confidence for workflow: ${sequence}`);
          }
        }
        
        // If negative, reduce confidence and learn what went wrong
        if (satisfactionLevel === 'negative') {
          const actions = typeof taskHistory.actions_taken === 'string' 
            ? JSON.parse(taskHistory.actions_taken) 
            : taskHistory.actions_taken;
          
          if (actions && actions.length > 0) {
            const sequence = actions.map(a => a.tool).join(' -> ');
            
            // Reduce confidence for this workflow
            await query(`
              UPDATE ai_learning_patterns
              SET confidence = GREATEST(0.10, confidence - 0.1),
                  last_used_at = NOW()
              WHERE firm_id = $1 AND pattern_type = 'workflow' AND pattern_data->>'sequence' = $2
            `, [firmId, sequence]);
            
            console.log(`[AmplifierService] Reduced confidence for workflow: ${sequence}`);
          }
          
          // Store the negative feedback as a learning pattern to avoid
          if (correction) {
            await query(`
              INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data, confidence)
              VALUES ($1, $2, 'correction', 'user_feedback', $3, 0.80)
            `, [firmId, userId, JSON.stringify({
              original_goal: taskHistory.goal,
              what_went_wrong: feedbackText,
              correct_approach: correction,
              task_id: taskId
            })]);
            
            console.log(`[AmplifierService] Stored correction pattern from user feedback`);
          }
        }
      }
      
      return { 
        success: true, 
        task: {
          id: taskHistory.task_id,
          goal: taskHistory.goal,
          feedback_recorded: true
        }
      };
    } catch (error) {
      console.error('[AmplifierService] Error recording feedback:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get learning statistics for a user/firm
   */
  async getLearningStats(firmId, userId) {
    try {
      // Get pattern counts by type
      const patternCounts = await query(`
        SELECT pattern_type, COUNT(*) as count, AVG(confidence) as avg_confidence
        FROM ai_learning_patterns
        WHERE firm_id = $1 AND (user_id = $2 OR user_id IS NULL)
        GROUP BY pattern_type
      `, [firmId, userId]);
      
      // Get task completion stats
      const taskStats = await query(`
        SELECT 
          COUNT(*) as total_tasks,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
          COUNT(CASE WHEN learnings->>'user_rating' IS NOT NULL THEN 1 END) as rated_tasks,
          AVG((learnings->>'user_rating')::numeric) as avg_rating
        FROM ai_task_history
        WHERE firm_id = $1 AND user_id = $2
      `, [firmId, userId]);
      
      // Get top learned workflows
      const topWorkflows = await query(`
        SELECT pattern_data, occurrences, confidence
        FROM ai_learning_patterns
        WHERE firm_id = $1 AND pattern_type = 'workflow'
        ORDER BY occurrences DESC, confidence DESC
        LIMIT 5
      `, [firmId]);
      
      // Get recent learning activity
      const recentLearning = await query(`
        SELECT pattern_type, pattern_data, created_at
        FROM ai_learning_patterns
        WHERE firm_id = $1 AND (user_id = $2 OR user_id IS NULL)
        ORDER BY created_at DESC
        LIMIT 10
      `, [firmId, userId]);
      
      return {
        patterns: {
          byType: patternCounts.rows.reduce((acc, row) => {
            acc[row.pattern_type] = {
              count: parseInt(row.count),
              avgConfidence: parseFloat(row.avg_confidence || 0).toFixed(2)
            };
            return acc;
          }, {}),
          total: patternCounts.rows.reduce((sum, row) => sum + parseInt(row.count), 0)
        },
        tasks: {
          total: parseInt(taskStats.rows[0]?.total_tasks || 0),
          completed: parseInt(taskStats.rows[0]?.completed_tasks || 0),
          rated: parseInt(taskStats.rows[0]?.rated_tasks || 0),
          avgRating: parseFloat(taskStats.rows[0]?.avg_rating || 0).toFixed(1)
        },
        topWorkflows: topWorkflows.rows.map(row => ({
          ...row.pattern_data,
          occurrences: row.occurrences,
          confidence: parseFloat(row.confidence).toFixed(2)
        })),
        recentLearning: recentLearning.rows.map(row => ({
          type: row.pattern_type,
          data: row.pattern_data,
          learnedAt: row.created_at
        }))
      };
    } catch (error) {
      console.error('[AmplifierService] Error getting learning stats:', error);
      return {
        patterns: { byType: {}, total: 0 },
        tasks: { total: 0, completed: 0, rated: 0, avgRating: 0 },
        topWorkflows: [],
        recentLearning: []
      };
    }
  }

  /**
   * Clean up old completed tasks from memory
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) {
    const now = new Date();
    
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.endTime && (now - task.endTime) > maxAge) {
        this.tasks.delete(taskId);
      }
    }
  }
}

// Singleton instance
const amplifierService = new AmplifierService();

// Clean up old tasks periodically
setInterval(() => {
  amplifierService.cleanup();
}, 60 * 60 * 1000); // Every hour

// Graceful shutdown handler - save all running task checkpoints
async function gracefulShutdown(signal) {
  console.log(`[AmplifierService] Received ${signal}, saving task checkpoints...`);
  
  const runningTasks = Array.from(amplifierService.tasks.values()).filter(
    task => task.status === TaskStatus.RUNNING
  );
  
  if (runningTasks.length === 0) {
    console.log('[AmplifierService] No running tasks to checkpoint');
    return;
  }
  
  console.log(`[AmplifierService] Saving ${runningTasks.length} running task(s)...`);
  
  // Save checkpoints in parallel
  await Promise.allSettled(
    runningTasks.map(async (task) => {
      try {
        task.streamEvent('shutdown', '⚠️ Server shutting down, saving progress...', {
          icon: 'alert-triangle',
          color: 'yellow'
        });
        await task.saveCheckpoint('shutdown');
        console.log(`[AmplifierService] Saved checkpoint for task ${task.id}`);
      } catch (error) {
        console.error(`[AmplifierService] Failed to save checkpoint for ${task.id}:`, error.message);
      }
    })
  );
  
  console.log('[AmplifierService] All checkpoints saved');
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default amplifierService;
export { AmplifierService, BackgroundTask, TaskStatus };
