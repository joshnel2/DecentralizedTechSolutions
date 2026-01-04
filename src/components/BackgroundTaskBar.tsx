import { useState, useEffect, useCallback } from 'react'
import { Bot, X, CheckCircle, AlertCircle, StopCircle } from 'lucide-react'
import { aiApi } from '../services/api'
import styles from './BackgroundTaskBar.module.css'

interface ActiveTask {
  id: string
  goal: string
  status: string
  progressPercent: number
  iterations: number
  currentStep: string
}

export function BackgroundTaskBar() {
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [polling, setPolling] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  // Check task status
  const checkActiveTask = useCallback(async () => {
    try {
      const response = await aiApi.getActiveTask()
      if (response.active && response.task) {
        const task = response.task
        setActiveTask({
          id: task.id,
          goal: task.goal,
          status: task.status,
          progressPercent: task.progress?.progressPercent || task.progressPercent || 5,
          iterations: task.iterations || 0,
          currentStep: task.current_step || task.progress?.currentStep || 'Working...'
        })
        setIsComplete(false)
        setHasError(task.status === 'error' || task.status === 'failed')
      } else if (activeTask && !response.active) {
        // Task just completed
        setIsComplete(true)
        setPolling(false)
        setTimeout(() => {
          setActiveTask(null)
        }, 5000)
      } else {
        // No active task
        setPolling(false)
      }
    } catch (error) {
      console.error('Error checking active task:', error)
    }
  }, [activeTask])

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

  // Poll for task updates when we have an active task
  useEffect(() => {
    if (!polling || isComplete) return

    // Check immediately
    checkActiveTask()

    // Then poll every 2 seconds
    const intervalId = setInterval(checkActiveTask, 2000)
    return () => clearInterval(intervalId)
  }, [polling, isComplete, checkActiveTask])

  // Also check on mount for any existing tasks
  useEffect(() => {
    const checkExisting = async () => {
      try {
        const response = await aiApi.getActiveTask()
        if (response.active && response.task) {
          const task = response.task
          setActiveTask({
            id: task.id,
            goal: task.goal,
            status: task.status,
            progressPercent: task.progress?.progressPercent || task.progressPercent || 5,
            iterations: task.iterations || 0,
            currentStep: task.current_step || task.progress?.currentStep || 'Working...'
          })
          setPolling(true)
        }
      } catch (e) {
        // No active task
      }
    }
    checkExisting()
  }, [])

  const handleCancel = async () => {
    if (!activeTask || isCancelling) return
    
    setIsCancelling(true)
    try {
      await aiApi.cancelTask(activeTask.id)
      setActiveTask(prev => prev ? { ...prev, status: 'cancelled', currentStep: 'Cancelling...' } : null)
      setTimeout(() => {
        setActiveTask(null)
        setPolling(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to cancel task:', error)
    } finally {
      setIsCancelling(false)
    }
  }

  const handleDismiss = () => {
    setActiveTask(null)
    setPolling(false)
  }

  // Only render when there's an active task
  if (!activeTask) return null

  return (
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
          <div className={styles.header}>
            <div className={styles.title}>
              {isComplete ? 'Background Task Complete' : hasError ? 'Task Error' : 'Background Agent Working'}
            </div>
            {!isComplete && !hasError && (
              <div className={styles.iterations}>
                Step {activeTask.iterations || 1}
              </div>
            )}
          </div>
          <div className={styles.goal}>{activeTask.goal}</div>
          <div className={styles.step}>{activeTask.currentStep}</div>
        </div>

        <div className={styles.progress}>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill} 
              style={{ width: `${isComplete ? 100 : activeTask.progressPercent}%` }}
            />
          </div>
          <div className={styles.progressText}>
            {isComplete ? 'Done!' : `${activeTask.progressPercent}%`}
          </div>
        </div>

        <div className={styles.actions}>
          {!isComplete && !hasError && (
            <button 
              onClick={handleCancel} 
              className={styles.cancelBtn}
              disabled={isCancelling}
              title="Cancel task"
            >
              <StopCircle size={16} />
            </button>
          )}
          <button onClick={handleDismiss} className={styles.dismissBtn} title="Dismiss">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
