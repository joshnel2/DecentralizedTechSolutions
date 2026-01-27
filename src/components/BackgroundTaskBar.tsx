import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, X, CheckCircle, AlertCircle, StopCircle, MessageSquare, Rocket } from 'lucide-react'
import { aiApi } from '../services/api'
import styles from './BackgroundTaskBar.module.css'

interface ActiveTask {
  id: string
  goal: string
  status: string
  progressPercent: number
  iterations: number
  currentStep: string
  totalSteps?: number
  completedSteps?: number
  summary?: string
  result?: any
  isAmplifier?: boolean  // Track if this is an Amplifier background task
  lastActivityAt?: number  // Track last activity timestamp
}

const clampPercent = (value: number | null | undefined, fallback = 0) => {
  const resolved = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(100, Math.max(0, resolved))
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
  
  // Use ref to track isAmplifier immediately (avoids race condition with state updates)
  const isAmplifierRef = useRef(false)
  
  // Track last progress update to detect activity
  const lastProgressRef = useRef<{ step: string; percent: number; timestamp: number }>({ step: '', percent: 0, timestamp: Date.now() })
  const [isThinking, setIsThinking] = useState(false)

  // Check task status - supports both regular AI Agent and Amplifier background tasks
  const checkActiveTask = useCallback(async () => {
    // Don't poll if we've cancelled or already complete
    if (isCancelling || isCancelled) return
    
    try {
      // Use ref to check if current task is Amplifier-based (avoids race condition with state)
      if (isAmplifierRef.current) {
        // Poll Amplifier background agent
        const response = await aiApi.getActiveBackgroundTask()
        if (response.active && response.task) {
          const task = response.task
          const progressPercent = clampPercent(task.progress?.progressPercent, 5)
          
          if (task.status === 'cancelled') {
            setIsCancelled(true)
            setPolling(false)
            setActiveTask(prev => prev ? { ...prev, status: 'cancelled', currentStep: 'Cancelled' } : null)
            setTimeout(() => setActiveTask(null), 2000)
            return
          }
          
          const currentStep = task.progress?.currentStep || 'Working...'
          const now = Date.now()
          
          // Detect if we're in a "thinking" state (same step for a while but still running)
          if (lastProgressRef.current.step === currentStep && lastProgressRef.current.percent === progressPercent) {
            // Same state for a while - agent might be thinking
            if (now - lastProgressRef.current.timestamp > 5000) {
              setIsThinking(true)
            }
          } else {
            // Progress changed - update tracker and reset thinking state
            lastProgressRef.current = { step: currentStep, percent: progressPercent, timestamp: now }
            setIsThinking(false)
          }
          
          setActiveTask({
            id: task.id,
            goal: task.goal,
            status: task.status,
            progressPercent,
            iterations: task.progress?.iterations || 0,
            totalSteps: task.progress?.totalSteps,
            completedSteps: task.progress?.completedSteps,
            currentStep: currentStep,
            summary: task.result?.summary,
            result: task.result,
            isAmplifier: true,
            lastActivityAt: now
          })
          setIsComplete(false)
          setHasError(task.status === 'error' || task.status === 'failed')
        } else if (activeTask && !response.active) {
          // Task completed
          try {
            const taskDetails = await aiApi.getBackgroundTask(activeTask.id)
            if (taskDetails?.task) {
              const finalStatus = taskDetails.task.status || activeTask.status
              const finalProgress = clampPercent(
                taskDetails.task.progress?.progressPercent,
                activeTask.progressPercent
              )
              const finalStep = taskDetails.task.progress?.currentStep || activeTask.currentStep || 'Completed'
              setCompletedTask({
                ...activeTask,
                status: finalStatus,
                progressPercent: finalProgress,
                currentStep: finalStep,
                totalSteps: taskDetails.task.progress?.totalSteps,
                completedSteps: taskDetails.task.progress?.completedSteps,
                summary: taskDetails.task.result?.summary,
                result: taskDetails.task.result,
              })
              setActiveTask(prev => prev ? {
                ...prev,
                status: finalStatus,
                progressPercent: finalProgress,
                currentStep: finalStep,
                totalSteps: taskDetails.task.progress?.totalSteps,
                completedSteps: taskDetails.task.progress?.completedSteps,
              } : prev)
              setHasError(finalStatus === 'error' || finalStatus === 'failed')
            }
          } catch (e) {
            setCompletedTask(activeTask)
            setHasError(activeTask.status === 'error' || activeTask.status === 'failed')
          }
          setIsComplete(true)
          setPolling(false)
        } else {
          setPolling(false)
        }
        return
      }
      
      // Regular AI Agent task polling
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
          totalSteps: task.progress?.totalSteps,
          completedSteps: task.progress?.completedSteps,
          currentStep: task.current_step || task.progress?.currentStep || 'Working...',
          summary: task.summary,
          result: task.result,
          isAmplifier: false
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

  // Check for existing Amplifier task on mount (handles page refresh)
  useEffect(() => {
    let isMounted = true
    
    const checkExistingTask = async () => {
      try {
        const response = await aiApi.getActiveBackgroundTask()
        if (!isMounted) return
        
        if (response.active && response.task) {
          const task = response.task
          const progressPercent = clampPercent(task.progress?.progressPercent, 5)
          
          isAmplifierRef.current = true
          setActiveTask({
            id: task.id,
            goal: task.goal,
            status: task.status,
            progressPercent,
            iterations: task.progress?.iterations || 0,
            totalSteps: task.progress?.totalSteps,
            completedSteps: task.progress?.completedSteps,
            currentStep: task.progress?.currentStep || 'Working...',
            summary: task.result?.summary,
            result: task.result,
            isAmplifier: true
          })
          setIsComplete(false)
          setHasError(task.status === 'error' || task.status === 'failed')
          setIsCancelled(false)
          setIsCancelling(false)
          setPolling(true)
        }
      } catch (error) {
        console.error('Error checking existing background task:', error)
      }
    }
    
    checkExistingTask()
    
    return () => {
      isMounted = false
    }
  }, [])

  // Listen for background task started event
  useEffect(() => {
    const handleTaskStarted = (event: CustomEvent) => {
      const isAmplifier = event.detail.isAmplifier !== false // Default to true for new Amplifier tasks
      
      // Update ref immediately (before state update) to avoid race condition
      isAmplifierRef.current = isAmplifier
      
      setActiveTask({
        id: event.detail.taskId,
        goal: event.detail.goal,
        status: 'running',
        progressPercent: 5,
        iterations: 0,
        currentStep: isAmplifier ? 'Starting Amplifier agent...' : 'Starting...',
        isAmplifier
      })
      setIsComplete(false)
      setHasError(false)
      setIsCancelled(false)
      setIsCancelling(false)
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

  // NOTE: Only auto-check for Amplifier background tasks on mount
  // This keeps the bar scoped to background agent work and avoids normal chat noise

  const handleCancel = async () => {
    if (!activeTask || isCancelling) return
    
    // Immediately stop polling and update UI
    setIsCancelling(true)
    setPolling(false)
    setActiveTask(prev => prev ? { ...prev, status: 'cancelling', currentStep: 'Stopping agent...' } : null)
    
    try {
      // Use appropriate cancel API based on task type
      if (activeTask.isAmplifier) {
        await aiApi.cancelBackgroundTask(activeTask.id)
      } else {
        await aiApi.cancelTask(activeTask.id)
      }
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
    isAmplifierRef.current = false
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
    // Navigate to Background Agent page
    navigate('/app/background-agent')
    // Dismiss the bar
    handleDismiss()
  }

  const handleViewProgress = () => {
    // Navigate to Background Agent page to view progress
    navigate('/app/background-agent')
  }

  // Only render when there's an active/running task (not completed/error/cancelled)
  // Completed tasks should only show on the BackgroundAgentPage, not in the floating bar
  const isRunning = activeTask && 
    activeTask.status !== 'completed' && 
    activeTask.status !== 'error' && 
    activeTask.status !== 'failed' &&
    activeTask.status !== 'cancelled' &&
    !isComplete &&
    !isCancelled

  if (!isRunning) return null

  const isErrorState = hasError || activeTask.status === 'error' || activeTask.status === 'failed'
  const isCancelledState = isCancelled || activeTask.status === 'cancelled' || activeTask.status === 'cancelling'
  const stepLabel = activeTask.totalSteps
    ? `Step ${Math.min(activeTask.completedSteps ?? activeTask.iterations ?? 1, activeTask.totalSteps)} of ${activeTask.totalSteps}`
    : `Step ${activeTask.iterations || 1}`

  return (
    <div className={styles.taskBar}>
      <div className={styles.content}>
        {/* Clickable area - goes to Background Agent page */}
        <div className={styles.clickableArea} onClick={handleViewProgress} title="Click to view progress">
          <div className={styles.icon}>
            {activeTask?.isAmplifier ? (
              <Rocket size={20} className={isThinking ? styles.pulsing : styles.spinning} />
            ) : (
              <Bot size={20} className={isThinking ? styles.pulsing : styles.spinning} />
            )}
          </div>
          
          <div className={styles.info}>
            <div className={styles.header}>
              <div className={styles.title}>
                {isThinking 
                  ? (activeTask?.isAmplifier ? 'Background Agent Thinking...' : 'AI Agent Thinking...') 
                  : (activeTask?.isAmplifier ? 'Background Agent Working' : 'AI Agent Working')
                }
              </div>
              <div className={styles.iterations}>
                {stepLabel}
              </div>
              {/* Activity indicator - shows agent is still alive */}
              <span className={styles.activityDot} title="Agent is active" />
            </div>
            <div className={styles.goal}>{activeTask.goal}</div>
            <div className={styles.step}>
              {isThinking ? `🧠 ${activeTask.currentStep}` : activeTask.currentStep}
            </div>
          </div>

          <div className={styles.progress}>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill} 
                style={{ width: `${activeTask.progressPercent}%` }}
              />
            </div>
            <div className={styles.progressText}>
              {`${activeTask.progressPercent}%`}
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button 
            onClick={handleViewProgress} 
            className={styles.viewProgressBtn}
            title="View progress"
          >
            <MessageSquare size={14} />
            View
          </button>
          <button 
            onClick={handleCancel} 
            className={styles.cancelBtn}
            disabled={isCancelling}
            title="Cancel task"
          >
            <StopCircle size={14} />
          </button>
          <button onClick={handleDismiss} className={styles.dismissBtn} title="Hide">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
