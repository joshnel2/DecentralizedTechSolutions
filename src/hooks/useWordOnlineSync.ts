import { useState, useEffect, useCallback, useRef } from 'react'
import { wordOnlineApi } from '../services/api'

interface SyncState {
  isSyncing: boolean
  lastSyncAt: Date | null
  lastSyncVersion: number | null
  hasChanges: boolean
  error: string | null
}

interface UseWordOnlineSyncOptions {
  documentId: string | null
  enabled?: boolean
  pollInterval?: number // ms between polls (default 30s)
  onVersionCreated?: (versionNumber: number) => void
}

/**
 * Hook to automatically sync changes from Word Online/Desktop back to Apex
 * When a user edits a document in Word, this hook polls OneDrive for changes
 * and creates new versions in Apex when changes are detected.
 */
export function useWordOnlineSync(options: UseWordOnlineSyncOptions) {
  const { 
    documentId, 
    enabled = true, 
    pollInterval = 30000,
    onVersionCreated 
  } = options
  
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSyncAt: null,
    lastSyncVersion: null,
    hasChanges: false,
    error: null
  })
  
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)
  
  // Poll for changes and sync if detected
  const pollAndSync = useCallback(async () => {
    if (!documentId || isPollingRef.current) return
    
    isPollingRef.current = true
    
    try {
      const result = await wordOnlineApi.pollSync(documentId)
      
      if (result.synced && result.versionNumber) {
        setSyncState(prev => ({
          ...prev,
          lastSyncAt: new Date(),
          lastSyncVersion: result.versionNumber,
          hasChanges: false,
          error: null
        }))
        
        if (onVersionCreated) {
          onVersionCreated(result.versionNumber)
        }
      } else if (result.hasChanges) {
        setSyncState(prev => ({
          ...prev,
          hasChanges: true
        }))
      }
    } catch (err: any) {
      // Don't show error for 404 (no graph item) or token errors
      if (err.status !== 404 && !err.message?.includes('token')) {
        console.error('Word sync poll error:', err)
        setSyncState(prev => ({
          ...prev,
          error: err.message || 'Sync failed'
        }))
      }
    } finally {
      isPollingRef.current = false
    }
  }, [documentId, onVersionCreated])
  
  // Manual sync trigger
  const syncNow = useCallback(async () => {
    if (!documentId) return { success: false, error: 'No document' }
    
    setSyncState(prev => ({ ...prev, isSyncing: true, error: null }))
    
    try {
      const result = await wordOnlineApi.saveFromWord(documentId)
      
      if (result.saved) {
        setSyncState(prev => ({
          ...prev,
          isSyncing: false,
          lastSyncAt: new Date(),
          lastSyncVersion: result.versionNumber,
          hasChanges: false,
          error: null
        }))
        
        if (onVersionCreated) {
          onVersionCreated(result.versionNumber)
        }
        
        return { success: true, versionNumber: result.versionNumber }
      } else {
        setSyncState(prev => ({
          ...prev,
          isSyncing: false,
          hasChanges: false
        }))
        return { success: true, message: result.message || 'No changes to sync' }
      }
    } catch (err: any) {
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        error: err.message || 'Sync failed'
      }))
      return { success: false, error: err.message }
    }
  }, [documentId, onVersionCreated])
  
  // Start polling
  const startPolling = useCallback(() => {
    if (pollRef.current) return
    
    // Poll immediately on start
    pollAndSync()
    
    // Then poll at interval
    pollRef.current = setInterval(pollAndSync, pollInterval)
  }, [pollAndSync, pollInterval])
  
  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])
  
  // Auto-start/stop polling based on enabled flag
  useEffect(() => {
    if (enabled && documentId) {
      startPolling()
    } else {
      stopPolling()
    }
    
    return () => stopPolling()
  }, [enabled, documentId, startPolling, stopPolling])
  
  // Refresh token periodically for long editing sessions
  useEffect(() => {
    if (!enabled || !documentId) return
    
    // Refresh token every 45 minutes (tokens expire after 1 hour)
    const tokenRefreshInterval = setInterval(async () => {
      try {
        await wordOnlineApi.refreshToken()
      } catch (err) {
        console.log('Token refresh skipped:', err)
      }
    }, 45 * 60 * 1000)
    
    return () => clearInterval(tokenRefreshInterval)
  }, [enabled, documentId])
  
  return {
    ...syncState,
    syncNow,
    startPolling,
    stopPolling,
    isPolling: !!pollRef.current
  }
}
