import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { 
  Briefcase, Calendar, DollarSign, Clock, FileText,
  ChevronLeft, Sparkles, Edit2, MoreVertical, Plus,
  CheckCircle2, Scale, Building2, Brain, Loader2, 
  Copy, RefreshCw, AlertTriangle, TrendingUp,
  ListTodo, Users, Circle
} from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { clsx } from 'clsx'
import { AIButton } from '../components/AIButton'
import styles from './DetailPage.module.css'

// Demo tasks for matter
const demoTasks = [
  { id: '1', name: 'Review discovery responses', status: 'completed', dueDate: '2024-11-20', assignee: 'John Mitchell' },
  { id: '2', name: 'Draft motion for summary judgment', status: 'in_progress', dueDate: '2024-11-28', assignee: 'John Mitchell' },
  { id: '3', name: 'Schedule expert deposition', status: 'pending', dueDate: '2024-12-05', assignee: 'Sarah Chen' },
  { id: '4', name: 'Prepare trial exhibits', status: 'pending', dueDate: '2024-12-15', assignee: 'Emily Davis' }
]

// Related contacts for matter
const relatedContacts = [
  { id: '1', name: 'Opposing Counsel', role: 'Opposing Counsel', firm: 'Baker & Associates', email: 'jbaker@bakerlaw.com' },
  { id: '2', name: 'Expert Witness', role: 'Expert Witness', firm: 'Tech Consultants Inc.', email: 'expert@techconsult.com' },
  { id: '3', name: 'Insurance Adjuster', role: 'Insurance', firm: 'ABC Insurance Co.', email: 'adjuster@abc.com' }
]

export function MatterDetailPage() {
  const { id } = useParams()
  const { matters, clients, timeEntries, invoices, events, documents, updateMatter } = useDataStore()
  const [activeTab, setActiveTab] = useState('overview')
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(false)

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
          message: 'Give me a comprehensive analysis of this matter including: 1) Current status and progress summary, 2) Financial overview with billing insights, 3) Risk assessment, 4) Recommended next steps and priorities. Be specific and actionable.',
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
      'risk': 'Analyze potential risks for this matter. Consider deadlines, statute of limitations, missing documents, billing concerns, and any other factors. Provide specific risks with severity levels and recommended mitigations.',
      'billing': 'Provide a billing forecast for this matter. Analyze current hours, billing rate, and project future costs. Include recommendations for invoicing unbilled time and revenue projections.',
      'deadline': 'Analyze all deadlines and important dates for this matter. Identify any upcoming court dates, filing deadlines, or statute of limitations concerns. Flag any dates that need immediate attention.',
      'documents': 'Summarize all documents associated with this matter. Identify any missing documents that would typically be expected for this type of matter. Suggest document organization improvements.'
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
            <AIButton 
              context={`Matter: ${matter.name}`}
              label="AI Analysis"
              prompts={[
                { label: 'Summarize', prompt: 'Summarize this matter' },
                { label: 'Risk Analysis', prompt: 'Analyze risks' },
                { label: 'Timeline Review', prompt: 'Review timeline' },
                { label: 'Billing Insights', prompt: 'Billing analysis' },
                { label: 'Next Steps', prompt: 'Recommend next steps' }
              ]}
            />
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
            {tab === 'tasks' && <ListTodo size={16} />}
            {tab === 'contacts' && <Users size={16} />}
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
                <AIButton 
                  context="Matter Details"
                  variant="icon"
                  size="sm"
                />
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
                  <AIButton 
                    context="Court Information"
                    variant="icon"
                    size="sm"
                  />
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
                  <AIButton 
                    context="Calendar Events"
                    variant="icon"
                    size="sm"
                  />
                  <button className={styles.addBtn}>
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
                  <AIButton 
                    context="Time Entries"
                    variant="icon"
                    size="sm"
                    prompts={[
                      { label: 'Summarize', prompt: 'Summarize time entries' },
                      { label: 'Billing Analysis', prompt: 'Analyze billing patterns' },
                      { label: 'Efficiency', prompt: 'Review time efficiency' }
                    ]}
                  />
                  <button className={styles.addBtn}>
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
                <AIButton 
                  context="All Time Entries"
                  label="AI Analyze"
                  prompts={[
                    { label: 'Summarize', prompt: 'Summarize all time' },
                    { label: 'Patterns', prompt: 'Find patterns' },
                    { label: 'Optimize', prompt: 'Suggest optimizations' },
                    { label: 'Invoice Ready', prompt: 'Prepare for invoicing' }
                  ]}
                />
                <button className={styles.primaryBtn}>
                  <Plus size={18} />
                  New Time Entry
                </button>
              </div>
            </div>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Hours</th>
                    <th>Rate</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>AI</th>
                  </tr>
                </thead>
                <tbody>
                  {matterTimeEntries.map(entry => (
                    <tr key={entry.id}>
                      <td>{format(parseISO(entry.date), 'MMM d, yyyy')}</td>
                      <td>{entry.description}</td>
                      <td>{entry.hours}h</td>
                      <td>${entry.rate}/hr</td>
                      <td>${entry.amount.toLocaleString()}</td>
                      <td>
                        <span className={clsx(styles.badge, entry.billed ? styles.billed : styles.unbilled)}>
                          {entry.billed ? 'Billed' : 'Unbilled'}
                        </span>
                      </td>
                      <td>
                        <AIButton 
                          context={entry.description}
                          variant="icon"
                          size="sm"
                          prompts={[
                            { label: 'Enhance', prompt: 'Enhance description' },
                            { label: 'Categorize', prompt: 'Suggest category' }
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className={styles.billingTab}>
            <div className={styles.tabHeader}>
              <h2>Invoices</h2>
              <div className={styles.tabActions}>
                <AIButton 
                  context="Billing & Invoices"
                  label="AI Insights"
                  prompts={[
                    { label: 'Summary', prompt: 'Billing summary' },
                    { label: 'Collections', prompt: 'Collection analysis' },
                    { label: 'Forecast', prompt: 'Revenue forecast' },
                    { label: 'Draft Invoice', prompt: 'Help draft invoice' }
                  ]}
                />
                <button className={styles.primaryBtn}>
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
                        <AIButton 
                          context={`Invoice ${invoice.number}`}
                          variant="icon"
                          size="sm"
                        />
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
                <AIButton 
                  context="Matter Documents"
                  label="AI Analyze All"
                  prompts={[
                    { label: 'Summarize All', prompt: 'Summarize all documents' },
                    { label: 'Key Terms', prompt: 'Extract key terms' },
                    { label: 'Timeline', prompt: 'Create document timeline' },
                    { label: 'Missing Docs', prompt: 'Identify missing documents' }
                  ]}
                />
                <button className={styles.primaryBtn}>
                  <Plus size={18} />
                  Upload Document
                </button>
              </div>
            </div>
            <div className={styles.docGrid}>
              {matterDocuments.map(doc => (
                <div key={doc.id} className={styles.docCard}>
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
                  <div className={styles.docActions}>
                    <AIButton 
                      context={doc.name}
                      variant="icon"
                      size="sm"
                      prompts={[
                        { label: 'Summarize', prompt: 'Summarize document' },
                        { label: 'Key Points', prompt: 'Extract key points' },
                        { label: 'Entities', prompt: 'Extract entities' },
                        { label: 'Risks', prompt: 'Identify risks' }
                      ]}
                    />
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
                <AIButton 
                  context="Calendar & Deadlines"
                  label="AI Schedule"
                  prompts={[
                    { label: 'Summary', prompt: 'Summarize schedule' },
                    { label: 'Conflicts', prompt: 'Find conflicts' },
                    { label: 'Deadlines', prompt: 'Review deadlines' },
                    { label: 'Suggest', prompt: 'Suggest next meetings' }
                  ]}
                />
                <button className={styles.primaryBtn}>
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
                      <AIButton 
                        context={event.title}
                        variant="icon"
                        size="sm"
                      />
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
                <AIButton 
                  context="Matter Tasks"
                  label="AI Prioritize"
                  prompts={[
                    { label: 'Prioritize', prompt: 'Prioritize tasks' },
                    { label: 'Timeline', prompt: 'Create timeline' },
                    { label: 'Workload', prompt: 'Analyze workload' }
                  ]}
                />
                <button className={styles.primaryBtn}>
                  <Plus size={18} />
                  Add Task
                </button>
              </div>
            </div>
            
            <div className={styles.tasksSummary}>
              <div className={styles.taskStat}>
                <span className={styles.taskStatValue}>{demoTasks.filter(t => t.status === 'completed').length}</span>
                <span className={styles.taskStatLabel}>Completed</span>
              </div>
              <div className={styles.taskStat}>
                <span className={styles.taskStatValue}>{demoTasks.filter(t => t.status === 'in_progress').length}</span>
                <span className={styles.taskStatLabel}>In Progress</span>
              </div>
              <div className={styles.taskStat}>
                <span className={styles.taskStatValue}>{demoTasks.filter(t => t.status === 'pending').length}</span>
                <span className={styles.taskStatLabel}>Pending</span>
              </div>
            </div>

            <div className={styles.tasksList}>
              {demoTasks.map(task => (
                <div key={task.id} className={clsx(styles.taskCard, styles[task.status])}>
                  <div className={styles.taskCheckbox}>
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
          </div>
        )}

        {/* Contacts Tab - Clio Style */}
        {activeTab === 'contacts' && (
          <div className={styles.contactsTab}>
            <div className={styles.tabHeader}>
              <h2>Related Contacts</h2>
              <div className={styles.tabActions}>
                <button className={styles.primaryBtn}>
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
    </div>
  )
}
