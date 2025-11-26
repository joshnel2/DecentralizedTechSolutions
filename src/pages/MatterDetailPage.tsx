import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { 
  Briefcase, Users, Calendar, DollarSign, Clock, FileText,
  ChevronLeft, Sparkles, Edit2, MoreVertical, Plus,
  AlertCircle, CheckCircle2, Scale, Building2
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './DetailPage.module.css'

export function MatterDetailPage() {
  const { id } = useParams()
  const { matters, clients, timeEntries, invoices, events, documents } = useDataStore()
  const [activeTab, setActiveTab] = useState('overview')

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

  if (!matter) {
    return (
      <div className={styles.notFound}>
        <Briefcase size={48} />
        <h2>Matter not found</h2>
        <Link to="/matters">Back to Matters</Link>
      </div>
    )
  }

  return (
    <div className={styles.detailPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <Link to="/matters" className={styles.backLink}>
            <ChevronLeft size={18} />
            Back to Matters
          </Link>
          <div className={styles.headerActions}>
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
        {['overview', 'time', 'billing', 'documents', 'calendar'].map(tab => (
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
            {/* Matter Details */}
            <div className={styles.card}>
              <h3>Matter Details</h3>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Client</span>
                  <Link to={`/clients/${client?.id}`} className={styles.detailLink}>
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
                <h3>
                  <Scale size={18} />
                  Court Information
                </h3>
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

            {/* AI Summary */}
            {matter.aiSummary && (
              <div className={clsx(styles.card, styles.aiCard)}>
                <h3>
                  <Sparkles size={18} />
                  AI Summary
                </h3>
                <p className={styles.aiSummary}>{matter.aiSummary}</p>
                <button className={styles.aiBtn}>
                  <Sparkles size={14} />
                  Generate Updated Analysis
                </button>
              </div>
            )}

            {/* Upcoming Events */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>
                  <Calendar size={18} />
                  Upcoming Events
                </h3>
                <button className={styles.addBtn}>
                  <Plus size={14} />
                  Add
                </button>
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
                <button className={styles.addBtn}>
                  <Plus size={14} />
                  Add
                </button>
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
              <button className={styles.primaryBtn}>
                <Plus size={18} />
                New Time Entry
              </button>
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
              <button className={styles.primaryBtn}>
                <Plus size={18} />
                Create Invoice
              </button>
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
              <button className={styles.primaryBtn}>
                <Plus size={18} />
                Upload Document
              </button>
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
              <button className={styles.primaryBtn}>
                <Plus size={18} />
                Add Event
              </button>
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
                    <span className={styles.eventTime}>
                      {format(parseISO(event.startTime), 'h:mm a')}
                    </span>
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
      </div>
    </div>
  )
}
