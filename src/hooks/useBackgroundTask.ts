import { useState, useCallback, useRef, useEffect } from 'react'
import { aiApi } from '../services/api'

interface BackgroundTaskProgress {
  progressPercent?: number
  currentStep?: string
  iterations?: number
  totalSteps?: number
  completedSteps?: number
}

interface BackgroundTask {
  id: string
  goal: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress?: BackgroundTaskProgress
  result?: { summary?: string }
  error?: string
  createdAt?: string
  completedAt?: string
}

interface UseBackgroundTaskOptions {
  maxRetries?: number
  retryDelayMs?: number
  onTaskStart?: (task: BackgroundTask) => void
  onTaskComplete?: (task: BackgroundTask) => void
  onTaskError?: (task: BackgroundTask, error: Error) => void
  onProgress?: (progress: BackgroundTaskProgress) => void
}

interface UseBackgroundTaskReturn {
  // State
  activeTask: BackgroundTask | null
  isStarting: boolean
  error: string | null
  isStalled: boolean
  
  // Actions
  startTask: (goal: string, options?: { extended?: boolean }) => Promise<BackgroundTask | null>
  cancelTask: () => Promise<void>
  retryTask: () => Promise<BackgroundTask | null>
  clearError: () => void
  sendFollowUp: (message: string) => Promise<void>
  
  // Info
  canRetry: boolean
  retryCount: number
}

/**
 * Hook for managing background agent tasks with automatic retry
 * Designed for reliability in production law firm environments
 */
export function useBackgroundTask(options: UseBackgroundTaskOptions = {}): UseBackgroundTaskReturn {
  const {
    maxRetries = 3,
    retryDelayMs = 2000,
    onTaskStart,
    onTaskComplete: _onTaskComplete,
    onTaskError: _onTaskError,
    onProgress: _onProgress
  } = options
  
  const [activeTask, setActiveTask] = useState<BackgroundTask | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [isStalled, setIsStalled] = useState(false)
  
  const lastGoalRef = useRef<string>('')
  const lastOptionsRef = useRef<{ extended?: boolean }>({})
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastProgressRef = useRef<{ step: string; percent: number; checkedAt: number }>({ step: '', percent: 0, checkedAt: Date.now() })
  
  // Start a background task
  const startTask = useCallback(async (
    goal: string,
    taskOptions?: { extended?: boolean }
  ): Promise<BackgroundTask | null> => {
    if (isStarting) return null
    
    // Validate input
    if (!goal.trim()) {
      setError('Please provide a task description')
      return null
    }
    
    if (goal.trim().length < 10) {
      setError('Please provide a more detailed description (at least 10 characters)')
      return null
    }
    
    // Store for retry
    lastGoalRef.current = goal
    lastOptionsRef.current = taskOptions || {}
    
    setIsStarting(true)
    setError(null)
    
    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController()
    
    try {
      const response = await (aiApi as any).startBackgroundTask(goal, taskOptions)
      
      if (response?.task) {
        const task: BackgroundTask = {
          id: response.task.id,
          goal: response.task.goal || goal,
          status: 'running',
          progress: response.task.progress,
          createdAt: new Date().toISOString()
        }
        
        setActiveTask(task)
        setRetryCount(0)
        onTaskStart?.(task)
        
        // Dispatch event for BackgroundTaskBar
        window.dispatchEvent(new CustomEvent('backgroundTaskStarted', {
          detail: {
            taskId: task.id,
            goal: task.goal,
            isAmplifier: true,
            extended: taskOptions?.extended
          }
        }))
        
        return task
      }
      
      throw new Error('Invalid response from server')
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || 
                          err?.response?.data?.details || 
                          err?.message || 
                          'Failed to start background task'
      
      setError(errorMessage)
      
      // Check if retryable
      const isRetryable = err?.response?.data?.retryable !== false
      
      if (isRetryable && retryCount < maxRetries) {
        setRetryCount(prev => prev + 1)
        
        // Auto-retry after delay
        setTimeout(() => {
          if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
            startTask(goal, taskOptions)
          }
        }, retryDelayMs * (retryCount + 1))
      }
      
      return null
    } finally {
      setIsStarting(false)
    }
  }, [isStarting, maxRetries, retryDelayMs, retryCount, onTaskStart])
  
  // Cancel the current task
  const cancelTask = useCallback(async () => {
    if (!activeTask?.id) return
    
    // Abort any pending operations
    abortControllerRef.current?.abort()
    
    try {
      await (aiApi as any).cancelBackgroundTask(activeTask.id)
      setActiveTask(prev => prev ? { ...prev, status: 'cancelled' } : null)
    } catch (err: any) {
      console.error('Failed to cancel task:', err)
      setError('Failed to cancel task')
    }
  }, [activeTask?.id])
  
  // Send a follow-up instruction to the running task
  const sendFollowUp = useCallback(async (message: string) => {
    if (!activeTask?.id) {
      setError('No active task to send follow-up to')
      return
    }
    
    if (!message.trim()) {
      setError('Follow-up message cannot be empty')
      return
    }
    
    try {
      await (aiApi as any).sendBackgroundTaskFollowUp(activeTask.id, message.trim())
    } catch (err: any) {
      console.error('Failed to send follow-up:', err)
      setError(err?.response?.data?.error || 'Failed to send follow-up instruction')
    }
  }, [activeTask?.id])
  
  // Retry the last failed task
  const retryTask = useCallback(async () => {
    if (!lastGoalRef.current) {
      setError('No task to retry')
      return null
    }
    
    setRetryCount(0)
    return startTask(lastGoalRef.current, lastOptionsRef.current)
  }, [startTask])
  
  // Monitor for progress stalls when there's an active task
  useEffect(() => {
    if (!activeTask || activeTask.status !== 'running') {
      setIsStalled(false)
      return
    }
    
    const checkStall = () => {
      const current = activeTask.progress
      const currentStep = current?.currentStep || ''
      const currentPercent = current?.progressPercent || 0
      
      if (lastProgressRef.current.step === currentStep && lastProgressRef.current.percent === currentPercent) {
        // No change since last check
        const stallDuration = Date.now() - lastProgressRef.current.checkedAt
        if (stallDuration > 120000) { // 2 minutes
          setIsStalled(true)
        }
      } else {
        // Progress changed
        lastProgressRef.current = { step: currentStep, percent: currentPercent, checkedAt: Date.now() }
        setIsStalled(false)
      }
    }
    
    const interval = setInterval(checkStall, 10000) // Check every 10 seconds
    return () => clearInterval(interval)
  }, [activeTask])
  
  // Clear error
  const clearError = useCallback(() => {
    setError(null)
  }, [])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])
  
  return {
    activeTask,
    isStarting,
    error,
    isStalled,
    startTask,
    cancelTask,
    retryTask,
    clearError,
    sendFollowUp,
    canRetry: retryCount < maxRetries && !!lastGoalRef.current,
    retryCount
  }
}

/**
 * Hook for tracking task queue (for firms with heavy agent usage)
 */
export function useTaskQueue() {
  const [queue, setQueue] = useState<BackgroundTask[]>([])
  const [_isProcessing, _setIsProcessing] = useState(false)
  
  const addToQueue = useCallback((goal: string, _options?: { extended?: boolean; priority?: 'low' | 'normal' | 'high' }) => {
    const queueItem: BackgroundTask = {
      id: `queue-${Date.now()}`,
      goal,
      status: 'pending',
      createdAt: new Date().toISOString()
    }
    
    setQueue(prev => {
      // Sort by priority if specified
      const newQueue = [...prev, queueItem]
      return newQueue
    })
    
    return queueItem.id
  }, [])
  
  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id))
  }, [])
  
  const clearQueue = useCallback(() => {
    setQueue([])
  }, [])
  
  return {
    queue,
    isProcessing: _isProcessing,
    queueLength: queue.length,
    addToQueue,
    removeFromQueue,
    clearQueue
  }
}
