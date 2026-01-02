import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { useAIChat } from '../contexts/AIChatContext'
import { teamApi } from '../services/api'
import { 
  Plus, Search, Filter, ChevronDown, Briefcase, 
  MoreVertical, Sparkles, Calendar, DollarSign, Users, X,
  Edit2, Archive, CheckCircle2, Trash2, Eye, XCircle, FileText, Settings
} from 'lucide-react'
import { MatterTypesManager } from '../components/MatterTypesManager'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './ListPages.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'

const statusOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' }
]

// View options - "All Matters" only available to admins
const getViewOptions = (isAdmin: boolean) => {
  const options = [{ value: 'my', label: 'My Matters' }]
  if (isAdmin) {
    options.push({ value: 'all', label: 'All Matters' })
  }
  return options
}

export function MattersPage() {
  const { matters, clients, addMatter, fetchMatters, fetchClients, updateMatter, deleteMatter, matterTypes } = useDataStore()
  const { user, hasPermission } = useAuthStore()
  const { openChat } = useAIChat()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [attorneys, setAttorneys] = useState<any[]>([])
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [prefilledClientId, setPrefilledClientId] = useState<string | null>(null)
  const [viewFilter, setViewFilter] = useState<'my' | 'all'>('my') // Default to "My Matters"

  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  const canDeleteMatters = hasPermission('matters:delete')

  // Generate type options from the store's matterTypes
  const typeOptions = useMemo(() => {
    const activeTypes = matterTypes
      .filter(t => t.active)
      .map(t => ({ value: t.value, label: t.label }))
    return [{ value: 'all', label: 'All Types' }, ...activeTypes]
  }, [matterTypes])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch data when component mounts or view filter changes
  useEffect(() => {
    fetchMatters({ view: viewFilter })
    fetchClients()
    
    // Fetch attorneys for attorney selection dropdowns
    teamApi.getAttorneys()
      .then(data => setAttorneys(data.attorneys || []))
      .catch(err => console.log('Could not fetch attorneys:', err))
  }, [viewFilter])
  const [statusFilter, setStatusFilter] = useState('active')  // Default to active matters
  const [typeFilter, setTypeFilter] = useState('all')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showTypesManager, setShowTypesManager] = useState(false)
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    matterId: string
    matterName: string
    action: 'delete' | 'archive' | 'hold' | 'reactivate'
  }>({ isOpen: false, matterId: '', matterName: '', action: 'delete' })
  
  // Handle URL query parameters for opening new matter modal
  useEffect(() => {
    const action = searchParams.get('action')
    const clientId = searchParams.get('clientId')
    
    if (action === 'new') {
      setShowNewModal(true)
      if (clientId) {
        setPrefilledClientId(clientId)
      }
      // Clear query params after processing
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  const handleStatusChange = async (matterId: string, newStatus: 'intake' | 'pending_conflict' | 'active' | 'pending' | 'on_hold' | 'closed_won' | 'closed_lost' | 'closed_settled' | 'closed_dismissed' | 'closed_transferred' | 'closed_abandoned' | 'closed_other') => {
    try {
      await updateMatter(matterId, { status: newStatus })
      setOpenDropdownId(null)
      fetchMatters()
    } catch (error) {
      console.error('Failed to update matter status:', error)
      alert('Failed to update matter status')
    }
  }

  const handleDeleteMatter = async (matterId: string) => {
    try {
      await deleteMatter(matterId)
      setConfirmModal({ isOpen: false, matterId: '', matterName: '', action: 'delete' })
      setOpenDropdownId(null)
      fetchMatters()
    } catch (error) {
      console.error('Failed to delete matter:', error)
      alert('Failed to delete matter')
    }
  }

  const handleConfirmAction = async () => {
    const { action, matterId } = confirmModal
    
    switch (action) {
      case 'delete':
        await handleDeleteMatter(matterId)
        break
      case 'archive':
        await handleStatusChange(matterId, 'closed_other')
        setConfirmModal({ isOpen: false, matterId: '', matterName: '', action: 'delete' })
        break
      case 'hold':
        await handleStatusChange(matterId, 'on_hold')
        setConfirmModal({ isOpen: false, matterId: '', matterName: '', action: 'delete' })
        break
      case 'reactivate':
        await handleStatusChange(matterId, 'active')
        setConfirmModal({ isOpen: false, matterId: '', matterName: '', action: 'delete' })
        break
    }
  }

  const openConfirmModal = (matterId: string, matterName: string, action: 'delete' | 'archive' | 'hold' | 'reactivate') => {
    setConfirmModal({ isOpen: true, matterId, matterName, action })
    setOpenDropdownId(null)
  }

  const getConfirmModalContent = () => {
    const { action, matterName } = confirmModal
    switch (action) {
      case 'delete':
        return {
          title: 'Delete Matter',
          message: `Are you sure you want to delete "${matterName}"? This action cannot be undone and will remove all associated time entries, documents, and invoices.`,
          confirmText: 'Delete Matter',
          type: 'danger' as const
        }
      case 'archive':
        return {
          title: 'Archive Matter',
          message: `Are you sure you want to archive "${matterName}"? The matter will be closed and moved to your archives.`,
          confirmText: 'Archive Matter',
          type: 'warning' as const
        }
      case 'hold':
        return {
          title: 'Put on Hold',
          message: `Are you sure you want to put "${matterName}" on hold? No work should be done on this matter until it's reactivated.`,
          confirmText: 'Put on Hold',
          type: 'warning' as const
        }
      case 'reactivate':
        return {
          title: 'Reactivate Matter',
          message: `Are you sure you want to reactivate "${matterName}"? The matter will be moved back to active status.`,
          confirmText: 'Reactivate',
          type: 'success' as const
        }
      default:
        return {
          title: 'Confirm Action',
          message: 'Are you sure you want to proceed?',
          confirmText: 'Confirm',
          type: 'info' as const
        }
    }
  }

  const filteredMatters = useMemo(() => {
    return matters.filter(matter => {
      const matchesSearch = 
        (matter.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (matter.number || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || matter.status === statusFilter
      const matchesType = typeFilter === 'all' || (matter.type || 'other') === typeFilter
      return matchesSearch && matchesStatus && matchesType
    }).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  }, [matters, searchQuery, statusFilter, typeFilter])

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Unknown Client'
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>{viewFilter === 'my' ? 'My Matters' : 'All Matters'}</h1>
          <span className={styles.count}>{matters.length} {viewFilter === 'my' ? 'assigned to you' : 'total'}</span>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.aiBtn} 
            onClick={() => openChat({
              label: 'Matters',
              contextType: 'matters',
              suggestedQuestions: [
                'Give me an overview of all active matters',
                'Which matters need attention this week?',
                'Analyze billing across all matters',
                'Which matters have upcoming deadlines?',
                'Summarize matter workload by attorney'
              ]
            })}
          >
            <Sparkles size={16} />
            AI Insights
          </button>
          <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
            <Plus size={18} />
            New Matter
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        {/* View Toggle - My Matters vs All Matters (All Matters only for admins) */}
        <div className={styles.viewToggle}>
          {getViewOptions(isAdmin).map(opt => (
            <button
              key={opt.value}
              className={clsx(styles.viewToggleBtn, viewFilter === opt.value && styles.active)}
              onClick={() => setViewFilter(opt.value as 'my' | 'all')}
            >
              {opt.value === 'my' ? <Users size={14} /> : <Briefcase size={14} />}
              {opt.label}
            </button>
          ))}
        </div>

        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search matters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className={styles.filterSelect}
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select 
          value={typeFilter} 
          onChange={(e) => setTypeFilter(e.target.value)}
          className={styles.filterSelect}
        >
          {typeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button 
          className={styles.settingsBtn}
          onClick={() => setShowTypesManager(true)}
          title="Manage Matter Types"
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Matter</th>
              <th>Client</th>
              <th>Responsible Attorney</th>
              <th>Type</th>
              <th>Status</th>
              <th>Billing</th>
              <th>Opened</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredMatters.map(matter => (
              <tr key={matter.id}>
                <td>
                  <Link to={`/app/matters/${matter.id}`} className={styles.nameCell}>
                    <div className={styles.icon}>
                      <Briefcase size={16} />
                    </div>
                    <div>
                      <span className={styles.name}>{matter.name}</span>
                      <span className={styles.subtitle}>{matter.number}</span>
                    </div>
                    {matter.aiSummary && (
                      <span className={styles.aiTag}>
                        <Sparkles size={12} />
                      </span>
                    )}
                  </Link>
                </td>
                <td>
                  <Link to={`/app/clients/${matter.clientId}`} className={styles.link}>
                    {getClientName(matter.clientId)}
                  </Link>
                </td>
                <td>
                  {matter.responsibleAttorney ? (
                    <span className={styles.attorneyName}>
                      {attorneys.find(a => a.id === matter.responsibleAttorney)?.name || 'Assigned'}
                    </span>
                  ) : (
                    <span className={styles.unassigned}>Unassigned</span>
                  )}
                </td>
                <td>
                  <span className={styles.typeTag}>
                    {(matter.type || 'other').replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <select
                    className={clsx(styles.statusSelect, styles[matter.status])}
                    value={matter.status}
                    onChange={(e) => handleStatusChange(matter.id, e.target.value as any)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="intake">Intake</option>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="on_hold">On Hold</option>
                    <option value="closed">Closed</option>
                    <option value="closed_won">Closed - Won</option>
                    <option value="closed_lost">Closed - Lost</option>
                    <option value="closed_settled">Closed - Settled</option>
                    <option value="closed_other">Closed - Other</option>
                  </select>
                </td>
                <td>
                  <div className={styles.billingInfo}>
                    {matter.billingType === 'hourly' && (
                      <>${matter.billingRate}/hr</>
                    )}
                    {matter.billingType === 'flat' && (
                      <>${matter.flatFee?.toLocaleString()} flat</>
                    )}
                    {matter.billingType === 'contingency' && (
                      <>{matter.contingencyPercent}% contingency</>
                    )}
                    {matter.billingType === 'retainer' && (
                      <>${matter.retainerAmount?.toLocaleString()} retainer</>
                    )}
                  </div>
                </td>
                <td className={styles.dateCell}>
                  {matter.openDate ? format(parseISO(matter.openDate), 'MMM d, yyyy') : '—'}
                </td>
                <td>
                  <div className={styles.menuWrapper} ref={openDropdownId === matter.id ? dropdownRef : null}>
                    <button 
                      className={styles.menuBtn}
                      onClick={() => setOpenDropdownId(openDropdownId === matter.id ? null : matter.id)}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openDropdownId === matter.id && (
                      <div className={styles.dropdown}>
                        <button 
                          className={styles.dropdownItem}
                          onClick={() => {
                            setOpenDropdownId(null)
                            navigate(`/app/matters/${matter.id}`)
                          }}
                        >
                          <Eye size={14} />
                          View Details
                        </button>
                        {matter.status === 'active' && (
                          <>
                            <button 
                              className={styles.dropdownItem}
                              onClick={() => openConfirmModal(matter.id, matter.name, 'hold')}
                            >
                              <XCircle size={14} />
                              Put On Hold
                            </button>
                            <button 
                              className={clsx(styles.dropdownItem, styles.success)}
                              onClick={() => handleStatusChange(matter.id, 'closed_won')}
                            >
                              <CheckCircle2 size={14} />
                              Close - Won
                            </button>
                          </>
                        )}
                        {matter.status === 'on_hold' && (
                          <button 
                            className={styles.dropdownItem}
                            onClick={() => openConfirmModal(matter.id, matter.name, 'reactivate')}
                          >
                            <Briefcase size={14} />
                            Reactivate
                          </button>
                        )}
                        {!matter.status.startsWith('closed') && (
                          <button 
                            className={styles.dropdownItem}
                            onClick={() => openConfirmModal(matter.id, matter.name, 'archive')}
                          >
                            <Archive size={14} />
                            Archive / Close
                          </button>
                        )}
                        {canDeleteMatters && (
                          <>
                            <div className={styles.dropdownDivider} />
                            <button 
                              className={clsx(styles.dropdownItem, styles.danger)}
                              onClick={() => openConfirmModal(matter.id, matter.name, 'delete')}
                            >
                              <Trash2 size={14} />
                              Delete Matter
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredMatters.length === 0 && (
          <div className={styles.emptyState}>
            <Briefcase size={48} />
            <h3>No matters found</h3>
            <p>Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* New Matter Modal */}
      {showNewModal && (
        <NewMatterModal 
          onClose={() => {
            setShowNewModal(false)
            setPrefilledClientId(null)
          }}
          onSave={async (data) => {
            try {
              await addMatter(data)
              setShowNewModal(false)
              setPrefilledClientId(null)
              // Refresh the matters list
              fetchMatters()
            } catch (error) {
              console.error('Failed to create matter:', error)
              alert('Failed to create matter. Please try again.')
            }
          }}
          clients={clients}
          attorneys={attorneys}
          isAdmin={isAdmin}
          prefilledClientId={prefilledClientId}
          typeOptions={typeOptions.filter(t => t.value !== 'all')}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, matterId: '', matterName: '', action: 'delete' })}
        onConfirm={handleConfirmAction}
        {...getConfirmModalContent()}
      />

      {/* Matter Types Manager */}
      <MatterTypesManager 
        isOpen={showTypesManager}
        onClose={() => setShowTypesManager(false)}
      />
    </div>
  )
}

interface NewMatterModalProps {
  onClose: () => void
  onSave: (data: any) => Promise<void>
  clients: any[]
  attorneys: any[]
  isAdmin: boolean
  prefilledClientId?: string | null
  typeOptions: { value: string; label: string }[]
}

interface TeamAssignment {
  userId: string
  name: string
  billingRate: number
}

function NewMatterModal({ onClose, onSave, clients, attorneys, isAdmin, prefilledClientId, typeOptions }: NewMatterModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    clientId: prefilledClientId || '',
    type: typeOptions.length > 0 ? typeOptions[0].value : 'other',
    status: 'active',
    priority: 'medium',
    billingType: 'hourly',
    billingRate: 450,
    openDate: new Date().toISOString(),
    responsibleAttorney: '',
    originatingAttorney: '',
    tags: []
  })
  
  // Team assignments (admin only)
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([])
  const [selectedAttorney, setSelectedAttorney] = useState('')
  const [selectedRate, setSelectedRate] = useState(0)

  const addTeamMember = () => {
    if (!selectedAttorney) return
    const attorney = attorneys.find(a => a.id === selectedAttorney)
    if (!attorney) return
    
    // Don't add duplicates
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
        name: formData.name || 'Untitled Matter',
        clientId: formData.clientId || undefined,
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
          <h2>New Matter</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Matter Name (optional)</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="Enter matter name"
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Client</label>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({...formData, clientId: e.target.value})}
              >
                <option value="">Select a client (optional)</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name || c.displayName}</option>
                ))}
              </select>
            </div>
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
          {isAdmin && (
            <div className={styles.formGroup}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} />
                Assign Team Members
              </label>
              
              {/* Add new team member */}
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

              {/* List of assigned team members */}
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
              
              {teamAssignments.length === 0 && (
                <p style={{ color: '#64748B', fontSize: '14px', margin: '8px 0' }}>
                  No team members assigned yet. Add attorneys above.
                </p>
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
