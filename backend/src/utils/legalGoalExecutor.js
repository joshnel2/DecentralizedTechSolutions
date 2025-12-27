/**
 * Legal Goal Executor - Autonomous Background Agent
 * 
 * Implements a sophisticated background worker that:
 * 1. Accepts complex legal goals
 * 2. Uses GPT-5-mini with reasoning_effort: "low" for planning
 * 3. Executes a recursive Plan-Execute-Reflect loop
 * 4. Updates Case State at each step for attorney visibility
 * 
 * @module LegalGoalExecutor
 */

import { query, withTransaction } from '../db/connection.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Azure OpenAI configuration for GPT-5-mini
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;

// GPT-5-mini deployment name - can be configured separately
const GPT5_MINI_DEPLOYMENT = process.env.AZURE_GPT5_MINI_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5-mini';

// API version that supports reasoning_effort
const API_VERSION = '2024-12-01-preview';

// Token limits for efficient context management (400k context window)
const MAX_CONTEXT_TOKENS = 350000; // Leave buffer for response
const MAX_RESPONSE_TOKENS = 8192;
const CONTEXT_SUMMARY_THRESHOLD = 200000; // Summarize when exceeding this

// Execution timeouts
const MAX_EXECUTION_TIME_MS = 15 * 60 * 1000; // 15 minutes
const STEP_DELAY_MS = 1000; // Delay between steps for rate limiting
const API_RETRY_DELAY_MS = 3000;

// =============================================================================
// AGENT STATUS CONSTANTS
// =============================================================================

export const AgentStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  THINKING: 'thinking',
  EXECUTING_TOOL: 'executing_tool',
  REFLECTING: 'reflecting',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

export const ExecutionPhase = {
  PLANNING: 'planning',
  EXECUTING: 'executing',
  REFLECTING: 'reflecting',
  SUMMARIZING: 'summarizing'
};

// =============================================================================
// GPT-5-MINI CALLER WITH REASONING EFFORT
// =============================================================================

/**
 * Call Azure OpenAI GPT-5-mini with reasoning_effort support
 * Optimized for complex legal reasoning tasks
 * 
 * @param {Array} messages - Chat messages array
 * @param {Array} tools - Available tools/functions
 * @param {Object} options - Additional options
 * @returns {Object} Response with content and tool_calls
 */
export async function callGPT5Mini(messages, tools = [], options = {}) {
  const endpoint = AZURE_ENDPOINT?.endsWith('/') ? AZURE_ENDPOINT.slice(0, -1) : AZURE_ENDPOINT;
  const deployment = options.deployment || GPT5_MINI_DEPLOYMENT;
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${API_VERSION}`;
  
  if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
    throw new Error('Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY.');
  }
  
  // Build request body with GPT-5-mini specific parameters
  const requestBody = {
    messages,
    temperature: options.temperature ?? 0.2, // Lower for more consistent reasoning
    max_completion_tokens: options.maxTokens ?? MAX_RESPONSE_TOKENS,
    top_p: options.topP ?? 0.95,
    frequency_penalty: 0,
    presence_penalty: 0,
  };
  
  // Add reasoning_effort parameter for GPT-5-mini
  // "low" is recommended for planning phase - faster, more cost-effective
  // "medium" or "high" for complex analysis steps
  if (options.reasoningEffort) {
    requestBody.reasoning_effort = options.reasoningEffort;
  } else {
    // Default to low for efficiency
    requestBody.reasoning_effort = 'low';
  }
  
  // Add tools if provided
  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = options.toolChoice ?? 'auto';
    requestBody.parallel_tool_calls = false; // Sequential for legal accuracy
  }
  
  let lastError = null;
  const maxRetries = options.maxRetries ?? 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_API_KEY,
        },
        body: JSON.stringify(requestBody),
      });
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '10', 10);
        console.log(`[GPT5-MINI] Rate limited. Waiting ${retryAfter}s before retry...`);
        await delay(retryAfter * 1000);
        continue;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Azure OpenAI error ${response.status}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
          
          // Context length handling
          if (errorJson.error?.code === 'context_length_exceeded') {
            throw new Error('CONTEXT_LENGTH_EXCEEDED');
          }
        } catch (e) {
          if (e.message === 'CONTEXT_LENGTH_EXCEEDED') throw e;
          errorMessage = errorText.substring(0, 200);
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('Azure OpenAI returned empty response');
      }
      
      const choice = data.choices[0];
      
      return {
        content: choice.message.content,
        tool_calls: choice.message.tool_calls,
        finish_reason: choice.finish_reason,
        usage: data.usage ? {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
          reasoning_tokens: data.usage.completion_tokens_details?.reasoning_tokens || 0
        } : null,
        model: data.model
      };
      
    } catch (error) {
      lastError = error;
      
      if (error.message === 'CONTEXT_LENGTH_EXCEEDED') {
        throw error; // Don't retry, caller needs to handle
      }
      
      if (attempt < maxRetries) {
        console.log(`[GPT5-MINI] Attempt ${attempt} failed: ${error.message}. Retrying...`);
        await delay(API_RETRY_DELAY_MS * attempt);
      }
    }
  }
  
  throw lastError || new Error('GPT-5-mini call failed after retries');
}

// =============================================================================
// TOKEN MANAGEMENT FOR 400K CONTEXT
// =============================================================================

/**
 * Estimate token count for a string (rough approximation)
 * ~4 characters per token for English text
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens for messages array
 */
function estimateMessagesTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content || '');
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokens(tc.function?.arguments || '');
      }
    }
  }
  return total;
}

/**
 * Summarize accumulated context to manage token usage
 */
async function summarizeContext(accumulatedContext) {
  const summaryPrompt = `Summarize the following task execution context into a concise summary that preserves key information:

KEY FINDINGS:
${accumulatedContext.key_findings.join('\n') || 'None yet'}

ACTIONS TAKEN:
${accumulatedContext.actions_taken.map(a => `- ${a.tool}: ${a.summary}`).join('\n') || 'None yet'}

CURRENT SUMMARY:
${accumulatedContext.summary || 'Just started'}

Provide a concise summary (max 500 words) that captures:
1. Important discoveries
2. Actions completed
3. Current status
4. Next steps needed`;

  try {
    const response = await callGPT5Mini(
      [{ role: 'user', content: summaryPrompt }],
      [],
      { reasoningEffort: 'low', maxTokens: 1000 }
    );
    
    return response.content || accumulatedContext.summary;
  } catch (error) {
    console.error('[CONTEXT] Failed to summarize:', error.message);
    return accumulatedContext.summary;
  }
}

// =============================================================================
// CASE STATE MANAGEMENT
// =============================================================================

/**
 * Update case state in database for attorney visibility
 */
async function updateCaseState(firmId, matterId, taskId, stateType, stateData, summary, userId) {
  try {
    // Upsert case state
    await query(
      `INSERT INTO case_state (firm_id, matter_id, ai_task_id, state_type, state_data, summary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (matter_id, state_type) 
       DO UPDATE SET state_data = $5, summary = $6, updated_at = NOW()`,
      [firmId, matterId, taskId, stateType, JSON.stringify(stateData), summary, userId]
    ).catch(() => {
      // If conflict clause doesn't work, try simple insert
      return query(
        `INSERT INTO case_state (firm_id, matter_id, ai_task_id, state_type, state_data, summary, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [firmId, matterId, taskId, stateType, JSON.stringify(stateData), summary, userId]
      );
    });
  } catch (error) {
    console.error('[CASE_STATE] Update failed:', error.message);
  }
}

// =============================================================================
// LEGAL GOAL EXECUTOR - MAIN CLASS
// =============================================================================

export class LegalGoalExecutor {
  constructor(taskId, user, goal, context = {}) {
    this.taskId = taskId;
    this.user = user;
    this.goal = goal;
    this.context = context;
    this.plan = [];
    this.currentStep = 0;
    this.accumulatedContext = {
      summary: '',
      key_findings: [],
      actions_taken: []
    };
    this.tokenUsage = {
      total_prompt: 0,
      total_completion: 0
    };
    this.startTime = Date.now();
    this.cancelled = false;
    this.tools = [];
  }
  
  /**
   * Set available tools for execution
   */
  setTools(tools) {
    this.tools = tools;
  }
  
  /**
   * Set tool executor function
   */
  setToolExecutor(executorFn) {
    this.executeTool = executorFn;
  }
  
  /**
   * Check if execution should continue
   */
  shouldContinue() {
    if (this.cancelled) return false;
    if (Date.now() - this.startTime > MAX_EXECUTION_TIME_MS) return false;
    return true;
  }
  
  /**
   * Update task status in database
   */
  async updateStatus(agentStatus, currentStep, additionalData = {}) {
    try {
      await query(
        `UPDATE ai_tasks SET 
         agent_status = $1,
         current_step = $2,
         current_phase = $3,
         iterations = $4,
         token_usage = $5,
         accumulated_context = $6,
         last_tool_called = $7,
         progress = $8,
         updated_at = NOW()
         WHERE id = $9`,
        [
          agentStatus,
          currentStep,
          additionalData.phase || ExecutionPhase.EXECUTING,
          this.currentStep,
          JSON.stringify(this.tokenUsage),
          JSON.stringify(this.accumulatedContext),
          additionalData.lastTool || null,
          JSON.stringify({
            status: agentStatus,
            step: this.currentStep,
            totalSteps: this.plan.length,
            progressPercent: this.plan.length > 0 
              ? Math.round((this.currentStep / this.plan.length) * 100) 
              : 0,
            elapsedMs: Date.now() - this.startTime,
            ...additionalData
          }),
          this.taskId
        ]
      );
    } catch (error) {
      console.error(`[EXECUTOR ${this.taskId}] Status update failed:`, error.message);
    }
  }
  
  /**
   * PHASE 1: Create execution plan using GPT-5-mini
   */
  async createPlan() {
    console.log(`[EXECUTOR ${this.taskId}] Creating execution plan...`);
    
    await this.updateStatus(AgentStatus.THINKING, 'Creating execution plan...', {
      phase: ExecutionPhase.PLANNING
    });
    
    const planningPrompt = this.buildPlanningPrompt();
    
    try {
      const response = await callGPT5Mini(
        [{ role: 'user', content: planningPrompt }],
        [],
        { reasoningEffort: 'low' } // Low effort for planning - fast and efficient
      );
      
      // Track token usage
      if (response.usage) {
        this.tokenUsage.total_prompt += response.usage.prompt_tokens;
        this.tokenUsage.total_completion += response.usage.completion_tokens;
      }
      
      // Parse plan from response
      this.plan = this.parsePlanFromResponse(response.content);
      
      console.log(`[EXECUTOR ${this.taskId}] Plan created with ${this.plan.length} steps`);
      
      // Store plan in database
      await query(
        `UPDATE ai_tasks SET 
         execution_plan = $1,
         plan = $1,
         model_used = $2,
         updated_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(this.plan), response.model || GPT5_MINI_DEPLOYMENT, this.taskId]
      );
      
      return this.plan;
      
    } catch (error) {
      console.error(`[EXECUTOR ${this.taskId}] Planning failed:`, error.message);
      
      // Create fallback plan
      this.plan = [
        'Gather relevant information about the request',
        'Analyze the situation',
        'Take appropriate action',
        'Document findings and results'
      ];
      
      return this.plan;
    }
  }
  
  /**
   * Build the planning prompt
   */
  buildPlanningPrompt() {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    
    return `You are a senior legal AI assistant. Create a detailed execution plan for the following legal task.

## TASK/GOAL
${this.goal}

## CONTEXT
- User: ${this.user.firstName} ${this.user.lastName} (${this.user.role})
- Date: ${today}
- Firm ID: ${this.user.firmId}
${this.context.matter_id ? `- Matter ID: ${this.context.matter_id}` : ''}
${this.context.client_id ? `- Client ID: ${this.context.client_id}` : ''}
${this.context.documents ? `- Documents to review: ${this.context.documents.length}` : ''}

## AVAILABLE CAPABILITIES
- Search and retrieve matters, clients, documents
- Read and analyze document contents
- Create notes, tasks, calendar events
- Draft emails and documents
- Log time entries
- Generate reports

## YOUR TASK
Create a numbered step-by-step plan to accomplish this goal. Each step should be:
1. Specific and actionable  
2. Build toward the final goal
3. Include what information to gather and what actions to take

## OUTPUT FORMAT (JSON)
{
  "plan": [
    "Step 1: Description of action",
    "Step 2: Description of action",
    ...
  ],
  "estimated_duration_minutes": 5,
  "approach_summary": "Brief description of approach"
}

Keep the plan focused. Aim for 5-15 steps depending on complexity.`;
  }
  
  /**
   * Parse plan from AI response
   */
  parsePlanFromResponse(content) {
    if (!content) return [];
    
    try {
      // Try JSON parsing first
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.plan) && parsed.plan.length > 0) {
          return parsed.plan;
        }
      }
    } catch (e) {
      // Fall through to line parsing
    }
    
    // Extract numbered list
    const lines = content.split('\n');
    const plan = lines
      .filter(l => /^\d+[\.\):]/.test(l.trim()))
      .map(l => l.replace(/^\d+[\.\):]\s*/, '').trim())
      .filter(l => l.length > 0);
    
    return plan.length > 0 ? plan : ['Execute the requested task'];
  }
  
  /**
   * PHASE 2: Execute plan steps
   */
  async executePlan() {
    console.log(`[EXECUTOR ${this.taskId}] Starting execution phase...`);
    
    for (this.currentStep = 0; this.currentStep < this.plan.length; this.currentStep++) {
      if (!this.shouldContinue()) {
        console.log(`[EXECUTOR ${this.taskId}] Execution stopped - ${this.cancelled ? 'cancelled' : 'timeout'}`);
        break;
      }
      
      const step = this.plan[this.currentStep];
      console.log(`[EXECUTOR ${this.taskId}] Executing step ${this.currentStep + 1}/${this.plan.length}: ${step}`);
      
      try {
        await this.executeStep(step);
      } catch (error) {
        console.error(`[EXECUTOR ${this.taskId}] Step ${this.currentStep + 1} failed:`, error.message);
        
        // Record failure but continue
        this.accumulatedContext.actions_taken.push({
          step: this.currentStep + 1,
          tool: 'error',
          summary: `Failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Check if we need to summarize context
      const contextTokens = estimateMessagesTokens([{ content: JSON.stringify(this.accumulatedContext) }]);
      if (contextTokens > CONTEXT_SUMMARY_THRESHOLD) {
        console.log(`[EXECUTOR ${this.taskId}] Context getting large (${contextTokens} tokens), summarizing...`);
        this.accumulatedContext.summary = await summarizeContext(this.accumulatedContext);
        // Clear detailed lists after summarizing
        this.accumulatedContext.key_findings = [];
        this.accumulatedContext.actions_taken = this.accumulatedContext.actions_taken.slice(-5);
      }
      
      // Small delay between steps
      await delay(STEP_DELAY_MS);
      
      // PHASE 3: Reflect after every few steps
      if ((this.currentStep + 1) % 3 === 0 && this.currentStep < this.plan.length - 1) {
        await this.reflect();
      }
    }
    
    return this.accumulatedContext;
  }
  
  /**
   * Execute a single step
   */
  async executeStep(stepDescription) {
    // Update status to thinking
    await this.updateStatus(AgentStatus.THINKING, stepDescription, {
      phase: ExecutionPhase.EXECUTING
    });
    
    // Build step execution prompt
    const stepPrompt = this.buildStepPrompt(stepDescription);
    
    // Get AI response with tool call
    const response = await callGPT5Mini(
      [
        { role: 'system', content: this.buildExecutionSystemPrompt() },
        { role: 'user', content: stepPrompt }
      ],
      this.tools,
      { reasoningEffort: 'low' }
    );
    
    // Track tokens
    if (response.usage) {
      this.tokenUsage.total_prompt += response.usage.prompt_tokens;
      this.tokenUsage.total_completion += response.usage.completion_tokens;
    }
    
    // Execute tool if called
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolCall = response.tool_calls[0];
      const functionName = toolCall.function.name;
      let functionArgs = {};
      
      try {
        functionArgs = JSON.parse(toolCall.function.arguments || '{}');
      } catch (e) {
        console.error(`[EXECUTOR ${this.taskId}] Failed to parse tool args`);
      }
      
      // Update status to executing
      await this.updateStatus(AgentStatus.EXECUTING_TOOL, `Executing: ${functionName}`, {
        phase: ExecutionPhase.EXECUTING,
        lastTool: functionName
      });
      
      // Execute the tool
      if (this.executeTool) {
        const result = await this.executeTool(functionName, functionArgs, this.user);
        
        // Record action
        const actionSummary = this.buildActionSummary(functionName, functionArgs, result);
        this.accumulatedContext.actions_taken.push({
          step: this.currentStep + 1,
          tool: functionName,
          args: functionArgs,
          summary: actionSummary,
          success: !result.error,
          timestamp: new Date().toISOString()
        });
        
        // Extract key findings
        if (result && !result.error) {
          this.extractKeyFindings(functionName, result);
        }
        
        // Update case state if matter is involved
        if (this.context.matter_id) {
          await updateCaseState(
            this.user.firmId,
            this.context.matter_id,
            this.taskId,
            'agent_progress',
            {
              step: this.currentStep + 1,
              totalSteps: this.plan.length,
              lastAction: actionSummary
            },
            `AI Agent: Step ${this.currentStep + 1}/${this.plan.length} - ${actionSummary}`,
            this.user.id
          );
        }
        
        return result;
      }
    }
    
    // No tool called - record text response
    if (response.content) {
      this.accumulatedContext.key_findings.push(response.content.substring(0, 500));
    }
    
    return { message: response.content };
  }
  
  /**
   * Build execution system prompt
   */
  buildExecutionSystemPrompt() {
    return `You are an autonomous legal AI agent executing a planned task.

GOAL: ${this.goal}

CURRENT CONTEXT SUMMARY:
${this.accumulatedContext.summary || 'Just started'}

RECENT ACTIONS:
${this.accumulatedContext.actions_taken.slice(-5).map(a => `- ${a.tool}: ${a.summary}`).join('\n') || 'None yet'}

KEY FINDINGS SO FAR:
${this.accumulatedContext.key_findings.slice(-5).join('\n') || 'None yet'}

RULES:
1. Call exactly ONE tool per response
2. Use specific IDs from previous results
3. Be thorough and accurate
4. Document important findings`;
  }
  
  /**
   * Build step execution prompt
   */
  buildStepPrompt(stepDescription) {
    return `Execute this step: ${stepDescription}

You are on step ${this.currentStep + 1} of ${this.plan.length}.

${this.context.matter_id ? `Matter ID: ${this.context.matter_id}` : ''}
${this.context.client_id ? `Client ID: ${this.context.client_id}` : ''}

Call the appropriate tool to complete this step.`;
  }
  
  /**
   * PHASE 3: Reflect on progress
   */
  async reflect() {
    console.log(`[EXECUTOR ${this.taskId}] Reflecting on progress...`);
    
    await this.updateStatus(AgentStatus.THINKING, 'Evaluating progress...', {
      phase: ExecutionPhase.REFLECTING
    });
    
    const reflectionPrompt = `You are ${this.currentStep + 1}/${this.plan.length} steps through your plan.

GOAL: ${this.goal}

PLAN:
${this.plan.map((s, i) => `${i < this.currentStep ? '✓' : i === this.currentStep ? '→' : '○'} ${i + 1}. ${s}`).join('\n')}

ACTIONS COMPLETED:
${this.accumulatedContext.actions_taken.slice(-5).map(a => `- ${a.tool}: ${a.summary}`).join('\n')}

KEY FINDINGS:
${this.accumulatedContext.key_findings.slice(-5).join('\n') || 'None yet'}

QUESTIONS:
1. Are you making progress toward the goal?
2. Should any steps be modified based on discoveries?
3. Is anything blocking progress?

Briefly reflect (1-2 sentences) and suggest any plan adjustments needed. If the goal is achieved, say "GOAL COMPLETE".`;

    try {
      const response = await callGPT5Mini(
        [{ role: 'user', content: reflectionPrompt }],
        [],
        { reasoningEffort: 'low', maxTokens: 500 }
      );
      
      if (response.usage) {
        this.tokenUsage.total_prompt += response.usage.prompt_tokens;
        this.tokenUsage.total_completion += response.usage.completion_tokens;
      }
      
      const reflection = response.content || '';
      console.log(`[EXECUTOR ${this.taskId}] Reflection: ${reflection.substring(0, 200)}`);
      
      // Check if goal is complete early
      if (reflection.toUpperCase().includes('GOAL COMPLETE') || reflection.toUpperCase().includes('MISSION COMPLETE')) {
        console.log(`[EXECUTOR ${this.taskId}] Goal achieved early!`);
        this.currentStep = this.plan.length; // End loop
      }
      
      // Update summary with reflection
      this.accumulatedContext.summary = reflection;
      
    } catch (error) {
      console.error(`[EXECUTOR ${this.taskId}] Reflection failed:`, error.message);
    }
  }
  
  /**
   * Build action summary from tool result
   */
  buildActionSummary(functionName, args, result) {
    if (result.error) {
      return `Error: ${result.error}`;
    }
    
    switch (functionName) {
      case 'get_matter':
        return `Retrieved matter: ${result.matter?.name || 'unknown'}`;
      case 'search_matters':
        return `Found ${result.matters?.length || 0} matters`;
      case 'get_client':
        return `Retrieved client: ${result.client?.display_name || 'unknown'}`;
      case 'read_document_content':
        return `Read document content (${result.content?.length || 0} chars)`;
      case 'create_document':
        return `Created document: ${args.name || 'document'}`;
      case 'create_task':
        return `Created task: ${args.title || 'task'}`;
      case 'create_calendar_event':
        return `Created event: ${args.title || 'event'}`;
      case 'add_matter_note':
        return `Added note to matter`;
      case 'log_time':
        return `Logged ${args.hours}hrs on matter`;
      default:
        return result.message || result.summary || `Executed ${functionName}`;
    }
  }
  
  /**
   * Extract key findings from tool results
   */
  extractKeyFindings(functionName, result) {
    switch (functionName) {
      case 'get_matter':
        if (result.matter) {
          this.accumulatedContext.key_findings.push(
            `Matter: ${result.matter.name} (${result.matter.status}) - ${result.matter.type}`
          );
        }
        break;
      case 'read_document_content':
        if (result.content) {
          // Extract first 200 chars as finding
          this.accumulatedContext.key_findings.push(
            `Document content preview: ${result.content.substring(0, 200)}...`
          );
        }
        break;
      case 'search_matters':
        if (result.matters?.length) {
          this.accumulatedContext.key_findings.push(
            `Found matters: ${result.matters.map(m => m.name).join(', ')}`
          );
        }
        break;
    }
  }
  
  /**
   * Generate final summary
   */
  async generateSummary() {
    console.log(`[EXECUTOR ${this.taskId}] Generating final summary...`);
    
    await this.updateStatus(AgentStatus.THINKING, 'Generating summary...', {
      phase: ExecutionPhase.SUMMARIZING
    });
    
    const summaryPrompt = `Summarize the results of this completed task:

GOAL: ${this.goal}

ACTIONS TAKEN:
${this.accumulatedContext.actions_taken.map(a => `- ${a.summary}`).join('\n')}

KEY FINDINGS:
${this.accumulatedContext.key_findings.join('\n') || 'None recorded'}

Provide a professional summary suitable for an attorney to read. Include:
1. What was accomplished
2. Key findings or insights
3. Any recommendations or next steps`;

    try {
      const response = await callGPT5Mini(
        [{ role: 'user', content: summaryPrompt }],
        [],
        { reasoningEffort: 'low', maxTokens: 1500 }
      );
      
      if (response.usage) {
        this.tokenUsage.total_prompt += response.usage.prompt_tokens;
        this.tokenUsage.total_completion += response.usage.completion_tokens;
      }
      
      return response.content || 'Task completed.';
      
    } catch (error) {
      console.error(`[EXECUTOR ${this.taskId}] Summary generation failed:`, error.message);
      return `Task completed with ${this.accumulatedContext.actions_taken.length} actions.`;
    }
  }
  
  /**
   * Main execution entry point
   */
  async execute() {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`║ LEGAL GOAL EXECUTOR - STARTING`);
    console.log(`║ Task ID: ${this.taskId}`);
    console.log(`║ Goal: ${this.goal.substring(0, 60)}${this.goal.length > 60 ? '...' : ''}`);
    console.log(`${'═'.repeat(70)}\n`);
    
    try {
      // Mark as running
      await query(
        `UPDATE ai_tasks SET 
         status = 'running',
         agent_status = $1,
         started_at = NOW(),
         updated_at = NOW()
         WHERE id = $2`,
        [AgentStatus.RUNNING, this.taskId]
      );
      
      // Phase 1: Planning
      await this.createPlan();
      
      if (!this.shouldContinue()) {
        throw new Error(this.cancelled ? 'Cancelled' : 'Timeout during planning');
      }
      
      // Phase 2: Execution (includes Phase 3: Reflection)
      await this.executePlan();
      
      // Generate summary
      const summary = await this.generateSummary();
      
      // Mark completed
      await query(
        `UPDATE ai_tasks SET 
         status = 'completed',
         agent_status = $1,
         completed_at = NOW(),
         result = $2,
         token_usage = $3,
         accumulated_context = $4,
         progress = $5,
         updated_at = NOW()
         WHERE id = $6`,
        [
          AgentStatus.COMPLETED,
          summary,
          JSON.stringify(this.tokenUsage),
          JSON.stringify(this.accumulatedContext),
          JSON.stringify({
            status: 'completed',
            progressPercent: 100,
            totalSteps: this.plan.length,
            completedSteps: this.currentStep,
            totalActions: this.accumulatedContext.actions_taken.length
          }),
          this.taskId
        ]
      );
      
      console.log(`[EXECUTOR ${this.taskId}] ✓ Task completed successfully`);
      return { success: true, summary };
      
    } catch (error) {
      console.error(`[EXECUTOR ${this.taskId}] ✗ Task failed:`, error.message);
      
      // Mark failed
      await query(
        `UPDATE ai_tasks SET 
         status = 'error',
         agent_status = $1,
         completed_at = NOW(),
         error = $2,
         result = $3,
         updated_at = NOW()
         WHERE id = $4`,
        [
          AgentStatus.FAILED,
          error.message,
          `Task failed after ${this.accumulatedContext.actions_taken.length} actions: ${error.message}`,
          this.taskId
        ]
      );
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Cancel execution
   */
  cancel() {
    this.cancelled = true;
    console.log(`[EXECUTOR ${this.taskId}] Marked for cancellation`);
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  LegalGoalExecutor,
  callGPT5Mini,
  AgentStatus,
  ExecutionPhase
};
