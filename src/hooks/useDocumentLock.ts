import { useState, useEffect, useCallback, useRef } from 'react'
import { driveApi } from '../services/api'

interface LockState {
  locked: boolean
  lockId?: string
  lockedBy?: string
  lockedByName?: string
  lockType?: string
  lockedAt?: string
  expiresAt?: string
  isOwnLock?: boolean
}

interface UseDocumentLockOptions {
  documentId: string
  autoLock?: boolean // Automatically acquire lock
  heartbeatInterval?: number // ms between heartbeats (default 30s)
}

export function useDocumentLock(options: UseDocumentLockOptions) {
  const { documentId, autoLock = false, heartbeatInterval = 30000 } = options
  
  const [lockState, setLockState] = useState<LockState>({ locked: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  
  // Check lock status
  const checkLock = useCallback(async () => {
    try {
      const result = await driveApi.getLockStatus(documentId)
      setLockState(result)
      return result
    } catch (err: any) {
      console.error('Failed to check lock status:', err)
      return { locked: false }
    }
  }, [documentId])
  
  // Acquire lock
  const acquireLock = useCallback(async (lockType: string = 'edit') => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await driveApi.acquireLock(documentId, lockType, sessionIdRef.current || undefined)
      
      if (result.lockId) {
        sessionIdRef.current = result.sessionId
        setLockState({
          locked: true,
          lockId: result.lockId,
          expiresAt: result.expiresAt,
          isOwnLock: true,
        })
        
        // Start heartbeat
        startHeartbeat()
        
        return { success: true, ...result }
      }
      
      return { success: result.extended, ...result }
    } catch (err: any) {
      if (err.status === 423) {
        // Document is locked by someone else
        setError(err.data?.message || 'Document is locked by another user')
        setLockState({
          locked: true,
          lockedByName: err.data?.lockedBy,
          lockedAt: err.data?.lockedAt,
          expiresAt: err.data?.expiresAt,
          isOwnLock: false,
        })
      } else {
        setError(err.message || 'Failed to acquire lock')
      }
      return { success: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }, [documentId])
  
  // Release lock
  const releaseLock = useCallback(async (reason: string = 'user_released') => {
    stopHeartbeat()
    
    try {
      await driveApi.releaseLock(documentId, reason)
      setLockState({ locked: false })
      sessionIdRef.current = null
      return { success: true }
    } catch (err: any) {
      console.error('Failed to release lock:', err)
      return { success: false, error: err.message }
    }
  }, [documentId])
  
  // Heartbeat to keep lock alive
  const startHeartbeat = useCallback(() => {
    stopHeartbeat()
    
    heartbeatRef.current = setInterval(async () => {
      try {
        const result = await driveApi.sendHeartbeat(documentId)
        if (result.expiresAt) {
          setLockState(prev => ({ ...prev, expiresAt: result.expiresAt }))
        }
      } catch (err) {
        console.error('Heartbeat failed:', err)
        // If heartbeat fails, the lock may have expired
        checkLock()
      }
    }, heartbeatInterval)
  }, [documentId, heartbeatInterval, checkLock])
  
  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [])
  
  // Auto-lock on mount if requested
  useEffect(() => {
    checkLock()
    
    if (autoLock) {
      acquireLock()
    }
    
    return () => {
      stopHeartbeat()
      // Release lock on unmount if we own it
      if (lockState.isOwnLock) {
        driveApi.releaseLock(documentId, 'connection_lost').catch(() => {})
      }
    }
  }, [documentId]) // Only run on mount and documentId change
  
  // Release lock on window unload
  useEffect(() => {
    const handleUnload = () => {
      if (lockState.isOwnLock) {
        // Use sendBeacon for reliable delivery on page close
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
        const token = localStorage.getItem('apex-access-token')
        
        navigator.sendBeacon(
          `${apiUrl}/drive/documents/${documentId}/lock/release`,
          new Blob([JSON.stringify({ reason: 'connection_lost' })], { type: 'application/json' })
        )
      }
    }
    
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [documentId, lockState.isOwnLock])
  
  return {
    lockState,
    loading,
    error,
    acquireLock,
    releaseLock,
    checkLock,
    
    // Convenience getters
    isLocked: lockState.locked,
    isOwnLock: lockState.isOwnLock,
    canEdit: !lockState.locked || lockState.isOwnLock,
    lockedByName: lockState.lockedByName,
  }
}

// Hook to just check lock status (no locking functionality)
export function useDocumentLockStatus(documentId: string | undefined) {
  const [lockState, setLockState] = useState<LockState>({ locked: false })
  const [loading, setLoading] = useState(false)
  
  useEffect(() => {
    if (!documentId) return
    
    const checkLock = async () => {
      setLoading(true)
      try {
        const result = await driveApi.getLockStatus(documentId)
        setLockState(result)
      } catch (err) {
        console.error('Failed to check lock:', err)
      } finally {
        setLoading(false)
      }
    }
    
    checkLock()
    
    // Poll for changes every 30 seconds
    const interval = setInterval(checkLock, 30000)
    return () => clearInterval(interval)
  }, [documentId])
  
  return { lockState, loading }
}
