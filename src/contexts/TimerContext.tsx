import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useDataStore } from '../stores/dataStore'

interface TimerState {
  isRunning: boolean
  matterId: string | null
  matterName: string | null
  startTime: Date | null
  elapsed: number
}

interface TimerContextType {
  timer: TimerState
  startTimer: (matterId: string, matterName: string) => void
  stopTimer: () => void
  saveTimerEntry: (description: string) => Promise<void>
  discardTimer: () => void
}

const TimerContext = createContext<TimerContextType | null>(null)

export function TimerProvider({ children }: { children: ReactNode }) {
  const { addTimeEntry, fetchTimeEntries, matters } = useDataStore()
  
  const [timer, setTimer] = useState<TimerState>(() => {
    // Restore timer from localStorage
    const saved = localStorage.getItem('global-timer')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.isRunning && parsed.startTime) {
        return {
          ...parsed,
          startTime: new Date(parsed.startTime),
          elapsed: Math.floor((Date.now() - new Date(parsed.startTime).getTime()) / 1000)
        }
      }
    }
    return {
      isRunning: false,
      matterId: null,
      matterName: null,
      startTime: null,
      elapsed: 0
    }
  })

  // Persist timer to localStorage
  useEffect(() => {
    if (timer.isRunning) {
      localStorage.setItem('global-timer', JSON.stringify({
        isRunning: timer.isRunning,
        matterId: timer.matterId,
        matterName: timer.matterName,
        startTime: timer.startTime?.toISOString()
      }))
    } else {
      localStorage.removeItem('global-timer')
    }
  }, [timer])

  // Update elapsed time every second
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (timer.isRunning && timer.startTime) {
      interval = setInterval(() => {
        setTimer(prev => ({
          ...prev,
          elapsed: Math.floor((Date.now() - (prev.startTime?.getTime() || Date.now())) / 1000)
        }))
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [timer.isRunning, timer.startTime])

  const startTimer = useCallback((matterId: string, matterName: string) => {
    setTimer({
      isRunning: true,
      matterId,
      matterName,
      startTime: new Date(),
      elapsed: 0
    })
  }, [])

  const stopTimer = useCallback(() => {
    // Just stop updating elapsed, keep state for saving
    setTimer(prev => ({ ...prev, isRunning: false }))
  }, [])

  const discardTimer = useCallback(() => {
    setTimer({
      isRunning: false,
      matterId: null,
      matterName: null,
      startTime: null,
      elapsed: 0
    })
  }, [])

  const saveTimerEntry = useCallback(async (description: string) => {
    if (!timer.matterId || timer.elapsed < 1) return
    
    const hours = Math.round((timer.elapsed / 3600) * 100) / 100
    const matter = matters.find(m => m.id === timer.matterId)
    
    try {
      await addTimeEntry({
        matterId: timer.matterId,
        date: new Date().toISOString(),
        hours: Math.max(0.01, hours),
        description: description || 'Timer entry',
        billable: true,
        billed: false,
        rate: matter?.billingRate || 450,
        aiGenerated: false,
        status: 'pending',
        entryType: 'timer',
        updatedAt: new Date().toISOString()
      })
      fetchTimeEntries()
      discardTimer()
    } catch (error) {
      console.error('Failed to save timer entry:', error)
      throw error
    }
  }, [timer, matters, addTimeEntry, fetchTimeEntries, discardTimer])

  return (
    <TimerContext.Provider value={{ timer, startTimer, stopTimer, saveTimerEntry, discardTimer }}>
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
