import { useState, useEffect } from 'react'
import { useTimer, formatElapsedTime, secondsToHours } from '../contexts/TimerContext'
import { useDataStore } from '../stores/dataStore'
import { Clock, Play, Pause, Save, X, ChevronDown, Briefcase, Users } from 'lucide-react'
import { format } from 'date-fns'
import styles from './FloatingTimer.module.css'
import { clsx } from 'clsx'
import { useToast } from './Toast'

export function FloatingTimer() {
  const { timer, pauseTimer, resumeTimer, stopTimer: _stopTimer, discardTimer, isTimerActive, startTimer } = useTimer()
  const { matters, clients, addTimeEntry, fetchTimeEntries } = useDataStore()
  const toast = useToast()
  
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showStartModal, setShowStartModal] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [saveFormData, setSaveFormData] = useState({
    matterId: '',
    clientId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    hours: 0,
    description: '',
    billable: true,
    rate: 450
  })
  const [startMode, setStartMode] = useState<'matter' | 'client'>('matter')
  const [selectedMatterId, setSelectedMatterId] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Update form data when opening save modal
  useEffect(() => {
    if (showSaveModal) {
      const hours = secondsToHours(timer.elapsed)
      const matter = timer.matterId ? matters.find(m => m.id === timer.matterId) : null
      
      setSaveFormData({
        matterId: timer.matterId || '',
        clientId: timer.clientId || '',
        date: format(new Date(), 'yyyy-MM-dd'),
        hours: Math.max(0.01, hours),
        description: '',
        billable: true,
        rate: matter?.billingRate || 450
      })
    }
  }, [showSaveModal, timer, matters])

  const handleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    
    try {
      await addTimeEntry({
        matterId: saveFormData.matterId || undefined,
        date: new Date(saveFormData.date).toISOString(),
        hours: saveFormData.hours,
        description: saveFormData.description || 'Timer entry',
        billable: saveFormData.billable,
        billed: false,
        rate: saveFormData.rate,
        aiGenerated: false,
        status: 'pending',
        entryType: 'timer',
        updatedAt: new Date().toISOString()
      } as any)
      
      await fetchTimeEntries({ limit: 500 })
      discardTimer()
      setShowSaveModal(false)
    } catch (error) {
      console.error('Failed to save timer entry:', error)
      toast.info('Failed to save time entry. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenSaveModal = () => {
    if (timer.isRunning && !timer.isPaused) {
      pauseTimer()
    }
    setShowSaveModal(true)
  }

  const timerLabel = timer.matterName || timer.clientName || 'Timer'

  // Don't render anything if no timer is active and modal is closed
  if (!isTimerActive && !showStartModal) {
    return (
      <button 
        className={styles.startTimerBtn}
        onClick={() => setShowStartModal(true)}
        title="Start Timer"
      >
        <Clock size={20} />
        <span>Start Timer</span>
      </button>
    )
  }

  return (
    <>
      {/* Floating Timer Display */}
      {isTimerActive && (
        <div className={clsx(styles.floatingTimer, isMinimized && styles.minimized)}>
          {isMinimized ? (
            <button 
              className={styles.minimizedTimer}
              onClick={() => setIsMinimized(false)}
            >
              <Clock size={16} />
              <span className={styles.miniTime}>{formatElapsedTime(timer.elapsed)}</span>
              {timer.isPaused && <span className={styles.pausedBadge}>||</span>}
            </button>
          ) : (
            <>
              <div className={styles.timerHeader}>
                <div className={styles.timerIcon}>
                  {timer.matterId ? <Briefcase size={14} /> : <Users size={14} />}
                </div>
                <span className={styles.timerLabel}>{timerLabel}</span>
                <button 
                  className={styles.minimizeBtn}
                  onClick={() => setIsMinimized(true)}
                  title="Minimize"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              
              <div className={styles.timerDisplay}>
                <span className={clsx(styles.timerTime, timer.isPaused && styles.paused)}>
                  {formatElapsedTime(timer.elapsed)}
                </span>
                {timer.isPaused && <span className={styles.pausedLabel}>Paused</span>}
              </div>
              
              <div className={styles.timerActions}>
                {timer.isPaused ? (
                  <button 
                    className={clsx(styles.actionBtn, styles.playBtn)}
                    onClick={resumeTimer}
                    title="Resume"
                  >
                    <Play size={18} />
                  </button>
                ) : (
                  <button 
                    className={clsx(styles.actionBtn, styles.pauseBtn)}
                    onClick={pauseTimer}
                    title="Pause"
                  >
                    <Pause size={18} />
                  </button>
                )}
                
                <button 
                  className={clsx(styles.actionBtn, styles.saveBtn)}
                  onClick={handleOpenSaveModal}
                  title="Save Time Entry"
                >
                  <Save size={18} />
                </button>
                
                <button 
                  className={clsx(styles.actionBtn, styles.discardBtn)}
                  onClick={discardTimer}
                  title="Discard"
                >
                  <X size={18} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Start Timer Modal */}
      {showStartModal && (
        <div className={styles.modalOverlay} onClick={() => setShowStartModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Start Timer</h3>
              <button onClick={() => setShowStartModal(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              <div className={styles.modeToggle}>
                <button 
                  className={clsx(styles.modeBtn, startMode === 'matter' && styles.active)}
                  onClick={() => setStartMode('matter')}
                >
                  <Briefcase size={16} />
                  <span>By Matter</span>
                </button>
                <button 
                  className={clsx(styles.modeBtn, startMode === 'client' && styles.active)}
                  onClick={() => setStartMode('client')}
                >
                  <Users size={16} />
                  <span>By Client</span>
                </button>
              </div>

              {startMode === 'matter' ? (
                <div className={styles.formGroup}>
                  <label>Select Matter (optional)</label>
                  <select
                    value={selectedMatterId}
                    onChange={(e) => setSelectedMatterId(e.target.value)}
                  >
                    <option value="">No matter selected</option>
                    {matters.filter(m => m.status === 'active').map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className={styles.formGroup}>
                  <label>Select Client (optional)</label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                  >
                    <option value="">No client selected</option>
                    {clients.filter(c => c.isActive !== false).map(c => (
                      <option key={c.id} value={c.id}>{c.name || c.displayName}</option>
                    ))}
                  </select>
                </div>
              )}

              <p className={styles.helperText}>
                You can start a timer without selecting anything. You'll be able to assign it when you save.
              </p>
            </div>
            
            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn} 
                onClick={() => setShowStartModal(false)}
              >
                Cancel
              </button>
              <button 
                className={styles.startBtn}
                onClick={() => {
                  if (startMode === 'matter') {
                    const matter = matters.find(m => m.id === selectedMatterId)
                    startTimer({
                      matterId: selectedMatterId || undefined,
                      matterName: matter?.name,
                      clientId: matter?.clientId,
                    })
                  } else {
                    const client = clients.find(c => c.id === selectedClientId)
                    startTimer({
                      clientId: selectedClientId || undefined,
                      clientName: client?.name || client?.displayName,
                    })
                  }
                  setShowStartModal(false)
                  setSelectedMatterId('')
                  setSelectedClientId('')
                }}
              >
                <Play size={16} />
                Start Timer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Time Entry Modal */}
      {showSaveModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSaveModal(false)}>
          <div className={styles.saveModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Save Time Entry</h3>
              <button onClick={() => setShowSaveModal(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {/* Time Summary */}
              <div className={styles.timeSummary}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Duration</span>
                  <span className={styles.summaryValue}>{formatElapsedTime(timer.elapsed)}</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Hours</span>
                  <span className={styles.summaryValue}>{saveFormData.hours.toFixed(2)}h</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Amount</span>
                  <span className={styles.summaryValue}>${(saveFormData.hours * saveFormData.rate).toLocaleString()}</span>
                </div>
              </div>

              {/* Form */}
              <div className={styles.formGroup}>
                <label>Matter (optional)</label>
                <select
                  value={saveFormData.matterId}
                  onChange={(e) => {
                    const matter = matters.find(m => m.id === e.target.value)
                    setSaveFormData({
                      ...saveFormData,
                      matterId: e.target.value,
                      rate: matter?.billingRate || saveFormData.rate
                    })
                  }}
                >
                  <option value="">No matter selected</option>
                  {matters.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Date</label>
                  <input
                    type="date"
                    value={saveFormData.date}
                    onChange={(e) => setSaveFormData({...saveFormData, date: e.target.value})}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Hours</label>
                  <input
                    type="number"
                    value={saveFormData.hours}
                    onChange={(e) => setSaveFormData({...saveFormData, hours: parseFloat(e.target.value) || 0})}
                    min="0.01"
                    step="0.01"
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Description (optional)</label>
                <textarea
                  value={saveFormData.description}
                  onChange={(e) => setSaveFormData({...saveFormData, description: e.target.value})}
                  placeholder="Describe the work performed..."
                  rows={3}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Rate ($/hr)</label>
                  <input
                    type="number"
                    value={saveFormData.rate}
                    onChange={(e) => setSaveFormData({...saveFormData, rate: parseInt(e.target.value) || 0})}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Billable</label>
                  <select
                    value={saveFormData.billable ? 'yes' : 'no'}
                    onChange={(e) => setSaveFormData({...saveFormData, billable: e.target.value === 'yes'})}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>

              <div className={styles.entryTotal}>
                Total: ${(saveFormData.hours * saveFormData.rate).toLocaleString()}
              </div>
            </div>
            
            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn} 
                onClick={() => setShowSaveModal(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button 
                className={styles.saveEntryBtn}
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Time Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
