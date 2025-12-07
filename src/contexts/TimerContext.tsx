import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react'
import { useDataStore } from '../stores/dataStore'
import { timerApi } from '../services/api'

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
  const [timer, setTimer] = useState<TimerState>(initialTimerState)
  const [isInitialized, setIsInitialized] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load timer state from database on mount
  useEffect(() => {
    const loadTimerState = async () => {
      try {
        const data = await timerApi.get()
        if (data && data.startTime) {
          const startTime = new Date(data.startTime)
          const accumulatedTime = data.accumulatedSeconds || 0
          
          if (data.isRunning && !data.isPaused) {
            // Timer was running, calculate elapsed time
            setTimer({
              isRunning: true,
              isPaused: false,
              matterId: data.matterId,
              matterName: data.matterName,
              clientId: data.clientId,
              clientName: data.clientName,
              startTime,
              pausedAt: null,
              accumulatedTime,
              elapsed: accumulatedTime + Math.floor((Date.now() - startTime.getTime()) / 1000)
            })
          } else if (data.isPaused) {
            // Timer was paused
            setTimer({
              isRunning: true,
              isPaused: true,
              matterId: data.matterId,
              matterName: data.matterName,
              clientId: data.clientId,
              clientName: data.clientName,
              startTime,
              pausedAt: data.pausedAt ? new Date(data.pausedAt) : null,
              accumulatedTime,
              elapsed: accumulatedTime
            })
          }
        }
      } catch (error) {
        console.error('Failed to load timer state:', error)
      }
      setIsInitialized(true)
    }

    loadTimerState()
  }, [])

  // Save timer state to database (debounced)
  const saveTimerState = useCallback(async (state: TimerState) => {
    if (!isInitialized) return
    
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // Debounce the save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (state.startTime) {
          await timerApi.update({
            isRunning: state.isRunning,
            isPaused: state.isPaused,
            matterId: state.matterId,
            matterName: state.matterName,
            clientId: state.clientId,
            clientName: state.clientName,
            startTime: state.startTime?.toISOString(),
            pausedAt: state.pausedAt?.toISOString() || null,
            accumulatedSeconds: state.accumulatedTime,
          })
        } else {
          await timerApi.clear()
        }
      } catch (error) {
        console.error('Failed to save timer state:', error)
      }
    }, 1000) // Save after 1 second of no changes
  }, [isInitialized])

  // Save timer state when it changes (but not every second for elapsed)
  useEffect(() => {
    if (isInitialized && (timer.isRunning || timer.isPaused || timer.startTime)) {
      saveTimerState(timer)
    }
  }, [timer.isRunning, timer.isPaused, timer.matterId, timer.startTime, timer.accumulatedTime, isInitialized, saveTimerState])

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

  const startTimer = useCallback(async (options: { 
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
    
    const startTime = new Date()
    const newState: TimerState = {
      isRunning: true,
      isPaused: false,
      matterId: options.matterId || null,
      matterName: matterName || null,
      clientId: options.clientId || null,
      clientName: clientName || null,
      startTime,
      pausedAt: null,
      accumulatedTime: 0,
      elapsed: 0
    }
    
    setTimer(newState)
    
    // Save immediately when starting
    try {
      await timerApi.update({
        isRunning: true,
        isPaused: false,
        matterId: options.matterId || null,
        matterName: matterName || null,
        clientId: options.clientId || null,
        clientName: clientName || null,
        startTime: startTime.toISOString(),
        pausedAt: null,
        accumulatedSeconds: 0,
      })
    } catch (error) {
      console.error('Failed to save timer start:', error)
    }
  }, [matters, clients])

  const pauseTimer = useCallback(async () => {
    setTimer(prev => {
      if (!prev.isRunning || prev.isPaused) return prev
      
      const currentElapsed = prev.accumulatedTime + 
        Math.floor((Date.now() - (prev.startTime?.getTime() || Date.now())) / 1000)
      
      const newState = {
        ...prev,
        isRunning: true,
        isPaused: true,
        pausedAt: new Date(),
        accumulatedTime: currentElapsed,
        elapsed: currentElapsed
      }
      
      // Save pause state
      timerApi.update({
        isRunning: true,
        isPaused: true,
        matterId: prev.matterId,
        matterName: prev.matterName,
        clientId: prev.clientId,
        clientName: prev.clientName,
        startTime: prev.startTime?.toISOString() || null,
        pausedAt: newState.pausedAt.toISOString(),
        accumulatedSeconds: currentElapsed,
      }).catch(err => console.error('Failed to save pause state:', err))
      
      return newState
    })
  }, [])

  const resumeTimer = useCallback(async () => {
    setTimer(prev => {
      if (!prev.isPaused) return prev
      
      const newState = {
        ...prev,
        isRunning: true,
        isPaused: false,
        startTime: new Date(),
        pausedAt: null
      }
      
      // Save resume state
      timerApi.update({
        isRunning: true,
        isPaused: false,
        matterId: prev.matterId,
        matterName: prev.matterName,
        clientId: prev.clientId,
        clientName: prev.clientName,
        startTime: newState.startTime.toISOString(),
        pausedAt: null,
        accumulatedSeconds: prev.accumulatedTime,
      }).catch(err => console.error('Failed to save resume state:', err))
      
      return newState
    })
  }, [])

  const stopTimer = useCallback(async () => {
    setTimer(prev => ({ 
      ...prev, 
      isRunning: false,
      isPaused: false 
    }))
    
    // Save stopped state
    try {
      await timerApi.update({
        isRunning: false,
        isPaused: false,
        matterId: timer.matterId,
        matterName: timer.matterName,
        clientId: timer.clientId,
        clientName: timer.clientName,
        startTime: timer.startTime?.toISOString() || null,
        pausedAt: null,
        accumulatedSeconds: timer.accumulatedTime,
      })
    } catch (error) {
      console.error('Failed to save stop state:', error)
    }
  }, [timer])

  const discardTimer = useCallback(async () => {
    setTimer(initialTimerState)
    
    // Clear timer in database
    try {
      await timerApi.clear()
    } catch (error) {
      console.error('Failed to clear timer:', error)
    }
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
