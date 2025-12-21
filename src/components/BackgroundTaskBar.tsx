import { useState, useEffect, useCallback } from 'react'
import { Bot, X, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import { aiApi } from '../services/api'
import styles from './BackgroundTaskBar.module.css'

interface ActiveTask {
  id: string
  goal: string
  status: string
  progressPercent: number
  iterations: number
  currentStep: string
  result?: string
}

export function BackgroundTaskBar() {
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [polling, setPolling] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

  // Check task status
  const checkActiveTask = useCallback(async () => {
    try {
      const response = await aiApi.getActiveTask()
      if (response.active && response.task) {
        setActiveTask(response.task)
        setIsComplete(false)
        setHasError(false)
      } else if (activeTask && !response.active) {
        // Task just completed - fetch the final result
        try {
          const taskResult = await aiApi.getTask(activeTask.id)
          if (taskResult.task) {
            setActiveTask({
              ...activeTask,
              progressPercent: 100,
              result: taskResult.task.result
            })
            setSummary(taskResult.task.result)
          }
        } catch (e) {
          console.error('Error fetching task result:', e)
        }
        setIsComplete(true)
        setPolling(false)
      } else {
        // No active task
        setPolling(false)
      }
    } catch (error) {
      console.error('Error checking active task:', error)
    }
  }, [activeTask])

  // View summary handler
  const handleViewSummary = async () => {
    if (summary) {
      setShowSummary(true)
      return
    }
    
    if (!activeTask) return
    
    setLoadingSummary(true)
    try {
      const taskResult = await aiApi.getTask(activeTask.id)
      if (taskResult.task?.result) {
        setSummary(taskResult.task.result)
        setShowSummary(true)
      }
    } catch (error) {
      console.error('Error fetching summary:', error)
    } finally {
      setLoadingSummary(false)
    }
  }

  // Listen for background task started event
  useEffect(() => {
    const handleTaskStarted = (event: CustomEvent) => {
      setActiveTask({
        id: event.detail.taskId,
        goal: event.detail.goal,
        status: 'running',
        progressPercent: 5,
        iterations: 0,
        currentStep: 'Starting...'
      })
      setIsComplete(false)
      setHasError(false)
      setPolling(true)
    }

    window.addEventListener('backgroundTaskStarted', handleTaskStarted as EventListener)
    return () => {
      window.removeEventListener('backgroundTaskStarted', handleTaskStarted as EventListener)
    }
  }, [])

  // Poll only when we have an active task
  useEffect(() => {
    if (!polling || isComplete) return

    const intervalId = setInterval(checkActiveTask, 2000)
    return () => clearInterval(intervalId)
  }, [polling, isComplete, checkActiveTask])

  const handleDismiss = () => {
    setActiveTask(null)
    setPolling(false)
    setShowSummary(false)
    setSummary(null)
  }

  // Only render when there's an active task
  if (!activeTask) return null

  return (
    <>
      <div className={`${styles.taskBar} ${isComplete ? styles.complete : ''} ${hasError ? styles.error : ''}`}>
        <div className={styles.content}>
          <div className={styles.icon}>
            {isComplete ? (
              <CheckCircle size={20} />
            ) : hasError ? (
              <AlertCircle size={20} />
            ) : (
              <Bot size={20} className={styles.spinning} />
            )}
          </div>
          
          <div className={styles.info}>
            <div className={styles.title}>
              {isComplete ? '✓ Background Task Complete!' : 'Background Agent Working...'}
            </div>
            <div className={styles.goal}>{activeTask.goal}</div>
          </div>

          <div className={styles.progress}>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill} 
                style={{ width: `${isComplete ? 100 : activeTask.progressPercent}%` }}
              />
            </div>
            <div className={styles.progressText}>
              {isComplete ? '100%' : `${activeTask.progressPercent}%`}
            </div>
          </div>

          {isComplete && (
            <button 
              onClick={handleViewSummary} 
              className={styles.viewSummaryBtn}
              disabled={loadingSummary}
            >
              <FileText size={14} />
              {loadingSummary ? 'Loading...' : 'View Summary'}
            </button>
          )}

          <button onClick={handleDismiss} className={styles.dismissBtn}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Summary Modal */}
      {showSummary && summary && (
        <div className={styles.summaryOverlay} onClick={() => setShowSummary(false)}>
          <div className={styles.summaryModal} onClick={e => e.stopPropagation()}>
            <div className={styles.summaryHeader}>
              <h3>
                <CheckCircle size={20} />
                Work Summary
              </h3>
              <button onClick={() => setShowSummary(false)} className={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.summaryGoal}>
              <strong>Task:</strong> {activeTask.goal}
            </div>
            <div className={styles.summaryContent}>
              {summary.split('\n').map((line, i) => (
                <p key={i}>{line || <br />}</p>
              ))}
            </div>
            <div className={styles.summaryFooter}>
              <button onClick={() => setShowSummary(false)} className={styles.doneBtn}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
