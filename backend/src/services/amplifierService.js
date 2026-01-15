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

// Azure OpenAI configuration - use same API version as normal AI chat (ai.js)
// Read at runtime to ensure dotenv has loaded
const API_VERSION = '2024-02-15-preview';

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
 * Uses the same configuration and request format as the normal AI chat (ai.js)
 */
async function callAzureOpenAI(messages, tools = [], options = {}) {
  const config = getAzureConfig();
  const url = `${config.endpoint}openai/deployments/${config.deployment}/chat/completions?api-version=${API_VERSION}`;
  
  // Match the same request body format as ai.js
  const body = {
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 4000,
    top_p: 0.95,
  };
  
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('[Amplifier] Azure OpenAI error:', error);
    console.error('[Amplifier] Request URL:', url);
    console.error('[Amplifier] Deployment:', config.deployment);
    throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`);
  }
  
  return await response.json();
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
   */
  buildSystemPrompt() {
    let prompt = `You are the APEX LEGAL BACKGROUND AGENT - an autonomous AI assistant with FULL ACCESS to the legal practice management platform.

${PLATFORM_CONTEXT}

${this.userContext || ''}

${this.learningContext || ''}

## YOUR CAPABILITIES

You have access to ALL platform tools and can:
- Create, update, and manage clients and matters
- Log time entries and generate invoices
- Create and edit documents
- Schedule events and manage tasks
- Search across all firm data
- Generate reports and analytics

## AUTONOMOUS OPERATION MODE

You are running as a BACKGROUND AGENT. This means:
1. You should work AUTONOMOUSLY to complete the goal
2. Break complex tasks into steps and execute them
3. Use think_and_plan to organize your approach
4. Use log_work to track progress
5. Use task_complete when finished
6. Only use request_human_input for critical decisions

## CURRENT TASK

Goal: ${this.goal}

Work through this goal step by step. Take actions, verify results, and continue until complete.
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
   */
  async start() {
    this.status = TaskStatus.RUNNING;
    this.progress.currentStep = 'Initializing context...';
    this.emit('progress', this.getStatus());

    try {
      // Initialize context
      await this.initializeContext();
      
      // Build initial messages
      this.messages = [
        { role: 'system', content: this.buildSystemPrompt() },
        { role: 'user', content: `Please complete this task: ${this.goal}` }
      ];

      // Run the agentic loop
      await this.runAgentLoop();
      
    } catch (error) {
      this.status = TaskStatus.FAILED;
      this.error = error.message;
      this.endTime = new Date();
      console.error(`[Amplifier] Task ${this.id} error:`, error);
      this.emit('error', error);
    }
  }

  /**
   * Run the autonomous agent loop
   */
  async runAgentLoop() {
    const MAX_ITERATIONS = 50;
    const tools = getOpenAITools();
    
    while (this.progress.iterations < MAX_ITERATIONS && !this.cancelled) {
      this.progress.iterations++;
      this.progress.currentStep = `Working... (iteration ${this.progress.iterations})`;
      this.emit('progress', this.getStatus());
      
      try {
        // Call Azure OpenAI
        const response = await callAzureOpenAI(this.messages, tools);
        const choice = response.choices[0];
        const message = choice.message;
        
        // Add assistant message to history
        this.messages.push(message);
        
        // Check for tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          // Execute tools
          for (const toolCall of message.tool_calls) {
            if (this.cancelled) break;
            
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            
            this.progress.currentStep = `Executing: ${toolName}`;
            this.emit('progress', this.getStatus());
            
            // Execute the tool
            const result = await executeTool(toolName, toolArgs, {
              userId: this.userId,
              firmId: this.firmId
            });
            
            // Track action
            this.actionsHistory.push({
              tool: toolName,
              args: toolArgs,
              result: result,
              timestamp: new Date()
            });
            
            // Add tool result to messages
            this.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            });
            
            // Check for task completion
            if (toolName === 'task_complete') {
              this.status = TaskStatus.COMPLETED;
              this.progress.progressPercent = 100;
              this.progress.currentStep = 'Completed';
              this.result = {
                summary: toolArgs.summary,
                actions: toolArgs.actions_taken,
                recommendations: toolArgs.recommendations
              };
              this.endTime = new Date();
              
              // Save to history and extract learnings
              await this.saveTaskHistory();
              
              this.emit('complete', this.getStatus());
              return;
            }
            
            // Check for human input request
            if (toolName === 'request_human_input') {
              this.status = TaskStatus.WAITING_INPUT;
              this.progress.currentStep = 'Waiting for input';
              this.emit('waiting', this.getStatus());
              // In a real implementation, we'd pause here
              // For now, continue with a default response
            }
            
            // Update progress based on plan
            if (toolName === 'think_and_plan') {
              this.progress.totalSteps = (toolArgs.steps || []).length;
              this.progress.progressPercent = Math.min(10, this.progress.progressPercent + 5);
            }
            
            if (toolName === 'evaluate_progress') {
              const completed = (toolArgs.completed_steps || []).length;
              const total = completed + (toolArgs.remaining_steps || []).length;
              if (total > 0) {
                this.progress.completedSteps = completed;
                this.progress.progressPercent = Math.min(90, 10 + (80 * completed / total));
              }
            }
          }
        } else {
          // No tool calls - check if we're done or need to continue
          if (choice.finish_reason === 'stop') {
            // Model finished without explicit task_complete
            this.status = TaskStatus.COMPLETED;
            this.progress.progressPercent = 100;
            this.progress.currentStep = 'Completed';
            this.result = {
              summary: message.content,
              actions: this.actionsHistory.map(a => a.tool)
            };
            this.endTime = new Date();
            
            await this.saveTaskHistory();
            this.emit('complete', this.getStatus());
            return;
          }
        }
        
        // Gradual progress update
        this.progress.progressPercent = Math.min(
          90,
          this.progress.progressPercent + Math.max(1, 5 - this.progress.iterations / 10)
        );
        
      } catch (error) {
        console.error(`[Amplifier] Iteration ${this.progress.iterations} error:`, error);
        
        // Add error to messages and continue
        this.messages.push({
          role: 'user',
          content: `Error occurred: ${error.message}. Please continue or adjust your approach.`
        });
      }
    }
    
    // Max iterations reached
    if (!this.cancelled) {
      this.status = TaskStatus.COMPLETED;
      this.progress.progressPercent = 100;
      this.progress.currentStep = 'Completed (max iterations)';
      this.result = {
        summary: `Task completed after ${this.progress.iterations} iterations`,
        actions: this.actionsHistory.map(a => a.tool)
      };
      this.endTime = new Date();
      
      await this.saveTaskHistory();
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
   */
  async extractLearnings() {
    try {
      // Analyze action sequences for workflow patterns
      if (this.actionsHistory.length >= 3) {
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
        } else {
          // Create new pattern
          await query(`
            INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data)
            VALUES ($1, $2, 'workflow', 'task_execution', $3)
          `, [this.firmId, this.userId, JSON.stringify({
            sequence: toolSequence,
            goal_keywords: this.goal.toLowerCase().split(' ').slice(0, 5),
            tools_used: [...new Set(this.actionsHistory.map(a => a.tool))]
          })]);
        }
      }
      
      // Learn naming patterns from created entities
      for (const action of this.actionsHistory) {
        if (action.tool === 'create_matter' && action.args?.name) {
          await this.learnNamingPattern('matter', action.args.name);
        }
        if (action.tool === 'create_client' && action.args?.display_name) {
          await this.learnNamingPattern('client', action.args.display_name);
        }
      }
      
    } catch (error) {
      console.error('[Amplifier] Error extracting learnings:', error);
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
      return [];
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
