import { useMemo, useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { 
  Building2, User, ChevronLeft, Edit2, MoreVertical, 
  Briefcase, DollarSign, FileText, Mail, Phone, MapPin, Plus,
  Sparkles, Archive, Trash2, X, CheckCircle2, Clock, AlertCircle, ChevronDown,
  TrendingUp, Search, Filter
} from 'lucide-react'
import { teamApi } from '../services/api'
import { useAIChat } from '../contexts/AIChatContext'
import { format, parseISO, addDays } from 'date-fns'
import { parseAsLocalDate, localDateToISO } from '../utils/dateUtils'
import { clsx } from 'clsx'
import styles from './DetailPage.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'

// Client status options
const clientStatusOptions = [
  { value: 'active', label: 'Active', color: 'var(--apex-success)' },
  { value: 'inactive', label: 'Inactive', color: 'var(--apex-muted)' }
]

export function ClientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { 
    clients, matters, invoices, documents, timeEntries,
    updateClient, deleteClient, fetchClients,
    addMatter, fetchMatters,
    addInvoice, fetchInvoices,
    addTimeEntry, fetchTimeEntries, updateTimeEntry, deleteTimeEntry
  } = useDataStore()
  const { openChat } = useAIChat()
  const [activeTab, setActiveTab] = useState('overview')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNewMatterModal, setShowNewMatterModal] = useState(false)
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false)
  const [showNewTimeEntryModal, setShowNewTimeEntryModal] = useState(false)
  const [editingTimeEntry, setEditingTimeEntry] = useState<any>(null)
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const statusDropdownRef = useRef<HTMLDivElement>(null)
  
  // Quick time entry state
  const [quickTimeMinutes, setQuickTimeMinutes] = useState(5)
  const [quickTimeNotes, setQuickTimeNotes] = useState('')
  const [quickTimeSaving, setQuickTimeSaving] = useState(false)
  const [selectedMatterForTime, setSelectedMatterForTime] = useState<string>('')
  
  // Time entry selection for billing
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<string[]>([])
  const [showBillEntriesModal, setShowBillEntriesModal] = useState(false)
  
  // Time entries filter state
  const [timeEntriesSearch, setTimeEntriesSearch] = useState('')
  const [timeEntriesFilterStatus, setTimeEntriesFilterStatus] = useState<'all' | 'billed' | 'unbilled'>('all')
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmText: string
    type: 'danger' | 'warning' | 'success' | 'info'
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    type: 'danger',
    onConfirm: () => {}
  })

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false)
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

  // Get all time entries for this client's matters
  const clientMatterIds = useMemo(() => clientMatters.map(m => m.id), [clientMatters])
  
  const clientTimeEntries = useMemo(() => 
    timeEntries
      .filter(t => clientMatterIds.includes(t.matterId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [timeEntries, clientMatterIds]
  )

  // Filtered time entries based on search and filters
  const filteredTimeEntries = useMemo(() => {
    return clientTimeEntries.filter(entry => {
      // Search filter
      if (timeEntriesSearch) {
        const searchLower = timeEntriesSearch.toLowerCase()
        const matter = entry.matterId ? matters.find(m => m.id === entry.matterId) : null
        const matterName = matter?.name?.toLowerCase() || ''
        const description = (entry.description || '').toLowerCase()
        
        const matchesSearch = 
          description.includes(searchLower) ||
          matterName.includes(searchLower)
        
        if (!matchesSearch) return false
      }
      
      // Status filter
      if (timeEntriesFilterStatus === 'billed' && !entry.billed) return false
      if (timeEntriesFilterStatus === 'unbilled' && entry.billed) return false
      
      return true
    })
  }, [clientTimeEntries, timeEntriesSearch, timeEntriesFilterStatus, matters])

  const timeStats = useMemo(() => {
    const totalHours = clientTimeEntries.reduce((sum, t) => sum + t.hours, 0)
    const billableHours = clientTimeEntries.filter(t => t.billable).reduce((sum, t) => sum + t.hours, 0)
    const totalBilled = clientTimeEntries.filter(t => t.billed).reduce((sum, t) => sum + t.amount, 0)
    const totalUnbilled = clientTimeEntries.filter(t => !t.billed && t.billable).reduce((sum, t) => sum + t.amount, 0)
    
    return { totalHours, billableHours, totalBilled, totalUnbilled }
  }, [clientTimeEntries])

  const stats = useMemo(() => {
    const totalMatters = clientMatters.length
    const activeMatters = clientMatters.filter(m => m.status === 'active').length
    const totalBilled = clientInvoices.reduce((sum, i) => sum + i.total, 0)
    const totalPaid = clientInvoices.reduce((sum, i) => sum + i.amountPaid, 0)
    const outstanding = totalBilled - totalPaid
    
    return { totalMatters, activeMatters, totalBilled, totalPaid, outstanding }
  }, [clientMatters, clientInvoices])

  // Handle quick time entry save for client
  const handleQuickTimeSave = async () => {
    if (quickTimeMinutes <= 0 || !selectedMatterForTime) return
    setQuickTimeSaving(true)
    try {
      const selectedMatter = clientMatters.find(m => m.id === selectedMatterForTime)
      await addTimeEntry({
        matterId: selectedMatterForTime,
        date: new Date().toISOString(),
        hours: quickTimeMinutes / 60, // Convert minutes to hours
        description: quickTimeNotes || `Quick time entry - ${quickTimeMinutes} minutes`,
        billable: true,
        billed: false,
        rate: selectedMatter?.billingRate || 0,
        aiGenerated: false,
        status: 'pending',
        entryType: 'manual',
        updatedAt: new Date().toISOString()
      } as any)
      // Reset form
      setQuickTimeMinutes(10)
      setQuickTimeNotes('')
      // Refresh time entries
      await fetchTimeEntries({ limit: 500 })
    } catch (error) {
      console.error('Failed to save quick time entry:', error)
      alert('Failed to save time entry')
    } finally {
      setQuickTimeSaving(false)
    }
  }

  // Auto-select first matter if available
  useEffect(() => {
    if (clientMatters.length > 0 && !selectedMatterForTime) {
      setSelectedMatterForTime(clientMatters[0].id)
    }
  }, [clientMatters, selectedMatterForTime])

  // Fetch time entries on mount
  useEffect(() => {
    fetchTimeEntries({ limit: 500 })
  }, [])

  // Handle time entry delete
  const handleDeleteTimeEntry = async (entryId: string) => {
    const entry = clientTimeEntries.find(e => e.id === entryId)
    setConfirmModal({
      isOpen: true,
      title: 'Delete Time Entry',
      message: `Are you sure you want to delete this time entry? (${entry?.hours || 0} hours - $${entry?.amount?.toLocaleString() || 0})`,
      confirmText: 'Delete',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteTimeEntry(entryId)
          await fetchTimeEntries({ limit: 500 })
          setConfirmModal(prev => ({ ...prev, isOpen: false }))
        } catch (error) {
          console.error('Failed to delete time entry:', error)
          alert('Failed to delete time entry')
        }
      }
    })
  }

  // Toggle time entry selection for billing
  const toggleTimeEntrySelection = (entryId: string) => {
    setSelectedTimeEntries(prev => 
      prev.includes(entryId) 
        ? prev.filter(id => id !== entryId)
        : [...prev, entryId]
    )
  }

  // Select all unbilled entries
  const toggleAllUnbilledEntries = () => {
    const unbilledIds = clientTimeEntries.filter(e => !e.billed && e.billable).map(e => e.id)
    const allSelected = unbilledIds.every(id => selectedTimeEntries.includes(id))
    if (allSelected) {
      setSelectedTimeEntries([])
    } else {
      setSelectedTimeEntries(unbilledIds)
    }
  }

  // Get selected entries total
  const selectedEntriesTotal = useMemo(() => {
    return clientTimeEntries
      .filter(e => selectedTimeEntries.includes(e.id))
      .reduce((sum, e) => sum + e.amount, 0)
  }, [clientTimeEntries, selectedTimeEntries])

  const selectedEntriesHours = useMemo(() => {
    return clientTimeEntries
      .filter(e => selectedTimeEntries.includes(e.id))
      .reduce((sum, e) => sum + e.hours, 0)
  }, [clientTimeEntries, selectedTimeEntries])

  const unbilledEntries = useMemo(() => {
    return filteredTimeEntries.filter(e => !e.billed && e.billable)
  }, [filteredTimeEntries])

  // Get matter name for time entry
  const getMatterName = (matterId: string) => {
    const matter = clientMatters.find(m => m.id === matterId)
    return matter?.name || 'Unknown Matter'
  }

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
                    onClick={() => {
                      setShowDropdown(false)
                      setConfirmModal({
                        isOpen: true,
                        title: 'Delete Client',
                        message: `Are you sure you want to delete "${client.name}"? This action cannot be undone and will remove all associated matters, invoices, and documents.`,
                        confirmText: 'Delete Client',
                        type: 'danger',
                        onConfirm: async () => {
                          try {
                            await deleteClient(id!)
                            setConfirmModal(prev => ({ ...prev, isOpen: false }))
                            navigate('/app/clients')
                          } catch (error) {
                            console.error('Failed to delete client:', error)
                            alert('Failed to delete client')
                          }
                        }
                      })
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
              <div className={styles.statusDropdownWrapper} ref={statusDropdownRef}>
                <button 
                  className={clsx(styles.statusBadge, styles.clickable, styles[client.isActive ? 'active' : 'inactive'])}
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                >
                  {client.isActive ? 'Active' : 'Inactive'}
                  <ChevronDown size={12} />
                </button>
                {showStatusDropdown && (
                  <div className={styles.statusDropdown}>
                    {clientStatusOptions.map(option => (
                      <button
                        key={option.value}
                        className={clsx(
                          styles.statusOption,
                          (client.isActive ? 'active' : 'inactive') === option.value && styles.selected
                        )}
                        onClick={async () => {
                          await updateClient(id!, { 
                            isActive: option.value === 'active'
                          })
                          setShowStatusDropdown(false)
                          fetchClients()
                        }}
                      >
                        <span className={styles.statusDot} style={{ background: option.color }} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

        {/* Quick Time Entry - only show if client has matters */}
        {clientMatters.length > 0 && (
          <div className={styles.quickTimeWidget}>
            <span className={styles.quickTimeLabel}>
              <Plus size={14} />
              Quick Time
            </span>
            <select
              value={selectedMatterForTime}
              onChange={(e) => setSelectedMatterForTime(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                background: 'var(--apex-deep)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--apex-white)',
                fontSize: '0.875rem',
                maxWidth: '200px'
              }}
            >
              {clientMatters.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <div className={styles.quickTimeControls}>
              <button 
                className={styles.quickTimeBtn}
                onClick={() => setQuickTimeMinutes(Math.max(0, quickTimeMinutes - 5))}
              >
                −
              </button>
              <div className={styles.quickTimeDisplay}>
                <Clock size={14} />
                {quickTimeMinutes} min
              </div>
              <button 
                className={styles.quickTimeBtn}
                onClick={() => setQuickTimeMinutes(quickTimeMinutes + 5)}
              >
                +
              </button>
            </div>
            <input
              type="text"
              className={styles.quickTimeNotes}
              placeholder="What did you work on?"
              value={quickTimeNotes}
              onChange={(e) => setQuickTimeNotes(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleQuickTimeSave()}
            />
            <button 
              className={styles.quickTimeSave}
              onClick={handleQuickTimeSave}
              disabled={quickTimeMinutes <= 0 || !selectedMatterForTime || quickTimeSaving}
            >
              {quickTimeSaving ? 'Saving...' : 'Add Time'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {['overview', 'matters', 'time', 'billing', 'documents'].map(tab => (
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

            {/* Notes Card - Always visible */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3><FileText size={18} /> Notes</h3>
                <button 
                  className={styles.addBtn}
                  onClick={() => setShowEditModal(true)}
                >
                  <Edit2 size={14} />
                  Edit
                </button>
              </div>
              <div className={styles.notesContent}>
                {client.notes ? (
                  <p style={{ 
                    whiteSpace: 'pre-wrap', 
                    color: 'var(--apex-white)',
                    lineHeight: '1.6',
                    margin: 0
                  }}>
                    {client.notes}
                  </p>
                ) : (
                  <p className={styles.noData} style={{ margin: 0 }}>
                    No notes yet. Click Edit to add notes about this client.
                  </p>
                )}
              </div>
            </div>

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
                    <span className={styles.matterType}>{(matter.type || 'other').replace(/_/g, ' ')}</span>
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
                      <td style={{ textTransform: 'capitalize' }}>{(matter.type || 'other').replace(/_/g, ' ')}</td>
                      <td>
                        <span className={clsx(styles.badge, styles[matter.status])}>
                          {matter.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>{matter.openDate ? format(parseISO(matter.openDate), 'MMM d, yyyy') : '—'}</td>
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

        {activeTab === 'time' && (
          <div className={styles.timeTab}>
            <div className={styles.tabHeader}>
              <h2>Time Entries</h2>
              <div className={styles.tabActions}>
                <button 
                  className={styles.primaryBtn}
                  onClick={() => setShowNewTimeEntryModal(true)}
                  disabled={clientMatters.length === 0}
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
                  <span className={styles.timeStatValue}>{timeStats.totalHours.toFixed(1)}h</span>
                  <span className={styles.timeStatLabel}>Total Hours</span>
                </div>
              </div>
              <div className={styles.timeStat}>
                <TrendingUp size={20} />
                <div>
                  <span className={styles.timeStatValue}>{timeStats.billableHours.toFixed(1)}h</span>
                  <span className={styles.timeStatLabel}>Billable</span>
                </div>
              </div>
              <div className={styles.timeStat}>
                <DollarSign size={20} />
                <div>
                  <span className={styles.timeStatValue}>${timeStats.totalUnbilled.toLocaleString()}</span>
                  <span className={styles.timeStatLabel}>Unbilled</span>
                </div>
              </div>
              <div className={styles.timeStat}>
                <CheckCircle2 size={20} />
                <div>
                  <span className={styles.timeStatValue}>${timeStats.totalBilled.toLocaleString()}</span>
                  <span className={styles.timeStatLabel}>Billed</span>
                </div>
              </div>
            </div>

            {/* Selection Bar */}
            {selectedTimeEntries.length > 0 && (
              <div className={styles.selectionBar}>
                <div className={styles.selectionInfo}>
                  <CheckCircle2 size={18} />
                  <span>{selectedTimeEntries.length} entries selected</span>
                  <span className={styles.selectionAmount}>
                    {selectedEntriesHours.toFixed(1)}h • ${selectedEntriesTotal.toLocaleString()}
                  </span>
                </div>
                <div className={styles.selectionActions}>
                  <button 
                    className={styles.clearSelectionBtn}
                    onClick={() => setSelectedTimeEntries([])}
                  >
                    Clear
                  </button>
                  <button 
                    className={styles.createInvoiceBtn}
                    onClick={() => setShowBillEntriesModal(true)}
                  >
                    <FileText size={16} />
                    Create Invoice
                  </button>
                </div>
              </div>
            )}

            {/* Select All Unbilled */}
            {unbilledEntries.length > 0 && selectedTimeEntries.length === 0 && (
              <div className={styles.selectAllBar}>
                <button 
                  className={styles.selectAllBtn}
                  onClick={toggleAllUnbilledEntries}
                >
                  Select All Unbilled ({unbilledEntries.length})
                </button>
              </div>
            )}

            {/* Search and Filter Bar */}
            {clientTimeEntries.length > 0 && (
              <div className={styles.filterBar}>
                <div className={styles.searchInputWrapper}>
                  <Search size={16} className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search by description or matter..."
                    value={timeEntriesSearch}
                    onChange={(e) => setTimeEntriesSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                  {timeEntriesSearch && (
                    <button 
                      className={styles.clearSearchBtn}
                      onClick={() => setTimeEntriesSearch('')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className={styles.filterControls}>
                  <select
                    value={timeEntriesFilterStatus}
                    onChange={(e) => setTimeEntriesFilterStatus(e.target.value as 'all' | 'billed' | 'unbilled')}
                    className={styles.filterSelect}
                  >
                    <option value="all">All Status</option>
                    <option value="unbilled">Unbilled</option>
                    <option value="billed">Billed</option>
                  </select>
                  {(timeEntriesSearch || timeEntriesFilterStatus !== 'all') && (
                    <button 
                      className={styles.clearFiltersBtn}
                      onClick={() => {
                        setTimeEntriesSearch('')
                        setTimeEntriesFilterStatus('all')
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
                {filteredTimeEntries.length !== clientTimeEntries.length && (
                  <span className={styles.filterCount}>
                    Showing {filteredTimeEntries.length} of {clientTimeEntries.length} entries
                  </span>
                )}
              </div>
            )}

            {clientMatters.length === 0 ? (
              <div className={styles.emptyTime}>
                <Briefcase size={48} />
                <p>No matters for this client yet</p>
                <button 
                  className={styles.primaryBtn} 
                  onClick={() => setShowNewMatterModal(true)}
                >
                  <Plus size={18} />
                  Create First Matter
                </button>
              </div>
            ) : clientTimeEntries.length === 0 ? (
              <div className={styles.emptyTime}>
                <Clock size={48} />
                <p>No time entries yet</p>
                <button 
                  className={styles.primaryBtn} 
                  onClick={() => setShowNewTimeEntryModal(true)}
                >
                  <Plus size={18} />
                  Log First Time Entry
                </button>
              </div>
            ) : filteredTimeEntries.length === 0 ? (
              <div className={styles.emptyTime}>
                <Filter size={48} />
                <p>No entries match your filters</p>
                <button 
                  className={styles.primaryBtn} 
                  onClick={() => {
                    setTimeEntriesSearch('')
                    setTimeEntriesFilterStatus('all')
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className={styles.timeEntryCards}>
                {filteredTimeEntries.map(entry => (
                  <div 
                    key={entry.id} 
                    className={clsx(
                      styles.timeEntryCard,
                      selectedTimeEntries.includes(entry.id) && styles.selected
                    )}
                  >
                    {/* Checkbox for unbilled entries */}
                    {!entry.billed && entry.billable && (
                      <div className={styles.entryCheckbox}>
                        <input
                          type="checkbox"
                          checked={selectedTimeEntries.includes(entry.id)}
                          onChange={() => toggleTimeEntrySelection(entry.id)}
                        />
                      </div>
                    )}
                    <div className={styles.timeEntryDate}>
                      <span className={styles.timeEntryDay}>
                        {format(parseAsLocalDate(entry.date), 'd')}
                      </span>
                      <span className={styles.timeEntryMonth}>
                        {format(parseAsLocalDate(entry.date), 'MMM')}
                      </span>
                    </div>
                    <div className={styles.timeEntryContent}>
                      <span className={styles.timeEntryDesc}>{entry.description || 'No description'}</span>
                      <div className={styles.timeEntryMeta}>
                        <Link to={`/app/matters/${entry.matterId}`} style={{ color: 'var(--apex-gold-bright)' }}>
                          {getMatterName(entry.matterId)}
                        </Link>
                        <span style={{ marginLeft: '8px' }}>{entry.hours}h @ ${entry.rate}/hr</span>
                      </div>
                    </div>
                    <div className={styles.timeEntryRight}>
                      <span className={styles.timeEntryAmount}>${entry.amount.toLocaleString()}</span>
                      <span className={clsx(styles.badge, entry.billed ? styles.billed : styles.unbilled)}>
                        {entry.billed ? 'Billed' : 'Unbilled'}
                      </span>
                    </div>
                    <div className={styles.cardActions} style={{ marginLeft: '12px' }}>
                      <button 
                        className={styles.iconBtn}
                        onClick={() => setEditingTimeEntry(entry)}
                        title="Edit"
                        style={{ padding: '6px' }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className={styles.iconBtn}
                        onClick={() => handleDeleteTimeEntry(entry.id)}
                        title="Delete"
                        style={{ padding: '6px', color: 'var(--apex-error)' }}
                      >
                        <Trash2 size={14} />
                      </button>
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
          clientId={client.id}
          clientName={client.name}
          onClose={() => setShowNewMatterModal(false)}
          onSave={async (data) => {
            await addMatter(data)
            setShowNewMatterModal(false)
            fetchMatters()
          }}
        />
      )}

      {/* New Invoice Modal */}
      {showNewInvoiceModal && (
        <NewInvoiceModal
          clientId={client.id}
          clientName={client.name}
          clientMatters={clientMatters}
          onClose={() => setShowNewInvoiceModal(false)}
          onSave={async (data) => {
            await addInvoice(data)
            setShowNewInvoiceModal(false)
            fetchInvoices()
          }}
        />
      )}

      {/* New Time Entry Modal */}
      {showNewTimeEntryModal && (
        <TimeEntryModal
          clientName={client.name}
          clientMatters={clientMatters}
          onClose={() => setShowNewTimeEntryModal(false)}
          onSave={async (data) => {
            await addTimeEntry(data)
            setShowNewTimeEntryModal(false)
            await fetchTimeEntries({ limit: 500 })
          }}
        />
      )}

      {/* Edit Time Entry Modal */}
      {editingTimeEntry && (
        <TimeEntryModal
          clientName={client.name}
          clientMatters={clientMatters}
          existingEntry={editingTimeEntry}
          onClose={() => setEditingTimeEntry(null)}
          onSave={async (data) => {
            await updateTimeEntry(editingTimeEntry.id, data)
            setEditingTimeEntry(null)
            await fetchTimeEntries({ limit: 500 })
          }}
        />
      )}

      {/* Bill Time Entries Modal */}
      {showBillEntriesModal && client && (
        <ClientBillEntriesModal
          onClose={() => {
            setShowBillEntriesModal(false)
            setSelectedTimeEntries([])
          }}
          selectedEntries={clientTimeEntries.filter(e => selectedTimeEntries.includes(e.id))}
          client={client}
          matters={clientMatters}
          onCreateInvoice={async (invoiceData) => {
            try {
              await addInvoice(invoiceData)
              // Mark entries as billed
              for (const entryId of selectedTimeEntries) {
                await updateTimeEntry(entryId, { billed: true })
              }
              await fetchTimeEntries({ limit: 500 })
              await fetchInvoices()
              setSelectedTimeEntries([])
              setShowBillEntriesModal(false)
            } catch (error) {
              console.error('Failed to create invoice:', error)
              alert('Failed to create invoice. Please try again.')
            }
          }}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        type={confirmModal.type}
      />
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
function NewMatterModal({ clientId, clientName, onClose, onSave }: {
  clientId: string
  clientName: string
  onClose: () => void
  onSave: (data: any) => Promise<void>
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
    openDate: new Date().toISOString()
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!formData.name.trim()) {
      alert('Please enter a matter name')
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
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>New Matter for {clientName}</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Matter Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., Contract Dispute - ABC Corp"
              required
              autoFocus
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Matter Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
              >
                <option value="litigation">Litigation</option>
                <option value="corporate">Corporate</option>
                <option value="real_estate">Real Estate</option>
                <option value="intellectual_property">Intellectual Property</option>
                <option value="employment">Employment</option>
                <option value="personal_injury">Personal Injury</option>
                <option value="estate_planning">Estate Planning</option>
                <option value="other">Other</option>
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
                <option value="flat_fee">Flat Fee</option>
                <option value="contingency">Contingency</option>
                <option value="retainer">Retainer</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Billing Rate ($/hr)</label>
              <input
                type="number"
                value={formData.billingRate}
                onChange={(e) => setFormData({...formData, billingRate: parseInt(e.target.value) || 0})}
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
      </div>
    </div>
  )
}

// Client Bill Entries Modal - Creates invoice from selected time entries
function ClientBillEntriesModal({ 
  onClose, 
  selectedEntries, 
  client,
  matters,
  onCreateInvoice 
}: { 
  onClose: () => void
  selectedEntries: any[]
  client: any
  matters: any[]
  onCreateInvoice: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedMatterId, setSelectedMatterId] = useState<string>('')

  const totalAmount = selectedEntries.reduce((sum, e) => sum + e.amount, 0)
  const totalHours = selectedEntries.reduce((sum, e) => sum + e.hours, 0)

  // Group entries by matter for preview
  const entriesByMatter = useMemo(() => {
    const groups: Record<string, { matter: any, entries: any[], total: number, hours: number }> = {}
    
    selectedEntries.forEach(entry => {
      const matter = matters.find(m => m.id === entry.matterId)
      const matterId = entry.matterId || 'no-matter'
      
      if (!groups[matterId]) {
        groups[matterId] = {
          matter,
          entries: [],
          total: 0,
          hours: 0
        }
      }
      groups[matterId].entries.push(entry)
      groups[matterId].total += entry.amount
      groups[matterId].hours += entry.hours
    })
    
    return Object.values(groups)
  }, [selectedEntries, matters])

  // Get unique matter IDs from selected entries
  const uniqueMatters = useMemo(() => {
    const matterIds = [...new Set(selectedEntries.map(e => e.matterId))]
    return matterIds.map(id => matters.find(m => m.id === id)).filter(Boolean)
  }, [selectedEntries, matters])

  // Auto-select first matter if only one
  useEffect(() => {
    if (uniqueMatters.length === 1) {
      setSelectedMatterId(uniqueMatters[0].id)
    }
  }, [uniqueMatters])

  const handleCreateInvoice = async () => {
    setIsSubmitting(true)
    try {
      const lineItems = selectedEntries.map(entry => {
        const matter = matters.find(m => m.id === entry.matterId)
        return {
          description: `${matter?.name || 'Legal Services'}: ${entry.description || 'Services rendered'}`,
          quantity: entry.hours,
          rate: entry.rate,
          amount: entry.amount
        }
      })
      
      await onCreateInvoice({
        clientId: client.id,
        matterId: selectedMatterId || uniqueMatters[0]?.id,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'draft',
        subtotal: totalAmount,
        total: totalAmount,
        amountPaid: 0,
        lineItems,
        timeEntryIds: selectedEntries.map(e => e.id)
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.billModal} onClick={e => e.stopPropagation()}>
        <div className={styles.billModalHeader}>
          <div className={styles.billModalTitle}>
            <FileText size={20} />
            <h2>Create Invoice</h2>
          </div>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        
        <div className={styles.billModalContent}>
          {/* Client Info */}
          <div className={styles.billClientInfo}>
            <div><strong>Client:</strong> {client.name}</div>
            {uniqueMatters.length === 1 && (
              <div><strong>Matter:</strong> {uniqueMatters[0].name}</div>
            )}
          </div>

          {/* Matter Selection if multiple */}
          {uniqueMatters.length > 1 && (
            <div className={styles.formGroup}>
              <label>Primary Matter for Invoice</label>
              <select
                value={selectedMatterId}
                onChange={(e) => setSelectedMatterId(e.target.value)}
              >
                <option value="">Select matter...</option>
                {uniqueMatters.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Summary Stats */}
          <div className={styles.billSummaryCompact}>
            <div className={styles.billStatItem}>
              <span className={styles.billStatValue}>{selectedEntries.length}</span>
              <span className={styles.billStatLabel}>Entries</span>
            </div>
            <div className={styles.billStatDivider} />
            <div className={styles.billStatItem}>
              <span className={styles.billStatValue}>{totalHours.toFixed(1)}h</span>
              <span className={styles.billStatLabel}>Hours</span>
            </div>
            <div className={styles.billStatDivider} />
            <div className={styles.billStatItem}>
              <span className={styles.billStatValue}>${totalAmount.toLocaleString()}</span>
              <span className={styles.billStatLabel}>Total</span>
            </div>
          </div>

          {/* Preview by Matter */}
          <div className={styles.billPreviewList}>
            <div className={styles.billPreviewHeader}>Time Entries by Matter</div>
            <div className={styles.billPreviewItems}>
              {entriesByMatter.map((group, i) => (
                <div key={i} className={styles.billPreviewItem}>
                  <div className={styles.billPreviewItemLeft}>
                    <span className={styles.billPreviewDesc}>{group.matter?.name || 'Unknown Matter'}</span>
                    <span className={styles.billPreviewMeta}>{group.entries.length} entries</span>
                  </div>
                  <div className={styles.billPreviewItemRight}>
                    <span className={styles.billPreviewHours}>{group.hours.toFixed(1)}h</span>
                    <span className={styles.billPreviewAmount}>${group.total.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info Note */}
          <div className={styles.billNote}>
            <span>Invoice created as draft • Time entries marked as billed</span>
          </div>
        </div>

        <div className={styles.billModalFooter}>
          <button onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
            Cancel
          </button>
          <button 
            onClick={handleCreateInvoice} 
            className={styles.saveBtn}
            disabled={isSubmitting || selectedEntries.length === 0}
          >
            {isSubmitting ? 'Creating...' : `Create Invoice ($${totalAmount.toLocaleString()})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// Time Entry Modal
function TimeEntryModal({ clientName, clientMatters, existingEntry, onClose, onSave }: {
  clientName: string
  clientMatters: any[]
  existingEntry?: any
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    matterId: existingEntry?.matterId || clientMatters[0]?.id || '',
    date: existingEntry?.date ? format(parseAsLocalDate(existingEntry.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    hours: existingEntry?.hours || 1,
    rate: existingEntry?.rate || clientMatters[0]?.billingRate || 450,
    description: existingEntry?.description || '',
    billable: existingEntry?.billable !== undefined ? existingEntry.billable : true
  })

  // Update rate when matter changes
  const handleMatterChange = (matterId: string) => {
    const matter = clientMatters.find(m => m.id === matterId)
    setFormData({
      ...formData,
      matterId,
      rate: matter?.billingRate || formData.rate
    })
  }

  // Convert date string to ISO format preserving the local date
  const dateToISO = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day, 12, 0, 0)
    return date.toISOString()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!formData.matterId) {
      alert('Please select a matter')
      return
    }
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        date: dateToISO(formData.date),
        billed: existingEntry?.billed || false,
        aiGenerated: false
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedMatter = clientMatters.find(m => m.id === formData.matterId)

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{existingEntry ? 'Edit Time Entry' : 'New Time Entry'}</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formInfo}>
            <strong>Client:</strong> {clientName}
          </div>

          <div className={styles.formGroup}>
            <label>Matter *</label>
            <select
              value={formData.matterId}
              onChange={(e) => handleMatterChange(e.target.value)}
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
            <label>Description (optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe the work performed..."
              rows={3}
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
              {isSubmitting ? 'Saving...' : (existingEntry ? 'Update Time Entry' : 'Save Time Entry')}
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
    dueDate: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
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
        status: 'draft',
        amountPaid: 0,
        subtotal: totalAmount,
        issueDate: new Date(formData.issueDate).toISOString(),
        dueDate: new Date(formData.dueDate).toISOString()
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className={styles.modalHeader}>
          <h2>New Invoice for {clientName}</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {clientMatters.length > 0 && (
            <div className={styles.formGroup}>
              <label>Related Matter</label>
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
          )}

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
            <label>Line Items</label>
            <div className={styles.lineItems}>
              {formData.lineItems.map((item, index) => (
                <div key={index} className={styles.lineItem}>
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    style={{ width: '60px' }}
                  />
                  <input
                    type="number"
                    placeholder="Rate"
                    value={item.rate}
                    onChange={(e) => updateLineItem(index, 'rate', parseFloat(e.target.value) || 0)}
                    style={{ width: '80px' }}
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={item.amount}
                    onChange={(e) => updateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                    style={{ width: '100px' }}
                  />
                  {formData.lineItems.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => removeLineItem(index)}
                      className={styles.removeLineBtn}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addLineItem} className={styles.addLineBtn}>
                <Plus size={14} /> Add Line Item
              </button>
            </div>
          </div>

          <div className={styles.invoiceTotal}>
            <span>Total:</span>
            <span>${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          <div className={styles.formGroup}>
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Additional notes for the invoice..."
              rows={2}
            />
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : `Create Invoice ($${totalAmount.toLocaleString()})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
