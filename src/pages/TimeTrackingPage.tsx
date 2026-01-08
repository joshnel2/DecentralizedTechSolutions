import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { useTimer, formatElapsedTime, secondsToHours } from '../contexts/TimerContext'
import { 
  Plus, Clock, DollarSign, 
  TrendingUp, Sparkles, CheckSquare, FileText, X, Edit2,
  Play, Pause, Square, Save, Search, Filter
} from 'lucide-react'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addDays } from 'date-fns'
import { parseAsLocalDate, localDateToISO } from '../utils/dateUtils'
import { clsx } from 'clsx'
import styles from './TimeTrackingPage.module.css'

export function TimeTrackingPage() {
  const { timeEntries, matters, clients, addTimeEntry, updateTimeEntry, addInvoice, fetchTimeEntries, fetchMatters, fetchClients, fetchInvoices } = useDataStore()
  const { timer, startTimer, pauseTimer, resumeTimer, stopTimer, discardTimer, isTimerActive } = useTimer()
  const navigate = useNavigate()
  const location = useLocation()
  
  // Fetch data from API on mount
  // Request a higher limit to ensure older time entries are available for invoicing
  useEffect(() => {
    fetchTimeEntries({})
    fetchMatters()
    fetchClients()
  }, [fetchTimeEntries, fetchMatters, fetchClients])

  // Check if we should show save modal (from header stop button)
  useEffect(() => {
    if (location.state?.showSaveModal && timer.elapsed > 0) {
      setShowSaveTimerModal(true)
      // Clear the state so it doesn't trigger again on refresh
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, timer.elapsed, navigate, location.pathname])
  const { user } = useAuthStore()
  const [showNewModal, setShowNewModal] = useState(false)
  const [showBillModal, setShowBillModal] = useState(false)
  const [showSaveTimerModal, setShowSaveTimerModal] = useState(false)
  const [selectedEntries, setSelectedEntries] = useState<string[]>([])
  const [editingEntry, setEditingEntry] = useState<any>(null)
  const [selectedMatterId, setSelectedMatterId] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  
  // Filter state for recent entries
  const [recentEntriesSearch, setRecentEntriesSearch] = useState('')
  const [recentEntriesFilterMatter, setRecentEntriesFilterMatter] = useState('')
  const [recentEntriesFilterStatus, setRecentEntriesFilterStatus] = useState<'all' | 'billed' | 'unbilled'>('all')
  
  // Filter state for older entries
  const [olderEntriesSearch, setOlderEntriesSearch] = useState('')
  const [olderEntriesFilterMatter, setOlderEntriesFilterMatter] = useState('')
  const [olderEntriesFilterStatus, setOlderEntriesFilterStatus] = useState<'all' | 'billed' | 'unbilled'>('all')

  // Filter matters based on selected client
  const filteredMatters = useMemo(() => {
    if (!selectedClientId) return matters.filter(m => m.status === 'active')
    return matters.filter(m => m.status === 'active' && m.clientId === selectedClientId)
  }, [matters, selectedClientId])

  const weekDays = useMemo(() => {
    const now = new Date()
    const start = startOfWeek(now)
    const end = endOfWeek(now)
    return eachDayOfInterval({ start, end })
  }, [])

  const weeklyStats = useMemo(() => {
    const now = new Date()
    const start = startOfWeek(now)
    const end = endOfWeek(now)
    
    const weekEntries = timeEntries.filter(e => {
      const date = parseAsLocalDate(e.date)
      return date >= start && date <= end
    })

    const totalHours = weekEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = weekEntries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0)
    const totalValue = weekEntries.reduce((sum, e) => sum + e.amount, 0)

    const byDay = weekDays.map(day => ({
      day,
      hours: weekEntries
        .filter(e => isSameDay(parseAsLocalDate(e.date), day))
        .reduce((sum, e) => sum + e.hours, 0)
    }))

    return { totalHours, billableHours, totalValue, byDay }
  }, [timeEntries, weekDays])

  // Get entries from past 7 days
  const sevenDaysAgo = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() - 7)
    date.setHours(0, 0, 0, 0)
    return date
  }, [])

  const recentEntries = useMemo(() => {
    return [...timeEntries]
      .filter(e => parseAsLocalDate(e.date) >= sevenDaysAgo)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())  // Sort by entry date, most recent first
  }, [timeEntries, sevenDaysAgo])

  // Filtered recent entries based on search and filters
  const filteredRecentEntries = useMemo(() => {
    return recentEntries.filter(entry => {
      // Search filter - search in description, matter name, and client name
      if (recentEntriesSearch) {
        const searchLower = recentEntriesSearch.toLowerCase()
        const matter = entry.matterId ? matters.find(m => m.id === entry.matterId) : null
        const matterName = matter?.name?.toLowerCase() || ''
        const matterNumber = matter?.number?.toLowerCase() || ''
        const client = matter ? clients.find(c => c.id === matter.clientId) : null
        const clientName = (client?.name || client?.displayName || '').toLowerCase()
        const description = (entry.description || '').toLowerCase()
        
        const matchesSearch = 
          description.includes(searchLower) ||
          matterName.includes(searchLower) ||
          matterNumber.includes(searchLower) ||
          clientName.includes(searchLower)
        
        if (!matchesSearch) return false
      }
      
      // Matter filter
      if (recentEntriesFilterMatter && entry.matterId !== recentEntriesFilterMatter) {
        return false
      }
      
      // Status filter
      if (recentEntriesFilterStatus === 'billed' && !entry.billed) return false
      if (recentEntriesFilterStatus === 'unbilled' && entry.billed) return false
      
      return true
    })
  }, [recentEntries, recentEntriesSearch, recentEntriesFilterMatter, recentEntriesFilterStatus, matters, clients])

  // Get unique matters from recent entries for the filter dropdown
  const recentEntriesMatters = useMemo(() => {
    const matterIds = [...new Set(recentEntries.map(e => e.matterId).filter(Boolean))]
    return matters.filter(m => matterIds.includes(m.id))
  }, [recentEntries, matters])

  const olderEntries = useMemo(() => {
    return [...timeEntries]
      .filter(e => parseAsLocalDate(e.date) < sevenDaysAgo)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())  // Sort by entry date, most recent first
  }, [timeEntries, sevenDaysAgo])

  // Filtered older entries based on search and filters
  const filteredOlderEntries = useMemo(() => {
    return olderEntries.filter(entry => {
      // Search filter - search in description, matter name, and client name
      if (olderEntriesSearch) {
        const searchLower = olderEntriesSearch.toLowerCase()
        const matter = entry.matterId ? matters.find(m => m.id === entry.matterId) : null
        const matterName = matter?.name?.toLowerCase() || ''
        const matterNumber = matter?.number?.toLowerCase() || ''
        const client = matter ? clients.find(c => c.id === matter.clientId) : null
        const clientName = (client?.name || client?.displayName || '').toLowerCase()
        const description = (entry.description || '').toLowerCase()
        
        const matchesSearch = 
          description.includes(searchLower) ||
          matterName.includes(searchLower) ||
          matterNumber.includes(searchLower) ||
          clientName.includes(searchLower)
        
        if (!matchesSearch) return false
      }
      
      // Matter filter
      if (olderEntriesFilterMatter && entry.matterId !== olderEntriesFilterMatter) {
        return false
      }
      
      // Status filter
      if (olderEntriesFilterStatus === 'billed' && !entry.billed) return false
      if (olderEntriesFilterStatus === 'unbilled' && entry.billed) return false
      
      return true
    })
  }, [olderEntries, olderEntriesSearch, olderEntriesFilterMatter, olderEntriesFilterStatus, matters, clients])

  const unbilledEntries = useMemo(() => {
    return timeEntries.filter(e => !e.billed && e.billable)
  }, [timeEntries])

  // Unbilled entries split by recent/older
  const unbilledRecentEntries = useMemo(() => {
    return filteredRecentEntries.filter(e => !e.billed && e.billable)
  }, [filteredRecentEntries])

  const unbilledOlderEntries = useMemo(() => {
    return filteredOlderEntries.filter(e => !e.billed && e.billable)
  }, [filteredOlderEntries])

  // Get unique matters from older entries for the filter dropdown
  const olderEntriesMatters = useMemo(() => {
    const matterIds = [...new Set(olderEntries.map(e => e.matterId).filter(Boolean))]
    return matters.filter(m => matterIds.includes(m.id))
  }, [olderEntries, matters])

  const unbilledTotal = useMemo(() => {
    return unbilledEntries.reduce((sum, e) => sum + e.amount, 0)
  }, [unbilledEntries])

  const selectedTotal = useMemo(() => {
    return timeEntries
      .filter(e => selectedEntries.includes(e.id))
      .reduce((sum, e) => sum + e.amount, 0)
  }, [timeEntries, selectedEntries])

  const getMatterName = (matterId: string | null | undefined) => 
    matterId ? (matters.find(m => m.id === matterId)?.name || 'Unknown') : 'No Matter'
  const getMatterNumber = (matterId: string | null | undefined) => 
    matterId ? (matters.find(m => m.id === matterId)?.number || '') : ''
  const getClientForMatter = (matterId: string | null | undefined) => {
    if (!matterId) return null
    const matter = matters.find(m => m.id === matterId)
    return matter ? clients.find(c => c.id === matter.clientId) : null
  }

  const toggleEntrySelection = (entryId: string) => {
    setSelectedEntries(prev => 
      prev.includes(entryId) 
        ? prev.filter(id => id !== entryId)
        : [...prev, entryId]
    )
  }

  const toggleBilledStatus = async (entry: any) => {
    try {
      await updateTimeEntry(entry.id, { billed: !entry.billed })
      await fetchTimeEntries({})
    } catch (error) {
      console.error('Failed to toggle billed status:', error)
      alert('Failed to update billing status. Please try again.')
    }
  }

  const toggleRecentUnbilled = () => {
    const unbilledIds = unbilledRecentEntries.map(e => e.id)
    const allSelected = unbilledIds.every(id => selectedEntries.includes(id))
    if (allSelected) {
      // Deselect only recent unbilled entries
      setSelectedEntries(prev => prev.filter(id => !unbilledIds.includes(id)))
    } else {
      // Add recent unbilled entries to selection
      setSelectedEntries(prev => [...new Set([...prev, ...unbilledIds])])
    }
  }

  const toggleOlderUnbilled = () => {
    const unbilledIds = unbilledOlderEntries.map(e => e.id)
    const allSelected = unbilledIds.every(id => selectedEntries.includes(id))
    if (allSelected) {
      // Deselect only older unbilled entries
      setSelectedEntries(prev => prev.filter(id => !unbilledIds.includes(id)))
    } else {
      // Add older unbilled entries to selection
      setSelectedEntries(prev => [...new Set([...prev, ...unbilledIds])])
    }
  }

  // Select all unbilled entries and open bill modal
  const handleBillAllUnbilled = () => {
    const allUnbilledIds = unbilledEntries.map(e => e.id)
    setSelectedEntries(allUnbilledIds)
    setShowBillModal(true)
  }

  // Handle clicking unbilled stat card - select all unbilled entries
  const handleUnbilledCardClick = () => {
    const allUnbilledIds = unbilledEntries.map(e => e.id)
    if (allUnbilledIds.length === 0) return
    
    // If all unbilled are already selected, deselect them
    const allSelected = allUnbilledIds.every(id => selectedEntries.includes(id))
    if (allSelected) {
      setSelectedEntries([])
    } else {
      setSelectedEntries(allUnbilledIds)
    }
  }

  const handleStopTimer = () => {
    stopTimer()
    setShowSaveTimerModal(true)
  }

  const handleStartTimer = () => {
    const matter = selectedMatterId ? matters.find(m => m.id === selectedMatterId) : null
    const client = selectedClientId ? clients.find(c => c.id === selectedClientId) : null
    
    startTimer({ 
      matterId: selectedMatterId || undefined, 
      matterName: matter?.name,
      clientId: selectedClientId || undefined,
      clientName: client?.name || client?.displayName
    })
  }

  return (
    <div className={styles.timeTrackingPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Time Tracking</h1>
        </div>
        <div className={styles.headerActions}>
          {unbilledEntries.length > 0 && (
            <button className={styles.billUnbilledBtn} onClick={handleBillAllUnbilled}>
              <DollarSign size={18} />
              Bill Unbilled (${unbilledTotal.toLocaleString()})
            </button>
          )}
          <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
            <Plus size={18} />
            New Entry
          </button>
        </div>
      </div>

      {/* Timer Section - Always at top */}
      <div className={styles.timerSection}>
        {isTimerActive ? (
          <div className={styles.activeTimer}>
            <div className={styles.timerInfo}>
              <div className={styles.timerPulse}>
                <Clock size={20} />
              </div>
              <div className={styles.timerDetails}>
                <span className={styles.timerMatter}>
                  {timer.matterName || 'General Time'}
                  {timer.clientName && <span className={styles.timerClient}> • {timer.clientName}</span>}
                </span>
                <span className={styles.timerElapsed}>{formatElapsedTime(timer.elapsed)}</span>
              </div>
            </div>
            <div className={styles.timerControls}>
              {timer.isPaused ? (
                <button className={styles.resumeBtn} onClick={resumeTimer} title="Resume">
                  <Play size={18} />
                  Resume
                </button>
              ) : (
                <button className={styles.pauseBtn} onClick={pauseTimer} title="Pause">
                  <Pause size={18} />
                  Pause
                </button>
              )}
              <button className={styles.stopBtn} onClick={handleStopTimer} title="Stop & Save">
                <Square size={18} />
                Stop
              </button>
              <button className={styles.discardBtn} onClick={discardTimer} title="Discard">
                <X size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.startTimer}>
            <div className={styles.startTimerLeft}>
              <Clock size={20} />
              <span>Start Timer</span>
            </div>
            <div className={styles.startTimerRight}>
              <select 
                value={selectedClientId} 
                onChange={(e) => {
                  setSelectedClientId(e.target.value)
                  setSelectedMatterId('') // Reset matter when client changes
                }}
                className={styles.matterSelect}
              >
                <option value="">All Clients</option>
                {clients.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{c.name || c.displayName}</option>
                ))}
              </select>
              <select 
                value={selectedMatterId} 
                onChange={(e) => setSelectedMatterId(e.target.value)}
                className={styles.matterSelect}
              >
                <option value="">No matter (general time)</option>
                {filteredMatters.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button className={styles.startBtn} onClick={handleStartTimer}>
                <Play size={18} />
                Start
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <Clock size={20} />
          <div>
            <span className={styles.statValue}>{weeklyStats.totalHours.toFixed(1)}h</span>
            <span className={styles.statLabel}>This Week</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <TrendingUp size={20} />
          <div>
            <span className={styles.statValue}>{weeklyStats.billableHours.toFixed(1)}h</span>
            <span className={styles.statLabel}>Billable</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <DollarSign size={20} />
          <div>
            <span className={styles.statValue}>${weeklyStats.totalValue.toLocaleString()}</span>
            <span className={styles.statLabel}>Value</span>
          </div>
        </div>
        <button 
          className={clsx(styles.statCard, styles.unbilledCard, styles.clickableCard)}
          onClick={handleUnbilledCardClick}
          title={unbilledEntries.length > 0 ? `Click to select all ${unbilledEntries.length} unbilled entries` : 'No unbilled entries'}
        >
          <FileText size={20} />
          <div>
            <span className={styles.statValue}>${unbilledTotal.toLocaleString()}</span>
            <span className={styles.statLabel}>Unbilled ({unbilledEntries.length})</span>
          </div>
        </button>
      </div>

      {/* Bill Selected Bar */}
      {selectedEntries.length > 0 && (
        <div className={styles.billBar}>
          <div className={styles.billBarInfo}>
            <CheckSquare size={18} />
            <span>{selectedEntries.length} entries selected</span>
            <span className={styles.billBarAmount}>${selectedTotal.toLocaleString()}</span>
          </div>
          <div className={styles.billBarActions}>
            <button 
              className={styles.clearSelectionBtn}
              onClick={() => setSelectedEntries([])}
            >
              Clear Selection
            </button>
            <button 
              className={styles.billSelectedBtn}
              onClick={() => setShowBillModal(true)}
            >
              <FileText size={16} />
              Create Invoice
            </button>
          </div>
        </div>
      )}

      {/* Weekly Chart */}
      <div className={styles.weeklyChart}>
        <h3>Weekly Overview</h3>
        <div className={styles.chartBars}>
          {weeklyStats.byDay.map(({ day, hours }) => (
            <div key={day.toISOString()} className={styles.chartBar}>
              <div className={styles.barContainer}>
                <div 
                  className={styles.bar}
                  style={{ height: `${Math.min(hours / 10 * 100, 100)}%` }}
                />
              </div>
              <span className={styles.barLabel}>{format(day, 'EEE')}</span>
              <span className={styles.barValue}>{hours.toFixed(1)}h</span>
            </div>
          ))}
        </div>
      </div>

      {/* Active Timer - Using floating timer component instead */}

      {/* Quick Timer - Hidden when floating timer is active */}

      {/* Recent Entries (Past 7 Days) */}
      <div className={styles.recentSection}>
        <div className={styles.recentHeader}>
          <div className={styles.sectionTitleGroup}>
            <h3>Recent Time Entries</h3>
            <span className={styles.sectionSubtitle}>
              {filteredRecentEntries.length === recentEntries.length 
                ? `Past 7 days` 
                : `Showing ${filteredRecentEntries.length} of ${recentEntries.length} entries`}
            </span>
          </div>
          <div className={styles.headerActions}>
            {unbilledRecentEntries.length > 0 && (
              <button 
                className={styles.selectAllBtn}
                onClick={toggleRecentUnbilled}
              >
                {unbilledRecentEntries.every(e => selectedEntries.includes(e.id)) 
                  ? 'Deselect Recent' 
                  : `Select Unbilled (${unbilledRecentEntries.length})`}
              </button>
            )}
          </div>
        </div>
        
        {/* Search and Filter Bar */}
        <div className={styles.filterBar}>
          <div className={styles.searchInputWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by description, matter, or client..."
              value={recentEntriesSearch}
              onChange={(e) => setRecentEntriesSearch(e.target.value)}
              className={styles.searchInput}
            />
            {recentEntriesSearch && (
              <button 
                className={styles.clearSearchBtn}
                onClick={() => setRecentEntriesSearch('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className={styles.filterControls}>
            <select
              value={recentEntriesFilterMatter}
              onChange={(e) => setRecentEntriesFilterMatter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">All Matters</option>
              {recentEntriesMatters.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select
              value={recentEntriesFilterStatus}
              onChange={(e) => setRecentEntriesFilterStatus(e.target.value as 'all' | 'billed' | 'unbilled')}
              className={styles.filterSelect}
            >
              <option value="all">All Status</option>
              <option value="unbilled">Unbilled</option>
              <option value="billed">Billed</option>
            </select>
            {(recentEntriesSearch || recentEntriesFilterMatter || recentEntriesFilterStatus !== 'all') && (
              <button 
                className={styles.clearFiltersBtn}
                onClick={() => {
                  setRecentEntriesSearch('')
                  setRecentEntriesFilterMatter('')
                  setRecentEntriesFilterStatus('all')
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {recentEntries.length === 0 ? (
          <div className={styles.emptyState}>
            <Clock size={24} />
            <p>No time entries in the past 7 days</p>
            <button className={styles.addEntryBtn} onClick={() => setShowNewModal(true)}>
              <Plus size={16} />
              Add Time Entry
            </button>
          </div>
        ) : filteredRecentEntries.length === 0 ? (
          <div className={styles.emptyState}>
            <Filter size={24} />
            <p>No entries match your filters</p>
            <button 
              className={styles.addEntryBtn}
              onClick={() => {
                setRecentEntriesSearch('')
                setRecentEntriesFilterMatter('')
                setRecentEntriesFilterStatus('all')
              }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className={styles.entriesTable}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Date</th>
                  <th>Matter</th>
                  <th>Description</th>
                  <th>Hours</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th style={{ width: '60px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecentEntries.map(entry => (
                  <tr 
                    key={entry.id} 
                    className={clsx(
                      selectedEntries.includes(entry.id) && styles.selectedRow
                    )}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedEntries.includes(entry.id)}
                        onChange={() => toggleEntrySelection(entry.id)}
                        className={clsx(styles.entryCheckbox, entry.billed && styles.checkboxDisabled)}
                        disabled={entry.billed}
                        title={entry.billed ? 'Already billed' : (entry.billable ? 'Select for billing' : 'Non-billable entry')}
                      />
                    </td>
                    <td>{format(parseAsLocalDate(entry.date), 'MMM d, yyyy')}</td>
                    <td>
                      {entry.matterId ? (
                        <Link to={`/app/matters/${entry.matterId}`}>
                          <div className={styles.matterCell}>
                            <span>{getMatterName(entry.matterId)}</span>
                            <span className={styles.matterNum}>{getMatterNumber(entry.matterId)}</span>
                          </div>
                        </Link>
                      ) : (
                        <span className={styles.noMatter}>No Matter</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.descCell}>
                        {entry.description || <span className={styles.noDesc}>No description</span>}
                        {entry.aiGenerated && (
                          <span className={styles.aiTag}><Sparkles size={10} /></span>
                        )}
                      </div>
                    </td>
                    <td>{entry.hours}h</td>
                    <td>${entry.amount.toLocaleString()}</td>
                    <td>
                      <button
                        className={clsx(styles.statusBadge, styles.clickable, entry.billed ? styles.billed : styles.unbilled)}
                        onClick={() => toggleBilledStatus(entry)}
                        title={entry.billed ? 'Click to mark as unbilled' : 'Click to mark as billed'}
                      >
                        {entry.billed ? 'Billed' : 'Unbilled'}
                      </button>
                    </td>
                    <td>
                      <button 
                        className={styles.editBtn}
                        onClick={() => setEditingEntry(entry)}
                        title="Edit Entry"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* All Time Entries (Older than 7 days) */}
      {olderEntries.length > 0 && (
        <div className={styles.recentSection}>
          <div className={styles.recentHeader}>
            <div className={styles.sectionTitleGroup}>
              <h3>All Time Entries</h3>
              <span className={styles.sectionSubtitle}>
                {filteredOlderEntries.length === olderEntries.length 
                  ? `${olderEntries.length} older entries` 
                  : `Showing ${filteredOlderEntries.length} of ${olderEntries.length} entries`}
              </span>
            </div>
            <div className={styles.headerActions}>
              {unbilledOlderEntries.length > 0 && (
                <button 
                  className={styles.selectAllBtn}
                  onClick={toggleOlderUnbilled}
                >
                  {unbilledOlderEntries.every(e => selectedEntries.includes(e.id)) 
                    ? 'Deselect Older' 
                    : `Select Unbilled (${unbilledOlderEntries.length})`}
                </button>
              )}
            </div>
          </div>
          
          {/* Search and Filter Bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchInputWrapper}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search by description, matter, or client..."
                value={olderEntriesSearch}
                onChange={(e) => setOlderEntriesSearch(e.target.value)}
                className={styles.searchInput}
              />
              {olderEntriesSearch && (
                <button 
                  className={styles.clearSearchBtn}
                  onClick={() => setOlderEntriesSearch('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className={styles.filterControls}>
              <select
                value={olderEntriesFilterMatter}
                onChange={(e) => setOlderEntriesFilterMatter(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="">All Matters</option>
                {olderEntriesMatters.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <select
                value={olderEntriesFilterStatus}
                onChange={(e) => setOlderEntriesFilterStatus(e.target.value as 'all' | 'billed' | 'unbilled')}
                className={styles.filterSelect}
              >
                <option value="all">All Status</option>
                <option value="unbilled">Unbilled</option>
                <option value="billed">Billed</option>
              </select>
              {(olderEntriesSearch || olderEntriesFilterMatter || olderEntriesFilterStatus !== 'all') && (
                <button 
                  className={styles.clearFiltersBtn}
                  onClick={() => {
                    setOlderEntriesSearch('')
                    setOlderEntriesFilterMatter('')
                    setOlderEntriesFilterStatus('all')
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {filteredOlderEntries.length === 0 ? (
            <div className={styles.emptyState}>
              <Filter size={24} />
              <p>No entries match your filters</p>
              <button 
                className={styles.addEntryBtn}
                onClick={() => {
                  setOlderEntriesSearch('')
                  setOlderEntriesFilterMatter('')
                  setOlderEntriesFilterStatus('all')
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
          <div className={styles.entriesTable}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Date</th>
                  <th>Matter</th>
                  <th>Description</th>
                  <th>Hours</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th style={{ width: '60px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOlderEntries.map(entry => (
                  <tr 
                    key={entry.id} 
                    className={clsx(
                      selectedEntries.includes(entry.id) && styles.selectedRow
                    )}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedEntries.includes(entry.id)}
                        onChange={() => toggleEntrySelection(entry.id)}
                        className={clsx(styles.entryCheckbox, entry.billed && styles.checkboxDisabled)}
                        disabled={entry.billed}
                        title={entry.billed ? 'Already billed' : (entry.billable ? 'Select for billing' : 'Non-billable entry')}
                      />
                    </td>
                    <td>{format(parseAsLocalDate(entry.date), 'MMM d, yyyy')}</td>
                    <td>
                      {entry.matterId ? (
                        <Link to={`/app/matters/${entry.matterId}`}>
                          <div className={styles.matterCell}>
                            <span>{getMatterName(entry.matterId)}</span>
                            <span className={styles.matterNum}>{getMatterNumber(entry.matterId)}</span>
                          </div>
                        </Link>
                      ) : (
                        <span className={styles.noMatter}>No Matter</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.descCell}>
                        {entry.description || <span className={styles.noDesc}>No description</span>}
                        {entry.aiGenerated && (
                          <span className={styles.aiTag}><Sparkles size={10} /></span>
                        )}
                      </div>
                    </td>
                    <td>{entry.hours}h</td>
                    <td>${entry.amount.toLocaleString()}</td>
                    <td>
                      <button
                        className={clsx(styles.statusBadge, styles.clickable, entry.billed ? styles.billed : styles.unbilled)}
                        onClick={() => toggleBilledStatus(entry)}
                        title={entry.billed ? 'Click to mark as unbilled' : 'Click to mark as billed'}
                      >
                        {entry.billed ? 'Billed' : 'Unbilled'}
                      </button>
                    </td>
                    <td>
                      <button 
                        className={styles.editBtn}
                        onClick={() => setEditingEntry(entry)}
                        title="Edit Entry"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {showNewModal && (
        <NewTimeEntryModal 
          onClose={() => setShowNewModal(false)}
          onSave={async (data) => {
            try {
              await addTimeEntry(data)
              setShowNewModal(false)
              await fetchTimeEntries({})
            } catch (error) {
              console.error('Failed to create time entry:', error)
              alert('Failed to create time entry. Please try again.')
            }
          }}
          matters={matters}
          userId={user?.id || ''}
        />
      )}

      {showBillModal && (
        <BillTimeModal 
          onClose={() => setShowBillModal(false)}
          selectedEntries={timeEntries.filter(e => selectedEntries.includes(e.id))}
          matters={matters}
          clients={clients}
          onCreateInvoice={async (invoiceData) => {
            try {
              // Create the invoice
              await addInvoice(invoiceData)
              
              // Mark selected time entries as billed
              for (const entryId of selectedEntries) {
                await updateTimeEntry(entryId, { billed: true })
              }
              
              // Refresh data
              await fetchTimeEntries({})
              await fetchInvoices()
              
              // Clear selection and close modal
              setSelectedEntries([])
              setShowBillModal(false)
              
              // Navigate to billing page
              navigate('/app/billing')
            } catch (error) {
              console.error('Failed to create invoice:', error)
              alert('Failed to create invoice. Please try again.')
            }
          }}
        />
      )}

      {/* Edit Time Entry Modal */}
      {editingEntry && (
        <EditTimeEntryModal
          entry={editingEntry}
          matters={matters}
          onClose={() => setEditingEntry(null)}
          onSave={async (data) => {
            try {
              await updateTimeEntry(editingEntry.id, data)
              setEditingEntry(null)
              await fetchTimeEntries({})
            } catch (error) {
              console.error('Failed to update time entry:', error)
              alert('Failed to update time entry. Please try again.')
            }
          }}
        />
      )}

      {/* Save Timer Modal */}
      {showSaveTimerModal && (
        <SaveTimerModal
          timer={timer}
          matters={matters}
          onClose={() => {
            setShowSaveTimerModal(false)
            discardTimer()
          }}
          onSave={async (data) => {
            try {
              await addTimeEntry(data)
              setShowSaveTimerModal(false)
              discardTimer()
              await fetchTimeEntries({})
            } catch (error) {
              console.error('Failed to save time entry:', error)
              alert('Failed to save time entry. Please try again.')
            }
          }}
        />
      )}
    </div>
  )
}

function NewTimeEntryModal({ onClose, onSave, matters, userId }: { onClose: () => void; onSave: (data: any) => Promise<void>; matters: any[]; userId: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    matterId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    hours: 1,
    description: '',
    billable: true,
    rate: 450
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        matterId: formData.matterId || undefined, // Make matter optional
        date: localDateToISO(formData.date),
        billed: false,
        aiGenerated: false
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>New Time Entry</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Matter (optional)</label>
            <select
              value={formData.matterId}
              onChange={(e) => {
                const matter = matters.find((m: any) => m.id === e.target.value)
                setFormData({
                  ...formData, 
                  matterId: e.target.value,
                  rate: matter?.billingRate || 450
                })
              }}
            >
              <option value="">No matter selected</option>
              {matters.map((m: any) => (
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
              />
            </div>
            <div className={styles.formGroup}>
              <label>Hours</label>
              <input
                type="number"
                value={formData.hours}
                onChange={(e) => setFormData({...formData, hours: parseFloat(e.target.value)})}
                min="0.1"
                step="0.1"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Description (optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe the work performed"
              rows={3}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Rate ($/hr)</label>
              <input
                type="number"
                value={formData.rate}
                onChange={(e) => setFormData({...formData, rate: parseInt(e.target.value)})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Billable</label>
              <select
                value={formData.billable ? 'yes' : 'no'}
                onChange={(e) => setFormData({...formData, billable: e.target.value === 'yes'})}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className={styles.entryTotal}>
            Total: ${(formData.hours * formData.rate).toLocaleString()}
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit Time Entry Modal
function EditTimeEntryModal({ entry, matters, onClose, onSave }: {
  entry: any
  matters: any[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    matterId: entry.matterId || '',
    date: format(parseAsLocalDate(entry.date), 'yyyy-MM-dd'),
    hours: entry.hours,
    description: entry.description || '',
    billable: entry.billable,
    rate: entry.rate
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        matterId: formData.matterId || undefined, // Make matter optional
        date: localDateToISO(formData.date)
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Edit Time Entry</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Matter (optional)</label>
            <select
              value={formData.matterId}
              onChange={(e) => {
                const matter = matters.find((m: any) => m.id === e.target.value)
                setFormData({
                  ...formData, 
                  matterId: e.target.value,
                  rate: matter?.billingRate || formData.rate
                })
              }}
            >
              <option value="">No matter selected</option>
              {matters.map((m: any) => (
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
              />
            </div>
            <div className={styles.formGroup}>
              <label>Hours</label>
              <input
                type="number"
                value={formData.hours}
                onChange={(e) => setFormData({...formData, hours: parseFloat(e.target.value)})}
                min="0.1"
                step="0.1"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Description (optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe the work performed"
              rows={3}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Rate ($/hr)</label>
              <input
                type="number"
                value={formData.rate}
                onChange={(e) => setFormData({...formData, rate: parseInt(e.target.value)})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Billable</label>
              <select
                value={formData.billable ? 'yes' : 'no'}
                onChange={(e) => setFormData({...formData, billable: e.target.value === 'yes'})}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className={styles.entryTotal}>
            Total: ${(formData.hours * formData.rate).toLocaleString()}
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

// Save Timer Modal - Save stopped timer as time entry
function SaveTimerModal({ timer, matters, onClose, onSave }: {
  timer: any
  matters: any[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hours = secondsToHours(timer.elapsed)
  const matter = timer.matterId ? matters.find((m: any) => m.id === timer.matterId) : null
  
  const [formData, setFormData] = useState({
    matterId: timer.matterId || '',
    date: format(new Date(), 'yyyy-MM-dd'),
    hours: Math.max(0.01, hours),
    description: '',
    billable: true,
    rate: matter?.billingRate || 450
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        matterId: formData.matterId || undefined,
        date: localDateToISO(formData.date),
        billed: false,
        aiGenerated: false
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>
            <Save size={20} style={{ marginRight: '8px' }} />
            Save Time Entry
          </h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.timerSummary}>
            <div className={styles.timerSummaryItem}>
              <Clock size={16} />
              <span>Timer: {formatElapsedTime(timer.elapsed)}</span>
            </div>
            {timer.matterName && (
              <div className={styles.timerSummaryItem}>
                <span>Matter: {timer.matterName}</span>
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>Matter (optional)</label>
            <select
              value={formData.matterId}
              onChange={(e) => {
                const selectedMatter = matters.find((m: any) => m.id === e.target.value)
                setFormData({
                  ...formData, 
                  matterId: e.target.value,
                  rate: selectedMatter?.billingRate || 450
                })
              }}
            >
              <option value="">No matter selected</option>
              {matters.map((m: any) => (
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
              />
            </div>
            <div className={styles.formGroup}>
              <label>Hours</label>
              <input
                type="number"
                value={formData.hours}
                onChange={(e) => setFormData({...formData, hours: parseFloat(e.target.value)})}
                min="0.01"
                step="0.01"
              />
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

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Rate ($/hr)</label>
              <input
                type="number"
                value={formData.rate}
                onChange={(e) => setFormData({...formData, rate: parseInt(e.target.value)})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Billable</label>
              <select
                value={formData.billable ? 'yes' : 'no'}
                onChange={(e) => setFormData({...formData, billable: e.target.value === 'yes'})}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className={styles.entryTotal}>
            Total: ${(formData.hours * formData.rate).toLocaleString()}
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
              Discard
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Bill Time Modal - Creates invoices from selected time entries
function BillTimeModal({ 
  onClose, 
  selectedEntries, 
  matters, 
  clients,
  onCreateInvoice 
}: { 
  onClose: () => void
  selectedEntries: any[]
  matters: any[]
  clients: any[]
  onCreateInvoice: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [groupBy, setGroupBy] = useState<'matter' | 'client'>('matter')

  // Group entries by matter
  const entriesByMatter = useMemo(() => {
    const groups: Record<string, { matter: any, client: any, entries: any[], total: number, hours: number }> = {}
    
    selectedEntries.forEach(entry => {
      const matter = matters.find(m => m.id === entry.matterId)
      const client = matter ? clients.find(c => c.id === matter.clientId) : null
      const matterId = entry.matterId || 'no-matter'
      
      if (!groups[matterId]) {
        groups[matterId] = {
          matter,
          client,
          entries: [],
          total: 0,
          hours: 0
        }
      }
      groups[matterId].entries.push(entry)
      groups[matterId].total += entry.amount
      groups[matterId].hours += entry.hours
    })
    
    return Object.values(groups).filter(g => g.matter && g.client)
  }, [selectedEntries, matters, clients])

  // Group entries by client
  const entriesByClient = useMemo(() => {
    const groups: Record<string, { client: any, matters: any[], entries: any[], total: number, hours: number }> = {}
    
    selectedEntries.forEach(entry => {
      const matter = matters.find(m => m.id === entry.matterId)
      const client = matter ? clients.find(c => c.id === matter.clientId) : null
      const clientId = client?.id || 'unknown'
      
      if (!groups[clientId]) {
        groups[clientId] = {
          client,
          matters: [],
          entries: [],
          total: 0,
          hours: 0
        }
      }
      if (matter && !groups[clientId].matters.find(m => m.id === matter.id)) {
        groups[clientId].matters.push(matter)
      }
      groups[clientId].entries.push(entry)
      groups[clientId].total += entry.amount
      groups[clientId].hours += entry.hours
    })
    
    return Object.values(groups).filter(g => g.client)
  }, [selectedEntries, matters, clients])

  const totalAmount = selectedEntries.reduce((sum, e) => sum + e.amount, 0)
  const totalHours = selectedEntries.reduce((sum, e) => sum + e.hours, 0)
  
  const invoiceCount = groupBy === 'matter' ? entriesByMatter.length : entriesByClient.length

  const handleCreateInvoices = async () => {
    setIsSubmitting(true)
    try {
      if (groupBy === 'matter') {
        for (const group of entriesByMatter) {
          if (!group.matter || !group.client) continue
          
          const lineItems = group.entries.map(entry => ({
            description: entry.description || 'Legal services',
            quantity: entry.hours,
            rate: entry.rate,
            amount: entry.amount
          }))
          
          await onCreateInvoice({
            clientId: group.client.id,
            matterId: group.matter.id,
            issueDate: new Date().toISOString(),
            dueDate: addDays(new Date(), 30).toISOString(),
            status: 'draft',
            subtotal: group.total,
            total: group.total,
            amountPaid: 0,
            lineItems,
            timeEntryIds: group.entries.map(e => e.id)
          })
        }
      } else {
        for (const group of entriesByClient) {
          if (!group.client) continue
          
          const lineItems = group.entries.map(entry => {
            const matter = matters.find(m => m.id === entry.matterId)
            return {
              description: `${matter?.name || 'Legal Services'}: ${entry.description || 'Services rendered'}`,
              quantity: entry.hours,
              rate: entry.rate,
              amount: entry.amount
            }
          })
          
          const primaryMatter = group.matters[0]
          
          await onCreateInvoice({
            clientId: group.client.id,
            matterId: primaryMatter?.id,
            issueDate: new Date().toISOString(),
            dueDate: addDays(new Date(), 30).toISOString(),
            status: 'draft',
            subtotal: group.total,
            total: group.total,
            amountPaid: 0,
            lineItems,
            timeEntryIds: group.entries.map(e => e.id)
          })
        }
      }
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

          {/* Grouping Toggle */}
          <div className={styles.groupingToggle}>
            <span className={styles.groupingLabel}>Group by:</span>
            <div className={styles.toggleGroup}>
              <button 
                className={clsx(styles.toggleBtn, groupBy === 'matter' && styles.active)}
                onClick={() => setGroupBy('matter')}
              >
                Matter
              </button>
              <button 
                className={clsx(styles.toggleBtn, groupBy === 'client' && styles.active)}
                onClick={() => setGroupBy('client')}
              >
                Client
              </button>
            </div>
          </div>

          {/* Preview List */}
          <div className={styles.invoicePreviewCompact}>
            <div className={styles.previewHeader}>
              <span>{invoiceCount} invoice{invoiceCount !== 1 ? 's' : ''} to create</span>
            </div>
            <div className={styles.previewListCompact}>
              {groupBy === 'matter' ? (
                entriesByMatter.map((group, i) => (
                  <div key={i} className={styles.previewItemCompact}>
                    <div className={styles.previewItemLeft}>
                      <span className={styles.previewClientName}>{group.client?.name || 'Unknown'}</span>
                      <span className={styles.previewMatterName}>{group.matter?.name || 'Unknown'}</span>
                    </div>
                    <div className={styles.previewItemRight}>
                      <span className={styles.previewItemHours}>{group.hours.toFixed(1)}h</span>
                      <span className={styles.previewItemAmount}>${group.total.toLocaleString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                entriesByClient.map((group, i) => (
                  <div key={i} className={styles.previewItemCompact}>
                    <div className={styles.previewItemLeft}>
                      <span className={styles.previewClientName}>{group.client?.name || 'Unknown'}</span>
                      <span className={styles.previewMatterName}>{group.matters.length} matter{group.matters.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className={styles.previewItemRight}>
                      <span className={styles.previewItemHours}>{group.hours.toFixed(1)}h</span>
                      <span className={styles.previewItemAmount}>${group.total.toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Info Note */}
          <div className={styles.billNote}>
            <span>Invoices created as drafts • Time entries marked as billed</span>
          </div>
        </div>

        <div className={styles.billModalFooter}>
          <button onClick={onClose} className={styles.cancelBtnSecondary} disabled={isSubmitting}>
            Cancel
          </button>
          <button 
            onClick={handleCreateInvoices} 
            className={styles.createInvoiceBtn}
            disabled={isSubmitting || invoiceCount === 0}
          >
            {isSubmitting ? 'Creating...' : `Create ${invoiceCount} Invoice${invoiceCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
