import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { 
  Plus, Play, Pause, Clock, Calendar, DollarSign, 
  TrendingUp, Sparkles
} from 'lucide-react'
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns'
import { clsx } from 'clsx'
import styles from './TimeTrackingPage.module.css'

export function TimeTrackingPage() {
  const { timeEntries, matters, addTimeEntry } = useDataStore()
  const { user } = useAuthStore()
  const [showNewModal, setShowNewModal] = useState(false)
  const [activeTimer, setActiveTimer] = useState<{ matterId: string; startTime: Date } | null>(null)
  const [timerElapsed, setTimerElapsed] = useState(0)

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
      .slice(0, 10)
  }, [timeEntries])

  const getMatterName = (matterId: string) => 
    matters.find(m => m.id === matterId)?.name || 'Unknown'
  const getMatterNumber = (matterId: string) => 
    matters.find(m => m.id === matterId)?.number || ''

  const startTimer = (matterId: string) => {
    setActiveTimer({ matterId, startTime: new Date() })
    setTimerElapsed(0)
  }

  const stopTimer = () => {
    if (activeTimer) {
      const hours = timerElapsed / 3600
      if (hours >= 0.1) {
        const matter = matters.find(m => m.id === activeTimer.matterId)
        addTimeEntry({
          matterId: activeTimer.matterId,
          userId: user?.id || 'user-1',
          date: new Date().toISOString(),
          hours: Math.round(hours * 10) / 10,
          description: 'Timer entry',
          billable: true,
          billed: false,
          rate: matter?.billingRate || 450,
          aiGenerated: false
        })
      }
      setActiveTimer(null)
      setTimerElapsed(0)
    }
  }

  // Timer effect would go here in a real app
  // useEffect for updating timerElapsed every second

  return (
    <div className={styles.timeTrackingPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Time Tracking</h1>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.aiBtn}>
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
      </div>

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

      {/* Active Timer */}
      {activeTimer && (
        <div className={styles.activeTimer}>
          <div className={styles.timerInfo}>
            <Play size={20} className={styles.timerIcon} />
            <div>
              <span className={styles.timerMatter}>{getMatterName(activeTimer.matterId)}</span>
              <span className={styles.timerTime}>
                {Math.floor(timerElapsed / 3600)}:{String(Math.floor((timerElapsed % 3600) / 60)).padStart(2, '0')}:{String(timerElapsed % 60).padStart(2, '0')}
              </span>
            </div>
          </div>
          <button onClick={stopTimer} className={styles.stopBtn}>
            <Pause size={18} />
            Stop Timer
          </button>
        </div>
      )}

      {/* Quick Timer */}
      {!activeTimer && (
        <div className={styles.quickTimer}>
          <h3>Quick Timer</h3>
          <div className={styles.matterButtons}>
            {matters.filter(m => m.status === 'active').slice(0, 6).map(matter => (
              <button 
                key={matter.id}
                className={styles.matterBtn}
                onClick={() => startTimer(matter.id)}
              >
                <Play size={14} />
                <span>{matter.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Entries */}
      <div className={styles.recentSection}>
        <h3>Recent Time Entries</h3>
        <div className={styles.entriesTable}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Matter</th>
                <th>Description</th>
                <th>Hours</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map(entry => (
                <tr key={entry.id}>
                  <td>{format(parseISO(entry.date), 'MMM d, yyyy')}</td>
                  <td>
                    <Link to={`/matters/${entry.matterId}`}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNewModal && (
        <NewTimeEntryModal 
          onClose={() => setShowNewModal(false)}
          onSave={(data) => {
            addTimeEntry(data)
            setShowNewModal(false)
          }}
          matters={matters}
          userId={user?.id || 'user-1'}
        />
      )}
    </div>
  )
}

function NewTimeEntryModal({ onClose, onSave, matters, userId }: { onClose: () => void; onSave: (data: any) => void; matters: any[]; userId: string }) {
  const [formData, setFormData] = useState({
    matterId: matters[0]?.id || '',
    date: format(new Date(), 'yyyy-MM-dd'),
    hours: 1,
    description: '',
    billable: true,
    rate: 450
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      ...formData,
      userId,
      date: new Date(formData.date).toISOString(),
      billed: false,
      aiGenerated: false
    })
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
            <label>Matter</label>
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
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe the work performed"
              rows={3}
              required
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
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn}>
              Save Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
