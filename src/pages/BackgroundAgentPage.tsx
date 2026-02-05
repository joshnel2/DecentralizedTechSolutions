import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Rocket, StopCircle, Wrench, Terminal, Send, MessageCircle, Star, X, ThumbsUp, Clock, Search, ChevronDown, ChevronUp, Zap, FileText, Users, Calendar, DollarSign, Briefcase, Scale, LayoutTemplate, Brain, Lightbulb, Sparkles, Settings, TrendingUp, UserPlus, Building2, Mail, Shield, Play, Pause, Bell, ChevronRight, Check, AlertTriangle as Warning, Timer, Repeat, Plus, BookOpen } from 'lucide-react'
import { aiApi, mattersApi, calendarApi } from '../services/api'
import { useNotifications } from '../utils/notifications'
import { TaskTemplatesLibrary, TaskTemplate } from '../components/TaskTemplatesLibrary'
import styles from './BackgroundAgentPage.module.css'
import { clsx } from 'clsx'

interface StreamEvent {
  type: string
  message: string
  timestamp: string
  icon?: string
  color?: string
}

interface BackgroundTaskProgress {
  progressPercent?: number
  currentStep?: string
  iterations?: number
  totalSteps?: number
  completedSteps?: number
}

interface BackgroundTask {
  id: string
  goal: string
  status: string
  progress?: BackgroundTaskProgress
  result?: { summary?: string }
  error?: string
}

interface AgentStatus {
  available: boolean
  configured: boolean
  message?: string
}

interface ScheduledTask {
  id: string
  name: string
  goal: string
  schedule: string // cron expression or human readable
  nextRun: string
  lastRun?: string
  enabled: boolean
  extended: boolean
}

interface ProactiveSuggestion {
  id: string
  type: 'deadline' | 'billing' | 'stale' | 'document' | 'opportunity'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  matterId?: string
  matterName?: string
  action?: string
  actionPrompt?: string
}

interface ToolConfirmation {
  toolName: string
  toolDescription: string
  parameters: Record<string, any>
  estimatedImpact: string
}

interface BackgroundToolsResponse {
  tools?: Array<{ name: string; description?: string }>
  categories?: Array<{ name: string; tools: string[] }>
}

interface BackgroundSummary {
  goal: string
  summary?: string
  status?: string
}

const clampPercent = (value: number | undefined | null, fallback = 0) => {
  const resolved = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(100, Math.max(0, resolved))
}

const backgroundApi = aiApi as any

export function BackgroundAgentPage() {
  const location = useLocation()
  const _navigate = useNavigate()
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [activeTask, setActiveTask] = useState<BackgroundTask | null>(null)
  const [recentTasks, setRecentTasks] = useState<BackgroundTask[]>([])
  const [tools, setTools] = useState<BackgroundToolsResponse | null>(null)
  const [summary, setSummary] = useState<BackgroundSummary | null>(null)
  const [goalInput, setGoalInput] = useState('')
  const [startError, setStartError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [polling, _setPolling] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  
  // Real-time streaming state
  const [liveEvents, setLiveEvents] = useState<StreamEvent[]>([])
  const [_isStreaming, setIsStreaming] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const liveEventsRef = useRef<HTMLDivElement>(null)
  const maxReconnectAttempts = 5
  
  // Follow-up state
  const [followUpInput, setFollowUpInput] = useState('')
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  
  // Extended mode for long-running tasks
  const [extendedMode, setExtendedMode] = useState(false)
  
  // Scheduled tasks
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([])
  const [_showScheduleModal, _setShowScheduleModal] = useState(false)
  const [_scheduleForm, _setScheduleForm] = useState({ name: '', schedule: 'weekly', day: 'friday', time: '16:00' })
  
  // Proactive suggestions
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([])
  const [_loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  
  // Tool confirmation
  const [pendingToolConfirmation, setPendingToolConfirmation] = useState<ToolConfirmation | null>(null)
  const [toolConfirmationCallback, setToolConfirmationCallback] = useState<(() => void) | null>(null)
  
  // Task pause/resume
  const [isPaused, setIsPaused] = useState(false)
  
  // AI Task Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [taskAnalysis, setTaskAnalysis] = useState<{
    complexity: 'simple' | 'moderate' | 'complex'
    estimatedSteps: number
    requiredTools: string[]
    potentialIssues: string[]
    suggestedApproach: string
  } | null>(null)
  
  // Smart follow-up suggestions
  const [_followUpSuggestions, _setFollowUpSuggestions] = useState<string[]>([])
  
  // AI confidence score for running task
  const [_aiConfidence, _setAiConfidence] = useState<number>(0)
  
  // Notifications
  const { isSupported: notificationsSupported, permission: _notificationPermission, requestPermission, notifyTask } = useNotifications()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  
  // Enable notifications on user interaction
  const enableNotifications = useCallback(async () => {
    const permission = await requestPermission()
    setNotificationsEnabled(permission === 'granted')
  }, [requestPermission])
  
  // Full templates library modal
  const [showTemplatesLibrary, setShowTemplatesLibrary] = useState(false)
  
  const handleTemplateSelect = useCallback((template: TaskTemplate) => {
    setGoalInput(template.prompt)
    setExtendedMode(template.complexity === 'extended')
    setShowTemplatesLibrary(false)
    setShowTemplates(false)
  }, [])
  
  // Highlighted task (from navigation)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)
  const activeTaskRef = useRef<HTMLDivElement>(null)
  
  // Task templates - pre-built complex workflows
  const taskTemplates = [
    // Quick Tasks (under 10 min)
    {
      id: 'new-matter-intake',
      name: 'New Matter Intake',
      description: 'Set up a new matter with all required tasks, deadlines, and initial documents',
      icon: Briefcase,
      estimatedTime: '~5 min',
      complexity: 'medium',
      prompt: 'Create a complete new matter intake workflow: set up initial tasks checklist, identify key deadlines including statute of limitations, create client communication templates, and generate a matter summary memo.',
      tags: ['matters', 'intake', 'tasks'],
      extended: false
    },
    {
      id: 'document-review',
      name: 'Quick Document Analysis',
      description: 'Review and summarize documents for a single matter',
      icon: FileText,
      estimatedTime: '~3 min',
      complexity: 'low',
      prompt: 'Review and analyze all documents in the current matter. Create a summary of each document, identify key terms and dates, flag any potential issues or missing documents, and generate a matter document index.',
      tags: ['documents', 'analysis', 'review'],
      extended: false
    },
    {
      id: 'client-communication',
      name: 'Client Update Prep',
      description: 'Prepare client status updates and communication drafts',
      icon: Users,
      estimatedTime: '~3 min',
      complexity: 'low',
      prompt: 'Prepare client communication materials: summarize recent activity on all active matters, draft status update emails, identify matters that need client contact, and create a client call preparation sheet.',
      tags: ['clients', 'communication', 'emails'],
      extended: false
    },
    {
      id: 'time-entry-cleanup',
      name: 'Time Entry Cleanup',
      description: 'Review and improve time entry descriptions for billing',
      icon: Clock,
      estimatedTime: '~4 min',
      complexity: 'low',
      prompt: 'Review my recent time entries from the last 7 days. Improve vague descriptions to be more detailed and billable-friendly, flag any entries that might be questioned by clients, and identify any unbilled work that should be recorded.',
      tags: ['billing', 'time', 'cleanup'],
      extended: false
    },
    {
      id: 'matter-status-check',
      name: 'Matter Status Check',
      description: 'Quick health check on all active matters',
      icon: Briefcase,
      estimatedTime: '~3 min',
      complexity: 'low',
      prompt: 'Do a quick status check on all my active matters: identify any with no activity in the past 2 weeks, list matters with upcoming deadlines in 7 days, flag any matters missing key documents, and note which clients are waiting on something from us.',
      tags: ['matters', 'status', 'health'],
      extended: false
    },
    {
      id: 'conflict-check',
      name: 'Conflict Check',
      description: 'Run conflict check for a new matter or client',
      icon: Shield,
      estimatedTime: '~3 min',
      complexity: 'medium',
      prompt: 'Run a comprehensive conflict check: search all existing clients and matters for potential conflicts with the named parties. Check opposing parties, related entities, and any previously adverse parties. Generate a conflict report with findings.',
      tags: ['conflicts', 'intake', 'compliance'],
      extended: false
    },
    {
      id: 'email-draft',
      name: 'Draft Email',
      description: 'Draft a professional email for a matter',
      icon: Mail,
      estimatedTime: '~2 min',
      complexity: 'low',
      prompt: 'Draft a professional email based on the context provided. Use appropriate legal tone, be clear and concise, and include any necessary attachments or follow-up action items.',
      tags: ['email', 'communication', 'drafting'],
      extended: false
    },
    {
      id: 'invoice-prep',
      name: 'Invoice Preparation',
      description: 'Prepare matters for invoicing with summaries',
      icon: DollarSign,
      estimatedTime: '~5 min',
      complexity: 'medium',
      prompt: 'Identify all matters with unbilled time ready for invoicing. For each matter, summarize the work performed, calculate the total amount, flag any time entries that need review before billing, and draft invoice cover letters.',
      tags: ['billing', 'invoices', 'financial'],
      extended: false
    },
    // Extended Tasks (15-30 min) - Perfect for background work while you handle other things
    {
      id: 'full-matter-audit',
      name: '🚀 Full Matter Audit',
      description: 'Deep analysis of all matters: documents, deadlines, billing, and action items',
      icon: Briefcase,
      estimatedTime: '~20-30 min',
      complexity: 'extended',
      prompt: `EXTENDED TASK - Take your time and be thorough:

1. MATTER REVIEW (all active matters):
   - List each matter with status, key dates, and recent activity
   - Identify matters needing immediate attention
   - Flag any matters with stale activity (no updates in 30+ days)

2. DEADLINE AUDIT:
   - Check all upcoming deadlines in next 90 days
   - Verify statute of limitations for each matter
   - Identify any missing critical dates
   - Create prioritized deadline calendar

3. DOCUMENT ANALYSIS:
   - Review documents across all matters
   - Identify missing documents by matter type
   - Flag documents needing attention
   - Create document index per matter

4. BILLING STATUS:
   - Unbilled time per matter
   - Time entries needing better descriptions
   - Matters ready for invoicing
   - WIP aging analysis

5. ACTION ITEMS:
   - Generate specific action items per matter
   - Prioritize by urgency and importance
   - Assign recommended due dates

Take up to 30 minutes. Be thorough. This is a comprehensive audit.`,
      tags: ['audit', 'matters', 'comprehensive'],
      extended: true
    },
    {
      id: 'monthly-billing-review',
      name: '🚀 Monthly Billing Deep Dive',
      description: 'Comprehensive billing review with time optimization and invoice prep',
      icon: DollarSign,
      estimatedTime: '~15-20 min',
      complexity: 'extended',
      prompt: `EXTENDED BILLING TASK - Comprehensive monthly review:

1. TIME ENTRY ANALYSIS:
   - Review ALL time entries from the past 30 days
   - Identify entries with poor descriptions - suggest improvements
   - Flag entries that may need to be written off
   - Check for unbilled time that should be billed

2. INVOICE PREPARATION:
   - Identify matters ready for invoicing
   - Calculate unbilled amounts per client
   - Draft invoice summaries
   - Recommend billing approach (monthly, milestone, etc.)

3. BILLING EFFICIENCY:
   - Analyze time by matter type
   - Identify most profitable practice areas
   - Suggest billing rate optimizations
   - Find potential write-off patterns

4. CLIENT BILLING HEALTH:
   - Aging receivables analysis
   - Clients with outstanding balances
   - Payment pattern analysis
   - Collection recommendations

5. FINAL REPORT:
   - Executive summary of billing status
   - Key metrics and trends
   - Recommended actions
   - Priority items for follow-up

Take 15-20 minutes. Be thorough with billing analysis.`,
      tags: ['billing', 'invoices', 'time', 'financial'],
      extended: true
    },
    {
      id: 'litigation-prep',
      name: '🚀 Litigation Case Prep',
      description: 'Full case analysis: facts, issues, research, strategy, and timeline',
      icon: Scale,
      estimatedTime: '~25-30 min',
      complexity: 'extended',
      prompt: `EXTENDED LITIGATION PREP - Comprehensive case analysis:

1. CASE FACTS:
   - Compile all known facts from documents and notes
   - Create chronological timeline of events
   - Identify disputed vs. undisputed facts
   - Note gaps in factual record

2. LEGAL ISSUES:
   - Identify all legal issues (claims, defenses)
   - Research applicable law and standards
   - Find relevant NY CPLR requirements
   - Note any jurisdictional considerations

3. EVIDENCE ANALYSIS:
   - Review all available evidence
   - Identify what supports/undermines each claim
   - Note evidence gaps and discovery needs
   - Categorize by admissibility concerns

4. STRENGTHS & WEAKNESSES:
   - Honest assessment of case strength
   - Key vulnerabilities to address
   - Opposing party's likely arguments
   - Risk factors

5. STRATEGY RECOMMENDATIONS:
   - Litigation vs. settlement analysis
   - Recommended approach
   - Key deadlines and milestones
   - Estimated timeline and resources needed

6. DELIVERABLES:
   - Case assessment memo
   - Litigation timeline
   - Discovery checklist
   - Strategy summary

Take up to 30 minutes. This should be thorough enough for a partner review.`,
      tags: ['litigation', 'strategy', 'legal research'],
      extended: true
    },
    {
      id: 'contract-deep-review',
      name: '🚀 Contract Deep Review',
      description: 'Thorough contract analysis with issue spotting and redline suggestions',
      icon: FileText,
      estimatedTime: '~20-25 min',
      complexity: 'extended',
      prompt: `EXTENDED CONTRACT REVIEW - Comprehensive analysis:

1. CONTRACT OVERVIEW:
   - Identify parties, term, and type of agreement
   - Key business terms summary
   - Renewal/termination provisions

2. CRITICAL CLAUSES:
   - Indemnification provisions - analyze scope and risk
   - Limitation of liability - assess adequacy
   - Insurance requirements
   - Termination rights and triggers
   - IP ownership and licensing

3. RISK ANALYSIS:
   - High-risk provisions (score each)
   - Missing protective language
   - One-sided terms favoring counterparty
   - Potential liability exposure

4. COMPLIANCE CHECK:
   - Regulatory requirements
   - Data privacy provisions (if applicable)
   - Employment law considerations
   - Industry-specific requirements

5. NEGOTIATION POINTS:
   - Must-have changes
   - Nice-to-have improvements
   - Fallback positions
   - Deal-breakers

6. DELIVERABLES:
   - Executive summary for client
   - Detailed issue list with page/section refs
   - Suggested redline language
   - Risk rating (Low/Medium/High)

Take 20-25 minutes for a thorough review.`,
      tags: ['contracts', 'review', 'transactional'],
      extended: true
    },
    {
      id: 'discovery-prep',
      name: '🚀 Discovery Package Prep',
      description: 'Prepare complete discovery requests and responses',
      icon: FileText,
      estimatedTime: '~25-30 min',
      complexity: 'extended',
      prompt: `EXTENDED DISCOVERY TASK - Complete discovery package:

1. INTERROGATORIES:
   - Draft comprehensive interrogatories (limit: 25 per NY CPLR)
   - Cover all elements of claims/defenses
   - Include contention interrogatories
   - Request identification of witnesses and documents

2. DOCUMENT REQUESTS:
   - Draft document demands covering all relevant categories
   - Include electronic discovery requests (ESI)
   - Request communications, agreements, financials
   - Cover social media and metadata

3. REQUESTS FOR ADMISSION:
   - Draft RFAs to narrow disputed facts
   - Target key legal and factual issues
   - Include authenticity requests for documents

4. DEPOSITION NOTICES:
   - Identify key witnesses for deposition
   - Draft deposition notices with document requests
   - Create deposition outline for each witness
   - Prioritize by importance to case

5. DISCOVERY RESPONSES (if responding):
   - Review opposing discovery requests
   - Draft objections where appropriate
   - Identify responsive documents
   - Prepare privilege log entries

6. DELIVERABLES:
   - Complete interrogatory set
   - Document request set
   - RFA set
   - Deposition notices and outlines
   - Timeline for discovery deadlines

Take up to 30 minutes. Make these litigation-ready.`,
      tags: ['discovery', 'litigation', 'depositions'],
      extended: true
    },
    {
      id: 'deposition-prep',
      name: '🚀 Deposition Preparation',
      description: 'Full deposition prep: outline, exhibits, and cross-examination',
      icon: Users,
      estimatedTime: '~25-30 min',
      complexity: 'extended',
      prompt: `EXTENDED DEPOSITION PREP - Complete witness preparation:

1. WITNESS BACKGROUND:
   - Review all documents mentioning witness
   - Compile prior testimony/statements
   - Research witness background
   - Identify potential bias or credibility issues

2. EXAMINATION OUTLINE:
   - Create detailed topic outline
   - Draft key questions for each topic
   - Plan impeachment questions
   - Include follow-up questions for likely answers

3. EXHIBIT PREPARATION:
   - Identify all exhibits to use
   - Create exhibit list with descriptions
   - Plan order of exhibit introduction
   - Prepare document comparison questions

4. KEY AREAS TO COVER:
   - Establish foundation facts
   - Lock in favorable testimony
   - Explore weaknesses in opposing case
   - Preserve testimony for trial/summary judgment

5. POTENTIAL PROBLEMS:
   - Anticipate objections
   - Identify sensitive topics
   - Plan for evasive answers
   - Prepare redirect areas (if defending)

6. DELIVERABLES:
   - Detailed deposition outline
   - Exhibit list and binder index
   - Key questions cheat sheet
   - Impeachment document references

Take up to 30 minutes. This should be ready for tomorrow's deposition.`,
      tags: ['deposition', 'litigation', 'witness'],
      extended: true
    },
    {
      id: 'motion-practice',
      name: '🚀 Motion Drafting',
      description: 'Draft motion with memorandum of law and supporting documents',
      icon: Scale,
      estimatedTime: '~25-30 min',
      complexity: 'extended',
      prompt: `EXTENDED MOTION TASK - Complete motion package:

1. MOTION TYPE ANALYSIS:
   - Identify appropriate motion type
   - Review procedural requirements (NY CPLR)
   - Check timing and deadline requirements
   - Verify proper court and venue

2. LEGAL RESEARCH:
   - Research applicable legal standards
   - Find controlling precedent
   - Identify favorable case law
   - Distinguish unfavorable cases

3. MEMORANDUM OF LAW:
   - Statement of facts
   - Procedural history
   - Legal argument with headings
   - Analysis of elements/factors
   - Application to facts
   - Conclusion and relief requested

4. SUPPORTING DOCUMENTS:
   - Draft attorney affirmation
   - Identify necessary exhibits
   - Prepare proposed order
   - Create exhibit list

5. OPPOSITION ANTICIPATION:
   - Predict opposing arguments
   - Prepare counter-arguments
   - Address weaknesses proactively

6. DELIVERABLES:
   - Notice of motion
   - Memorandum of law
   - Attorney affirmation
   - Proposed order
   - Exhibit list

Take up to 30 minutes. Make this filing-ready.`,
      tags: ['motion', 'litigation', 'legal writing'],
      extended: true
    },
    {
      id: 'client-intake',
      name: '🚀 New Client Intake & Evaluation',
      description: 'Complete new client setup: conflicts, engagement, and case evaluation',
      icon: UserPlus,
      estimatedTime: '~20-25 min',
      complexity: 'extended',
      prompt: `EXTENDED INTAKE TASK - Complete new client onboarding:

1. CONFLICT CHECK:
   - Search all parties against existing clients
   - Check adverse parties
   - Review related entities and individuals
   - Document conflict analysis

2. CASE EVALUATION:
   - Analyze facts and legal issues
   - Assess liability and damages
   - Evaluate statute of limitations
   - Estimate case value range

3. ENGAGEMENT SETUP:
   - Determine fee arrangement (hourly, contingency, flat)
   - Calculate retainer amount
   - Draft engagement letter
   - Identify scope limitations

4. MATTER CREATION:
   - Set up matter with all fields
   - Create initial task list
   - Set key deadlines
   - Assign team members

5. INITIAL DOCUMENTS:
   - Request list for client
   - Authorization forms needed
   - Preservation letters to draft
   - Initial correspondence

6. DELIVERABLES:
   - Conflict check memo
   - Case evaluation summary
   - Draft engagement letter
   - Initial task checklist
   - Document request list

Take 20-25 minutes. Get this client properly onboarded.`,
      tags: ['intake', 'new client', 'conflicts'],
      extended: true
    },
    {
      id: 'due-diligence',
      name: '🚀 Due Diligence Review',
      description: 'Corporate transaction due diligence checklist and analysis',
      icon: Search,
      estimatedTime: '~25-30 min',
      complexity: 'extended',
      prompt: `EXTENDED DUE DILIGENCE - Comprehensive transaction review:

1. CORPORATE DOCUMENTS:
   - Review formation documents
   - Check good standing certificates
   - Analyze organizational structure
   - Review board/shareholder minutes

2. CONTRACTS & AGREEMENTS:
   - Material contracts review
   - Assignment/change of control provisions
   - Termination rights
   - Key customer/vendor agreements

3. EMPLOYMENT MATTERS:
   - Employment agreements
   - Non-compete/NDA review
   - Benefits and compensation
   - Pending employment claims

4. INTELLECTUAL PROPERTY:
   - IP ownership verification
   - Patent/trademark status
   - License agreements
   - IP litigation or disputes

5. LITIGATION & LIABILITIES:
   - Pending/threatened litigation
   - Regulatory matters
   - Environmental issues
   - Tax liabilities

6. FINANCIAL REVIEW:
   - Financial statement analysis
   - Debt obligations
   - Accounts receivable aging
   - Material contingencies

7. DELIVERABLES:
   - Due diligence checklist (completed)
   - Issue summary with risk ratings
   - Outstanding items list
   - Recommendation memo

Take up to 30 minutes. Flag all material issues.`,
      tags: ['due diligence', 'transactional', 'M&A'],
      extended: true
    },
    {
      id: 'real-estate-closing',
      name: '🚀 Real Estate Closing Prep',
      description: 'Complete closing checklist, title review, and document preparation',
      icon: Building2,
      estimatedTime: '~20-25 min',
      complexity: 'extended',
      prompt: `EXTENDED REAL ESTATE TASK - Closing preparation:

1. TITLE REVIEW:
   - Review title commitment/report
   - Identify all exceptions
   - Check for liens and encumbrances
   - Verify legal description

2. SURVEY REVIEW:
   - Review survey for encroachments
   - Check easements
   - Verify boundaries
   - Note any issues

3. CONTRACT COMPLIANCE:
   - Review all contract contingencies
   - Verify conditions satisfied
   - Check for outstanding items
   - Calculate prorations

4. CLOSING DOCUMENTS:
   - Prepare/review deed
   - Settlement statement review
   - Transfer tax calculations
   - Entity authorization documents

5. DUE DILIGENCE ITEMS:
   - Zoning compliance
   - Certificate of occupancy
   - Environmental concerns
   - HOA/condo documents

6. DELIVERABLES:
   - Title objection letter (if needed)
   - Closing checklist with status
   - Document preparation list
   - Closing statement review
   - Wire instructions verification

Take 20-25 minutes. Get this closing-ready.`,
      tags: ['real estate', 'closing', 'title'],
      extended: true
    },
    {
      id: 'estate-planning',
      name: '🚀 Estate Planning Package',
      description: 'Draft wills, trusts, POAs, and healthcare directives',
      icon: FileText,
      estimatedTime: '~25-30 min',
      complexity: 'extended',
      prompt: `EXTENDED ESTATE PLANNING - Complete document package:

1. CLIENT INFORMATION ANALYSIS:
   - Review family structure
   - Analyze asset inventory
   - Identify planning goals
   - Note special considerations (special needs, blended family)

2. LAST WILL AND TESTAMENT:
   - Draft will with appropriate provisions
   - Specific bequests
   - Residuary clause
   - Executor appointment
   - Guardian nominations (if minors)

3. TRUST PLANNING:
   - Revocable living trust (if appropriate)
   - Trust provisions and distributions
   - Trustee succession
   - Special needs trust provisions

4. POWER OF ATTORNEY:
   - Durable financial POA
   - Specific powers needed
   - Successor agents
   - Springing vs. immediate

5. HEALTHCARE DIRECTIVES:
   - Healthcare proxy
   - Living will / advance directive
   - HIPAA authorization
   - End-of-life wishes

6. DELIVERABLES:
   - Draft Last Will and Testament
   - Trust document (if needed)
   - Durable Power of Attorney
   - Healthcare Proxy
   - Living Will
   - Asset summary for funding

Take up to 30 minutes. Create a complete estate plan.`,
      tags: ['estate planning', 'wills', 'trusts'],
      extended: true
    },
    {
      id: 'trial-prep',
      name: '🚀 Trial Preparation',
      description: 'Complete trial prep: witness list, exhibits, and examination outlines',
      icon: Scale,
      estimatedTime: '~30 min',
      complexity: 'extended',
      prompt: `EXTENDED TRIAL PREP - Comprehensive trial preparation:

1. TRIAL NOTEBOOK:
   - Create case summary
   - Legal issues and jury instructions
   - Key facts and themes
   - Trial timeline

2. WITNESS PREPARATION:
   - Finalize witness list and order
   - Create direct examination outlines
   - Prepare cross-examination outlines
   - Identify impeachment materials

3. EXHIBIT PREPARATION:
   - Finalize exhibit list
   - Check admissibility of each exhibit
   - Create exhibit binder index
   - Prepare foundation questions

4. MOTIONS IN LIMINE:
   - Identify evidence to exclude
   - Draft motions in limine
   - Anticipate opposing motions
   - Prepare responses

5. OPENING & CLOSING:
   - Draft opening statement outline
   - Prepare closing argument themes
   - Create demonstrative exhibit list
   - Identify key jury instructions

6. LOGISTICS:
   - Courtroom technology needs
   - Witness scheduling
   - Document/exhibit organization
   - Daily trial prep checklist

7. DELIVERABLES:
   - Complete trial notebook outline
   - Witness examination outlines
   - Exhibit list with foundations
   - Motions in limine
   - Opening/closing outlines

Take the full 30 minutes. This is trial prep.`,
      tags: ['trial', 'litigation', 'courtroom'],
      extended: true
    },
    {
      id: 'settlement-negotiation',
      name: '🚀 Settlement Analysis & Strategy',
      description: 'Case valuation, demand letter, and negotiation strategy',
      icon: DollarSign,
      estimatedTime: '~20-25 min',
      complexity: 'extended',
      prompt: `EXTENDED SETTLEMENT TASK - Negotiation preparation:

1. CASE VALUATION:
   - Calculate economic damages
   - Assess non-economic damages
   - Consider punitive damages potential
   - Apply liability percentage
   - Determine settlement range

2. RISK ANALYSIS:
   - Probability of success at trial
   - Key evidence strengths/weaknesses
   - Witness credibility assessment
   - Jury appeal factors

3. DEMAND LETTER:
   - Draft comprehensive demand letter
   - Summarize facts and liability
   - Detail all damages with support
   - Set appropriate demand amount

4. NEGOTIATION STRATEGY:
   - Determine opening position
   - Identify walk-away point
   - Plan concession strategy
   - Anticipate counteroffers

5. MEDIATION PREP (if applicable):
   - Mediation statement draft
   - Confidential brief points
   - Settlement authority range
   - Creative resolution options

6. DELIVERABLES:
   - Case valuation memo
   - Settlement demand letter
   - Negotiation strategy outline
   - Authority recommendation
   - Mediation materials (if needed)

Take 20-25 minutes. Know your numbers before negotiating.`,
      tags: ['settlement', 'negotiation', 'mediation'],
      extended: true
    },
    {
      id: 'compliance-audit',
      name: '🚀 Compliance Audit',
      description: 'Review firm/client compliance with regulations and best practices',
      icon: Shield,
      estimatedTime: '~20-25 min',
      complexity: 'extended',
      prompt: `EXTENDED COMPLIANCE TASK - Comprehensive compliance review:

1. REGULATORY COMPLIANCE:
   - Identify applicable regulations
   - Review current compliance status
   - Check for recent regulatory changes
   - Note filing deadlines

2. DOCUMENT REVIEW:
   - Policy and procedure review
   - Contract compliance check
   - Required disclosures verification
   - Record retention compliance

3. RISK ASSESSMENT:
   - Identify compliance gaps
   - Assess risk levels
   - Prioritize remediation needs
   - Estimate exposure

4. TRAINING & AWARENESS:
   - Training requirements status
   - Employee certification tracking
   - Awareness program review
   - Documentation of training

5. REPORTING & MONITORING:
   - Required reports status
   - Monitoring procedures
   - Audit trail review
   - Incident tracking

6. DELIVERABLES:
   - Compliance checklist with status
   - Gap analysis report
   - Risk matrix
   - Remediation recommendations
   - Priority action items

Take 20-25 minutes. Identify all compliance issues.`,
      tags: ['compliance', 'audit', 'regulatory'],
      extended: true
    },
    // Quick Tasks (under 10 min)
    {
      id: 'deadline-audit',
      name: 'Deadline Audit',
      description: 'Check all matters for upcoming deadlines and compliance',
      icon: Calendar,
      estimatedTime: '~4 min',
      complexity: 'medium',
      prompt: 'Audit all active matters for upcoming deadlines in the next 30 days. Identify any matters missing critical deadlines, check statute of limitations dates, and create a prioritized deadline report with recommended actions.',
      tags: ['calendar', 'deadlines', 'compliance'],
      extended: false
    },
    {
      id: 'case-assessment',
      name: 'Quick Case Assessment',
      description: 'Generate case evaluation and strategy summary',
      icon: Scale,
      estimatedTime: '~6 min',
      complexity: 'high',
      prompt: 'Prepare a case assessment: analyze the facts and evidence, identify legal issues and applicable law, assess strengths and weaknesses, evaluate potential outcomes, and recommend litigation or settlement strategy.',
      tags: ['litigation', 'strategy', 'analysis'],
      extended: false
    },
    {
      id: 'letter-draft',
      name: 'Draft Legal Letter',
      description: 'Draft a professional legal letter or correspondence',
      icon: Mail,
      estimatedTime: '~5 min',
      complexity: 'medium',
      prompt: 'Draft a professional legal letter. Consider the purpose, tone, and recipient. Include proper formatting, clear language, and appropriate legal terminology. Make it ready to send.',
      tags: ['correspondence', 'drafting', 'communication'],
      extended: false
    },
    {
      id: 'research-memo',
      name: 'Quick Legal Research',
      description: 'Research a specific legal issue and summarize findings',
      icon: Search,
      estimatedTime: '~8 min',
      complexity: 'high',
      prompt: 'Research the specified legal issue. Identify applicable law, relevant cases, and provide a summary of the current legal standard. Include citations and practical implications.',
      tags: ['research', 'legal memo', 'analysis'],
      extended: false
    }
  ]
  
  // Simple task suggestions for quick input - practical everyday lawyer tasks
  const taskSuggestions = [
    'What matters need my attention this week?',
    'Summarize unbilled time and what can be invoiced',
    'Find all deadlines in the next 14 days',
    'Review my recent time entries and improve descriptions',
    'Which clients haven\'t heard from us in 30+ days?',
    'Analyze the uploaded contract for risks',
    'Prepare a case status summary for [client name]',
    'What tasks are overdue across my matters?'
  ]
  
  // Extended task suggestions (longer prompts) - for complex analysis
  const _extendedTaskSuggestions = [
    'Do a comprehensive review of ALL my matters - check deadlines, billing status, document completeness, and create action items. Take your time.',
    'Analyze all time entries from the past month, improve descriptions, flag write-offs, and prepare invoicing recommendations.',
    'Research and prepare a full litigation strategy memo for [case] including case law, procedural requirements, and timeline.',
    'Review all documents across matters and create a master index with key information extracted from each.'
  ]
  
  // State for showing templates panel
  const [showTemplates, setShowTemplates] = useState(false)
  
  // History search state
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all')
  
  // Estimated time calculation based on task complexity
  const estimateTaskTime = (goal: string): string => {
    const wordCount = goal.split(' ').length
    const hasDocuments = /document|review|analyze|summarize|contract/i.test(goal)
    const hasBilling = /bill|invoice|time entr|unbilled|WIP/i.test(goal)
    const hasResearch = /research|statute|case law|precedent|legal issue/i.test(goal)
    const hasMultiple = /all|every|each|matters|clients|comprehensive|thorough|full|complete/i.test(goal)
    const hasExtendedKeywords = /take your time|thorough|extended|30 minute|deep dive|comprehensive audit/i.test(goal)
    const hasLitigation = /litigation|strategy|deposition|discovery|trial|motion/i.test(goal)
    
    let minutes = 2 // Base time
    
    if (wordCount > 50) minutes += 5
    else if (wordCount > 30) minutes += 2
    if (hasDocuments) minutes += 3
    if (hasBilling) minutes += 4
    if (hasResearch) minutes += 5
    if (hasMultiple) minutes += 5
    if (hasLitigation) minutes += 5
    if (hasExtendedKeywords) minutes += 15
    
    if (extendedMode) {
      minutes = Math.max(minutes * 2, 20)
    }
    
    if (minutes <= 3) return '~2-3 min'
    if (minutes <= 5) return '~3-5 min'
    if (minutes <= 8) return '~5-8 min'
    if (minutes <= 15) return '~10-15 min'
    if (minutes <= 25) return '~15-25 min'
    return '~25-30 min'
  }
  
  // Filter recent tasks based on search and status
  const filteredRecentTasks = useMemo(() => {
    return recentTasks.filter(task => {
      const matchesSearch = !historySearch || 
        task.goal.toLowerCase().includes(historySearch.toLowerCase())
      const matchesStatus = historyStatusFilter === 'all' || 
        task.status === historyStatusFilter
      return matchesSearch && matchesStatus
    })
  }, [recentTasks, historySearch, historyStatusFilter])
  
  // Feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackTaskId, setFeedbackTaskId] = useState<string | null>(null)
  const [feedbackRating, setFeedbackRating] = useState<number>(0)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackCorrection, setFeedbackCorrection] = useState('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<string>>(new Set())
  
  // AI Learning state - personalized per user
  const [learnings, setLearnings] = useState<Array<{
    id: string
    type: string
    insight: string
    source?: string
    createdAt: string
    usageCount?: number
  }>>([])
  const [showLearningsPanel, setShowLearningsPanel] = useState(false)
  const [learningsLoading, setLearningsLoading] = useState(false)
  
  // User stats
  const [userStats, setUserStats] = useState<{
    totalTasks: number
    completedTasks: number
    avgRating: number
    topCategories: string[]
  } | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await backgroundApi.getBackgroundAgentStatus()
      setStatus(response)
    } catch (error) {
      setStatus({ available: false, configured: false, message: 'Background agent status unavailable' })
    }
  }, [])

  const fetchTools = useCallback(async () => {
    try {
      const response = await backgroundApi.getBackgroundAgentTools()
      setTools(response)
    } catch (error) {
      setTools(null)
    }
  }, [])

  // Track last completed task to show until user starts a new one
  const [lastCompletedTask, setLastCompletedTask] = useState<BackgroundTask | null>(null)
  
  // Use ref to track previous task ID to avoid infinite loop
  const prevTaskIdRef = useRef<string | null>(null)

  const fetchActiveTask = useCallback(async () => {
    try {
      const response = await backgroundApi.getActiveBackgroundTask()
      if (response.active && response.task) {
        setActiveTask(response.task)
        prevTaskIdRef.current = response.task.id
        // Clear last completed when a new task starts
        if (response.task.status === 'running') {
          setLastCompletedTask(null)
        }
      } else {
        // No active task - check if previous task just completed
        const prevId = prevTaskIdRef.current
        if (prevId) {
          // Task just finished - fetch its final state and save as completed
          try {
            const taskDetails = await backgroundApi.getBackgroundTask(prevId)
            if (taskDetails?.task) {
              setLastCompletedTask(taskDetails.task)
            }
          } catch {
            // Ignore errors fetching completed task
          }
          prevTaskIdRef.current = null
        }
        setActiveTask(null)
      }
    } catch (error) {
      setActiveTask(null)
    }
  }, []) // No dependencies - uses ref instead to avoid infinite loop

  const fetchRecentTasks = useCallback(async () => {
    try {
      const response = await backgroundApi.getBackgroundTasks(8)
      setRecentTasks(response.tasks || [])
      
      // Calculate user stats from tasks
      const tasks = response.tasks || []
      const completed = tasks.filter((t: BackgroundTask) => t.status === 'completed')
      setUserStats({
        totalTasks: tasks.length,
        completedTasks: completed.length,
        avgRating: 0, // Would come from API
        topCategories: []
      })
    } catch (error) {
      setRecentTasks([])
    }
  }, [])
  
  // Fetch user's learned patterns
  const fetchLearnings = useCallback(async () => {
    setLearningsLoading(true)
    try {
      const response = await backgroundApi.getLearnedPatterns(10)
      setLearnings(response.patterns || response.learnings || [])
    } catch (error) {
      // Learnings API might not exist yet - fail silently
      setLearnings([])
    } finally {
      setLearningsLoading(false)
    }
  }, [])
  
  // Fetch proactive suggestions based on user's data
  const fetchProactiveSuggestions = useCallback(async () => {
    setLoadingSuggestions(true)
    try {
      // Fetch matters and calendar to generate suggestions
      const [mattersRes, calendarRes] = await Promise.all([
        mattersApi.getAll({ view: 'my' }).catch(() => ({ matters: [] })),
        calendarApi.getEvents().catch(() => ({ events: [] }))
      ])
      
      const matters = mattersRes.matters || mattersRes || []
      const events = calendarRes.events || calendarRes || []
      const now = new Date()
      const suggestions: ProactiveSuggestion[] = []
      
      // Check for upcoming deadlines (next 7 days)
      const upcomingDeadlines = events.filter((e: any) => {
        if (!e.date && !e.startDate) return false
        const eventDate = new Date(e.date || e.startDate)
        const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return daysUntil >= 0 && daysUntil <= 7 && (e.type === 'deadline' || e.isDeadline || e.title?.toLowerCase().includes('deadline'))
      })
      
      if (upcomingDeadlines.length > 0) {
        suggestions.push({
          id: 'deadlines-upcoming',
          type: 'deadline',
          title: `${upcomingDeadlines.length} Deadline${upcomingDeadlines.length > 1 ? 's' : ''} This Week`,
          description: `You have ${upcomingDeadlines.length} deadline${upcomingDeadlines.length > 1 ? 's' : ''} coming up in the next 7 days. Review and prepare.`,
          priority: 'high',
          action: 'Review Deadlines',
          actionPrompt: 'Review all my upcoming deadlines in the next 7 days. For each deadline, tell me: the matter name, deadline date, what needs to be done, and recommend any preparation steps.'
        })
      }
      
      // Check for stale matters (no activity in 30+ days)
      const staleMatters = matters.filter((m: any) => {
        if (m.status !== 'active') return false
        const lastActivity = m.updatedAt || m.lastActivity
        if (!lastActivity) return true
        const daysSince = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
        return daysSince > 30
      })
      
      if (staleMatters.length > 0) {
        suggestions.push({
          id: 'stale-matters',
          type: 'stale',
          title: `${staleMatters.length} Matter${staleMatters.length > 1 ? 's' : ''} Need Attention`,
          description: `${staleMatters.length} active matter${staleMatters.length > 1 ? 's have' : ' has'} had no updates in over 30 days.`,
          priority: 'medium',
          action: 'Review Stale Matters',
          actionPrompt: 'Review all my matters that have had no activity in the past 30 days. For each one, tell me: the matter name, last activity date, current status, and recommend next steps.'
        })
      }
      
      // Check for unbilled time (if billing data available)
      const mattersWithUnbilledTime = matters.filter((m: any) => m.unbilledAmount && m.unbilledAmount > 0)
      if (mattersWithUnbilledTime.length > 0) {
        const totalUnbilled = mattersWithUnbilledTime.reduce((sum: number, m: any) => sum + (m.unbilledAmount || 0), 0)
        suggestions.push({
          id: 'unbilled-time',
          type: 'billing',
          title: 'Unbilled Time Available',
          description: `You have approximately $${totalUnbilled.toLocaleString()} in unbilled time across ${mattersWithUnbilledTime.length} matter${mattersWithUnbilledTime.length > 1 ? 's' : ''}.`,
          priority: 'medium',
          action: 'Review Billing',
          actionPrompt: 'Review all my matters with unbilled time. List each matter with: matter name, unbilled amount, last time entry date, and recommend which should be invoiced.'
        })
      }
      
      // Weekly audit suggestion (if it's Monday)
      if (now.getDay() === 1) { // Monday
        suggestions.push({
          id: 'weekly-audit',
          type: 'opportunity',
          title: 'Weekly Matter Audit',
          description: "It's Monday - a good time to review your matters for the week ahead.",
          priority: 'low',
          action: 'Start Audit',
          actionPrompt: 'Perform a weekly audit of all my active matters. Summarize: what needs attention this week, upcoming deadlines, and recommended priorities.'
        })
      }
      
      setSuggestions(suggestions)
    } catch (error) {
      console.error('Failed to fetch suggestions:', error)
      setSuggestions([])
    } finally {
      setLoadingSuggestions(false)
    }
  }, [])
  
  // Fetch scheduled tasks
  const fetchScheduledTasks = useCallback(async () => {
    // This would fetch from API - for now use mock data
    try {
      // const response = await backgroundApi.getScheduledTasks()
      // setScheduledTasks(response.tasks || [])
      
      // Mock scheduled tasks for demo
      setScheduledTasks([
        {
          id: 'sched-1',
          name: 'Weekly Billing Review',
          goal: 'Review all unbilled time and prepare invoicing recommendations',
          schedule: 'Every Friday at 4:00 PM',
          nextRun: getNextFriday(),
          lastRun: undefined,
          enabled: true,
          extended: true
        }
      ])
    } catch (error) {
      setScheduledTasks([])
    }
  }, [])
  
  // Helper to get next Friday
  const getNextFriday = () => {
    const now = new Date()
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7
    const nextFriday = new Date(now)
    nextFriday.setDate(now.getDate() + daysUntilFriday)
    nextFriday.setHours(16, 0, 0, 0)
    return nextFriday.toISOString()
  }
  
  // Analyze task before starting (smart preview)
  const analyzeTask = useCallback(async (goal: string) => {
    if (!goal.trim()) {
      setTaskAnalysis(null)
      return
    }
    
    setIsAnalyzing(true)
    try {
      // Smart local analysis based on keywords
      const lowerGoal = goal.toLowerCase()
      
      // Determine complexity
      let complexity: 'simple' | 'moderate' | 'complex' = 'simple'
      let estimatedSteps = 3
      const requiredTools: string[] = []
      const potentialIssues: string[] = []
      let suggestedApproach = ''
      
      // Check for complex indicators
      const complexIndicators = ['comprehensive', 'all matters', 'full audit', 'complete review', 'thorough', 'extended', 'litigation strategy', 'trial prep']
      const moderateIndicators = ['analyze', 'review', 'research', 'draft', 'summarize', 'billing', 'time entries']
      
      if (complexIndicators.some(ind => lowerGoal.includes(ind))) {
        complexity = 'complex'
        estimatedSteps = 15
      } else if (moderateIndicators.some(ind => lowerGoal.includes(ind))) {
        complexity = 'moderate'
        estimatedSteps = 8
      }
      
      // Determine required tools
      if (lowerGoal.includes('matter') || lowerGoal.includes('case')) {
        requiredTools.push('matters_search', 'matter_update')
      }
      if (lowerGoal.includes('document') || lowerGoal.includes('contract') || lowerGoal.includes('file')) {
        requiredTools.push('document_analyze', 'document_search')
      }
      if (lowerGoal.includes('bill') || lowerGoal.includes('invoice') || lowerGoal.includes('time')) {
        requiredTools.push('billing_review', 'time_entries_get')
      }
      if (lowerGoal.includes('calendar') || lowerGoal.includes('deadline') || lowerGoal.includes('schedule')) {
        requiredTools.push('calendar_events', 'deadline_check')
      }
      if (lowerGoal.includes('research') || lowerGoal.includes('case law') || lowerGoal.includes('statute')) {
        requiredTools.push('legal_research', 'case_search')
      }
      if (lowerGoal.includes('client')) {
        requiredTools.push('client_search', 'client_info')
      }
      if (lowerGoal.includes('email') || lowerGoal.includes('draft') || lowerGoal.includes('letter')) {
        requiredTools.push('email_draft', 'document_create')
      }
      
      // Potential issues
      if (lowerGoal.includes('all') && lowerGoal.includes('matter')) {
        potentialIssues.push('Processing many matters may take longer')
      }
      if (lowerGoal.includes('confidential') || lowerGoal.includes('privileged')) {
        potentialIssues.push('Contains sensitive information - handle with care')
      }
      if (complexity === 'complex' && !extendedMode) {
        potentialIssues.push('Consider enabling Extended Mode for better results')
      }
      
      // Suggested approach
      if (complexity === 'complex') {
        suggestedApproach = 'This task requires deep analysis. The agent will work methodically through multiple steps, gathering data, analyzing patterns, and generating comprehensive output.'
      } else if (complexity === 'moderate') {
        suggestedApproach = 'The agent will perform targeted analysis, focusing on the specific area requested and providing actionable insights.'
      } else {
        suggestedApproach = 'Quick task - the agent will complete this efficiently with minimal steps.'
      }
      
      setTaskAnalysis({
        complexity,
        estimatedSteps,
        requiredTools: requiredTools.length > 0 ? requiredTools : ['general_analysis'],
        potentialIssues,
        suggestedApproach
      })
    } catch (error) {
      setTaskAnalysis(null)
    } finally {
      setIsAnalyzing(false)
    }
  }, [extendedMode])
  
  // Debounced task analysis
  useEffect(() => {
    const timer = setTimeout(() => {
      if (goalInput.trim().length > 20) {
        analyzeTask(goalInput)
      } else {
        setTaskAnalysis(null)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [goalInput, analyzeTask])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      fetchStatus(), 
      fetchTools(), 
      fetchActiveTask(), 
      fetchRecentTasks(), 
      fetchLearnings(),
      fetchProactiveSuggestions(),
      fetchScheduledTasks()
    ])
    setLoading(false)
  }, [fetchStatus, fetchTools, fetchActiveTask, fetchRecentTasks, fetchLearnings, fetchProactiveSuggestions, fetchScheduledTasks])

  // Only run once on mount - not when refreshAll changes
  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle navigation state (when coming from BackgroundTaskBar)
  useEffect(() => {
    const navState = location.state as { 
      highlightTaskId?: string
      fromTaskBar?: boolean
      showSummary?: boolean 
    } | null
    
    if (navState?.highlightTaskId) {
      setHighlightedTaskId(navState.highlightTaskId)
      
      // Clear the highlight after 3 seconds
      const timer = setTimeout(() => {
        setHighlightedTaskId(null)
      }, 3000)
      
      // Scroll to active task section after a brief delay
      if (navState.fromTaskBar) {
        setTimeout(() => {
          activeTaskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
      
      // Clear navigation state to prevent re-triggering on refresh
      window.history.replaceState({}, document.title)
      
      return () => clearTimeout(timer)
    }
  }, [location.state])

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(() => {
      fetchActiveTask()
      fetchRecentTasks()
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, fetchActiveTask, fetchRecentTasks])

  // Connect to SSE stream when there's an active task with retry logic
  useEffect(() => {
    if (!activeTask?.id) {
      // No active task, disconnect
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setIsStreaming(false)
        setConnectionStatus('disconnected')
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      setReconnectAttempt(0)
      return
    }
    
    const connectToSSE = (attempt = 0) => {
      // Connect to SSE stream
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const token = localStorage.getItem('apex-access-token') || localStorage.getItem('token') || ''
      const reconnectId = attempt > 0 ? `${Date.now()}` : ''
      const url = `${apiUrl}/v1/agent-stream/${activeTask.id}?token=${token}${reconnectId ? `&reconnectId=${reconnectId}` : ''}`
      
      console.log(`[BackgroundAgent] Connecting to SSE (attempt ${attempt + 1}):`, url)
      setConnectionStatus('connecting')
      
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource
      
      eventSource.onopen = () => {
        console.log('[BackgroundAgent] SSE connected')
        setIsStreaming(true)
        setConnectionStatus('connected')
        setReconnectAttempt(0) // Reset on successful connection
      }
      
      eventSource.onerror = (e) => {
        console.log('[BackgroundAgent] SSE error', e)
        setIsStreaming(false)
        
        // Only try to reconnect if we still have an active task
        if (activeTask?.id && attempt < maxReconnectAttempts) {
          setConnectionStatus('error')
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000) // Max 30s backoff
          console.log(`[BackgroundAgent] Reconnecting in ${backoffMs}ms (attempt ${attempt + 1}/${maxReconnectAttempts})`)
          
          setReconnectAttempt(attempt + 1)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (eventSourceRef.current) {
              eventSourceRef.current.close()
            }
            connectToSSE(attempt + 1)
          }, backoffMs)
        } else {
          setConnectionStatus('disconnected')
        }
      }
      
      // Handle initial connection message
      eventSource.addEventListener('connected', (e) => {
        console.log('[BackgroundAgent] SSE connected event:', e.data)
        setIsStreaming(true)
        setConnectionStatus('connected')
        setReconnectAttempt(0)
      })
      
      // Handle history (events that happened before we connected)
      eventSource.addEventListener('history', (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.events && Array.isArray(data.events)) {
            // For reconnection, merge intelligently
            if (data.isReconnection) {
              setLiveEvents(prev => {
                const existingTimestamps = new Set(prev.map(ev => ev.timestamp))
                const newEvents = data.events.filter((ev: StreamEvent) => !existingTimestamps.has(ev.timestamp))
                return [...prev, ...newEvents].slice(-100)
              })
            } else {
              setLiveEvents(prev => [...data.events, ...prev].slice(-50))
            }
          }
        } catch (err) {
          console.error('Failed to parse history:', err)
        }
      })
      
      eventSource.addEventListener('event', (e) => {
        try {
          const event = JSON.parse(e.data) as StreamEvent
          setLiveEvents(prev => [...prev.slice(-100), event]) // Keep last 100 events
        } catch (err) {
          console.error('Failed to parse event:', err)
        }
      })
      
      eventSource.addEventListener('progress', (e) => {
        try {
          const progress = JSON.parse(e.data)
          // Update active task progress in real-time
          setActiveTask(prev => prev ? {
            ...prev,
            status: progress.status || prev.status,
            progress: {
              progressPercent: progress.progress_percent,
              currentStep: progress.current_step,
              iterations: progress.actions_count,
              totalSteps: progress.total_steps,
              completedSteps: progress.completed_steps
            }
          } : null)
        } catch (err) {
          console.error('Failed to parse progress:', err)
        }
      })
      
      // Handle task completion event for smooth transition
      eventSource.addEventListener('task_complete', (e) => {
        try {
          const data = JSON.parse(e.data)
          console.log('[BackgroundAgent] Task completed:', data)
          // Update to completed state
          setActiveTask(prev => prev ? {
            ...prev,
            status: 'completed',
            progress: {
              ...prev.progress,
              progressPercent: 100,
              currentStep: data.message || 'Completed successfully'
            },
            result: { summary: data.summary || data.message }
          } : null)
          // Store as last completed task
          setLastCompletedTask(prev => activeTask ? {
            ...activeTask,
            status: 'completed',
            progress: { ...activeTask.progress, progressPercent: 100 },
            result: { summary: data.summary || data.message }
          } : prev)
          
          // Send browser notification if enabled
          if (notificationsEnabled && activeTask) {
            notifyTask({
              id: activeTask.id,
              goal: activeTask.goal,
              status: 'completed',
              summary: data.summary || data.message
            }, () => {
              // Focus the page when notification clicked
              window.focus()
            })
          }
        } catch (err) {
          console.error('Failed to parse task_complete:', err)
        }
      })
      
      // Handle heartbeat to keep connection alive - reset any error state
      eventSource.addEventListener('heartbeat', () => {
        setConnectionStatus('connected')
        setReconnectAttempt(0)
      })
    }
    
    // Initial connection
    connectToSSE(0)
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      setIsStreaming(false)
      setConnectionStatus('disconnected')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only reconnect when task ID changes, not on every state update
  }, [activeTask?.id])

  // Auto-scroll live events
  useEffect(() => {
    if (liveEventsRef.current) {
      liveEventsRef.current.scrollTop = liveEventsRef.current.scrollHeight
    }
  }, [liveEvents])

  // Clear live events when task changes
  useEffect(() => {
    setLiveEvents([])
  }, [activeTask?.id])

  useEffect(() => {
    const stored = sessionStorage.getItem('backgroundTaskSummary')
    if (stored) {
      try {
        setSummary(JSON.parse(stored))
      } catch {
        setSummary(null)
      }
    }
  }, [location.state])

  const clearSummary = () => {
    sessionStorage.removeItem('backgroundTaskSummary')
    setSummary(null)
  }

  const handleStartTask = async () => {
    const goal = goalInput.trim()
    if (!goal || isStarting) return
    
    // Client-side validation
    if (goal.length < 10) {
      setStartError('Please provide a more detailed description (at least 10 characters)')
      return
    }
    
    setIsStarting(true)
    setStartError(null)
    setLiveEvents([]) // Clear previous events
    
    try {
      const response = await backgroundApi.startBackgroundTask(goal, { extended: extendedMode })
      const task = response?.task
      if (task?.id) {
        window.dispatchEvent(new CustomEvent('backgroundTaskStarted', {
          detail: {
            taskId: task.id,
            goal: task.goal || goal,
            isAmplifier: true,
            extended: extendedMode
          }
        }))
        
        // Add initial event to show task is starting
        setLiveEvents([{
          type: 'task_starting',
          message: '🚀 Initializing autonomous agent...',
          timestamp: new Date().toISOString(),
          color: 'green'
        }])
      }
      setGoalInput('')
      setExtendedMode(false) // Reset after starting
      setLastCompletedTask(null) // Clear any previous completed task
      await fetchActiveTask()
      await fetchRecentTasks()
    } catch (error: any) {
      // Handle specific error types
      const errorData = error?.response?.data || error
      const errorMessage = errorData?.details || errorData?.error || error?.message || 'Failed to start background task'
      const isRetryable = errorData?.retryable
      
      setStartError(isRetryable 
        ? `${errorMessage} Please try again.`
        : errorMessage
      )
    } finally {
      setIsStarting(false)
    }
  }

  const handleCancel = async () => {
    if (!activeTask || isCancelling) return
    setIsCancelling(true)
    try {
      await backgroundApi.cancelBackgroundTask(activeTask.id)
      await fetchActiveTask()
      await fetchRecentTasks()
    } finally {
      setIsCancelling(false)
    }
  }

  const handleSendFollowUp = async () => {
    const message = followUpInput.trim()
    if (!message || !activeTask || isSendingFollowUp) return
    
    setIsSendingFollowUp(true)
    setFollowUpError(null)
    
    try {
      await backgroundApi.sendBackgroundTaskFollowUp(activeTask.id, message)
      setFollowUpInput('')
      // Add to live events immediately for feedback
      setLiveEvents(prev => [...prev, {
        type: 'followup_sent',
        message: `📨 Follow-up sent: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`,
        timestamp: new Date().toISOString(),
        color: 'purple'
      }])
    } catch (error: any) {
      setFollowUpError(error?.message || 'Failed to send follow-up')
    } finally {
      setIsSendingFollowUp(false)
    }
  }

  const openFeedbackModal = (taskId: string) => {
    setFeedbackTaskId(taskId)
    setFeedbackRating(0)
    setFeedbackText('')
    setFeedbackCorrection('')
    setShowFeedbackModal(true)
  }

  const closeFeedbackModal = () => {
    setShowFeedbackModal(false)
    setFeedbackTaskId(null)
    setFeedbackRating(0)
    setFeedbackText('')
    setFeedbackCorrection('')
  }

  const handleSubmitFeedback = async () => {
    if (!feedbackTaskId || isSubmittingFeedback) return
    if (feedbackRating === 0 && !feedbackText.trim() && !feedbackCorrection.trim()) return
    
    setIsSubmittingFeedback(true)
    
    try {
      await backgroundApi.submitBackgroundTaskFeedback(feedbackTaskId, {
        rating: feedbackRating > 0 ? feedbackRating : undefined,
        feedback: feedbackText.trim() || undefined,
        correction: feedbackCorrection.trim() || undefined,
      })
      
      // Mark as submitted
      setFeedbackSubmitted(prev => new Set([...prev, feedbackTaskId]))
      closeFeedbackModal()
    } catch (error: any) {
      console.error('Failed to submit feedback:', error)
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  const taskStatus = useMemo(() => {
    if (!activeTask) return null
    const statusValue = activeTask.status
    if (statusValue === 'error' || statusValue === 'failed') return 'error'
    if (statusValue === 'cancelled') return 'cancelled'
    if (statusValue === 'completed') return 'complete'
    return 'running'
  }, [activeTask])

  const progressPercent = clampPercent(activeTask?.progress?.progressPercent, activeTask ? 5 : 0)
  const _stepLabel = activeTask?.progress?.totalSteps
    ? `Step ${Math.min(activeTask.progress?.completedSteps ?? activeTask.progress?.iterations ?? 1, activeTask.progress?.totalSteps)} of ${activeTask.progress?.totalSteps}`
    : activeTask?.progress?.iterations
      ? `Step ${activeTask.progress.iterations}`
      : 'Step 1'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>
          <Rocket size={20} />
          <div>
            <h1>Background Agent</h1>
            <p>Autonomous legal workflows powered by Amplifier</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          {/* Notification Toggle */}
          {notificationsSupported && (
            <button 
              className={clsx(styles.notifyBtn, notificationsEnabled && styles.notifyEnabled)}
              onClick={notificationsEnabled ? () => setNotificationsEnabled(false) : enableNotifications}
              title={notificationsEnabled ? 'Notifications enabled' : 'Enable notifications'}
            >
              <Bell size={16} />
              {notificationsEnabled ? 'Notify On' : 'Notify'}
            </button>
          )}
          <button className={styles.refreshBtn} onClick={refreshAll} disabled={loading}>
            {loading ? <Loader2 size={16} className={styles.spin} /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>
      </div>

      {status && !status.configured && (
        <div className={styles.configAlert}>
          <div className={styles.alertHeader}>
            <AlertCircle size={20} />
            <h3>AI Agent Not Configured</h3>
          </div>
          <p>{status.message || 'The background AI agent requires Azure OpenAI credentials to function.'}</p>
          <div className={styles.alertSteps}>
            <p>To enable the AI agent, configure these environment variables:</p>
            <ul>
              <li><code>AZURE_OPENAI_ENDPOINT</code> - Your Azure OpenAI resource URL</li>
              <li><code>AZURE_OPENAI_API_KEY</code> - Your API key</li>
              <li><code>AZURE_OPENAI_DEPLOYMENT</code> - Your deployment name (e.g., gpt-4)</li>
            </ul>
          </div>
          <p className={styles.alertHint}>Contact your administrator if you need help setting this up.</p>
        </div>
      )}

      {/* Proactive Suggestions - AI-powered insights */}
      {suggestions.length > 0 && showSuggestions && (
        <div className={styles.suggestionsCard}>
          <div className={styles.suggestionsHeader}>
            <div className={styles.suggestionsTitle}>
              <Lightbulb size={18} />
              <span>AI Insights & Suggestions</span>
              <span className={styles.suggestionsBadge}>{suggestions.length}</span>
            </div>
            <button 
              className={styles.dismissSuggestions}
              onClick={() => setShowSuggestions(false)}
            >
              <X size={14} />
            </button>
          </div>
          <div className={styles.suggestionsList}>
            {suggestions.map(suggestion => (
              <div 
                key={suggestion.id} 
                className={clsx(
                  styles.suggestionItem,
                  styles[`priority${suggestion.priority.charAt(0).toUpperCase() + suggestion.priority.slice(1)}`]
                )}
              >
                <div className={styles.suggestionIcon}>
                  {suggestion.type === 'deadline' && <Clock size={18} />}
                  {suggestion.type === 'billing' && <DollarSign size={18} />}
                  {suggestion.type === 'stale' && <Warning size={18} />}
                  {suggestion.type === 'document' && <FileText size={18} />}
                  {suggestion.type === 'opportunity' && <Sparkles size={18} />}
                </div>
                <div className={styles.suggestionContent}>
                  <div className={styles.suggestionItemTitle}>{suggestion.title}</div>
                  <div className={styles.suggestionDesc}>{suggestion.description}</div>
                </div>
                {suggestion.action && suggestion.actionPrompt && (
                  <button 
                    className={styles.suggestionAction}
                    onClick={() => {
                      setGoalInput(suggestion.actionPrompt!)
                      setExtendedMode(suggestion.priority === 'high')
                    }}
                  >
                    {suggestion.action}
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scheduled Tasks */}
      {scheduledTasks.length > 0 && (
        <div className={styles.scheduledCard}>
          <div className={styles.scheduledHeader}>
            <div className={styles.scheduledTitle}>
              <Timer size={18} />
              <span>Scheduled Tasks</span>
            </div>
            <button className={styles.addScheduleBtn} onClick={() => _setShowScheduleModal(true)}>
              <Plus size={14} />
              Add
            </button>
          </div>
          <div className={styles.scheduledList}>
            {scheduledTasks.map(task => (
              <div key={task.id} className={clsx(styles.scheduledItem, !task.enabled && styles.scheduledDisabled)}>
                <div className={styles.scheduledInfo}>
                  <div className={styles.scheduledName}>{task.name}</div>
                  <div className={styles.scheduledMeta}>
                    <Repeat size={12} />
                    <span>{task.schedule}</span>
                    <span className={styles.scheduledNext}>
                      Next: {new Date(task.nextRun).toLocaleDateString()} at {new Date(task.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <div className={styles.scheduledActions}>
                  <button 
                    className={clsx(styles.scheduledToggle, task.enabled && styles.enabled)}
                    onClick={() => {
                      setScheduledTasks(prev => prev.map(t => 
                        t.id === task.id ? { ...t, enabled: !t.enabled } : t
                      ))
                    }}
                  >
                    {task.enabled ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button 
                    className={styles.scheduledRun}
                    onClick={() => {
                      setGoalInput(task.goal)
                      setExtendedMode(task.extended)
                    }}
                  >
                    <Rocket size={14} />
                    Run Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>Start Background Task</h2>
          <div className={styles.cardHeaderRight}>
            <button 
              className={styles.templatesLibraryBtn}
              onClick={() => setShowTemplatesLibrary(true)}
            >
              <BookOpen size={14} />
              Full Library
            </button>
            <button 
              className={styles.templatesToggle}
              onClick={() => setShowTemplates(!showTemplates)}
            >
              <LayoutTemplate size={16} />
              Templates
              {showTemplates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
        
        {/* Task Templates Panel */}
        {showTemplates && (
          <div className={styles.templatesPanel}>
            {/* Extended Deep Work Templates */}
            <div className={styles.templatesPanelHeader}>
              <h3>🚀 Extended Deep Work (15-30 min)</h3>
              <p>Let the agent work autonomously on complex legal tasks while you focus on other things</p>
            </div>
            <div className={styles.templatesGrid}>
              {taskTemplates.filter(t => t.extended).map(template => {
                const IconComponent = template.icon
                return (
                  <button
                    key={template.id}
                    className={`${styles.templateCard} ${styles.extendedTemplate}`}
                    onClick={() => {
                      setGoalInput(template.prompt)
                      setExtendedMode(true)
                      setShowTemplates(false)
                    }}
                  >
                    <div className={styles.templateIcon}>
                      <IconComponent size={20} />
                    </div>
                    <div className={styles.templateContent}>
                      <div className={styles.templateName}>{template.name}</div>
                      <div className={styles.templateDesc}>{template.description}</div>
                      <div className={styles.templateMeta}>
                        <span className={styles.templateTime}>
                          <Clock size={12} />
                          {template.estimatedTime}
                        </span>
                        <span className={`${styles.templateComplexity} ${styles.extended}`}>
                          deep work
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
            
            {/* Quick Templates */}
            <div className={styles.templatesPanelHeader} style={{ marginTop: '24px' }}>
              <h3>Quick Tasks (2-10 min)</h3>
              <p>Fast workflows for common legal tasks</p>
            </div>
            <div className={styles.templatesGrid}>
              {taskTemplates.filter(t => !t.extended).map(template => {
                const IconComponent = template.icon
                return (
                  <button
                    key={template.id}
                    className={styles.templateCard}
                    onClick={() => {
                      setGoalInput(template.prompt)
                      setExtendedMode(false)
                      setShowTemplates(false)
                    }}
                  >
                    <div className={styles.templateIcon}>
                      <IconComponent size={20} />
                    </div>
                    <div className={styles.templateContent}>
                      <div className={styles.templateName}>{template.name}</div>
                      <div className={styles.templateDesc}>{template.description}</div>
                      <div className={styles.templateMeta}>
                        <span className={styles.templateTime}>
                          <Clock size={12} />
                          {template.estimatedTime}
                        </span>
                        <span className={`${styles.templateComplexity} ${styles[template.complexity]}`}>
                          {template.complexity}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        
        <div className={styles.taskForm}>
          <textarea
            className={styles.taskInput}
            placeholder="Describe the legal task you want handled..."
            value={goalInput}
            onChange={event => setGoalInput(event.target.value)}
            rows={3}
          />
          {!goalInput && (
            <div className={styles.suggestions}>
              <span className={styles.suggestionsLabel}>Quick suggestions:</span>
              <div className={styles.suggestionChips}>
                {taskSuggestions.slice(0, 3).map((suggestion, idx) => (
                  <button
                    key={idx}
                    className={styles.suggestionChip}
                    onClick={() => setGoalInput(suggestion)}
                  >
                    {suggestion.length > 50 ? suggestion.substring(0, 47) + '...' : suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Estimated Time Display */}
          {goalInput.trim() && (
            <div className={styles.estimatedTime}>
              <Clock size={14} />
              <span>Estimated completion: <strong>{estimateTaskTime(goalInput)}</strong></span>
            </div>
          )}
          
          {/* AI Task Analysis Preview */}
          {(isAnalyzing || taskAnalysis) && goalInput.trim() && (
            <div className={styles.taskAnalysisCard}>
              {isAnalyzing ? (
                <div className={styles.analyzingState}>
                  <Loader2 size={16} className={styles.spin} />
                  <span>Analyzing task...</span>
                </div>
              ) : taskAnalysis && (
                <>
                  <div className={styles.analysisHeader}>
                    <Brain size={16} />
                    <span>AI Task Analysis</span>
                    <span className={clsx(
                      styles.complexityBadge,
                      styles[`complexity${taskAnalysis.complexity.charAt(0).toUpperCase() + taskAnalysis.complexity.slice(1)}`]
                    )}>
                      {taskAnalysis.complexity}
                    </span>
                  </div>
                  
                  <div className={styles.analysisBody}>
                    <div className={styles.analysisRow}>
                      <span className={styles.analysisLabel}>Estimated Steps</span>
                      <span className={styles.analysisValue}>~{taskAnalysis.estimatedSteps} steps</span>
                    </div>
                    
                    {taskAnalysis.requiredTools.length > 0 && (
                      <div className={styles.analysisTools}>
                        <span className={styles.analysisLabel}>Tools to Use</span>
                        <div className={styles.toolTags}>
                          {taskAnalysis.requiredTools.slice(0, 4).map((tool, i) => (
                            <span key={i} className={styles.toolTag}>
                              <Wrench size={10} />
                              {tool.replace(/_/g, ' ')}
                            </span>
                          ))}
                          {taskAnalysis.requiredTools.length > 4 && (
                            <span className={styles.toolTagMore}>+{taskAnalysis.requiredTools.length - 4}</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {taskAnalysis.potentialIssues.length > 0 && (
                      <div className={styles.analysisIssues}>
                        {taskAnalysis.potentialIssues.map((issue, i) => (
                          <div key={i} className={styles.issueItem}>
                            <Warning size={12} />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className={styles.analysisApproach}>
                      <Lightbulb size={14} />
                      <span>{taskAnalysis.suggestedApproach}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          
          <div className={styles.taskOptions}>
            <button
              type="button"
              className={`${styles.extendedModeToggle} ${extendedMode ? styles.extendedModeActive : ''}`}
              onClick={() => setExtendedMode(!extendedMode)}
            >
              <Zap size={16} />
              <span className={styles.extendedModeLabel}>
                {extendedMode ? 'Extended Mode ON' : 'Extended Mode'}
              </span>
              <span className={styles.extendedModeTime}>
                {extendedMode ? 'Up to 30 min' : 'Enable for 15-30 min tasks'}
              </span>
            </button>
          </div>
          
          {extendedMode && (
            <div className={styles.extendedModeInfo}>
              <Sparkles size={14} />
              <span>
                Extended mode allows the agent to work for up to <strong>30 minutes</strong> on complex legal tasks. 
                Perfect for matter audits, billing reviews, litigation prep, and contract analysis. 
                You can close this tab - you'll be notified when done.
              </span>
            </div>
          )}
          
          <div className={styles.taskActions}>
            <button
              className={`${styles.startBtn} ${extendedMode ? styles.startBtnExtended : ''}`}
              onClick={handleStartTask}
              disabled={!goalInput.trim() || isStarting || !status?.available}
            >
              {isStarting ? <Loader2 size={16} className={styles.spin} /> : <Rocket size={16} />}
              {extendedMode ? '🚀 Start Extended Task' : 'Start Task'}
            </button>
            {!status?.available && (
              <span className={styles.taskHint}>Background agent is not available.</span>
            )}
          </div>
          {startError && (
            <div className={styles.taskError}>{startError}</div>
          )}
        </div>
      </div>

      {summary && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Latest Summary</h2>
            <button className={styles.textBtn} onClick={clearSummary}>Dismiss</button>
          </div>
          <div className={styles.summaryBlock}>
            <div className={styles.summaryGoal}>{summary.goal}</div>
            <div className={styles.summaryText}>{summary.summary || 'Summary unavailable.'}</div>
          </div>
        </div>
      )}

      <div className={styles.grid}>
        <div 
          ref={activeTaskRef}
          className={`${styles.card} ${highlightedTaskId && (activeTask?.id === highlightedTaskId || lastCompletedTask?.id === highlightedTaskId) ? styles.highlighted : ''}`}
        >
          <div className={styles.cardHeader}>
            <h2>{activeTask ? 'Active Task' : lastCompletedTask ? 'Last Completed Task' : 'Active Task'}</h2>
            {lastCompletedTask && !activeTask && (
              <button 
                className={styles.textBtn} 
                onClick={() => setLastCompletedTask(null)}
              >
                Clear
              </button>
            )}
          </div>
          {!activeTask && !lastCompletedTask && (
            <div className={styles.emptyState}>No active background task. Start one above!</div>
          )}
          {(activeTask || lastCompletedTask) && (() => {
            const displayTask = activeTask || lastCompletedTask!
            const displayStatus = activeTask ? taskStatus : (
              displayTask.status === 'completed' ? 'complete' :
              displayTask.status === 'error' || displayTask.status === 'failed' ? 'error' :
              displayTask.status === 'cancelled' ? 'cancelled' : 'complete'
            )
            const displayPercent = activeTask ? progressPercent : clampPercent(displayTask.progress?.progressPercent, 100)
            const displayStepLabel = displayTask.progress?.totalSteps
              ? `Step ${Math.min(displayTask.progress?.completedSteps ?? displayTask.progress?.iterations ?? 1, displayTask.progress?.totalSteps)} of ${displayTask.progress?.totalSteps}`
              : displayTask.progress?.iterations
                ? `Step ${displayTask.progress.iterations}`
                : 'Completed'
            
            return (
            <div className={styles.task}>
              <div className={styles.taskHeader}>
                {displayStatus === 'complete' && <CheckCircle size={18} className={styles.complete} />}
                {displayStatus === 'error' && <AlertCircle size={18} className={styles.error} />}
                {displayStatus === 'cancelled' && <StopCircle size={18} className={styles.cancelled} />}
                {displayStatus === 'running' && <Rocket size={18} className={styles.running} />}
                <div>
                  <div className={styles.taskGoal}>{displayTask.goal}</div>
                  <div className={styles.taskStep}>{displayTask.progress?.currentStep || (displayStatus === 'complete' ? 'Completed successfully' : 'Working...')}</div>
                </div>
              </div>
              <div className={styles.progressRow}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${displayPercent}%` }} />
                </div>
                <div className={styles.progressMeta}>
                  <span>{displayPercent}%</span>
                  <span>{displayStepLabel}</span>
                </div>
              </div>
              
              {/* Live Activity Feed - Shows what the agent is doing in real-time */}
              {displayStatus === 'running' && (
                <div className={styles.liveActivitySection}>
                  <div className={styles.liveActivityHeader}>
                    <Terminal size={14} />
                    <span>Live Activity</span>
                    {connectionStatus === 'connected' && (
                      <span className={styles.streamingIndicator}>● Live</span>
                    )}
                    {connectionStatus === 'connecting' && (
                      <span className={styles.connectingIndicator}>
                        <Loader2 size={12} className={styles.spin} /> Connecting...
                      </span>
                    )}
                    {connectionStatus === 'error' && reconnectAttempt > 0 && (
                      <span className={styles.reconnectingIndicator}>
                        <RefreshCw size={12} className={styles.spin} /> Reconnecting ({reconnectAttempt}/{maxReconnectAttempts})
                      </span>
                    )}
                  </div>
                  <div className={styles.liveActivityFeed} ref={liveEventsRef}>
                    {liveEvents.length === 0 && (
                      <div className={styles.thinkingIndicator}>
                        <div className={styles.thinkingDots}>
                          <span className={styles.thinkingDot}></span>
                          <span className={styles.thinkingDot}></span>
                          <span className={styles.thinkingDot}></span>
                        </div>
                        <span>Agent is analyzing and preparing actions...</span>
                      </div>
                    )}
                    {liveEvents.map((event, idx) => (
                      <div key={idx} className={styles.liveEventItem}>
                        <span className={styles.liveEventTime}>
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={styles.liveEventMessage}>{event.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Show result summary for completed tasks */}
              {displayTask.result?.summary && (
                <div className={styles.taskSummary}>
                  <div className={styles.summaryHeader}>
                    <CheckCircle size={16} className={styles.summaryIcon} />
                    <strong>Task Completed</strong>
                  </div>
                  <div className={styles.summaryContent}>{displayTask.result.summary}</div>
                  {displayTask.progress?.iterations && (
                    <div className={styles.summaryMeta}>
                      Completed in {displayTask.progress.iterations} steps
                    </div>
                  )}
                  
                  {/* AI-suggested follow-up tasks */}
                  <div className={styles.suggestedFollowUps}>
                    <div className={styles.suggestedFollowUpsHeader}>
                      <Sparkles size={14} />
                      <span>What's Next?</span>
                    </div>
                    <div className={styles.suggestedFollowUpsList}>
                      {displayTask.goal.toLowerCase().includes('audit') && (
                        <button 
                          className={styles.suggestedFollowUpItem}
                          onClick={() => setGoalInput('Based on the audit results, create a prioritized action plan for the matters needing attention')}
                        >
                          <ChevronRight size={14} />
                          Create action plan from audit
                        </button>
                      )}
                      {displayTask.goal.toLowerCase().includes('bill') && (
                        <button 
                          className={styles.suggestedFollowUpItem}
                          onClick={() => setGoalInput('Draft invoice summaries for the matters ready to bill')}
                        >
                          <ChevronRight size={14} />
                          Draft invoice summaries
                        </button>
                      )}
                      {displayTask.goal.toLowerCase().includes('research') && (
                        <button 
                          className={styles.suggestedFollowUpItem}
                          onClick={() => setGoalInput('Create a legal memo summarizing the research findings')}
                        >
                          <ChevronRight size={14} />
                          Create research memo
                        </button>
                      )}
                      <button 
                        className={styles.suggestedFollowUpItem}
                        onClick={() => setGoalInput(`Continue working on: ${displayTask.goal}`)}
                      >
                        <ChevronRight size={14} />
                        Continue this task
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {displayTask.error && (
                <div className={styles.taskError}>
                  <AlertCircle size={16} />
                  <span>{displayTask.error}</span>
                </div>
              )}
              
              {/* Follow-up Section - Send additional instructions to running agent */}
              {displayStatus === 'running' && (
                <div className={styles.followUpSection}>
                  <div className={styles.followUpHeader}>
                    <MessageCircle size={14} />
                    <span>Send Follow-up Instructions</span>
                  </div>
                  <div className={styles.followUpForm}>
                    <input
                      type="text"
                      className={styles.followUpInput}
                      placeholder="Add more context or redirect the agent..."
                      value={followUpInput}
                      onChange={e => setFollowUpInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendFollowUp()}
                      disabled={isSendingFollowUp}
                    />
                    <button
                      className={styles.followUpBtn}
                      onClick={handleSendFollowUp}
                      disabled={!followUpInput.trim() || isSendingFollowUp}
                    >
                      {isSendingFollowUp ? <Loader2 size={14} className={styles.spin} /> : <Send size={14} />}
                    </button>
                  </div>
                  {followUpError && (
                    <div className={styles.followUpError}>{followUpError}</div>
                  )}
                </div>
              )}
              
              {displayStatus === 'running' && (
                <div className={styles.taskControlButtons}>
                  <button 
                    className={clsx(styles.pauseBtn, isPaused && styles.paused)}
                    onClick={() => setIsPaused(!isPaused)}
                  >
                    {isPaused ? <Play size={14} /> : <Pause size={14} />}
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button className={styles.cancelBtn} onClick={handleCancel} disabled={isCancelling}>
                    {isCancelling ? <Loader2 size={14} className={styles.spin} /> : <StopCircle size={14} />}
                    Cancel Task
                  </button>
                </div>
              )}
              
              {/* Feedback button for completed tasks */}
              {(displayStatus === 'complete' || displayStatus === 'error') && displayTask.id && !feedbackSubmitted.has(displayTask.id) && (
                <button 
                  className={styles.feedbackBtn} 
                  onClick={() => openFeedbackModal(displayTask.id)}
                >
                  <Star size={14} />
                  Rate This Task
                </button>
              )}
              {displayTask.id && feedbackSubmitted.has(displayTask.id) && (
                <div className={styles.feedbackThanks}>
                  <ThumbsUp size={14} />
                  Thanks for your feedback!
                </div>
              )}
            </div>
            )
          })()}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Recent Tasks</h2>
            <div className={styles.cardHeaderRight}>
              {recentTasks.length > 0 && (
                <button 
                  className={styles.exportBtn}
                  onClick={() => {
                    const exportData = recentTasks.map(t => ({
                      goal: t.goal,
                      status: t.status,
                      steps: t.progress?.iterations || 0,
                      progress: t.progress?.progressPercent || 0,
                      result: t.result?.summary || ''
                    }))
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `agent-tasks-${new Date().toISOString().split('T')[0]}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  Export
                </button>
              )}
              <span className={styles.taskCount}>{recentTasks.length} tasks</span>
            </div>
          </div>
          
          {/* Quick Stats */}
          {recentTasks.length > 0 && (
            <div className={styles.quickStats}>
              <div className={styles.quickStat}>
                <span className={styles.quickStatValue}>
                  {recentTasks.filter(t => t.status === 'completed').length}
                </span>
                <span className={styles.quickStatLabel}>Completed</span>
              </div>
              <div className={styles.quickStat}>
                <span className={styles.quickStatValue}>
                  {recentTasks.filter(t => t.status === 'running').length}
                </span>
                <span className={styles.quickStatLabel}>Running</span>
              </div>
              <div className={styles.quickStat}>
                <span className={styles.quickStatValue}>
                  {Math.round(
                    recentTasks.filter(t => t.status === 'completed').length / 
                    Math.max(recentTasks.length, 1) * 100
                  )}%
                </span>
                <span className={styles.quickStatLabel}>Success Rate</span>
              </div>
            </div>
          )}
          
          {/* Search and Filter */}
          {recentTasks.length > 0 && (
            <div className={styles.historyFilters}>
              <div className={styles.historySearch}>
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
                {historySearch && (
                  <button 
                    className={styles.clearSearch}
                    onClick={() => setHistorySearch('')}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <select
                className={styles.statusFilter}
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="running">Running</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
          
          {recentTasks.length === 0 && (
            <div className={styles.emptyState}>No recent background tasks yet.</div>
          )}
          {recentTasks.length > 0 && filteredRecentTasks.length === 0 && (
            <div className={styles.emptyState}>No tasks match your search.</div>
          )}
          {filteredRecentTasks.length > 0 && (
            <div className={styles.taskList}>
              {filteredRecentTasks.map(task => (
                <div key={task.id} className={styles.taskRow}>
                  <div className={styles.taskRowMain}>
                    <div className={styles.taskStatusIcon}>
                      {task.status === 'completed' && <CheckCircle size={14} className={styles.complete} />}
                      {task.status === 'failed' && <AlertCircle size={14} className={styles.error} />}
                      {task.status === 'cancelled' && <StopCircle size={14} className={styles.cancelled} />}
                      {task.status === 'running' && <Loader2 size={14} className={styles.spin} />}
                    </div>
                    <div className={styles.taskRowContent}>
                      <div className={styles.taskGoalSmall}>{task.goal}</div>
                      <div className={styles.taskRowMeta}>
                        <span className={`${styles.taskStatusBadge} ${styles[task.status]}`}>
                          {task.status}
                        </span>
                        {task.progress?.iterations && (
                          <span className={styles.taskIterations}>
                            {task.progress.iterations} steps
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={styles.taskRowProgress}>
                    {clampPercent(task.progress?.progressPercent, 0)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent Capabilities Section - Always visible for discoverability */}
      <div className={styles.capabilitiesCard}>
        <div className={styles.capabilitiesHeader}>
          <div className={styles.capabilitiesTitle}>
            <Zap size={20} />
            <div>
              <h2>What the Agent Can Do</h2>
              <p>The background agent can autonomously perform these actions on your behalf</p>
            </div>
          </div>
        </div>
        
        <div className={styles.capabilitiesGrid}>
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><Briefcase size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Matters & Cases</h4>
              <ul>
                <li>Create and update matters</li>
                <li>Generate case assessments</li>
                <li>Identify critical deadlines</li>
                <li>Run conflict checks</li>
              </ul>
            </div>
          </div>
          
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><FileText size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Documents</h4>
              <ul>
                <li>Analyze and summarize documents</li>
                <li>Extract key terms and clauses</li>
                <li>Draft document outlines</li>
                <li>Create document indexes</li>
              </ul>
            </div>
          </div>
          
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><Clock size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Time & Billing</h4>
              <ul>
                <li>Review time entries</li>
                <li>Suggest billing descriptions</li>
                <li>Prepare invoice summaries</li>
                <li>Identify unbilled work</li>
              </ul>
            </div>
          </div>
          
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><Users size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Clients & Communication</h4>
              <ul>
                <li>Prepare client updates</li>
                <li>Draft correspondence</li>
                <li>Create intake checklists</li>
                <li>Generate status reports</li>
              </ul>
            </div>
          </div>
          
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><Calendar size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Calendar & Tasks</h4>
              <ul>
                <li>Review upcoming deadlines</li>
                <li>Create task lists</li>
                <li>Schedule reminders</li>
                <li>Audit calendar compliance</li>
              </ul>
            </div>
          </div>
          
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><Scale size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Legal Research</h4>
              <ul>
                <li>Research statute of limitations</li>
                <li>Identify relevant court rules</li>
                <li>Check NY CPLR requirements</li>
                <li>Prepare legal memos</li>
              </ul>
            </div>
          </div>
        </div>
        
        {/* Detailed Tool List (Collapsible) */}
        {tools?.categories && (
          <details className={styles.toolsDetails}>
            <summary className={styles.toolsSummary}>
              <Wrench size={14} />
              <span>View All {tools.categories.reduce((acc, cat) => acc + cat.tools.length, 0)} Tools</span>
            </summary>
            <div className={styles.toolGrid}>
              {tools.categories.map(category => (
                <div key={category.name} className={styles.toolCategory}>
                  <div className={styles.toolHeader}>
                    <span>{category.name}</span>
                    <span className={styles.toolCount}>{category.tools.length}</span>
                  </div>
                  <ul>
                    {category.tools.map(toolName => (
                      <li key={toolName}>{toolName}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* AI Learning & Personalization Section */}
      <div className={styles.learningCard}>
        <div 
          className={styles.learningHeader}
          onClick={() => setShowLearningsPanel(!showLearningsPanel)}
        >
          <div className={styles.learningTitle}>
            <Brain size={20} />
            <div>
              <h2>Your Personal AI</h2>
              <p>The agent learns from your feedback and adapts to your work style</p>
            </div>
          </div>
          <div className={styles.learningStats}>
            {userStats && (
              <>
                <div className={styles.statBadge}>
                  <TrendingUp size={14} />
                  <span>{userStats.completedTasks} tasks completed</span>
                </div>
              </>
            )}
            <button className={styles.expandBtn}>
              {showLearningsPanel ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
        </div>
        
        {showLearningsPanel && (
          <div className={styles.learningContent}>
            {/* Privacy Notice */}
            <div className={styles.privacyNotice}>
              <Sparkles size={16} />
              <span>
                <strong>Your AI is private.</strong> All learnings are stored securely per-user. 
                Other users can't access your AI's personalized insights.
              </span>
            </div>
            
            {/* Learnings List */}
            <div className={styles.learningsList}>
              <div className={styles.learningsListHeader}>
                <Lightbulb size={16} />
                <h4>What I've Learned About Your Preferences</h4>
                {learningsLoading && <Loader2 size={14} className={styles.spin} />}
              </div>
              
              {learnings.length === 0 && !learningsLoading && (
                <div className={styles.noLearnings}>
                  <p>I haven't learned any preferences yet.</p>
                  <p className={styles.learningHint}>
                    Complete tasks and provide feedback to help me learn your style. 
                    I'll remember your preferences for document formatting, communication style, 
                    billing descriptions, and more.
                  </p>
                </div>
              )}
              
              {learnings.length > 0 && (
                <div className={styles.learningItems}>
                  {learnings.map((learning, idx) => (
                    <div key={learning.id || idx} className={styles.learningItem}>
                      <div className={styles.learningInsight}>
                        <span className={styles.learningType}>{learning.type}</span>
                        <span>{learning.insight}</span>
                      </div>
                      {learning.usageCount && learning.usageCount > 1 && (
                        <span className={styles.usageCount}>Used {learning.usageCount}x</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Personalization Tips */}
            <div className={styles.personalizationTips}>
              <h4>How to Personalize Your AI</h4>
              <div className={styles.tipsGrid}>
                <div className={styles.tipCard}>
                  <Star size={16} />
                  <span>Rate completed tasks to teach preferences</span>
                </div>
                <div className={styles.tipCard}>
                  <MessageCircle size={16} />
                  <span>Provide corrections when output isn't right</span>
                </div>
                <div className={styles.tipCard}>
                  <Settings size={16} />
                  <span>Set custom instructions in AI Settings</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className={styles.modalOverlay} onClick={closeFeedbackModal}>
          <div className={styles.feedbackModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Rate This Task</h3>
              <button className={styles.modalClose} onClick={closeFeedbackModal}>
                <X size={18} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {/* Star Rating */}
              <div className={styles.ratingSection}>
                <label>How did the agent perform?</label>
                <div className={styles.starRating}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      className={`${styles.starBtn} ${feedbackRating >= star ? styles.starActive : ''}`}
                      onClick={() => setFeedbackRating(star)}
                      type="button"
                    >
                      <Star size={28} fill={feedbackRating >= star ? '#f59e0b' : 'none'} />
                    </button>
                  ))}
                </div>
                <div className={styles.ratingLabel}>
                  {feedbackRating === 0 && 'Click to rate'}
                  {feedbackRating === 1 && 'Poor'}
                  {feedbackRating === 2 && 'Fair'}
                  {feedbackRating === 3 && 'Good'}
                  {feedbackRating === 4 && 'Very Good'}
                  {feedbackRating === 5 && 'Excellent'}
                </div>
              </div>

              {/* Text Feedback */}
              <div className={styles.feedbackField}>
                <label>Additional feedback (optional)</label>
                <textarea
                  className={styles.feedbackTextarea}
                  placeholder="What did you like or dislike about the result?"
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Correction Input */}
              <div className={styles.feedbackField}>
                <label>What should the agent have done differently? (optional)</label>
                <textarea
                  className={styles.feedbackTextarea}
                  placeholder="Describe how you would have preferred the task to be handled..."
                  value={feedbackCorrection}
                  onChange={e => setFeedbackCorrection(e.target.value)}
                  rows={3}
                />
                <div className={styles.feedbackHint}>
                  This helps the agent learn and improve for future tasks.
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={closeFeedbackModal}>
                Cancel
              </button>
              <button 
                className={styles.modalSubmitBtn} 
                onClick={handleSubmitFeedback}
                disabled={isSubmittingFeedback || (feedbackRating === 0 && !feedbackText.trim() && !feedbackCorrection.trim())}
              >
                {isSubmittingFeedback ? (
                  <>
                    <Loader2 size={14} className={styles.spin} />
                    Submitting...
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tool Confirmation Modal */}
      {pendingToolConfirmation && (
        <div className={styles.toolConfirmModal}>
          <div className={styles.toolConfirmContent}>
            <div className={styles.toolConfirmHeader}>
              <Warning size={24} />
              <h3>Confirm Action</h3>
            </div>
            <div className={styles.toolConfirmBody}>
              <div className={styles.toolConfirmName}>
                {pendingToolConfirmation.toolName}
              </div>
              <div className={styles.toolConfirmDesc}>
                {pendingToolConfirmation.toolDescription}
              </div>
              
              {Object.keys(pendingToolConfirmation.parameters).length > 0 && (
                <div className={styles.toolConfirmParams}>
                  <h4>Parameters</h4>
                  <pre>{JSON.stringify(pendingToolConfirmation.parameters, null, 2)}</pre>
                </div>
              )}
              
              <div className={styles.toolConfirmImpact}>
                <Warning size={16} />
                <span>{pendingToolConfirmation.estimatedImpact}</span>
              </div>
            </div>
            <div className={styles.toolConfirmActions}>
              <button 
                className={styles.toolConfirmCancel}
                onClick={() => {
                  setPendingToolConfirmation(null)
                  setToolConfirmationCallback(null)
                }}
              >
                Cancel
              </button>
              <button 
                className={styles.toolConfirmApprove}
                onClick={() => {
                  if (toolConfirmationCallback) {
                    toolConfirmationCallback()
                  }
                  setPendingToolConfirmation(null)
                  setToolConfirmationCallback(null)
                }}
              >
                <Check size={16} />
                Approve & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Task Templates Library Modal */}
      {showTemplatesLibrary && (
        <TaskTemplatesLibrary
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplatesLibrary(false)}
        />
      )}
    </div>
  )
}
