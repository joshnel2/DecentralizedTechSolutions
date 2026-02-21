import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { useAIChat } from '../contexts/AIChatContext'
import { teamApi, mattersApi } from '../services/api'
import { 
  Plus, Search, Briefcase, 
  MoreVertical, Sparkles, Users, X,
  Edit2, Archive, CheckCircle2, Trash2, Eye, XCircle, FileText, Settings, Columns,
  AlertTriangle, Shield, Loader2, UserX
} from 'lucide-react'
import { MatterTypesManager } from '../components/MatterTypesManager'
import { ColumnSettingsModal, ColumnConfig, loadColumnSettings, getDefaultColumns } from '../components/ColumnSettingsModal'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './ListPages.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { useToast } from '../components/Toast'

const COLUMN_SETTINGS_KEY = 'matters-column-settings'

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
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [attorneys, setAttorneys] = useState<any[]>([])
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [prefilledClientId, setPrefilledClientId] = useState<string | null>(null)
  const [viewFilter, setViewFilter] = useState<'my' | 'all'>('my')
  const [selectedMatterIds, setSelectedMatterIds] = useState<string[]>([])
  const [showBulkActions, setShowBulkActions] = useState(false)
  
  // Virtualization state for "All" view
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const ROW_HEIGHT = 60
  const OVERSCAN = 5

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
  // forceRefresh ensures we don't use cached data from a different view
  useEffect(() => {
    fetchMatters({ view: viewFilter, forceRefresh: true })
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
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [columnSettings, setColumnSettings] = useState<ColumnConfig[]>(() => loadColumnSettings(COLUMN_SETTINGS_KEY))
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false)
  const settingsDropdownRef = useRef<HTMLDivElement>(null)
  
  // Close settings dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(event.target as Node)) {
        setShowSettingsDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Get visible columns in order
  const visibleColumns = useMemo(() => {
    return columnSettings
      .filter(col => col.visible)
      .sort((a, b) => a.order - b.order)
  }, [columnSettings])
  
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
      toast.error('Failed to update matter status')
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
      toast.error('Failed to delete matter')
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

  // Virtualization: calculate which rows to render for "All" view
  const containerHeight = 600 // Approximate visible height
  const visibleRowCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(filteredMatters.length, startIndex + visibleRowCount)
  const visibleMatters = viewFilter === 'all' 
    ? filteredMatters.slice(startIndex, endIndex)
    : filteredMatters
  const paddingTop = viewFilter === 'all' ? startIndex * ROW_HEIGHT : 0
  const paddingBottom = viewFilter === 'all' ? Math.max(0, (filteredMatters.length - endIndex) * ROW_HEIGHT) : 0

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (viewFilter === 'all') {
      setScrollTop(e.currentTarget.scrollTop)
    }
  }, [viewFilter])

  const toggleSelectMatter = (id: string) => {
    setSelectedMatterIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }

  const selectAllVisible = () => {
    const allIds = filteredMatters.map(m => m.id)
    setSelectedMatterIds(allIds)
  }

  const clearSelection = () => setSelectedMatterIds([])

  const handleBulkAction = async (action: string) => {
    if (selectedMatterIds.length === 0) return
    
    try {
      for (const matterId of selectedMatterIds) {
        if (action === 'close') {
          await updateMatter(matterId, { status: 'closed' })
        } else if (action === 'archive') {
          await updateMatter(matterId, { status: 'closed_other' })
        } else if (action === 'active') {
          await updateMatter(matterId, { status: 'active' })
        } else if (action === 'on_hold') {
          await updateMatter(matterId, { status: 'on_hold' })
        }
      }
      toast.success(`${selectedMatterIds.length} matter(s) updated`)
      setSelectedMatterIds([])
      fetchMatters({ view: viewFilter, forceRefresh: true })
    } catch (error) {
      toast.error('Failed to update some matters')
    }
  }

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Unknown Client'
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>{viewFilter === 'my' ? 'My Matters' : 'All Matters'}</h1>
          <span className={styles.count}>{matters.length} total</span>
        </div>
        <div className={styles.headerActions}>
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

        <div className={styles.menuWrapper} ref={settingsDropdownRef}>
          <button 
            className={styles.settingsBtn}
            onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
            title="Settings"
          >
            <Settings size={16} />
          </button>
          {showSettingsDropdown && (
            <div className={styles.dropdown}>
              <button 
                className={styles.dropdownItem}
                onClick={() => {
                  setShowColumnSettings(true)
                  setShowSettingsDropdown(false)
                }}
              >
                <Columns size={14} />
                Column Settings
              </button>
              <button 
                className={styles.dropdownItem}
                onClick={() => {
                  setShowTypesManager(true)
                  setShowSettingsDropdown(false)
                }}
              >
                <Briefcase size={14} />
                Manage Matter Types
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedMatterIds.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
          background: 'rgba(var(--apex-gold-rgb, 212,175,55), 0.1)', borderRadius: '8px',
          marginBottom: '8px', border: '1px solid rgba(var(--apex-gold-rgb, 212,175,55), 0.3)',
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{selectedMatterIds.length} selected</span>
          <button onClick={() => handleBulkAction('active')} style={{ padding: '4px 12px', background: '#10B981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>Set Active</button>
          <button onClick={() => handleBulkAction('on_hold')} style={{ padding: '4px 12px', background: '#F59E0B', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>Put On Hold</button>
          <button onClick={() => handleBulkAction('close')} style={{ padding: '4px 12px', background: '#6B7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>Close</button>
          <button onClick={() => handleBulkAction('archive')} style={{ padding: '4px 12px', background: '#64748B', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>Archive</button>
          <div style={{ flex: 1 }} />
          <button onClick={selectAllVisible} style={{ padding: '4px 12px', background: 'transparent', color: 'var(--apex-white)', border: '1px solid var(--border-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>Select All ({filteredMatters.length})</button>
          <button onClick={clearSelection} style={{ padding: '4px 12px', background: 'transparent', color: 'var(--apex-white)', border: '1px solid var(--border-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div 
        ref={tableContainerRef}
        className={styles.tableContainer}
        onScroll={handleScroll}
      >
        <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '36px', padding: '8px' }}>
                  <input type="checkbox" checked={selectedMatterIds.length > 0 && selectedMatterIds.length === filteredMatters.length} onChange={e => e.target.checked ? selectAllVisible() : clearSelection()} style={{ accentColor: 'var(--apex-gold)' }} />
                </th>
                {visibleColumns.map(col => (
                  <th key={col.id}>{col.label}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {/* Top spacer for virtualization */}
              {paddingTop > 0 && (
                <tr style={{ height: paddingTop }} aria-hidden="true">
                  <td colSpan={visibleColumns.length + 2} style={{ padding: 0, border: 'none' }} />
                </tr>
              )}
              {visibleMatters.map(matter => (
                <tr key={matter.id}>
                  <td style={{ width: '36px', padding: '8px' }}>
                    <input type="checkbox" checked={selectedMatterIds.includes(matter.id)} onChange={() => toggleSelectMatter(matter.id)} onClick={e => e.stopPropagation()} style={{ accentColor: 'var(--apex-gold)' }} />
                  </td>
                  {visibleColumns.map(col => {
                    switch (col.id) {
                      case 'matter':
                        return (
                          <td key={col.id}>
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
                        )
                      case 'client':
                        return (
                          <td key={col.id}>
                            <Link to={`/app/clients/${matter.clientId}`} className={styles.link}>
                              {getClientName(matter.clientId)}
                            </Link>
                          </td>
                        )
                      case 'responsibleAttorney':
                        return (
                          <td key={col.id}>
                            {matter.responsibleAttorney ? (
                              <span className={styles.attorneyName}>
                                {attorneys.find(a => a.id === matter.responsibleAttorney)?.name || 'Assigned'}
                              </span>
                            ) : (
                              <span className={styles.unassigned}>Unassigned</span>
                            )}
                          </td>
                        )
                      case 'type':
                        return (
                          <td key={col.id}>
                            <span className={styles.typeTag}>
                              {(matter.type || 'other').replace(/_/g, ' ')}
                            </span>
                          </td>
                        )
                      case 'status':
                        return (
                          <td key={col.id}>
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
                        )
                      case 'billing':
                        return (
                          <td key={col.id}>
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
                        )
                      case 'opened':
                        return (
                          <td key={col.id} className={styles.dateCell}>
                            {matter.openDate ? format(parseISO(matter.openDate), 'MMM d, yyyy') : '—'}
                          </td>
                        )
                      case 'practiceArea':
                        return (
                          <td key={col.id}>
                            <span className={styles.typeTag}>
                              {(matter.practiceArea || '').replace(/_/g, ' ') || '—'}
                            </span>
                          </td>
                        )
                      case 'matterStage':
                        return (
                          <td key={col.id}>
                            {matter.matterStage || '—'}
                          </td>
                        )
                      case 'location':
                        return (
                          <td key={col.id}>
                            {matter.location || '—'}
                          </td>
                        )
                      case 'originatingAttorney':
                        return (
                          <td key={col.id}>
                            {matter.originatingAttorney ? (
                              <span className={styles.attorneyName}>
                                {attorneys.find(a => a.id === matter.originatingAttorney)?.name || 'Assigned'}
                              </span>
                            ) : (
                              <span className={styles.unassigned}>—</span>
                            )}
                          </td>
                        )
                      default:
                        return null
                    }
                  })}
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
              {/* Bottom spacer for virtualization */}
              {paddingBottom > 0 && (
                <tr style={{ height: paddingBottom }} aria-hidden="true">
                  <td colSpan={visibleColumns.length + 1} style={{ padding: 0, border: 'none' }} />
                </tr>
              )}
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
              toast.error('Failed to create matter', 'Please try again.')
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

      {/* Column Settings Modal */}
      <ColumnSettingsModal
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columnSettings}
        onSave={setColumnSettings}
        storageKey={COLUMN_SETTINGS_KEY}
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
  const toast = useToast()
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
    billable: true,
    openDate: new Date().toISOString(),
    responsibleAttorney: '',
    originatingAttorney: '',
    responsibleStaff: '',
    practiceArea: '',
    matterStage: '',
    clientReferenceNumber: '',
    location: '',
    maildropAddress: '',
    tags: []
  })
  
  // Team assignments (admin only)
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([])
  const [selectedAttorney, setSelectedAttorney] = useState('')
  const [selectedRate, setSelectedRate] = useState(0)
  
  // Conflict check state
  const [conflictCheckResult, setConflictCheckResult] = useState<any>(null)
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false)
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false)
  const [opposingPartyName, setOpposingPartyName] = useState('')

  const addTeamMember = () => {
    if (!selectedAttorney) return
    const attorney = attorneys.find(a => a.id === selectedAttorney)
    if (!attorney) return
    
    // Don't add duplicates
    if (teamAssignments.some(t => t.userId === selectedAttorney)) {
      toast.warning('This attorney is already assigned')
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

  // Run conflict check
  const runConflictCheck = async () => {
    const selectedClient = clients.find(c => c.id === formData.clientId)
    const clientName = selectedClient?.name || selectedClient?.displayName || formData.name
    
    if (!clientName && !opposingPartyName) {
      toast.warning('Please enter a client or matter name to check for conflicts')
      return
    }
    
    setIsCheckingConflicts(true)
    setConflictCheckResult(null)
    setConflictAcknowledged(false)
    
    try {
      const partyNames = opposingPartyName ? [opposingPartyName] : []
      const result = await mattersApi.checkConflicts({
        clientName: clientName || undefined,
        partyNames,
        matterName: formData.name || undefined
      })
      setConflictCheckResult(result)
    } catch (error) {
      console.error('Conflict check failed:', error)
      toast.error('Failed to run conflict check')
    } finally {
      setIsCheckingConflicts(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    
    // If there are high severity conflicts and not acknowledged, prevent submission
    if (conflictCheckResult?.summary?.high > 0 && !conflictAcknowledged) {
      toast.warning('Please acknowledge the conflict warnings before proceeding')
      return
    }
    
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        name: formData.name || 'Untitled Matter',
        clientId: formData.clientId || undefined,
        responsibleAttorney: formData.responsibleAttorney || undefined,
        originatingAttorney: formData.originatingAttorney || undefined,
        responsibleStaff: formData.responsibleStaff || undefined,
        practiceArea: formData.practiceArea || undefined,
        matterStage: formData.matterStage || undefined,
        clientReferenceNumber: formData.clientReferenceNumber || undefined,
        location: formData.location || undefined,
        maildropAddress: formData.maildropAddress || undefined,
        teamAssignments: isAdmin ? teamAssignments : undefined,
        conflictCleared: conflictCheckResult ? !conflictCheckResult.hasConflicts || conflictAcknowledged : false
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
              <label>Responsible Staff</label>
              <select
                value={formData.responsibleStaff}
                onChange={(e) => setFormData({...formData, responsibleStaff: e.target.value})}
              >
                <option value="">Select responsible staff...</option>
                {attorneys.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.role ? `(${a.role})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Practice Area</label>
              <input
                type="text"
                value={formData.practiceArea}
                onChange={(e) => setFormData({...formData, practiceArea: e.target.value})}
                placeholder="e.g., Real Estate, Litigation"
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Matter Stage</label>
              <input
                type="text"
                value={formData.matterStage}
                onChange={(e) => setFormData({...formData, matterStage: e.target.value})}
                placeholder="e.g., Discovery, Trial Prep"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Client Reference Number</label>
              <input
                type="text"
                value={formData.clientReferenceNumber}
                onChange={(e) => setFormData({...formData, clientReferenceNumber: e.target.value})}
                placeholder="Client's internal reference"
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                placeholder="Office or branch location"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Maildrop Address</label>
              <input
                type="text"
                value={formData.maildropAddress}
                onChange={(e) => setFormData({...formData, maildropAddress: e.target.value})}
                placeholder="Maildrop email address"
              />
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

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={formData.billable}
                  onChange={(e) => setFormData({...formData, billable: e.target.checked})}
                  style={{ width: 'auto', accentColor: 'var(--apex-gold)' }}
                />
                Billable
              </label>
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

          {/* Conflict Check Section */}
          <div className={styles.formGroup} style={{ 
            background: 'rgba(245, 158, 11, 0.05)', 
            border: '1px solid rgba(245, 158, 11, 0.2)', 
            borderRadius: '8px', 
            padding: '16px',
            marginTop: '8px'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Shield size={16} style={{ color: '#F59E0B' }} />
              Conflict Check
            </label>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                value={opposingPartyName}
                onChange={(e) => setOpposingPartyName(e.target.value)}
                placeholder="Opposing party name (optional)"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={runConflictCheck}
                disabled={isCheckingConflicts}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  background: 'var(--apex-gold)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'var(--apex-midnight)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {isCheckingConflicts ? (
                  <><Loader2 size={14} className="spinning" /> Checking...</>
                ) : (
                  <><Search size={14} /> Check Conflicts</>
                )}
              </button>
            </div>

            {/* Conflict Check Results */}
            {conflictCheckResult && (
              <div style={{ marginTop: '12px' }}>
                {/* Summary Banner */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  background: conflictCheckResult.summary.high > 0 
                    ? 'rgba(239, 68, 68, 0.15)' 
                    : conflictCheckResult.summary.medium > 0 
                      ? 'rgba(245, 158, 11, 0.15)'
                      : 'rgba(16, 185, 129, 0.15)',
                  border: `1px solid ${
                    conflictCheckResult.summary.high > 0 
                      ? 'rgba(239, 68, 68, 0.3)' 
                      : conflictCheckResult.summary.medium > 0 
                        ? 'rgba(245, 158, 11, 0.3)'
                        : 'rgba(16, 185, 129, 0.3)'
                  }`
                }}>
                  {conflictCheckResult.summary.high > 0 ? (
                    <AlertTriangle size={18} style={{ color: '#EF4444' }} />
                  ) : conflictCheckResult.summary.medium > 0 ? (
                    <AlertTriangle size={18} style={{ color: '#F59E0B' }} />
                  ) : (
                    <CheckCircle2 size={18} style={{ color: '#10B981' }} />
                  )}
                  <span style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: 500,
                    color: conflictCheckResult.summary.high > 0 
                      ? '#EF4444' 
                      : conflictCheckResult.summary.medium > 0 
                        ? '#F59E0B'
                        : '#10B981'
                  }}>
                    {conflictCheckResult.recommendation}
                  </span>
                </div>

                {/* Conflict List */}
                {conflictCheckResult.conflicts.length > 0 && (
                  <div style={{ 
                    maxHeight: '200px', 
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {conflictCheckResult.conflicts.slice(0, 10).map((conflict: any, idx: number) => (
                      <div 
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '10px 12px',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: '6px',
                          borderLeft: `3px solid ${
                            conflict.severity === 'high' ? '#EF4444' : 
                            conflict.severity === 'medium' ? '#F59E0B' : '#64748B'
                          }`
                        }}
                      >
                        {conflict.matchType === 'client' ? (
                          <Users size={14} style={{ marginTop: '2px', flexShrink: 0, color: '#94A3B8' }} />
                        ) : (
                          <UserX size={14} style={{ marginTop: '2px', flexShrink: 0, color: '#94A3B8' }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--apex-light)' }}>
                            {conflict.matchName}
                            {conflict.role && (
                              <span style={{ 
                                marginLeft: '8px', 
                                fontSize: '0.6875rem', 
                                padding: '2px 6px', 
                                background: 'var(--border-secondary)', 
                                borderRadius: '4px',
                                textTransform: 'uppercase'
                              }}>
                                {conflict.role}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '2px' }}>
                            {conflict.description}
                          </div>
                        </div>
                      </div>
                    ))}
                    {conflictCheckResult.conflicts.length > 10 && (
                      <div style={{ fontSize: '0.75rem', color: '#64748B', textAlign: 'center', padding: '8px' }}>
                        + {conflictCheckResult.conflicts.length - 10} more results
                      </div>
                    )}
                  </div>
                )}

                {/* Acknowledgment Checkbox */}
                {conflictCheckResult.hasConflicts && (
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'flex-start', 
                    gap: '10px', 
                    marginTop: '12px',
                    padding: '10px 12px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={conflictAcknowledged}
                      onChange={(e) => setConflictAcknowledged(e.target.checked)}
                      style={{ marginTop: '2px', accentColor: 'var(--apex-gold)' }}
                    />
                    <span style={{ fontSize: '0.8125rem', color: 'var(--apex-light)' }}>
                      I have reviewed the potential conflicts and confirm it is appropriate to proceed with this matter
                    </span>
                  </label>
                )}
              </div>
            )}

            {!conflictCheckResult && (
              <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>
                Run a conflict check to search for existing clients and matter parties that may create a conflict of interest.
              </p>
            )}
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
                  border: '1px solid var(--border-secondary)', 
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
                        borderBottom: idx < teamAssignments.length - 1 ? '1px solid var(--border-secondary)' : 'none',
                        background: 'var(--border-primary)'
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
