import { useMemo, useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { 
  Building2, User, ChevronLeft, Edit2, MoreVertical, 
  Briefcase, DollarSign, FileText, Mail, Phone, MapPin, Plus,
  Sparkles, Archive, Trash2, X
} from 'lucide-react'
import { useAIChat } from '../contexts/AIChatContext'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './DetailPage.module.css'

export function ClientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { clients, matters, invoices, documents, updateClient, deleteClient, fetchClients } = useDataStore()
  const { openChat } = useAIChat()
  const [activeTab, setActiveTab] = useState('overview')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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
            <button 
              className={styles.iconBtn}
              onClick={() => openChat({
                label: `Client: ${client.name}`,
                contextType: 'client-detail',
                suggestedQuestions: [
                  'Summarize this client\'s matters and billing history',
                  'What is the outstanding balance for this client?',
                  'Show me recent activity for this client',
                  'What matters are currently active for this client?'
                ]
              })}
              title="AI Analysis"
            >
              <Sparkles size={18} />
            </button>
            <button 
              className={styles.iconBtn}
              onClick={() => setShowEditModal(true)}
              title="Edit Client"
            >
              <Edit2 size={18} />
            </button>
            <div className={styles.menuWrapper} ref={dropdownRef}>
              <button 
                className={styles.iconBtn}
                onClick={() => setShowDropdown(!showDropdown)}
                title="More Options"
              >
                <MoreVertical size={18} />
              </button>
              {showDropdown && (
                <div className={styles.dropdown}>
                  <button 
                    className={styles.dropdownItem}
                    onClick={() => {
                      setShowDropdown(false)
                      setShowEditModal(true)
                    }}
                  >
                    <Edit2 size={14} />
                    Edit Client
                  </button>
                  <button 
                    className={styles.dropdownItem}
                    onClick={async () => {
                      await updateClient(id!, { isActive: !client.isActive })
                      setShowDropdown(false)
                      fetchClients()
                    }}
                  >
                    <Archive size={14} />
                    {client.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <div className={styles.dropdownDivider} />
                  <button 
                    className={clsx(styles.dropdownItem, styles.danger)}
                    onClick={async () => {
                      if (confirm(`Are you sure you want to delete "${client.name}"? This action cannot be undone.`)) {
                        await deleteClient(id!)
                        navigate('/app/clients')
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    Delete Client
                  </button>
                </div>
              )}
            </div>
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
                <button className={styles.addBtn} onClick={() => navigate(`/app/matters?clientId=${client?.id}&openNew=true`)}>
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
              <button className={styles.primaryBtn} onClick={() => navigate(`/app/matters?clientId=${client?.id}&openNew=true`)}>
                <Plus size={18} />
                New Matter
              </button>
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
              <button className={styles.primaryBtn} onClick={() => navigate(`/app/billing?clientId=${client?.id}&openNew=true`)}>
                <Plus size={18} />
                Create Invoice
              </button>
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
              <button className={styles.primaryBtn} onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  if (files && files.length > 0) {
                    alert(`${files.length} document(s) selected for upload to ${client?.name}'s file.`);
                  }
                };
                input.click();
              }}>
                <Plus size={18} />
                Upload Document
              </button>
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
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit Client Modal */}
      {showEditModal && (
        <EditClientModal
          client={client}
          onClose={() => setShowEditModal(false)}
          onSave={async (data) => {
            await updateClient(id!, data)
            setShowEditModal(false)
            fetchClients()
          }}
        />
      )}
    </div>
  )
}

// Edit Client Modal
function EditClientModal({ client, onClose, onSave }: { 
  client: any
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: client.name || '',
    email: client.email || '',
    phone: client.phone || '',
    type: client.type || 'person',
    addressStreet: client.addressStreet || '',
    addressCity: client.addressCity || '',
    addressState: client.addressState || '',
    addressZip: client.addressZip || '',
    notes: client.notes || '',
    isActive: client.isActive !== false
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
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Edit Client</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Client Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
            >
              <option value="person">Individual</option>
              <option value="company">Organization</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>{formData.type === 'company' ? 'Organization Name' : 'Full Name'}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Street Address</label>
            <input
              type="text"
              value={formData.addressStreet}
              onChange={(e) => setFormData({...formData, addressStreet: e.target.value})}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>City</label>
              <input
                type="text"
                value={formData.addressCity}
                onChange={(e) => setFormData({...formData, addressCity: e.target.value})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>State</label>
              <input
                type="text"
                value={formData.addressState}
                onChange={(e) => setFormData({...formData, addressState: e.target.value})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>ZIP</label>
              <input
                type="text"
                value={formData.addressZip}
                onChange={(e) => setFormData({...formData, addressZip: e.target.value})}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              rows={3}
            />
          </div>

          <div className={styles.formGroup}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
              />
              Active Client
            </label>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
