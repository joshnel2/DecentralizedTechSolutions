/**
 * ConnectionStatus Component
 * Shows real-time connection status indicator in the UI
 */

import { useState, useEffect, useCallback } from 'react'
import { WifiOff, RefreshCw, Cloud, CloudOff, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import styles from './ConnectionStatus.module.css'

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error'

interface ConnectionStatusProps {
  className?: string
  showLabel?: boolean
  position?: 'inline' | 'fixed'
}

// Simple connection monitoring - checks API health
export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionState>('connecting')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const checkConnection = useCallback(async () => {
    try {
      // Try to fetch a lightweight endpoint
      const response = await fetch('/api/health', { 
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000)
      })
      
      if (response.ok) {
        setStatus('connected')
        setRetryCount(0)
      } else {
        setStatus('error')
      }
    } catch (error) {
      if (retryCount < 3) {
        setStatus('connecting')
      } else {
        setStatus('disconnected')
      }
      setRetryCount(prev => prev + 1)
    }
    setLastChecked(new Date())
  }, [retryCount])

  // Check connection on mount and periodically
  useEffect(() => {
    checkConnection()
    
    const interval = setInterval(checkConnection, 30000) // Every 30 seconds
    
    // Also check when coming back online
    const handleOnline = () => {
      setStatus('connecting')
      checkConnection()
    }
    const handleOffline = () => setStatus('disconnected')
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [checkConnection])

  const retry = useCallback(() => {
    setStatus('connecting')
    setRetryCount(0)
    checkConnection()
  }, [checkConnection])

  return { status, lastChecked, retry }
}

export function ConnectionStatus({ 
  className, 
  showLabel = true, 
  position = 'inline' 
}: ConnectionStatusProps) {
  const { status, retry } = useConnectionStatus()
  
  const getIcon = () => {
    switch (status) {
      case 'connected':
        return <Cloud size={14} />
      case 'connecting':
        return <Loader2 size={14} className={styles.spin} />
      case 'disconnected':
        return <CloudOff size={14} />
      case 'error':
        return <WifiOff size={14} />
    }
  }
  
  const getLabel = () => {
    switch (status) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'disconnected':
        return 'Offline'
      case 'error':
        return 'Connection Error'
    }
  }

  return (
    <div 
      className={clsx(
        styles.status, 
        styles[status],
        position === 'fixed' && styles.fixed,
        className
      )}
      onClick={status !== 'connected' && status !== 'connecting' ? retry : undefined}
      role={status !== 'connected' ? 'button' : undefined}
      title={status !== 'connected' ? 'Click to retry connection' : 'Connected to server'}
    >
      <span className={styles.indicator}>{getIcon()}</span>
      {showLabel && <span className={styles.label}>{getLabel()}</span>}
      {(status === 'disconnected' || status === 'error') && (
        <RefreshCw size={12} className={styles.retryIcon} />
      )}
    </div>
  )
}

// Banner version for showing at top when disconnected
export function ConnectionBanner() {
  const { status, retry } = useConnectionStatus()
  
  if (status === 'connected') return null
  
  return (
    <div className={clsx(styles.banner, styles[status])}>
      <div className={styles.bannerContent}>
        {status === 'connecting' ? (
          <>
            <Loader2 size={16} className={styles.spin} />
            <span>Reconnecting to server...</span>
          </>
        ) : (
          <>
            <WifiOff size={16} />
            <span>Connection lost. Some features may be unavailable.</span>
            <button onClick={retry} className={styles.retryBtn}>
              <RefreshCw size={14} />
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  )
}
