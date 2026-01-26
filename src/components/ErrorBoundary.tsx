import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#1a1a2e',
          color: '#fff',
          borderRadius: '8px',
          margin: '20px',
          minHeight: '300px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px'
        }}>
          <div style={{ fontSize: '48px' }}>⚠️</div>
          <h2 style={{ margin: 0, color: '#f59e0b' }}>Something went wrong</h2>
          <p style={{ color: '#94a3b8', maxWidth: '500px' }}>
            An error occurred while loading this page. This has been logged for investigation.
          </p>
          {this.state.error && (
            <details style={{ 
              background: '#0f0f1a', 
              padding: '15px', 
              borderRadius: '6px',
              maxWidth: '600px',
              width: '100%',
              textAlign: 'left'
            }}>
              <summary style={{ cursor: 'pointer', color: '#64748b', marginBottom: '10px' }}>
                Error Details (for developers)
              </summary>
              <pre style={{ 
                color: '#ef4444', 
                fontSize: '12px', 
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack && (
                  <>{'\n\nComponent Stack:'}{this.state.errorInfo.componentStack}</>
                )}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '10px 24px',
                background: '#f59e0b',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px',
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
