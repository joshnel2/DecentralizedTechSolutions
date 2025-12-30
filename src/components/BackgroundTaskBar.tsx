import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, X, CheckCircle, AlertCircle, StopCircle, ExternalLink } from 'lucide-react'
import { aiApi } from '../services/api'
import styles from './BackgroundTaskBar.module.css'

interface SubTaskProgress {
  index: number
  task: string
  status: 'pending' | 'in_progress' | 'completed'
  actionsCompleted: number
}

interface ActiveTask {
  id: string
  goal: string
  status: string
  progressPercent: number
  iterations: number
  totalSteps?: number
  completedSteps?: number
  currentStep: string
  result?: string
  // Sub-task tracking
  currentSubTask?: number
  totalSubTasks?: number
  subTasks?: string[]
  subTaskProgress?: SubTaskProgress[]
}

export function BackgroundTaskBar() {
  const navigate = useNavigate()
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [polling, setPolling] = useState(false)

  // Track consecutive errors
  const [errorCount, setErrorCount] = useState(0)
  
  // Request notification permission and check for existing tasks on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    
    // Check if there's already a running task on page load
    const checkExistingTask = async () => {
      try {
        const response = await aiApi.getActiveTask()
        if (response.active && response.task) {
          setActiveTask(response.task)
          setPolling(true)
        }
      } catch (e) {
        // Ignore errors on initial check
      }
    }
    checkExistingTask()
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
        let taskResult = null
        try {
          taskResult = await aiApi.getTask(activeTask.id)
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
        
        // Auto-navigate to summary view after a brief delay
        setTimeout(() => {
          navigate(`/app/ai?showAgentHistory=true&taskId=${activeTask.id}`)
        }, 1500)
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

  // View progress/summary handler - navigate to AI Assistant page with agent history
  // Pass the taskId so we can show detailed progress for this specific task
  const handleViewProgress = () => {
    if (activeTask) {
      navigate(`/app/ai?showAgentHistory=true&taskId=${activeTask.id}`)
    } else {
      navigate('/app/ai?showAgentHistory=true')
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

    // Check immediately on start
    checkActiveTask()
    
    // Then poll every 3 seconds
    const intervalId = setInterval(checkActiveTask, 3000)
    return () => clearInterval(intervalId)
  }, [polling, isComplete, checkActiveTask])

  const handleDismiss = () => {
    setActiveTask(null)
    setPolling(false)
    setIsComplete(false)
    setHasError(false)
    setErrorCount(0)
  }

  const handleCancel = () => {
    if (!activeTask) return
    
    const taskId = activeTask.id
    
    // IMMEDIATELY clear everything - no waiting
    setActiveTask(null)
    setPolling(false)
    setIsComplete(false)
    setHasError(false)
    setErrorCount(0)
    
    // Fire API call in background - don't wait for it
    aiApi.cancelTask(taskId).catch((error) => {
      console.error('Error cancelling task:', error)
    })
  }

  // Only render when there's an active task
  if (!activeTask) return null
  
  const isCancelled = activeTask.status === 'cancelled'

  return (
    <>
      <div className={`${styles.taskBar} ${isComplete ? styles.complete : ''} ${isCancelled ? styles.cancelled : ''} ${hasError ? styles.error : ''}`}>
        <div className={styles.content}>
          {/* Clickable area - navigates to agent progress page */}
          <button 
            className={styles.clickableArea}
            onClick={handleViewProgress}
            title="Click to view agent progress"
          >
            <div className={styles.icon}>
              {isCancelled ? (
                <StopCircle size={20} />
              ) : isComplete ? (
                <CheckCircle size={20} />
              ) : hasError ? (
                <AlertCircle size={20} />
              ) : (
                <Bot size={20} className={styles.spinning} />
              )}
            </div>
            
            <div className={styles.info}>
              <div className={styles.title}>
                {isCancelled ? '⏹ Task Cancelled (Progress Saved)' : isComplete ? '✓ Background Task Complete!' : hasError ? '⚠ Task Error' : (
                  activeTask.totalSubTasks && activeTask.totalSubTasks > 0 
                    ? `Background Agent Working... (Task ${(activeTask.currentSubTask || 0) + 1}/${activeTask.totalSubTasks})`
                    : 'Background Agent Working...'
                )}
              </div>
              <div className={styles.goal}>{activeTask.goal}</div>
              {!isComplete && !hasError && !isCancelled && (
                <div className={styles.currentStep}>
                  {activeTask.subTasks && activeTask.currentSubTask !== undefined && activeTask.subTasks[activeTask.currentSubTask]
                    ? activeTask.subTasks[activeTask.currentSubTask]
                    : activeTask.currentStep || 'Working...'}
                </div>
              )}
            </div>

            <div className={styles.progress}>
              <div className={styles.progressBar}>
                <div 
                  className={`${styles.progressFill} ${isCancelled ? styles.cancelledFill : ''}`}
                  style={{ width: `${isComplete && !isCancelled ? 100 : activeTask.progressPercent}%` }}
                />
              </div>
              <div className={styles.progressText}>
                {isCancelled ? `${activeTask.progressPercent}%` : isComplete ? '100%' : `${activeTask.progressPercent}%`}
              </div>
            </div>
          </button>

          {/* Stop button - only visible while running */}
          {!isComplete && !hasError && !isCancelled && (
            <button 
              onClick={handleCancel} 
              className={styles.cancelBtn}
              title="Stop task immediately"
            >
              <StopCircle size={14} />
              Stop
            </button>
          )}

          {/* View Progress button - visible during and after task */}
          <button 
            onClick={handleViewProgress} 
            className={styles.viewProgressBtn}
          >
            <ExternalLink size={14} />
            {isComplete || isCancelled ? 'View Summary' : 'View Progress'}
          </button>

          {/* Dismiss/Stop button - immediately clears the bar */}
          <button 
            onClick={isComplete || isCancelled ? handleDismiss : handleCancel} 
            className={styles.dismissBtn}
            title={isComplete || isCancelled ? 'Dismiss' : 'Stop and dismiss'}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </>
  )
}
