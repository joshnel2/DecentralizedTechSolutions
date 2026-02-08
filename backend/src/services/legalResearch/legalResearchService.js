/**
 * Legal Research Service
 * 
 * COMPLETELY ISOLATED from the Background Agent (amplifierService.js)
 * and the normal AI chat (ai.js / aiAgent.js).
 * 
 * This service:
 * - Uses OpenRouter (NOT Azure OpenAI)
 * - Has NO access to matter data, client data, billing, or documents
 * - Loads the Anthropic Legal Plugin playbook from disk
 * - Calls Claude via OpenRouter with the playbook as the system prompt
 * - Stores research sessions in its own isolated database tables
 * 
 * Environment variables (separate from Azure OpenAI):
 * - OPENROUTER_API_KEY
 * - OPENROUTER_BASE_URL (default: https://openrouter.ai/api/v1)
 * - OPENROUTER_MODEL (default: anthropic/claude-sonnet-4)
 * - SITE_URL (for HTTP-Referer header)
 * - APP_NAME (for X-Title header)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../../db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================
// CONFIGURATION — Completely separate from Azure OpenAI
// =====================================================
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4';
const SITE_URL = process.env.SITE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
const APP_NAME = process.env.APP_NAME || 'Apex Legal Research';

// =====================================================
// PLAYBOOK — Loaded from disk, injected as system prompt
// =====================================================
let _playbookContent = null;

function loadPlaybook() {
  if (_playbookContent) return _playbookContent;
  
  const playbookPath = path.join(__dirname, 'playbook.md');
  try {
    _playbookContent = fs.readFileSync(playbookPath, 'utf-8');
    console.log(`[LegalResearch] Loaded playbook from ${playbookPath} (${_playbookContent.length} chars)`);
    return _playbookContent;
  } catch (error) {
    console.error(`[LegalResearch] Failed to load playbook from ${playbookPath}:`, error.message);
    throw new Error('Legal Research playbook not found. Service cannot start.');
  }
}

// =====================================================
// TOOL DEFINITIONS — OpenAI-compatible format for OpenRouter
// These are the legal plugin tools converted to function calling format
// =====================================================
const LEGAL_RESEARCH_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'review_contract',
      description: 'Review a contract against the negotiation playbook. Analyzes clauses, flags deviations as GREEN/YELLOW/RED, and generates redline suggestions.',
      parameters: {
        type: 'object',
        properties: {
          contract_text: {
            type: 'string',
            description: 'The full text of the contract to review'
          },
          your_side: {
            type: 'string',
            enum: ['vendor', 'customer', 'licensor', 'licensee', 'partner', 'other'],
            description: 'Which side of the contract you are on'
          },
          focus_areas: {
            type: 'string',
            description: 'Specific areas to focus on (e.g., "data protection", "IP ownership")'
          },
          deadline: {
            type: 'string',
            description: 'When the contract needs to be finalized'
          }
        },
        required: ['contract_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'triage_nda',
      description: 'Rapidly screen an NDA and classify as GREEN (standard approval), YELLOW (counsel review), or RED (significant issues).',
      parameters: {
        type: 'object',
        properties: {
          nda_text: {
            type: 'string',
            description: 'The full text of the NDA to triage'
          },
          context: {
            type: 'string',
            description: 'Business context for the NDA (e.g., "new vendor relationship", "potential M&A")'
          }
        },
        required: ['nda_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assess_legal_risk',
      description: 'Assess and classify a legal risk using the severity-by-likelihood framework. Returns GREEN/YELLOW/ORANGE/RED classification with recommended actions.',
      parameters: {
        type: 'object',
        properties: {
          risk_description: {
            type: 'string',
            description: 'Description of the legal risk to assess'
          },
          context: {
            type: 'string',
            description: 'Background and business context'
          },
          jurisdiction: {
            type: 'string',
            description: 'Applicable jurisdiction'
          }
        },
        required: ['risk_description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_legal_response',
      description: 'Generate a templated response for a common legal inquiry (DSR, discovery hold, vendor question, NDA request, subpoena, etc.).',
      parameters: {
        type: 'object',
        properties: {
          inquiry_type: {
            type: 'string',
            enum: ['dsr', 'discovery-hold', 'vendor-question', 'nda-request', 'privacy-inquiry', 'subpoena', 'insurance', 'custom'],
            description: 'The type of legal inquiry to respond to'
          },
          details: {
            type: 'string',
            description: 'Specific details about the inquiry (requester, dates, facts, etc.)'
          }
        },
        required: ['inquiry_type', 'details']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'review_dpa',
      description: 'Review a Data Processing Agreement against GDPR Article 28 requirements and standard compliance checklist.',
      parameters: {
        type: 'object',
        properties: {
          dpa_text: {
            type: 'string',
            description: 'The full text of the DPA to review'
          },
          regulations: {
            type: 'string',
            description: 'Applicable regulations (e.g., "GDPR", "CCPA", "both")'
          }
        },
        required: ['dpa_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'prepare_meeting_brief',
      description: 'Prepare a structured briefing for a meeting with legal relevance.',
      parameters: {
        type: 'object',
        properties: {
          meeting_type: {
            type: 'string',
            enum: ['deal-review', 'board', 'vendor-call', 'regulatory', 'litigation', 'team-sync', 'cross-functional'],
            description: 'Type of meeting'
          },
          topic: {
            type: 'string',
            description: 'Meeting topic and key context'
          },
          participants: {
            type: 'string',
            description: 'Who will be attending and their roles'
          }
        },
        required: ['meeting_type', 'topic']
      }
    }
  }
];

// =====================================================
// CORE: run_legal_plugin — sends request to OpenRouter
// =====================================================

/**
 * Main entry point: sends a legal research request to OpenRouter
 * using the Anthropic Legal Plugin playbook as the system prompt.
 * 
 * @param {string} userInput - The user's message/query
 * @param {Array} conversationHistory - Previous messages in the session
 * @param {object} options - Additional options
 * @returns {object} - { content, model, usage, toolCalls }
 */
export async function runLegalPlugin(userInput, conversationHistory = [], options = {}) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured. Legal Research requires an OpenRouter API key.');
  }

  const playbook = loadPlaybook();

  // Build the messages array
  const messages = [
    {
      role: 'system',
      content: playbook
    },
    // Include conversation history (last N messages to stay within context)
    ...conversationHistory.slice(-40),
    {
      role: 'user',
      content: userInput
    }
  ];

  const requestBody = {
    model: options.model || OPENROUTER_MODEL,
    messages,
    tools: LEGAL_RESEARCH_TOOLS,
    temperature: options.temperature ?? 0.3,  // Lower temp for legal precision
    max_tokens: options.max_tokens ?? 8000,
    top_p: 0.95,
  };

  const url = `${OPENROUTER_BASE_URL}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': SITE_URL,
      'X-Title': APP_NAME,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[LegalResearch] OpenRouter API error ${response.status}:`, errorBody);
    throw new Error(`OpenRouter API error: ${response.status} — ${errorBody}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error('No response from OpenRouter');
  }

  return {
    content: choice.message?.content || '',
    toolCalls: choice.message?.tool_calls || null,
    model: data.model,
    usage: data.usage,
    finishReason: choice.finish_reason,
  };
}

/**
 * Stream version of runLegalPlugin for real-time responses
 */
export async function runLegalPluginStream(userInput, conversationHistory = [], options = {}) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const playbook = loadPlaybook();

  const messages = [
    { role: 'system', content: playbook },
    ...conversationHistory.slice(-40),
    { role: 'user', content: userInput }
  ];

  const requestBody = {
    model: options.model || OPENROUTER_MODEL,
    messages,
    tools: LEGAL_RESEARCH_TOOLS,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 8000,
    top_p: 0.95,
    stream: true,
  };

  const url = `${OPENROUTER_BASE_URL}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': SITE_URL,
      'X-Title': APP_NAME,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} — ${errorBody}`);
  }

  return response.body;
}

// =====================================================
// SESSION MANAGEMENT — Isolated database tables
// =====================================================

/**
 * Create a new legal research session
 */
export async function createSession(userId, initialQuery, jurisdiction, practiceArea) {
  const result = await query(
    `INSERT INTO legal_research_sessions (user_id, title, jurisdiction, practice_area, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING *`,
    [userId, initialQuery.substring(0, 200), jurisdiction || null, practiceArea || null]
  );
  return result.rows[0];
}

/**
 * Get a research session by ID (only for the owning user)
 */
export async function getSession(sessionId, userId) {
  const result = await query(
    `SELECT * FROM legal_research_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  return result.rows[0] || null;
}

/**
 * List research sessions for a user
 */
export async function listSessions(userId, limit = 50, offset = 0) {
  const result = await query(
    `SELECT id, title, jurisdiction, practice_area, status, created_at, updated_at
     FROM legal_research_sessions 
     WHERE user_id = $1 
     ORDER BY updated_at DESC 
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

/**
 * Save a message to a research session
 */
export async function saveMessage(sessionId, role, content, metadata = null) {
  const result = await query(
    `INSERT INTO legal_research_messages (session_id, role, content, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [sessionId, role, content, metadata ? JSON.stringify(metadata) : null]
  );
  
  // Update session timestamp
  await query(
    `UPDATE legal_research_sessions SET updated_at = NOW() WHERE id = $1`,
    [sessionId]
  );
  
  return result.rows[0];
}

/**
 * Get messages for a research session
 */
export async function getSessionMessages(sessionId, userId) {
  // Verify ownership first
  const session = await getSession(sessionId, userId);
  if (!session) return null;
  
  const result = await query(
    `SELECT id, role, content, metadata, created_at
     FROM legal_research_messages 
     WHERE session_id = $1 
     ORDER BY created_at ASC`,
    [sessionId]
  );
  return result.rows;
}

/**
 * Delete a research session and its messages
 */
export async function deleteSession(sessionId, userId) {
  // Verify ownership
  const session = await getSession(sessionId, userId);
  if (!session) return false;
  
  await query(`DELETE FROM legal_research_messages WHERE session_id = $1`, [sessionId]);
  await query(`DELETE FROM legal_research_sessions WHERE id = $1`, [sessionId]);
  return true;
}

/**
 * Check if the service is configured and ready
 */
export function isConfigured() {
  return !!OPENROUTER_API_KEY;
}

/**
 * Get available models (could be expanded to query OpenRouter)
 */
export function getAvailableModels() {
  return [
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Best balance of speed and intelligence', default: true },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Fast and capable' },
    { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', description: 'Most capable for deep analysis' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI flagship model' },
    { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: 'Fast Google model' },
    { id: 'perplexity/sonar-pro', name: 'Perplexity Sonar Pro', description: 'Research-focused with web search' },
  ];
}

/**
 * Get the current configuration (safe to expose — no secrets)
 */
export function getConfig() {
  return {
    configured: isConfigured(),
    baseUrl: OPENROUTER_BASE_URL,
    defaultModel: OPENROUTER_MODEL,
    appName: APP_NAME,
    availableModels: getAvailableModels(),
  };
}
