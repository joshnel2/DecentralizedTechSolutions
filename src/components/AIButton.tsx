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

    // Simulate AI response
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000))

    const insights: Record<string, string[]> = {
      'Summarize': [
        `Based on the ${context} data, here's a comprehensive summary:\n\n• Primary focus areas have shown consistent progress over the review period\n• Key stakeholders are aligned on objectives and timelines\n• Resource allocation is optimized for current workload\n• No critical blockers identified at this time`,
        `Summary of ${context}:\n\n• Status: On track with established milestones\n• Recent activity indicates positive momentum\n• Documentation is current and well-organized\n• Stakeholder communication has been effective`,
        `${context} Overview:\n\n• All key deliverables are progressing as expected\n• Team collaboration has been excellent\n• Budget remains within allocated parameters\n• Next review scheduled per standard timeline`
      ],
      'Key Points': [
        `Key points identified in ${context}:\n\n1. **Priority Items**: Focus on high-impact deliverables\n2. **Timeline**: Critical dates are approaching - plan accordingly\n3. **Dependencies**: External factors may influence outcomes\n4. **Resources**: Current allocation is sufficient\n5. **Risks**: Minor risks identified, mitigation in place`,
        `Critical insights from ${context}:\n\n1. **Performance**: Metrics show positive trends\n2. **Compliance**: All requirements met\n3. **Efficiency**: Process improvements implemented\n4. **Quality**: Standards maintained throughout\n5. **Communication**: Stakeholder updates on schedule`
      ],
      'Action Items': [
        `Recommended action items for ${context}:\n\n☐ Review and update documentation by end of week\n☐ Schedule follow-up meeting with stakeholders\n☐ Complete pending approvals\n☐ Update status in tracking system\n☐ Prepare summary report for leadership`,
        `Next steps identified:\n\n☐ Finalize outstanding deliverables\n☐ Conduct quality review\n☐ Update project timeline as needed\n☐ Communicate updates to relevant parties\n☐ Archive completed materials`
      ],
      'Risk Analysis': [
        `Risk assessment for ${context}:\n\n**High Priority:**\n• Timeline pressure - ensure buffer for unexpected delays\n\n**Medium Priority:**\n• Resource availability during peak periods\n• External dependencies need monitoring\n\n**Low Priority:**\n• Minor process inefficiencies identified\n\n**Mitigation:** Regular check-ins and proactive communication recommended`,
        `Potential concerns identified:\n\n**Critical:** None at this time\n\n**Watch Items:**\n• Market conditions may affect timeline\n• Stakeholder availability for key decisions\n• Technical requirements may evolve\n\n**Recommendations:** Maintain contingency plans and regular monitoring`
      ],
      'Recommendations': [
        `AI recommendations for ${context}:\n\n1. **Process Optimization**: Consider streamlining approval workflows\n2. **Communication**: Increase frequency of status updates\n3. **Documentation**: Enhance record-keeping practices\n4. **Planning**: Build additional buffer into timelines\n5. **Review**: Schedule periodic retrospectives`,
        `Strategic recommendations:\n\n1. **Efficiency**: Automate repetitive tasks where possible\n2. **Quality**: Implement additional review checkpoints\n3. **Collaboration**: Enhance cross-functional coordination\n4. **Visibility**: Improve reporting dashboards\n5. **Learning**: Document lessons learned for future reference`
      ]
    }

    const options = insights[promptType] || insights['Summarize']
    const response = options[Math.floor(Math.random() * options.length)]
    
    setResult(response)
    setIsLoading(false)
    if (onInsight) onInsight(response)
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
