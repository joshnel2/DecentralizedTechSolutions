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
import { AMPLIFIER_TOOLS, executeTool } from './amplifier/toolBridge.js';

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
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Azure OpenAI with function calling and AUTOMATIC RETRY
 * Uses the SAME configuration and request format as the normal AI agent (aiAgent.js)
 * This ensures the background agent behaves identically to the normal agent
 * 
 * Includes exponential backoff retry for transient failures (429, 500, 502, 503, 504)
 */
async function callAzureOpenAI(messages, tools = [], options = {}) {
  const config = getAzureConfig();
  const MAX_RETRIES = 4;
  const INITIAL_DELAY = 2000; // 2 seconds
  
  // Validate configuration before making request
  if (!config.endpoint || !config.apiKey || !config.deployment) {
    throw new Error('Azure OpenAI not configured: missing endpoint, API key, or deployment');
  }
  
  // Build URL - ensure endpoint ends properly
  const endpoint = config.endpoint.endsWith('/') ? config.endpoint.slice(0, -1) : config.endpoint;
  const url = `${endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${API_VERSION}`;
  
  // Match the EXACT request body format as aiAgent.js for consistency
  const body = {
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 4000,
    top_p: 0.95,
  };
  
  // Add tools for function calling (agent mode)
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Amplifier] Calling Azure OpenAI (attempt ${attempt}/${MAX_RETRIES}): ${config.deployment} with ${tools.length} tools`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': config.apiKey,
        },
        body: JSON.stringify(body),
      });
      
      // Check for retryable status codes
      const retryableStatuses = [429, 500, 502, 503, 504];
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // Parse error for better messaging
        let errorMessage = `Azure OpenAI API error: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch {
          errorMessage = `Azure OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`;
        }
        
        // Retry if this is a transient error and we have attempts left
        if (retryableStatuses.includes(response.status) && attempt < MAX_RETRIES) {
          const delay = INITIAL_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`[Amplifier] Retryable error (${response.status}), waiting ${delay}ms before retry...`);
          await sleep(delay);
          lastError = new Error(errorMessage);
          continue;
        }
        
        console.error('[Amplifier] Azure OpenAI error:', errorText);
        console.error('[Amplifier] Request URL:', url);
        console.error('[Amplifier] Deployment:', config.deployment);
        console.error('[Amplifier] Status:', response.status);
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log(`[Amplifier] Azure OpenAI response received, choices: ${data.choices?.length || 0}`);
      return data;
      
    } catch (error) {
      lastError = error;
      
      // If it's a network error and we have attempts left, retry
      if (error.name === 'TypeError' && error.message.includes('fetch') && attempt < MAX_RETRIES) {
        const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
        console.log(`[Amplifier] Network error, waiting ${delay}ms before retry...`);
        await sleep(delay);
        continue;
      }
      
      // If it's not retryable, throw immediately
      if (!lastError.message?.includes('429') && 
          !lastError.message?.includes('500') && 
          !lastError.message?.includes('502') &&
          !lastError.message?.includes('503') &&
          !lastError.message?.includes('504')) {
        throw error;
      }
      
      // On last attempt, throw
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      
      const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
      console.log(`[Amplifier] Error on attempt ${attempt}, waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }
  
  throw lastError || new Error('Failed after maximum retries');
}

/**
 * Convert our tool definitions to OpenAI function format
 */
function getOpenAITools() {
  return Object.entries(AMPLIFIER_TOOLS).map(([name, tool]) => ({
    type: 'function',
    function: {
      name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, desc]) => {
            const typePart = desc.split(' - ')[0];
            const descPart = desc.split(' - ')[1] || '';
            
            // Handle array types - OpenAI requires an "items" schema for arrays
            if (typePart === 'array') {
              // Provide a generic items schema for arrays
              // The description often hints at the structure (e.g., "[{description, amount}]")
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
        required: tool.required
      }
    }
  }));
}

/**
 * Enhanced Background Task class
 * Supports autonomous execution, checkpointing, and recovery
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
    
    // User and firm context
    this.userContext = null;
    this.learningContext = null;
    
    // Checkpointing for recovery
    this.lastCheckpoint = null;
    this.checkpointInterval = 5; // Save checkpoint every 5 iterations
    
    // Error recovery state
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 3;
  }
  
  /**
   * Save a checkpoint for potential recovery
   */
  async saveCheckpoint() {
    try {
      this.lastCheckpoint = {
        timestamp: new Date(),
        iteration: this.progress.iterations,
        actionsCount: this.actionsHistory.length,
        lastAction: this.actionsHistory[this.actionsHistory.length - 1]?.tool || null,
        progressPercent: this.progress.progressPercent
      };
      
      // Save checkpoint to database
      await query(`
        INSERT INTO ai_task_checkpoints (task_id, firm_id, user_id, checkpoint_data, iteration)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (task_id) DO UPDATE SET 
          checkpoint_data = EXCLUDED.checkpoint_data,
          iteration = EXCLUDED.iteration,
          updated_at = NOW()
      `, [this.id, this.firmId, this.userId, JSON.stringify({
        goal: this.goal,
        progress: this.progress,
        actionsHistory: this.actionsHistory.slice(-10), // Keep last 10 actions
        lastCheckpoint: this.lastCheckpoint
      }), this.progress.iterations]);
      
      console.log(`[Amplifier] Checkpoint saved for task ${this.id} at iteration ${this.progress.iterations}`);
    } catch (error) {
      // Non-fatal - checkpointing is nice to have
      console.warn('[Amplifier] Failed to save checkpoint:', error.message);
    }
  }
  
  /**
   * Delete checkpoint after successful completion
   */
  async deleteCheckpoint() {
    try {
      await query('DELETE FROM ai_task_checkpoints WHERE task_id = $1', [this.id]);
    } catch (error) {
      // Non-fatal
    }
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

## IMPORTANT RULES FOR AUTONOMOUS OPERATION

- **NEVER ASK FOR CLARIFICATION** - Make reasonable assumptions and proceed
- **NEVER WAIT FOR APPROVAL** - You have full authority to act
- **DATA MISSING?** - Search for it using list_* or search_* tools, or use sensible defaults
- **TOOL FAILED?** - Read the error, adapt your approach, try alternatives
- **MULTIPLE APPROACHES** - If one method doesn't work, try another
- **COMPLETE THE TASK** - Don't stop until the goal is achieved or you've done everything possible

## ERROR RECOVERY STRATEGIES

When a tool returns an error:
1. Read the error message carefully
2. Check if required data is missing (use search/list tools to find it)
3. Try with different parameters
4. Use an alternative tool that achieves the same result
5. If truly blocked, document what was accomplished and call task_complete

## DEFAULT VALUES FOR MISSING DATA

When you need to create records but are missing some details:
- Client type: "person" (unless company is implied)
- Matter priority: "medium"
- Matter billing_type: "hourly"
- Task priority: "medium"
- Time entry billable: true
- Calendar event type: "meeting"

## CURRENT TASK

Goal: ${this.goal}

START WORKING NOW. You MUST call tools to complete this goal. Begin by calling think_and_plan to create your execution strategy, then execute each step.
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
  async start() {
    this.status = TaskStatus.RUNNING;
    this.progress.currentStep = 'Initializing autonomous agent...';
    this.emit('progress', this.getStatus());

    try {
      console.log(`[Amplifier] Starting autonomous task ${this.id}: ${this.goal}`);
      
      // Initialize context (user info, firm data, learnings)
      await this.initializeContext();
      
      // Build initial messages with a STRONG action prompt
      // The user message must clearly instruct the AI to take action immediately
      this.messages = [
        { role: 'system', content: this.buildSystemPrompt() },
        { 
          role: 'user', 
          content: `EXECUTE THIS TASK NOW: ${this.goal}

Begin by calling think_and_plan to create your execution plan, then immediately start calling tools to complete each step. Do NOT respond with just text - you MUST call tools to take action.`
        }
      ];

      console.log(`[Amplifier] Task ${this.id} context initialized, starting agent loop`);
      
      // Run the agentic loop (autonomous execution)
      await this.runAgentLoop();
      
    } catch (error) {
      this.status = TaskStatus.FAILED;
      this.error = error.message;
      this.endTime = new Date();
      console.error(`[Amplifier] Task ${this.id} failed:`, error);
      console.error(`[Amplifier] Error stack:`, error.stack);
      this.emit('error', error);
    }
  }

  /**
   * Run the autonomous agent loop
   * This loop executes tools repeatedly until the task is complete
   * The agent works WITHOUT human intervention
   * 
   * AUTONOMOUS OPERATION FEATURES:
   * - Automatic retry on transient errors
   * - Checkpointing for recovery
   * - Smart error handling with recovery prompts
   * - Graceful degradation when tools fail
   */
  async runAgentLoop() {
    const MAX_ITERATIONS = 50;
    const MAX_TEXT_ONLY_RESPONSES = 3; // Max times AI can respond with only text before we re-prompt
    const tools = getOpenAITools();
    let textOnlyCount = 0;
    
    console.log(`[Amplifier] Starting AUTONOMOUS agent loop with ${tools.length} tools available`);
    console.log(`[Amplifier] Task goal: ${this.goal}`);
    
    while (this.progress.iterations < MAX_ITERATIONS && !this.cancelled) {
      this.progress.iterations++;
      this.progress.currentStep = `Working autonomously... (step ${this.progress.iterations})`;
      this.emit('progress', this.getStatus());
      
      // Save checkpoint periodically
      if (this.progress.iterations % this.checkpointInterval === 0) {
        await this.saveCheckpoint();
      }
      
      try {
        console.log(`[Amplifier] Iteration ${this.progress.iterations}: calling Azure OpenAI`);
        
        // Call Azure OpenAI with tools (includes automatic retry)
        const response = await callAzureOpenAI(this.messages, tools);
        const choice = response.choices[0];
        const message = choice.message;
        
        // Reset error counter on successful API call
        this.consecutiveErrors = 0;
        
        // Add assistant message to history
        this.messages.push(message);
        
        // Check for tool calls (this is what makes it an AGENT)
        if (message.tool_calls && message.tool_calls.length > 0) {
          textOnlyCount = 0; // Reset text-only counter
          
          console.log(`[Amplifier] Iteration ${this.progress.iterations}: ${message.tool_calls.length} tool(s) to execute`);
          
          // Execute all tool calls with individual error handling
          for (const toolCall of message.tool_calls) {
            if (this.cancelled) break;
            
            const toolName = toolCall.function.name;
            let toolArgs = {};
            
            try {
              toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (parseError) {
              console.error(`[Amplifier] Failed to parse tool arguments for ${toolName}:`, toolCall.function.arguments);
              // Send error result so AI can adapt
              this.messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: 'Failed to parse arguments. Please try with different formatting.' })
              });
              continue;
            }
            
            console.log(`[Amplifier] Executing tool: ${toolName}`);
            this.progress.currentStep = `Executing: ${toolName}`;
            this.emit('progress', this.getStatus());
            
            // Execute the tool with error isolation
            let result;
            try {
              result = await executeTool(toolName, toolArgs, {
                userId: this.userId,
                firmId: this.firmId
              });
            } catch (toolError) {
              console.error(`[Amplifier] Tool ${toolName} threw error:`, toolError.message);
              result = { 
                error: toolError.message,
                suggestion: 'Try an alternative approach or different parameters'
              };
            }
            
            console.log(`[Amplifier] Tool ${toolName} result:`, result.success !== undefined ? (result.success ? 'success' : 'failed') : (result.error ? 'error' : 'completed'));
            
            // Track action in history (even failures for learning)
            this.actionsHistory.push({
              tool: toolName,
              args: toolArgs,
              result: result,
              success: !result.error,
              timestamp: new Date()
            });
            
            // Add tool result to messages so AI knows what happened
            this.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            });
            
            // Check for explicit task completion
            if (toolName === 'task_complete') {
              console.log(`[Amplifier] Task ${this.id} marked as complete by agent`);
              this.status = TaskStatus.COMPLETED;
              this.progress.progressPercent = 100;
              this.progress.currentStep = 'Completed successfully';
              this.result = {
                summary: toolArgs.summary || 'Task completed',
                actions: toolArgs.actions_taken || this.actionsHistory.map(a => a.tool),
                recommendations: toolArgs.recommendations || [],
                totalIterations: this.progress.iterations,
                successfulActions: this.actionsHistory.filter(a => a.success).length
              };
              this.endTime = new Date();
              
              // Save to history, extract learnings, and clean up checkpoint
              await this.saveTaskHistory();
              await this.deleteCheckpoint();
              
              this.emit('complete', this.getStatus());
              return;
            }
            
            // Update progress based on planning tools
            if (toolName === 'think_and_plan') {
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
            }
            
            if (toolName === 'log_work') {
              // Increment progress for each logged work item
              this.progress.progressPercent = Math.min(90, this.progress.progressPercent + 5);
            }
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
                actions: this.actionsHistory.map(a => a.tool),
                totalIterations: this.progress.iterations,
                successfulActions: this.actionsHistory.filter(a => a.success !== false).length
              };
              this.endTime = new Date();
              
              await this.saveTaskHistory();
              await this.deleteCheckpoint();
              this.emit('complete', this.getStatus());
              return;
            }
            
            // If no actions were taken and AI just responded with text, prompt it to take action
            if (textOnlyCount < MAX_TEXT_ONLY_RESPONSES) {
              console.log(`[Amplifier] Re-prompting AI to take action (attempt ${textOnlyCount})`);
              this.messages.push({
                role: 'user',
                content: `IMPORTANT: You are a background agent that must take action. Do NOT just respond with text.

Your task is: ${this.goal}

You MUST call tools to complete this task. Start by calling the think_and_plan tool to create an execution plan, then call the appropriate tools to complete each step.

Available actions include: log_time, create_matter, create_client, create_document, create_task, create_calendar_event, list_my_matters, search_matters, generate_report, and more.

Call a tool NOW to begin working on this task.`
              });
            } else {
              // AI keeps responding with text only - try one more forceful prompt or complete
              console.warn(`[Amplifier] Task ${this.id}: AI not calling tools after ${textOnlyCount} attempts`);
              
              // If we got here without any actions, consider it a completion with the text response
              this.status = TaskStatus.COMPLETED;
              this.progress.progressPercent = 100;
              this.progress.currentStep = 'Completed (informational response)';
              this.result = {
                summary: message.content || `Processed request: ${this.goal}`,
                actions: [],
                note: 'The agent provided an informational response rather than taking actions'
              };
              this.endTime = new Date();
              
              await this.saveTaskHistory();
              await this.deleteCheckpoint();
              this.emit('complete', this.getStatus());
              return;
            }
          }
        }
        
        // Gradual progress update
        if (this.progress.progressPercent < 90) {
          this.progress.progressPercent = Math.min(
            90,
            this.progress.progressPercent + Math.max(1, 3 - textOnlyCount)
          );
        }
        
      } catch (error) {
        console.error(`[Amplifier] Iteration ${this.progress.iterations} error:`, error);
        this.consecutiveErrors++;
        
        // If it's a configuration/auth error, fail immediately
        if (error.message.includes('not configured') || 
            error.message.includes('401') || 
            error.message.includes('403') ||
            error.message.includes('invalid')) {
          this.status = TaskStatus.FAILED;
          this.error = error.message;
          this.endTime = new Date();
          this.emit('error', error);
          return;
        }
        
        // If too many consecutive errors, fail the task
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          console.error(`[Amplifier] Task ${this.id} failed: ${this.consecutiveErrors} consecutive errors`);
          this.status = TaskStatus.FAILED;
          this.error = `Task failed after ${this.consecutiveErrors} consecutive errors. Last error: ${error.message}`;
          this.endTime = new Date();
          await this.saveCheckpoint(); // Save for potential manual recovery
          this.emit('error', new Error(this.error));
          return;
        }
        
        // For recoverable errors, add to messages and let AI adapt
        console.log(`[Amplifier] Recoverable error (${this.consecutiveErrors}/${this.maxConsecutiveErrors}), prompting AI to adapt...`);
        this.messages.push({
          role: 'user',
          content: `An error occurred: ${error.message}

Please adapt your approach:
1. If you were trying to access specific data, try a search or list operation first
2. If a tool failed, try an alternative tool or approach
3. If you've made progress toward the goal, you can call task_complete with what was accomplished
4. Continue working autonomously - do not wait for human input

Original goal: ${this.goal}`
        });
      }
    }
    
    // Max iterations reached - complete with what we have
    if (!this.cancelled) {
      console.log(`[Amplifier] Task ${this.id} reached max iterations (${MAX_ITERATIONS})`);
      this.status = TaskStatus.COMPLETED;
      this.progress.progressPercent = 100;
      this.progress.currentStep = 'Completed (max iterations reached)';
      
      const successfulActions = this.actionsHistory.filter(a => a.success !== false);
      this.result = {
        summary: `Task processed over ${this.progress.iterations} iterations with ${successfulActions.length} successful actions.`,
        actions: this.actionsHistory.map(a => a.tool),
        totalIterations: this.progress.iterations,
        successfulActions: successfulActions.length,
        note: 'Maximum iterations reached - task may need follow-up'
      };
      this.endTime = new Date();
      
      await this.saveTaskHistory();
      await this.deleteCheckpoint();
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
        INSERT INTO ai_task_history (firm_id, user_id, task_id, goal, status, started_at, completed_at, duration_seconds, iterations, summary, actions_taken, result)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        JSON.stringify(this.result)
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
   */
  async checkAvailability() {
    // Check if Azure OpenAI is configured (read at runtime)
    const config = getAzureConfig();
    return !!(config.endpoint && config.apiKey && config.deployment);
  }

  /**
   * Configure the service
   */
  async configure() {
    if (this.configured) return true;
    
    const available = await this.checkAvailability();
    if (!available) {
      const config = getAzureConfig();
      console.warn('[AmplifierService] Azure OpenAI credentials not configured');
      console.warn('[AmplifierService] AZURE_OPENAI_ENDPOINT:', config.endpoint ? 'set' : 'MISSING');
      console.warn('[AmplifierService] AZURE_OPENAI_API_KEY:', config.apiKey ? 'set' : 'MISSING');
      console.warn('[AmplifierService] AZURE_OPENAI_DEPLOYMENT:', config.deployment ? 'set' : 'MISSING');
      return false;
    }

    const config = getAzureConfig();
    this.configured = true;
    console.log('[AmplifierService] Configured with Azure OpenAI');
    console.log('[AmplifierService] Using API version:', API_VERSION);
    console.log('[AmplifierService] Endpoint:', config.endpoint);
    console.log('[AmplifierService] Deployment:', config.deployment);
    return true;
  }

  /**
   * Start a new background task
   */
  async startTask(userId, firmId, goal, options = {}) {
    // Check if user already has an active task
    const existingTask = this.getActiveTask(userId);
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
  getTask(taskId) {
    const task = this.tasks.get(taskId);
    return task ? task.getStatus() : null;
  }

  /**
   * Get active task for user
   */
  getActiveTask(userId) {
    const taskId = activeTasks.get(userId);
    if (!taskId) return null;
    
    const task = this.tasks.get(taskId);
    if (!task) {
      activeTasks.delete(userId);
      return null;
    }
    
    // Check if task is still active
    if (task.status !== TaskStatus.RUNNING && 
        task.status !== TaskStatus.PENDING &&
        task.status !== TaskStatus.WAITING_INPUT) {
      activeTasks.delete(userId);
      return null;
    }
    
    return task.getStatus();
  }

  /**
   * Get all tasks for user
   */
  getUserTasks(userId, limit = 10) {
    const userTasks = [];
    
    for (const task of this.tasks.values()) {
      if (task.userId === userId) {
        userTasks.push(task.getStatus());
      }
    }
    
    // Sort by start time descending
    userTasks.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    return userTasks.slice(0, limit);
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId, userId) {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      throw new Error('Task not found');
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
