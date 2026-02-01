import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Rocket, StopCircle, Wrench, Terminal, ExternalLink, Send, MessageCircle, Star, X, ThumbsUp, Clock, Search, Filter, ChevronDown, ChevronUp, Zap, FileText, Users, Calendar, DollarSign, Briefcase, Scale, LayoutTemplate } from 'lucide-react'
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
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const liveEventsRef = useRef<HTMLDivElement>(null)
  const maxReconnectAttempts = 5
  
  // Follow-up state
  const [followUpInput, setFollowUpInput] = useState('')
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  
  // Extended mode for long-running tasks
  const [extendedMode, setExtendedMode] = useState(false)
  
  // Highlighted task (from navigation)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)
  const activeTaskRef = useRef<HTMLDivElement>(null)
  
  // Task templates - pre-built complex workflows
  const taskTemplates = [
    {
      id: 'new-matter-intake',
      name: 'New Matter Intake',
      description: 'Set up a new matter with all required tasks, deadlines, and initial documents',
      icon: Briefcase,
      estimatedTime: '~5 min',
      complexity: 'medium',
      prompt: 'Create a complete new matter intake workflow: set up initial tasks checklist, identify key deadlines including statute of limitations, create client communication templates, and generate a matter summary memo.',
      tags: ['matters', 'intake', 'tasks']
    },
    {
      id: 'monthly-billing-review',
      name: 'Monthly Billing Review',
      description: 'Analyze time entries, prepare invoices, and identify billing issues',
      icon: DollarSign,
      estimatedTime: '~8 min',
      complexity: 'high',
      prompt: 'Perform a comprehensive monthly billing review: analyze all unbilled time entries from the past month, identify entries that need descriptions improved, flag any time that might be written off, and prepare a summary of billing ready for invoicing.',
      tags: ['billing', 'invoices', 'time']
    },
    {
      id: 'document-review',
      name: 'Document Analysis',
      description: 'Review and summarize all documents for a matter',
      icon: FileText,
      estimatedTime: '~3 min',
      complexity: 'low',
      prompt: 'Review and analyze all documents in the current matter. Create a summary of each document, identify key terms and dates, flag any potential issues or missing documents, and generate a matter document index.',
      tags: ['documents', 'analysis', 'review']
    },
    {
      id: 'deadline-audit',
      name: 'Deadline Audit',
      description: 'Check all matters for upcoming deadlines and compliance',
      icon: Calendar,
      estimatedTime: '~4 min',
      complexity: 'medium',
      prompt: 'Audit all active matters for upcoming deadlines in the next 30 days. Identify any matters missing critical deadlines, check statute of limitations dates, and create a prioritized deadline report with recommended actions.',
      tags: ['calendar', 'deadlines', 'compliance']
    },
    {
      id: 'client-communication',
      name: 'Client Update Prep',
      description: 'Prepare client status updates and communication drafts',
      icon: Users,
      estimatedTime: '~3 min',
      complexity: 'low',
      prompt: 'Prepare client communication materials: summarize recent activity on all active matters, draft status update emails, identify matters that need client contact, and create a client call preparation sheet.',
      tags: ['clients', 'communication', 'emails']
    },
    {
      id: 'case-assessment',
      name: 'Case Assessment',
      description: 'Generate comprehensive case evaluation and strategy memo',
      icon: Scale,
      estimatedTime: '~6 min',
      complexity: 'high',
      prompt: 'Prepare a comprehensive case assessment: analyze the facts and evidence, identify legal issues and applicable law, assess strengths and weaknesses, evaluate potential outcomes, and recommend litigation or settlement strategy.',
      tags: ['litigation', 'strategy', 'analysis']
    }
  ]
  
  // Simple task suggestions for quick input
  const taskSuggestions = [
    'Review and summarize all documents for [matter name]',
    'Prepare case assessment memo for new personal injury matter',
    'Create intake checklist and initial tasks for new client',
    'Analyze contract and identify key terms and risks',
    'Research statute of limitations for [claim type] in NY'
  ]
  
  // State for showing templates panel
  const [showTemplates, setShowTemplates] = useState(false)
  
  // History search state
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all')
  
  // Estimated time calculation based on task complexity
  const estimateTaskTime = (goal: string): string => {
    const wordCount = goal.split(' ').length
    const hasDocuments = /document|review|analyze|summarize/i.test(goal)
    const hasBilling = /bill|invoice|time entr/i.test(goal)
    const hasResearch = /research|statute|case law|precedent/i.test(goal)
    const hasMultiple = /all|every|each|matters|clients/i.test(goal)
    
    let minutes = 2 // Base time
    
    if (wordCount > 30) minutes += 2
    if (hasDocuments) minutes += 2
    if (hasBilling) minutes += 3
    if (hasResearch) minutes += 4
    if (hasMultiple) minutes += 3
    if (extendedMode) minutes = Math.max(minutes * 2, 10)
    
    if (minutes <= 3) return '~2-3 min'
    if (minutes <= 5) return '~3-5 min'
    if (minutes <= 8) return '~5-8 min'
    return '~8-15 min'
  }
  
  // Filter recent tasks based on search and status
  const filteredRecentTasks = useMemo(() => {
    return recentTasks.filter(task => {
      const matchesSearch = !historySearch || 
        task.goal.toLowerCase().includes(historySearch.toLowerCase())
      const matchesStatus = historyStatusFilter === 'all' || 
        task.status === historyStatusFilter
      return matchesSearch && matchesStatus
    })
  }, [recentTasks, historySearch, historyStatusFilter])
  
  // Feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackTaskId, setFeedbackTaskId] = useState<string | null>(null)
  const [feedbackRating, setFeedbackRating] = useState<number>(0)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackCorrection, setFeedbackCorrection] = useState('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<string>>(new Set())

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

  // Track last completed task to show until user starts a new one
  const [lastCompletedTask, setLastCompletedTask] = useState<BackgroundTask | null>(null)
  
  // Use ref to track previous task ID to avoid infinite loop
  const prevTaskIdRef = useRef<string | null>(null)

  const fetchActiveTask = useCallback(async () => {
    try {
      const response = await backgroundApi.getActiveBackgroundTask()
      if (response.active && response.task) {
        setActiveTask(response.task)
        prevTaskIdRef.current = response.task.id
        // Clear last completed when a new task starts
        if (response.task.status === 'running') {
          setLastCompletedTask(null)
        }
      } else {
        // No active task - check if previous task just completed
        const prevId = prevTaskIdRef.current
        if (prevId) {
          // Task just finished - fetch its final state and save as completed
          try {
            const taskDetails = await backgroundApi.getBackgroundTask(prevId)
            if (taskDetails?.task) {
              setLastCompletedTask(taskDetails.task)
            }
          } catch {
            // Ignore errors fetching completed task
          }
          prevTaskIdRef.current = null
        }
        setActiveTask(null)
      }
    } catch (error) {
      setActiveTask(null)
    }
  }, []) // No dependencies - uses ref instead to avoid infinite loop

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

  // Only run once on mount - not when refreshAll changes
  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle navigation state (when coming from BackgroundTaskBar)
  useEffect(() => {
    const navState = location.state as { 
      highlightTaskId?: string
      fromTaskBar?: boolean
      showSummary?: boolean 
    } | null
    
    if (navState?.highlightTaskId) {
      setHighlightedTaskId(navState.highlightTaskId)
      
      // Clear the highlight after 3 seconds
      const timer = setTimeout(() => {
        setHighlightedTaskId(null)
      }, 3000)
      
      // Scroll to active task section after a brief delay
      if (navState.fromTaskBar) {
        setTimeout(() => {
          activeTaskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
      
      // Clear navigation state to prevent re-triggering on refresh
      window.history.replaceState({}, document.title)
      
      return () => clearTimeout(timer)
    }
  }, [location.state])

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(() => {
      fetchActiveTask()
      fetchRecentTasks()
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, fetchActiveTask, fetchRecentTasks])

  // Connect to SSE stream when there's an active task with retry logic
  useEffect(() => {
    if (!activeTask?.id) {
      // No active task, disconnect
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setIsStreaming(false)
        setConnectionStatus('disconnected')
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      setReconnectAttempt(0)
      return
    }
    
    const connectToSSE = (attempt = 0) => {
      // Connect to SSE stream
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const token = localStorage.getItem('apex-access-token') || localStorage.getItem('token') || ''
      const reconnectId = attempt > 0 ? `${Date.now()}` : ''
      const url = `${apiUrl}/v1/agent-stream/${activeTask.id}?token=${token}${reconnectId ? `&reconnectId=${reconnectId}` : ''}`
      
      console.log(`[BackgroundAgent] Connecting to SSE (attempt ${attempt + 1}):`, url)
      setConnectionStatus('connecting')
      
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource
      
      eventSource.onopen = () => {
        console.log('[BackgroundAgent] SSE connected')
        setIsStreaming(true)
        setConnectionStatus('connected')
        setReconnectAttempt(0) // Reset on successful connection
      }
      
      eventSource.onerror = (e) => {
        console.log('[BackgroundAgent] SSE error', e)
        setIsStreaming(false)
        
        // Only try to reconnect if we still have an active task
        if (activeTask?.id && attempt < maxReconnectAttempts) {
          setConnectionStatus('error')
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000) // Max 30s backoff
          console.log(`[BackgroundAgent] Reconnecting in ${backoffMs}ms (attempt ${attempt + 1}/${maxReconnectAttempts})`)
          
          setReconnectAttempt(attempt + 1)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (eventSourceRef.current) {
              eventSourceRef.current.close()
            }
            connectToSSE(attempt + 1)
          }, backoffMs)
        } else {
          setConnectionStatus('disconnected')
        }
      }
      
      // Handle initial connection message
      eventSource.addEventListener('connected', (e) => {
        console.log('[BackgroundAgent] SSE connected event:', e.data)
        setIsStreaming(true)
        setConnectionStatus('connected')
        setReconnectAttempt(0)
      })
      
      // Handle history (events that happened before we connected)
      eventSource.addEventListener('history', (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.events && Array.isArray(data.events)) {
            // For reconnection, merge intelligently
            if (data.isReconnection) {
              setLiveEvents(prev => {
                const existingTimestamps = new Set(prev.map(ev => ev.timestamp))
                const newEvents = data.events.filter((ev: StreamEvent) => !existingTimestamps.has(ev.timestamp))
                return [...prev, ...newEvents].slice(-100)
              })
            } else {
              setLiveEvents(prev => [...data.events, ...prev].slice(-50))
            }
          }
        } catch (err) {
          console.error('Failed to parse history:', err)
        }
      })
      
      eventSource.addEventListener('event', (e) => {
        try {
          const event = JSON.parse(e.data) as StreamEvent
          setLiveEvents(prev => [...prev.slice(-100), event]) // Keep last 100 events
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
            status: progress.status || prev.status,
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
      
      // Handle task completion event for smooth transition
      eventSource.addEventListener('task_complete', (e) => {
        try {
          const data = JSON.parse(e.data)
          console.log('[BackgroundAgent] Task completed:', data)
          // Update to completed state
          setActiveTask(prev => prev ? {
            ...prev,
            status: 'completed',
            progress: {
              ...prev.progress,
              progressPercent: 100,
              currentStep: data.message || 'Completed successfully'
            },
            result: { summary: data.summary || data.message }
          } : null)
          // Store as last completed task
          setLastCompletedTask(prev => activeTask ? {
            ...activeTask,
            status: 'completed',
            progress: { ...activeTask.progress, progressPercent: 100 },
            result: { summary: data.summary || data.message }
          } : prev)
        } catch (err) {
          console.error('Failed to parse task_complete:', err)
        }
      })
      
      // Handle heartbeat to keep connection alive - reset any error state
      eventSource.addEventListener('heartbeat', () => {
        setConnectionStatus('connected')
        setReconnectAttempt(0)
      })
    }
    
    // Initial connection
    connectToSSE(0)
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      setIsStreaming(false)
      setConnectionStatus('disconnected')
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
    
    // Client-side validation
    if (goal.length < 10) {
      setStartError('Please provide a more detailed description (at least 10 characters)')
      return
    }
    
    setIsStarting(true)
    setStartError(null)
    setLiveEvents([]) // Clear previous events
    
    try {
      const response = await backgroundApi.startBackgroundTask(goal, { extended: extendedMode })
      const task = response?.task
      if (task?.id) {
        window.dispatchEvent(new CustomEvent('backgroundTaskStarted', {
          detail: {
            taskId: task.id,
            goal: task.goal || goal,
            isAmplifier: true,
            extended: extendedMode
          }
        }))
        
        // Add initial event to show task is starting
        setLiveEvents([{
          type: 'task_starting',
          message: '🚀 Initializing autonomous agent...',
          timestamp: new Date().toISOString(),
          color: 'green'
        }])
      }
      setGoalInput('')
      setExtendedMode(false) // Reset after starting
      setLastCompletedTask(null) // Clear any previous completed task
      await fetchActiveTask()
      await fetchRecentTasks()
    } catch (error: any) {
      // Handle specific error types
      const errorData = error?.response?.data || error
      const errorMessage = errorData?.details || errorData?.error || error?.message || 'Failed to start background task'
      const isRetryable = errorData?.retryable
      
      setStartError(isRetryable 
        ? `${errorMessage} Please try again.`
        : errorMessage
      )
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

  const handleSendFollowUp = async () => {
    const message = followUpInput.trim()
    if (!message || !activeTask || isSendingFollowUp) return
    
    setIsSendingFollowUp(true)
    setFollowUpError(null)
    
    try {
      await backgroundApi.sendBackgroundTaskFollowUp(activeTask.id, message)
      setFollowUpInput('')
      // Add to live events immediately for feedback
      setLiveEvents(prev => [...prev, {
        type: 'followup_sent',
        message: `📨 Follow-up sent: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`,
        timestamp: new Date().toISOString(),
        color: 'purple'
      }])
    } catch (error: any) {
      setFollowUpError(error?.message || 'Failed to send follow-up')
    } finally {
      setIsSendingFollowUp(false)
    }
  }

  const openFeedbackModal = (taskId: string) => {
    setFeedbackTaskId(taskId)
    setFeedbackRating(0)
    setFeedbackText('')
    setFeedbackCorrection('')
    setShowFeedbackModal(true)
  }

  const closeFeedbackModal = () => {
    setShowFeedbackModal(false)
    setFeedbackTaskId(null)
    setFeedbackRating(0)
    setFeedbackText('')
    setFeedbackCorrection('')
  }

  const handleSubmitFeedback = async () => {
    if (!feedbackTaskId || isSubmittingFeedback) return
    if (feedbackRating === 0 && !feedbackText.trim() && !feedbackCorrection.trim()) return
    
    setIsSubmittingFeedback(true)
    
    try {
      await backgroundApi.submitBackgroundTaskFeedback(feedbackTaskId, {
        rating: feedbackRating > 0 ? feedbackRating : undefined,
        feedback: feedbackText.trim() || undefined,
        correction: feedbackCorrection.trim() || undefined,
      })
      
      // Mark as submitted
      setFeedbackSubmitted(prev => new Set([...prev, feedbackTaskId]))
      closeFeedbackModal()
    } catch (error: any) {
      console.error('Failed to submit feedback:', error)
    } finally {
      setIsSubmittingFeedback(false)
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
          <button 
            className={styles.templatesToggle}
            onClick={() => setShowTemplates(!showTemplates)}
          >
            <LayoutTemplate size={16} />
            Templates
            {showTemplates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        
        {/* Task Templates Panel */}
        {showTemplates && (
          <div className={styles.templatesPanel}>
            <div className={styles.templatesPanelHeader}>
              <h3>Pre-Built Workflows</h3>
              <p>Select a template to start a complex task with optimized instructions</p>
            </div>
            <div className={styles.templatesGrid}>
              {taskTemplates.map(template => {
                const IconComponent = template.icon
                return (
                  <button
                    key={template.id}
                    className={styles.templateCard}
                    onClick={() => {
                      setGoalInput(template.prompt)
                      setShowTemplates(false)
                    }}
                  >
                    <div className={styles.templateIcon}>
                      <IconComponent size={20} />
                    </div>
                    <div className={styles.templateContent}>
                      <div className={styles.templateName}>{template.name}</div>
                      <div className={styles.templateDesc}>{template.description}</div>
                      <div className={styles.templateMeta}>
                        <span className={styles.templateTime}>
                          <Clock size={12} />
                          {template.estimatedTime}
                        </span>
                        <span className={`${styles.templateComplexity} ${styles[template.complexity]}`}>
                          {template.complexity}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        
        <div className={styles.taskForm}>
          <textarea
            className={styles.taskInput}
            placeholder="Describe the legal task you want handled..."
            value={goalInput}
            onChange={event => setGoalInput(event.target.value)}
            rows={3}
          />
          {!goalInput && (
            <div className={styles.suggestions}>
              <span className={styles.suggestionsLabel}>Quick suggestions:</span>
              <div className={styles.suggestionChips}>
                {taskSuggestions.slice(0, 3).map((suggestion, idx) => (
                  <button
                    key={idx}
                    className={styles.suggestionChip}
                    onClick={() => setGoalInput(suggestion)}
                  >
                    {suggestion.length > 50 ? suggestion.substring(0, 47) + '...' : suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Estimated Time Display */}
          {goalInput.trim() && (
            <div className={styles.estimatedTime}>
              <Clock size={14} />
              <span>Estimated completion: <strong>{estimateTaskTime(goalInput)}</strong></span>
            </div>
          )}
          
          <div className={styles.taskOptions}>
            <label className={styles.extendedMode}>
              <input
                type="checkbox"
                checked={extendedMode}
                onChange={(e) => setExtendedMode(e.target.checked)}
              />
              <span>Extended mode</span>
              <span className={styles.extendedHint}>(up to 8 hours for complex projects)</span>
            </label>
          </div>
          <div className={styles.taskActions}>
            <button
              className={styles.startBtn}
              onClick={handleStartTask}
              disabled={!goalInput.trim() || isStarting || !status?.available}
            >
              {isStarting ? <Loader2 size={16} className={styles.spin} /> : <Rocket size={16} />}
              {extendedMode ? 'Start Extended Task' : 'Start Task'}
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
        <div 
          ref={activeTaskRef}
          className={`${styles.card} ${highlightedTaskId && (activeTask?.id === highlightedTaskId || lastCompletedTask?.id === highlightedTaskId) ? styles.highlighted : ''}`}
        >
          <div className={styles.cardHeader}>
            <h2>{activeTask ? 'Active Task' : lastCompletedTask ? 'Last Completed Task' : 'Active Task'}</h2>
            {lastCompletedTask && !activeTask && (
              <button 
                className={styles.textBtn} 
                onClick={() => setLastCompletedTask(null)}
              >
                Clear
              </button>
            )}
          </div>
          {!activeTask && !lastCompletedTask && (
            <div className={styles.emptyState}>No active background task. Start one above!</div>
          )}
          {(activeTask || lastCompletedTask) && (() => {
            const displayTask = activeTask || lastCompletedTask!
            const displayStatus = activeTask ? taskStatus : (
              displayTask.status === 'completed' ? 'complete' :
              displayTask.status === 'error' || displayTask.status === 'failed' ? 'error' :
              displayTask.status === 'cancelled' ? 'cancelled' : 'complete'
            )
            const displayPercent = activeTask ? progressPercent : clampPercent(displayTask.progress?.progressPercent, 100)
            const displayStepLabel = displayTask.progress?.totalSteps
              ? `Step ${Math.min(displayTask.progress?.completedSteps ?? displayTask.progress?.iterations ?? 1, displayTask.progress?.totalSteps)} of ${displayTask.progress?.totalSteps}`
              : displayTask.progress?.iterations
                ? `Step ${displayTask.progress.iterations}`
                : 'Completed'
            
            return (
            <div className={styles.task}>
              <div className={styles.taskHeader}>
                {displayStatus === 'complete' && <CheckCircle size={18} className={styles.complete} />}
                {displayStatus === 'error' && <AlertCircle size={18} className={styles.error} />}
                {displayStatus === 'cancelled' && <StopCircle size={18} className={styles.cancelled} />}
                {displayStatus === 'running' && <Rocket size={18} className={styles.running} />}
                <div>
                  <div className={styles.taskGoal}>{displayTask.goal}</div>
                  <div className={styles.taskStep}>{displayTask.progress?.currentStep || (displayStatus === 'complete' ? 'Completed successfully' : 'Working...')}</div>
                </div>
              </div>
              <div className={styles.progressRow}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${displayPercent}%` }} />
                </div>
                <div className={styles.progressMeta}>
                  <span>{displayPercent}%</span>
                  <span>{displayStepLabel}</span>
                </div>
              </div>
              
              {/* Live Activity Feed - Shows what the agent is doing in real-time */}
              {displayStatus === 'running' && (
                <div className={styles.liveActivitySection}>
                  <div className={styles.liveActivityHeader}>
                    <Terminal size={14} />
                    <span>Live Activity</span>
                    {connectionStatus === 'connected' && (
                      <span className={styles.streamingIndicator}>● Live</span>
                    )}
                    {connectionStatus === 'connecting' && (
                      <span className={styles.connectingIndicator}>
                        <Loader2 size={12} className={styles.spin} /> Connecting...
                      </span>
                    )}
                    {connectionStatus === 'error' && reconnectAttempt > 0 && (
                      <span className={styles.reconnectingIndicator}>
                        <RefreshCw size={12} className={styles.spin} /> Reconnecting ({reconnectAttempt}/{maxReconnectAttempts})
                      </span>
                    )}
                  </div>
                  <div className={styles.liveActivityFeed} ref={liveEventsRef}>
                    {liveEvents.length === 0 && (
                      <div className={styles.thinkingIndicator}>
                        <div className={styles.thinkingDots}>
                          <span className={styles.thinkingDot}></span>
                          <span className={styles.thinkingDot}></span>
                          <span className={styles.thinkingDot}></span>
                        </div>
                        <span>Agent is analyzing and preparing actions...</span>
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
              
              {/* Show result summary for completed tasks */}
              {displayTask.result?.summary && (
                <div className={styles.taskSummary}>
                  <div className={styles.summaryHeader}>
                    <CheckCircle size={16} className={styles.summaryIcon} />
                    <strong>Task Completed</strong>
                  </div>
                  <div className={styles.summaryContent}>{displayTask.result.summary}</div>
                  {displayTask.progress?.iterations && (
                    <div className={styles.summaryMeta}>
                      Completed in {displayTask.progress.iterations} steps
                    </div>
                  )}
                </div>
              )}
              {displayTask.error && (
                <div className={styles.taskError}>
                  <AlertCircle size={16} />
                  <span>{displayTask.error}</span>
                </div>
              )}
              
              {/* Follow-up Section - Send additional instructions to running agent */}
              {displayStatus === 'running' && (
                <div className={styles.followUpSection}>
                  <div className={styles.followUpHeader}>
                    <MessageCircle size={14} />
                    <span>Send Follow-up Instructions</span>
                  </div>
                  <div className={styles.followUpForm}>
                    <input
                      type="text"
                      className={styles.followUpInput}
                      placeholder="Add more context or redirect the agent..."
                      value={followUpInput}
                      onChange={e => setFollowUpInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendFollowUp()}
                      disabled={isSendingFollowUp}
                    />
                    <button
                      className={styles.followUpBtn}
                      onClick={handleSendFollowUp}
                      disabled={!followUpInput.trim() || isSendingFollowUp}
                    >
                      {isSendingFollowUp ? <Loader2 size={14} className={styles.spin} /> : <Send size={14} />}
                    </button>
                  </div>
                  {followUpError && (
                    <div className={styles.followUpError}>{followUpError}</div>
                  )}
                </div>
              )}
              
              {displayStatus === 'running' && (
                <button className={styles.cancelBtn} onClick={handleCancel} disabled={isCancelling}>
                  {isCancelling ? <Loader2 size={14} className={styles.spin} /> : <StopCircle size={14} />}
                  Cancel Task
                </button>
              )}
              
              {/* Feedback button for completed tasks */}
              {(displayStatus === 'complete' || displayStatus === 'error') && displayTask.id && !feedbackSubmitted.has(displayTask.id) && (
                <button 
                  className={styles.feedbackBtn} 
                  onClick={() => openFeedbackModal(displayTask.id)}
                >
                  <Star size={14} />
                  Rate This Task
                </button>
              )}
              {displayTask.id && feedbackSubmitted.has(displayTask.id) && (
                <div className={styles.feedbackThanks}>
                  <ThumbsUp size={14} />
                  Thanks for your feedback!
                </div>
              )}
            </div>
            )
          })()}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Recent Tasks</h2>
            <span className={styles.taskCount}>{recentTasks.length} tasks</span>
          </div>
          
          {/* Search and Filter */}
          {recentTasks.length > 0 && (
            <div className={styles.historyFilters}>
              <div className={styles.historySearch}>
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
                {historySearch && (
                  <button 
                    className={styles.clearSearch}
                    onClick={() => setHistorySearch('')}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <select
                className={styles.statusFilter}
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="running">Running</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
          
          {recentTasks.length === 0 && (
            <div className={styles.emptyState}>No recent background tasks yet.</div>
          )}
          {recentTasks.length > 0 && filteredRecentTasks.length === 0 && (
            <div className={styles.emptyState}>No tasks match your search.</div>
          )}
          {filteredRecentTasks.length > 0 && (
            <div className={styles.taskList}>
              {filteredRecentTasks.map(task => (
                <div key={task.id} className={styles.taskRow}>
                  <div className={styles.taskRowMain}>
                    <div className={styles.taskStatusIcon}>
                      {task.status === 'completed' && <CheckCircle size={14} className={styles.complete} />}
                      {task.status === 'failed' && <AlertCircle size={14} className={styles.error} />}
                      {task.status === 'cancelled' && <StopCircle size={14} className={styles.cancelled} />}
                      {task.status === 'running' && <Loader2 size={14} className={styles.spin} />}
                    </div>
                    <div className={styles.taskRowContent}>
                      <div className={styles.taskGoalSmall}>{task.goal}</div>
                      <div className={styles.taskRowMeta}>
                        <span className={`${styles.taskStatusBadge} ${styles[task.status]}`}>
                          {task.status}
                        </span>
                        {task.progress?.iterations && (
                          <span className={styles.taskIterations}>
                            {task.progress.iterations} steps
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={styles.taskRowProgress}>
                    {clampPercent(task.progress?.progressPercent, 0)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent Capabilities Section - Always visible for discoverability */}
      <div className={styles.capabilitiesCard}>
        <div className={styles.capabilitiesHeader}>
          <div className={styles.capabilitiesTitle}>
            <Zap size={20} />
            <div>
              <h2>What the Agent Can Do</h2>
              <p>The background agent can autonomously perform these actions on your behalf</p>
            </div>
          </div>
        </div>
        
        <div className={styles.capabilitiesGrid}>
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><Briefcase size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Matters & Cases</h4>
              <ul>
                <li>Create and update matters</li>
                <li>Generate case assessments</li>
                <li>Identify critical deadlines</li>
                <li>Run conflict checks</li>
              </ul>
            </div>
          </div>
          
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><FileText size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Documents</h4>
              <ul>
                <li>Analyze and summarize documents</li>
                <li>Extract key terms and clauses</li>
                <li>Draft document outlines</li>
                <li>Create document indexes</li>
              </ul>
            </div>
          </div>
          
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><Clock size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Time & Billing</h4>
              <ul>
                <li>Review time entries</li>
                <li>Suggest billing descriptions</li>
                <li>Prepare invoice summaries</li>
                <li>Identify unbilled work</li>
              </ul>
            </div>
          </div>
          
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><Users size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Clients & Communication</h4>
              <ul>
                <li>Prepare client updates</li>
                <li>Draft correspondence</li>
                <li>Create intake checklists</li>
                <li>Generate status reports</li>
              </ul>
            </div>
          </div>
          
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><Calendar size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Calendar & Tasks</h4>
              <ul>
                <li>Review upcoming deadlines</li>
                <li>Create task lists</li>
                <li>Schedule reminders</li>
                <li>Audit calendar compliance</li>
              </ul>
            </div>
          </div>
          
          <div className={styles.capabilityCategory}>
            <div className={styles.capabilityIcon}><Scale size={18} /></div>
            <div className={styles.capabilityInfo}>
              <h4>Legal Research</h4>
              <ul>
                <li>Research statute of limitations</li>
                <li>Identify relevant court rules</li>
                <li>Check NY CPLR requirements</li>
                <li>Prepare legal memos</li>
              </ul>
            </div>
          </div>
        </div>
        
        {/* Detailed Tool List (Collapsible) */}
        {tools?.categories && (
          <details className={styles.toolsDetails}>
            <summary className={styles.toolsSummary}>
              <Wrench size={14} />
              <span>View All {tools.categories.reduce((acc, cat) => acc + cat.tools.length, 0)} Tools</span>
            </summary>
            <div className={styles.toolGrid}>
              {tools.categories.map(category => (
                <div key={category.name} className={styles.toolCategory}>
                  <div className={styles.toolHeader}>
                    <span>{category.name}</span>
                    <span className={styles.toolCount}>{category.tools.length}</span>
                  </div>
                  <ul>
                    {category.tools.map(toolName => (
                      <li key={toolName}>{toolName}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className={styles.modalOverlay} onClick={closeFeedbackModal}>
          <div className={styles.feedbackModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Rate This Task</h3>
              <button className={styles.modalClose} onClick={closeFeedbackModal}>
                <X size={18} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {/* Star Rating */}
              <div className={styles.ratingSection}>
                <label>How did the agent perform?</label>
                <div className={styles.starRating}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      className={`${styles.starBtn} ${feedbackRating >= star ? styles.starActive : ''}`}
                      onClick={() => setFeedbackRating(star)}
                      type="button"
                    >
                      <Star size={28} fill={feedbackRating >= star ? '#f59e0b' : 'none'} />
                    </button>
                  ))}
                </div>
                <div className={styles.ratingLabel}>
                  {feedbackRating === 0 && 'Click to rate'}
                  {feedbackRating === 1 && 'Poor'}
                  {feedbackRating === 2 && 'Fair'}
                  {feedbackRating === 3 && 'Good'}
                  {feedbackRating === 4 && 'Very Good'}
                  {feedbackRating === 5 && 'Excellent'}
                </div>
              </div>

              {/* Text Feedback */}
              <div className={styles.feedbackField}>
                <label>Additional feedback (optional)</label>
                <textarea
                  className={styles.feedbackTextarea}
                  placeholder="What did you like or dislike about the result?"
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Correction Input */}
              <div className={styles.feedbackField}>
                <label>What should the agent have done differently? (optional)</label>
                <textarea
                  className={styles.feedbackTextarea}
                  placeholder="Describe how you would have preferred the task to be handled..."
                  value={feedbackCorrection}
                  onChange={e => setFeedbackCorrection(e.target.value)}
                  rows={3}
                />
                <div className={styles.feedbackHint}>
                  This helps the agent learn and improve for future tasks.
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={closeFeedbackModal}>
                Cancel
              </button>
              <button 
                className={styles.modalSubmitBtn} 
                onClick={handleSubmitFeedback}
                disabled={isSubmittingFeedback || (feedbackRating === 0 && !feedbackText.trim() && !feedbackCorrection.trim())}
              >
                {isSubmittingFeedback ? (
                  <>
                    <Loader2 size={14} className={styles.spin} />
                    Submitting...
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
