import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Brain,
  CheckCircle,
  ChevronRight,
  Loader2,
  XCircle,
  Minimize2,
  Maximize2
} from 'lucide-react'
import styles from './AgentStatusWidget.module.css'

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

interface ActiveTask {
  taskId: string
  progress: AgentProgress | null
  lastUpdate: string
  isComplete: boolean
}

export function AgentStatusWidget() {
  const navigate = useNavigate()
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([])
  const [isMinimized, setIsMinimized] = useState(false)
  const [isHidden, setIsHidden] = useState(true)
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map())
  
  // Poll for active tasks
  const checkActiveTasks = useCallback(async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const token = localStorage.getItem('token')
      
      const response = await fetch(`${apiUrl}/v1/background-agent/tasks`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) return
      
      const data = await response.json()
      const tasks = data.tasks || []
      
      // Find active tasks
      const running = tasks.filter(
        (t: { status: string }) => t.status === 'pending' || t.status === 'running'
      )
      
      if (running.length > 0) {
        setIsHidden(false)
        
        // Connect to each active task's stream
        for (const task of running) {
          if (!eventSourcesRef.current.has(task.id)) {
            connectToTask(task.id)
          }
        }
      } else if (activeTasks.length === 0 || activeTasks.every(t => t.isComplete)) {
        // Hide after a delay when all tasks complete
        setTimeout(() => setIsHidden(true), 5000)
      }
    } catch (e) {
      console.error('[AgentWidget] Error checking tasks:', e)
    }
  }, [activeTasks])
  
  // Connect to a task's SSE stream
  const connectToTask = (taskId: string) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
    const token = localStorage.getItem('token')
    const url = `${apiUrl}/v1/agent-stream/${taskId}?token=${token}`
    
    const eventSource = new EventSource(url)
    eventSourcesRef.current.set(taskId, eventSource)
    
    setActiveTasks(prev => {
      if (prev.some(t => t.taskId === taskId)) return prev
      return [...prev, {
        taskId,
        progress: null,
        lastUpdate: new Date().toISOString(),
        isComplete: false
      }]
    })
    
    eventSource.addEventListener('progress', (e) => {
      const progress = JSON.parse(e.data) as AgentProgress
      
      setActiveTasks(prev => prev.map(t => 
        t.taskId === taskId 
          ? { 
              ...t, 
              progress,
              lastUpdate: new Date().toISOString(),
              isComplete: progress.status === 'completed' || progress.status === 'failed'
            }
          : t
      ))
    })
    
    eventSource.addEventListener('event', (e) => {
      const event = JSON.parse(e.data)
      
      if (event.type === 'task_complete' || event.type === 'task_failed') {
        setActiveTasks(prev => prev.map(t =>
          t.taskId === taskId ? { ...t, isComplete: true } : t
        ))
        
        // Clean up connection
        eventSource.close()
        eventSourcesRef.current.delete(taskId)
      }
    })
    
    eventSource.onerror = () => {
      eventSource.close()
      eventSourcesRef.current.delete(taskId)
    }
  }
  
  // Poll every 10 seconds
  useEffect(() => {
    checkActiveTasks()
    const interval = setInterval(checkActiveTasks, 10000)
    
    return () => {
      clearInterval(interval)
      // Clean up all connections
      eventSourcesRef.current.forEach(es => es.close())
      eventSourcesRef.current.clear()
    }
  }, [checkActiveTasks])
  
  // Don't render if hidden
  if (isHidden && activeTasks.length === 0) {
    return null
  }
  
  // Get the primary task to display
  const primaryTask = activeTasks.find(t => !t.isComplete) || activeTasks[0]
  
  if (!primaryTask) return null
  
  const progress = primaryTask.progress
  const isComplete = primaryTask.isComplete
  const isFailed = progress?.status === 'failed'
  
  const handleClick = () => {
    navigate(`/app/agent-console/${primaryTask.taskId}`)
  }
  
  if (isMinimized) {
    return (
      <div className={styles.widgetMinimized} onClick={handleClick}>
        <div className={styles.miniIcon}>
          {isComplete ? (
            isFailed ? <XCircle size={16} /> : <CheckCircle size={16} />
          ) : (
            <Loader2 size={16} className={styles.spinning} />
          )}
        </div>
        <div 
          className={`${styles.miniProgress} ${isFailed ? styles.failed : isComplete ? styles.complete : ''}`}
          style={{ width: `${progress?.progress_percent || 0}%` }}
        />
        <button 
          className={styles.expandBtn}
          onClick={(e) => { e.stopPropagation(); setIsMinimized(false) }}
        >
          <Maximize2 size={12} />
        </button>
      </div>
    )
  }
  
  return (
    <div 
      className={`${styles.widget} ${isComplete ? (isFailed ? styles.failed : styles.complete) : ''}`}
      onClick={handleClick}
    >
      <div className={styles.header}>
        <div className={styles.statusIcon}>
          {isComplete ? (
            isFailed ? (
              <XCircle size={18} className={styles.failedIcon} />
            ) : (
              <CheckCircle size={18} className={styles.completeIcon} />
            )
          ) : (
            <Brain size={18} className={styles.thinkingIcon} />
          )}
        </div>
        <div className={styles.titleSection}>
          <span className={styles.title}>
            {isComplete ? (isFailed ? 'Task Failed' : 'Task Complete') : 'Agent Working'}
          </span>
          <span className={styles.status}>
            {progress?.current_step || 'Initializing...'}
          </span>
        </div>
        <button 
          className={styles.minimizeBtn}
          onClick={(e) => { e.stopPropagation(); setIsMinimized(true) }}
        >
          <Minimize2 size={14} />
        </button>
      </div>
      
      <div className={styles.progressBar}>
        <div 
          className={`${styles.progressFill} ${isFailed ? styles.failed : isComplete ? styles.complete : ''}`}
          style={{ width: `${progress?.progress_percent || 0}%` }}
        />
      </div>
      
      <div className={styles.footer}>
        <span className={styles.percent}>{progress?.progress_percent || 0}%</span>
        <span className={styles.viewMore}>
          View Details <ChevronRight size={14} />
        </span>
      </div>
      
      {activeTasks.length > 1 && (
        <div className={styles.badge}>+{activeTasks.length - 1}</div>
      )}
    </div>
  )
}
