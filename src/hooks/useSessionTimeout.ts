import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuthStore } from '../stores/authStore'

interface SessionTimeoutConfig {
  warningMinutes?: number // Show warning X minutes before timeout
  timeoutMinutes?: number // Session timeout in minutes
  onWarning?: () => void
  onTimeout?: () => void
}

const DEFAULT_WARNING_MINUTES = 5
const DEFAULT_TIMEOUT_MINUTES = 30

/**
 * Hook to manage session timeout with warnings
 * For a 70-attorney firm, proper session management is critical for security
 */
export function useSessionTimeout(config: SessionTimeoutConfig = {}) {
  const { isAuthenticated, logout } = useAuthStore()
  const [showWarning, setShowWarning] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  
  const warningMinutes = config.warningMinutes ?? DEFAULT_WARNING_MINUTES
  const timeoutMinutes = config.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES
  
  const lastActivityRef = useRef<number>(Date.now())
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const logoutTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Reset activity timestamp on user actions
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    setShowWarning(false)
    
    // Clear existing timeouts
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current)
    if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    
    // Set new timeouts
    const warningDelay = (timeoutMinutes - warningMinutes) * 60 * 1000
    const logoutDelay = timeoutMinutes * 60 * 1000
    
    warningTimeoutRef.current = setTimeout(() => {
      setShowWarning(true)
      setRemainingSeconds(warningMinutes * 60)
      config.onWarning?.()
      
      // Start countdown
      countdownIntervalRef.current = setInterval(() => {
        setRemainingSeconds(prev => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }, warningDelay)
    
    logoutTimeoutRef.current = setTimeout(() => {
      config.onTimeout?.()
      logout()
    }, logoutDelay)
  }, [timeoutMinutes, warningMinutes, config, logout])
  
  // Extend session (user clicked "Stay logged in")
  const extendSession = useCallback(() => {
    resetActivity()
  }, [resetActivity])
  
  // Track user activity
  useEffect(() => {
    if (!isAuthenticated) return
    
    const activityEvents = [
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'mousemove'
    ]
    
    // Throttle activity tracking to avoid excessive updates
    let lastUpdate = 0
    const throttledReset = () => {
      const now = Date.now()
      if (now - lastUpdate > 60000) { // Only update once per minute
        lastUpdate = now
        resetActivity()
      }
    }
    
    activityEvents.forEach(event => {
      window.addEventListener(event, throttledReset, { passive: true })
    })
    
    // Initial setup
    resetActivity()
    
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, throttledReset)
      })
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current)
      if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current)
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    }
  }, [isAuthenticated, resetActivity])
  
  // Format remaining time for display
  const formatRemainingTime = () => {
    const minutes = Math.floor(remainingSeconds / 60)
    const seconds = remainingSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }
  
  return {
    showWarning,
    remainingSeconds,
    remainingTimeFormatted: formatRemainingTime(),
    extendSession,
    dismissWarning: () => setShowWarning(false)
  }
}
