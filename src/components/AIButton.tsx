import { Sparkles, Loader2, X } from 'lucide-react'
import { useAIChat } from '../contexts/AIChatContext'
import styles from './AIButton.module.css'

interface AIButtonProps {
  context?: string
  contextData?: any
  onInsight?: (insight: string) => void
  variant?: 'button' | 'icon' | 'inline'
  size?: 'sm' | 'md' | 'lg'
  label?: string
  prompts?: { label: string; prompt: string }[]
}

export function AIButton({ 
  context: _context, 
  contextData: _contextData, 
  onInsight: _onInsight, 
  variant = 'button',
  size = 'md',
  label = 'AI Assist',
  prompts: _prompts
}: AIButtonProps) {
  const { openChat } = useAIChat()

  const buttonClass = `${styles.aiButton} ${styles[variant]} ${styles[size]}`

  return (
    <div className={styles.aiButtonWrapper}>
      <button 
        className={buttonClass}
        onClick={() => openChat()}
        title="Open AI Assistant"
      >
        <Sparkles size={variant === 'icon' ? 16 : 18} />
        {variant !== 'icon' && <span>{label}</span>}
      </button>
    </div>
  )
}

// Inline AI suggestion component
interface AIInlineSuggestionProps {
  suggestion: string
  onAccept: () => void
  onDismiss: () => void
}

export function AIInlineSuggestion({ suggestion, onAccept, onDismiss }: AIInlineSuggestionProps) {
  return (
    <div className={styles.inlineSuggestion}>
      <div className={styles.suggestionIcon}>
        <Sparkles size={14} />
      </div>
      <div className={styles.suggestionContent}>
        <span className={styles.suggestionLabel}>AI Suggestion</span>
        <p>{suggestion}</p>
      </div>
      <div className={styles.suggestionActions}>
        <button onClick={onAccept} className={styles.acceptBtn}>Accept</button>
        <button onClick={onDismiss} className={styles.dismissBtn}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// AI Status indicator
interface AIStatusProps {
  status: 'ready' | 'analyzing' | 'complete'
  message?: string
}

export function AIStatus({ status, message }: AIStatusProps) {
  return (
    <div className={`${styles.aiStatus} ${styles[status]}`}>
      {status === 'analyzing' ? (
        <Loader2 size={14} className={styles.spinner} />
      ) : (
        <Sparkles size={14} />
      )}
      <span>{message || (status === 'ready' ? 'AI Ready' : status === 'analyzing' ? 'Analyzing...' : 'Analysis Complete')}</span>
    </div>
  )
}
