/**
 * Background Agent Module Definitions
 * Pre-built task modules for common legal workflows
 * Each module provides structured prompts and expected outputs
 */

export interface AgentModule {
  id: string
  name: string
  description: string
  category: 'matters' | 'documents' | 'billing' | 'clients' | 'calendar' | 'research' | 'compliance' | 'legal_research'
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
  // RESEARCH MODULES (Plugs into AI Legal Research Mastery)
  // =========================================
  {
    id: 'sol-research',
    name: 'Statute of Limitations Research',
    description: 'Research and document applicable statute of limitations with full citation support',
    category: 'research',
    estimatedMinutes: 6,
    complexity: 'medium',
    requiredContext: ['claimType', 'jurisdiction'],
    prompt: `Use the check_statute_of_limitations tool to research the statute of limitations:
1. Identify all applicable limitations periods with statutory citations
2. Note any tolling provisions (minority, insanity, absence from state)
3. Document discovery rule applicability and case law
4. Identify any special notice requirements (e.g., government claims)
5. Calculate key dates from incident/discovery
6. Use conduct_legal_research to create a structured research session
7. Generate a formal research memo with generate_research_memo`,
    expectedOutputs: [
      'Limitations periods with citations',
      'Tolling analysis',
      'Discovery rule review',
      'Notice requirements',
      'Date calculations',
      'Formal research memo'
    ]
  },
  {
    id: 'legal-research',
    name: 'Legal Issue Research',
    description: 'Deep AI-powered research on any legal issue with case law, statutes, and IRAC analysis',
    category: 'research',
    estimatedMinutes: 10,
    complexity: 'high',
    requiredContext: ['legalIssue', 'jurisdiction'],
    prompt: `Use the conduct_legal_research tool to start a structured research session, then:
1. Use search_legal_authority to find governing statutes and leading case authority
2. Use add_research_finding for each key finding (with IRAC structure: issue, rule, application, conclusion)
3. Use add_research_citation for every case, statute, and regulation cited
4. Use analyze_legal_issue for deep IRAC analysis of each sub-issue
5. Note any recent developments, circuit splits, or unsettled areas
6. Summarize majority and minority positions across jurisdictions
7. Use generate_research_memo to produce the formal research memorandum`,
    expectedOutputs: [
      'Statutory analysis with citations',
      'Case summaries with holdings',
      'IRAC analysis for each issue',
      'Recent developments',
      'Multi-perspective argument analysis',
      'Formal IRAC research memo'
    ]
  },
  {
    id: 'multi-jurisdiction-research',
    name: 'Multi-Jurisdiction Comparison',
    description: 'Compare legal treatment across multiple jurisdictions with AI analysis',
    category: 'research',
    estimatedMinutes: 12,
    complexity: 'high',
    requiredContext: ['legalIssue'],
    prompt: `Use the compare_jurisdictions tool with at least 3 jurisdictions:
1. Use conduct_legal_research with type 'multi_jurisdiction'
2. For each jurisdiction, use search_legal_authority to find governing law
3. Use add_research_finding for each jurisdiction's treatment of the issue
4. Identify majority rule, minority rule, and emerging trends
5. Analyze choice of law implications and forum selection strategy
6. Use add_research_citation for all authorities across jurisdictions
7. Use generate_research_memo for a comprehensive comparison memo`,
    expectedOutputs: [
      'Jurisdiction-by-jurisdiction analysis',
      'Majority vs minority rule classification',
      'Choice of law analysis',
      'Forum selection implications',
      'Trend analysis',
      'Comparison research memo'
    ]
  },
  {
    id: 'precedent-analysis',
    name: 'Precedent Analysis',
    description: 'Deep analysis of case precedent and its implications using AI legal mastery',
    category: 'research',
    estimatedMinutes: 8,
    complexity: 'high',
    requiredContext: ['caseCitation'],
    prompt: `Use conduct_legal_research with type 'precedent_analysis':
1. Analyze the case's full procedural history and factual background
2. Distinguish the precise holding from dicta
3. Use search_legal_authority to find how the case has been cited and followed
4. Identify any negative treatment, questioning, or limitation
5. Assess current validity and binding scope
6. Use add_research_finding for the doctrinal impact analysis
7. Generate a research memo on the case's precedential value`,
    expectedOutputs: [
      'Detailed case analysis',
      'Holding vs dicta distinction',
      'Subsequent history',
      'Current validity assessment',
      'Doctrinal impact analysis',
      'Precedent research memo'
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
