import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { useAIChat } from '../contexts/AIChatContext'
import { teamApi } from '../services/api'
import { 
  Plus, Search, Filter, ChevronDown, Briefcase, 
  MoreVertical, Sparkles, Calendar, DollarSign, Users, X,
  Edit2, Archive, CheckCircle2, Trash2, Eye, XCircle
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './ListPages.module.css'

const statusOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' }
]

const typeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'litigation', label: 'Litigation' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'intellectual_property', label: 'IP' },
  { value: 'employment', label: 'Employment' },
  { value: 'personal_injury', label: 'Personal Injury' },
  { value: 'estate_planning', label: 'Estate Planning' },
  { value: 'other', label: 'Other' }
]

export function MattersPage() {
  const { matters, clients, addMatter, fetchMatters, fetchClients, updateMatter, deleteMatter } = useDataStore()
  const { user } = useAuthStore()
  const { openChat } = useAIChat()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [attorneys, setAttorneys] = useState<any[]>([])
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

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

  // Fetch data when component mounts
  useEffect(() => {
    fetchMatters()
    fetchClients()
    
    // Fetch attorneys for attorney selection dropdowns
    teamApi.getAttorneys()
      .then(data => setAttorneys(data.attorneys || []))
      .catch(err => console.log('Could not fetch attorneys:', err))
  }, [])
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showNewModal, setShowNewModal] = useState(false)

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

  const handleDeleteMatter = async (matterId: string, matterName: string) => {
    if (!confirm(`Are you sure you want to delete "${matterName}"? This action cannot be undone.`)) {
      return
    }
    try {
      await deleteMatter(matterId)
      setOpenDropdownId(null)
      fetchMatters()
    } catch (error) {
      console.error('Failed to delete matter:', error)
      alert('Failed to delete matter')
    }
  }

  const filteredMatters = useMemo(() => {
    return matters.filter(matter => {
      const matchesSearch = 
        matter.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        matter.number.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || matter.status === statusFilter
      const matchesType = typeFilter === 'all' || matter.type === typeFilter
      return matchesSearch && matchesStatus && matchesType
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [matters, searchQuery, statusFilter, typeFilter])

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Unknown Client'
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Matters</h1>
          <span className={styles.count}>{matters.length} total</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.aiBtn} onClick={() => openChat()}>
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
                    {matter.type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <span className={clsx(styles.statusBadge, styles[matter.status])}>
                    {matter.status.replace(/_/g, ' ')}
                  </span>
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
                  {format(parseISO(matter.openDate), 'MMM d, yyyy')}
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
                              onClick={() => handleStatusChange(matter.id, 'on_hold')}
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
                            onClick={() => handleStatusChange(matter.id, 'active')}
                          >
                            <Briefcase size={14} />
                            Reactivate
                          </button>
                        )}
                        {!matter.status.startsWith('closed') && (
                          <button 
                            className={styles.dropdownItem}
                            onClick={() => handleStatusChange(matter.id, 'closed_other')}
                          >
                            <Archive size={14} />
                            Archive / Close
                          </button>
                        )}
                        <div className={styles.dropdownDivider} />
                        <button 
                          className={clsx(styles.dropdownItem, styles.danger)}
                          onClick={() => handleDeleteMatter(matter.id, matter.name)}
                        >
                          <Trash2 size={14} />
                          Delete Matter
                        </button>
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
          onClose={() => setShowNewModal(false)}
          onSave={async (data) => {
            try {
              await addMatter(data)
              setShowNewModal(false)
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
        />
      )}
    </div>
  )
}

interface NewMatterModalProps {
  onClose: () => void
  onSave: (data: any) => Promise<void>
  clients: any[]
  attorneys: any[]
  isAdmin: boolean
}

interface TeamAssignment {
  userId: string
  name: string
  billingRate: number
}

function NewMatterModal({ onClose, onSave, clients, attorneys, isAdmin }: NewMatterModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    clientId: clients[0]?.id || '',
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
                {typeOptions.slice(1).map(opt => (
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
