import { useMemo, useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { teamApi } from '../services/api'
import { 
  Building2, User, ChevronLeft, Edit2, MoreVertical, 
  Briefcase, DollarSign, FileText, Mail, Phone, MapPin, Plus,
  Sparkles, Archive, Trash2, X, Users
} from 'lucide-react'
import { useAIChat } from '../contexts/AIChatContext'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './DetailPage.module.css'

const typeOptions = [
  { value: 'litigation', label: 'Litigation' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'intellectual_property', label: 'IP' },
  { value: 'employment', label: 'Employment' },
  { value: 'personal_injury', label: 'Personal Injury' },
  { value: 'estate_planning', label: 'Estate Planning' },
  { value: 'other', label: 'Other' }
]

export function ClientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { clients, matters, invoices, documents, updateClient, deleteClient, fetchClients, addMatter, fetchMatters, addInvoice, fetchInvoices } = useDataStore()
  const { user } = useAuthStore()
  const { openChat } = useAIChat()
  const [activeTab, setActiveTab] = useState('overview')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showNewMatterModal, setShowNewMatterModal] = useState(false)
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [attorneys, setAttorneys] = useState<any[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  
  // Fetch attorneys for matter creation
  useEffect(() => {
    teamApi.getAttorneys()
      .then(data => setAttorneys(data.attorneys || []))
      .catch(err => console.log('Could not fetch attorneys:', err))
  }, [])

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
              <button className={styles.primaryBtn} onClick={() => setShowNewMatterModal(true)}>
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
              <button className={styles.primaryBtn} onClick={() => setShowNewInvoiceModal(true)}>
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

      {/* New Matter Modal */}
      {showNewMatterModal && (
        <NewMatterModal
          clientId={id!}
          clientName={client.name}
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
          attorneys={attorneys}
          isAdmin={isAdmin}
        />
      )}

      {/* New Invoice Modal */}
      {showNewInvoiceModal && (
        <NewInvoiceModal
          clientId={id!}
          clientName={client.name}
          clientMatters={clientMatters}
          onClose={() => setShowNewInvoiceModal(false)}
          onSave={async (data) => {
            try {
              await addInvoice({
                ...data,
                status: 'draft',
                amountPaid: 0,
                subtotal: data.total
              })
              setShowNewInvoiceModal(false)
              fetchInvoices()
            } catch (error) {
              console.error('Failed to create invoice:', error)
              alert('Failed to create invoice. Please try again.')
            }
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

// New Matter Modal
interface TeamAssignment {
  userId: string
  name: string
  billingRate: number
}

function NewMatterModal({ clientId, clientName, onClose, onSave, attorneys, isAdmin }: {
  clientId: string
  clientName: string
  onClose: () => void
  onSave: (data: any) => Promise<void>
  attorneys: any[]
  isAdmin: boolean
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    clientId: clientId,
    type: 'litigation',
    status: 'active',
    priority: 'medium',
    billingType: 'hourly',
    billingRate: 450,
    openDate: new Date().toISOString(),
    responsibleAttorney: '',
    originatingAttorney: '',
    tags: []
  })
  
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([])
  const [selectedAttorney, setSelectedAttorney] = useState('')
  const [selectedRate, setSelectedRate] = useState(0)

  const addTeamMember = () => {
    if (!selectedAttorney) return
    const attorney = attorneys.find(a => a.id === selectedAttorney)
    if (!attorney) return
    
    if (teamAssignments.some(t => t.userId === selectedAttorney)) {
      alert('This attorney is already assigned')
      return
    }
    
    setTeamAssignments([...teamAssignments, {
      userId: attorney.id,
      name: attorney.name,
      billingRate: selectedRate || attorney.hourlyRate || 0
    }])
    setSelectedAttorney('')
    setSelectedRate(0)
  }

  const removeTeamMember = (userId: string) => {
    setTeamAssignments(teamAssignments.filter(t => t.userId !== userId))
  }

  const updateTeamMemberRate = (userId: string, rate: number) => {
    setTeamAssignments(teamAssignments.map(t => 
      t.userId === userId ? { ...t, billingRate: rate } : t
    ))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        responsibleAttorney: formData.responsibleAttorney || undefined,
        originatingAttorney: formData.originatingAttorney || undefined,
        teamAssignments: isAdmin ? teamAssignments : undefined
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className={styles.modalHeader}>
          <h2>New Matter for {clientName}</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Matter Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="Enter matter name"
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
                {typeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
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
              <label>Responsible Attorney</label>
              <select
                value={formData.responsibleAttorney}
                onChange={(e) => setFormData({...formData, responsibleAttorney: e.target.value})}
              >
                <option value="">Select responsible attorney...</option>
                {attorneys.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.role ? `(${a.role})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Originating Attorney</label>
              <select
                value={formData.originatingAttorney}
                onChange={(e) => setFormData({...formData, originatingAttorney: e.target.value})}
              >
                <option value="">Select originating attorney...</option>
                {attorneys.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.role ? `(${a.role})` : ''}
                  </option>
                ))}
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
              <label>Default Rate/Amount</label>
              <input
                type="number"
                value={formData.billingRate}
                onChange={(e) => setFormData({...formData, billingRate: Number(e.target.value)})}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Brief description of the matter"
              rows={3}
            />
          </div>

          {/* Team Assignment Section - Admin Only */}
          {isAdmin && attorneys.length > 0 && (
            <div className={styles.formGroup}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} />
                Assign Team Members
              </label>
              
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <select
                  value={selectedAttorney}
                  onChange={(e) => {
                    setSelectedAttorney(e.target.value)
                    const att = attorneys.find(a => a.id === e.target.value)
                    if (att) setSelectedRate(att.hourlyRate || 0)
                  }}
                  style={{ flex: 2 }}
                >
                  <option value="">Select attorney...</option>
                  {attorneys.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Rate"
                  value={selectedRate || ''}
                  onChange={(e) => setSelectedRate(Number(e.target.value))}
                  style={{ flex: 1, width: '100px' }}
                />
                <button 
                  type="button" 
                  onClick={addTeamMember}
                  className={styles.saveBtn}
                  style={{ padding: '8px 16px' }}
                  disabled={!selectedAttorney}
                >
                  Add
                </button>
              </div>

              {teamAssignments.length > 0 && (
                <div style={{ 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}>
                  {teamAssignments.map((member, idx) => (
                    <div 
                      key={member.userId} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '12px',
                        padding: '10px 12px',
                        borderBottom: idx < teamAssignments.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                        background: 'rgba(255,255,255,0.02)'
                      }}
                    >
                      <span style={{ flex: 1 }}>{member.name}</span>
                      <span style={{ color: '#94A3B8', fontSize: '14px' }}>$</span>
                      <input
                        type="number"
                        value={member.billingRate}
                        onChange={(e) => updateTeamMemberRate(member.userId, Number(e.target.value))}
                        style={{ width: '80px', padding: '4px 8px' }}
                      />
                      <span style={{ color: '#94A3B8', fontSize: '14px' }}>/hr</span>
                      <button
                        type="button"
                        onClick={() => removeTeamMember(member.userId)}
                        style={{ 
                          background: 'transparent', 
                          border: 'none', 
                          cursor: 'pointer',
                          color: '#EF4444',
                          padding: '4px'
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Matter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// New Invoice Modal
function NewInvoiceModal({ clientId, clientName, clientMatters, onClose, onSave }: {
  clientId: string
  clientName: string
  clientMatters: any[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    clientId: clientId,
    matterId: clientMatters[0]?.id || '',
    issueDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    notes: '',
    lineItems: [{ description: 'Professional Legal Services', quantity: 1, rate: 0, amount: 0 }]
  })

  const addLineItem = () => {
    setFormData({
      ...formData,
      lineItems: [...formData.lineItems, { description: '', quantity: 1, rate: 0, amount: 0 }]
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
    
    if (field === 'quantity' || field === 'rate') {
      newLineItems[index].amount = newLineItems[index].quantity * newLineItems[index].rate
    }
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
      await onSave({ 
        ...formData, 
        total: totalAmount,
        issueDate: new Date(formData.issueDate).toISOString(),
        dueDate: new Date(formData.dueDate).toISOString()
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className={styles.modalHeader}>
          <h2>New Invoice for {clientName}</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Matter (optional)</label>
            <select
              value={formData.matterId}
              onChange={(e) => setFormData({...formData, matterId: e.target.value})}
            >
              <option value="">No specific matter</option>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ margin: 0 }}>Line Items</label>
              <button type="button" onClick={addLineItem} className={styles.addBtn}>
                <Plus size={14} />
                Add Item
              </button>
            </div>
            
            <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                padding: '10px 12px', 
                background: 'rgba(255,255,255,0.05)',
                fontSize: '0.75rem',
                color: 'var(--apex-text)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                <span style={{ flex: 2 }}>Description</span>
                <span style={{ width: '70px', textAlign: 'center' }}>Qty</span>
                <span style={{ width: '100px', textAlign: 'right' }}>Rate</span>
                <span style={{ width: '100px', textAlign: 'right' }}>Amount</span>
                <span style={{ width: '32px' }}></span>
              </div>
              
              {formData.lineItems.map((item, index) => (
                <div key={index} style={{ 
                  display: 'flex', 
                  gap: '8px', 
                  padding: '8px 12px',
                  alignItems: 'center',
                  borderTop: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                    placeholder="Description"
                    style={{ flex: 2 }}
                    required
                  />
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.5"
                    style={{ width: '70px', textAlign: 'center' }}
                  />
                  <input
                    type="number"
                    value={item.rate}
                    onChange={(e) => updateLineItem(index, 'rate', parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    placeholder="$0"
                    style={{ width: '100px', textAlign: 'right' }}
                  />
                  <input
                    type="number"
                    value={item.amount}
                    onChange={(e) => updateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    style={{ width: '100px', textAlign: 'right', fontWeight: 'bold' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    disabled={formData.lineItems.length === 1}
                    style={{ 
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'transparent', 
                      border: 'none', 
                      cursor: formData.lineItems.length === 1 ? 'not-allowed' : 'pointer',
                      color: formData.lineItems.length === 1 ? '#666' : '#EF4444',
                      opacity: formData.lineItems.length === 1 ? 0.5 : 1
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: '16px',
                padding: '12px',
                background: 'rgba(245, 158, 11, 0.05)',
                borderTop: '1px solid rgba(255,255,255,0.1)'
              }}>
                <span style={{ color: 'var(--apex-text)' }}>Total:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--apex-gold-bright)', minWidth: '100px', textAlign: 'right' }}>
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
              rows={2}
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
      </div>
    </div>
  )
}
