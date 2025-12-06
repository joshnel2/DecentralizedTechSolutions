import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { useAIChat } from '../contexts/AIChatContext'
import { 
  Plus, Clock, DollarSign, 
  TrendingUp, Sparkles, CheckSquare, FileText, X, Edit2
} from 'lucide-react'
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addDays } from 'date-fns'
import { clsx } from 'clsx'
import styles from './TimeTrackingPage.module.css'

export function TimeTrackingPage() {
  const { timeEntries, matters, clients, addTimeEntry, updateTimeEntry, addInvoice, fetchTimeEntries, fetchMatters, fetchClients, fetchInvoices } = useDataStore()
  const { openChat } = useAIChat()
  const navigate = useNavigate()
  
  // Fetch data from API on mount
  useEffect(() => {
    fetchTimeEntries()
    fetchMatters()
    fetchClients()
  }, [fetchTimeEntries, fetchMatters, fetchClients])
  const { user } = useAuthStore()
  const [showNewModal, setShowNewModal] = useState(false)
  const [showBillModal, setShowBillModal] = useState(false)
  const [selectedEntries, setSelectedEntries] = useState<string[]>([])
  const [editingEntry, setEditingEntry] = useState<any>(null)

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
      const date = parseISO(e.date)
      return date >= start && date <= end
    })

    const totalHours = weekEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = weekEntries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0)
    const totalValue = weekEntries.reduce((sum, e) => sum + e.amount, 0)

    const byDay = weekDays.map(day => ({
      day,
      hours: weekEntries
        .filter(e => isSameDay(parseISO(e.date), day))
        .reduce((sum, e) => sum + e.hours, 0)
    }))

    return { totalHours, billableHours, totalValue, byDay }
  }, [timeEntries, weekDays])

  const recentEntries = useMemo(() => {
    return [...timeEntries]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20) // Show more entries
  }, [timeEntries])

  const unbilledEntries = useMemo(() => {
    return timeEntries.filter(e => !e.billed && e.billable)
  }, [timeEntries])

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

  const toggleAllUnbilled = () => {
    const unbilledIds = unbilledEntries.map(e => e.id)
    const allSelected = unbilledIds.every(id => selectedEntries.includes(id))
    if (allSelected) {
      setSelectedEntries([])
    } else {
      setSelectedEntries(unbilledIds)
    }
  }

  return (
    <div className={styles.timeTrackingPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Time Tracking</h1>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.aiBtn}
            onClick={() => openChat({
              label: 'Time Tracking',
              contextType: 'time-tracking',
              suggestedQuestions: [
                'Suggest a time entry for my recent work',
                'Analyze my billable vs non-billable ratio',
                'What unbilled time should I invoice?',
                'Review my time entries for this week',
                'Suggest ways to improve my time capture'
              ]
            })}
          >
            <Sparkles size={16} />
            AI Time Suggestions
          </button>
          <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
            <Plus size={18} />
            New Entry
          </button>
        </div>
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
        <div className={clsx(styles.statCard, styles.unbilledCard)}>
          <FileText size={20} />
          <div>
            <span className={styles.statValue}>${unbilledTotal.toLocaleString()}</span>
            <span className={styles.statLabel}>Unbilled</span>
          </div>
        </div>
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

      {/* Recent Entries */}
      <div className={styles.recentSection}>
        <div className={styles.recentHeader}>
          <h3>Recent Time Entries</h3>
          {unbilledEntries.length > 0 && (
            <button 
              className={styles.selectAllBtn}
              onClick={toggleAllUnbilled}
            >
              {unbilledEntries.every(e => selectedEntries.includes(e.id)) 
                ? 'Deselect All Unbilled' 
                : `Select All Unbilled (${unbilledEntries.length})`}
            </button>
          )}
        </div>
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
              {recentEntries.map(entry => (
                <tr 
                  key={entry.id} 
                  className={clsx(
                    selectedEntries.includes(entry.id) && styles.selectedRow
                  )}
                >
                  <td>
                    {!entry.billed && entry.billable && (
                      <input
                        type="checkbox"
                        checked={selectedEntries.includes(entry.id)}
                        onChange={() => toggleEntrySelection(entry.id)}
                        className={styles.entryCheckbox}
                      />
                    )}
                  </td>
                  <td>{format(parseISO(entry.date), 'MMM d, yyyy')}</td>
                  <td>
                    <Link to={`/app/matters/${entry.matterId}`}>
                      <div className={styles.matterCell}>
                        <span>{getMatterName(entry.matterId)}</span>
                        <span className={styles.matterNum}>{getMatterNumber(entry.matterId)}</span>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <div className={styles.descCell}>
                      {entry.description}
                      {entry.aiGenerated && (
                        <span className={styles.aiTag}><Sparkles size={10} /></span>
                      )}
                    </div>
                  </td>
                  <td>{entry.hours}h</td>
                  <td>${entry.amount.toLocaleString()}</td>
                  <td>
                    <span className={clsx(styles.statusBadge, entry.billed ? styles.billed : styles.unbilled)}>
                      {entry.billed ? 'Billed' : 'Unbilled'}
                    </span>
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
      </div>

      {showNewModal && (
        <NewTimeEntryModal 
          onClose={() => setShowNewModal(false)}
          onSave={async (data) => {
            try {
              await addTimeEntry(data)
              setShowNewModal(false)
              fetchTimeEntries()
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
              await fetchTimeEntries()
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
              fetchTimeEntries()
            } catch (error) {
              console.error('Failed to update time entry:', error)
              alert('Failed to update time entry. Please try again.')
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
        date: new Date(formData.date).toISOString(),
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
    date: format(parseISO(entry.date), 'yyyy-MM-dd'),
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
        date: new Date(formData.date).toISOString()
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
      
      if (!groups[entry.matterId]) {
        groups[entry.matterId] = {
          matter,
          client,
          entries: [],
          total: 0,
          hours: 0
        }
      }
      groups[entry.matterId].entries.push(entry)
      groups[entry.matterId].total += entry.amount
      groups[entry.matterId].hours += entry.hours
    })
    
    return Object.values(groups)
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
    
    return Object.values(groups)
  }, [selectedEntries, matters, clients])

  const totalAmount = selectedEntries.reduce((sum, e) => sum + e.amount, 0)
  const totalHours = selectedEntries.reduce((sum, e) => sum + e.hours, 0)

  const handleCreateInvoices = async () => {
    setIsSubmitting(true)
    try {
      if (groupBy === 'matter') {
        // Create one invoice per matter
        for (const group of entriesByMatter) {
          if (!group.matter || !group.client) continue
          
          const lineItems = group.entries.map(entry => ({
            description: entry.description,
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
        // Create one invoice per client (combining all matters)
        for (const group of entriesByClient) {
          if (!group.client) continue
          
          const lineItems = group.entries.map(entry => {
            const matter = matters.find(m => m.id === entry.matterId)
            return {
              description: `${matter?.name || 'Legal Services'}: ${entry.description}`,
              quantity: entry.hours,
              rate: entry.rate,
              amount: entry.amount
            }
          })
          
          // Use first matter for the invoice (or could leave null)
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
        <div className={styles.modalHeader}>
          <h2>Create Invoice from Time Entries</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        
        <div className={styles.billModalBody}>
          {/* Summary */}
          <div className={styles.billSummary}>
            <div className={styles.billSummaryItem}>
              <span>{selectedEntries.length}</span>
              <label>Time Entries</label>
            </div>
            <div className={styles.billSummaryItem}>
              <span>{totalHours.toFixed(1)}h</span>
              <label>Total Hours</label>
            </div>
            <div className={styles.billSummaryItem}>
              <span>${totalAmount.toLocaleString()}</span>
              <label>Total Amount</label>
            </div>
          </div>

          {/* Grouping Option */}
          <div className={styles.groupingOption}>
            <label>Create invoices grouped by:</label>
            <div className={styles.groupingBtns}>
              <button 
                className={clsx(styles.groupBtn, groupBy === 'matter' && styles.active)}
                onClick={() => setGroupBy('matter')}
              >
                Matter ({entriesByMatter.length} invoice{entriesByMatter.length !== 1 ? 's' : ''})
              </button>
              <button 
                className={clsx(styles.groupBtn, groupBy === 'client' && styles.active)}
                onClick={() => setGroupBy('client')}
              >
                Client ({entriesByClient.length} invoice{entriesByClient.length !== 1 ? 's' : ''})
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className={styles.invoicePreview}>
            <h4>Invoice Preview</h4>
            {groupBy === 'matter' ? (
              <div className={styles.previewList}>
                {entriesByMatter.map((group, i) => (
                  <div key={i} className={styles.previewItem}>
                    <div className={styles.previewHeader}>
                      <div>
                        <strong>{group.client?.name || 'Unknown Client'}</strong>
                        <span className={styles.previewMatter}>{group.matter?.name || 'Unknown Matter'}</span>
                      </div>
                      <span className={styles.previewAmount}>${group.total.toLocaleString()}</span>
                    </div>
                    <div className={styles.previewDetails}>
                      {group.entries.length} entries • {group.hours.toFixed(1)} hours
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.previewList}>
                {entriesByClient.map((group, i) => (
                  <div key={i} className={styles.previewItem}>
                    <div className={styles.previewHeader}>
                      <div>
                        <strong>{group.client?.name || 'Unknown Client'}</strong>
                        <span className={styles.previewMatter}>
                          {group.matters.length} matter{group.matters.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className={styles.previewAmount}>${group.total.toLocaleString()}</span>
                    </div>
                    <div className={styles.previewDetails}>
                      {group.entries.length} entries • {group.hours.toFixed(1)} hours
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className={styles.billInfo}>
            <p>
              Invoices will be created as <strong>Draft</strong> and you can review them before sending.
              Time entries will be marked as <strong>Billed</strong> after invoice creation.
            </p>
          </div>
        </div>

        <div className={styles.modalActions}>
          <button onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
            Cancel
          </button>
          <button 
            onClick={handleCreateInvoices} 
            className={styles.saveBtn}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : `Create ${groupBy === 'matter' ? entriesByMatter.length : entriesByClient.length} Invoice${(groupBy === 'matter' ? entriesByMatter.length : entriesByClient.length) !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
