import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, X, CheckCircle, AlertCircle, FileText, Square, Loader2 } from 'lucide-react'
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
  const navigate = useNavigate()
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [polling, setPolling] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Track consecutive errors
  const [errorCount, setErrorCount] = useState(0)
  
  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])
  
  // Check task status
  const checkActiveTask = useCallback(async () => {
    try {
      const response = await aiApi.getActiveTask()
      setErrorCount(0) // Reset error count on success
      
      if (response.active && response.task) {
        setActiveTask(response.task)
        setIsComplete(false)
        setHasError(false)
      } else if (activeTask && !response.active) {
        // Task just completed - fetch the final result with summary
        try {
          const taskResult = await aiApi.getTask(activeTask.id)
          setActiveTask({
            ...activeTask,
            progressPercent: 100,
            result: taskResult?.task?.result || 'Task completed'
          })
        } catch (e) {
          setActiveTask({
            ...activeTask,
            progressPercent: 100
          })
        }
        setIsComplete(true)
        setPolling(false)
        
        // Send browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Background Task Complete', {
            body: activeTask.goal,
            icon: '/favicon.svg'
          })
        }
      }
      // Don't stop polling if no active task - keep checking
    } catch (error) {
      console.error('Error checking active task:', error)
      setErrorCount(prev => prev + 1)
      
      // Only stop polling after 10 consecutive errors
      if (errorCount >= 10) {
        console.error('Too many errors, stopping poll')
        setHasError(true)
        setPolling(false)
      }
      // Otherwise keep polling - the task might still be running
    }
  }, [activeTask, errorCount])

  // View summary handler - navigate to AI Assistant page with agent history
  const handleViewSummary = () => {
    navigate('/app/ai?showAgentHistory=true')
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

    // Check immediately on start
    checkActiveTask()
    
    // Then poll every 3 seconds
    const intervalId = setInterval(checkActiveTask, 3000)
    return () => clearInterval(intervalId)
  }, [polling, isComplete, checkActiveTask])

  const handleDismiss = () => {
    setActiveTask(null)
    setPolling(false)
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
            >
              <FileText size={14} />
              View Summary
            </button>
          )}

          <button onClick={handleDismiss} className={styles.dismissBtn}>
            <X size={16} />
          </button>
        </div>
      </div>
    </>
  )
}
