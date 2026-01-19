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
import { PLATFORM_CONTEXT, getUserContext, getMatterContext, getLearningContext } from './amplifier/platformContext.js';
import { AMPLIFIER_TOOLS, AMPLIFIER_OPENAI_TOOLS, executeTool } from './amplifier/toolBridge.js';

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

// Azure OpenAI configuration - use SAME API version as normal AI agent (aiAgent.js)
// This MUST match the version in routes/aiAgent.js for consistency
// Read at runtime to ensure dotenv has loaded
const API_VERSION = '2024-12-01-preview';

// Background agent runtime defaults (tuned for long-running legal tasks)
const DEFAULT_MAX_ITERATIONS = 120;
const DEFAULT_MAX_RUNTIME_MINUTES = 90;
const CHECKPOINT_INTERVAL_MS = 15000;
const MESSAGE_COMPACT_MAX_CHARS = 12000;
const MESSAGE_COMPACT_MAX_MESSAGES = 24;
const MEMORY_MESSAGE_PREFIX = '## TASK MEMORY';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
 * Get Azure OpenAI configuration (read at runtime to avoid timing issues)
 */
function getAzureConfig() {
  return {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT
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
    body.parallel_tool_calls = false; // Match aiAgent.js
  }
  
  console.log(`[Amplifier] Calling Azure OpenAI: ${config.deployment} with ${tools.length} tools`);
  console.log(`[Amplifier] Request URL: ${url}`);
  
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);
  const maxAttempts = 5;
  
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
    console.warn(`[Amplifier] Retryable error, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
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
    this.maxIterations = options.maxIterations || options.max_iterations || DEFAULT_MAX_ITERATIONS;
    this.maxRuntimeMs = (options.maxRuntimeMinutes || options.max_runtime_minutes || DEFAULT_MAX_RUNTIME_MINUTES) * 60 * 1000;
    this.lastCheckpointAt = 0;
    this.plan = null;
    this.recentTools = [];
    
    // User and firm context
    this.userContext = null;
    this.learningContext = null;
    this.systemPrompt = null;
    this.userRecord = null;
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
      
      this.userContext = getUserContext(user, firm);
      this.learningContext = await getLearningContext(query, this.firmId, this.userId);
      
      // Get workflow templates
      const workflowResult = await query(
        'SELECT name, description, trigger_phrases, steps FROM ai_workflow_templates WHERE firm_id = $1 AND is_active = true',
        [this.firmId]
      );
      
      this.workflowTemplates = workflowResult.rows;
    } catch (error) {
      console.error('[Amplifier] Context initialization error:', error);
    }
  }

  isMemoryMessage(message) {
    return message?.role === 'system' && message?.content?.startsWith(MEMORY_MESSAGE_PREFIX);
  }

  buildMemorySummary() {
    const actionLines = this.actionsHistory.slice(-12).map(action => {
      const status = action?.result?.error ? 'error' : 'ok';
      return `- ${action.tool}: ${status}`;
    });

    const planLines = Array.isArray(this.plan?.steps)
      ? this.plan.steps.map((step, index) => `${index + 1}. ${step}`)
      : [];

    const summaryParts = [
      `${MEMORY_MESSAGE_PREFIX}`,
      `Goal: ${this.goal}`,
      this.progress?.currentStep ? `Current step: ${this.progress.currentStep}` : null,
      planLines.length ? `Plan:\n${planLines.join('\n')}` : null,
      actionLines.length ? `Recent actions:\n${actionLines.join('\n')}` : null,
    ].filter(Boolean);

    const summary = summaryParts.join('\n');
    return summary.length > 4000 ? `${summary.substring(0, 4000)}…` : summary;
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

    const systemMessage = this.messages.find(message => message.role === 'system' && !this.isMemoryMessage(message));
    const recentMessages = this.messages.slice(-12).filter(message => !this.isMemoryMessage(message));
    const memoryMessage = { role: 'system', content: this.buildMemorySummary() };

    this.messages = this.normalizeMessages([systemMessage, memoryMessage, ...recentMessages].filter(Boolean));
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
      systemPrompt: this.systemPrompt,
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
    this.systemPrompt = checkpoint.systemPrompt || this.systemPrompt;
  }

  async persistCompletion(status, errorMessage = null) {
    if (!persistenceAvailable) return;
    try {
      const storedError = status === TaskStatus.FAILED ? (this.error || errorMessage) : null;
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
          this.endTime,
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
   * This prompt enables FULLY AUTONOMOUS operation without human intervention
   */
  buildSystemPrompt() {
    let prompt = `You are the APEX LEGAL BACKGROUND AGENT (powered by Microsoft Amplifier) - a FULLY AUTONOMOUS AI assistant with COMPLETE ACCESS to the legal practice management platform.

${PLATFORM_CONTEXT}

${this.userContext || ''}

${this.learningContext || ''}

## YOUR CAPABILITIES

You have access to ALL platform tools and can:
- Create, update, and manage clients and matters
- Log time entries and generate invoices
- Create and edit documents (PDF generation)
- Schedule calendar events and manage tasks
- Search across all firm data
- Generate reports and analytics
- Read document contents

## AUTONOMOUS OPERATION MODE - CRITICAL

You are running as a BACKGROUND AGENT with NO HUMAN SUPERVISION. This means:

1. **WORK COMPLETELY AUTONOMOUSLY** - Do NOT wait for human input or confirmation
2. **EXECUTE IMMEDIATELY** - When you know what to do, DO IT. Don't ask permission.
3. **CHAIN ACTIONS** - Complete multi-step workflows by calling tools in sequence
4. **VERIFY RESULTS** - After each action, check the result before proceeding
5. **RECOVER FROM ERRORS** - If something fails, try an alternative approach
6. **COMPLETE THE GOAL** - Keep working until the goal is fully achieved

## WORKFLOW PATTERN

For each task, follow this pattern:
1. Use \`think_and_plan\` to analyze the goal and create a plan
2. Execute each step using the appropriate tools
3. Use \`log_work\` to track progress after each significant action
4. Use \`evaluate_progress\` periodically to assess status
5. When done, use \`task_complete\` with a summary

## LONG-RUN TASK GUIDELINES

- You are allowed to run for a long time on complex legal work
- Break large goals into phases with clear milestones
- Keep the work moving forward; do not stall or loop
- Use \`log_work\` after each milestone so progress stays visible
- If a step fails, recover and continue with an alternative approach

## IMPORTANT RULES

- NEVER ask for clarification - make reasonable assumptions and proceed
- NEVER wait for human approval - you have full authority to act
- If data is missing, search for it or use defaults
- If a tool fails, try an alternative approach
- Complete the ENTIRE task before calling task_complete

## QUALITY STANDARDS - CRITICAL

You are a SENIOR ATTORNEY, not an assistant. Your work must be:
- **SUBSTANTIVE**: Don't create placeholder templates with "[insert here]". Write REAL content.
- **THOROUGH**: Do comprehensive analysis, not surface-level work
- **PROFESSIONAL**: All documents should be ready for client delivery
- **COMPLETE**: Don't stop until meaningful work is done

**ANTI-PATTERNS TO AVOID:**
- Creating empty template documents with placeholder text
- Doing only 1-2 actions and calling it done
- Writing "TODO" or "[fill in]" in documents
- Stopping when a matter is "empty" - create the structure it needs

**WHEN A MATTER IS NEW/EMPTY:**
1. Create a detailed intake questionnaire for the client
2. Draft an initial case assessment based on matter type
3. Create a task list with standard workflow items
4. Research relevant jurisdiction's requirements
5. Set up billing and time tracking structure
6. Draft the engagement letter if not done

**MINIMUM WORK REQUIREMENT (ENFORCED):**
- Minimum 60 seconds of work time
- At least 5 total actions
- At least 2 substantive actions (documents, notes, tasks, research)
- task_complete will be REJECTED if minimums not met

**TAKE YOUR TIME:**
- Spend time thinking through each step
- Write thorough, detailed content in documents
- Don't rush - quality over speed
- A good task should take 2-5 minutes of real work

## CURRENT TASK

Goal: ${this.goal}

START WORKING NOW. Execute tools to complete this goal. Do not respond with text only - TAKE ACTION. Do SUBSTANTIAL work, not minimal placeholder work.
`;

    // Add workflow templates if relevant
    if (this.workflowTemplates && this.workflowTemplates.length > 0) {
      prompt += '\n## AVAILABLE WORKFLOW TEMPLATES\n\n';
      for (const wf of this.workflowTemplates) {
        const triggers = wf.trigger_phrases?.join(', ') || '';
        prompt += `- **${wf.name}**: ${wf.description} (triggers: ${triggers})\n`;
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
      
      if (!resumeFromCheckpoint) {
        // Initialize context (user info, firm data, learnings)
        await this.initializeContext();
        
        // Build initial messages with a STRONG action prompt
        // The user message must clearly instruct the AI to take action immediately
        this.systemPrompt = this.buildSystemPrompt();
        this.messages = [
          { role: 'system', content: this.systemPrompt },
          { 
            role: 'user', 
            content: `EXECUTE THIS TASK NOW: ${this.goal}

Begin by calling think_and_plan to create your execution plan, then immediately start calling tools to complete each step. Do NOT respond with just text - you MUST call tools to take action.`
          }
        ];
      }

      await this.saveCheckpoint('start');
      
      console.log(`[Amplifier] Task ${this.id} context initialized, starting agent loop`);
      
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
    const MAX_TEXT_ONLY_RESPONSES = 3; // Max times AI can respond with only text before we re-prompt
    const tools = getOpenAITools();
    let textOnlyCount = 0;
    
    console.log(`[Amplifier] Starting agent loop with ${tools.length} tools available`);
    
    while (this.progress.iterations < MAX_ITERATIONS && !this.cancelled) {
      const elapsedMs = Date.now() - this.startTime.getTime();
      if (elapsedMs > this.maxRuntimeMs) {
        console.warn(`[Amplifier] Task ${this.id} reached max runtime (${this.maxRuntimeMs}ms)`);
        this.status = TaskStatus.COMPLETED;
        this.progress.progressPercent = 100;
        this.progress.currentStep = 'Completed (time limit reached)';
        this.result = {
          summary: `Time limit reached after ${Math.round(elapsedMs / 60000)} minutes. Partial results saved.`,
          actions: this.actionsHistory.map(a => a.tool)
        };
        this.endTime = new Date();
        await this.saveTaskHistory();
        await this.persistCompletion(TaskStatus.COMPLETED);
        this.emit('complete', this.getStatus());
        return;
      }

      this.progress.iterations++;
      this.progress.currentStep = `Working... (step ${this.progress.iterations})`;
      this.emit('progress', this.getStatus());
      
      try {
        console.log(`[Amplifier] Iteration ${this.progress.iterations}: calling Azure OpenAI`);

        this.messages = this.normalizeMessages(this.messages);
        this.compactMessagesIfNeeded();
        
        // Call Azure OpenAI with tools
        const response = await callAzureOpenAI(this.messages, tools, {
          temperature: this.options?.temperature ?? 0.3,
          max_tokens: this.options?.max_tokens ?? 4000
        });
        const choice = response.choices[0];
        const message = choice.message;
        
        // Add assistant message to history
        this.messages.push(message);
        
        // Check for tool calls (this is what makes it an AGENT)
        if (message.tool_calls && message.tool_calls.length > 0) {
          textOnlyCount = 0; // Reset text-only counter
          
          console.log(`[Amplifier] Iteration ${this.progress.iterations}: ${message.tool_calls.length} tool(s) to execute`);
          
          // Execute all tool calls
          for (const toolCall of message.tool_calls) {
            if (this.cancelled) break;
            
            const toolName = toolCall.function.name;
            let toolArgs = {};
            
            try {
              toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (parseError) {
              console.error(`[Amplifier] Failed to parse tool arguments for ${toolName}:`, toolCall.function.arguments);
              toolArgs = {};
            }
            
            console.log(`[Amplifier] Executing tool: ${toolName}`);
            this.progress.currentStep = this.getToolStepLabel(toolName, toolArgs);
            this.emit('progress', this.getStatus());
            
            // Execute the tool
            let result;
            try {
              result = await executeTool(toolName, toolArgs, {
                userId: this.userId,
                firmId: this.firmId,
                user: this.userRecord
              });
            } catch (toolError) {
              console.error(`[Amplifier] Tool ${toolName} execution failed:`, toolError);
              result = { error: toolError?.message || 'Tool execution failed' };
            }
            
            console.log(`[Amplifier] Tool ${toolName} result:`, result.success !== undefined ? (result.success ? 'success' : 'failed') : 'completed');
            
            // Track action in history
            this.actionsHistory.push({
              tool: toolName,
              args: toolArgs,
              result: result,
              timestamp: new Date()
            });
            
            // Add tool result to messages so AI knows what happened
            this.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            });

            this.recentTools.push(toolName);
            if (this.recentTools.length > 6) this.recentTools.shift();
            
            // Check for explicit task completion
            if (toolName === 'task_complete') {
              // QUALITY GATE: Enforce minimum work requirements
              const elapsedSeconds = (Date.now() - this.startTime.getTime()) / 1000;
              const actionCount = this.actionsHistory.length;
              const substantiveActions = this.actionsHistory.filter(a => 
                ['create_document', 'create_note', 'add_matter_note', 'create_task', 
                 'log_time', 'create_calendar_event', 'update_matter', 'draft_email_for_matter',
                 'search_case_law', 'summarize_document'].includes(a.tool)
              ).length;
              
              // Minimum requirements: 60 seconds AND at least 5 actions with 2+ substantive
              const MIN_SECONDS = 60;
              const MIN_ACTIONS = 5;
              const MIN_SUBSTANTIVE = 2;
              
              if (elapsedSeconds < MIN_SECONDS || actionCount < MIN_ACTIONS || substantiveActions < MIN_SUBSTANTIVE) {
                console.log(`[Amplifier] Task ${this.id} attempted early completion: ${elapsedSeconds.toFixed(0)}s, ${actionCount} actions, ${substantiveActions} substantive`);
                
                // Reject early completion - push message to continue
                toolCallResults.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    rejected: true,
                    reason: `Task completion rejected. Minimum requirements not met:
- Time: ${elapsedSeconds.toFixed(0)}s / ${MIN_SECONDS}s minimum
- Actions: ${actionCount} / ${MIN_ACTIONS} minimum  
- Substantive work: ${substantiveActions} / ${MIN_SUBSTANTIVE} minimum

You must do MORE WORK before completing. Continue with the task:
1. Create actual documents with real content (not placeholders)
2. Add detailed notes to the matter
3. Set up tasks and calendar events
4. Do thorough research if applicable
5. Generate professional work product

Keep working on: "${this.goal}"`
                  })
                });
                
                // Don't mark complete - continue the loop
                continue;
              }
              
              console.log(`[Amplifier] Task ${this.id} marked as complete (${elapsedSeconds.toFixed(0)}s, ${actionCount} actions, ${substantiveActions} substantive)`);
              this.status = TaskStatus.COMPLETED;
              this.progress.progressPercent = 100;
              this.progress.currentStep = 'Completed successfully';
              this.result = {
                summary: toolArgs.summary || 'Task completed',
                actions: toolArgs.actions_taken || this.actionsHistory.map(a => a.tool),
                recommendations: toolArgs.recommendations || [],
                stats: {
                  duration_seconds: elapsedSeconds,
                  total_actions: actionCount,
                  substantive_actions: substantiveActions
                }
              };
              this.endTime = new Date();
              
              // Save to history and extract learnings
              await this.saveTaskHistory();
              await this.persistCompletion(TaskStatus.COMPLETED);
              
              this.emit('complete', this.getStatus());
              return;
            }
            
            // Update progress based on planning tools
            if (toolName === 'think_and_plan') {
              this.plan = toolArgs;
              this.progress.totalSteps = (toolArgs.steps || []).length;
              this.progress.progressPercent = Math.min(15, this.progress.progressPercent + 10);
            }
            
            if (toolName === 'evaluate_progress') {
              const completed = (toolArgs.completed_steps || []).length;
              const total = completed + (toolArgs.remaining_steps || []).length;
              if (total > 0) {
                this.progress.completedSteps = completed;
                this.progress.progressPercent = Math.min(90, 15 + (75 * completed / total));
              }
              if (toolArgs.remaining_steps && toolArgs.remaining_steps.length > 0) {
                this.progress.currentStep = `Next: ${toolArgs.remaining_steps[0]}`;
              }
            }
            
            if (toolName === 'log_work') {
              // Increment progress for each logged work item
              this.progress.progressPercent = Math.min(90, this.progress.progressPercent + 5);
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

            if (this.recentTools.length === 6 && this.recentTools.every(t => t === toolName)) {
              this.messages.push({
                role: 'user',
                content: `You have used ${toolName} repeatedly without progress. Try a different tool or a new approach to complete: "${this.goal}".`
              });
            }

            await this.saveCheckpoint('periodic');
          }
        } else {
          // No tool calls - AI just responded with text
          textOnlyCount++;
          console.log(`[Amplifier] Iteration ${this.progress.iterations}: text-only response (count: ${textOnlyCount})`);
          
          // Check if finish_reason indicates completion
          if (choice.finish_reason === 'stop') {
            // If we've done some work and the AI seems done, complete the task
            if (this.actionsHistory.length > 0) {
              console.log(`[Amplifier] Task ${this.id} completed after ${this.actionsHistory.length} actions`);
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
              this.emit('complete', this.getStatus());
              return;
            }
            
            // If no actions were taken and AI just responded with text, prompt it to take action
            if (textOnlyCount < MAX_TEXT_ONLY_RESPONSES) {
              console.log(`[Amplifier] Re-prompting AI to take action`);
              this.messages.push({
                role: 'user',
                content: 'You must call tools to complete this task. Do NOT just respond with text. Start by calling think_and_plan, then execute the necessary tools. Call tools NOW.'
              });
            } else {
              // AI keeps responding with text only - something is wrong
              console.error(`[Amplifier] Task ${this.id} failed: AI not calling tools`);
              this.status = TaskStatus.FAILED;
              this.error = 'Agent did not execute any actions. The AI model may not support function calling.';
              this.endTime = new Date();
              await this.saveTaskHistory();
              await this.persistCompletion(TaskStatus.FAILED);
              this.emit('error', new Error(this.error));
              return;
            }
          }
        }
        
        // Gradual progress update
        if (this.progress.progressPercent < 90) {
          const increment = Math.max(1, Math.round(60 / Math.max(1, MAX_ITERATIONS)));
          this.progress.progressPercent = Math.min(90, this.progress.progressPercent + increment);
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
          this.progress.currentStep = `Rate limited - retrying in ${Math.round(safeDelay / 1000)}s`;
          await sleep(safeDelay);
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
        
        // For other errors, add to messages and let AI recover
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
      this.emit('complete', this.getStatus());
    }
  }

  /**
   * Save task to history and extract learnings
   */
  async saveTaskHistory() {
    try {
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
        this.endTime,
        Math.round((this.endTime - this.startTime) / 1000),
        this.progress.iterations,
        this.result?.summary,
        JSON.stringify(this.actionsHistory.map(a => ({ tool: a.tool, args: a.args }))),
        JSON.stringify(this.result),
        this.error
      ]);
      
      // Extract and save learnings
      await this.extractLearnings();
      
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
    this.persistCompletion(TaskStatus.CANCELLED);
    this.emit('cancelled', this.getStatus());
    return true;
  }

  /**
   * Get current status
   */
  getStatus() {
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
      duration: this.endTime 
        ? (this.endTime - this.startTime) / 1000 
        : (new Date() - this.startTime) / 1000
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
   */
  async configure() {
    if (this.configured) return true;
    
    const available = await this.checkAvailability();
    if (!available) {
      const config = getAzureConfig();
      console.warn('[AmplifierService] Azure OpenAI credentials not configured');
      console.warn('[AmplifierService] AZURE_OPENAI_ENDPOINT:', config.endpoint ? `set (${config.endpoint})` : 'MISSING');
      console.warn('[AmplifierService] AZURE_OPENAI_API_KEY:', config.apiKey ? `set (length: ${config.apiKey.length})` : 'MISSING');
      console.warn('[AmplifierService] AZURE_OPENAI_DEPLOYMENT:', config.deployment ? `set (${config.deployment})` : 'MISSING');
      return false;
    }

    const config = getAzureConfig();
    
    // Verify tools are loaded correctly
    const tools = getOpenAITools();
    if (!tools || tools.length === 0) {
      console.error('[AmplifierService] No tools available - check import from aiAgent.js');
      return false;
    }
    
    this.configured = true;
    console.log('[AmplifierService] Configured with Azure OpenAI (same as aiAgent.js)');
    console.log('[AmplifierService] Using API version:', API_VERSION);
    console.log('[AmplifierService] Endpoint:', config.endpoint);
    console.log('[AmplifierService] Deployment:', config.deployment);
    console.log('[AmplifierService] Tools available:', tools.length);
    return true;
  }

  /**
   * Resume background tasks from checkpoints after restart
   */
  async resumePendingTasks() {
    if (!persistenceAvailable) return;
    try {
      const result = await query(
        `SELECT id, firm_id, user_id, goal, status, progress, result, error, iterations, max_iterations, options, checkpoint, started_at
         FROM ai_background_tasks
         WHERE status IN ('running', 'pending') AND checkpoint IS NOT NULL`
      );

      for (const row of result.rows) {
        if (this.tasks.has(row.id)) continue;
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
          console.error(`[AmplifierService] Resumed task ${task.id} failed:`, err);
        });
      }
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

export default amplifierService;
export { AmplifierService, BackgroundTask, TaskStatus };
