import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Loader2, Copy, Check, RefreshCw, ChevronDown } from 'lucide-react'
import styles from './AIButton.module.css'

interface AIButtonProps {
  context: string
  contextData?: any
  onInsight?: (insight: string) => void
  variant?: 'button' | 'icon' | 'inline'
  size?: 'sm' | 'md' | 'lg'
  label?: string
  prompts?: { label: string; prompt: string }[]
}

const defaultPrompts = [
  { label: 'Summarize', prompt: 'Provide a concise summary' },
  { label: 'Key Points', prompt: 'Extract key points and insights' },
  { label: 'Action Items', prompt: 'Identify action items and next steps' },
  { label: 'Risk Analysis', prompt: 'Analyze potential risks and concerns' },
  { label: 'Recommendations', prompt: 'Provide recommendations' }
]

export function AIButton({ 
  context, 
  contextData, 
  onInsight, 
  variant = 'button',
  size = 'md',
  label = 'AI Assist',
  prompts = defaultPrompts
}: AIButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        if (!isLoading) setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isLoading])

  const generateInsight = async (promptType: string) => {
    setIsLoading(true)
    setSelectedPrompt(promptType)
    setResult(null)

    const promptMessages: Record<string, string> = {
      'Summarize': `Provide a focused summary of ${context}. Be specific and reference actual data. Include current status, key metrics, and important details. Do not give generic advice.`,
      'Key Points': `Extract the most important points from ${context}. List 3-5 specific, actionable insights based on actual data. Be direct and reference real numbers or dates where available.`,
      'Action Items': `Based on ${context}, identify specific action items that need attention. List concrete next steps with priorities. Reference actual deadlines or pending items from the data.`,
      'Risk Analysis': `Analyze risks specific to ${context}. Identify HIGH/MEDIUM/LOW priority concerns based on actual data. Reference specific deadlines, gaps, or issues. Provide mitigation recommendations.`,
      'Recommendations': `Provide strategic recommendations for ${context}. Base suggestions on actual data patterns. Be specific about what actions to take and why. Prioritize by impact.`
    }

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${import.meta.env.VITE_API_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: promptMessages[promptType] || `Analyze ${context}. Be specific and stay focused on the actual data.`,
          page: 'general',
          context: contextData || {}
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const data = await response.json()
      setResult(data.response)
      if (onInsight) onInsight(data.response)
    } catch (error) {
      console.error('AI insight error:', error)
      setResult('Unable to generate insight. Please check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = () => {
    if (result) {
      navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const refresh = () => {
    if (selectedPrompt) {
      generateInsight(selectedPrompt)
    }
  }

  const buttonClass = `${styles.aiButton} ${styles[variant]} ${styles[size]}`

  return (
    <div className={styles.aiButtonWrapper} ref={panelRef}>
      <button 
        className={buttonClass}
        onClick={() => setIsOpen(!isOpen)}
        title="AI Assist"
      >
        <Sparkles size={variant === 'icon' ? 16 : 18} />
        {variant !== 'icon' && <span>{label}</span>}
      </button>

      {isOpen && (
        <div className={styles.aiPanel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <Sparkles size={18} />
              <span>AI Assistant</span>
            </div>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className={styles.panelContent}>
            {!result && !isLoading && (
              <>
                <p className={styles.contextLabel}>Analyzing: {context}</p>
                <div className={styles.promptGrid}>
                  {prompts.map(p => (
                    <button
                      key={p.label}
                      className={styles.promptBtn}
                      onClick={() => generateInsight(p.label)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {isLoading && (
              <div className={styles.loadingState}>
                <Loader2 size={24} className={styles.spinner} />
                <span>Analyzing {context}...</span>
                <div className={styles.loadingDots}>
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}

            {result && !isLoading && (
              <div className={styles.resultContainer}>
                <div className={styles.resultHeader}>
                  <span className={styles.resultLabel}>{selectedPrompt}</span>
                  <div className={styles.resultActions}>
                    <button onClick={refresh} title="Regenerate">
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={copyToClipboard} title="Copy">
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                <div className={styles.resultText}>
                  {result.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
                <button 
                  className={styles.newQueryBtn}
                  onClick={() => { setResult(null); setSelectedPrompt(null); }}
                >
                  New Query
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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
