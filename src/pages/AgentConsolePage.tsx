import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Brain,
  CheckCircle,
  ChevronRight,
  FileText,
  Loader2,
  AlertTriangle,
  XCircle,
  Play,
  Pause,
  RefreshCw,
  Terminal,
  BookOpen,
  Search,
  HelpCircle,
  Eye,
  Rocket,
  Wrench,
  FileCheck,
  List,
  Activity
} from 'lucide-react'
import styles from './AgentConsolePage.module.css'

interface AgentEvent {
  type: string
  task_id: string
  timestamp: string
  message: string
  icon?: string
  color?: string
  data?: Record<string, unknown>
}

interface AgentProgress {
  task_id: string
  status: string
  current_step: string
  progress_percent: number
  total_steps: number
  completed_steps: number
  current_phase: string
  irac_phase: string
  started_at: string
  elapsed_seconds: number
  current_artifact: string
  artifact_preview: string
}

const ICON_MAP: Record<string, React.ReactNode> = {
  'rocket': <Rocket size={14} />,
  'brain': <Brain size={14} />,
  'tool': <Wrench size={14} />,
  'check-circle': <CheckCircle size={14} />,
  'x-circle': <XCircle size={14} />,
  'alert-triangle': <AlertTriangle size={14} />,
  'file-text': <FileText size={14} />,
  'file-check': <FileCheck size={14} />,
  'file-plus': <FileText size={14} />,
  'list': <List size={14} />,
  'play': <Play size={14} />,
  'check': <CheckCircle size={14} />,
  'book': <BookOpen size={14} />,
  'search': <Search size={14} />,
  'help-circle': <HelpCircle size={14} />,
  'check-square': <CheckCircle size={14} />,
  'eye': <Eye size={14} />,
  'activity': <Activity size={14} />,
  'info': <FileText size={14} />,
  'edit': <FileText size={14} />,
  'circle': <Activity size={14} />,
}

function getEventIcon(icon: string | undefined): React.ReactNode {
  return ICON_MAP[icon || 'circle'] || <Activity size={14} />
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    })
  } catch {
    return ''
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function AgentConsolePage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [progress, setProgress] = useState<AgentProgress | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  
  // Connect to SSE stream
  const connect = useCallback(() => {
    if (!taskId) return
    
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
    const token = localStorage.getItem('token')
    const url = `${apiUrl}/v1/agent-stream/${taskId}?token=${token}`
    
    console.log('[AgentConsole] Connecting to:', url)
    
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource
    
    eventSource.onopen = () => {
      console.log('[AgentConsole] Connected')
      setConnected(true)
    }
    
    eventSource.onerror = () => {
      console.log('[AgentConsole] Connection error, reconnecting...')
      setConnected(false)
      eventSource.close()
      
      // Reconnect after delay
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect()
      }, 3000)
    }
    
    eventSource.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data)
      console.log('[AgentConsole] Connected:', data)
      setConnected(true)
    })
    
    eventSource.addEventListener('event', (e) => {
      const event = JSON.parse(e.data) as AgentEvent
      setEvents(prev => [...prev, event])
    })
    
    eventSource.addEventListener('progress', (e) => {
      const prog = JSON.parse(e.data) as AgentProgress
      setProgress(prog)
    })
    
    eventSource.addEventListener('history', (e) => {
      const data = JSON.parse(e.data)
      if (data.events) {
        setEvents(prev => [...data.events, ...prev])
      }
    })
    
    eventSource.addEventListener('heartbeat', () => {
      // Keep-alive, no action needed
    })
  }, [taskId])
  
  // Connect on mount
  useEffect(() => {
    connect()
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [connect])
  
  // Auto-scroll terminal
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [events, autoScroll])
  
  // Filter events
  const filteredEvents = events.filter(event => {
    if (filter === 'all') return true
    if (filter === 'tools') return event.type.includes('tool')
    if (filter === 'irac') return event.type.includes('irac')
    if (filter === 'errors') return event.type === 'error' || event.type === 'tool_error'
    return true
  })
  
  const getEventColorClass = (color: string | undefined): string => {
    switch (color) {
      case 'gray': return styles.eventGray
      case 'blue': return styles.eventBlue
      case 'green': return styles.eventGreen
      case 'red': return styles.eventRed
      case 'orange': return styles.eventOrange
      case 'purple': return styles.eventPurple
      case 'indigo': return styles.eventIndigo
      default: return styles.eventDefault
    }
  }
  
  const isComplete = progress?.status === 'completed' || progress?.status === 'failed'
  const isFailed = progress?.status === 'failed'
  
  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/app/background-agent')}>
          <ArrowLeft size={18} />
          Back
        </button>
        
        <div className={styles.headerTitle}>
          <Terminal size={20} />
          <h1>Agent Console</h1>
          <span className={styles.taskId}>{taskId?.substring(0, 20)}...</span>
        </div>
        
        <div className={styles.headerStatus}>
          <span className={`${styles.connectionDot} ${connected ? styles.connected : styles.disconnected}`} />
          {connected ? 'Live' : 'Reconnecting...'}
        </div>
      </header>
      
      {/* Progress Bar */}
      <div className={styles.progressSection}>
        <div className={styles.progressHeader}>
          <div className={styles.progressInfo}>
            <span className={styles.progressStatus}>
              {isComplete ? (
                isFailed ? (
                  <><XCircle size={16} className={styles.failedIcon} /> Failed</>
                ) : (
                  <><CheckCircle size={16} className={styles.completeIcon} /> Complete</>
                )
              ) : (
                <><Loader2 size={16} className={styles.spinIcon} /> {progress?.status || 'Initializing'}</>
              )}
            </span>
            <span className={styles.progressStep}>{progress?.current_step || 'Starting...'}</span>
          </div>
          <div className={styles.progressMeta}>
            <span>{progress?.progress_percent || 0}%</span>
            {progress?.elapsed_seconds && (
              <span className={styles.elapsed}>{formatDuration(progress.elapsed_seconds)}</span>
            )}
          </div>
        </div>
        <div className={styles.progressBar}>
          <div 
            className={`${styles.progressFill} ${isFailed ? styles.progressFailed : isComplete ? styles.progressComplete : ''}`}
            style={{ width: `${progress?.progress_percent || 0}%` }}
          />
        </div>
        {progress?.irac_phase && (
          <div className={styles.iracProgress}>
            <span className={`${styles.iracPhase} ${progress.irac_phase === 'issue' ? styles.active : ''}`}>Issue</span>
            <ChevronRight size={14} />
            <span className={`${styles.iracPhase} ${progress.irac_phase === 'rule' ? styles.active : ''}`}>Rule</span>
            <ChevronRight size={14} />
            <span className={`${styles.iracPhase} ${progress.irac_phase === 'analysis' ? styles.active : ''}`}>Analysis</span>
            <ChevronRight size={14} />
            <span className={`${styles.iracPhase} ${progress.irac_phase === 'conclusion' ? styles.active : ''}`}>Conclusion</span>
            <ChevronRight size={14} />
            <span className={`${styles.iracPhase} ${progress.irac_phase === 'critique' ? styles.active : ''}`}>Critique</span>
          </div>
        )}
      </div>
      
      {/* Main Content */}
      <div className={styles.content}>
        {/* Terminal View */}
        <div className={styles.terminalSection}>
          <div className={styles.terminalHeader}>
            <div className={styles.terminalTitle}>
              <Terminal size={16} />
              <span>Activity Log</span>
              <span className={styles.eventCount}>{events.length} events</span>
            </div>
            <div className={styles.terminalControls}>
              <select 
                className={styles.filterSelect}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All Events</option>
                <option value="tools">Tools Only</option>
                <option value="irac">IRAC Only</option>
                <option value="errors">Errors Only</option>
              </select>
              <button 
                className={`${styles.controlBtn} ${autoScroll ? styles.active : ''}`}
                onClick={() => setAutoScroll(!autoScroll)}
                title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
              >
                {autoScroll ? <Play size={14} /> : <Pause size={14} />}
              </button>
              <button 
                className={styles.controlBtn}
                onClick={() => setEvents([])}
                title="Clear"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          
          <div className={styles.terminal} ref={terminalRef}>
            {filteredEvents.length === 0 ? (
              <div className={styles.emptyTerminal}>
                <Loader2 size={24} className={styles.spinIcon} />
                <span>Waiting for agent activity...</span>
              </div>
            ) : (
              filteredEvents.map((event, index) => (
                <div 
                  key={`${event.timestamp}-${index}`} 
                  className={`${styles.eventRow} ${getEventColorClass(event.color)}`}
                >
                  <span className={styles.eventTime}>{formatTimestamp(event.timestamp)}</span>
                  <span className={styles.eventIcon}>{getEventIcon(event.icon)}</span>
                  <span className={styles.eventMessage}>{event.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Artifact Preview */}
        <div className={styles.artifactSection}>
          <div className={styles.artifactHeader}>
            <FileText size={16} />
            <span>Current Artifact</span>
          </div>
          <div className={styles.artifactContent}>
            {progress?.current_artifact ? (
              <>
                <div className={styles.artifactName}>
                  <FileCheck size={14} />
                  {progress.current_artifact}
                </div>
                {progress.artifact_preview ? (
                  <pre className={styles.artifactPreview}>
                    {progress.artifact_preview}
                  </pre>
                ) : (
                  <div className={styles.artifactEmpty}>
                    <Loader2 size={16} className={styles.spinIcon} />
                    <span>Writing...</span>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.artifactEmpty}>
                <FileText size={24} />
                <span>No artifact in progress</span>
              </div>
            )}
          </div>
          
          {/* Steps Overview */}
          {progress?.total_steps && progress.total_steps > 0 && (
            <div className={styles.stepsOverview}>
              <div className={styles.stepsHeader}>
                <List size={14} />
                <span>Steps ({progress.completed_steps}/{progress.total_steps})</span>
              </div>
              <div className={styles.stepsBar}>
                {Array.from({ length: progress.total_steps }).map((_, i) => (
                  <div 
                    key={i}
                    className={`${styles.stepDot} ${i < progress.completed_steps ? styles.completed : i === progress.completed_steps ? styles.current : ''}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
