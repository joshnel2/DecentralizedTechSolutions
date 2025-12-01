import { useMemo, useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAIChat } from '../contexts/AIChatContext'
import { invoicesApi } from '../services/api'
import { 
  Briefcase, Calendar, DollarSign, Clock, FileText,
  ChevronLeft, Sparkles, Edit2, MoreVertical, Plus,
  CheckCircle2, Scale, Building2, Brain, Loader2, 
  Copy, RefreshCw, AlertTriangle, TrendingUp,
  ListTodo, Users, Circle, Upload, Download, X
} from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { clsx } from 'clsx'
import styles from './DetailPage.module.css'

// Task interface
interface Task {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'completed'
  dueDate: string
  assignee: string
  description?: string
}

// Related contacts for matter
const relatedContacts = [
  { id: '1', name: 'Opposing Counsel', role: 'Opposing Counsel', firm: 'Baker & Associates', email: 'jbaker@bakerlaw.com' },
  { id: '2', name: 'Expert Witness', role: 'Expert Witness', firm: 'Tech Consultants Inc.', email: 'expert@techconsult.com' },
  { id: '3', name: 'Insurance Adjuster', role: 'Insurance', firm: 'ABC Insurance Co.', email: 'adjuster@abc.com' }
]

export function MatterDetailPage() {
  const { id } = useParams()
  const { 
    matters, clients, timeEntries, invoices, events, documents, 
    updateMatter, addTimeEntry, addInvoice, addEvent, addDocument,
    fetchMatters, fetchClients, fetchTimeEntries, fetchInvoices, fetchEvents, fetchDocuments 
  } = useDataStore()
  const { openChat } = useAIChat()
  const [activeTab, setActiveTab] = useState('overview')
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(false)
  
  // Modal states
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showTimeEntryModal, setShowTimeEntryModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showDocPreview, setShowDocPreview] = useState<any>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Task state - persisted in localStorage for demo
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem(`matter-tasks-${id}`)
    if (saved) return JSON.parse(saved)
    return []
  })
  
  // Save tasks to localStorage when they change
  useEffect(() => {
    localStorage.setItem(`matter-tasks-${id}`, JSON.stringify(tasks))
  }, [tasks, id])
  
  const addTask = (task: Omit<Task, 'id'>) => {
    const newTask = { ...task, id: crypto.randomUUID() }
    setTasks(prev => [...prev, newTask])
  }
  
  const toggleTaskStatus = (taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const newStatus = t.status === 'completed' ? 'pending' : 'completed'
        return { ...t, status: newStatus }
      }
      return t
    }))
  }

  // Fetch data on mount
  useEffect(() => {
    fetchMatters()
    fetchClients()
    fetchTimeEntries({ matterId: id })
    fetchInvoices()
    fetchEvents()
    fetchDocuments({ matterId: id })
  }, [id])

  const matter = useMemo(() => matters.find(m => m.id === id), [matters, id])
  const client = useMemo(() => clients.find(c => c.id === matter?.clientId), [clients, matter])
  
  const matterTimeEntries = useMemo(() => 
    timeEntries.filter(t => t.matterId === id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [timeEntries, id]
  )
  
  const matterInvoices = useMemo(() => 
    invoices.filter(i => i.matterId === id),
    [invoices, id]
  )
  
  const matterEvents = useMemo(() => 
    events.filter(e => e.matterId === id)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [events, id]
  )
  
  const matterDocuments = useMemo(() => 
    documents.filter(d => d.matterId === id),
    [documents, id]
  )

  const stats = useMemo(() => {
    const totalHours = matterTimeEntries.reduce((sum, t) => sum + t.hours, 0)
    const totalBilled = matterTimeEntries.filter(t => t.billed).reduce((sum, t) => sum + t.amount, 0)
    const totalUnbilled = matterTimeEntries.filter(t => !t.billed).reduce((sum, t) => sum + t.amount, 0)
    const invoicedAmount = matterInvoices.reduce((sum, i) => sum + i.total, 0)
    const paidAmount = matterInvoices.reduce((sum, i) => sum + i.amountPaid, 0)
    
    return { totalHours, totalBilled, totalUnbilled, invoicedAmount, paidAmount }
  }, [matterTimeEntries, matterInvoices])

  const generateAISummary = async () => {
    setAiAnalyzing(true)
    setShowAiPanel(true)
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${import.meta.env.VITE_API_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: `Analyze this specific matter thoroughly. Focus ONLY on this matter's data - do not provide generic advice. Include:
1) STATUS: Current stage, what has been completed, what remains
2) FINANCIALS: Hours billed, unbilled time, total value, collection status
3) TIMELINE: Upcoming deadlines, events, and critical dates
4) RISKS: Specific concerns based on this matter's actual data
5) NEXT STEPS: 3-5 specific, actionable tasks based on this matter's current state

Be direct and specific. Reference actual numbers, dates, and details from this matter.`,
          page: 'matter-detail',
          context: { matterId: id }
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }
      
      const data = await response.json()
      setAiSummary(data.response)
    } catch (error) {
      console.error('AI analysis error:', error)
      setAiSummary('Unable to generate AI analysis. Please check your connection and try again.')
    } finally {
      setAiAnalyzing(false)
    }
  }

  const runQuickAIAction = async (actionType: string) => {
    setAiAnalyzing(true)
    setShowAiPanel(true)
    
    const prompts: Record<string, string> = {
      'risk': `RISK ANALYSIS for this specific matter only. Based on the actual data:
- List specific risks with HIGH/MEDIUM/LOW severity
- Reference actual deadlines, missing items, or billing gaps from this matter
- Identify statute of limitations concerns if applicable
- Note any gaps in documentation or communication
- Provide 2-3 specific mitigation actions for each risk
Do NOT give generic legal advice. Only analyze what you see in this matter's data.`,
      'billing': `BILLING ANALYSIS for this specific matter only. Based on the actual data:
- Total hours logged and their value
- Unbilled time that should be invoiced
- Comparison to budget if set
- Revenue collected vs outstanding
- Specific recommendation: Should we invoice now? How much?
- Projected final value based on current trajectory
Reference actual numbers from this matter only.`,
      'deadline': `DEADLINE ANALYSIS for this specific matter only. Based on the actual data:
- List ALL upcoming events and deadlines chronologically
- Flag anything due within 7 days as URGENT
- Flag anything due within 30 days as UPCOMING
- Note any statute of limitations dates
- Identify gaps where deadlines might be missing
- Recommend specific calendar items to add
Only reference dates that exist in this matter's data.`,
      'documents': `DOCUMENT ANALYSIS for this specific matter only. Based on the actual data:
- List all documents currently on file
- For this matter type, identify what documents are typically needed
- Flag any missing critical documents
- Note documents that may need updating
- Recommend specific documents to request or create
Only analyze documents actually associated with this matter.`
    }
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${import.meta.env.VITE_API_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: prompts[actionType] || 'Analyze this matter.',
          page: 'matter-detail',
          context: { matterId: id }
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }
      
      const data = await response.json()
      setAiSummary(data.response)
    } catch (error) {
      console.error('AI action error:', error)
      setAiSummary('Unable to complete AI analysis. Please check your connection and try again.')
    } finally {
      setAiAnalyzing(false)
    }
  }

  if (!matter) {
    return (
      <div className={styles.notFound}>
        <Briefcase size={48} />
        <h2>Matter not found</h2>
        <Link to="/app/matters">Back to Matters</Link>
      </div>
    )
  }

  return (
    <div className={styles.detailPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <Link to="/app/matters" className={styles.backLink}>
            <ChevronLeft size={18} />
            Back to Matters
          </Link>
          <div className={styles.headerActions}>
            <button className={styles.aiActionBtn} onClick={openChat}>
              <Sparkles size={16} />
              AI Analysis
            </button>
            <button className={styles.iconBtn}>
              <Edit2 size={18} />
            </button>
            <button className={styles.iconBtn}>
              <MoreVertical size={18} />
            </button>
          </div>
        </div>

        <div className={styles.headerMain}>
          <div className={styles.headerIcon}>
            <Briefcase size={28} />
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.headerMeta}>
              <span className={styles.matterNumber}>{matter.number}</span>
              <span className={clsx(styles.statusBadge, styles[matter.status])}>
                {matter.status.replace(/_/g, ' ')}
              </span>
              <span className={clsx(styles.priorityBadge, styles[matter.priority])}>
                {matter.priority}
              </span>
            </div>
            <h1>{matter.name}</h1>
            <p className={styles.description}>{matter.description}</p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className={styles.quickStats}>
          <div className={styles.quickStat}>
            <Clock size={18} />
            <div>
              <span className={styles.statValue}>{stats.totalHours.toFixed(1)}</span>
              <span className={styles.statLabel}>Hours</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <DollarSign size={18} />
            <div>
              <span className={styles.statValue}>${stats.totalUnbilled.toLocaleString()}</span>
              <span className={styles.statLabel}>Unbilled</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <FileText size={18} />
            <div>
              <span className={styles.statValue}>${stats.invoicedAmount.toLocaleString()}</span>
              <span className={styles.statLabel}>Invoiced</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <CheckCircle2 size={18} />
            <div>
              <span className={styles.statValue}>${stats.paidAmount.toLocaleString()}</span>
              <span className={styles.statLabel}>Collected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {['overview', 'tasks', 'time', 'billing', 'documents', 'calendar', 'contacts'].map(tab => (
          <button
            key={tab}
            className={clsx(styles.tab, activeTab === tab && styles.active)}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'overview' && (
          <div className={styles.overviewGrid}>
            {/* AI Insights Panel - Always visible at top */}
            <div className={clsx(styles.card, styles.aiCard, styles.fullWidth)}>
              <div className={styles.aiCardHeader}>
                <div className={styles.aiCardTitle}>
                  <Brain size={20} />
                  <div>
                    <h3>AI Insights</h3>
                    <span>Powered by Azure OpenAI</span>
                  </div>
                </div>
                <div className={styles.aiCardActions}>
                  <button 
                    className={styles.aiGenerateBtn}
                    onClick={generateAISummary}
                    disabled={aiAnalyzing}
                  >
                    {aiAnalyzing ? (
                      <>
                        <Loader2 size={16} className={styles.spinner} />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate Summary
                      </>
                    )}
                  </button>
                </div>
              </div>

              {(aiSummary || matter.aiSummary) && (
                <div className={styles.aiContent}>
                  <div className={styles.aiSummaryText}>
                    {(aiSummary || matter.aiSummary || '').split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                  <div className={styles.aiSummaryActions}>
                    <button onClick={() => navigator.clipboard.writeText(aiSummary || matter.aiSummary || '')}>
                      <Copy size={14} /> Copy
                    </button>
                    <button onClick={generateAISummary}>
                      <RefreshCw size={14} /> Regenerate
                    </button>
                  </div>
                </div>
              )}

              {!aiSummary && !matter.aiSummary && !aiAnalyzing && (
                <div className={styles.aiPlaceholder}>
                  <Sparkles size={24} />
                  <p>Click "Generate Summary" to get AI-powered insights about this matter</p>
                </div>
              )}

              {/* Quick AI Actions */}
              <div className={styles.aiQuickActions}>
                <button className={styles.aiQuickBtn} onClick={() => runQuickAIAction('risk')} disabled={aiAnalyzing}>
                  <AlertTriangle size={14} />
                  Risk Check
                </button>
                <button className={styles.aiQuickBtn} onClick={() => runQuickAIAction('billing')} disabled={aiAnalyzing}>
                  <TrendingUp size={14} />
                  Billing Forecast
                </button>
                <button className={styles.aiQuickBtn} onClick={() => runQuickAIAction('deadline')} disabled={aiAnalyzing}>
                  <Calendar size={14} />
                  Deadline Analysis
                </button>
                <button className={styles.aiQuickBtn} onClick={() => runQuickAIAction('documents')} disabled={aiAnalyzing}>
                  <FileText size={14} />
                  Document Summary
                </button>
              </div>
            </div>

            {/* Matter Details */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>Matter Details</h3>
                <button className={styles.aiIconBtn} onClick={openChat} title="AI Help">
                  <Sparkles size={16} />
                </button>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Client</span>
                  <Link to={`/app/clients/${client?.id}`} className={styles.detailLink}>
                    <Building2 size={14} />
                    {client?.name}
                  </Link>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Practice Area</span>
                  <span className={styles.detailValue}>{matter.type.replace(/_/g, ' ')}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Opened</span>
                  <span className={styles.detailValue}>{format(parseISO(matter.openDate), 'MMM d, yyyy')}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Billing Type</span>
                  <span className={styles.detailValue}>
                    {matter.billingType === 'hourly' && `Hourly ($${matter.billingRate}/hr)`}
                    {matter.billingType === 'flat' && `Flat Fee ($${matter.flatFee?.toLocaleString()})`}
                    {matter.billingType === 'contingency' && `${matter.contingencyPercent}% Contingency`}
                    {matter.billingType === 'retainer' && `Retainer ($${matter.retainerAmount?.toLocaleString()})`}
                  </span>
                </div>
                {matter.budget && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Budget</span>
                    <span className={styles.detailValue}>${matter.budget.toLocaleString()}</span>
                  </div>
                )}
                {matter.statuteOfLimitations && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Statute of Limitations</span>
                    <span className={styles.detailValue}>
                      {format(parseISO(matter.statuteOfLimitations), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Court Info */}
            {matter.courtInfo && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3>
                    <Scale size={18} />
                    Court Information
                  </h3>
                  <button className={styles.aiIconBtn} onClick={openChat} title="AI Help">
                    <Sparkles size={16} />
                  </button>
                </div>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Court</span>
                    <span className={styles.detailValue}>{matter.courtInfo.courtName}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Case Number</span>
                    <span className={styles.detailValue}>{matter.courtInfo.caseNumber}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Judge</span>
                    <span className={styles.detailValue}>{matter.courtInfo.judge}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Jurisdiction</span>
                    <span className={styles.detailValue}>{matter.courtInfo.jurisdiction}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Upcoming Events */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>
                  <Calendar size={18} />
                  Upcoming Events
                </h3>
                <div className={styles.cardActions}>
                  <button className={styles.aiIconBtn} onClick={openChat} title="AI Help">
                    <Sparkles size={16} />
                  </button>
                  <button className={styles.addBtn} onClick={() => setShowEventModal(true)}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
              <div className={styles.eventsList}>
                {matterEvents.slice(0, 3).map(event => (
                  <div key={event.id} className={styles.eventItem}>
                    <div 
                      className={styles.eventDot} 
                      style={{ background: event.color }}
                    />
                    <div>
                      <span className={styles.eventTitle}>{event.title}</span>
                      <span className={styles.eventDate}>
                        {format(parseISO(event.startTime), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  </div>
                ))}
                {matterEvents.length === 0 && (
                  <p className={styles.noData}>No upcoming events</p>
                )}
              </div>
            </div>

            {/* Recent Time Entries */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>
                  <Clock size={18} />
                  Recent Time Entries
                </h3>
                <div className={styles.cardActions}>
                  <button className={styles.aiIconBtn} onClick={openChat} title="AI Help">
                    <Sparkles size={16} />
                  </button>
                  <button className={styles.addBtn} onClick={() => setShowTimeEntryModal(true)}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
              <div className={styles.timeList}>
                {matterTimeEntries.slice(0, 5).map(entry => (
                  <div key={entry.id} className={styles.timeItem}>
                    <div>
                      <span className={styles.timeDesc}>{entry.description}</span>
                      <span className={styles.timeDate}>
                        {format(parseISO(entry.date), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <div className={styles.timeHours}>
                      <span>{entry.hours}h</span>
                      <span className={styles.timeAmount}>${entry.amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                {matterTimeEntries.length === 0 && (
                  <p className={styles.noData}>No time entries</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'time' && (
          <div className={styles.timeTab}>
            <div className={styles.tabHeader}>
              <h2>Time Entries</h2>
              <div className={styles.tabActions}>
                <button className={styles.aiActionBtn} onClick={openChat}>
                  <Sparkles size={16} />
                  AI Analyze
                </button>
                <button 
                  className={styles.primaryBtn}
                  onClick={() => setShowTimeEntryModal(true)}
                >
                  <Plus size={18} />
                  New Time Entry
                </button>
              </div>
            </div>

            {/* Time Stats */}
            <div className={styles.timeStats}>
              <div className={styles.timeStat}>
                <Clock size={20} />
                <div>
                  <span className={styles.timeStatValue}>{stats.totalHours.toFixed(1)}h</span>
                  <span className={styles.timeStatLabel}>Total Hours</span>
                </div>
              </div>
              <div className={styles.timeStat}>
                <DollarSign size={20} />
                <div>
                  <span className={styles.timeStatValue}>${stats.totalUnbilled.toLocaleString()}</span>
                  <span className={styles.timeStatLabel}>Unbilled</span>
                </div>
              </div>
              <div className={styles.timeStat}>
                <CheckCircle2 size={20} />
                <div>
                  <span className={styles.timeStatValue}>${stats.totalBilled.toLocaleString()}</span>
                  <span className={styles.timeStatLabel}>Billed</span>
                </div>
              </div>
            </div>

            {matterTimeEntries.length === 0 ? (
              <div className={styles.emptyTime}>
                <Clock size={48} />
                <p>No time entries yet</p>
                <button 
                  className={styles.primaryBtn} 
                  onClick={() => setShowTimeEntryModal(true)}
                >
                  <Plus size={18} />
                  Log First Time Entry
                </button>
              </div>
            ) : (
              <div className={styles.timeEntryCards}>
                {matterTimeEntries.map(entry => (
                  <div key={entry.id} className={styles.timeEntryCard}>
                    <div className={styles.timeEntryDate}>
                      <span className={styles.timeEntryDay}>
                        {format(parseISO(entry.date), 'd')}
                      </span>
                      <span className={styles.timeEntryMonth}>
                        {format(parseISO(entry.date), 'MMM')}
                      </span>
                    </div>
                    <div className={styles.timeEntryContent}>
                      <span className={styles.timeEntryDesc}>{entry.description}</span>
                      <div className={styles.timeEntryMeta}>
                        <span>{entry.hours}h @ ${entry.rate}/hr</span>
                      </div>
                    </div>
                    <div className={styles.timeEntryRight}>
                      <span className={styles.timeEntryAmount}>${entry.amount.toLocaleString()}</span>
                      <span className={clsx(styles.badge, entry.billed ? styles.billed : styles.unbilled)}>
                        {entry.billed ? 'Billed' : 'Unbilled'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'billing' && (
          <div className={styles.billingTab}>
            <div className={styles.tabHeader}>
              <h2>Invoices</h2>
              <div className={styles.tabActions}>
                <button className={styles.aiActionBtn} onClick={openChat}>
                  <Sparkles size={16} />
                  AI Insights
                </button>
                <button 
                  className={styles.primaryBtn}
                  onClick={() => setShowInvoiceModal(true)}
                >
                  <Plus size={18} />
                  Create Invoice
                </button>
              </div>
            </div>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Issue Date</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>AI</th>
                  </tr>
                </thead>
                <tbody>
                  {matterInvoices.map(invoice => (
                    <tr key={invoice.id}>
                      <td>{invoice.number}</td>
                      <td>{format(parseISO(invoice.issueDate), 'MMM d, yyyy')}</td>
                      <td>{format(parseISO(invoice.dueDate), 'MMM d, yyyy')}</td>
                      <td>${invoice.total.toLocaleString()}</td>
                      <td>
                        <span className={clsx(styles.badge, styles[invoice.status])}>
                          {invoice.status}
                        </span>
                      </td>
                      <td>
                        <button className={styles.aiIconBtn} onClick={openChat} title="AI Help">
                          <Sparkles size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {matterInvoices.length === 0 && (
                <div className={styles.emptyTable}>No invoices yet</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className={styles.documentsTab}>
            <div className={styles.tabHeader}>
              <h2>Documents</h2>
              <div className={styles.tabActions}>
                <button className={styles.aiActionBtn} onClick={openChat}>
                  <Sparkles size={16} />
                  AI Analyze All
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setIsUploading(true)
                    try {
                      await addDocument(file, { matterId: id, clientId: matter?.clientId })
                      fetchDocuments({ matterId: id })
                    } catch (error) {
                      console.error('Upload failed:', error)
                      alert('Failed to upload document. Please try again.')
                    } finally {
                      setIsUploading(false)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }
                  }}
                />
                <button 
                  className={styles.primaryBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 size={18} className={styles.spinner} />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      Upload Document
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className={styles.docGrid}>
              {matterDocuments.map(doc => (
                <div 
                  key={doc.id} 
                  className={styles.docCard}
                  onClick={() => setShowDocPreview(doc)}
                >
                  <div className={styles.docIcon}>
                    <FileText size={24} />
                  </div>
                  <div className={styles.docInfo}>
                    <span className={styles.docName}>{doc.name}</span>
                    <span className={styles.docMeta}>
                      {format(parseISO(doc.uploadedAt), 'MMM d, yyyy')} · 
                      {(doc.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <div className={styles.docActions} onClick={e => e.stopPropagation()}>
                    <button 
                      className={styles.docDownloadBtn}
                      onClick={() => {
                        // Download document
                        if (doc.storageUrl) {
                          window.open(doc.storageUrl, '_blank')
                        }
                      }}
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                    <button className={styles.aiIconBtn} onClick={openChat} title="AI Analyze">
                      <Sparkles size={14} />
                    </button>
                  </div>
                  {doc.aiSummary && (
                    <span className={styles.docAi}>
                      <Sparkles size={12} />
                      AI Summary
                    </span>
                  )}
                </div>
              ))}
              {matterDocuments.length === 0 && (
                <div className={styles.emptyDocs}>
                  <FileText size={48} />
                  <p>No documents uploaded</p>
                  <button 
                    className={styles.primaryBtn} 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ marginTop: '1rem' }}
                  >
                    <Upload size={18} />
                    Upload First Document
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className={styles.calendarTab}>
            <div className={styles.tabHeader}>
              <h2>Events & Deadlines</h2>
              <div className={styles.tabActions}>
                <button className={styles.aiActionBtn} onClick={openChat}>
                  <Sparkles size={16} />
                  AI Schedule
                </button>
                <button 
                  className={styles.primaryBtn}
                  onClick={() => setShowEventModal(true)}
                >
                  <Plus size={18} />
                  Add Event
                </button>
              </div>
            </div>
            <div className={styles.eventCards}>
              {matterEvents.map(event => (
                <div 
                  key={event.id} 
                  className={styles.eventCard}
                  style={{ borderLeftColor: event.color }}
                >
                  <div className={styles.eventHeader}>
                    <span className={styles.eventType} style={{ color: event.color }}>
                      {event.type.replace('_', ' ')}
                    </span>
                    <div className={styles.eventCardActions}>
                      <button className={styles.aiIconBtn} onClick={openChat} title="AI Help">
                        <Sparkles size={14} />
                      </button>
                      <span className={styles.eventTime}>
                        {format(parseISO(event.startTime), 'h:mm a')}
                      </span>
                    </div>
                  </div>
                  <h4>{event.title}</h4>
                  <p>{format(parseISO(event.startTime), 'EEEE, MMMM d, yyyy')}</p>
                  {event.location && (
                    <span className={styles.eventLocation}>{event.location}</span>
                  )}
                </div>
              ))}
              {matterEvents.length === 0 && (
                <div className={styles.emptyEvents}>
                  <Calendar size={48} />
                  <p>No events scheduled</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tasks Tab - Clio Style */}
        {activeTab === 'tasks' && (
          <div className={styles.tasksTab}>
            <div className={styles.tabHeader}>
              <h2>Tasks</h2>
              <div className={styles.tabActions}>
                <button className={styles.aiActionBtn} onClick={openChat}>
                  <Sparkles size={16} />
                  AI Prioritize
                </button>
                <button className={styles.primaryBtn} onClick={() => setShowTaskModal(true)}>
                  <Plus size={18} />
                  Add Task
                </button>
              </div>
            </div>
            
            <div className={styles.tasksSummary}>
              <div className={styles.taskStat}>
                <span className={styles.taskStatValue}>{tasks.filter(t => t.status === 'completed').length}</span>
                <span className={styles.taskStatLabel}>Completed</span>
              </div>
              <div className={styles.taskStat}>
                <span className={styles.taskStatValue}>{tasks.filter(t => t.status === 'in_progress').length}</span>
                <span className={styles.taskStatLabel}>In Progress</span>
              </div>
              <div className={styles.taskStat}>
                <span className={styles.taskStatValue}>{tasks.filter(t => t.status === 'pending').length}</span>
                <span className={styles.taskStatLabel}>Pending</span>
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className={styles.emptyTasks}>
                <ListTodo size={48} />
                <p>No tasks yet</p>
                <button className={styles.primaryBtn} onClick={() => setShowTaskModal(true)}>
                  <Plus size={18} />
                  Create First Task
                </button>
              </div>
            ) : (
              <div className={styles.tasksList}>
                {tasks.map(task => (
                  <div 
                    key={task.id} 
                    className={clsx(styles.taskCard, styles[task.status])}
                  >
                    <div 
                      className={styles.taskCheckbox}
                      onClick={() => toggleTaskStatus(task.id)}
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 size={20} className={styles.taskCompleted} />
                      ) : (
                        <Circle size={20} />
                      )}
                    </div>
                    <div className={styles.taskContent}>
                      <span className={styles.taskName}>{task.name}</span>
                      <div className={styles.taskMeta}>
                        <span className={styles.taskAssignee}>
                          <Users size={12} />
                          {task.assignee}
                        </span>
                        <span className={styles.taskDue}>
                          <Calendar size={12} />
                          Due: {format(parseISO(task.dueDate), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className={styles.taskStatus}>
                      <span className={clsx(styles.taskStatusBadge, styles[task.status])}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contacts Tab - Clio Style */}
        {activeTab === 'contacts' && (
          <div className={styles.contactsTab}>
            <div className={styles.tabHeader}>
              <h2>Related Contacts</h2>
              <div className={styles.tabActions}>
                <button className={styles.aiActionBtn} onClick={openChat}>
                  <Sparkles size={16} />
                  AI Help
                </button>
                <button className={styles.primaryBtn} onClick={openChat}>
                  <Plus size={18} />
                  Add Contact
                </button>
              </div>
            </div>

            <div className={styles.contactsGrid}>
              {/* Client Info Card */}
              <div className={clsx(styles.contactCard, styles.clientCard)}>
                <div className={styles.contactCardHeader}>
                  <span className={styles.contactRole}>Client</span>
                </div>
                <div className={styles.contactInfo}>
                  <div className={styles.contactAvatar}>
                    {client?.name?.[0]}
                  </div>
                  <div>
                    <Link to={`/app/clients/${client?.id}`} className={styles.contactName}>
                      {client?.name}
                    </Link>
                    <span className={styles.contactEmail}>{client?.email}</span>
                  </div>
                </div>
                {client?.phone && (
                  <div className={styles.contactDetail}>
                    <span>Phone:</span> {client.phone}
                  </div>
                )}
                {client?.addressStreet && (
                  <div className={styles.contactDetail}>
                    <span>Address:</span> {client.addressStreet}
                  </div>
                )}
              </div>

              {/* Related Contacts */}
              {relatedContacts.map(contact => (
                <div key={contact.id} className={styles.contactCard}>
                  <div className={styles.contactCardHeader}>
                    <span className={styles.contactRole}>{contact.role}</span>
                  </div>
                  <div className={styles.contactInfo}>
                    <div className={styles.contactAvatar}>
                      {contact.name[0]}
                    </div>
                    <div>
                      <span className={styles.contactName}>{contact.name}</span>
                      <span className={styles.contactFirm}>{contact.firm}</span>
                    </div>
                  </div>
                  <div className={styles.contactDetail}>
                    <span>Email:</span> {contact.email}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Time Entry Modal */}
      {showTimeEntryModal && (
        <div className={styles.modalOverlay} onClick={() => setShowTimeEntryModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>New Time Entry</h2>
              <button onClick={() => setShowTimeEntryModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <TimeEntryForm 
              matterId={id!}
              matterName={matter?.name || ''}
              defaultRate={matter?.billingRate || 450}
              onClose={() => setShowTimeEntryModal(false)}
              onSave={async (data) => {
                try {
                  await addTimeEntry(data)
                  setShowTimeEntryModal(false)
                  fetchTimeEntries({ matterId: id })
                } catch (error) {
                  console.error('Failed to save time entry:', error)
                  alert('Failed to save time entry. Please try again.')
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <div className={styles.modalOverlay} onClick={() => setShowInvoiceModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Create Invoice</h2>
              <button onClick={() => setShowInvoiceModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <InvoiceForm 
              matterId={id!}
              clientId={matter?.clientId || ''}
              clientName={client?.name || ''}
              matterName={matter?.name || ''}
              unbilledAmount={stats.totalUnbilled}
              onClose={() => setShowInvoiceModal(false)}
              onSave={async (data) => {
                try {
                  await addInvoice(data)
                  setShowInvoiceModal(false)
                  fetchInvoices()
                } catch (error) {
                  console.error('Failed to create invoice:', error)
                  alert('Failed to create invoice. Please try again.')
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <div className={styles.modalOverlay} onClick={() => setShowEventModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Add Event</h2>
              <button onClick={() => setShowEventModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <EventForm 
              matterId={id!}
              matterName={matter?.name || ''}
              onClose={() => setShowEventModal(false)}
              onSave={async (data) => {
                try {
                  await addEvent(data)
                  setShowEventModal(false)
                  fetchEvents()
                } catch (error) {
                  console.error('Failed to create event:', error)
                  alert('Failed to create event. Please try again.')
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <div className={styles.modalOverlay} onClick={() => setShowTaskModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Add Task</h2>
              <button onClick={() => setShowTaskModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <TaskForm 
              matterName={matter?.name || ''}
              onClose={() => setShowTaskModal(false)}
              onSave={(data) => {
                addTask(data)
                setShowTaskModal(false)
              }}
            />
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {showDocPreview && (
        <div className={styles.modalOverlay} onClick={() => setShowDocPreview(null)}>
          <div className={styles.docPreviewModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{showDocPreview.name}</h2>
              <button onClick={() => setShowDocPreview(null)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.docPreviewContent}>
              <div className={styles.docPreviewInfo}>
                <div className={styles.docPreviewIcon}>
                  <FileText size={48} />
                </div>
                <div className={styles.docPreviewMeta}>
                  <h3>{showDocPreview.name}</h3>
                  <p>Uploaded: {format(parseISO(showDocPreview.uploadedAt), 'MMMM d, yyyy h:mm a')}</p>
                  <p>Size: {(showDocPreview.size / 1024 / 1024).toFixed(2)} MB</p>
                  <p>Type: {showDocPreview.type || 'Document'}</p>
                </div>
              </div>
              {showDocPreview.aiSummary && (
                <div className={styles.docPreviewSummary}>
                  <h4><Sparkles size={16} /> AI Summary</h4>
                  <p>{showDocPreview.aiSummary}</p>
                </div>
              )}
              <div className={styles.docPreviewActions}>
                <button 
                  className={styles.primaryBtn}
                  onClick={() => {
                    if (showDocPreview.storageUrl) {
                      window.open(showDocPreview.storageUrl, '_blank')
                    }
                  }}
                >
                  <Download size={18} />
                  Download
                </button>
                <button className={styles.aiActionBtn} onClick={openChat}>
                  <Sparkles size={16} />
                  Analyze with AI
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Task Form Component
function TaskForm({ matterName, onClose, onSave }: {
  matterName: string
  onClose: () => void
  onSave: (data: Omit<Task, 'id'>) => void
}) {
  const [formData, setFormData] = useState({
    name: '',
    status: 'pending' as 'pending' | 'in_progress' | 'completed',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    assignee: '',
    description: ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('Please enter a task name')
      return
    }
    if (!formData.assignee.trim()) {
      alert('Please enter an assignee')
      return
    }
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formInfo}>
        <strong>Matter:</strong> {matterName}
      </div>

      <div className={styles.formGroup}>
        <label>Task Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          placeholder="Enter task name..."
          required
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Due Date</label>
          <input
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({...formData, status: e.target.value as any})}
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Assignee *</label>
        <input
          type="text"
          value={formData.assignee}
          onChange={(e) => setFormData({...formData, assignee: e.target.value})}
          placeholder="Who is responsible for this task?"
          required
        />
      </div>

      <div className={styles.formGroup}>
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Task details..."
          rows={3}
        />
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn}>
          Create Task
        </button>
      </div>
    </form>
  )
}

// Time Entry Form Component
function TimeEntryForm({ matterId, matterName, defaultRate, onClose, onSave }: {
  matterId: string
  matterName: string
  defaultRate: number
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    matterId,
    date: format(new Date(), 'yyyy-MM-dd'),
    hours: 1,
    rate: defaultRate,
    description: '',
    billable: true
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave(formData)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formInfo}>
        <strong>Matter:</strong> {matterName}
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({...formData, date: e.target.value})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>Hours</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={formData.hours}
            onChange={(e) => setFormData({...formData, hours: parseFloat(e.target.value) || 0})}
            required
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Rate ($/hr)</label>
          <input
            type="number"
            value={formData.rate}
            onChange={(e) => setFormData({...formData, rate: parseFloat(e.target.value) || 0})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>Total</label>
          <div className={styles.formValue}>${(formData.hours * formData.rate).toFixed(2)}</div>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Describe the work performed..."
          rows={3}
          required
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={formData.billable}
            onChange={(e) => setFormData({...formData, billable: e.target.checked})}
          />
          Billable
        </label>
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Time Entry'}
        </button>
      </div>
    </form>
  )
}

// Invoice Form Component
function InvoiceForm({ matterId, clientId, clientName, matterName, unbilledAmount, onClose, onSave }: {
  matterId: string
  clientId: string
  clientName: string
  matterName: string
  unbilledAmount: number
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    matterId,
    clientId,
    issueDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    notes: '',
    lineItems: [
      { type: 'fee', description: `Legal Services - ${matterName}`, quantity: 1, rate: unbilledAmount, amount: unbilledAmount }
    ]
  })

  const addLineItem = () => {
    setFormData({
      ...formData,
      lineItems: [...formData.lineItems, { type: 'fee', description: '', quantity: 1, rate: 0, amount: 0 }]
    })
  }

  const removeLineItem = (index: number) => {
    setFormData({
      ...formData,
      lineItems: formData.lineItems.filter((_, i) => i !== index)
    })
  }

  const updateLineItem = (index: number, field: string, value: any) => {
    const newLineItems = [...formData.lineItems]
    newLineItems[index] = { ...newLineItems[index], [field]: value }
    
    // Auto-calculate amount when quantity or rate changes
    if (field === 'quantity' || field === 'rate') {
      newLineItems[index].amount = newLineItems[index].quantity * newLineItems[index].rate
    }
    // If amount is directly edited, update rate
    if (field === 'amount' && newLineItems[index].quantity > 0) {
      newLineItems[index].rate = value / newLineItems[index].quantity
    }
    
    setFormData({ ...formData, lineItems: newLineItems })
  }

  const totalAmount = formData.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (totalAmount <= 0) {
      alert('Please add at least one line item with an amount')
      return
    }
    setIsSubmitting(true)
    try {
      await onSave({ ...formData, total: totalAmount })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formInfo}>
        <div><strong>Client:</strong> {clientName}</div>
        <div><strong>Matter:</strong> {matterName}</div>
        <div><strong>Unbilled Amount:</strong> ${unbilledAmount.toLocaleString()}</div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Issue Date</label>
          <input
            type="date"
            value={formData.issueDate}
            onChange={(e) => setFormData({...formData, issueDate: e.target.value})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>Due Date</label>
          <input
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
            required
          />
        </div>
      </div>

      {/* Line Items Section */}
      <div className={styles.formGroup}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <label style={{ marginBottom: 0 }}>Line Items</label>
          <button 
            type="button" 
            onClick={addLineItem}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.5rem',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid var(--apex-gold)',
              borderRadius: '4px',
              color: 'var(--apex-gold)',
              fontSize: '0.75rem',
              cursor: 'pointer'
            }}
          >
            + Add Item
          </button>
        </div>
        
        <div style={{ 
          background: 'var(--apex-slate)', 
          border: '1px solid rgba(255, 255, 255, 0.1)', 
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 80px 100px 120px 40px',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'rgba(0, 0, 0, 0.2)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            fontSize: '0.7rem',
            fontWeight: '600',
            color: 'var(--apex-text)',
            textTransform: 'uppercase'
          }}>
            <span>Description</span>
            <span style={{ textAlign: 'center' }}>Qty</span>
            <span style={{ textAlign: 'right' }}>Rate</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
            <span></span>
          </div>
          
          {/* Line Items */}
          {formData.lineItems.map((item, index) => (
            <div 
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 80px 100px 120px 40px',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderBottom: index < formData.lineItems.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none'
              }}
            >
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                placeholder="Description"
                style={{ 
                  padding: '0.375rem 0.5rem',
                  background: 'var(--apex-deep)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  color: 'var(--apex-white)',
                  fontSize: '0.875rem'
                }}
                required
              />
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
                style={{ 
                  padding: '0.375rem 0.5rem',
                  background: 'var(--apex-deep)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  color: 'var(--apex-white)',
                  fontSize: '0.875rem',
                  textAlign: 'center'
                }}
              />
              <input
                type="number"
                value={item.rate}
                onChange={(e) => updateLineItem(index, 'rate', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
                placeholder="0.00"
                style={{ 
                  padding: '0.375rem 0.5rem',
                  background: 'var(--apex-deep)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  color: 'var(--apex-white)',
                  fontSize: '0.875rem',
                  textAlign: 'right'
                }}
              />
              <input
                type="number"
                value={item.amount}
                onChange={(e) => updateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
                placeholder="0.00"
                style={{ 
                  padding: '0.375rem 0.5rem',
                  background: 'var(--apex-deep)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  color: 'var(--apex-white)',
                  fontSize: '0.875rem',
                  textAlign: 'right',
                  fontWeight: 'bold'
                }}
              />
              <button
                type="button"
                onClick={() => removeLineItem(index)}
                disabled={formData.lineItems.length === 1}
                style={{
                  background: 'none',
                  border: 'none',
                  color: formData.lineItems.length === 1 ? 'rgba(255,255,255,0.2)' : 'var(--apex-text)',
                  cursor: formData.lineItems.length === 1 ? 'not-allowed' : 'pointer',
                  padding: '0.25rem'
                }}
              >
                ×
              </button>
            </div>
          ))}
          
          {/* Total */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '2rem',
            padding: '0.75rem 1rem',
            background: 'rgba(0, 0, 0, 0.2)',
            fontWeight: '600'
          }}>
            <span style={{ color: 'var(--apex-text)' }}>Total:</span>
            <span style={{ color: 'var(--apex-gold-bright)', fontSize: '1.125rem' }}>
              ${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({...formData, notes: e.target.value})}
          placeholder="Invoice notes..."
          rows={3}
        />
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : `Create Invoice ($${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})})`}
        </button>
      </div>
    </form>
  )
}

// Event Form Component
function EventForm({ matterId, matterName, onClose, onSave }: {
  matterId: string
  matterName: string
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    matterId,
    title: '',
    type: 'meeting',
    startTime: format(new Date(), "yyyy-MM-dd'T'10:00"),
    endTime: format(new Date(), "yyyy-MM-dd'T'11:00"),
    location: '',
    description: '',
    allDay: false
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        startTime: new Date(formData.startTime).toISOString(),
        endTime: new Date(formData.endTime).toISOString()
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formInfo}>
        <strong>Matter:</strong> {matterName}
      </div>

      <div className={styles.formGroup}>
        <label>Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({...formData, title: e.target.value})}
          placeholder="Event title..."
          required
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Type</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
          >
            <option value="meeting">Meeting</option>
            <option value="court_date">Court Date</option>
            <option value="hearing">Hearing</option>
            <option value="deposition">Deposition</option>
            <option value="deadline">Deadline</option>
            <option value="filing_deadline">Filing Deadline</option>
            <option value="appointment">Appointment</option>
            <option value="conference_call">Conference Call</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label>Location</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({...formData, location: e.target.value})}
            placeholder="Location (optional)"
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Start</label>
          <input
            type="datetime-local"
            value={formData.startTime}
            onChange={(e) => setFormData({...formData, startTime: e.target.value})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>End</label>
          <input
            type="datetime-local"
            value={formData.endTime}
            onChange={(e) => setFormData({...formData, endTime: e.target.value})}
            required
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Event details..."
          rows={2}
        />
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Event'}
        </button>
      </div>
    </form>
  )
}
