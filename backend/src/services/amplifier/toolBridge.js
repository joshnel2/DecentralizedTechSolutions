/**
 * Tool Bridge for Amplifier Background Agent
 * 
 * This module creates an HTTP API bridge that allows Amplifier to call
 * all the same tools that the normal AI agent has access to.
 * 
 * Instead of executing tools directly, it makes authenticated HTTP calls
 * to internal API endpoints, passing the user's JWT token.
 */

import { query, withTransaction } from '../../db/connection.js';
import { formatDate, formatDateTime, getTodayInTimezone } from '../../utils/dateUtils.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { uploadFile, downloadFile, isAzureConfigured } from '../../utils/azureStorage.js';
import { extractTextFromFile } from '../../routes/documents.js';

// Import NY CPLR legal knowledge module
import {
  NY_CPLR,
  CPLR_ARTICLE_2_LIMITATIONS,
  CPLR_ARTICLE_3_JURISDICTION,
  CPLR_ARTICLE_31_DISCLOSURE,
  CPLR_ARTICLE_32_JUDGMENT,
  CPLR_TIME_COMPUTATION,
  CPLR_DEADLINES_QUICK_REFERENCE,
  getCPLRGuidanceForMatter,
  formatCPLRCitation
} from './legalKnowledge/nyCPLR.js';

// Import tools from aiAgent.js - these are the EXACT same tools used by the normal AI chat
// This ensures the background agent has identical capabilities
let AGENT_TOOLS = [];
let executeAgentTool = null;

try {
  const aiAgentModule = await import('../../routes/aiAgent.js');
  AGENT_TOOLS = aiAgentModule.TOOLS || [];
  executeAgentTool = aiAgentModule.executeTool;
  console.log(`[ToolBridge] Loaded ${AGENT_TOOLS.length} tools from aiAgent.js`);
} catch (error) {
  console.error('[ToolBridge] Failed to load tools from aiAgent.js:', error.message);
  console.error('[ToolBridge] Background agent will have limited functionality');
}

/**
 * Complete list of tools available to Amplifier
 * Each tool maps to an internal handler that either:
 * 1. Calls an existing API endpoint
 * 2. Executes a database query directly
 * 3. Performs business logic
 */
const BASE_AMPLIFIER_TOOLS = {
  // ============== TIME ENTRIES ==============
  log_time: {
    description: "Log billable time for the user on a specific matter",
    parameters: {
      matter_id: "string - Matter ID or name",
      hours: "number - Hours to log (0.1 to 24)",
      description: "string - Description of work",
      date: "string - Date YYYY-MM-DD (optional, defaults to today)",
      billable: "boolean - Whether billable (optional, defaults to true)"
    },
    required: ["matter_id", "hours", "description"]
  },
  
  get_my_time_entries: {
    description: "Get user's recent time entries",
    parameters: {
      limit: "number - Max entries to return",
      start_date: "string - Filter from date",
      end_date: "string - Filter to date",
      matter_id: "string - Filter by matter"
    },
    required: []
  },
  
  // ============== MATTERS ==============
  list_my_matters: {
    description: "Get matters the user can access",
    parameters: {
      status: "string - active|pending|closed|on_hold",
      limit: "number - Max to return"
    },
    required: []
  },
  
  search_matters: {
    description: "Search for matters by name, number, or client",
    parameters: {
      search: "string - Search term",
      status: "string - Filter by status",
      client_id: "string - Filter by client"
    },
    required: []
  },
  
  get_matter: {
    description: "Get comprehensive info about a matter including documents, tasks, events",
    parameters: {
      matter_id: "string - Matter ID or name"
    },
    required: ["matter_id"]
  },
  
  create_matter: {
    description: "Create a new legal matter/case",
    parameters: {
      name: "string - Matter name",
      client_id: "string - Client ID",
      description: "string - Description",
      type: "string - Matter type",
      priority: "string - low|medium|high|urgent",
      billing_type: "string - hourly|flat|contingency|retainer|pro_bono",
      billing_rate: "number - Hourly rate"
    },
    required: ["name"]
  },
  
  update_matter: {
    description: "Update an existing matter",
    parameters: {
      matter_id: "string - Matter ID",
      name: "string - New name",
      description: "string - New description",
      status: "string - New status",
      priority: "string - New priority"
    },
    required: ["matter_id"]
  },
  
  close_matter: {
    description: "Close a matter with resolution",
    parameters: {
      matter_id: "string - Matter ID",
      resolution: "string - Resolution outcome",
      closing_notes: "string - Closing notes"
    },
    required: ["matter_id"]
  },
  
  // ============== CLIENTS ==============
  list_clients: {
    description: "Get list of clients",
    parameters: {
      search: "string - Search by name",
      type: "string - person|company",
      limit: "number - Max to return"
    },
    required: []
  },
  
  get_client: {
    description: "Get comprehensive info about a client",
    parameters: {
      client_id: "string - Client ID"
    },
    required: ["client_id"]
  },
  
  create_client: {
    description: "Create a new client",
    parameters: {
      display_name: "string - Full name or company name",
      type: "string - person|company",
      email: "string - Email address",
      phone: "string - Phone number",
      first_name: "string - First name (for person)",
      last_name: "string - Last name (for person)"
    },
    required: ["display_name"]
  },
  
  update_client: {
    description: "Update an existing client",
    parameters: {
      client_id: "string - Client ID",
      display_name: "string",
      email: "string",
      phone: "string"
    },
    required: ["client_id"]
  },
  
  // ============== INVOICES ==============
  list_invoices: {
    description: "Get list of invoices",
    parameters: {
      status: "string - draft|sent|paid|overdue",
      client_id: "string - Filter by client",
      matter_id: "string - Filter by matter"
    },
    required: []
  },
  
  create_invoice: {
    description: "Create a new invoice",
    parameters: {
      client_id: "string - Client ID (required)",
      matter_id: "string - Matter ID",
      due_date: "string - Due date YYYY-MM-DD",
      include_unbilled_time: "boolean - Include unbilled time entries",
      items: "array - Custom line items [{description, amount}]"
    },
    required: ["client_id"]
  },
  
  send_invoice: {
    description: "Mark invoice as sent",
    parameters: {
      invoice_id: "string - Invoice ID"
    },
    required: ["invoice_id"]
  },
  
  record_payment: {
    description: "Record payment against invoice",
    parameters: {
      invoice_id: "string - Invoice ID",
      amount: "number - Payment amount",
      payment_method: "string - Payment method",
      payment_date: "string - Date YYYY-MM-DD"
    },
    required: ["invoice_id", "amount"]
  },
  
  // ============== DOCUMENTS ==============
  list_documents: {
    description: "Get list of documents",
    parameters: {
      matter_id: "string - Filter by matter",
      client_id: "string - Filter by client",
      search: "string - Search by name"
    },
    required: []
  },
  
  read_document_content: {
    description: "Read the text content of a document",
    parameters: {
      document_id: "string - Document ID",
      max_length: "number - Max characters"
    },
    required: ["document_id"]
  },
  
  create_document: {
    description: "Create a formal Word document (.docx) in the DOCUMENTS section. Use for contracts, letters, memos, briefs, agreements. ALWAYS include matter_id. For quick notes in Notes tab, use add_matter_note instead.",
    parameters: {
      name: "string - Document name (no extension needed)",
      content: "string - Document content (use markdown: # headers, - bullets, **bold**)",
      matter_id: "string - Matter ID - ALWAYS INCLUDE THIS",
      client_id: "string - Client ID (only if no matter)"
    },
    required: ["name", "content"]
  },
  
  search_document_content: {
    description: "Search within all document contents",
    parameters: {
      search_term: "string - Text to search for",
      matter_id: "string - Limit to matter",
      client_id: "string - Limit to client"
    },
    required: ["search_term"]
  },
  
  // ============== CALENDAR ==============
  get_calendar_events: {
    description: "Get upcoming calendar events",
    parameters: {
      days_ahead: "number - Days to look ahead",
      matter_id: "string - Filter by matter",
      type: "string - Event type"
    },
    required: []
  },
  
  create_calendar_event: {
    description: "Create a new calendar event",
    parameters: {
      title: "string - Event title",
      start_time: "string - Start datetime ISO 8601",
      end_time: "string - End datetime",
      type: "string - meeting|court_date|deadline|reminder",
      matter_id: "string - Associated matter",
      location: "string - Event location"
    },
    required: ["title", "start_time"]
  },
  
  // ============== TASKS ==============
  list_tasks: {
    description: "Get list of tasks",
    parameters: {
      status: "string - pending|in_progress|completed",
      matter_id: "string - Filter by matter",
      assigned_to: "string - Filter by assignee"
    },
    required: []
  },
  
  create_task: {
    description: "Create a new task",
    parameters: {
      title: "string - Task title",
      due_date: "string - Due date YYYY-MM-DD",
      priority: "string - low|medium|high|urgent",
      matter_id: "string - Link to matter",
      assigned_to: "string - Assign to user"
    },
    required: ["title"]
  },
  
  complete_task: {
    description: "Mark task as completed",
    parameters: {
      task_id: "string - Task ID"
    },
    required: ["task_id"]
  },
  
  // ============== REPORTS ==============
  generate_report: {
    description: "Generate various reports",
    parameters: {
      report_type: "string - billing_summary|time_by_matter|revenue|outstanding_invoices",
      start_date: "string - Start date",
      end_date: "string - End date",
      matter_id: "string - Filter by matter",
      client_id: "string - Filter by client"
    },
    required: ["report_type"]
  },
  
  get_firm_analytics: {
    description: "Get firm-wide analytics and KPIs",
    parameters: {
      time_period: "string - current_month|last_month|year_to_date"
    },
    required: []
  },
  
  // ============== TEAM ==============
  list_team_members: {
    description: "Get list of team members",
    parameters: {
      role: "string - Filter by role",
      active_only: "boolean - Only active members"
    },
    required: []
  },
  
  // ============== LEGAL-SPECIFIC TOOLS ==============
  check_conflicts: {
    description: "Check for conflicts of interest before accepting a new client or matter. Searches existing clients, matters, and parties for potential conflicts.",
    parameters: {
      party_names: "array - Names of all parties to check (clients, opposing parties, witnesses)",
      matter_description: "string - Brief description of the potential matter",
      check_type: "string - Type: new_client, new_matter, adverse_party"
    },
    required: ["party_names"]
  },
  
  set_critical_deadline: {
    description: "Set a critical legal deadline with automatic reminders. Use this for statute of limitations, filing deadlines, discovery cutoffs, and other dates that CANNOT be missed.",
    parameters: {
      matter_id: "string - Matter ID",
      deadline_type: "string - Type: statute_of_limitations, filing_deadline, discovery_cutoff, court_ordered, appeal_deadline, response_deadline",
      date: "string - Deadline date YYYY-MM-DD",
      description: "string - Description of the deadline",
      reminder_days: "array - Days before deadline to send reminders (e.g., [14, 7, 3, 1])"
    },
    required: ["matter_id", "deadline_type", "date", "description"]
  },
  
  get_upcoming_deadlines: {
    description: "Get all upcoming critical deadlines for matters. Essential for avoiding malpractice.",
    parameters: {
      days_ahead: "number - Days to look ahead (default 30)",
      matter_id: "string - Filter by specific matter (optional)",
      deadline_type: "string - Filter by type (optional)"
    },
    required: []
  },
  
  draft_legal_document: {
    description: "Draft a legal document using professional legal formatting. Creates PDF with proper structure for legal use.",
    parameters: {
      document_type: "string - Type: engagement_letter, demand_letter, legal_memo, motion, status_letter, closing_letter, contract_review_memo, discovery_request, discovery_response, subpoena, affidavit, settlement_agreement",
      title: "string - Document title",
      matter_id: "string - Matter ID to attach document",
      recipient: "string - Recipient name/title if applicable",
      key_facts: "string - Key facts to include",
      legal_issues: "string - Legal issues or claims",
      requested_action: "string - What action is being requested",
      deadline: "string - Any deadline to mention",
      tone: "string - Tone: formal, firm, cordial, urgent"
    },
    required: ["document_type", "title", "matter_id"]
  },
  
  calculate_deadline: {
    description: "Calculate a deadline based on rules (court days, calendar days, excluding holidays). Helps ensure accurate deadline computation.",
    parameters: {
      start_date: "string - Start date YYYY-MM-DD (e.g., date of service)",
      days: "number - Number of days",
      day_type: "string - Type: calendar, court_days, business_days",
      add_mailing: "boolean - Add 5 days for mailing if served by mail",
      jurisdiction: "string - Jurisdiction for holiday calculations"
    },
    required: ["start_date", "days"]
  },
  
  log_billable_work: {
    description: "Log billable time with proper legal billing description. Ensures time entries meet professional billing standards and are audit-ready.",
    parameters: {
      matter_id: "string - Matter ID or name",
      hours: "number - Hours worked (0.1 minimum increment)",
      work_type: "string - Type: research, drafting, review, conference, court_appearance, deposition, travel, correspondence",
      description: "string - Detailed description of work performed",
      outcome: "string - Result or outcome of the work (optional)",
      date: "string - Date YYYY-MM-DD (defaults to today)"
    },
    required: ["matter_id", "hours", "work_type", "description"]
  },
  
  // ============== NY CPLR LEGAL REFERENCE ==============
  lookup_cplr: {
    description: "Look up New York Civil Practice Law and Rules (CPLR) - the procedural rules for NY courts. Use this to find statute of limitations, service rules, discovery deadlines, motion practice requirements, and time computation rules. ALWAYS use this when handling NY litigation matters.",
    parameters: {
      query_type: "string - Type of lookup: 'statute_of_limitations' | 'service_of_process' | 'discovery' | 'motions' | 'time_computation' | 'deadlines' | 'section' | 'matter_guidance'",
      section: "string - Specific CPLR section number (e.g., '214', '3212', '308') - use with query_type='section'",
      claim_type: "string - Type of claim for SOL lookup (e.g., 'personal_injury', 'contract', 'medical_malpractice', 'defamation')",
      matter_type: "string - Matter type for guidance (e.g., 'Personal Injury', 'Contract', 'Medical Malpractice')",
      matter_description: "string - Brief description of matter for more specific guidance"
    },
    required: ["query_type"]
  },
  
  calculate_cplr_deadline: {
    description: "Calculate deadlines according to NY CPLR time computation rules. Accounts for weekends, holidays, and mail service extensions. Use this for accurate deadline calculations.",
    parameters: {
      start_date: "string - Start date YYYY-MM-DD (e.g., date of service, date of filing)",
      days: "number - Number of days in the period",
      period_type: "string - Type: 'answer' | 'discovery_response' | 'motion' | 'appeal' | 'custom'",
      service_method: "string - How paper was served: 'personal' | 'mail' | 'overnight' | 'electronic'",
      description: "string - What this deadline is for"
    },
    required: ["start_date", "days"]
  },
  
  // ============== PLANNING & PROGRESS ==============
  think_and_plan: {
    description: "Create a plan for a complex task",
    parameters: {
      goal: "string - The overall goal",
      analysis: "string - Analysis of what needs to be done",
      steps: "array - List of steps to take"
    },
    required: ["goal", "analysis", "steps"]
  },
  
  evaluate_progress: {
    description: "Evaluate progress toward a goal",
    parameters: {
      original_goal: "string - The original goal",
      completed_steps: "array - Steps completed",
      remaining_steps: "array - Steps remaining",
      confidence: "number - Confidence level 0-100"
    },
    required: ["original_goal", "completed_steps"]
  },
  
  task_complete: {
    description: "Mark a complex task as complete with summary",
    parameters: {
      goal: "string - The original goal",
      summary: "string - Summary of accomplishments",
      actions_taken: "array - List of actions taken",
      recommendations: "array - Follow-up recommendations"
    },
    required: ["goal", "summary", "actions_taken"]
  },
  
  log_work: {
    description: "Log work progress and learnings",
    parameters: {
      action: "string - What action was taken",
      result: "string - The result",
      next_step: "string - What to do next",
      reflection: "string - What was learned"
    },
    required: ["action"]
  }
};

function buildToolMapFromAgent(tools = []) {
  const toolMap = {};
  
  for (const tool of tools) {
    const fn = tool?.function || {};
    if (!fn.name) continue;
    const properties = fn.parameters?.properties || {};
    const parameters = Object.fromEntries(
      Object.entries(properties).map(([key, schema]) => {
        const type = schema?.type || 'string';
        const description = schema?.description ? `${type} - ${schema.description}` : type;
        return [key, description];
      })
    );
    toolMap[fn.name] = {
      description: fn.description || '',
      parameters,
      required: fn.parameters?.required || []
    };
  }
  
  return toolMap;
}

// Export the tools in OpenAI format (directly from aiAgent.js)
// Tools that the background agent should NEVER use
const BACKGROUND_AGENT_EXCLUDED_TOOLS = [
  'log_time',           // Time entries are for humans, not AI
  'delete_time_entry',  // Don't let AI delete time
  'update_time_entry',  // Don't let AI modify time entries
];

// AMPLIFIER_OPENAI_TOOLS = same tools the normal AI chat uses, minus excluded ones
export const AMPLIFIER_OPENAI_TOOLS = AGENT_TOOLS.filter(
  tool => !BACKGROUND_AGENT_EXCLUDED_TOOLS.includes(tool.function?.name)
);

// ===== BACKGROUND-AGENT-ONLY TOOLS =====
// These tools are unique to the background agent (not available in normal AI chat).
// They support quality assurance, self-review, and long-running task management.

const BACKGROUND_AGENT_ONLY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'review_created_documents',
      description: 'Review documents and notes you created during this task. Re-reads your work product from the database so you can verify quality, catch placeholder text, check citation integrity, and fix issues before completing. ALWAYS call this in the REVIEW phase before task_complete.',
      parameters: {
        type: 'object',
        properties: {
          matter_id: { type: 'string', description: 'Optional: limit review to documents for a specific matter' },
          minutes_ago: { type: 'integer', description: 'How far back to look (default: 60 minutes)' },
          include_content: { type: 'boolean', description: 'Include document/note content for review (default: true)' },
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_semantic',
      description: 'Semantic search across all firm documents using AI embeddings. Finds documents by MEANING, not just keywords. Use this to find: relevant precedent, similar contract clauses, prior work product on similar issues, related memos. Much more powerful than search_document_content for finding conceptually related documents. Example: searching "indemnification obligations" will find documents that say "hold harmless" even though the exact words differ.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for - describe the concept, clause, or issue you need to find' },
          matter_id: { type: 'string', description: 'Optional: limit search to a specific matter' },
          document_type: { type: 'string', description: 'Optional: filter by document type' },
          limit: { type: 'integer', description: 'Number of results to return (default 8)' },
        },
        required: ['query']
      }
    }
  },
];

// Add background-agent-only tools to the OpenAI tool list
AMPLIFIER_OPENAI_TOOLS.push(...BACKGROUND_AGENT_ONLY_TOOLS);

// AMPLIFIER_TOOLS = merged tool definitions for backwards compatibility
const filteredAgentTools = AGENT_TOOLS.filter(
  tool => !BACKGROUND_AGENT_EXCLUDED_TOOLS.includes(tool.function?.name)
);
export const AMPLIFIER_TOOLS = { ...BASE_AMPLIFIER_TOOLS, ...buildToolMapFromAgent(filteredAgentTools) };

// Log tool availability for debugging
console.log(`[ToolBridge] AMPLIFIER_OPENAI_TOOLS: ${AMPLIFIER_OPENAI_TOOLS.length} tools available (${BACKGROUND_AGENT_ONLY_TOOLS.length} background-agent-only)`);
console.log(`[ToolBridge] AMPLIFIER_TOOLS: ${Object.keys(AMPLIFIER_TOOLS).length} tool definitions`);

async function loadUserContext(userId, firmId) {
  if (!userId || !firmId) return null;
  
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, role, firm_id, is_active, two_factor_enabled
       FROM users WHERE id = $1 AND firm_id = $2`,
      [userId, firmId]
    );
    
    if (result.rows.length === 0) return null;
    const user = result.rows[0];
    if (!user.is_active) return null;
    
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      firmId: user.firm_id,
      twoFactorEnabled: user.two_factor_enabled,
    };
  } catch (error) {
    console.error('[Amplifier Tool] Failed to load user:', error.message);
    return null;
  }
}

/**
 * Retry wrapper for transient failures
 */
async function withRetry(fn, toolName, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Only retry on transient errors
      const isTransient = 
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('ETIMEDOUT') ||
        error.message?.includes('socket hang up') ||
        error.message?.includes('connection') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT';
      
      if (!isTransient || attempt === maxRetries) {
        throw error;
      }
      
      const delay = 500 * Math.pow(2, attempt); // 500ms, 1s, 2s
      console.log(`[Amplifier Tool] Retrying ${toolName} in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Execute a tool call for Amplifier
 * This function routes tool calls to the appropriate handler
 * Legal-specific tools are handled here; others delegate to aiAgent.js
 * Uses the SAME tool execution as the normal AI chat
 */
export async function executeTool(toolName, params, context) {
  const { userId, firmId, user: providedUser } = context || {};
  
  const startTime = Date.now();
  console.log(`[Amplifier Tool] Executing: ${toolName}`, JSON.stringify(params).substring(0, 200));
  
  const user = providedUser || await loadUserContext(userId, firmId);
  if (!user) {
    console.error(`[Amplifier Tool] User not found: userId=${userId}, firmId=${firmId}`);
    return { error: 'User not found or inactive' };
  }
  
  try {
    // Handle legal-specific tools that are unique to Amplifier background agent
    switch (toolName) {
      case 'check_conflicts':
        return await checkConflicts(params, userId, firmId);
      
      case 'set_critical_deadline':
        return await setCriticalDeadline(params, userId, firmId);
      
      case 'get_upcoming_deadlines':
        return await getUpcomingDeadlines(params, userId, firmId);
      
      case 'draft_legal_document':
        return await draftLegalDocument(params, userId, firmId);
      
      case 'calculate_deadline':
        return await calculateDeadline(params, userId, firmId);
      
      case 'log_billable_work':
        return await logBillableWork(params, userId, firmId);
      
      // NY CPLR Legal Reference Tools
      case 'lookup_cplr':
        return await lookupCPLR(params);
      
      case 'calculate_cplr_deadline':
        return await calculateCPLRDeadline(params);
      
      // Quality assurance: let the agent review what it created
      case 'review_created_documents':
        return await reviewCreatedDocuments(params, userId, firmId);
      
      // Semantic search: find documents by meaning using vector embeddings
      case 'search_semantic':
        return await searchSemantic(params, userId, firmId);
      
      default:
        // Delegate to the standard AI agent tool executor (same as normal AI chat)
        if (!executeAgentTool) {
          console.error(`[Amplifier Tool] executeAgentTool not available - aiAgent.js import may have failed`);
          return { error: `Tool '${toolName}' not available - agent tools not loaded` };
        }
        // Wrap with retry for transient failures
        return await withRetry(
          () => executeAgentTool(toolName, params, user, null),
          toolName
        );
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Amplifier Tool] Error executing ${toolName} after ${elapsed}ms:`, error.message);
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'Tool execution failed';
    
    if (error.message?.includes('not found')) {
      errorMessage = `Resource not found: ${error.message}`;
    } else if (error.message?.includes('permission') || error.message?.includes('unauthorized')) {
      errorMessage = `Permission denied: ${error.message}`;
    } else if (error.message?.includes('validation') || error.message?.includes('invalid')) {
      errorMessage = `Invalid input: ${error.message}`;
    }
    
    return { 
      error: errorMessage,
      tool: toolName,
      elapsed_ms: elapsed
    };
  }
}

// ============== TOOL IMPLEMENTATIONS ==============

async function logTime(params, userId, firmId) {
  const { matter_id, hours, description, date, billable = true } = params;
  
  // Find matter by ID or name
  let matterId = matter_id;
  if (!matter_id.match(/^[0-9a-f-]{36}$/i)) {
    const matterResult = await query(`
      SELECT id FROM matters 
      WHERE firm_id = $1 AND (LOWER(name) LIKE $2 OR LOWER(number) LIKE $2)
      LIMIT 1
    `, [firmId, `%${matter_id.toLowerCase()}%`]);
    
    if (!matterResult.rows.length) {
      return { error: `Matter not found: ${matter_id}` };
    }
    matterId = matterResult.rows[0].id;
  }
  
  // Get billing rate
  const matterInfo = await query(`
    SELECT m.billing_rate, m.billing_type, u.hourly_rate
    FROM matters m
    LEFT JOIN users u ON u.id = $2
    WHERE m.id = $1
  `, [matterId, userId]);
  
  const rate = matterInfo.rows[0]?.billing_rate || matterInfo.rows[0]?.hourly_rate || 0;
  const amount = hours * rate;
  
  const result = await query(`
    INSERT INTO time_entries (firm_id, user_id, matter_id, hours, description, date, billable, rate, amount)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, hours, description, date, amount
  `, [firmId, userId, matterId, hours, description, date || getTodayInTimezone(), billable, rate, amount]);
  
  return { success: true, timeEntry: result.rows[0] };
}

async function getTimeEntries(params, userId, firmId) {
  const { limit = 20, start_date, end_date, matter_id } = params;
  
  let sql = `
    SELECT te.*, m.name as matter_name
    FROM time_entries te
    LEFT JOIN matters m ON te.matter_id = m.id
    WHERE te.firm_id = $1 AND te.user_id = $2
  `;
  const values = [firmId, userId];
  let idx = 3;
  
  if (start_date) {
    sql += ` AND te.date >= $${idx++}`;
    values.push(start_date);
  }
  if (end_date) {
    sql += ` AND te.date <= $${idx++}`;
    values.push(end_date);
  }
  if (matter_id) {
    sql += ` AND te.matter_id = $${idx++}`;
    values.push(matter_id);
  }
  
  sql += ` ORDER BY te.date DESC, te.created_at DESC LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { timeEntries: result.rows };
}

async function listMatters(params, userId, firmId) {
  const { status = 'active', limit = 50 } = params;
  
  const result = await query(`
    SELECT m.*, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1 AND m.status = $2
    ORDER BY m.created_at DESC
    LIMIT $3
  `, [firmId, status, limit]);
  
  return { matters: result.rows };
}

async function searchMatters(params, userId, firmId) {
  const { search, status, client_id } = params;
  
  let sql = `
    SELECT m.*, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1
  `;
  const values = [firmId];
  let idx = 2;
  
  if (search) {
    sql += ` AND (LOWER(m.name) LIKE $${idx} OR LOWER(m.number) LIKE $${idx} OR LOWER(c.display_name) LIKE $${idx})`;
    values.push(`%${search.toLowerCase()}%`);
    idx++;
  }
  if (status) {
    sql += ` AND m.status = $${idx++}`;
    values.push(status);
  }
  if (client_id) {
    sql += ` AND m.client_id = $${idx++}`;
    values.push(client_id);
  }
  
  sql += ` ORDER BY m.created_at DESC LIMIT 20`;
  
  const result = await query(sql, values);
  return { matters: result.rows };
}

async function getMatter(params, userId, firmId) {
  const { matter_id } = params;
  
  // Support flexible matching
  let matterQuery;
  if (matter_id.match(/^[0-9a-f-]{36}$/i)) {
    matterQuery = await query(`
      SELECT m.*, c.display_name as client_name, c.email as client_email
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.id = $1 AND m.firm_id = $2
    `, [matter_id, firmId]);
  } else {
    matterQuery = await query(`
      SELECT m.*, c.display_name as client_name, c.email as client_email
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.firm_id = $1 AND (LOWER(m.name) LIKE $2 OR LOWER(m.number) LIKE $2)
      LIMIT 1
    `, [firmId, `%${matter_id.toLowerCase()}%`]);
  }
  
  if (!matterQuery.rows.length) {
    return { error: `Matter not found: ${matter_id}` };
  }
  
  const matter = matterQuery.rows[0];
  
  // Get related data
  const [docs, tasks, events, timeEntries] = await Promise.all([
    query(`SELECT id, original_name, type, created_at FROM documents WHERE matter_id = $1 LIMIT 10`, [matter.id]),
    query(`SELECT id, name, status, due_date FROM matter_tasks WHERE matter_id = $1 LIMIT 10`, [matter.id]),
    query(`SELECT id, title, start_time, type FROM calendar_events WHERE matter_id = $1 AND start_time >= NOW() LIMIT 5`, [matter.id]),
    query(`SELECT SUM(hours) as total_hours, SUM(amount) as total_amount FROM time_entries WHERE matter_id = $1`, [matter.id])
  ]);
  
  return {
    matter,
    documents: docs.rows,
    tasks: tasks.rows,
    upcomingEvents: events.rows,
    billing: timeEntries.rows[0]
  };
}

async function createMatter(params, userId, firmId) {
  const { name, client_id, description, type, priority = 'medium', billing_type = 'hourly', billing_rate } = params;
  
  // Generate matter number
  const countResult = await query('SELECT COUNT(*) FROM matters WHERE firm_id = $1', [firmId]);
  const number = `M-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;
  
  const result = await query(`
    INSERT INTO matters (firm_id, name, number, client_id, description, type, priority, billing_type, billing_rate, status, responsible_attorney)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
    RETURNING *
  `, [firmId, name, number, client_id || null, description || null, type || 'general', priority, billing_type, billing_rate || null, userId]);
  
  return { success: true, matter: result.rows[0] };
}

async function updateMatter(params, userId, firmId) {
  const { matter_id, ...updates } = params;
  
  const fields = [];
  const values = [matter_id, firmId];
  let idx = 3;
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  
  if (!fields.length) return { error: 'No fields to update' };
  
  const result = await query(`
    UPDATE matters SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, values);
  
  return { success: true, matter: result.rows[0] };
}

async function closeMatter(params, userId, firmId) {
  const { matter_id, resolution, closing_notes } = params;
  
  const result = await query(`
    UPDATE matters 
    SET status = 'closed', close_date = NOW(), resolution = $3, closing_notes = $4, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [matter_id, firmId, resolution || null, closing_notes || null]);
  
  return { success: true, matter: result.rows[0] };
}

async function listClients(params, userId, firmId) {
  const { search, type, limit = 50 } = params;
  
  let sql = 'SELECT * FROM clients WHERE firm_id = $1 AND is_active = true';
  const values = [firmId];
  let idx = 2;
  
  if (search) {
    sql += ` AND LOWER(display_name) LIKE $${idx++}`;
    values.push(`%${search.toLowerCase()}%`);
  }
  if (type) {
    sql += ` AND type = $${idx++}`;
    values.push(type);
  }
  
  sql += ` ORDER BY display_name LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { clients: result.rows };
}

async function getClient(params, userId, firmId) {
  const { client_id } = params;
  
  const clientResult = await query('SELECT * FROM clients WHERE id = $1 AND firm_id = $2', [client_id, firmId]);
  if (!clientResult.rows.length) return { error: 'Client not found' };
  
  const [matters, invoices] = await Promise.all([
    query('SELECT id, name, number, status FROM matters WHERE client_id = $1 LIMIT 10', [client_id]),
    query('SELECT id, number, total, amount_due, status FROM invoices WHERE client_id = $1 LIMIT 10', [client_id])
  ]);
  
  return {
    client: clientResult.rows[0],
    matters: matters.rows,
    invoices: invoices.rows
  };
}

async function createClient(params, userId, firmId) {
  const { display_name, type = 'person', email, phone, first_name, last_name } = params;
  
  const result = await query(`
    INSERT INTO clients (firm_id, display_name, type, email, phone, first_name, last_name)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [firmId, display_name, type, email || null, phone || null, first_name || null, last_name || null]);
  
  return { success: true, client: result.rows[0] };
}

async function updateClient(params, userId, firmId) {
  const { client_id, ...updates } = params;
  
  const fields = [];
  const values = [client_id, firmId];
  let idx = 3;
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  
  if (!fields.length) return { error: 'No fields to update' };
  
  const result = await query(`
    UPDATE clients SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, values);
  
  return { success: true, client: result.rows[0] };
}

async function listInvoices(params, userId, firmId) {
  const { status, client_id, matter_id, limit = 20 } = params;
  
  let sql = `
    SELECT i.*, c.display_name as client_name
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    WHERE i.firm_id = $1
  `;
  const values = [firmId];
  let idx = 2;
  
  if (status) {
    sql += ` AND i.status = $${idx++}`;
    values.push(status);
  }
  if (client_id) {
    sql += ` AND i.client_id = $${idx++}`;
    values.push(client_id);
  }
  if (matter_id) {
    sql += ` AND i.matter_id = $${idx++}`;
    values.push(matter_id);
  }
  
  sql += ` ORDER BY i.created_at DESC LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { invoices: result.rows };
}

async function createInvoice(params, userId, firmId) {
  const { client_id, matter_id, due_date, items, include_unbilled_time } = params;
  
  // Generate invoice number
  const countResult = await query('SELECT COUNT(*) FROM invoices WHERE firm_id = $1', [firmId]);
  const number = `INV-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;
  
  let total = 0;
  if (items && items.length) {
    total = items.reduce((sum, item) => sum + (item.amount * (item.quantity || 1)), 0);
  }
  
  const result = await query(`
    INSERT INTO invoices (firm_id, client_id, matter_id, number, due_date, total, amount_due, status)
    VALUES ($1, $2, $3, $4, $5, $6, $6, 'draft')
    RETURNING *
  `, [firmId, client_id, matter_id || null, number, due_date || null, total]);
  
  return { success: true, invoice: result.rows[0] };
}

async function sendInvoice(params, userId, firmId) {
  const { invoice_id } = params;
  
  if (!invoice_id) {
    return { error: 'invoice_id is required' };
  }
  
  const existing = await query(
    'SELECT id, number, status FROM invoices WHERE id = $1 AND firm_id = $2',
    [invoice_id, firmId]
  );
  
  if (!existing.rows.length) {
    return { error: 'Invoice not found' };
  }
  
  if (existing.rows[0].status !== 'draft') {
    return { error: 'Invoice has already been sent' };
  }
  
  await query(
    `UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = $1`,
    [invoice_id]
  );
  
  return {
    success: true,
    message: `Invoice ${existing.rows[0].number} marked as sent`
  };
}

async function recordPayment(params, userId, firmId) {
  const { invoice_id, amount, payment_method, payment_date } = params;
  
  const result = await query(`
    INSERT INTO payments (firm_id, invoice_id, amount, payment_method, payment_date)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [firmId, invoice_id, amount, payment_method || 'other', payment_date || getTodayInTimezone()]);
  
  // Update invoice amount_due
  await query(`
    UPDATE invoices SET amount_due = amount_due - $1,
    status = CASE WHEN amount_due - $1 <= 0 THEN 'paid' ELSE status END
    WHERE id = $2
  `, [amount, invoice_id]);
  
  return { success: true, payment: result.rows[0] };
}

async function listDocuments(params, userId, firmId) {
  const { matter_id, client_id, search, limit = 20 } = params;
  
  let sql = 'SELECT * FROM documents WHERE firm_id = $1';
  const values = [firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (client_id) {
    sql += ` AND client_id = $${idx++}`;
    values.push(client_id);
  }
  if (search) {
    sql += ` AND LOWER(original_name) LIKE $${idx++}`;
    values.push(`%${search.toLowerCase()}%`);
  }
  
  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { documents: result.rows };
}

async function extractDocumentText(doc, firmId) {
  const fileName = doc.original_name || doc.name || 'document';
  
  // Prefer local file path if available
  if (doc.path && fs.existsSync(doc.path)) {
    return await extractTextFromFile(doc.path, fileName, doc.type);
  }
  
  // Fallback to Azure File Share when configured
  try {
    const azureEnabled = await isAzureConfigured();
    if (azureEnabled) {
      const prefix = `firm-${firmId}/`;
      const candidatePaths = [doc.azure_path, doc.external_path, doc.path].filter(Boolean)
        .map(pathValue => pathValue.startsWith(prefix) ? pathValue.slice(prefix.length) : pathValue);
      
      for (const remotePath of candidatePaths) {
        try {
          const buffer = await downloadFile(remotePath, firmId);
          if (!buffer || buffer.length === 0) continue;
          
          const tempPath = path.join(
            os.tmpdir(),
            `amp-doc-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(fileName)}`
          );
          
          await fs.promises.writeFile(tempPath, buffer);
          try {
            const extracted = await extractTextFromFile(tempPath, fileName, doc.type);
            if (extracted) return extracted;
          } finally {
            await fs.promises.unlink(tempPath).catch(() => null);
          }
        } catch (error) {
          // Try next path
        }
      }
    }
  } catch (error) {
    console.error('[Amplifier Tool] Azure download failed:', error.message);
  }
  
  return null;
}

// Supported file formats for text extraction
const SUPPORTED_TEXT_FORMATS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.json', '.csv', '.xml', '.html', '.htm', '.rtf'];
const UNSUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.mp3', '.mp4', '.wav', '.avi', '.mov', '.zip', '.rar', '.exe'];

function getFileExtension(filename) {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot).toLowerCase();
}

async function readDocumentContent(params, userId, firmId) {
  const { document_id, max_length = 10000 } = params;
  
  if (!document_id) {
    return { 
      error: 'document_id is required',
      suggestion: 'Use list_documents to find document IDs first'
    };
  }
  
  try {
    const result = await query(`
      SELECT name, original_name, content_text, path, external_path, azure_path, type, size, created_at
      FROM documents 
      WHERE id = $1 AND firm_id = $2
    `, [document_id, firmId]);
    
    if (!result.rows.length) {
      return { 
        error: 'Document not found',
        suggestion: 'Check the document_id or use list_documents to find valid IDs'
      };
    }
    
    const doc = result.rows[0];
    const fileName = doc.original_name || doc.name || 'document';
    const ext = getFileExtension(fileName);
    let content = doc.content_text || '';
    const safeMax = Number.isFinite(Number(max_length)) ? Math.min(Number(max_length), 100000) : 10000;
    
    // Check if format is known to be unsupported
    if (UNSUPPORTED_FORMATS.includes(ext)) {
      return {
        success: false,
        name: fileName,
        error: `Cannot extract text from ${ext} files`,
        file_type: ext,
        file_size: doc.size,
        suggestion: ext.match(/\.(jpg|jpeg|png|gif|bmp|tiff)$/i) 
          ? 'This is an image file. Use analyze_image if you need to understand its contents.'
          : 'This file format does not contain extractable text.',
        created_at: doc.created_at
      };
    }
    
    // If no stored content, try to extract
    if (!content) {
      // Check if format is likely supported
      const isLikelySupported = SUPPORTED_TEXT_FORMATS.includes(ext) || ext === '';
      
      if (!isLikelySupported) {
        return {
          success: false,
          name: fileName,
          content: '',
          file_type: ext || 'unknown',
          file_size: doc.size,
          note: `File format "${ext || 'unknown'}" may not be supported for text extraction. The document exists but content could not be read.`,
          suggestion: 'You can still reference this document exists - just note that you could not read its contents.',
          created_at: doc.created_at
        };
      }
      
      try {
        // Add timeout protection for document extraction (45 seconds for larger files)
        const extractionTimeout = doc.size > 5000000 ? 60000 : 30000; // 60s for >5MB, else 30s
        const extractionPromise = extractDocumentText(doc, firmId);
        const timeoutPromise = new Promise((resolve) => 
          setTimeout(() => resolve(null), extractionTimeout)
        );
        
        console.log(`[Amplifier Tool] Extracting content from ${fileName} (${ext}, ${doc.size} bytes)`);
        
        const extracted = await Promise.race([extractionPromise, timeoutPromise]);
        
        if (extracted && extracted.trim().length > 0) {
          content = extracted;
          try {
            await query(
              `UPDATE documents SET content_text = $1, content_extracted_at = NOW() WHERE id = $2`,
              [content.substring(0, 200000), document_id] // Limit stored content to 200K chars
            );
            console.log(`[Amplifier Tool] Stored extracted content: ${content.length} chars`);
          } catch (storeError) {
            console.error('[Amplifier Tool] Failed to store extracted content:', storeError.message);
          }
        } else {
          console.log(`[Amplifier Tool] Extraction returned empty for ${fileName}`);
        }
      } catch (extractError) {
        console.error('[Amplifier Tool] Document extraction failed:', extractError.message);
        // Continue - we'll return appropriate message below
      }
    }
    
    // Return result with appropriate messaging
    if (content && content.trim().length > 0) {
      const truncatedContent = content.substring(0, safeMax);
      const isTruncated = content.length > safeMax;
      
      return {
        success: true,
        name: fileName,
        file_type: ext || doc.type,
        content: truncatedContent,
        content_length: content.length,
        truncated: isTruncated,
        truncated_at: isTruncated ? safeMax : null,
        created_at: doc.created_at,
        note: isTruncated 
          ? `Document truncated at ${safeMax.toLocaleString()} characters. Full document is ${content.length.toLocaleString()} characters.`
          : null
      };
    } else {
      // No content available
      return {
        success: false,
        name: fileName,
        file_type: ext || doc.type,
        file_size: doc.size,
        content: '',
        note: 'No text content could be extracted from this document.',
        possible_reasons: [
          'The file may be a scanned image/PDF without OCR',
          'The file may be password-protected',
          'The file format may not be fully supported',
          'The file may be corrupted or empty'
        ],
        suggestion: 'Document exists but content is not readable. Note this limitation and proceed with other available information.',
        created_at: doc.created_at
      };
    }
  } catch (error) {
    console.error('[Amplifier Tool] readDocumentContent error:', error.message);
    return { 
      success: false,
      error: 'Failed to read document content',
      details: error.message,
      suggestion: 'This may be a temporary error. You can try again or proceed without this document.'
    };
  }
}

async function createDocument(params, userId, firmId) {
  const { name, content, matter_id, client_id, tags } = params;
  
  if (!name || !content) {
    return { error: 'Document name and content are required' };
  }
  
  let userName = 'Apex User';
  try {
    const userResult = await query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length > 0) {
      const first = userResult.rows[0].first_name || '';
      const last = userResult.rows[0].last_name || '';
      userName = `${first} ${last}`.trim() || userName;
    }
  } catch (error) {
    // Fallback to default name if lookup fails
  }
  
  try {
    let baseName = name.replace(/\s*\(AI\)\s*$/, '').replace(/\.(txt|pdf|doc|docx)$/i, '');
    const docName = `${baseName} (AI).docx`;
    
    const timestamp = Date.now();
    const safeName = baseName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}-${safeName}_AI.docx`;
    
    const uploadsDir = path.join(process.cwd(), 'uploads', 'ai-generated');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const filePath = path.join(uploadsDir, filename);
    const relativePath = `uploads/ai-generated/${filename}`;
    
    let folderPath = 'ai-generated';
    if (matter_id) {
      const matterResult = await query(
        'SELECT name FROM matters WHERE id = $1 AND firm_id = $2',
        [matter_id, firmId]
      );
      if (matterResult.rows.length > 0) {
        const matterName = matterResult.rows[0].name.replace(/[^a-zA-Z0-9 ]/g, '_');
        folderPath = `matters/${matterName}/ai-generated`;
      }
    }
    const azurePath = `${folderPath}/${filename}`;
    
    // Generate DOCX using docx library
    const docChildren = [];
    
    // Add document title
    docChildren.push(
      new Paragraph({
        children: [new TextRun({ text: baseName, bold: true, size: 36 })],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      })
    );
    
    // Add metadata line
    docChildren.push(
      new Paragraph({
        children: [new TextRun({ 
          text: `Generated by Background Agent for ${userName} • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          size: 20,
          color: '666666'
        })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      })
    );
    
    // Add horizontal line separator
    docChildren.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
        spacing: { after: 400 }
      })
    );
    
    // Process content - handle markdown-like formatting
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('### ')) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: line.replace('### ', ''), bold: true, size: 24 })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 }
        }));
      } else if (line.startsWith('## ')) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: line.replace('## ', ''), bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 }
        }));
      } else if (line.startsWith('# ')) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: line.replace('# ', ''), bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 100 }
        }));
      } else if (line.startsWith('**') && line.endsWith('**')) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: line.replace(/\*\*/g, ''), bold: true })],
          spacing: { after: 100 }
        }));
      } else if (line.startsWith('- ') || line.startsWith('• ')) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: line.substring(2) })],
          bullet: { level: 0 },
          spacing: { after: 50 }
        }));
      } else if (line.match(/^\d+\.\s/)) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: line })],
          indent: { left: 720 },
          spacing: { after: 50 }
        }));
      } else if (line.trim() === '') {
        docChildren.push(new Paragraph({ spacing: { after: 200 } }));
      } else {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: line })],
          spacing: { after: 100 }
        }));
      }
    }
    
    // Create the document
    const doc = new Document({
      sections: [{
        properties: {},
        children: docChildren
      }]
    });
    
    // Generate buffer and write to file
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);
    
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    let azureResult = null;
    try {
      const azureEnabled = await isAzureConfigured();
      if (azureEnabled) {
        azureResult = await uploadFile(filePath, azurePath, firmId);
        console.log(`[Amplifier Document] Uploaded to Azure: ${azureResult.path}`);
      }
    } catch (azureError) {
      console.error('[Amplifier Document] Azure upload failed (continuing with local):', azureError.message);
    }
    
    const privacyLevel = matter_id ? 'team' : 'private';
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const tagList = Array.isArray(tags)
      ? tags
      : typeof tags === 'string' && tags.trim().length > 0
        ? tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : ['ai-generated'];
    
    // Use base schema columns only to avoid migration issues
    const result = await query(
      `INSERT INTO documents (
        firm_id, matter_id, client_id, name, original_name, type, size, path,
        tags, status, uploaded_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'final', $10, $11)
      RETURNING id, name`,
      [
        firmId,
        matter_id || null,
        client_id || null,
        docName,
        docName,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize,
        azureResult ? azureResult.path : relativePath,
        tagList,
        userId,
        JSON.stringify({ 
          ai_generated: true, 
          content_text: content,
          azure_path: azureResult?.path || null
        })
      ]
    );
    
    const savedDoc = result.rows[0];
    
    try {
      await query(
        `INSERT INTO document_permissions (
          document_id, firm_id, user_id, permission_level,
          can_view, can_download, can_edit, can_delete, can_share, can_manage_permissions,
          created_by
        ) VALUES ($1, $2, $3, 'full', true, true, true, true, true, true, $3)
        ON CONFLICT DO NOTHING`,
        [savedDoc.id, firmId, userId]
      );
    } catch (permError) {
      console.log('[Amplifier Document] Permission auto-create skipped');
    }
    
    try {
      const wordCount = content.split(/\s+/).filter(word => word).length;
      await query(
        `INSERT INTO document_versions (
          document_id, firm_id, version_number, version_label,
          content_text, content_hash, change_summary, change_type,
          word_count, character_count, file_size, created_by, created_by_name, source
        ) VALUES ($1, $2, 1, 'AI Generated', $3, $4, 'Document created by background agent', 'create', $5, $6, $7, $8, $9, 'ai')`,
        [
          savedDoc.id, firmId, content, contentHash,
          wordCount, content.length, fileSize,
          userId, userName
        ]
      );
    } catch (versionError) {
      console.log('[Amplifier Document] Initial version creation skipped:', versionError.message);
    }
    
    try {
      await query(
        `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, 'document.ai_created', 'document', $3, $4)`,
        [firmId, userId, savedDoc.id, JSON.stringify({ 
          name: docName, 
          size: fileSize, 
          azureUploaded: !!azureResult,
          ownerId: userId,
          privacyLevel
        })]
      );
    } catch (auditError) {
      console.log('[Amplifier Document] Audit log skipped');
    }
    
    let locationInfo = '';
    if (matter_id) {
      const matterRes = await query('SELECT name, number FROM matters WHERE id = $1', [matter_id]);
      if (matterRes.rows.length > 0) {
        locationInfo = ` and attached to matter "${matterRes.rows[0].name}" (${matterRes.rows[0].number})`;
      }
    } else if (client_id) {
      const clientRes = await query('SELECT display_name FROM clients WHERE id = $1', [client_id]);
      if (clientRes.rows.length > 0) {
        locationInfo = ` and attached to client "${clientRes.rows[0].display_name}"`;
      }
    }
    
    const driveInfo = azureResult ? ' The document has been saved to the firm drive.' : '';
    
    return {
      success: true,
      message: `Created Word document "${savedDoc.name}"${locationInfo}.${driveInfo} You are the owner and have full access to this document.`,
      data: {
        id: savedDoc.id,
        name: savedDoc.name,
        type: 'docx',
        matter_id,
        client_id,
        owner_id: userId,
        privacy_level: privacyLevel,
        azure_uploaded: !!azureResult,
        content_preview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
      }
    };
  } catch (error) {
    console.error('[Amplifier Document] Error creating document:', error);
    return { error: 'Failed to create document: ' + error.message };
  }
}

async function searchDocumentContent(params, userId, firmId) {
  const { search_term, matter_id, client_id } = params;
  
  let sql = `
    SELECT id, name, original_name, matter_id,
      SUBSTRING(COALESCE(content_text, '') FROM POSITION(LOWER($2) IN LOWER(COALESCE(content_text, ''))) FOR 200) as excerpt
    FROM documents
    WHERE firm_id = $1 AND LOWER(COALESCE(content_text, '')) LIKE $3
  `;
  const values = [firmId, search_term, `%${search_term.toLowerCase()}%`];
  let idx = 4;
  
  if (matter_id) {
    sql += ` AND matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (client_id) {
    sql += ` AND client_id = $${idx++}`;
    values.push(client_id);
  }
  
  sql += ' LIMIT 10';
  
  const result = await query(sql, values);
  return { results: result.rows };
}

async function getCalendarEvents(params, userId, firmId) {
  const { days_ahead = 7, matter_id, type } = params;
  
  let sql = `
    SELECT e.*, m.name as matter_name
    FROM calendar_events e
    LEFT JOIN matters m ON e.matter_id = m.id
    WHERE e.firm_id = $1 AND e.start_time >= NOW() AND e.start_time < NOW() + INTERVAL '${days_ahead} days'
  `;
  const values = [firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND e.matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (type) {
    sql += ` AND e.type = $${idx++}`;
    values.push(type);
  }
  
  sql += ' ORDER BY e.start_time';
  
  const result = await query(sql, values);
  return { events: result.rows };
}

async function createCalendarEvent(params, userId, firmId) {
  const { title, start_time, end_time, type = 'meeting', matter_id, location, description } = params;
  
  const result = await query(`
    INSERT INTO calendar_events (firm_id, user_id, title, start_time, end_time, type, matter_id, location, description)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [firmId, userId, title, start_time, end_time || null, type, matter_id || null, location || null, description || null]);
  
  return { success: true, event: result.rows[0] };
}

async function listTasks(params, userId, firmId) {
  const { status, matter_id, assigned_to } = params;
  
  let sql = `SELECT * FROM matter_tasks WHERE firm_id = $1`;
  const values = [firmId];
  let idx = 2;
  
  if (status) {
    sql += ` AND status = $${idx++}`;
    values.push(status);
  }
  if (matter_id) {
    sql += ` AND matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (assigned_to) {
    // Resolve assigned_to to a user ID
    let assigneeId = userId; // Default to current user
    
    if (assigned_to === 'me') {
      assigneeId = userId;
    } else if (assigned_to.match(/^[0-9a-f-]{36}$/i)) {
      // It's a UUID, use directly
      assigneeId = assigned_to;
    } else if (assigned_to.includes('@')) {
      // It's an email, look up the user
      const userResult = await query(
        'SELECT id FROM users WHERE firm_id = $1 AND LOWER(email) = LOWER($2)',
        [firmId, assigned_to]
      );
      if (userResult.rows.length > 0) {
        assigneeId = userResult.rows[0].id;
      } else {
        // User not found, return empty results
        return { tasks: [], message: `User not found: ${assigned_to}` };
      }
    } else {
      // Try to match by name
      const userResult = await query(
        `SELECT id FROM users WHERE firm_id = $1 AND (
          LOWER(first_name || ' ' || last_name) LIKE LOWER($2) OR
          LOWER(last_name) LIKE LOWER($2)
        )`,
        [firmId, `%${assigned_to}%`]
      );
      if (userResult.rows.length > 0) {
        assigneeId = userResult.rows[0].id;
      }
    }
    
    sql += ` AND assignee = $${idx++}`;
    values.push(assigneeId);
  }
  
  sql += ' ORDER BY due_date NULLS LAST, created_at DESC LIMIT 50';
  
  const result = await query(sql, values);
  return { tasks: result.rows };
}

async function createTask(params, userId, firmId) {
  const { title, due_date, priority = 'medium', matter_id, assigned_to } = params;
  
  // Resolve assigned_to to a user ID
  let assigneeId = userId; // Default to current user
  
  if (assigned_to) {
    if (assigned_to === 'me') {
      assigneeId = userId;
    } else if (assigned_to.match(/^[0-9a-f-]{36}$/i)) {
      // It's a UUID, use directly
      assigneeId = assigned_to;
    } else if (assigned_to.includes('@')) {
      // It's an email, look up the user
      const userResult = await query(
        'SELECT id FROM users WHERE firm_id = $1 AND LOWER(email) = LOWER($2)',
        [firmId, assigned_to]
      );
      if (userResult.rows.length > 0) {
        assigneeId = userResult.rows[0].id;
      }
    } else {
      // Try to match by name
      const userResult = await query(
        `SELECT id FROM users WHERE firm_id = $1 AND (
          LOWER(first_name || ' ' || last_name) LIKE LOWER($2) OR
          LOWER(last_name) LIKE LOWER($2)
        )`,
        [firmId, `%${assigned_to}%`]
      );
      if (userResult.rows.length > 0) {
        assigneeId = userResult.rows[0].id;
      }
    }
  }
  
  const result = await query(`
    INSERT INTO matter_tasks (firm_id, matter_id, name, due_date, priority, assignee, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    RETURNING *
  `, [firmId, matter_id || null, title, due_date || null, priority, assigneeId]);
  
  return { success: true, task: result.rows[0] };
}

async function completeTask(params, userId, firmId) {
  const { task_id } = params;
  
  const result = await query(`
    UPDATE matter_tasks SET status = 'completed', completed_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [task_id, firmId]);
  
  return { success: true, task: result.rows[0] };
}

async function generateReport(params, userId, firmId) {
  const { report_type, start_date, end_date, matter_id, client_id } = params;
  
  // Simplified report generation
  let report = { type: report_type };
  
  switch (report_type) {
    case 'billing_summary':
      const billing = await query(`
        SELECT SUM(hours) as total_hours, SUM(amount) as total_amount,
          COUNT(*) as entry_count
        FROM time_entries
        WHERE firm_id = $1
          ${start_date ? 'AND date >= $2' : ''}
          ${end_date ? 'AND date <= $3' : ''}
      `, [firmId, start_date, end_date].filter(Boolean));
      report.data = billing.rows[0];
      break;
    
    case 'outstanding_invoices':
      const outstanding = await query(`
        SELECT i.*, c.display_name as client_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        WHERE i.firm_id = $1 AND i.status IN ('sent', 'overdue')
        ORDER BY i.due_date
      `, [firmId]);
      report.data = outstanding.rows;
      break;
    
    default:
      report.data = { message: `Report type ${report_type} not yet implemented` };
  }
  
  return report;
}

async function getFirmAnalytics(params, userId, firmId) {
  const { time_period = 'current_month' } = params;
  
  const [matters, time, invoices] = await Promise.all([
    query(`SELECT status, COUNT(*) as count FROM matters WHERE firm_id = $1 GROUP BY status`, [firmId]),
    query(`
      SELECT SUM(hours) as total_hours, SUM(amount) as total_amount
      FROM time_entries WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)
    `, [firmId]),
    query(`
      SELECT SUM(total) as total_billed, SUM(amount_due) as outstanding
      FROM invoices WHERE firm_id = $1
    `, [firmId])
  ]);
  
  return {
    mattersByStatus: matters.rows,
    thisMonth: time.rows[0],
    invoiceSummary: invoices.rows[0]
  };
}

async function listTeamMembers(params, userId, firmId) {
  const { role, active_only = true } = params;
  
  let sql = 'SELECT id, first_name, last_name, email, role FROM users WHERE firm_id = $1';
  const values = [firmId];
  let idx = 2;
  
  if (active_only) {
    sql += ' AND is_active = true';
  }
  if (role) {
    sql += ` AND role = $${idx++}`;
    values.push(role);
  }
  
  const result = await query(sql, values);
  return { members: result.rows };
}

// ============== LEGAL-SPECIFIC TOOL IMPLEMENTATIONS ==============

/**
 * Check for conflicts of interest
 * Searches clients, matters, and documents for potential conflicts
 */
async function checkConflicts(params, userId, firmId) {
  const { party_names, matter_description, check_type = 'new_matter' } = params;
  
  if (!party_names || !Array.isArray(party_names) || party_names.length === 0) {
    return { error: 'party_names array is required' };
  }
  
  const conflicts = [];
  const checkedParties = [];
  
  for (const partyName of party_names) {
    const nameLower = partyName.toLowerCase().trim();
    if (!nameLower) continue;
    
    checkedParties.push(partyName);
    
    // Check clients
    const clientMatches = await query(`
      SELECT id, display_name, type, email
      FROM clients
      WHERE firm_id = $1 AND is_active = true
        AND (LOWER(display_name) LIKE $2 
             OR LOWER(first_name) LIKE $2 
             OR LOWER(last_name) LIKE $2
             OR LOWER(company_name) LIKE $2)
    `, [firmId, `%${nameLower}%`]);
    
    if (clientMatches.rows.length > 0) {
      for (const client of clientMatches.rows) {
        conflicts.push({
          type: 'existing_client',
          party_searched: partyName,
          match: client.display_name,
          client_id: client.id,
          severity: 'high',
          action_required: 'Verify relationship - may be conflict or existing client'
        });
      }
    }
    
    // Check matters (for adverse parties in matter names or descriptions)
    const matterMatches = await query(`
      SELECT m.id, m.name, m.number, m.status, c.display_name as client_name
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.firm_id = $1
        AND (LOWER(m.name) LIKE $2 
             OR LOWER(m.description) LIKE $2
             OR LOWER(m.opposing_party) LIKE $2
             OR LOWER(m.opposing_counsel) LIKE $2)
    `, [firmId, `%${nameLower}%`]);
    
    if (matterMatches.rows.length > 0) {
      for (const matter of matterMatches.rows) {
        conflicts.push({
          type: 'matter_reference',
          party_searched: partyName,
          match: matter.name,
          matter_id: matter.id,
          matter_number: matter.number,
          client_name: matter.client_name,
          severity: 'medium',
          action_required: 'Review matter to determine if party is adverse'
        });
      }
    }
    
    // Search document contents for party name
    const docMatches = await query(`
      SELECT d.id, d.original_name, d.matter_id, m.name as matter_name
      FROM documents d
      LEFT JOIN matters m ON d.matter_id = m.id
      WHERE d.firm_id = $1 AND LOWER(d.content_text) LIKE $2
      LIMIT 5
    `, [firmId, `%${nameLower}%`]);
    
    if (docMatches.rows.length > 0) {
      for (const doc of docMatches.rows) {
        conflicts.push({
          type: 'document_reference',
          party_searched: partyName,
          match: doc.original_name,
          document_id: doc.id,
          matter_name: doc.matter_name,
          severity: 'low',
          action_required: 'Review document to determine relationship'
        });
      }
    }
  }
  
  const hasConflicts = conflicts.some(c => c.severity === 'high' || c.severity === 'medium');
  
  return {
    success: true,
    check_type,
    parties_checked: checkedParties,
    conflicts_found: conflicts.length,
    has_potential_conflicts: hasConflicts,
    conflicts,
    recommendation: hasConflicts 
      ? 'POTENTIAL CONFLICTS DETECTED - Review each match carefully before proceeding. Obtain conflict waivers if needed.'
      : 'No obvious conflicts found. Proceed with standard intake process.',
    disclaimer: 'This is an automated check. Attorney review is required for final conflict determination.'
  };
}

/**
 * Set a critical legal deadline with reminders
 */
async function setCriticalDeadline(params, userId, firmId) {
  const { 
    matter_id, 
    deadline_type, 
    date, 
    description, 
    reminder_days = [14, 7, 3, 1] 
  } = params;
  
  if (!matter_id || !deadline_type || !date || !description) {
    return { error: 'matter_id, deadline_type, date, and description are required' };
  }
  
  // Validate deadline type
  const validTypes = ['statute_of_limitations', 'filing_deadline', 'discovery_cutoff', 
                      'court_ordered', 'appeal_deadline', 'response_deadline', 'other'];
  if (!validTypes.includes(deadline_type)) {
    return { error: `Invalid deadline_type. Must be one of: ${validTypes.join(', ')}` };
  }
  
  // Find matter
  let matterId = matter_id;
  if (!matter_id.match(/^[0-9a-f-]{36}$/i)) {
    const matterResult = await query(`
      SELECT id, name FROM matters 
      WHERE firm_id = $1 AND (LOWER(name) LIKE $2 OR LOWER(number) LIKE $2)
      LIMIT 1
    `, [firmId, `%${matter_id.toLowerCase()}%`]);
    
    if (!matterResult.rows.length) {
      return { error: `Matter not found: ${matter_id}` };
    }
    matterId = matterResult.rows[0].id;
  }
  
  // Create the main deadline event
  const deadlineTitle = `⚠️ DEADLINE: ${description}`;
  const deadlineResult = await query(`
    INSERT INTO calendar_events (
      firm_id, user_id, title, start_time, end_time, type, matter_id, 
      description, all_day, priority
    )
    VALUES ($1, $2, $3, $4, $4, 'deadline', $5, $6, true, 'urgent')
    RETURNING id, title, start_time
  `, [firmId, userId, deadlineTitle, date, matterId, 
      `${deadline_type.toUpperCase()}: ${description}\n\nThis is a critical legal deadline. Missing this deadline may constitute malpractice.`]);
  
  const deadlineEvent = deadlineResult.rows[0];
  const reminders = [];
  
  // Create reminder events
  for (const daysBefore of reminder_days) {
    const reminderDate = new Date(date);
    reminderDate.setDate(reminderDate.getDate() - daysBefore);
    
    // Skip if reminder date is in the past
    if (reminderDate < new Date()) continue;
    
    const reminderTitle = `🔔 ${daysBefore} DAYS UNTIL: ${description}`;
    await query(`
      INSERT INTO calendar_events (
        firm_id, user_id, title, start_time, end_time, type, matter_id,
        description, all_day, priority
      )
      VALUES ($1, $2, $3, $4, $4, 'reminder', $5, $6, true, 'high')
    `, [firmId, userId, reminderTitle, reminderDate.toISOString().split('T')[0], matterId,
        `Reminder: ${daysBefore} days until ${deadline_type}: ${description}`]);
    
    reminders.push({
      days_before: daysBefore,
      date: reminderDate.toISOString().split('T')[0]
    });
  }
  
  // Also create a task for tracking
  await query(`
    INSERT INTO matter_tasks (firm_id, matter_id, name, due_date, priority, status, assignee)
    VALUES ($1, $2, $3, $4, 'urgent', 'pending', $5)
  `, [firmId, matterId, `DEADLINE: ${description}`, date, userId]);
  
  return {
    success: true,
    message: `Critical deadline set for ${date}`,
    deadline: {
      id: deadlineEvent.id,
      type: deadline_type,
      date,
      description,
      title: deadlineEvent.title
    },
    reminders_created: reminders,
    task_created: true,
    warning: 'This deadline has been marked as CRITICAL. Multiple reminders have been set.'
  };
}

/**
 * Get upcoming critical deadlines
 */
async function getUpcomingDeadlines(params, userId, firmId) {
  const { days_ahead = 30, matter_id, deadline_type } = params;
  
  let sql = `
    SELECT e.*, m.name as matter_name, m.number as matter_number, c.display_name as client_name
    FROM calendar_events e
    LEFT JOIN matters m ON e.matter_id = m.id
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE e.firm_id = $1 
      AND e.type = 'deadline'
      AND e.start_time >= CURRENT_DATE
      AND e.start_time <= CURRENT_DATE + INTERVAL '${parseInt(days_ahead)} days'
  `;
  const values = [firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND e.matter_id = $${idx++}`;
    values.push(matter_id);
  }
  
  sql += ` ORDER BY e.start_time ASC`;
  
  const result = await query(sql, values);
  
  const deadlines = result.rows.map(row => {
    const daysUntil = Math.ceil((new Date(row.start_time) - new Date()) / (1000 * 60 * 60 * 24));
    return {
      id: row.id,
      title: row.title,
      date: row.start_time,
      days_until: daysUntil,
      urgency: daysUntil <= 3 ? 'CRITICAL' : daysUntil <= 7 ? 'URGENT' : daysUntil <= 14 ? 'APPROACHING' : 'SCHEDULED',
      matter_name: row.matter_name,
      matter_number: row.matter_number,
      client_name: row.client_name,
      description: row.description
    };
  });
  
  const criticalCount = deadlines.filter(d => d.urgency === 'CRITICAL').length;
  const urgentCount = deadlines.filter(d => d.urgency === 'URGENT').length;
  
  return {
    success: true,
    total_deadlines: deadlines.length,
    critical_deadlines: criticalCount,
    urgent_deadlines: urgentCount,
    deadlines,
    alert: criticalCount > 0 
      ? `⚠️ ALERT: ${criticalCount} deadline(s) due within 3 days!` 
      : urgentCount > 0 
        ? `🔔 ${urgentCount} deadline(s) due within 7 days`
        : 'No immediate deadline concerns'
  };
}

/**
 * Draft a legal document with professional formatting
 */
async function draftLegalDocument(params, userId, firmId) {
  const { 
    document_type, 
    title, 
    matter_id, 
    recipient,
    key_facts,
    legal_issues,
    requested_action,
    deadline,
    tone = 'formal'
  } = params;
  
  if (!document_type || !title || !matter_id) {
    return { error: 'document_type, title, and matter_id are required' };
  }
  
  // Get matter and client info
  let matterInfo = null;
  let matterId = matter_id;
  
  if (!matter_id.match(/^[0-9a-f-]{36}$/i)) {
    const matterResult = await query(`
      SELECT m.*, c.display_name as client_name, c.email as client_email
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.firm_id = $1 AND (LOWER(m.name) LIKE $2 OR LOWER(m.number) LIKE $2)
      LIMIT 1
    `, [firmId, `%${matter_id.toLowerCase()}%`]);
    
    if (matterResult.rows.length > 0) {
      matterInfo = matterResult.rows[0];
      matterId = matterInfo.id;
    }
  } else {
    const matterResult = await query(`
      SELECT m.*, c.display_name as client_name, c.email as client_email
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.id = $1 AND m.firm_id = $2
    `, [matter_id, firmId]);
    matterInfo = matterResult.rows[0];
  }
  
  // Get user info for signature
  const userResult = await query(
    'SELECT first_name, last_name, email, role FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0] || {};
  const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Attorney';
  
  // Get firm info
  const firmResult = await query('SELECT name FROM firms WHERE id = $1', [firmId]);
  const firmName = firmResult.rows[0]?.name || 'Law Firm';
  
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // Build document content based on type
  let content = '';
  
  switch (document_type) {
    case 'demand_letter':
      content = buildDemandLetter({ title, recipient, key_facts, legal_issues, requested_action, deadline, tone, userName, firmName, today, matterInfo });
      break;
    
    case 'engagement_letter':
      content = buildEngagementLetter({ title, recipient, key_facts, legal_issues, requested_action, userName, firmName, today, matterInfo });
      break;
    
    case 'legal_memo':
      content = buildLegalMemo({ title, key_facts, legal_issues, userName, firmName, today, matterInfo });
      break;
    
    case 'status_letter':
      content = buildStatusLetter({ title, recipient, key_facts, requested_action, userName, firmName, today, matterInfo });
      break;
    
    case 'closing_letter':
      content = buildClosingLetter({ title, recipient, key_facts, userName, firmName, today, matterInfo });
      break;
    
    default:
      content = buildGenericLegalDocument({ document_type, title, recipient, key_facts, legal_issues, requested_action, deadline, tone, userName, firmName, today, matterInfo });
  }
  
  // Use the existing create_document functionality
  return await createDocument({
    name: title,
    content,
    matter_id: matterId,
    tags: ['legal-document', document_type, 'ai-drafted']
  }, userId, firmId);
}

// Document template builders
function buildDemandLetter({ title, recipient, key_facts, legal_issues, requested_action, deadline, tone, userName, firmName, today, matterInfo }) {
  const clientName = matterInfo?.client_name || '[Client Name]';
  const matterName = matterInfo?.name || '[Matter Name]';
  
  return `${firmName}
Attorneys at Law

${today}

VIA CERTIFIED MAIL AND FIRST CLASS MAIL

${recipient || '[Recipient Name and Address]'}

Re: ${title}
    Our Client: ${clientName}
    Matter: ${matterName}

Dear ${recipient ? recipient.split('\n')[0] : 'Sir or Madam'}:

This firm represents ${clientName} in connection with the above-referenced matter. This letter constitutes a formal demand on behalf of our client.

## STATEMENT OF FACTS

${key_facts || '[Insert key facts supporting the demand]'}

## LEGAL BASIS

${legal_issues || '[Insert legal theories and basis for the claim]'}

## DEMAND

${requested_action || '[Insert specific demand - what relief is being sought]'}

## DEADLINE FOR RESPONSE

${deadline ? `You must respond to this demand no later than ${deadline}.` : 'Please respond to this demand within fourteen (14) days of the date of this letter.'}

Failure to respond appropriately may result in our client pursuing all available legal remedies, including but not limited to filing a lawsuit to recover damages, attorneys' fees, and costs.

Please direct all communications regarding this matter to the undersigned.

${tone === 'cordial' ? 'We hope this matter can be resolved amicably and look forward to your prompt response.' : 'Govern yourself accordingly.'}

Very truly yours,

${firmName}


_____________________________
${userName}
Attorney at Law

cc: ${clientName} (via email)
`;
}

function buildEngagementLetter({ title, recipient, key_facts, legal_issues, requested_action, userName, firmName, today, matterInfo }) {
  const clientName = matterInfo?.client_name || recipient || '[Client Name]';
  
  return `${firmName}
Attorneys at Law

${today}

${recipient || clientName}

Re: Engagement Letter - Legal Representation
    Matter: ${matterInfo?.name || title}

Dear ${clientName}:

Thank you for selecting ${firmName} to represent you. This letter confirms our engagement and sets forth the terms of our representation.

## SCOPE OF REPRESENTATION

${key_facts || 'We have been engaged to represent you in connection with [describe matter].'}

${legal_issues ? `\nThe legal issues we will address include:\n${legal_issues}` : ''}

## LEGAL FEES AND BILLING

${requested_action || `Our fees will be calculated based on the time spent on your matter at our standard hourly rates:
- Partners: $XXX per hour
- Associates: $XXX per hour
- Paralegals: $XXX per hour

You will receive monthly invoices detailing all work performed. Payment is due within 30 days of invoice date.`}

## RETAINER

[If applicable, describe retainer requirements]

## CLIENT RESPONSIBILITIES

You agree to:
1. Provide complete and accurate information
2. Respond promptly to our requests for information
3. Keep us informed of any developments
4. Pay invoices in a timely manner

## TERMINATION

Either party may terminate this engagement upon written notice. You will remain responsible for fees and costs incurred through termination.

## CONFLICTS OF INTEREST

We have conducted a conflicts check and found no conflicts that would prevent us from representing you.

## ACKNOWLEDGMENT

Please sign and return a copy of this letter to confirm your agreement with these terms.

We look forward to working with you.

Very truly yours,

${firmName}


_____________________________
${userName}
Attorney at Law

AGREED AND ACCEPTED:


_____________________________
${clientName}
Date: _______________
`;
}

function buildLegalMemo({ title, key_facts, legal_issues, userName, firmName, today, matterInfo }) {
  return `MEMORANDUM

PRIVILEGED AND CONFIDENTIAL
ATTORNEY WORK PRODUCT

TO:      File
FROM:    ${userName}
DATE:    ${today}
RE:      ${title}
${matterInfo ? `MATTER:  ${matterInfo.name} (${matterInfo.number || 'N/A'})` : ''}
${matterInfo?.client_name ? `CLIENT:  ${matterInfo.client_name}` : ''}

---

## I. ISSUE PRESENTED

${legal_issues || '[State the legal question(s) to be analyzed]'}

## II. BRIEF ANSWER

[Provide concise answer to each issue]

## III. STATEMENT OF FACTS

${key_facts || '[Set forth relevant facts]'}

## IV. ANALYSIS

[Detailed legal analysis applying law to facts]

### A. [First Legal Issue]

[Analysis of first issue]

### B. [Second Legal Issue]

[Analysis of second issue]

## V. CONCLUSION

[Summarize conclusions and recommendations]

---

Prepared by: ${userName}
${firmName}
`;
}

function buildStatusLetter({ title, recipient, key_facts, requested_action, userName, firmName, today, matterInfo }) {
  const clientName = matterInfo?.client_name || recipient || '[Client Name]';
  
  return `${firmName}
Attorneys at Law

${today}

${recipient || clientName}

Re: Status Update - ${matterInfo?.name || title}

Dear ${clientName}:

I am writing to provide you with an update on the status of your matter.

## CURRENT STATUS

${key_facts || '[Describe current status of the matter]'}

## RECENT DEVELOPMENTS

[Describe any recent activity, filings, or communications]

## UPCOMING DEADLINES AND NEXT STEPS

${requested_action || '[Describe upcoming deadlines and planned next steps]'}

## ACTION REQUIRED FROM YOU

[If any action is needed from the client, describe it here]

Please do not hesitate to contact me if you have any questions or concerns. I will continue to keep you informed as developments occur.

Very truly yours,

${firmName}


_____________________________
${userName}
Attorney at Law
`;
}

function buildClosingLetter({ title, recipient, key_facts, userName, firmName, today, matterInfo }) {
  const clientName = matterInfo?.client_name || recipient || '[Client Name]';
  
  return `${firmName}
Attorneys at Law

${today}

${recipient || clientName}

Re: Closing of Matter - ${matterInfo?.name || title}

Dear ${clientName}:

This letter confirms that your matter has been concluded and our representation is now complete.

## SUMMARY OF MATTER

${key_facts || '[Brief summary of the matter and its resolution]'}

## FINAL BILLING

[Final billing has been processed / will be sent separately]

## YOUR FILE

We will retain your file for [X] years in accordance with our document retention policy. If you would like any original documents returned, please let us know within 30 days.

## FUTURE LEGAL NEEDS

While this matter is now closed, we are here to assist with any future legal needs you may have. Please do not hesitate to contact us.

Thank you for the opportunity to represent you. It has been a pleasure working with you.

Very truly yours,

${firmName}


_____________________________
${userName}
Attorney at Law
`;
}

function buildGenericLegalDocument({ document_type, title, recipient, key_facts, legal_issues, requested_action, deadline, tone, userName, firmName, today, matterInfo }) {
  const clientName = matterInfo?.client_name || '[Client Name]';
  
  return `${firmName}
Attorneys at Law

${today}

${recipient ? `TO: ${recipient}\n` : ''}
Re: ${title}
${matterInfo ? `Matter: ${matterInfo.name}` : ''}
${clientName !== '[Client Name]' ? `Client: ${clientName}` : ''}

---

${key_facts ? `## BACKGROUND\n\n${key_facts}\n\n` : ''}

${legal_issues ? `## LEGAL ISSUES\n\n${legal_issues}\n\n` : ''}

${requested_action ? `## REQUEST / ACTION ITEMS\n\n${requested_action}\n\n` : ''}

${deadline ? `## DEADLINE\n\nPlease respond by: ${deadline}\n\n` : ''}

---

${firmName}


_____________________________
${userName}
Attorney at Law
`;
}

/**
 * Calculate a legal deadline
 */
async function calculateDeadline(params, userId, firmId) {
  const { start_date, days, day_type = 'calendar', add_mailing = false, jurisdiction } = params;
  
  if (!start_date || !days) {
    return { error: 'start_date and days are required' };
  }
  
  let deadline = new Date(start_date);
  let daysToAdd = parseInt(days);
  
  // Add mailing days if requested (typically 5 calendar days)
  if (add_mailing) {
    daysToAdd += 5;
  }
  
  if (day_type === 'calendar') {
    deadline.setDate(deadline.getDate() + daysToAdd);
  } else if (day_type === 'business_days' || day_type === 'court_days') {
    // Skip weekends
    let addedDays = 0;
    while (addedDays < daysToAdd) {
      deadline.setDate(deadline.getDate() + 1);
      const dayOfWeek = deadline.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
        addedDays++;
      }
    }
  }
  
  // If deadline falls on weekend, move to next Monday
  const finalDay = deadline.getDay();
  if (finalDay === 0) { // Sunday
    deadline.setDate(deadline.getDate() + 1);
  } else if (finalDay === 6) { // Saturday
    deadline.setDate(deadline.getDate() + 2);
  }
  
  const formattedDeadline = deadline.toISOString().split('T')[0];
  const formattedDisplay = deadline.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  return {
    success: true,
    calculation: {
      start_date,
      days_requested: days,
      day_type,
      mailing_days_added: add_mailing ? 5 : 0,
      total_days: add_mailing ? parseInt(days) + 5 : parseInt(days)
    },
    deadline: formattedDeadline,
    deadline_display: formattedDisplay,
    disclaimer: 'This is an automated calculation. Always verify deadlines against applicable court rules and local practice. Consider holidays and court closures.'
  };
}

/**
 * Log billable work with professional formatting
 */
async function logBillableWork(params, userId, firmId) {
  const { matter_id, hours, work_type, description, outcome, date } = params;
  
  if (!matter_id || !hours || !work_type || !description) {
    return { error: 'matter_id, hours, work_type, and description are required' };
  }
  
  // Validate hours
  const hoursNum = parseFloat(hours);
  if (isNaN(hoursNum) || hoursNum < 0.1 || hoursNum > 24) {
    return { error: 'Hours must be between 0.1 and 24' };
  }
  
  // Build professional billing description
  const workTypePrefixes = {
    research: 'Legal research regarding',
    drafting: 'Drafted',
    review: 'Reviewed and analyzed',
    conference: 'Conference with',
    court_appearance: 'Court appearance:',
    deposition: 'Deposition:',
    travel: 'Travel to/from',
    correspondence: 'Correspondence regarding'
  };
  
  const prefix = workTypePrefixes[work_type] || '';
  let fullDescription = prefix ? `${prefix} ${description}` : description;
  
  if (outcome) {
    fullDescription += `; ${outcome}`;
  }
  
  // Capitalize first letter
  fullDescription = fullDescription.charAt(0).toUpperCase() + fullDescription.slice(1);
  
  // Add period if not present
  if (!fullDescription.endsWith('.') && !fullDescription.endsWith('?') && !fullDescription.endsWith('!')) {
    fullDescription += '.';
  }
  
  // Use the existing log_time functionality
  return await logTime({
    matter_id,
    hours: hoursNum,
    description: fullDescription,
    date: date || getTodayInTimezone(),
    billable: true
  }, userId, firmId);
}

// ============== NY CPLR LEGAL REFERENCE TOOL IMPLEMENTATIONS ==============

/**
 * Look up NY CPLR provisions
 * This tool gives the agent access to actual NY procedural law
 */
async function lookupCPLR(params) {
  const { query_type, section, claim_type, matter_type, matter_description } = params;
  
  if (!query_type) {
    return { error: 'query_type is required' };
  }
  
  try {
    switch (query_type) {
      case 'statute_of_limitations':
        return lookupStatuteOfLimitations(claim_type);
      
      case 'service_of_process':
        return lookupServiceOfProcess(section);
      
      case 'discovery':
        return lookupDiscovery(section);
      
      case 'motions':
        return lookupMotions(section);
      
      case 'time_computation':
        return lookupTimeComputation();
      
      case 'deadlines':
        return lookupDeadlinesQuickReference();
      
      case 'section':
        return lookupSpecificSection(section);
      
      case 'matter_guidance':
        return getMatterSpecificGuidance(matter_type, matter_description);
      
      default:
        return { 
          error: `Unknown query_type: ${query_type}`,
          valid_types: ['statute_of_limitations', 'service_of_process', 'discovery', 'motions', 'time_computation', 'deadlines', 'section', 'matter_guidance']
        };
    }
  } catch (error) {
    console.error('[CPLR Lookup] Error:', error);
    return { error: 'Failed to look up CPLR: ' + error.message };
  }
}

function lookupStatuteOfLimitations(claimType) {
  const sol = CPLR_ARTICLE_2_LIMITATIONS;
  
  // Quick reference table
  const quickRef = {
    '20_years': ['Recover real property', 'Foreclose mortgage'],
    '6_years': ['Contract (written/oral)', 'Judgment', 'Fraud (from discovery)', 'Property damage'],
    '3_years': ['Personal injury', 'Property damage', 'Statutory liability'],
    '2.5_years': ['Medical/dental malpractice'],
    '1_year': ['Assault', 'Battery', 'Defamation', 'False imprisonment', 'Malicious prosecution'],
    '4_months': ['Article 78 (challenging government action)']
  };
  
  let result = {
    source: 'NY CPLR Article 2 - Limitations of Time',
    reference_url: 'https://codes.findlaw.com/ny/civil-practice-law-and-rules/',
    quick_reference: quickRef
  };
  
  // If specific claim type requested, provide detailed info
  if (claimType) {
    const claimLower = claimType.toLowerCase();
    
    if (claimLower.includes('personal injury') || claimLower === 'pi' || claimLower.includes('negligence')) {
      result.specific_claim = {
        claim_type: 'Personal Injury',
        limitation_period: '3 years',
        citation: 'CPLR § 214(5)',
        accrual: 'From date of injury',
        section_text: sol.sections['214'].claims,
        notes: [
          'Clock starts on date of injury, not discovery',
          'Different from medical malpractice (2.5 years)',
          'Notice of Claim required for municipalities (90 days)'
        ]
      };
    } else if (claimLower.includes('medical') || claimLower.includes('malpractice') || claimLower.includes('doctor')) {
      result.specific_claim = {
        claim_type: 'Medical/Dental/Podiatric Malpractice',
        limitation_period: '2 years 6 months',
        citation: 'CPLR § 214-a',
        accrual: 'From act/omission OR end of continuous treatment',
        section_text: sol.sections['214-a'],
        notes: [
          'SHORTER than regular personal injury (2.5 years vs 3 years)',
          'Continuous treatment doctrine may extend accrual date',
          'Foreign object: 1 year from discovery',
          'Certificate of merit required (CPLR 3012-a)'
        ],
        warning: '⚠️ SHORTER PERIOD THAN REGULAR PI - VERIFY DATES CAREFULLY'
      };
    } else if (claimLower.includes('contract') || claimLower.includes('breach')) {
      result.specific_claim = {
        claim_type: 'Contract',
        limitation_period: '6 years',
        citation: 'CPLR § 213(2)',
        accrual: 'From date of breach',
        section_text: sol.sections['213'].claims,
        notes: [
          'Same period for written and oral contracts',
          'Accrual is from breach, not discovery',
          'Part payment or written acknowledgment restarts clock (CPLR § 218)'
        ]
      };
    } else if (claimLower.includes('defamation') || claimLower.includes('libel') || claimLower.includes('slander')) {
      result.specific_claim = {
        claim_type: 'Defamation (Libel/Slander)',
        limitation_period: '1 year',
        citation: 'CPLR § 215(3)',
        accrual: 'From date of publication',
        section_text: sol.sections['215'].claims,
        notes: [
          'VERY SHORT - Only 1 year',
          'Single publication rule applies',
          'Republication may restart clock'
        ],
        warning: '⚠️ VERY SHORT LIMITATION PERIOD - 1 YEAR ONLY'
      };
    } else if (claimLower.includes('assault') || claimLower.includes('battery') || claimLower.includes('false imprisonment')) {
      result.specific_claim = {
        claim_type: 'Intentional Torts',
        limitation_period: '1 year',
        citation: 'CPLR § 215',
        accrual: 'From date of tort',
        section_text: sol.sections['215'].claims,
        notes: [
          'Applies to: assault, battery, false imprisonment, malicious prosecution',
          'Criminal conviction may toll under certain circumstances'
        ],
        warning: '⚠️ VERY SHORT LIMITATION PERIOD - 1 YEAR ONLY'
      };
    } else if (claimLower.includes('article 78') || claimLower.includes('government') || claimLower.includes('administrative')) {
      result.specific_claim = {
        claim_type: 'Article 78 Proceeding',
        limitation_period: '4 months',
        citation: 'CPLR § 217',
        accrual: 'From final determination becomes binding',
        section_text: sol.sections['217'],
        notes: [
          'EXTREMELY SHORT - Only 4 months',
          'Used to challenge government/agency actions',
          'Determination must be final and binding'
        ],
        warning: '⚠️ EXTREMELY SHORT - ONLY 4 MONTHS TO CHALLENGE GOVERNMENT ACTION'
      };
    } else if (claimLower.includes('fraud')) {
      result.specific_claim = {
        claim_type: 'Fraud',
        limitation_period: '6 years from commission OR 2 years from discovery (whichever is longer)',
        citation: 'CPLR § 213(8)',
        accrual: 'Later of: 6 years from fraud OR 2 years from discovery/should have discovered',
        section_text: sol.sections['213'].claims,
        notes: [
          'Two-pronged test - use whichever gives more time',
          'Discovery rule applies to fraud claims',
          'Must plead fraud with particularity'
        ]
      };
    } else if (claimLower.includes('property') || claimLower.includes('real estate') || claimLower.includes('foreclosure')) {
      result.specific_claim = {
        claim_type: 'Real Property / Foreclosure',
        limitation_period: '6 years (foreclosure) / 20 years (recovery of real property)',
        citations: {
          foreclosure: 'CPLR § 213(4)',
          recovery: 'CPLR § 212'
        },
        notes: [
          'Foreclosure: 6 years from default/acceleration',
          'Recovery of property: 20 years',
          'Acceleration letter date is critical for foreclosure SOL'
        ]
      };
    }
  }
  
  // Add savings provisions
  result.savings_provisions = {
    'CPLR § 205': {
      rule: '6-MONTH SAVINGS PROVISION',
      text: 'If action dismissed (not on merits), new action within 6 months is timely',
      exceptions: ['Voluntary discontinuance by stipulation', 'Neglect to prosecute', 'Final judgment on merits']
    },
    'CPLR § 203(c)': {
      rule: 'Relation back doctrine',
      text: 'Amended pleading relates back if same transaction/occurrence'
    },
    'CPLR § 207': {
      rule: 'Tolling for absence',
      text: 'Time defendant is absent from state is NOT counted'
    },
    'CPLR § 208': {
      rule: 'Disability tolling',
      text: 'Tolled during infancy or insanity'
    }
  };
  
  return result;
}

function lookupServiceOfProcess(section) {
  const service = CPLR_ARTICLE_3_JURISDICTION;
  
  let result = {
    source: 'NY CPLR Article 3 - Jurisdiction and Service',
    reference_url: 'https://codes.findlaw.com/ny/civil-practice-law-and-rules/',
    critical_rule: {
      section: 'CPLR § 306-b',
      rule: 'Summons must be served within 120 DAYS of filing',
      consequence: 'Failure to serve within 120 days requires court permission to extend'
    },
    service_methods_natural_person: {
      source: 'CPLR § 308',
      methods: {
        '1_personal_delivery': {
          description: 'Delivering summons directly to defendant personally',
          completion: 'Immediately upon delivery',
          priority: 'BEST METHOD - Try first'
        },
        '2_substituted_service': {
          description: 'Leave with person of suitable age/discretion at dwelling + mail to last known residence',
          completion: '10 days after filing proof of service',
          requirements: 'Must be at actual dwelling place or place of business'
        },
        '3_agent': {
          description: 'Delivering to designated agent for service',
          completion: 'Upon delivery to agent'
        },
        '4_nail_and_mail': {
          description: 'Affix to door of dwelling/business + mail',
          completion: '10 days after filing proof',
          requirements: 'Due diligence showing personal/substituted service impracticable - MUST DOCUMENT ATTEMPTS'
        },
        '5_court_ordered': {
          description: 'Any method court directs',
          requirements: 'Must show impracticability of other methods',
          options: 'Can include service by publication, email, social media'
        }
      },
      hierarchy_note: 'MUST ATTEMPT METHODS IN ORDER (except agent service)'
    },
    service_on_entities: {
      corporation: {
        source: 'CPLR § 311',
        methods: ['Officer', 'Director', 'Managing/general agent', 'Cashier', 'Secretary of State', 'Authorized agent']
      },
      llc: {
        source: 'CPLR § 311-a',
        methods: ['Member', 'Manager', 'Secretary of State', 'Agent per operating agreement']
      },
      partnership: {
        source: 'CPLR § 312',
        methods: ['General partner', 'Managing agent', 'Authorized agent']
      }
    },
    time_to_answer: {
      personal_service_in_NY: '20 days',
      mail_service_in_NY: '25 days (20 + 5 for mail)',
      service_outside_NY: '30 days'
    }
  };
  
  // If specific section requested
  if (section && service.sections[section]) {
    result.specific_section = {
      number: section,
      ...service.sections[section]
    };
  }
  
  return result;
}

function lookupDiscovery(section) {
  const discovery = CPLR_ARTICLE_31_DISCLOSURE;
  
  let result = {
    source: 'NY CPLR Article 31 - Disclosure',
    reference_url: 'https://codes.findlaw.com/ny/civil-practice-law-and-rules/',
    scope: {
      section: 'CPLR § 3101',
      standard: 'Full disclosure of all matter MATERIAL AND NECESSARY',
      interpretation: 'Broadly interpreted - relevant and reasonably calculated to lead to discoverable evidence'
    },
    deadlines: {
      automatic_disclosure: '20 days after joinder of issue (CPLR § 3101-a)',
      document_demand_response: '20 days (25 by mail)',
      interrogatory_answers: '20 days (25 by mail)',
      objections: '20 days (25 by mail)',
      deposition_notice: '20 days before deposition',
      deposition_signature: '60 days to review and sign',
      expert_disclosure: '20 days after demand'
    },
    key_rules: {
      interrogatories: {
        source: 'CPLR § 3130',
        limit: '25 interrogatories (including subparts)',
        note: 'Court can modify limit'
      },
      depositions: {
        notice: '20 days required (CPLR § 3106-3107)',
        location: 'Plaintiff: county of residence/employment; Corporate officer: principal office',
        objections: 'Form objections must be made at deposition or WAIVED; all others preserved for trial'
      },
      physical_exam: {
        source: 'CPLR § 3121',
        requirement: 'COURT ORDER REQUIRED - not automatic',
        showing: 'Condition in controversy + good cause'
      }
    },
    penalties_for_noncompliance: {
      source: 'CPLR § 3126',
      sanctions: [
        'Issues resolved against non-compliant party',
        'Preclusion of evidence',
        'Striking of pleadings',
        'Stay until compliance',
        'DISMISSAL',
        'DEFAULT JUDGMENT'
      ],
      warning: '⚠️ SEVERE PENALTIES for discovery abuse'
    },
    privileges: {
      attorney_client: 'Absolutely privileged',
      work_product: 'Qualified immunity - can be overcome with substantial need + undue hardship',
      expert_materials: 'Trial preparation materials have qualified immunity'
    }
  };
  
  // If specific section requested
  if (section && discovery.sections[section]) {
    result.specific_section = {
      number: section,
      ...discovery.sections[section]
    };
  }
  
  return result;
}

function lookupMotions(section) {
  const motions = CPLR_ARTICLE_32_JUDGMENT;
  
  let result = {
    source: 'NY CPLR Article 32 - Accelerated Judgment',
    reference_url: 'https://codes.findlaw.com/ny/civil-practice-law-and-rules/',
    motion_to_dismiss: {
      section: 'CPLR § 3211',
      timing: 'Must move within 60 days of answer deadline',
      grounds: {
        'a(1)': 'Defense founded on documentary evidence',
        'a(2)': 'Lack of subject matter jurisdiction (NEVER WAIVED)',
        'a(3)': 'Lack of capacity to sue',
        'a(4)': 'Another action pending (same parties, same cause)',
        'a(5)': 'Arbitration agreement, bankruptcy discharge, infancy, etc.',
        'a(7)': 'FAILURE TO STATE A CAUSE OF ACTION (NEVER WAIVED)',
        'a(8)': 'Lack of personal jurisdiction (WAIVED if not raised in first response)',
        'a(9)': 'Release, payment, res judicata, statute of limitations',
        'a(10)': 'Statute of frauds',
        'a(11)': 'Defendant not properly licensed'
      },
      waiver_rules: {
        always_preserved: ['Subject matter jurisdiction (a(2))', 'Failure to state cause (a(7))'],
        waived_if_not_raised: ['Personal jurisdiction (a(8))']
      }
    },
    summary_judgment: {
      section: 'CPLR § 3212',
      timing: 'Must move within 120 DAYS of note of issue',
      standard: 'No genuine issue of material fact AND movant entitled to judgment as a matter of law',
      burden: 'Movant makes prima facie showing → burden shifts to opponent to raise triable issue',
      key_rules: {
        'search_the_record': 'Court can grant summary judgment to NON-MOVING party (CPLR § 3212(f))',
        'partial_summary_judgment': 'Court can grant partial summary judgment to narrow issues'
      },
      warning: '⚠️ 120-DAY DEADLINE IS STRICTLY ENFORCED'
    },
    default_judgment: {
      section: 'CPLR § 3215',
      timing: 'Application within 1 YEAR of default, or default deemed vacated',
      requirements: ['Proof of service', 'Proof of facts (affidavit)', 'Default not vacated']
    },
    failure_to_prosecute: {
      section: 'CPLR § 3216',
      rule: 'If no proceeding for 1 year, party may serve 90-day demand',
      consequence: 'If no action within 90 days after demand, action may be DISMISSED'
    },
    settlement_offer: {
      section: 'CPLR § 3220',
      rule: 'Written offer to compromise - if not accepted and plaintiff fails to beat offer, plaintiff pays defendant\'s costs from time of offer'
    }
  };
  
  // If specific section requested
  if (section && motions.sections[section]) {
    result.specific_section = {
      number: section,
      ...motions.sections[section]
    };
  }
  
  return result;
}

function lookupTimeComputation() {
  return {
    source: 'CPLR § 2103, General Construction Law § 25',
    reference_url: 'https://codes.findlaw.com/ny/civil-practice-law-and-rules/',
    basic_rules: {
      general: 'Exclude the first day, include the last day',
      example: 'If served Monday, count starts Tuesday'
    },
    last_day_rule: {
      rule: 'If last day falls on Saturday, Sunday, or public holiday, period extends to next business day'
    },
    short_periods: {
      rule: 'For periods of 11 DAYS OR LESS, exclude Saturdays, Sundays, and public holidays',
      example: '10-day period = 10 business days when period is 11 days or less'
    },
    service_extensions: {
      mail_in_NY: {
        extension: 'Add 5 days',
        example: '20 days to respond becomes 25 days if served by mail'
      },
      overnight_delivery: {
        extension: 'Add 1 day'
      },
      electronic: {
        extension: 'None (if consent to e-service)'
      }
    },
    common_calculations: {
      answer_to_complaint: {
        personal_service: '20 days',
        mail_service: '25 days (20 + 5)',
        outside_NY: '30 days'
      },
      reply_to_counterclaim: '20 days',
      discovery_response: '20 days (25 by mail)',
      summary_judgment_deadline: '120 days after note of issue',
      appeal_appellate_division: '30 days from service with notice of entry',
      appeal_court_of_appeals: '30 days from service with notice of entry'
    },
    calculator_tip: 'Use calculate_cplr_deadline tool for accurate calculations'
  };
}

function lookupDeadlinesQuickReference() {
  return {
    source: 'NY CPLR - Deadlines Quick Reference',
    reference_url: 'https://codes.findlaw.com/ny/civil-practice-law-and-rules/',
    ...CPLR_DEADLINES_QUICK_REFERENCE,
    note: 'All deadlines subject to time computation rules. Add 5 days for mail service in NY.'
  };
}

function lookupSpecificSection(section) {
  if (!section) {
    return { error: 'Section number required for section lookup' };
  }
  
  // Normalize section number
  const sectionNum = section.toString().replace('§', '').replace('CPLR', '').trim();
  
  // Search across all articles
  const articles = [
    { name: 'Article 2 - Limitations', data: CPLR_ARTICLE_2_LIMITATIONS },
    { name: 'Article 3 - Jurisdiction', data: CPLR_ARTICLE_3_JURISDICTION },
    { name: 'Article 31 - Discovery', data: CPLR_ARTICLE_31_DISCLOSURE },
    { name: 'Article 32 - Motions', data: CPLR_ARTICLE_32_JUDGMENT }
  ];
  
  for (const article of articles) {
    if (article.data.sections && article.data.sections[sectionNum]) {
      return {
        source: article.name,
        reference_url: 'https://codes.findlaw.com/ny/civil-practice-law-and-rules/',
        citation: formatCPLRCitation(sectionNum),
        section: {
          number: sectionNum,
          ...article.data.sections[sectionNum]
        }
      };
    }
  }
  
  // Section not found in our database
  return {
    error: `Section ${sectionNum} not found in current database`,
    suggestion: 'Check https://codes.findlaw.com/ny/civil-practice-law-and-rules/ for the full text',
    available_sections: {
      'Article 2 (Limitations)': '201-218',
      'Article 3 (Jurisdiction)': '301-328',
      'Article 31 (Discovery)': '3101-3140',
      'Article 32 (Motions)': '3201-3222'
    }
  };
}

function getMatterSpecificGuidance(matterType, matterDescription) {
  if (!matterType) {
    return { error: 'matter_type is required for matter guidance' };
  }
  
  const guidance = getCPLRGuidanceForMatter(matterType, matterDescription || '');
  
  return {
    source: 'NY CPLR - Matter-Specific Guidance',
    reference_url: 'https://codes.findlaw.com/ny/civil-practice-law-and-rules/',
    matter_type: matterType,
    matter_description: matterDescription || 'Not provided',
    ...guidance,
    recommendation: 'Always verify specific rules for your matter. This guidance is based on common provisions but may not cover all situations.'
  };
}

/**
 * Calculate deadline according to CPLR time computation rules
 */
async function calculateCPLRDeadline(params) {
  const { start_date, days, period_type, service_method, description } = params;
  
  if (!start_date || !days) {
    return { error: 'start_date and days are required' };
  }
  
  try {
    let daysToAdd = parseInt(days);
    let calculationNotes = [];
    
    // Determine base days based on period type
    if (period_type === 'answer') {
      daysToAdd = 20;
      calculationNotes.push('Answer period: 20 days base (CPLR § 3012)');
    } else if (period_type === 'discovery_response') {
      daysToAdd = 20;
      calculationNotes.push('Discovery response: 20 days base (CPLR § 3122)');
    } else if (period_type === 'motion') {
      calculationNotes.push(`Motion period: ${daysToAdd} days specified`);
    } else if (period_type === 'appeal') {
      daysToAdd = 30;
      calculationNotes.push('Appeal period: 30 days base (CPLR § 5513)');
    }
    
    // Add service extensions
    if (service_method === 'mail') {
      daysToAdd += 5;
      calculationNotes.push('Mail service: +5 days (CPLR § 2103)');
    } else if (service_method === 'overnight') {
      daysToAdd += 1;
      calculationNotes.push('Overnight service: +1 day (CPLR § 2103)');
    } else if (service_method === 'personal') {
      calculationNotes.push('Personal service: no additional days');
    } else if (service_method === 'electronic') {
      calculationNotes.push('Electronic service: no additional days (with consent)');
    }
    
    // Calculate the deadline
    let deadline = new Date(start_date);
    const originalDays = daysToAdd;
    
    // For short periods (11 days or less), exclude weekends/holidays
    const isShortPeriod = originalDays <= 11;
    
    if (isShortPeriod) {
      calculationNotes.push(`Short period rule applies (${originalDays} ≤ 11 days): excluding weekends`);
      
      // Add business days only
      let addedDays = 0;
      while (addedDays < daysToAdd) {
        deadline.setDate(deadline.getDate() + 1);
        const dayOfWeek = deadline.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
          addedDays++;
        }
      }
    } else {
      // Add calendar days
      deadline.setDate(deadline.getDate() + daysToAdd);
      calculationNotes.push(`Calendar days added: ${daysToAdd}`);
    }
    
    // If deadline falls on weekend, extend to Monday
    const finalDay = deadline.getDay();
    if (finalDay === 0) { // Sunday
      deadline.setDate(deadline.getDate() + 1);
      calculationNotes.push('Deadline fell on Sunday: extended to Monday');
    } else if (finalDay === 6) { // Saturday
      deadline.setDate(deadline.getDate() + 2);
      calculationNotes.push('Deadline fell on Saturday: extended to Monday');
    }
    
    const formattedDeadline = deadline.toISOString().split('T')[0];
    const formattedDisplay = deadline.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Calculate days from now for urgency
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
    
    let urgency = 'normal';
    if (daysUntil <= 3) urgency = 'CRITICAL';
    else if (daysUntil <= 7) urgency = 'URGENT';
    else if (daysUntil <= 14) urgency = 'APPROACHING';
    
    return {
      success: true,
      calculation: {
        start_date,
        base_days: days,
        period_type: period_type || 'custom',
        service_method: service_method || 'not specified',
        total_days_added: daysToAdd,
        short_period_rule_applied: isShortPeriod
      },
      deadline: formattedDeadline,
      deadline_display: formattedDisplay,
      days_until: daysUntil,
      urgency,
      description: description || 'Deadline',
      calculation_notes: calculationNotes,
      cplr_rules_applied: [
        'CPLR § 2103 (service extensions)',
        'General Construction Law § 25 (time computation)',
        isShortPeriod ? 'Short period rule (≤11 days excludes weekends)' : 'Calendar day rule'
      ],
      disclaimer: '⚠️ This is an automated calculation. Always verify against applicable court rules, local practice, and check for court holidays. When in doubt, file early.',
      recommendation: daysUntil <= 7 
        ? `⚠️ ${urgency}: Only ${daysUntil} days remaining. Consider filing/responding immediately.`
        : `Deadline is ${daysUntil} days away.`
    };
  } catch (error) {
    console.error('[CPLR Deadline] Error:', error);
    return { error: 'Failed to calculate deadline: ' + error.message };
  }
}

/**
 * Review documents and notes created by the agent during the current task.
 * 
 * This tool allows the agent to re-read its own work product and self-correct.
 * It queries the database for documents and notes created in the recent window
 * (by the AI user) and returns their content for review.
 * 
 * This closes the "blind spot" where the agent creates a document but can't
 * verify what was actually saved.
 */
async function reviewCreatedDocuments(params, userId, firmId) {
  const { matter_id, minutes_ago = 60, include_content = true } = params;
  
  try {
    const results = { documents: [], notes: [], summary: '' };
    
    // Find recently created documents
    const docQuery = matter_id
      ? `SELECT id, original_name as name, created_at, content_text, file_size 
         FROM documents 
         WHERE firm_id = $1 AND uploaded_by = $2 AND matter_id = $3
           AND created_at > NOW() - INTERVAL '${parseInt(minutes_ago)} minutes'
         ORDER BY created_at DESC LIMIT 10`
      : `SELECT id, original_name as name, created_at, content_text, file_size 
         FROM documents 
         WHERE firm_id = $1 AND uploaded_by = $2
           AND created_at > NOW() - INTERVAL '${parseInt(minutes_ago)} minutes'
         ORDER BY created_at DESC LIMIT 10`;
    
    const docParams = matter_id ? [firmId, userId, matter_id] : [firmId, userId];
    const docResult = await query(docQuery, docParams);
    
    for (const doc of docResult.rows) {
      const docEntry = {
        id: doc.id,
        name: doc.name,
        created_at: doc.created_at,
        size: doc.file_size,
      };
      
      if (include_content && doc.content_text) {
        // Return content for review (cap at 3000 chars per doc)
        docEntry.content = doc.content_text.substring(0, 3000);
        if (doc.content_text.length > 3000) {
          docEntry.content += `\n\n[... truncated, full document is ${doc.content_text.length} chars]`;
        }
        docEntry.content_length = doc.content_text.length;
        
        // Flag potential issues in the content
        docEntry.issues = [];
        if (/\[INSERT|TODO|PLACEHOLDER|TBD\]/i.test(doc.content_text)) {
          docEntry.issues.push('Contains placeholder text ([INSERT], [TODO], etc.)');
        }
        if (doc.content_text.length < 200) {
          docEntry.issues.push('Document is very short (< 200 chars)');
        }
        
        // Check for unverified citations
        const citationMatches = doc.content_text.match(
          /\d+\s+(?:F\.(?:2d|3d|4th|Supp\.(?:2d|3d)?)|U\.S\.|S\.Ct\.|L\.Ed\.(?:2d)?|N\.Y\.(?:2d|3d)?|A\.D\.(?:2d|3d)?)\s+\d+/g
        );
        if (citationMatches && citationMatches.length > 0) {
          const unverified = citationMatches.filter(c => {
            // Check if marked as unverified in surrounding context
            const idx = doc.content_text.indexOf(c);
            const context = doc.content_text.substring(Math.max(0, idx - 30), Math.min(doc.content_text.length, idx + c.length + 30));
            return !/\[UNVERIFIED|NEEDS? (?:CITE )?CHECK\]/i.test(context);
          });
          if (unverified.length > 0) {
            docEntry.issues.push(`${unverified.length} legal citation(s) may need verification: ${unverified.slice(0, 3).join('; ')}`);
          }
        }
      }
      
      results.documents.push(docEntry);
    }
    
    // Find recently created notes
    const noteQuery = matter_id
      ? `SELECT id, content, note_type, created_at 
         FROM matter_notes 
         WHERE matter_id = $1 AND created_by = $2
           AND created_at > NOW() - INTERVAL '${parseInt(minutes_ago)} minutes'
         ORDER BY created_at DESC LIMIT 10`
      : `SELECT mn.id, mn.content, mn.note_type, mn.created_at, m.name as matter_name
         FROM matter_notes mn
         JOIN matters m ON mn.matter_id = m.id
         WHERE m.firm_id = $1 AND mn.created_by = $2
           AND mn.created_at > NOW() - INTERVAL '${parseInt(minutes_ago)} minutes'
         ORDER BY mn.created_at DESC LIMIT 10`;
    
    const noteParams = matter_id ? [matter_id, userId] : [firmId, userId];
    const noteResult = await query(noteQuery, noteParams);
    
    for (const note of noteResult.rows) {
      const noteEntry = {
        id: note.id,
        type: note.note_type || 'general',
        created_at: note.created_at,
        matter_name: note.matter_name || null,
      };
      
      if (include_content && note.content) {
        noteEntry.content = note.content.substring(0, 2000);
        noteEntry.content_length = note.content.length;
        
        noteEntry.issues = [];
        if (note.content.length < 100) {
          noteEntry.issues.push('Note is very short (< 100 chars)');
        }
      }
      
      results.notes.push(noteEntry);
    }
    
    results.summary = `Created in last ${minutes_ago} minutes: ${results.documents.length} document(s), ${results.notes.length} note(s)`;
    
    // Count total issues
    const totalIssues = [...results.documents, ...results.notes]
      .reduce((sum, item) => sum + (item.issues?.length || 0), 0);
    
    if (totalIssues > 0) {
      results.summary += `. ⚠️ ${totalIssues} issue(s) found - review and fix before completing.`;
    } else if (results.documents.length > 0 || results.notes.length > 0) {
      results.summary += '. ✅ No issues detected.';
    }
    
    return { success: true, ...results };
    
  } catch (error) {
    console.error('[ToolBridge] reviewCreatedDocuments error:', error.message);
    return { error: 'Failed to review created documents: ' + error.message };
  }
}

/**
 * Semantic search across firm documents using vector embeddings.
 * Finds documents by meaning, not just keywords.
 * Falls back to keyword search if embeddings aren't available.
 */
async function searchSemantic(params, userId, firmId) {
  const { query: searchQuery, matter_id, document_type, limit = 8 } = params;
  
  if (!searchQuery || searchQuery.trim().length < 3) {
    return { error: 'Search query must be at least 3 characters' };
  }
  
  try {
    // Try semantic search first (requires embeddings to be indexed)
    const { semanticSearch } = await import('../../services/embeddingService.js');
    
    const results = await semanticSearch(searchQuery, firmId, {
      limit: Math.min(limit, 15),
      threshold: 0.5, // Lower threshold for broader results
      matterId: matter_id || null,
      documentType: document_type || null,
      includeGraphExpansion: true,
      lawyerId: userId,
    });
    
    if (results && results.length > 0) {
      return {
        success: true,
        results: results.map(r => ({
          documentId: r.documentId,
          documentName: r.documentName,
          matterId: r.matterId,
          matterName: r.matterName,
          similarity: Math.round(r.similarity * 100) + '%',
          excerpt: r.chunkText,
          source: r.source || 'semantic',
        })),
        count: results.length,
        searchType: 'semantic',
        message: `Found ${results.length} semantically similar document(s). Use read_document_content to read the full content of any result.`,
      };
    }
    
    // Fall back to keyword search if no semantic results
    console.log('[ToolBridge] No semantic results, falling back to keyword search');
    
  } catch (semanticError) {
    // Semantic search may fail if embeddings aren't set up - fall back gracefully
    console.log('[ToolBridge] Semantic search not available, falling back to keyword search:', semanticError.message);
  }
  
  // Fallback: keyword search (always works, doesn't need embeddings)
  try {
    const keywordResults = await query(`
      SELECT d.id, d.original_name as name, d.type, d.matter_id, m.name as matter_name,
             LEFT(d.content_text, 300) as content_preview
      FROM documents d
      LEFT JOIN matters m ON d.matter_id = m.id
      WHERE d.firm_id = $1
        AND d.content_text IS NOT NULL
        AND d.content_text ILIKE $2
        ${matter_id ? 'AND d.matter_id = $3' : ''}
      ORDER BY d.uploaded_at DESC
      LIMIT $${matter_id ? '4' : '3'}
    `, matter_id 
      ? [firmId, `%${searchQuery}%`, matter_id, limit]
      : [firmId, `%${searchQuery}%`, limit]
    );
    
    return {
      success: true,
      results: keywordResults.rows.map(r => ({
        documentId: r.id,
        documentName: r.name,
        matterId: r.matter_id,
        matterName: r.matter_name,
        excerpt: r.content_preview,
        source: 'keyword',
      })),
      count: keywordResults.rows.length,
      searchType: 'keyword_fallback',
      message: `Found ${keywordResults.rows.length} document(s) via keyword search. Semantic search requires document embeddings to be indexed.`,
    };
  } catch (fallbackError) {
    return { 
      error: 'Search failed: ' + fallbackError.message,
      hint: 'Try search_document_content as an alternative.'
    };
  }
}

export default {
  AMPLIFIER_TOOLS,
  executeTool
};
