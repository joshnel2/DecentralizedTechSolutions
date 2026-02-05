/**
 * Task Templates Library
 * Curated collection of legal task templates for the background agent
 */

import { useState, useMemo } from 'react'
import { 
  Search, X, Briefcase, FileText, Clock, DollarSign, Users, 
  Calendar, Scale, Building2, Mail, Sparkles, Zap, Star,
  Filter, ChevronRight, BookOpen, Rocket
} from 'lucide-react'
import { clsx } from 'clsx'
import styles from './TaskTemplatesLibrary.module.css'

export interface TaskTemplate {
  id: string
  name: string
  description: string
  prompt: string
  category: string
  icon: any
  estimatedTime: string
  complexity: 'quick' | 'standard' | 'extended'
  tags: string[]
  popular?: boolean
  new?: boolean
}

// Comprehensive task template library
export const TASK_TEMPLATES: TaskTemplate[] = [
  // Matter Management
  {
    id: 'matter-audit',
    name: 'Full Matter Audit',
    description: 'Comprehensive review of all active matters with status report and action items',
    prompt: `Perform a comprehensive audit of ALL my active matters. For each matter:

1. Review current status and recent activity
2. Check for upcoming deadlines (next 30 days)
3. Identify any issues or concerns
4. Review billing status (unbilled time, outstanding invoices)
5. Check document completeness

Deliverables:
- Matter-by-matter status summary
- Prioritized action item list
- Deadline calendar
- Risk assessment

Take your time to be thorough.`,
    category: 'matters',
    icon: Briefcase,
    estimatedTime: '~20-30 min',
    complexity: 'extended',
    tags: ['matters', 'audit', 'status', 'comprehensive'],
    popular: true
  },
  {
    id: 'matter-intake',
    name: 'New Matter Intake Checklist',
    description: 'Generate intake checklist for a new client matter',
    prompt: 'Create a comprehensive intake checklist for a new matter. Include conflict check items, required documents, initial tasks, fee agreement requirements, and client communication templates.',
    category: 'matters',
    icon: Briefcase,
    estimatedTime: '~5 min',
    complexity: 'standard',
    tags: ['matters', 'intake', 'checklist', 'new client']
  },
  {
    id: 'conflict-check',
    name: 'Conflict Check Analysis',
    description: 'Run conflict check against existing clients and matters',
    prompt: 'Perform a conflict of interest check for [CLIENT NAME]. Search all existing clients, matters, and adverse parties. Flag any potential conflicts and explain the nature of each.',
    category: 'matters',
    icon: Scale,
    estimatedTime: '~5-8 min',
    complexity: 'standard',
    tags: ['conflicts', 'ethics', 'intake']
  },

  // Billing & Time
  {
    id: 'billing-review',
    name: 'Weekly Billing Review',
    description: 'Review time entries, identify unbilled work, prepare invoicing recommendations',
    prompt: `Complete weekly billing review:

1. Review all time entries from the past week
2. Improve narrative descriptions for billing clarity
3. Flag any entries that need attention or write-offs
4. Identify unbilled time by matter
5. Recommend matters ready for invoicing
6. Calculate estimated invoice amounts

Generate a billing-ready report.`,
    category: 'billing',
    icon: DollarSign,
    estimatedTime: '~15-20 min',
    complexity: 'extended',
    tags: ['billing', 'time entries', 'invoicing', 'weekly'],
    popular: true
  },
  {
    id: 'invoice-drafts',
    name: 'Draft Invoice Summaries',
    description: 'Create professional invoice summaries for client billing',
    prompt: 'Review unbilled time entries and draft professional invoice summaries for each matter ready for billing. Include executive summary, work performed, and value delivered.',
    category: 'billing',
    icon: DollarSign,
    estimatedTime: '~10 min',
    complexity: 'standard',
    tags: ['invoicing', 'billing', 'summaries']
  },
  {
    id: 'wip-analysis',
    name: 'WIP Analysis Report',
    description: 'Analyze work-in-progress across all matters',
    prompt: 'Generate a Work-in-Progress (WIP) analysis report. Show unbilled time and costs by matter, attorney, and practice area. Identify aged WIP and recommend billing priorities.',
    category: 'billing',
    icon: Clock,
    estimatedTime: '~10-15 min',
    complexity: 'extended',
    tags: ['WIP', 'billing', 'analysis', 'aging']
  },

  // Document Work
  {
    id: 'contract-review',
    name: 'Contract Review & Risk Analysis',
    description: 'Analyze contract for key terms, risks, and negotiation points',
    prompt: `Review the attached contract and provide:

1. Executive Summary (2-3 sentences)
2. Key Terms Analysis:
   - Payment terms
   - Termination provisions
   - Liability and indemnification
   - IP ownership
   - Confidentiality
3. Risk Assessment (High/Medium/Low for each area)
4. Recommended negotiation points
5. Missing or unusual clauses to address

Be thorough and attorney-ready.`,
    category: 'documents',
    icon: FileText,
    estimatedTime: '~15-25 min',
    complexity: 'extended',
    tags: ['contracts', 'review', 'risk', 'analysis'],
    popular: true
  },
  {
    id: 'doc-summary',
    name: 'Document Summary',
    description: 'Summarize key points from any document',
    prompt: 'Analyze the attached document and provide a comprehensive summary including: main purpose, key parties, important dates, obligations, and notable provisions.',
    category: 'documents',
    icon: FileText,
    estimatedTime: '~5-8 min',
    complexity: 'standard',
    tags: ['documents', 'summary', 'analysis']
  },
  {
    id: 'discovery-index',
    name: 'Discovery Document Index',
    description: 'Create organized index of discovery documents',
    prompt: 'Create a comprehensive index of discovery documents for [MATTER]. Categorize by document type, author, date, and relevance. Flag key documents and hot documents.',
    category: 'documents',
    icon: FileText,
    estimatedTime: '~20-30 min',
    complexity: 'extended',
    tags: ['discovery', 'litigation', 'index', 'documents']
  },

  // Legal Research
  {
    id: 'legal-research',
    name: 'Legal Research Memo',
    description: 'Research a legal issue and draft findings memo',
    prompt: `Research the following legal issue and provide:

1. Issue Statement
2. Brief Answer
3. Facts (as provided)
4. Analysis:
   - Applicable law and statutes
   - Relevant case law
   - Application to facts
5. Conclusion
6. Recommendations

Include citations. Focus on [JURISDICTION] law.`,
    category: 'research',
    icon: BookOpen,
    estimatedTime: '~20-30 min',
    complexity: 'extended',
    tags: ['research', 'legal memo', 'analysis'],
    popular: true
  },
  {
    id: 'case-law-search',
    name: 'Case Law Search',
    description: 'Find relevant cases on a specific legal issue',
    prompt: 'Search for relevant case law on [LEGAL ISSUE]. Provide case names, citations, brief holdings, and relevance to our matter. Focus on recent decisions from [JURISDICTION].',
    category: 'research',
    icon: Search,
    estimatedTime: '~10-15 min',
    complexity: 'standard',
    tags: ['research', 'case law', 'search']
  },

  // Client Communication
  {
    id: 'client-update',
    name: 'Client Status Update',
    description: 'Draft professional client update email',
    prompt: 'Draft a professional client status update email for [MATTER]. Include: current status, recent developments, next steps, upcoming deadlines, and any required client action. Use clear, non-legal language.',
    category: 'communication',
    icon: Mail,
    estimatedTime: '~5 min',
    complexity: 'quick',
    tags: ['email', 'client', 'update', 'communication'],
    popular: true
  },
  {
    id: 'demand-letter',
    name: 'Demand Letter Draft',
    description: 'Draft professional demand letter',
    prompt: 'Draft a professional demand letter for [MATTER]. Include: factual background, legal basis for claim, specific demands, deadline for response, and consequences of non-compliance. Maintain firm but professional tone.',
    category: 'communication',
    icon: Mail,
    estimatedTime: '~10-15 min',
    complexity: 'standard',
    tags: ['letter', 'demand', 'drafting']
  },

  // Calendar & Deadlines
  {
    id: 'deadline-review',
    name: 'Deadline Review',
    description: 'Review and verify all upcoming deadlines',
    prompt: `Review all deadlines across my matters for the next 30 days:

1. List all deadlines by date
2. Verify court filing deadlines against court rules
3. Identify any conflicts or tight timelines
4. Flag matters needing immediate attention
5. Recommend preparation timeline for each

Generate a deadline calendar summary.`,
    category: 'calendar',
    icon: Calendar,
    estimatedTime: '~10-15 min',
    complexity: 'standard',
    tags: ['deadlines', 'calendar', 'court rules'],
    popular: true
  },

  // Litigation
  {
    id: 'trial-prep',
    name: 'Trial Preparation Outline',
    description: 'Comprehensive trial preparation checklist and outline',
    prompt: `Create comprehensive trial preparation materials:

1. Trial Notebook Outline
2. Witness List with examination topics
3. Exhibit List with foundation requirements
4. Key themes and theory of the case
5. Opening statement outline
6. Closing argument themes
7. Motions in limine to file
8. Jury instruction requests

Take time to be thorough - this is for trial.`,
    category: 'litigation',
    icon: Scale,
    estimatedTime: '~25-30 min',
    complexity: 'extended',
    tags: ['trial', 'litigation', 'preparation']
  },
  {
    id: 'deposition-outline',
    name: 'Deposition Outline',
    description: 'Create deposition examination outline',
    prompt: 'Create a deposition outline for [WITNESS NAME] in [MATTER]. Include: background questions, key topic areas, document references, impeachment opportunities, and must-ask questions.',
    category: 'litigation',
    icon: Scale,
    estimatedTime: '~15-20 min',
    complexity: 'extended',
    tags: ['deposition', 'litigation', 'outline']
  },

  // Transactional
  {
    id: 'due-diligence',
    name: 'Due Diligence Checklist',
    description: 'Generate comprehensive due diligence checklist',
    prompt: 'Create a comprehensive due diligence checklist for [TRANSACTION TYPE]. Include all relevant categories: corporate documents, contracts, IP, real estate, employment, litigation, financial, regulatory, environmental.',
    category: 'transactional',
    icon: Building2,
    estimatedTime: '~10-15 min',
    complexity: 'standard',
    tags: ['due diligence', 'M&A', 'checklist', 'transactional']
  },

  // Quick Tasks
  {
    id: 'quick-summary',
    name: 'Quick Matter Summary',
    description: 'Get a quick status on any matter',
    prompt: 'Give me a quick status summary on [MATTER NAME] including: current status, last activity, upcoming deadlines, and key next steps.',
    category: 'quick',
    icon: Zap,
    estimatedTime: '~2 min',
    complexity: 'quick',
    tags: ['quick', 'summary', 'status'],
    new: true
  },
  {
    id: 'email-draft',
    name: 'Quick Email Draft',
    description: 'Draft any type of professional email',
    prompt: 'Draft a professional email to [RECIPIENT] regarding [SUBJECT]. [Add any specific points to include].',
    category: 'quick',
    icon: Mail,
    estimatedTime: '~2-3 min',
    complexity: 'quick',
    tags: ['email', 'quick', 'draft']
  }
]

// Category definitions
const CATEGORIES = [
  { id: 'all', label: 'All Templates', icon: Sparkles },
  { id: 'popular', label: 'Popular', icon: Star },
  { id: 'matters', label: 'Matters', icon: Briefcase },
  { id: 'billing', label: 'Billing & Time', icon: DollarSign },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'research', label: 'Research', icon: BookOpen },
  { id: 'communication', label: 'Communication', icon: Mail },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'litigation', label: 'Litigation', icon: Scale },
  { id: 'transactional', label: 'Transactional', icon: Building2 },
  { id: 'quick', label: 'Quick Tasks', icon: Zap }
]

interface TaskTemplatesLibraryProps {
  onSelect: (template: TaskTemplate) => void
  onClose: () => void
}

export function TaskTemplatesLibrary({ onSelect, onClose }: TaskTemplatesLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedComplexity, setSelectedComplexity] = useState<string | null>(null)

  const filteredTemplates = useMemo(() => {
    return TASK_TEMPLATES.filter(template => {
      // Search filter
      const matchesSearch = !searchQuery || 
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      
      // Category filter
      const matchesCategory = selectedCategory === 'all' || 
        (selectedCategory === 'popular' ? template.popular : template.category === selectedCategory)
      
      // Complexity filter
      const matchesComplexity = !selectedComplexity || template.complexity === selectedComplexity
      
      return matchesSearch && matchesCategory && matchesComplexity
    })
  }, [searchQuery, selectedCategory, selectedComplexity])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Rocket size={22} />
            <h2>Task Templates</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          {/* Search and Filters */}
          <div className={styles.searchBar}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className={styles.filters}>
            <div className={styles.complexityFilters}>
              {['quick', 'standard', 'extended'].map(complexity => (
                <button
                  key={complexity}
                  className={clsx(styles.complexityBtn, selectedComplexity === complexity && styles.active)}
                  onClick={() => setSelectedComplexity(selectedComplexity === complexity ? null : complexity)}
                >
                  {complexity === 'quick' && <Zap size={12} />}
                  {complexity === 'standard' && <Clock size={12} />}
                  {complexity === 'extended' && <Rocket size={12} />}
                  {complexity}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.body}>
            {/* Categories Sidebar */}
            <div className={styles.sidebar}>
              {CATEGORIES.map(category => {
                const Icon = category.icon
                const count = category.id === 'all' 
                  ? TASK_TEMPLATES.length 
                  : category.id === 'popular'
                    ? TASK_TEMPLATES.filter(t => t.popular).length
                    : TASK_TEMPLATES.filter(t => t.category === category.id).length
                
                return (
                  <button
                    key={category.id}
                    className={clsx(styles.categoryBtn, selectedCategory === category.id && styles.active)}
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    <Icon size={16} />
                    <span>{category.label}</span>
                    <span className={styles.count}>{count}</span>
                  </button>
                )
              })}
            </div>

            {/* Templates Grid */}
            <div className={styles.templates}>
              {filteredTemplates.length === 0 && (
                <div className={styles.noResults}>
                  <Search size={24} />
                  <p>No templates found</p>
                  <button onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setSelectedComplexity(null); }}>
                    Clear filters
                  </button>
                </div>
              )}
              
              {filteredTemplates.map(template => {
                const Icon = template.icon
                return (
                  <button
                    key={template.id}
                    className={styles.templateCard}
                    onClick={() => onSelect(template)}
                  >
                    <div className={styles.templateHeader}>
                      <div className={clsx(styles.templateIcon, styles[template.complexity])}>
                        <Icon size={18} />
                      </div>
                      <div className={styles.templateBadges}>
                        {template.popular && <span className={styles.popularBadge}>Popular</span>}
                        {template.new && <span className={styles.newBadge}>New</span>}
                      </div>
                    </div>
                    <div className={styles.templateName}>{template.name}</div>
                    <div className={styles.templateDesc}>{template.description}</div>
                    <div className={styles.templateMeta}>
                      <span className={clsx(styles.templateComplexity, styles[template.complexity])}>
                        {template.complexity}
                      </span>
                      <span className={styles.templateTime}>
                        <Clock size={12} />
                        {template.estimatedTime}
                      </span>
                    </div>
                    <div className={styles.templateUse}>
                      Use Template
                      <ChevronRight size={14} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
