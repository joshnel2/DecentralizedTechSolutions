import { useState, useEffect } from 'react'
import { Bot, X, CheckCircle, AlertCircle } from 'lucide-react'
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
  const [isVisible, setIsVisible] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [hasError, setHasError] = useState(false)

  // Poll for active task status
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null

    const checkActiveTask = async () => {
      try {
        const response = await aiApi.getActiveTask()
        if (response.active && response.task) {
          setActiveTask(response.task)
          setIsVisible(true)
          setIsComplete(false)
          setHasError(false)
        } else if (activeTask && !response.active) {
          // Task just completed
          setIsComplete(true)
          setTimeout(() => {
            setIsVisible(false)
            setActiveTask(null)
          }, 5000)
        }
      } catch (error) {
        console.error('Error checking active task:', error)
      }
    }

    // Listen for background task started event
    const handleTaskStarted = (event: CustomEvent) => {
      setActiveTask({
        id: event.detail.taskId,
        goal: event.detail.goal,
        status: 'running',
        progressPercent: 5,
        iterations: 0,
        currentStep: 'Starting...'
      })
      setIsVisible(true)
      setIsComplete(false)
      setHasError(false)
    }

    window.addEventListener('backgroundTaskStarted', handleTaskStarted as EventListener)

    // Start polling when visible
    if (isVisible && !isComplete) {
      intervalId = setInterval(checkActiveTask, 2000)
    }

    // Initial check
    checkActiveTask()

    return () => {
      if (intervalId) clearInterval(intervalId)
      window.removeEventListener('backgroundTaskStarted', handleTaskStarted as EventListener)
    }
  }, [isVisible, isComplete, activeTask])

  const handleDismiss = () => {
    setIsVisible(false)
    setActiveTask(null)
  }

  if (!isVisible || !activeTask) return null

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
          <div className={styles.title}>
            {isComplete ? 'Background Task Complete' : 'Background Agent Working'}
          </div>
          <div className={styles.goal}>{activeTask.goal}</div>
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

        <button onClick={handleDismiss} className={styles.dismissBtn}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
