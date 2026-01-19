import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Rocket, StopCircle, Wrench, Terminal, ExternalLink } from 'lucide-react'
import { aiApi } from '../services/api'
import styles from './BackgroundAgentPage.module.css'

interface StreamEvent {
  type: string
  message: string
  timestamp: string
  icon?: string
  color?: string
}

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
  status: string
  progress?: BackgroundTaskProgress
  result?: { summary?: string }
  error?: string
}

interface AgentStatus {
  available: boolean
  configured: boolean
  message?: string
}

interface BackgroundToolsResponse {
  tools?: Array<{ name: string; description?: string }>
  categories?: Array<{ name: string; tools: string[] }>
}

interface BackgroundSummary {
  goal: string
  summary?: string
  status?: string
}

const clampPercent = (value: number | undefined | null, fallback = 0) => {
  const resolved = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(100, Math.max(0, resolved))
}

const backgroundApi = aiApi as any

export function BackgroundAgentPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [activeTask, setActiveTask] = useState<BackgroundTask | null>(null)
  const [recentTasks, setRecentTasks] = useState<BackgroundTask[]>([])
  const [tools, setTools] = useState<BackgroundToolsResponse | null>(null)
  const [summary, setSummary] = useState<BackgroundSummary | null>(null)
  const [goalInput, setGoalInput] = useState('')
  const [startError, setStartError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  
  // Real-time streaming state
  const [liveEvents, setLiveEvents] = useState<StreamEvent[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const liveEventsRef = useRef<HTMLDivElement>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await backgroundApi.getBackgroundAgentStatus()
      setStatus(response)
    } catch (error) {
      setStatus({ available: false, configured: false, message: 'Background agent status unavailable' })
    }
  }, [])

  const fetchTools = useCallback(async () => {
    try {
      const response = await backgroundApi.getBackgroundAgentTools()
      setTools(response)
    } catch (error) {
      setTools(null)
    }
  }, [])

  const fetchActiveTask = useCallback(async () => {
    try {
      const response = await backgroundApi.getActiveBackgroundTask()
      if (response.active && response.task) {
        setActiveTask(response.task)
      } else {
        setActiveTask(null)
      }
    } catch (error) {
      setActiveTask(null)
    }
  }, [])

  const fetchRecentTasks = useCallback(async () => {
    try {
      const response = await backgroundApi.getBackgroundTasks(8)
      setRecentTasks(response.tasks || [])
    } catch (error) {
      setRecentTasks([])
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchStatus(), fetchTools(), fetchActiveTask(), fetchRecentTasks()])
    setLoading(false)
  }, [fetchStatus, fetchTools, fetchActiveTask, fetchRecentTasks])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(() => {
      fetchActiveTask()
      fetchRecentTasks()
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, fetchActiveTask, fetchRecentTasks])

  // Connect to SSE stream when there's an active task
  useEffect(() => {
    if (!activeTask?.id) {
      // No active task, disconnect
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setIsStreaming(false)
      }
      return
    }
    
    // Connect to SSE stream
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
    const token = localStorage.getItem('apex-access-token') || localStorage.getItem('token') || ''
    const url = `${apiUrl}/v1/agent-stream/${activeTask.id}?token=${token}`
    
    console.log('[BackgroundAgent] Connecting to SSE:', url)
    
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource
    
    eventSource.onopen = () => {
      console.log('[BackgroundAgent] SSE connected')
      setIsStreaming(true)
    }
    
    eventSource.onerror = (e) => {
      console.log('[BackgroundAgent] SSE error', e)
      setIsStreaming(false)
    }
    
    // Handle initial connection message
    eventSource.addEventListener('connected', (e) => {
      console.log('[BackgroundAgent] SSE connected event:', e.data)
      setIsStreaming(true)
    })
    
    // Handle history (events that happened before we connected)
    eventSource.addEventListener('history', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.events && Array.isArray(data.events)) {
          setLiveEvents(prev => [...data.events, ...prev].slice(-50))
        }
      } catch (err) {
        console.error('Failed to parse history:', err)
      }
    })
    
    eventSource.addEventListener('event', (e) => {
      try {
        const event = JSON.parse(e.data) as StreamEvent
        setLiveEvents(prev => [...prev.slice(-50), event]) // Keep last 50 events
      } catch (err) {
        console.error('Failed to parse event:', err)
      }
    })
    
    eventSource.addEventListener('progress', (e) => {
      try {
        const progress = JSON.parse(e.data)
        // Update active task progress in real-time
        setActiveTask(prev => prev ? {
          ...prev,
          progress: {
            progressPercent: progress.progress_percent,
            currentStep: progress.current_step,
            iterations: progress.actions_count,
            totalSteps: progress.total_steps,
            completedSteps: progress.completed_steps
          }
        } : null)
      } catch (err) {
        console.error('Failed to parse progress:', err)
      }
    })
    
    // Handle heartbeat to keep connection alive
    eventSource.addEventListener('heartbeat', () => {
      // Connection is alive
    })
    
    return () => {
      eventSource.close()
      eventSourceRef.current = null
      setIsStreaming(false)
    }
  }, [activeTask?.id])

  // Auto-scroll live events
  useEffect(() => {
    if (liveEventsRef.current) {
      liveEventsRef.current.scrollTop = liveEventsRef.current.scrollHeight
    }
  }, [liveEvents])

  // Clear live events when task changes
  useEffect(() => {
    setLiveEvents([])
  }, [activeTask?.id])

  useEffect(() => {
    const stored = sessionStorage.getItem('backgroundTaskSummary')
    if (stored) {
      try {
        setSummary(JSON.parse(stored))
      } catch {
        setSummary(null)
      }
    }
  }, [location.state])

  const clearSummary = () => {
    sessionStorage.removeItem('backgroundTaskSummary')
    setSummary(null)
  }

  const handleStartTask = async () => {
    const goal = goalInput.trim()
    if (!goal || isStarting) return
    setIsStarting(true)
    setStartError(null)
    try {
      const response = await backgroundApi.startBackgroundTask(goal)
      const task = response?.task
      if (task?.id) {
        window.dispatchEvent(new CustomEvent('backgroundTaskStarted', {
          detail: {
            taskId: task.id,
            goal: task.goal || goal,
            isAmplifier: true
          }
        }))
      }
      setGoalInput('')
      await fetchActiveTask()
      await fetchRecentTasks()
    } catch (error: any) {
      setStartError(error?.message || 'Failed to start background task')
    } finally {
      setIsStarting(false)
    }
  }

  const handleCancel = async () => {
    if (!activeTask || isCancelling) return
    setIsCancelling(true)
    try {
      await backgroundApi.cancelBackgroundTask(activeTask.id)
      await fetchActiveTask()
      await fetchRecentTasks()
    } finally {
      setIsCancelling(false)
    }
  }

  const taskStatus = useMemo(() => {
    if (!activeTask) return null
    const statusValue = activeTask.status
    if (statusValue === 'error' || statusValue === 'failed') return 'error'
    if (statusValue === 'cancelled') return 'cancelled'
    if (statusValue === 'completed') return 'complete'
    return 'running'
  }, [activeTask])

  const progressPercent = clampPercent(activeTask?.progress?.progressPercent, activeTask ? 5 : 0)
  const stepLabel = activeTask?.progress?.totalSteps
    ? `Step ${Math.min(activeTask.progress?.completedSteps ?? activeTask.progress?.iterations ?? 1, activeTask.progress?.totalSteps)} of ${activeTask.progress?.totalSteps}`
    : activeTask?.progress?.iterations
      ? `Step ${activeTask.progress.iterations}`
      : 'Step 1'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>
          <Rocket size={20} />
          <div>
            <h1>Background Agent</h1>
            <p>Autonomous legal workflows powered by Amplifier</p>
          </div>
        </div>
        <button className={styles.refreshBtn} onClick={refreshAll} disabled={loading}>
          {loading ? <Loader2 size={16} className={styles.spin} /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      {status && !status.configured && (
        <div className={styles.alert}>
          <AlertCircle size={16} />
          <span>{status.message || 'Background agent is not configured.'}</span>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>Start Background Task</h2>
        </div>
        <div className={styles.taskForm}>
          <textarea
            className={styles.taskInput}
            placeholder="Describe the legal task you want handled..."
            value={goalInput}
            onChange={event => setGoalInput(event.target.value)}
            rows={3}
          />
          <div className={styles.taskActions}>
            <button
              className={styles.startBtn}
              onClick={handleStartTask}
              disabled={!goalInput.trim() || isStarting || !status?.available}
            >
              {isStarting ? <Loader2 size={16} className={styles.spin} /> : <Rocket size={16} />}
              Start Task
            </button>
            {!status?.available && (
              <span className={styles.taskHint}>Background agent is not available.</span>
            )}
          </div>
          {startError && (
            <div className={styles.taskError}>{startError}</div>
          )}
        </div>
      </div>

      {summary && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Latest Summary</h2>
            <button className={styles.textBtn} onClick={clearSummary}>Dismiss</button>
          </div>
          <div className={styles.summaryBlock}>
            <div className={styles.summaryGoal}>{summary.goal}</div>
            <div className={styles.summaryText}>{summary.summary || 'Summary unavailable.'}</div>
          </div>
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Active Task</h2>
          </div>
          {!activeTask && (
            <div className={styles.emptyState}>No active background task.</div>
          )}
          {activeTask && (
            <div className={styles.task}>
              <div className={styles.taskHeader}>
                {taskStatus === 'complete' && <CheckCircle size={18} className={styles.complete} />}
                {taskStatus === 'error' && <AlertCircle size={18} className={styles.error} />}
                {taskStatus === 'cancelled' && <StopCircle size={18} className={styles.cancelled} />}
                {taskStatus === 'running' && <Rocket size={18} className={styles.running} />}
                <div>
                  <div className={styles.taskGoal}>{activeTask.goal}</div>
                  <div className={styles.taskStep}>{activeTask.progress?.currentStep || 'Working...'}</div>
                </div>
              </div>
              <div className={styles.progressRow}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
                </div>
                <div className={styles.progressMeta}>
                  <span>{progressPercent}%</span>
                  <span>{stepLabel}</span>
                </div>
              </div>
              
              {/* Live Activity Feed - Shows what the agent is doing in real-time */}
              {taskStatus === 'running' && (
                <div className={styles.liveActivitySection}>
                  <div className={styles.liveActivityHeader}>
                    <Terminal size={14} />
                    <span>Live Activity</span>
                    {isStreaming && <span className={styles.streamingIndicator}>● Live</span>}
                  </div>
                  <div className={styles.liveActivityFeed} ref={liveEventsRef}>
                    {liveEvents.length === 0 && (
                      <div className={styles.liveEventItem}>
                        <span className={styles.liveEventTime}>--:--:--</span>
                        <span className={styles.liveEventMessage}>Waiting for agent activity...</span>
                      </div>
                    )}
                    {liveEvents.map((event, idx) => (
                      <div key={idx} className={styles.liveEventItem}>
                        <span className={styles.liveEventTime}>
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={styles.liveEventMessage}>{event.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {activeTask.result?.summary && (
                <div className={styles.taskSummary}>{activeTask.result.summary}</div>
              )}
              {activeTask.error && (
                <div className={styles.taskError}>{activeTask.error}</div>
              )}
              {taskStatus === 'running' && (
                <button className={styles.cancelBtn} onClick={handleCancel} disabled={isCancelling}>
                  {isCancelling ? <Loader2 size={14} className={styles.spin} /> : <StopCircle size={14} />}
                  Cancel Task
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Recent Tasks</h2>
          </div>
          {recentTasks.length === 0 && (
            <div className={styles.emptyState}>No recent background tasks yet.</div>
          )}
          {recentTasks.length > 0 && (
            <div className={styles.taskList}>
              {recentTasks.map(task => (
                <div key={task.id} className={styles.taskRow}>
                  <div>
                    <div className={styles.taskGoalSmall}>{task.goal}</div>
                    <div className={styles.taskMeta}>{task.status}</div>
                  </div>
                  <div className={styles.taskMeta}>
                    {clampPercent(task.progress?.progressPercent, 0)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>Available Tools</h2>
        </div>
        {!tools && (
          <div className={styles.emptyState}>Tool list unavailable.</div>
        )}
        {tools?.categories && (
          <div className={styles.toolGrid}>
            {tools.categories.map(category => (
              <div key={category.name} className={styles.toolCategory}>
                <div className={styles.toolHeader}>
                  <Wrench size={14} />
                  <span>{category.name}</span>
                </div>
                <ul>
                  {category.tools.map(toolName => (
                    <li key={toolName}>{toolName}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
