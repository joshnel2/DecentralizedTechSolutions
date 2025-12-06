import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useDataStore } from '../stores/dataStore'

interface TimerState {
  isRunning: boolean
  isPaused: boolean
  matterId: string | null
  matterName: string | null
  clientId: string | null
  clientName: string | null
  startTime: Date | null
  pausedAt: Date | null
  accumulatedTime: number // Time accumulated before pause (in seconds)
  elapsed: number
}

interface TimerContextType {
  timer: TimerState
  startTimer: (options: { matterId?: string; matterName?: string; clientId?: string; clientName?: string }) => void
  pauseTimer: () => void
  resumeTimer: () => void
  stopTimer: () => void
  discardTimer: () => void
  isTimerActive: boolean
}

const TimerContext = createContext<TimerContextType | null>(null)

const initialTimerState: TimerState = {
  isRunning: false,
  isPaused: false,
  matterId: null,
  matterName: null,
  clientId: null,
  clientName: null,
  startTime: null,
  pausedAt: null,
  accumulatedTime: 0,
  elapsed: 0
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const { matters, clients } = useDataStore()
  
  const [timer, setTimer] = useState<TimerState>(() => {
    // Restore timer from localStorage
    const saved = localStorage.getItem('global-timer')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.startTime) {
          const startTime = new Date(parsed.startTime)
          const accumulatedTime = parsed.accumulatedTime || 0
          
          if (parsed.isRunning && !parsed.isPaused) {
            // Timer was running, calculate elapsed time
            return {
              ...parsed,
              startTime,
              pausedAt: null,
              elapsed: accumulatedTime + Math.floor((Date.now() - startTime.getTime()) / 1000)
            }
          } else if (parsed.isPaused) {
            // Timer was paused, keep the accumulated time
            return {
              ...parsed,
              startTime,
              pausedAt: parsed.pausedAt ? new Date(parsed.pausedAt) : null,
              elapsed: accumulatedTime
            }
          }
        }
      } catch (e) {
        console.error('Failed to restore timer:', e)
      }
    }
    return initialTimerState
  })

  // Persist timer to localStorage
  useEffect(() => {
    if (timer.startTime) {
      localStorage.setItem('global-timer', JSON.stringify({
        isRunning: timer.isRunning,
        isPaused: timer.isPaused,
        matterId: timer.matterId,
        matterName: timer.matterName,
        clientId: timer.clientId,
        clientName: timer.clientName,
        startTime: timer.startTime?.toISOString(),
        pausedAt: timer.pausedAt?.toISOString(),
        accumulatedTime: timer.accumulatedTime
      }))
    } else {
      localStorage.removeItem('global-timer')
    }
  }, [timer])

  // Update elapsed time every second
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (timer.isRunning && !timer.isPaused && timer.startTime) {
      interval = setInterval(() => {
        setTimer(prev => ({
          ...prev,
          elapsed: prev.accumulatedTime + Math.floor((Date.now() - (prev.startTime?.getTime() || Date.now())) / 1000)
        }))
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [timer.isRunning, timer.isPaused, timer.startTime])

  const startTimer = useCallback((options: { 
    matterId?: string; 
    matterName?: string; 
    clientId?: string; 
    clientName?: string 
  }) => {
    // Get names if not provided
    let matterName = options.matterName
    let clientName = options.clientName
    
    if (options.matterId && !matterName) {
      const matter = matters.find(m => m.id === options.matterId)
      matterName = matter?.name || 'Unknown Matter'
    }
    
    if (options.clientId && !clientName) {
      const client = clients.find(c => c.id === options.clientId)
      clientName = client?.name || client?.displayName || 'Unknown Client'
    }
    
    setTimer({
      isRunning: true,
      isPaused: false,
      matterId: options.matterId || null,
      matterName: matterName || null,
      clientId: options.clientId || null,
      clientName: clientName || null,
      startTime: new Date(),
      pausedAt: null,
      accumulatedTime: 0,
      elapsed: 0
    })
  }, [matters, clients])

  const pauseTimer = useCallback(() => {
    setTimer(prev => {
      if (!prev.isRunning || prev.isPaused) return prev
      
      // Calculate current elapsed and store it
      const currentElapsed = prev.accumulatedTime + 
        Math.floor((Date.now() - (prev.startTime?.getTime() || Date.now())) / 1000)
      
      return {
        ...prev,
        isRunning: true,
        isPaused: true,
        pausedAt: new Date(),
        accumulatedTime: currentElapsed,
        elapsed: currentElapsed
      }
    })
  }, [])

  const resumeTimer = useCallback(() => {
    setTimer(prev => {
      if (!prev.isPaused) return prev
      
      return {
        ...prev,
        isRunning: true,
        isPaused: false,
        startTime: new Date(), // Reset start time to now
        pausedAt: null
        // accumulatedTime stays the same
      }
    })
  }, [])

  const stopTimer = useCallback(() => {
    // Just stop updating elapsed, keep state for saving
    setTimer(prev => ({ 
      ...prev, 
      isRunning: false,
      isPaused: false 
    }))
  }, [])

  const discardTimer = useCallback(() => {
    setTimer(initialTimerState)
  }, [])

  const isTimerActive = timer.isRunning || timer.elapsed > 0

  return (
    <TimerContext.Provider value={{ 
      timer, 
      startTimer, 
      pauseTimer, 
      resumeTimer, 
      stopTimer, 
      discardTimer,
      isTimerActive 
    }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimer() {
  const context = useContext(TimerContext)
  if (!context) {
    throw new Error('useTimer must be used within a TimerProvider')
  }
  return context
}

// Format elapsed time as HH:MM:SS
export function formatElapsedTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Convert seconds to hours (decimal)
export function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100
}
