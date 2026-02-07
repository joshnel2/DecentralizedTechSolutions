/**
 * Background Agent Module Definitions
 * Pre-built task modules for common legal workflows
 * Each module provides structured prompts and expected outputs
 */

export interface AgentModule {
  id: string
  name: string
  description: string
  category: 'matters' | 'documents' | 'billing' | 'clients' | 'calendar' | 'research' | 'compliance' | 'litigation' | 'drafting'
  estimatedMinutes: number
  complexity: 'low' | 'medium' | 'high'
  requiredContext?: string[]
  prompt: string
  expectedOutputs?: string[]
  followUpQuestions?: string[]
}

export const AGENT_MODULES: AgentModule[] = [
  // =========================================
  // MATTER MANAGEMENT MODULES
  // =========================================
  {
    id: 'matter-intake',
    name: 'New Matter Intake',
    description: 'Complete new matter setup with tasks, deadlines, and initial documents',
    category: 'matters',
    estimatedMinutes: 5,
    complexity: 'medium',
    requiredContext: ['clientName', 'matterType'],
    prompt: `Create a complete new matter intake workflow:
1. Set up initial task checklist based on matter type
2. Identify key deadlines including statute of limitations
3. Create client communication templates
4. Generate a matter summary memo
5. Run basic conflict check
6. Set up folder structure for documents`,
    expectedOutputs: [
      'Task checklist created',
      'Key deadlines identified',
      'Client templates generated',
      'Matter summary memo drafted',
      'Conflict check results',
      'Document folders created'
    ]
  },
  {
    id: 'matter-status-review',
    name: 'Matter Status Review',
    description: 'Comprehensive review of all active matters with action items',
    category: 'matters',
    estimatedMinutes: 8,
    complexity: 'high',
    prompt: `Review all active matters and provide:
1. Summary of each matter's current status
2. Identify stalled or at-risk matters
3. List upcoming deadlines in next 30 days
4. Highlight matters needing immediate attention
5. Recommend next steps for each matter
6. Flag any compliance or deadline concerns`,
    expectedOutputs: [
      'Matter status summary',
      'At-risk matters identified',
      'Deadline calendar',
      'Priority action items',
      'Recommendations per matter'
    ]
  },
  {
    id: 'case-assessment',
    name: 'Case Assessment Memo',
    description: 'Generate comprehensive case evaluation and strategy memo',
    category: 'matters',
    estimatedMinutes: 10,
    complexity: 'high',
    requiredContext: ['matterId'],
    prompt: `Prepare a comprehensive case assessment memo:
1. Analyze the facts and evidence available
2. Identify all legal issues and applicable law
3. Assess strengths and weaknesses
4. Evaluate potential outcomes and risks
5. Consider opposing party's likely arguments
6. Recommend litigation or settlement strategy
7. Estimate timeline and budget`,
    expectedOutputs: [
      'Facts summary',
      'Legal issues analysis',
      'Strengths/weaknesses assessment',
      'Outcome evaluation',
      'Strategy recommendation',
      'Budget estimate'
    ]
  },

  // =========================================
  // DOCUMENT MODULES
  // =========================================
  {
    id: 'document-review',
    name: 'Document Review & Summary',
    description: 'Review and summarize all documents for a matter',
    category: 'documents',
    estimatedMinutes: 5,
    complexity: 'medium',
    requiredContext: ['matterId'],
    prompt: `Review and analyze all documents in this matter:
1. Create a summary of each document
2. Extract key terms, dates, and provisions
3. Identify any gaps in documentation
4. Flag potential issues or red flags
5. Create a document index with categories
6. Note any documents requiring follow-up`,
    expectedOutputs: [
      'Document summaries',
      'Key terms extracted',
      'Gap analysis',
      'Issue flags',
      'Document index'
    ]
  },
  {
    id: 'contract-analysis',
    name: 'Contract Analysis',
    description: 'Detailed analysis of contract terms and risks',
    category: 'documents',
    estimatedMinutes: 8,
    complexity: 'high',
    requiredContext: ['documentId'],
    prompt: `Perform detailed contract analysis:
1. Identify all parties and their obligations
2. Extract key terms and definitions
3. Analyze payment and pricing provisions
4. Review termination and renewal clauses
5. Identify indemnification and liability provisions
6. Note any unusual or unfavorable terms
7. List recommended negotiation points
8. Flag compliance requirements`,
    expectedOutputs: [
      'Parties and obligations summary',
      'Key terms list',
      'Payment analysis',
      'Termination review',
      'Liability assessment',
      'Negotiation recommendations'
    ]
  },
  {
    id: 'discovery-prep',
    name: 'Discovery Preparation',
    description: 'Prepare for discovery with document organization and request drafting',
    category: 'documents',
    estimatedMinutes: 12,
    complexity: 'high',
    requiredContext: ['matterId'],
    prompt: `Prepare for discovery phase:
1. Organize existing documents by category
2. Identify documents likely to be requested
3. Flag privileged documents for review
4. Draft initial discovery requests
5. Create document production checklist
6. Identify potential issues with production`,
    expectedOutputs: [
      'Document categorization',
      'Production list',
      'Privilege log draft',
      'Discovery requests draft',
      'Production checklist'
    ]
  },

  // =========================================
  // BILLING MODULES
  // =========================================
  {
    id: 'billing-review',
    name: 'Monthly Billing Review',
    description: 'Analyze time entries and prepare for invoicing',
    category: 'billing',
    estimatedMinutes: 8,
    complexity: 'high',
    prompt: `Perform comprehensive billing review:
1. Analyze all unbilled time entries from past month
2. Identify entries needing description improvements
3. Flag time that might be written off
4. Group entries by matter for invoice preparation
5. Calculate totals and compare to budgets
6. Identify matters approaching budget limits
7. Prepare billing summary report`,
    expectedOutputs: [
      'Unbilled time analysis',
      'Description improvements',
      'Write-off recommendations',
      'Invoice-ready groupings',
      'Budget comparison',
      'Billing summary'
    ]
  },
  {
    id: 'ar-aging-review',
    name: 'A/R Aging Review',
    description: 'Review accounts receivable and recommend collection actions',
    category: 'billing',
    estimatedMinutes: 5,
    complexity: 'medium',
    prompt: `Review accounts receivable aging:
1. Summarize outstanding balances by age
2. Identify severely overdue accounts (90+ days)
3. Recommend collection actions by client
4. Draft collection reminder templates
5. Calculate potential write-offs
6. Identify clients for follow-up calls`,
    expectedOutputs: [
      'Aging summary',
      'Overdue accounts list',
      'Collection recommendations',
      'Reminder templates',
      'Write-off analysis'
    ]
  },

  // =========================================
  // CLIENT COMMUNICATION MODULES
  // =========================================
  {
    id: 'client-update',
    name: 'Client Status Update',
    description: 'Prepare client communication materials',
    category: 'clients',
    estimatedMinutes: 4,
    complexity: 'low',
    prompt: `Prepare client communication materials:
1. Summarize recent activity on all active matters
2. Draft status update email for each client
3. Identify matters needing client contact
4. Create client call preparation sheet
5. Note any sensitive issues to address`,
    expectedOutputs: [
      'Activity summary',
      'Status email drafts',
      'Follow-up list',
      'Call prep sheets'
    ]
  },
  {
    id: 'client-intake-checklist',
    name: 'Client Intake Checklist',
    description: 'Create comprehensive new client intake checklist',
    category: 'clients',
    estimatedMinutes: 3,
    complexity: 'low',
    requiredContext: ['practiceArea'],
    prompt: `Create new client intake checklist:
1. Generate required documents checklist by practice area
2. Create intake questionnaire
3. List required ID and verification documents
4. Prepare retainer agreement template
5. Create conflict check form
6. Generate welcome letter template`,
    expectedOutputs: [
      'Document checklist',
      'Intake questionnaire',
      'Verification requirements',
      'Retainer template',
      'Welcome letter'
    ]
  },

  // =========================================
  // CALENDAR & DEADLINE MODULES
  // =========================================
  {
    id: 'deadline-audit',
    name: 'Deadline Audit',
    description: 'Comprehensive deadline review across all matters',
    category: 'calendar',
    estimatedMinutes: 5,
    complexity: 'medium',
    prompt: `Audit all matters for deadlines:
1. Review upcoming deadlines in next 30 days
2. Identify any matters missing critical deadlines
3. Check statute of limitations dates
4. Verify discovery and motion deadlines
5. Create prioritized deadline report
6. Recommend calendar reminders`,
    expectedOutputs: [
      'Upcoming deadlines list',
      'Missing deadline flags',
      'SOL review',
      'Prioritized report',
      'Reminder recommendations'
    ]
  },
  {
    id: 'court-rules-check',
    name: 'Court Rules Compliance',
    description: 'Verify compliance with applicable court rules',
    category: 'calendar',
    estimatedMinutes: 6,
    complexity: 'medium',
    requiredContext: ['jurisdiction', 'caseType'],
    prompt: `Check court rules compliance:
1. Identify applicable court rules for jurisdiction
2. Review filing requirements
3. Check service of process requirements
4. Verify motion practice rules
5. Note any local rules for specific judge
6. Create compliance checklist`,
    expectedOutputs: [
      'Applicable rules list',
      'Filing requirements',
      'Service requirements',
      'Motion rules summary',
      'Compliance checklist'
    ]
  },

  // =========================================
  // RESEARCH MODULES
  // =========================================
  {
    id: 'sol-research',
    name: 'Statute of Limitations Research',
    description: 'Research and document applicable statute of limitations',
    category: 'research',
    estimatedMinutes: 6,
    complexity: 'medium',
    requiredContext: ['claimType', 'jurisdiction'],
    prompt: `Research statute of limitations:
1. Identify all applicable limitations periods
2. Note any tolling provisions
3. Document discovery rule applicability
4. Identify any special notice requirements
5. Calculate key dates from incident/discovery
6. Create limitations analysis memo`,
    expectedOutputs: [
      'Limitations periods',
      'Tolling analysis',
      'Discovery rule review',
      'Notice requirements',
      'Date calculations',
      'Analysis memo'
    ]
  },
  {
    id: 'legal-research',
    name: 'Legal Issue Research',
    description: 'Research specific legal issue with case law',
    category: 'research',
    estimatedMinutes: 10,
    complexity: 'high',
    requiredContext: ['legalIssue', 'jurisdiction'],
    prompt: `Research legal issue:
1. Identify governing statutes
2. Find leading case authority
3. Note any recent developments
4. Summarize majority and minority positions
5. Identify potential arguments on both sides
6. Draft research memo with citations`,
    expectedOutputs: [
      'Statutory analysis',
      'Case summaries',
      'Recent developments',
      'Argument analysis',
      'Research memo draft'
    ]
  },

  // =========================================
  // COMPLIANCE MODULES
  // =========================================
  {
    id: 'trust-reconciliation',
    name: 'Trust Account Reconciliation',
    description: 'Reconcile trust account and verify compliance',
    category: 'compliance',
    estimatedMinutes: 8,
    complexity: 'high',
    prompt: `Perform trust account reconciliation:
1. Review all trust transactions for period
2. Match deposits to client matters
3. Verify disbursement authorizations
4. Check for negative client balances
5. Prepare reconciliation report
6. Flag any compliance concerns`,
    expectedOutputs: [
      'Transaction review',
      'Deposit matching',
      'Disbursement verification',
      'Balance check',
      'Reconciliation report',
      'Compliance flags'
    ]
  },
  {
    id: 'conflicts-check',
    name: 'Comprehensive Conflicts Check',
    description: 'Run conflicts check against all firm matters and parties',
    category: 'compliance',
    estimatedMinutes: 4,
    complexity: 'medium',
    requiredContext: ['partyNames'],
    prompt: `Run comprehensive conflicts check:
1. Search all current and former clients
2. Check all matters for related parties
3. Search adverse party database
4. Check attorney relationship history
5. Document any potential conflicts
6. Recommend waiver if applicable`,
    expectedOutputs: [
      'Client search results',
      'Related parties found',
      'Adverse party matches',
      'Conflict analysis',
      'Waiver recommendation'
    ]
  },

  // =========================================
  // LITIGATION MODULES (Junior Attorney)
  // =========================================
  {
    id: 'motion-drafting',
    name: 'Motion Drafting',
    description: 'Draft a motion with supporting memorandum of law using IRAC analysis',
    category: 'litigation',
    estimatedMinutes: 15,
    complexity: 'high',
    requiredContext: ['matterId', 'motionType'],
    prompt: `Draft a motion with supporting memorandum of law:
1. Review matter facts, documents, and existing filings
2. Identify the applicable legal standard and standard of review
3. Research governing statutes and controlling case law
4. Draft the Notice of Motion with proper caption and relief sought
5. Draft the Memorandum of Law using IRAC structure:
   - Issue statement
   - Rule of law with citations
   - Application of law to facts
   - Conclusion with specific relief requested
6. Draft supporting affidavit/declaration if needed
7. Create review task for supervising attorney
8. Calendar filing deadline and hearing date`,
    expectedOutputs: [
      'Notice of Motion',
      'Memorandum of Law (IRAC format)',
      'Supporting declaration/affidavit',
      'Review task for partner',
      'Filing deadline on calendar'
    ],
    followUpQuestions: [
      'What type of motion? (dismiss, summary judgment, compel, etc.)',
      'Which court and jurisdiction?',
      'Is there a filing deadline?'
    ]
  },
  {
    id: 'deposition-prep',
    name: 'Deposition Preparation',
    description: 'Prepare comprehensive deposition outline with key documents and examination topics',
    category: 'litigation',
    estimatedMinutes: 12,
    complexity: 'high',
    requiredContext: ['matterId'],
    prompt: `Prepare for deposition:
1. Review all matter documents for key facts and chronology
2. Build witness background profile from available information
3. Identify key examination topics organized by subject
4. Draft examination outline with specific questions for each topic
5. Flag documents to use as exhibits during examination
6. Prepare objection reminders (form, privilege, foundation)
7. Create timeline of key events for reference
8. Draft deposition notice if taking the deposition
9. Create preparation task checklist
10. Note areas requiring follow-up discovery`,
    expectedOutputs: [
      'Examination outline with topics and questions',
      'Key documents/exhibits list',
      'Chronological timeline',
      'Objection reference guide',
      'Preparation checklist',
      'Follow-up discovery recommendations'
    ]
  },
  {
    id: 'opposing-motion-response',
    name: 'Opposition to Motion',
    description: 'Draft opposition papers responding to an adverse motion',
    category: 'litigation',
    estimatedMinutes: 15,
    complexity: 'high',
    requiredContext: ['matterId'],
    prompt: `Draft opposition to adverse motion:
1. Analyze the moving papers — identify each argument
2. Research the applicable standard of review
3. Identify factual disputes that preclude relief
4. Research counter-authority and distinguishing cases
5. Draft opposition memorandum of law:
   - Statement of facts (favorable to our position)
   - Legal standard (emphasizing burden on movant)
   - Point-by-point rebuttal of each argument
   - Affirmative arguments why motion should be denied
6. Draft counter-affidavit/declaration with supporting facts
7. Create review task for supervising attorney
8. Calendar response deadline`,
    expectedOutputs: [
      'Opposition memorandum of law',
      'Counter-declaration/affidavit',
      'Analysis of moving papers',
      'Research memo on counter-authority',
      'Review task for partner'
    ]
  },
  {
    id: 'trial-prep-bundle',
    name: 'Trial Preparation Bundle',
    description: 'Comprehensive trial preparation including witness lists, exhibit lists, and trial brief outline',
    category: 'litigation',
    estimatedMinutes: 20,
    complexity: 'high',
    requiredContext: ['matterId'],
    prompt: `Prepare comprehensive trial bundle:
1. Review all pleadings, discovery, and motion practice
2. Create master witness list with contact info and testimony topics
3. Prepare exhibit list organized by topic/witness
4. Draft trial brief outline with key legal arguments
5. Create timeline of key events for opening statement
6. Identify potential evidentiary issues and prepare motions in limine
7. Draft voir dire questions if jury trial
8. Prepare witness examination outlines (direct and cross)
9. Create daily trial preparation checklist
10. Calendar all pre-trial deadlines and conference dates`,
    expectedOutputs: [
      'Witness list with testimony summaries',
      'Exhibit list and organization plan',
      'Trial brief outline',
      'Timeline of key events',
      'Motions in limine issues',
      'Pre-trial checklist'
    ]
  },

  // =========================================
  // DRAFTING MODULES (Junior Attorney)
  // =========================================
  {
    id: 'legal-memo',
    name: 'Legal Memorandum',
    description: 'Draft a formal legal memorandum using IRAC methodology',
    category: 'drafting',
    estimatedMinutes: 12,
    complexity: 'high',
    requiredContext: ['matterId', 'legalIssue'],
    prompt: `Draft a comprehensive legal memorandum:
1. Review matter documents and identify the legal issue(s)
2. Research applicable statutes and regulations
3. Find controlling and persuasive case authority
4. Draft memorandum in IRAC format:
   - ISSUE: Precise statement of the legal question
   - RULE: Applicable legal standards with citations
   - APPLICATION: Apply the law to our specific facts
   - CONCLUSION: Clear answer with confidence level
5. Include practical recommendations and next steps
6. Add table of authorities
7. Mark any unverified citations as [UNVERIFIED]
8. Create review task for supervising attorney`,
    expectedOutputs: [
      'Legal memorandum (IRAC format, 800+ words)',
      'Table of authorities',
      'Practical recommendations',
      'Review task for partner',
      'Matter note summarizing findings'
    ]
  },
  {
    id: 'demand-letter',
    name: 'Demand Letter',
    description: 'Draft a professional demand letter with legal basis and specific demands',
    category: 'drafting',
    estimatedMinutes: 8,
    complexity: 'medium',
    requiredContext: ['matterId'],
    prompt: `Draft a demand letter:
1. Review matter for relevant facts, damages, and legal basis
2. Identify the correct recipient and their counsel (if represented)
3. Draft demand letter with:
   - Clear identification of client and purpose
   - Concise factual background (chronological)
   - Legal basis for the claim with statutory/case citations
   - Specific demand (amount, action, or both)
   - Deadline for response (typically 10-30 days)
   - Consequences of non-compliance
   - Willingness to discuss resolution
4. Maintain firm but professional tone throughout
5. Create review task for supervising attorney before sending
6. Note in matter file that demand letter was drafted`,
    expectedOutputs: [
      'Demand letter draft',
      'Review task for partner',
      'Matter note documenting demand',
      'Calendar event for response deadline'
    ]
  },
  {
    id: 'engagement-letter',
    name: 'Engagement Letter',
    description: 'Draft a client engagement letter with fee arrangement and scope of representation',
    category: 'drafting',
    estimatedMinutes: 6,
    complexity: 'medium',
    requiredContext: ['clientName', 'matterType'],
    prompt: `Draft an engagement letter:
1. Review client information and matter type
2. Draft engagement letter including:
   - Scope of representation (specific and bounded)
   - Fee arrangement (hourly, flat, contingency, retainer)
   - Billing practices and payment terms
   - Retainer amount and replenishment (if applicable)
   - Client responsibilities and cooperation expectations
   - Conflict of interest disclosure (if applicable)
   - Termination and withdrawal provisions
   - File retention and destruction policy
   - Electronic communication consent
3. Use clear, client-friendly language
4. Create review task for partner before sending
5. Create follow-up task to collect signed copy`,
    expectedOutputs: [
      'Engagement letter draft',
      'Review task for partner',
      'Follow-up task for signed copy',
      'Matter note documenting engagement terms'
    ]
  },
  {
    id: 'client-status-update',
    name: 'Client Status Update Letter',
    description: 'Draft a client status update summarizing recent activity and next steps',
    category: 'drafting',
    estimatedMinutes: 5,
    complexity: 'low',
    requiredContext: ['matterId'],
    prompt: `Draft a client status update:
1. Review matter for all recent activity and developments
2. Check recent notes, documents, and calendar events
3. Draft update letter including:
   - Greeting and matter reference
   - Summary of recent developments (plain language)
   - Current status of the matter
   - Upcoming deadlines and scheduled events
   - Action items needed from the client (with deadlines)
   - Next steps from the firm
   - Estimated timeline for next milestones
4. Use plain language — no unexplained legal jargon
5. Create review task for supervising attorney
6. Schedule follow-up for next update`,
    expectedOutputs: [
      'Client status update letter',
      'Review task for partner',
      'Calendar event for next scheduled update',
      'Matter note documenting communication'
    ]
  },
  {
    id: 'closing-letter',
    name: 'Matter Closing Letter',
    description: 'Draft a matter closing letter and prepare file for archival',
    category: 'drafting',
    estimatedMinutes: 6,
    complexity: 'medium',
    requiredContext: ['matterId'],
    prompt: `Draft a matter closing letter and prepare for archival:
1. Review matter for final status and outcome
2. Check for any outstanding billing or open tasks
3. Draft closing letter including:
   - Summary of the representation and outcome
   - Final billing status and any outstanding balance
   - Return of client documents and property
   - File retention policy and anticipated destruction date
   - Post-matter obligations (if any, e.g., ongoing compliance)
   - Thank the client and invite future contact
4. Create tasks for file archival steps
5. Flag any open items that must be resolved before closing
6. Update matter status if appropriate`,
    expectedOutputs: [
      'Closing letter draft',
      'Outstanding items list',
      'File archival task checklist',
      'Final billing summary',
      'Matter note documenting closure'
    ]
  }
]

/**
 * Get modules by category
 */
export function getModulesByCategory(category: AgentModule['category']): AgentModule[] {
  return AGENT_MODULES.filter(m => m.category === category)
}

/**
 * Get module by ID
 */
export function getModuleById(id: string): AgentModule | undefined {
  return AGENT_MODULES.find(m => m.id === id)
}

/**
 * Build prompt with context variables
 */
export function buildModulePrompt(
  module: AgentModule, 
  context: Record<string, string> = {}
): string {
  let prompt = module.prompt
  
  // Replace any {{variable}} patterns with context values
  for (const [key, value] of Object.entries(context)) {
    prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  
  return prompt
}

/**
 * Get estimated time string
 */
export function getEstimatedTime(module: AgentModule): string {
  if (module.estimatedMinutes <= 3) return '~2-3 min'
  if (module.estimatedMinutes <= 5) return '~3-5 min'
  if (module.estimatedMinutes <= 8) return '~5-8 min'
  return `~${module.estimatedMinutes} min`
}
