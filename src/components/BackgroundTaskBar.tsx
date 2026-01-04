import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, X, CheckCircle, AlertCircle, StopCircle, MessageSquare } from 'lucide-react'
import { aiApi } from '../services/api'
import styles from './BackgroundTaskBar.module.css'

interface ActiveTask {
  id: string
  goal: string
  status: string
  progressPercent: number
  iterations: number
  currentStep: string
  summary?: string
  result?: any
}

export function BackgroundTaskBar() {
  const navigate = useNavigate()
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [completedTask, setCompletedTask] = useState<ActiveTask | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [isCancelled, setIsCancelled] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [polling, setPolling] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  // Check task status
  const checkActiveTask = useCallback(async () => {
    // Don't poll if we've cancelled or already complete
    if (isCancelling || isCancelled) return
    
    try {
      const response = await aiApi.getActiveTask()
      if (response.active && response.task) {
        const task = response.task
        
        // Check if task was cancelled
        if (task.status === 'cancelled') {
          setIsCancelled(true)
          setPolling(false)
          setActiveTask(prev => prev ? { ...prev, status: 'cancelled', currentStep: 'Cancelled' } : null)
          setTimeout(() => setActiveTask(null), 2000)
          return
        }
        
        setActiveTask({
          id: task.id,
          goal: task.goal,
          status: task.status,
          progressPercent: task.progress?.progressPercent || task.progressPercent || 5,
          iterations: task.iterations || 0,
          currentStep: task.current_step || task.progress?.currentStep || 'Working...',
          summary: task.summary,
          result: task.result
        })
        setIsComplete(false)
        setHasError(task.status === 'error' || task.status === 'failed')
      } else if (activeTask && !response.active) {
        // Task just completed - fetch the final details
        try {
          const taskDetails = await aiApi.getTask(activeTask.id)
          if (taskDetails) {
            setCompletedTask({
              ...activeTask,
              summary: taskDetails.summary,
              result: taskDetails.result,
              status: taskDetails.status
            })
          }
        } catch (e) {
          setCompletedTask(activeTask)
        }
        setIsComplete(true)
        setPolling(false)
        // Don't auto-dismiss - let user click View Summary or dismiss manually
      } else {
        // No active task
        setPolling(false)
      }
    } catch (error) {
      console.error('Error checking active task:', error)
    }
  }, [activeTask, isCancelling, isCancelled])

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
    
    // Immediately stop polling and update UI
    setIsCancelling(true)
    setPolling(false)
    setActiveTask(prev => prev ? { ...prev, status: 'cancelling', currentStep: 'Stopping agent...' } : null)
    
    try {
      await aiApi.cancelTask(activeTask.id)
      setIsCancelled(true)
      setActiveTask(prev => prev ? { ...prev, status: 'cancelled', currentStep: 'Cancelled' } : null)
      // Auto-dismiss after 2 seconds
      setTimeout(() => {
        setActiveTask(null)
        setIsCancelling(false)
        setIsCancelled(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to cancel task:', error)
      // Still dismiss - the backend may have already stopped
      setIsCancelled(true)
      setActiveTask(prev => prev ? { ...prev, status: 'cancelled', currentStep: 'Stopped' } : null)
      setTimeout(() => {
        setActiveTask(null)
        setIsCancelling(false)
        setIsCancelled(false)
      }, 2000)
    }
  }

  const handleDismiss = () => {
    setActiveTask(null)
    setCompletedTask(null)
    setPolling(false)
    setIsComplete(false)
    setIsCancelled(false)
    setIsCancelling(false)
  }

  const handleViewSummary = () => {
    // Store the task summary in sessionStorage for the AI assistant to pick up
    const taskToShow = completedTask || activeTask
    if (taskToShow) {
      sessionStorage.setItem('backgroundTaskSummary', JSON.stringify({
        goal: taskToShow.goal,
        summary: taskToShow.summary || `Completed: ${taskToShow.goal}`,
        result: taskToShow.result,
        status: taskToShow.status
      }))
    }
    // Navigate to AI assistant page
    navigate('/app/ai')
    // Dismiss the bar
    handleDismiss()
    // Trigger the AI chat to open and show the summary
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openAIChat', { 
        detail: { showTaskSummary: true } 
      }))
    }, 100)
  }

  const handleBarClick = () => {
    // Open AI chat when clicking on the progress bar (while task is running)
    window.dispatchEvent(new CustomEvent('openAIChat'))
  }

  // Only render when there's an active task or recently completed task
  if (!activeTask) return null

  const isCancelledState = isCancelled || activeTask.status === 'cancelled' || activeTask.status === 'cancelling'

  return (
    <div className={`${styles.taskBar} ${isComplete ? styles.complete : ''} ${hasError ? styles.error : ''} ${isCancelledState ? styles.cancelled : ''}`}>
      <div className={styles.content}>
        {/* Clickable area - opens AI chat */}
        <div className={styles.clickableArea} onClick={handleBarClick} title="Click to open AI Assistant">
          <div className={styles.icon}>
            {isComplete ? (
              <CheckCircle size={20} />
            ) : hasError ? (
              <AlertCircle size={20} />
            ) : isCancelledState ? (
              <StopCircle size={20} />
            ) : (
              <Bot size={20} className={styles.spinning} />
            )}
          </div>
          
          <div className={styles.info}>
            <div className={styles.header}>
              <div className={styles.title}>
                {isComplete ? 'Background Task Complete' : 
                 hasError ? 'Task Error' : 
                 isCancelledState ? 'Task Cancelled' :
                 'Background Agent Working'}
              </div>
              {!isComplete && !hasError && !isCancelledState && (
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
              {isComplete ? 'Done!' : isCancelledState ? 'Stopped' : `${activeTask.progressPercent}%`}
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          {isComplete && (
            <button 
              onClick={handleViewSummary} 
              className={styles.viewSummaryBtn}
              title="View task summary in AI Assistant"
            >
              <MessageSquare size={14} />
              View Summary
            </button>
          )}
          {!isComplete && !hasError && !isCancelledState && (
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
