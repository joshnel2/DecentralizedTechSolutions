import { useState } from 'react'
import { 
  Briefcase, FileText, DollarSign, Calendar, Users,
  BookOpen, Shield, Clock, Zap,
  ChevronRight, Play, TrendingUp
} from 'lucide-react'
import styles from './WorkflowModules.module.css'

interface WorkflowModule {
  id: string
  name: string
  description: string
  category: string
  estimatedMinutes: number
  complexity: 'low' | 'medium' | 'high'
  tags: string[]
  usageCount?: number
  successRate?: number
}

// Pre-defined modules matching the backend
const WORKFLOW_MODULES: WorkflowModule[] = [
  {
    id: 'matter-intake',
    name: 'New Matter Intake',
    description: 'Complete setup for a new legal matter with tasks, deadlines, and documentation',
    category: 'matters',
    estimatedMinutes: 8,
    complexity: 'medium',
    tags: ['matters', 'intake', 'tasks'],
  },
  {
    id: 'document-review',
    name: 'Document Analysis',
    description: 'Review and summarize all documents with key term extraction',
    category: 'documents',
    estimatedMinutes: 5,
    complexity: 'medium',
    tags: ['documents', 'analysis', 'review'],
  },
  {
    id: 'billing-review',
    name: 'Monthly Billing Review',
    description: 'Analyze time entries, prepare invoices, and identify billing issues',
    category: 'billing',
    estimatedMinutes: 10,
    complexity: 'high',
    tags: ['billing', 'invoices', 'time'],
  },
  {
    id: 'deadline-audit',
    name: 'Deadline Audit',
    description: 'Check all matters for upcoming deadlines and statute of limitations',
    category: 'calendar',
    estimatedMinutes: 6,
    complexity: 'medium',
    tags: ['calendar', 'deadlines', 'sol'],
  },
  {
    id: 'case-assessment',
    name: 'Case Assessment',
    description: 'Generate comprehensive case evaluation and strategy memo',
    category: 'matters',
    estimatedMinutes: 12,
    complexity: 'high',
    tags: ['litigation', 'strategy', 'memo'],
  },
  {
    id: 'client-communication',
    name: 'Client Update Prep',
    description: 'Prepare client status updates and communication drafts',
    category: 'clients',
    estimatedMinutes: 5,
    complexity: 'low',
    tags: ['clients', 'communication', 'emails'],
  },
  {
    id: 'legal-research',
    name: 'Legal Issue Research',
    description: 'Research specific legal issue with case law and statute analysis',
    category: 'research',
    estimatedMinutes: 10,
    complexity: 'high',
    tags: ['research', 'caselaw', 'memo'],
  },
  {
    id: 'discovery-prep',
    name: 'Discovery Preparation',
    description: 'Prepare for discovery with document organization and request drafting',
    category: 'documents',
    estimatedMinutes: 12,
    complexity: 'high',
    tags: ['discovery', 'litigation', 'documents'],
  },
  {
    id: 'contract-analysis',
    name: 'Contract Analysis',
    description: 'Detailed analysis of contract terms, risks, and negotiation points',
    category: 'documents',
    estimatedMinutes: 8,
    complexity: 'high',
    tags: ['contracts', 'analysis', 'negotiation'],
  },
  {
    id: 'compliance-check',
    name: 'Compliance Check',
    description: 'Verify ethical compliance including trust accounts and conflict checks',
    category: 'compliance',
    estimatedMinutes: 6,
    complexity: 'medium',
    tags: ['compliance', 'ethics', 'trust'],
  },
]

// Category icons mapping
const CATEGORY_ICONS: Record<string, typeof Briefcase> = {
  matters: Briefcase,
  documents: FileText,
  billing: DollarSign,
  calendar: Calendar,
  clients: Users,
  research: BookOpen,
  compliance: Shield,
}

// Complexity colors
const COMPLEXITY_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
}

interface WorkflowModulesProps {
  onSelectModule: (module: WorkflowModule, prompt: string) => void
  selectedCategory?: string
  compact?: boolean
}

export function WorkflowModules({
  onSelectModule,
  selectedCategory,
  compact = false
}: WorkflowModulesProps) {
  const [hoveredModule, setHoveredModule] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>(selectedCategory || 'all')
  
  // Get unique categories
  const categories = ['all', ...new Set(WORKFLOW_MODULES.map(m => m.category))]
  
  // Filter modules
  const filteredModules = filterCategory === 'all'
    ? WORKFLOW_MODULES
    : WORKFLOW_MODULES.filter(m => m.category === filterCategory)
  
  const handleSelectModule = (module: WorkflowModule) => {
    // Generate the prompt for this module
    const prompt = generateModulePrompt(module)
    onSelectModule(module, prompt)
  }
  
  const generateModulePrompt = (module: WorkflowModule): string => {
    switch (module.id) {
      case 'matter-intake':
        return 'Create a complete new matter intake workflow: set up initial tasks checklist, identify key deadlines including statute of limitations, create client communication templates, and generate a matter summary memo.'
      case 'document-review':
        return 'Review and analyze all documents in the current matter. Create a summary of each document, identify key terms and dates, flag any potential issues or missing documents, and generate a matter document index.'
      case 'billing-review':
        return 'Perform a comprehensive monthly billing review: analyze all unbilled time entries from the past month, identify entries that need descriptions improved, flag any time that might be written off, and prepare a summary of billing ready for invoicing.'
      case 'deadline-audit':
        return 'Audit all active matters for upcoming deadlines in the next 30 days. Identify any matters missing critical deadlines, check statute of limitations dates, and create a prioritized deadline report with recommended actions.'
      case 'case-assessment':
        return 'Prepare a comprehensive case assessment: analyze the facts and evidence, identify legal issues and applicable law, assess strengths and weaknesses, evaluate potential outcomes, and recommend litigation or settlement strategy.'
      case 'client-communication':
        return 'Prepare client communication materials: summarize recent activity on all active matters, draft status update emails, identify matters that need client contact, and create a client call preparation sheet.'
      case 'legal-research':
        return 'Research the specified legal issue: identify governing statutes, find leading case authority, note any recent developments, and draft a research memorandum with citations.'
      case 'discovery-prep':
        return 'Prepare for discovery phase: organize existing documents by category, identify documents likely to be requested, flag privileged documents for review, draft initial discovery requests, and create document production checklist.'
      case 'contract-analysis':
        return 'Perform detailed contract analysis: identify all parties and their obligations, extract key terms and definitions, analyze payment and pricing provisions, review termination and renewal clauses, and list recommended negotiation points.'
      case 'compliance-check':
        return 'Perform a compliance review: run conflict check against all parties, verify engagement letter is on file, check trust account compliance, and create a compliance status report.'
      default:
        return module.description
    }
  }
  
  return (
    <div className={`${styles.container} ${compact ? styles.compact : ''}`}>
      {/* Category Filter */}
      <div className={styles.categoryFilter}>
        {categories.map(category => (
          <button
            key={category}
            className={`${styles.categoryBtn} ${filterCategory === category ? styles.active : ''}`}
            onClick={() => setFilterCategory(category)}
          >
            {category === 'all' ? 'All' : category.charAt(0).toUpperCase() + category.slice(1)}
          </button>
        ))}
      </div>
      
      {/* Module Grid */}
      <div className={styles.moduleGrid}>
        {filteredModules.map(module => {
          const IconComponent = CATEGORY_ICONS[module.category] || Briefcase
          const isHovered = hoveredModule === module.id
          
          return (
            <div
              key={module.id}
              className={`${styles.moduleCard} ${isHovered ? styles.hovered : ''}`}
              onMouseEnter={() => setHoveredModule(module.id)}
              onMouseLeave={() => setHoveredModule(null)}
              onClick={() => handleSelectModule(module)}
            >
              <div className={styles.moduleHeader}>
                <div className={styles.moduleIcon}>
                  <IconComponent size={20} />
                </div>
                <div className={styles.moduleInfo}>
                  <h4 className={styles.moduleName}>{module.name}</h4>
                  <div className={styles.moduleMeta}>
                    <span className={styles.estimatedTime}>
                      <Clock size={12} />
                      ~{module.estimatedMinutes} min
                    </span>
                    <span 
                      className={styles.complexity}
                      style={{ color: COMPLEXITY_COLORS[module.complexity] }}
                    >
                      {module.complexity}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className={styles.arrow} />
              </div>
              
              <p className={styles.moduleDescription}>{module.description}</p>
              
              <div className={styles.moduleTags}>
                {module.tags.slice(0, 3).map(tag => (
                  <span key={tag} className={styles.tag}>{tag}</span>
                ))}
              </div>
              
              {/* Hover overlay with action */}
              <div className={styles.hoverOverlay}>
                <Play size={24} />
                <span>Start Workflow</span>
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Quick Stats */}
      {!compact && (
        <div className={styles.stats}>
          <div className={styles.statItem}>
            <Zap size={16} />
            <span>{WORKFLOW_MODULES.length} Workflows Available</span>
          </div>
          <div className={styles.statItem}>
            <TrendingUp size={16} />
            <span>Avg. 6 min completion time</span>
          </div>
        </div>
      )}
    </div>
  )
}
