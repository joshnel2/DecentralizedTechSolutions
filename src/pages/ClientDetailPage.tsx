import { useMemo, useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAIChat } from '../contexts/AIChatContext'
import { 
  Building2, User, ChevronLeft, Edit2, MoreVertical, 
  Briefcase, DollarSign, FileText, Mail, Phone, MapPin, Plus,
  Upload, Sparkles, Download
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './DetailPage.module.css'

export function ClientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { 
    clients, matters, invoices, documents,
    fetchClients, fetchMatters, fetchInvoices, fetchDocuments,
    addMatter, addInvoice, addDocument
  } = useDataStore()
  const { openChat } = useAIChat()
  const [activeTab, setActiveTab] = useState('overview')
  const [showNewMatterModal, setShowNewMatterModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch data on mount
  useEffect(() => {
    fetchClients()
    fetchMatters()
    fetchInvoices()
    fetchDocuments()
  }, [])

  const client = useMemo(() => clients.find(c => c.id === id), [clients, id])
  
  const clientMatters = useMemo(() => 
    matters.filter(m => m.clientId === id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [matters, id]
  )
  
  const clientInvoices = useMemo(() => 
    invoices.filter(i => i.clientId === id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [invoices, id]
  )
  
  const clientDocuments = useMemo(() => 
    documents.filter(d => d.clientId === id),
    [documents, id]
  )

  const stats = useMemo(() => {
    const totalMatters = clientMatters.length
    const activeMatters = clientMatters.filter(m => m.status === 'active').length
    const totalBilled = clientInvoices.reduce((sum, i) => sum + i.total, 0)
    const totalPaid = clientInvoices.reduce((sum, i) => sum + i.amountPaid, 0)
    const outstanding = totalBilled - totalPaid
    
    return { totalMatters, activeMatters, totalBilled, totalPaid, outstanding }
  }, [clientMatters, clientInvoices])

  if (!client) {
    return (
      <div className={styles.notFound}>
        <User size={48} />
        <h2>Client not found</h2>
        <Link to="/app/clients">Back to Clients</Link>
      </div>
    )
  }

  return (
    <div className={styles.detailPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <Link to="/app/clients" className={styles.backLink}>
            <ChevronLeft size={18} />
            Back to Clients
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
            {client.type === 'company' ? <Building2 size={28} /> : <User size={28} />}
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.headerMeta}>
              <span className={styles.typeTag}>{client.type === 'company' ? 'Organization' : 'Individual'}</span>
              <span className={clsx(styles.statusBadge, styles[client.isActive ? 'active' : 'inactive'])}>
                {client.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <h1>{client.name}</h1>
            <div className={styles.contactInfo}>
              <span><Mail size={14} /> {client.email}</span>
              <span><Phone size={14} /> {client.phone}</span>
              <span><MapPin size={14} /> {client.addressCity}, {client.addressState}</span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className={styles.quickStats}>
          <div className={styles.quickStat}>
            <Briefcase size={18} />
            <div>
              <span className={styles.statValue}>{stats.activeMatters}</span>
              <span className={styles.statLabel}>Active Matters</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <FileText size={18} />
            <div>
              <span className={styles.statValue}>{stats.totalMatters}</span>
              <span className={styles.statLabel}>Total Matters</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <DollarSign size={18} />
            <div>
              <span className={styles.statValue}>${stats.totalBilled.toLocaleString()}</span>
              <span className={styles.statLabel}>Total Billed</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <DollarSign size={18} />
            <div>
              <span className={styles.statValue}>${stats.outstanding.toLocaleString()}</span>
              <span className={styles.statLabel}>Outstanding</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {['overview', 'matters', 'billing', 'documents'].map(tab => (
          <button
            key={tab}
            className={clsx(styles.tab, activeTab === tab && styles.active)}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <button className={styles.aiActionBtn} onClick={openChat}>
          <Sparkles size={16} />
          AI Help
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'overview' && (
          <div className={styles.overviewGrid}>
            <div className={styles.card}>
              <h3>Contact Information</h3>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Email</span>
                  <span className={styles.detailValue}>{client.email}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Phone</span>
                  <span className={styles.detailValue}>{client.phone}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Address</span>
                  <span className={styles.detailValue}>{client.addressStreet}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>City, State ZIP</span>
                  <span className={styles.detailValue}>{client.addressCity}, {client.addressState} {client.addressZip}</span>
                </div>
                {client.clientInfo?.billingContact && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Billing Contact</span>
                    <span className={styles.detailValue}>{client.clientInfo.billingContact}</span>
                  </div>
                )}
              </div>
            </div>

            {client.notes && (
              <div className={styles.card}>
                <h3>Notes</h3>
                <p className={styles.notes}>{client.notes}</p>
              </div>
            )}

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3><Briefcase size={18} /> Active Matters</h3>
                <button className={styles.addBtn} onClick={() => setShowNewMatterModal(true)}>
                  <Plus size={14} />
                  Add
                </button>
              </div>
              <div className={styles.matterList}>
                {clientMatters.filter(m => m.status === 'active').slice(0, 5).map(matter => (
                  <Link key={matter.id} to={`/app/matters/${matter.id}`} className={styles.matterItem}>
                    <div>
                      <span className={styles.matterName}>{matter.name}</span>
                      <span className={styles.matterNumber}>{matter.number}</span>
                    </div>
                    <span className={styles.matterType}>{matter.type.replace(/_/g, ' ')}</span>
                  </Link>
                ))}
                {clientMatters.filter(m => m.status === 'active').length === 0 && (
                  <p className={styles.noData}>No active matters</p>
                )}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3><DollarSign size={18} /> Recent Invoices</h3>
              </div>
              <div className={styles.invoiceList}>
                {clientInvoices.slice(0, 5).map(invoice => (
                  <div key={invoice.id} className={styles.invoiceItem}>
                    <div>
                      <span className={styles.invoiceNumber}>{invoice.number}</span>
                      <span className={styles.invoiceDate}>
                        {format(parseISO(invoice.issueDate), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <div className={styles.invoiceRight}>
                      <span className={styles.invoiceAmount}>${invoice.total.toLocaleString()}</span>
                      <span className={clsx(styles.badge, styles[invoice.status])}>{invoice.status}</span>
                    </div>
                  </div>
                ))}
                {clientInvoices.length === 0 && (
                  <p className={styles.noData}>No invoices yet</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'matters' && (
          <div className={styles.mattersTab}>
            <div className={styles.tabHeader}>
              <h2>All Matters</h2>
              <div className={styles.tabActions}>
                <button className={styles.aiActionBtn} onClick={openChat}>
                  <Sparkles size={16} />
                  AI Help
                </button>
                <button className={styles.primaryBtn} onClick={() => setShowNewMatterModal(true)}>
                  <Plus size={18} />
                  New Matter
                </button>
              </div>
            </div>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Matter</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {clientMatters.map(matter => (
                    <tr key={matter.id}>
                      <td>
                        <Link to={`/app/matters/${matter.id}`}>
                          <div>{matter.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--apex-text)' }}>{matter.number}</div>
                        </Link>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{matter.type.replace(/_/g, ' ')}</td>
                      <td>
                        <span className={clsx(styles.badge, styles[matter.status])}>
                          {matter.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>{format(parseISO(matter.openDate), 'MMM d, yyyy')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {clientMatters.length === 0 && (
                <div className={styles.emptyTable}>No matters for this client</div>
              )}
            </div>
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
                <button className={styles.primaryBtn} onClick={() => setShowInvoiceModal(true)}>
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
                    <th>Matter</th>
                    <th>Issue Date</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {clientInvoices.map(invoice => {
                    const matter = matters.find(m => m.id === invoice.matterId)
                    return (
                      <tr key={invoice.id}>
                        <td>{invoice.number}</td>
                        <td>
                          <Link to={`/app/matters/${matter?.id}`}>{matter?.name}</Link>
                        </td>
                        <td>{format(parseISO(invoice.issueDate), 'MMM d, yyyy')}</td>
                        <td>{format(parseISO(invoice.dueDate), 'MMM d, yyyy')}</td>
                        <td>${invoice.total.toLocaleString()}</td>
                        <td>
                          <span className={clsx(styles.badge, styles[invoice.status])}>
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {clientInvoices.length === 0 && (
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
                  AI Analyze
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
                      await addDocument(file, { clientId: id })
                      fetchDocuments()
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
                  <Upload size={18} />
                  {isUploading ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </div>
            <div className={styles.docGrid}>
              {clientDocuments.map(doc => (
                <div key={doc.id} className={styles.docCard}>
                  <div className={styles.docIcon}>
                    <FileText size={24} />
                  </div>
                  <div className={styles.docInfo}>
                    <span className={styles.docName}>{doc.name}</span>
                    <span className={styles.docMeta}>
                      {format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
              ))}
              {clientDocuments.length === 0 && (
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
      </div>

      {/* New Matter Modal */}
      {showNewMatterModal && (
        <div className={styles.modalOverlay} onClick={() => setShowNewMatterModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>New Matter</h2>
              <button onClick={() => setShowNewMatterModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <NewMatterForm 
              clientId={id!}
              clientName={client?.name || ''}
              onClose={() => setShowNewMatterModal(false)}
              onSave={async (data) => {
                try {
                  await addMatter(data)
                  setShowNewMatterModal(false)
                  fetchMatters()
                } catch (error) {
                  console.error('Failed to create matter:', error)
                  alert('Failed to create matter. Please try again.')
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
            <NewInvoiceForm 
              clientId={id!}
              clientName={client?.name || ''}
              clientMatters={clientMatters}
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
    </div>
  )
}

// New Matter Form Component
function NewMatterForm({ clientId, clientName, onClose, onSave }: {
  clientId: string
  clientName: string
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    clientId,
    name: '',
    description: '',
    type: 'general',
    status: 'active',
    priority: 'medium',
    billingType: 'hourly',
    billingRate: 450
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
        <strong>Client:</strong> {clientName}
      </div>

      <div className={styles.formGroup}>
        <label>Matter Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          placeholder="Enter matter name..."
          required
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Practice Area</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
          >
            <option value="general">General</option>
            <option value="litigation">Litigation</option>
            <option value="corporate">Corporate</option>
            <option value="real_estate">Real Estate</option>
            <option value="family">Family Law</option>
            <option value="criminal">Criminal</option>
            <option value="estate_planning">Estate Planning</option>
            <option value="intellectual_property">Intellectual Property</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label>Priority</label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({...formData, priority: e.target.value})}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Billing Type</label>
          <select
            value={formData.billingType}
            onChange={(e) => setFormData({...formData, billingType: e.target.value})}
          >
            <option value="hourly">Hourly</option>
            <option value="flat">Flat Fee</option>
            <option value="contingency">Contingency</option>
            <option value="retainer">Retainer</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label>Rate ($/hr)</label>
          <input
            type="number"
            value={formData.billingRate}
            onChange={(e) => setFormData({...formData, billingRate: parseFloat(e.target.value) || 0})}
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Brief description of the matter..."
          rows={3}
        />
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Matter'}
        </button>
      </div>
    </form>
  )
}

// New Invoice Form Component
function NewInvoiceForm({ clientId, clientName, clientMatters, onClose, onSave }: {
  clientId: string
  clientName: string
  clientMatters: any[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    clientId,
    matterId: clientMatters[0]?.id || '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    total: 0,
    notes: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!formData.matterId) {
      alert('Please select a matter')
      return
    }
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
        <strong>Client:</strong> {clientName}
      </div>

      <div className={styles.formGroup}>
        <label>Matter *</label>
        <select
          value={formData.matterId}
          onChange={(e) => setFormData({...formData, matterId: e.target.value})}
          required
        >
          <option value="">Select a matter...</option>
          {clientMatters.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
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

      <div className={styles.formGroup}>
        <label>Amount</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={formData.total}
          onChange={(e) => setFormData({...formData, total: parseFloat(e.target.value) || 0})}
          placeholder="0.00"
          required
        />
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
          {isSubmitting ? 'Creating...' : 'Create Invoice'}
        </button>
      </div>
    </form>
  )
}
