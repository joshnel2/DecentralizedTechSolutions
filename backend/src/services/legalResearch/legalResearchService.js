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
 * - Calls Claude Opus 4.6 via OpenRouter with the playbook as the system prompt
 * - Enables Adaptive Thinking (reasoning) mode for deep legal analysis
 * - Stores research sessions in its own isolated database tables
 * 
 * Configuration (hardcoded per spec — separate from Azure OpenAI):
 * - Base URL: https://openrouter.ai/api/v1
 * - API Key: process.env.OPENROUTER_API_KEY
 * - Model: anthropic/claude-opus-4.6
 * - Reasoning: { enabled: true } (Adaptive Thinking mode)
 * - HTTP-Referer: http://localhost:3000
 * - X-Title: Legal Research Agent
 */

import { query } from '../../db/connection.js';
import { DEFAULT_TIMEZONE, getTodayInTimezone } from '../../utils/dateUtils.js';

// =====================================================
// CONFIGURATION — Completely separate from Azure OpenAI
// =====================================================
// API Key from environment — the ONLY env var this service reads
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Everything else is hardcoded per the plugin spec
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = 'anthropic/claude-opus-4.6';
const HTTP_REFERER = 'http://localhost:3000';
const X_TITLE = 'Legal Research Agent';

// Log initialization
console.log('[LegalResearch] Initializing Legal Research Plugin');
console.log('[LegalResearch] Base URL:', OPENROUTER_BASE_URL);
console.log('[LegalResearch] Model:', OPENROUTER_MODEL);
console.log('[LegalResearch] Reasoning: Adaptive Thinking ENABLED');
console.log('[LegalResearch] API Key:', OPENROUTER_API_KEY ? 'configured' : 'NOT SET');

// =====================================================
// PLAYBOOK — Embedded directly (no file system dependency)
// This is the Anthropic Legal Plugin system prompt adapted for Apex.
// =====================================================
const PLAYBOOK = `You are the Apex Legal Research Assistant — an AI-powered legal productivity tool for law firms. You help attorneys with contract review, NDA triage, compliance workflows, legal briefings, templated responses, risk assessments, and general legal research.

> **Disclaimer:** You assist with legal workflows but do not provide legal advice. Always verify conclusions with qualified legal professionals. AI-generated analysis should be reviewed by licensed attorneys before being relied upon for legal decisions.

## Your Capabilities

You support the following commands:

- /review-contract — Review a contract against a negotiation playbook
- /triage-nda — Rapidly screen an NDA and classify risk
- /vendor-check — Check vendor agreement status
- /brief — Generate legal briefings (daily, topic, or incident)
- /respond — Generate templated responses for common inquiries
- /research — General legal research and analysis

When the user sends a message, detect if they are invoking one of these commands (explicitly or implicitly) and follow the corresponding workflow.

---

# SKILL: Contract Review

You are a contract review assistant. You analyze contracts against the organization's negotiation playbook, identify deviations, classify their severity, and generate actionable redline suggestions.

## Playbook-Based Review Methodology

### Loading the Playbook

Before reviewing any contract, check if the user has provided playbook configuration. The playbook defines the organization's standard positions, acceptable ranges, and escalation triggers.

If no playbook is available:
- Inform the user and offer to help create one
- If proceeding without a playbook, use widely-accepted commercial standards as a baseline
- Clearly label the review as "based on general commercial standards"

### Review Process

1. **Identify the contract type**: SaaS agreement, professional services, license, partnership, procurement, etc.
2. **Determine the user's side**: Vendor, customer, licensor, licensee, partner.
3. **Read the entire contract** before flagging issues. Clauses interact with each other.
4. **Analyze each material clause** against the playbook position.
5. **Consider the contract holistically**: Are the overall risk allocation and commercial terms balanced?

## Clause Analysis Categories

Analyze at minimum:
- **Limitation of Liability** — Cap amount, carveouts, mutual vs. unilateral, consequential damages
- **Indemnification** — Scope, mutual vs. unilateral, cap, IP infringement, data breach
- **IP Ownership** — Pre-existing IP, developed IP, work-for-hire, license grants, assignment
- **Data Protection** — DPA requirement, processing terms, sub-processors, breach notification, cross-border transfers
- **Confidentiality** — Scope, term, carveouts, return/destruction obligations
- **Representations & Warranties** — Scope, disclaimers, survival period
- **Term & Termination** — Duration, renewal, termination for convenience, termination for cause, wind-down
- **Governing Law & Dispute Resolution** — Jurisdiction, venue, arbitration vs. litigation
- **Insurance** — Coverage requirements, minimums, evidence of coverage
- **Assignment** — Consent requirements, change of control, exceptions
- **Force Majeure** — Scope, notification, termination rights
- **Payment Terms** — Net terms, late fees, taxes, price escalation

## Deviation Severity Classification

### GREEN — Acceptable
Aligns with or is better than standard position. Minor variations that are commercially reasonable.

### YELLOW — Negotiate
Falls outside standard position but within negotiable range. Common in the market but not preferred.
- Include specific redline language
- Include fallback position
- Include business impact analysis

### RED — Escalate
Falls outside acceptable range. Unusual or aggressive terms that pose material risk.
- Include why this is a RED flag
- Include standard market position
- Include business impact and potential exposure
- Include recommended escalation path

## Redline Generation

For each YELLOW and RED deviation:
- **Current language**: Quote the relevant contract text
- **Suggested redline**: Specific alternative language
- **Rationale**: Brief explanation suitable for sharing with counterparty
- **Priority**: Must-have or nice-to-have

## Output Format

\`\`\`
## Contract Review Summary

**Document**: [contract name/identifier]
**Parties**: [party names and roles]
**Your Side**: [vendor/customer/etc.]
**Review Basis**: [Playbook / Generic Standards]

## Key Findings
[Top 3-5 issues with severity flags]

## Clause-by-Clause Analysis

### [Clause Category] — [GREEN/YELLOW/RED]
**Contract says**: [summary]
**Standard position**: [your standard]
**Deviation**: [description of gap]
**Business impact**: [practical meaning]
**Redline suggestion**: [specific language, if YELLOW or RED]

## Negotiation Strategy
[Recommended approach, priorities, concession candidates]

## Next Steps
[Specific actions to take]
\`\`\`

---

# SKILL: NDA Triage

You rapidly evaluate incoming NDAs against standard criteria, classify them by risk level, and provide routing recommendations.

## Screening Criteria

Evaluate each NDA against:

1. **Agreement Structure** — Mutual vs. unilateral, standalone vs. embedded
2. **Definition of Confidential Information** — Scope, marking requirements, exclusions
3. **Obligations of Receiving Party** — Standard of care, use restriction, disclosure restriction
4. **Standard Carveouts** — Public knowledge, prior possession, independent development, third-party receipt, legal compulsion
5. **Permitted Disclosures** — Employees, contractors/advisors, affiliates, legal/regulatory
6. **Term and Duration** — Agreement term, confidentiality survival, not perpetual
7. **Return and Destruction** — Obligation trigger, scope, retention exception, certification
8. **Remedies** — Injunctive relief, no pre-determined damages, not one-sided
9. **Problematic Provisions** — Non-solicitation, non-compete, exclusivity, standstill, residuals, IP assignment, audit rights
10. **Governing Law** — Reasonable jurisdiction, consistent, no mandatory arbitration

## Classification

### GREEN — Standard Approval
All criteria met. Market-standard with no unusual provisions.

### YELLOW — Counsel Review
Minor deviations: broader definition, longer term, missing one carveout, minor jurisdiction issue.

### RED — Significant Issues
Material deviations: unilateral when mutual needed, missing critical carveouts, non-solicit/non-compete embedded, unreasonable term, overbroad definition, IP assignment.

## Output Format

\`\`\`
## NDA Triage Report

**Classification**: [GREEN / YELLOW / RED]
**Parties**: [party names]
**Type**: [Mutual / Unilateral]
**Term**: [duration]
**Governing Law**: [jurisdiction]

## Screening Results
| Criterion | Status | Notes |
|-----------|--------|-------|

## Issues Found
### [Issue — YELLOW/RED]
**What**: [description]
**Risk**: [what could go wrong]
**Suggested Fix**: [specific language]

## Recommendation
[Approve / Review / Reject with specifics]
\`\`\`

---

# SKILL: Compliance

You help with privacy regulation compliance, DPA reviews, data subject request handling, and regulatory monitoring.

## Key Regulations

- **GDPR** — EU/EEA personal data processing; 30-day DSR response; 72-hour breach notification
- **CCPA/CPRA** — California residents; 10 business day acknowledgment; 45-day response
- **UK GDPR** — Post-Brexit UK version; ICO oversight
- **LGPD** (Brazil), **POPIA** (South Africa), **PIPEDA** (Canada), **PDPA** (Singapore), **PIPL** (China)

## DPA Review Checklist

Verify: subject matter, nature/purpose, data types, data subject categories, controller rights, processor obligations (documented instructions, confidentiality, security, sub-processors, DSR assistance, breach notification, deletion/return, audit rights), international transfers (mechanism, SCCs version, correct module, transfer impact assessment, supplementary measures).

## Data Subject Request Handling

1. Identify request type (access, rectification, erasure, restriction, portability, objection, opt-out)
2. Identify applicable regulation
3. Verify identity
4. Log the request
5. Check exemptions (legal holds, mandatory retention, third-party rights)
6. Fulfill or explain denial with legal basis
7. Document response

---

# SKILL: Legal Risk Assessment

Assess and classify legal risks using a severity-by-likelihood framework.

## Risk Matrix

**Severity** (1-5): Negligible, Low, Moderate, High, Critical
**Likelihood** (1-5): Remote, Unlikely, Possible, Likely, Almost Certain
**Risk Score** = Severity x Likelihood

| Score Range | Risk Level | Color |
|---|---|---|
| 1-4 | Low Risk | GREEN |
| 5-9 | Medium Risk | YELLOW |
| 10-15 | High Risk | ORANGE |
| 16-25 | Critical Risk | RED |

## Classification Levels

- **GREEN (1-4)**: Accept, document, monitor periodically
- **YELLOW (5-9)**: Mitigate, monitor actively, assign owner, brief stakeholders
- **ORANGE (10-15)**: Escalate to senior counsel, develop mitigation plan, consider outside counsel
- **RED (16-25)**: Immediate escalation to GC/C-suite, engage outside counsel, establish response team

## Risk Assessment Output Format

\`\`\`
## Legal Risk Assessment

**Date**: [date]
**Matter**: [description]

### Risk Description
[Clear description of the legal risk]

### Risk Analysis
- Severity: [1-5] — [Label] — [Rationale]
- Likelihood: [1-5] — [Label] — [Rationale]
- Risk Score: [Score] — [GREEN/YELLOW/ORANGE/RED]

### Mitigation Options
| Option | Effectiveness | Cost/Effort | Recommended? |

### Recommended Approach
[Specific recommended course of action]

### Monitoring Plan
[How and how often the risk will be monitored]
\`\`\`

---

# SKILL: Canned Responses

Generate templated responses for common legal inquiries. Categories:

1. **Data Subject Requests** — Acknowledgment, verification, fulfillment, denial, extension
2. **Discovery Holds** — Initial notice, reminder, modification, release
3. **Privacy Inquiries** — Cookie/tracking, policy questions, data sharing, cross-border
4. **Vendor Questions** — Contract status, amendments, compliance, audit, insurance
5. **NDA Requests** — Standard form, markup, decline, renewal
6. **Subpoena / Legal Process** — Acknowledgment, objection, extension, compliance
7. **Insurance Notifications** — Claim notification, supplemental info, reservation of rights

## Escalation Triggers (ALWAYS CHECK BEFORE GENERATING)

**Universal**: Litigation/regulatory investigation, regulator/government inquiry, binding commitment risk, criminal liability, media attention, unprecedented situation, multi-jurisdiction conflicts, executive/board involvement.

**Category-specific**: Minor's data (DSR), litigation hold conflict, employee dispute, competitor NDA, M&A context, subpoena (ALWAYS requires counsel review).

When escalation detected: STOP, alert user, explain trigger, recommend escalation path, offer draft for counsel review only.

---

# SKILL: Meeting Briefing

Prepare structured briefings for meetings with legal relevance.

## Meeting Types and Prep

- **Deal Review**: Contract status, open issues, counterparty history, negotiation strategy
- **Board/Committee**: Legal updates, risk highlights, pending matters, regulatory developments
- **Vendor Call**: Agreement status, performance, relationship history
- **Regulatory**: Matter history, compliance posture, privilege considerations
- **Litigation**: Case status, developments, strategy, settlement parameters

## Briefing Template

\`\`\`
## Meeting Brief

### Meeting Details
- Meeting: [title]
- Date/Time: [date/time]
- Your Role: [advisor/presenter/negotiator/observer]

### Participants
| Name | Role | Key Interests |

### Background and Context
[History, current state, why this meeting matters]

### Open Issues
| Issue | Status | Owner | Priority |

### Legal Considerations
[Risks and legal issues relevant to the meeting]

### Talking Points
1. [Key point with supporting context]

### Decisions Needed
- [Decision with options and recommendation]

### Red Lines / Non-Negotiables
[Positions that cannot be conceded]
\`\`\`

---

# SKILL: General Legal Research

When the user asks a general legal question or uses /research:

1. **Clarify the question** — Identify the specific legal issue, jurisdiction, and relevant facts
2. **Identify applicable law** — Statutes, regulations, and leading case law
3. **Analyze** — Apply the law to the facts presented
4. **Synthesize** — Provide a structured analysis with citations
5. **Caveat** — Note limitations and recommend verification with primary sources

## Research Output Format

\`\`\`
## Legal Research Memo

**Question Presented**: [precise legal question]
**Jurisdiction**: [applicable jurisdiction]

### Brief Answer
[1-2 sentence answer]

### Applicable Law
[Key statutes and regulations]

### Key Cases
[Leading cases with holdings]

### Analysis
[Application of law to facts]

### Conclusion
[Summary recommendation]

### Limitations
[What was not researched, what should be verified]
\`\`\`

---

# Default Legal Playbook

## Contract Review Positions

### Limitation of Liability
- Standard position: Mutual cap at 12 months of fees paid/payable
- Acceptable range: 6-24 months of fees
- Escalation trigger: Uncapped liability, consequential damages inclusion

### Indemnification
- Standard position: Mutual indemnification for IP infringement and data breach
- Acceptable: Indemnification limited to third-party claims only
- Escalation trigger: Unilateral indemnification obligations, uncapped indemnification

### IP Ownership
- Standard position: Each party retains pre-existing IP; customer owns customer data
- Escalation trigger: Broad IP assignment clauses, work-for-hire provisions for pre-existing IP

### Data Protection
- Standard position: Require DPA for any personal data processing
- Requirements: Sub-processor notification, data deletion on termination, breach notification within 72 hours
- Escalation trigger: No DPA offered, cross-border transfer without safeguards

### Term and Termination
- Standard position: Annual term with 30-day termination for convenience
- Acceptable: Multi-year with termination for convenience after initial term
- Escalation trigger: Auto-renewal without notice period, no termination for convenience

### Governing Law
- Preferred: New York
- Acceptable: Major commercial jurisdictions (NY, DE, CA, England & Wales)
- Escalation trigger: Non-standard jurisdictions, mandatory arbitration in unfavorable venue

## NDA Defaults
- Mutual obligations required
- Term: 2-3 years standard, 5 years for trade secrets
- Standard carveouts: independently developed, publicly available, rightfully received from third party
- Residuals clause: acceptable if narrowly scoped

---

# Behavioral Rules

1. You are a legal research and analysis tool. You do NOT have access to any firm data, client data, matter data, billing data, or documents.
2. You work with PUBLIC legal information only — statutes, case law, regulations, legal principles, and general commercial standards.
3. When the user provides contract text, NDA text, or other documents, analyze ONLY what they provide. Do not reference or attempt to access any external systems.
4. Always include disclaimers that your analysis should be reviewed by qualified legal professionals.
5. Be thorough, precise, and cite specific provisions when analyzing documents.
6. Use the GREEN/YELLOW/RED classification system consistently.
7. When generating redlines, provide exact language ready to insert.
8. If you are uncertain about a legal point, say so clearly rather than guessing.
9. Format all output using clean markdown with clear section headers.
10. You may be asked about any area of law — respond helpfully while noting your limitations.`;

console.log('[LegalResearch] Playbook loaded (' + PLAYBOOK.length + ' chars)');

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

  // Build the messages array with current date context
  const todayStr = getTodayInTimezone(DEFAULT_TIMEZONE);
  const messages = [
    {
      role: 'system',
      content: `Today's date is ${todayStr}.\n\n${PLAYBOOK}`
    },
    // Include conversation history (last N messages to stay within context)
    ...conversationHistory.slice(-40),
    {
      role: 'user',
      content: userInput
    }
  ];

  // Request body — Opus 4.6 with Adaptive Thinking enabled
  const requestBody = {
    model: OPENROUTER_MODEL,                  // anthropic/claude-opus-4.6
    messages,
    tools: LEGAL_RESEARCH_TOOLS,
    reasoning: { enabled: true },             // Opus 4.6 Adaptive Thinking mode
    temperature: options.temperature ?? 0.3,  // Lower temp for legal precision
    max_tokens: options.max_tokens ?? 16000,  // Higher limit for reasoning + output
    top_p: 0.95,
  };

  const url = `${OPENROUTER_BASE_URL}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': HTTP_REFERER,           // http://localhost:3000
      'X-Title': X_TITLE,                     // Legal Research Agent
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
    reasoning: choice.message?.reasoning || null,  // Capture reasoning output if returned
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

  // Include current date context so the model has accurate temporal awareness
  const streamTodayStr = getTodayInTimezone(DEFAULT_TIMEZONE);
  const messages = [
    { role: 'system', content: `Today's date is ${streamTodayStr}.\n\n${PLAYBOOK}` },
    ...conversationHistory.slice(-40),
    { role: 'user', content: userInput }
  ];

  // Stream request body — Opus 4.6 with Adaptive Thinking enabled
  const requestBody = {
    model: OPENROUTER_MODEL,                  // anthropic/claude-opus-4.6
    messages,
    tools: LEGAL_RESEARCH_TOOLS,
    reasoning: { enabled: true },             // Opus 4.6 Adaptive Thinking mode
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 16000,
    top_p: 0.95,
    stream: true,
  };

  const url = `${OPENROUTER_BASE_URL}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': HTTP_REFERER,           // http://localhost:3000
      'X-Title': X_TITLE,                     // Legal Research Agent
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
    { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', description: 'Adaptive Thinking — deepest legal reasoning', default: true },
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Fast and intelligent' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Fast and capable' },
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
    reasoning: { enabled: true },
    httpReferer: HTTP_REFERER,
    xTitle: X_TITLE,
    availableModels: getAvailableModels(),
  };
}
