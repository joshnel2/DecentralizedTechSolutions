import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'
import styles from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorCount: number
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 * Essential for law firm applications where data integrity is critical
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorCount: 0
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    this.setState(prevState => ({ 
      errorInfo,
      errorCount: prevState.errorCount + 1
    }))
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)
    
    // Log to external service in production
    if (import.meta.env.PROD) {
      this.logErrorToService(error, errorInfo)
    }
  }

  logErrorToService(error: Error, errorInfo: ErrorInfo) {
    // In production, send to error tracking service
    try {
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      }
      
      // Fire and forget - don't block on error logging
      fetch('/api/errors/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorReport),
      }).catch(() => {
        // Silently fail error logging
      })
    } catch {
      // Silently fail
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      const { error, errorInfo, errorCount } = this.state
      const showDetails = import.meta.env.DEV

      return (
        <div className={styles.errorContainer}>
          <div className={styles.errorCard}>
            <div className={styles.errorIcon}>
              <AlertTriangle size={48} />
            </div>
            
            <h1 className={styles.errorTitle}>Something went wrong</h1>
            <p className={styles.errorMessage}>
              We apologize for the inconvenience. An unexpected error has occurred.
            </p>
            
            {errorCount > 2 && (
              <div className={styles.persistentError}>
                <Bug size={16} />
                <span>This error has occurred {errorCount} times. Consider refreshing the page.</span>
              </div>
            )}
            
            <div className={styles.errorActions}>
              <button 
                className={styles.primaryBtn}
                onClick={this.handleRetry}
              >
                <RefreshCw size={16} />
                Try Again
              </button>
              
              <button 
                className={styles.secondaryBtn}
                onClick={this.handleGoHome}
              >
                <Home size={16} />
                Go to Dashboard
              </button>
            </div>
            
            {showDetails && error && (
              <details className={styles.errorDetails}>
                <summary>Technical Details (Development Only)</summary>
                <div className={styles.errorStack}>
                  <strong>Error:</strong> {error.message}
                  <pre>{error.stack}</pre>
                  {errorInfo?.componentStack && (
                    <>
                      <strong>Component Stack:</strong>
                      <pre>{errorInfo.componentStack}</pre>
                    </>
                  )}
                </div>
              </details>
            )}
            
            <p className={styles.supportText}>
              If this problem persists, please contact support with error reference: 
              <code>{Date.now().toString(36).toUpperCase()}</code>
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Async Error Boundary for async operations
 */
interface AsyncErrorBoundaryProps {
  children: ReactNode
}

interface AsyncErrorBoundaryState {
  error: Error | null
}

export class AsyncErrorBoundary extends Component<AsyncErrorBoundaryProps, AsyncErrorBoundaryState> {
  constructor(props: AsyncErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AsyncErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.error) {
      return (
        <div className={styles.asyncError}>
          <AlertTriangle size={20} />
          <span>Failed to load this section. Please refresh the page.</span>
          <button onClick={() => window.location.reload()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
