/**
 * Azure AI Foundry Agent Service
 * 
 * This service integrates with Azure AI Foundry's Agent API to provide
 * a background agent that can work for up to 15 minutes continuously.
 * 
 * Key features:
 * - Uses Azure AI Foundry's native Agent API
 * - Supports function calling with custom tools
 * - Single prompt at a time (sequential execution)
 * - 15-minute continuous operation with progress tracking
 */

import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential, AzureCliCredential, ChainedTokenCredential, ClientSecretCredential } from '@azure/identity';
import { query } from '../db/connection.js';

// Azure AI Foundry configuration
const FOUNDRY_ENDPOINT = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
const FOUNDRY_DEPLOYMENT = process.env.AZURE_AI_FOUNDRY_DEPLOYMENT;
const FOUNDRY_CONNECTION_STRING = process.env.AZURE_AI_FOUNDRY_CONNECTION_STRING;

// Alternative: Direct Azure credentials for service principal auth
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

// Agent configuration
const MAX_RUNTIME_MS = 15 * 60 * 1000; // 15 minutes
const STEP_DELAY_MS = 2000; // 2 seconds between API calls
const MAX_ITERATIONS = 500; // Maximum iterations in 15 minutes

/**
 * Get Azure credential for authentication
 * Tries multiple methods in order of preference
 */
function getAzureCredential() {
  // If service principal credentials are provided, use them
  if (AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) {
    console.log('[FOUNDRY] Using service principal authentication');
    return new ClientSecretCredential(AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET);
  }
  
  // Otherwise, use chained credential (tries multiple methods)
  console.log('[FOUNDRY] Using chained credential authentication');
  return new ChainedTokenCredential(
    new AzureCliCredential(),
    new DefaultAzureCredential()
  );
}

/**
 * Create Azure AI Foundry client
 */
function createFoundryClient() {
  if (!FOUNDRY_ENDPOINT) {
    throw new Error('AZURE_AI_FOUNDRY_ENDPOINT is not configured');
  }
  
  const credential = getAzureCredential();
  return new AIProjectClient(FOUNDRY_ENDPOINT, credential);
}

/**
 * Check if Azure AI Foundry is configured
 */
export function isFoundryConfigured() {
  return !!(FOUNDRY_ENDPOINT && FOUNDRY_DEPLOYMENT);
}

/**
 * Function tool definitions for the Foundry agent
 * These map to the existing tool implementations in aiAgent.js
 */
const FOUNDRY_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_matters",
      description: "Search for matters by name, number, or client",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search term" },
          status: { type: "string", enum: ["active", "pending", "closed", "on_hold"], description: "Filter by status" }
        },
        required: [],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_matter",
      description: "Get comprehensive information about a matter including documents, events, and billing",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" }
        },
        required: ["matter_id"],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_clients",
      description: "Get a list of clients",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by name" },
          limit: { type: "integer", description: "Number to return (default 50)" }
        },
        required: [],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_client",
      description: "Get comprehensive information about a client",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" }
        },
        required: ["client_id"],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "log_time",
      description: "Log billable time for the user on a specific matter",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" },
          hours: { type: "number", description: "Hours to log (0.1 to 24)" },
          description: { type: "string", description: "Description of work performed" },
          date: { type: "string", description: "Date in YYYY-MM-DD format" }
        },
        required: ["matter_id", "hours", "description"],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description: "Create a calendar event",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          start_time: { type: "string", description: "Start time (ISO 8601 or 'YYYY-MM-DD HH:mm')" },
          end_time: { type: "string", description: "End time (optional)" },
          event_type: { type: "string", enum: ["meeting", "court", "deadline", "reminder", "task", "other"], description: "Event type" },
          matter_id: { type: "string", description: "Associated matter UUID" },
          description: { type: "string", description: "Event description" }
        },
        required: ["title", "start_time"],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a task or to-do item",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          matter_id: { type: "string", description: "Associated matter UUID" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority level" },
          description: { type: "string", description: "Task description" }
        },
        required: ["title"],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "Get a list of documents",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "Filter by matter" },
          client_id: { type: "string", description: "Filter by client" },
          search: { type: "string", description: "Search by name" }
        },
        required: [],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_document_content",
      description: "Read the text content of a document",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the document" },
          max_length: { type: "number", description: "Max characters to return" }
        },
        required: ["document_id"],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_document",
      description: "Create a new PDF document",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Document name" },
          content: { type: "string", description: "Document content (markdown supported)" },
          matter_id: { type: "string", description: "Matter UUID to attach to" },
          client_id: { type: "string", description: "Client UUID to attach to" }
        },
        required: ["name", "content"],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Create a note attached to a matter or client",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Note title" },
          content: { type: "string", description: "Note content" },
          matter_id: { type: "string", description: "Matter to attach to" },
          client_id: { type: "string", description: "Client to attach to" }
        },
        required: ["title", "content"],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "draft_email_for_matter",
      description: "Draft a professional email related to a matter",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" },
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body content" }
        },
        required: ["matter_id", "subject", "body"],
        additional_properties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_firm_overview",
      description: "Get a comprehensive overview of the firm's current status",
      strict: true,
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additional_properties: false
      }
    }
  }
];

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Update task progress in database
 */
async function updateTaskProgress(taskId, iteration, actions, status = 'working') {
  try {
    await query(
      `UPDATE ai_tasks SET iterations = $1, progress = $2, updated_at = NOW() WHERE id = $3`,
      [iteration, JSON.stringify({ iteration, actions: actions.slice(-10), status }), taskId]
    );
  } catch (error) {
    console.error(`[FOUNDRY ${taskId}] Error updating progress:`, error.message);
  }
}

/**
 * Create a Foundry Agent with function tools
 * @param {AIProjectClient} client - The Foundry client
 * @param {string} goal - The goal for the agent
 * @param {object} context - Additional context (matter_id, client_id)
 */
async function createFoundryAgent(client, goal, context = {}) {
  console.log('[FOUNDRY] Creating agent with function tools...');
  
  const instructions = `You are an autonomous legal AI assistant working on a task for a law firm.

GOAL: ${goal}

RULES:
1. Work step by step toward the goal.
2. Call ONE tool at a time and wait for the result.
3. Use the tools available to gather information and take actions.
4. Be thorough and complete all necessary steps.
5. Keep working until the goal is achieved.

${context.matter_id ? `Focus on Matter ID: ${context.matter_id}` : ''}
${context.client_id ? `Focus on Client ID: ${context.client_id}` : ''}

Start by gathering the information you need, then take action.`;

  try {
    const agent = await client.agents.createVersion('apex-foundry-agent', {
      kind: 'prompt',
      model: FOUNDRY_DEPLOYMENT,
      instructions: instructions,
      tools: FOUNDRY_TOOLS
    });
    
    console.log(`[FOUNDRY] Agent created: ${agent.id} (${agent.name} v${agent.version})`);
    return agent;
  } catch (error) {
    console.error('[FOUNDRY] Error creating agent:', error.message);
    throw error;
  }
}

/**
 * Process a function call result from the agent
 * This delegates to the existing tool implementations
 */
async function processFunctionCall(functionName, functionArgs, user, executeFunction) {
  console.log(`[FOUNDRY] Executing function: ${functionName}`);
  
  try {
    const result = await executeFunction(functionName, functionArgs, user);
    return {
      success: true,
      result: typeof result === 'object' ? JSON.stringify(result) : String(result)
    };
  } catch (error) {
    console.error(`[FOUNDRY] Function ${functionName} error:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Run the Foundry Agent for a background task
 * This is the main entry point for running a 15-minute agent session
 * 
 * @param {string} taskId - The task ID from the database
 * @param {object} user - The user context
 * @param {string} goal - The goal/prompt for the agent
 * @param {object} context - Additional context (matter_id, client_id)
 * @param {function} executeFunction - Function to execute tool calls
 */
export async function runFoundryAgent(taskId, user, goal, context = {}, executeFunction) {
  console.log(`[FOUNDRY ${taskId}] Starting agent for goal: ${goal}`);
  
  const startTime = Date.now();
  let iteration = 0;
  let actions = [];
  let client = null;
  let agent = null;
  let openAIClient = null;
  let conversation = null;
  
  try {
    // Update task status to running
    await query(
      `UPDATE ai_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId]
    );
    
    // Create Foundry client
    client = createFoundryClient();
    
    // Get OpenAI client from Foundry for responses
    openAIClient = await client.getOpenAIClient();
    
    // Create the agent
    agent = await createFoundryAgent(client, goal, context);
    
    // Create a conversation for the agent
    conversation = await openAIClient.conversations.create({
      items: [
        { type: 'message', role: 'user', content: `Begin working on: ${goal}\n\nCall a tool to start.` }
      ]
    });
    
    console.log(`[FOUNDRY ${taskId}] Conversation created: ${conversation.id}`);
    
    // Main agent loop - runs until timeout or completion
    while (iteration < MAX_ITERATIONS) {
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_RUNTIME_MS) {
        console.log(`[FOUNDRY ${taskId}] Timeout reached after ${Math.round(elapsed / 60000)} minutes`);
        break;
      }
      
      iteration++;
      console.log(`[FOUNDRY ${taskId}] === Iteration ${iteration} (${Math.round(elapsed / 1000)}s elapsed) ===`);
      
      // Update progress
      await updateTaskProgress(taskId, iteration, actions);
      
      try {
        // Generate response using the agent
        const response = await openAIClient.responses.create(
          { conversation: conversation.id },
          { body: { agent: { name: agent.name, type: 'agent_reference' } } }
        );
        
        console.log(`[FOUNDRY ${taskId}] Response received`);
        
        // Check for function calls in the output
        const functionCalls = response.output?.filter(
          output => output.type === 'function_call'
        ) || [];
        
        if (functionCalls.length === 0) {
          // No function call - agent might be done or needs prompting
          console.log(`[FOUNDRY ${taskId}] No function call, checking if complete...`);
          
          // Add a message to continue
          await openAIClient.conversations.items.create(conversation.id, {
            items: [{ type: 'message', role: 'user', content: 'Continue working. What action will you take next? Call a tool.' }]
          });
          
          await delay(STEP_DELAY_MS);
          continue;
        }
        
        // Process the first function call only (one at a time)
        const functionCall = functionCalls[0];
        const functionName = functionCall.name;
        const functionArgs = JSON.parse(functionCall.arguments || '{}');
        
        console.log(`[FOUNDRY ${taskId}] Function call: ${functionName}(${JSON.stringify(functionArgs)})`);
        
        // Execute the function
        const result = await processFunctionCall(functionName, functionArgs, user, executeFunction);
        
        // Track the action
        actions.push({
          iteration,
          function: functionName,
          args: functionArgs,
          success: result.success,
          timestamp: new Date().toISOString()
        });
        
        // Send the function result back to the conversation
        await openAIClient.conversations.items.create(conversation.id, {
          items: [{
            type: 'function_call_output',
            call_id: functionCall.call_id,
            output: result.success ? result.result : `Error: ${result.error}`
          }]
        });
        
        console.log(`[FOUNDRY ${taskId}] Function result sent, continuing...`);
        
      } catch (apiError) {
        console.error(`[FOUNDRY ${taskId}] API error:`, apiError.message);
        
        // If rate limited or temporary error, wait and retry
        if (apiError.message.includes('429') || apiError.message.includes('rate')) {
          await delay(5000);
        } else {
          await delay(3000);
        }
        continue;
      }
      
      // Delay between iterations
      await delay(STEP_DELAY_MS);
    }
    
    // Generate final summary
    console.log(`[FOUNDRY ${taskId}] Generating summary...`);
    
    let summary = `## Background Task Complete\n\n`;
    summary += `**Goal:** ${goal}\n\n`;
    summary += `**Duration:** ${Math.round((Date.now() - startTime) / 60000)} minutes\n`;
    summary += `**Iterations:** ${iteration}\n`;
    summary += `**Actions Taken:** ${actions.length}\n\n`;
    
    if (actions.length > 0) {
      summary += `### Actions Performed\n`;
      for (const action of actions.slice(-20)) {
        const status = action.success ? '✓' : '✗';
        summary += `- ${status} ${action.function}\n`;
      }
    }
    
    // Update task as completed
    await query(
      `UPDATE ai_tasks SET 
        status = 'completed',
        completed_at = NOW(),
        summary = $1,
        iterations = $2,
        progress = $3
      WHERE id = $4`,
      [
        summary,
        iteration,
        JSON.stringify({ iteration, actions: actions.slice(-10), status: 'completed' }),
        taskId
      ]
    );
    
    console.log(`[FOUNDRY ${taskId}] Task completed successfully`);
    
    // Cleanup - delete the agent and conversation
    if (conversation) {
      try {
        await openAIClient.conversations.delete(conversation.id);
      } catch (e) {
        console.warn(`[FOUNDRY ${taskId}] Could not delete conversation:`, e.message);
      }
    }
    
    if (agent) {
      try {
        await client.agents.deleteVersion(agent.name, agent.version);
      } catch (e) {
        console.warn(`[FOUNDRY ${taskId}] Could not delete agent:`, e.message);
      }
    }
    
  } catch (error) {
    console.error(`[FOUNDRY ${taskId}] Fatal error:`, error);
    
    // Update task as failed
    await query(
      `UPDATE ai_tasks SET 
        status = 'failed',
        error = $1,
        completed_at = NOW()
      WHERE id = $2`,
      [error.message, taskId]
    );
    
    throw error;
  }
}

/**
 * Start a background task using Azure AI Foundry
 * This is called from the main agent route
 */
export async function startFoundryBackgroundTask(goal, user, context = {}, executeFunction) {
  console.log('[FOUNDRY] Starting background task:', goal);
  
  if (!isFoundryConfigured()) {
    throw new Error('Azure AI Foundry is not configured. Set AZURE_AI_FOUNDRY_ENDPOINT and AZURE_AI_FOUNDRY_DEPLOYMENT.');
  }
  
  try {
    // Create task in database
    const result = await query(
      `INSERT INTO ai_tasks (firm_id, user_id, goal, status, plan, max_iterations, context)
       VALUES ($1, $2, $3, 'running', $4, $5, $6)
       RETURNING id`,
      [
        user.firmId,
        user.id,
        goal,
        JSON.stringify(['Working dynamically using Azure AI Foundry Agent...']),
        MAX_ITERATIONS,
        JSON.stringify(context)
      ]
    );
    
    const taskId = result.rows[0].id;
    
    // Start the Foundry agent asynchronously
    runFoundryAgent(taskId, user, goal, context, executeFunction).catch(error => {
      console.error(`[FOUNDRY ${taskId}] Background task failed:`, error);
    });
    
    return {
      status: 'started',
      task_id: taskId,
      message: `Background task started with Azure AI Foundry. I'll work on: ${goal}`,
      goal,
      plan: ['Working dynamically using Azure AI Foundry Agent...'],
      estimated_steps: 50,
      _background_task_started: true
    };
    
  } catch (error) {
    console.error('[FOUNDRY] Error starting background task:', error);
    throw error;
  }
}

/**
 * Single prompt execution using Foundry
 * For simple queries that don't need background processing
 */
export async function executeFoundryPrompt(prompt, user, context = {}) {
  console.log('[FOUNDRY] Executing single prompt');
  
  if (!isFoundryConfigured()) {
    throw new Error('Azure AI Foundry is not configured');
  }
  
  let client = null;
  let openAIClient = null;
  
  try {
    client = createFoundryClient();
    openAIClient = await client.getOpenAIClient();
    
    // Simple prompt execution without creating a full agent
    const response = await openAIClient.responses.create({
      model: FOUNDRY_DEPLOYMENT,
      input: prompt
    });
    
    return {
      content: response.output_text || response.output?.[0]?.text || 'No response',
      model: FOUNDRY_DEPLOYMENT
    };
    
  } catch (error) {
    console.error('[FOUNDRY] Prompt execution error:', error);
    throw error;
  }
}

export default {
  isFoundryConfigured,
  runFoundryAgent,
  startFoundryBackgroundTask,
  executeFoundryPrompt
};
