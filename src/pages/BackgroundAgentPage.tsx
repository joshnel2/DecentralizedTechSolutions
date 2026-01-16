import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Rocket, StopCircle, Wrench } from 'lucide-react'
import { aiApi } from '../services/api'
import styles from './BackgroundAgentPage.module.css'

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
