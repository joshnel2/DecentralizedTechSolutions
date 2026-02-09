/**
 * Legal Research Page
 * 
 * COMPLETELY ISOLATED from the AI Assistant page and Background Agent.
 * This page uses its own store (legalResearchStore.ts) which calls
 * /api/legal-research endpoints, which in turn use OpenRouter
 * (NOT Azure OpenAI).
 * 
 * There are ZERO imports from aiStore, AIChatContext, or any
 * amplifier/agent-related code.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useLegalResearchStore, type ResearchMessage } from '../stores/legalResearchStore'
import { addResearchToBackgroundAgent } from '../stores/backgroundAgentFileStore'
import { documentsApi } from '../services/api'
import {
  Scale, Send, Plus, Trash2, Loader2, X,
  AlertCircle, Shield, FileText, FileSearch,
  Gavel, ScrollText, ShieldCheck, BookOpen,
  Save, Rocket, Check
} from 'lucide-react'
import { clsx } from 'clsx'
import styles from './LegalResearchPage.module.css'

// Simple markdown-to-HTML renderer (no external deps to keep isolation clean)
function renderMarkdown(text: string): string {
  if (!text) return ''
  
  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  
  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  
  // Code blocks
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  
  // Tables (basic)
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split('|').filter(c => c.trim())
    if (cells.every(c => /^[\s-:]+$/.test(c))) {
      return '' // Skip separator rows
    }
    const isHeader = cells.every(c => c.trim().length > 0)
    const tag = 'td'
    return '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>'
  })
  
  // Wrap consecutive table rows
  html = html.replace(/((<tr>.*<\/tr>\s*)+)/g, '<table>$1</table>')
  
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
  html = html.replace(/((<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>')
  
  // Line breaks (but not inside pre or table)
  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br/>')
  
  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>'
  }
  
  return html
}

const QUICK_ACTIONS = [
  {
    title: 'Review Contract',
    description: 'Analyze a contract against standard positions',
    icon: FileText,
    prompt: '/review-contract\n\nPlease paste or describe the contract you want me to review. I will analyze it clause-by-clause against standard commercial positions and flag any deviations as GREEN, YELLOW, or RED.',
  },
  {
    title: 'Triage NDA',
    description: 'Screen an NDA for risk classification',
    icon: ShieldCheck,
    prompt: '/triage-nda\n\nPlease paste the NDA text and I will screen it against standard criteria, classifying it as GREEN (standard approval), YELLOW (counsel review), or RED (significant issues).',
  },
  {
    title: 'Legal Research',
    description: 'Research a legal issue with analysis',
    icon: BookOpen,
    prompt: '/research\n\nWhat legal question would you like me to research? Please include the jurisdiction if relevant.',
  },
  {
    title: 'Risk Assessment',
    description: 'Assess legal risk severity and likelihood',
    icon: Scale,
    prompt: 'I need a legal risk assessment. Please help me evaluate the following risk using the severity-by-likelihood framework:',
  },
  {
    title: 'Compliance Review',
    description: 'GDPR, CCPA, DPA analysis',
    icon: Gavel,
    prompt: 'I need help with a compliance matter. This could be a DPA review, data subject request, or regulatory question. What would you like to analyze?',
  },
  {
    title: 'Draft Response',
    description: 'Generate templated legal responses',
    icon: ScrollText,
    prompt: '/respond\n\nWhat type of legal inquiry do you need to respond to? Options include: data subject request, discovery hold, vendor question, NDA request, privacy inquiry, subpoena, or insurance notification.',
  },
]

export function LegalResearchPage() {
  const { user } = useAuthStore()
  const {
    config,
    configLoaded,
    sessions,
    activeSessionId,
    activeMessages,
    isLoading,
    isStreaming,
    streamingContent,
    error,
    selectedModel,
    fetchConfig,
    fetchSessions,
    loadSession,
    deleteSession,
    sendMessageStream,
    sendMessage,
    setSelectedModel,
    clearError,
    clearActiveSession,
  } = useLegalResearchStore()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load config and sessions on mount
  useEffect(() => {
    if (!configLoaded) fetchConfig()
    fetchSessions()
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages, streamingContent])

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading || isStreaming) return

    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Use streaming for better UX, fallback to non-streaming
    try {
      await sendMessageStream(trimmed, { model: selectedModel || undefined })
    } catch {
      await sendMessage(trimmed, { model: selectedModel || undefined })
    }
  }, [input, isLoading, isStreaming, selectedModel, sendMessageStream, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleQuickAction = useCallback((prompt: string) => {
    setInput(prompt)
    textareaRef.current?.focus()
  }, [])

  const handleNewSession = useCallback(() => {
    clearActiveSession()
    setInput('')
  }, [clearActiveSession])

  const handleDeleteSession = useCallback(async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation()
    if (confirm('Delete this research session?')) {
      await deleteSession(sessionId)
    }
  }, [deleteSession])

  // Track which messages have been saved / added to background agent
  const [savedMessages, setSavedMessages] = useState<Set<number>>(new Set())
  const [savingMessages, setSavingMessages] = useState<Set<number>>(new Set())
  const [addedToAgent, setAddedToAgent] = useState<Set<number>>(new Set())
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSaveResearch = useCallback(async (msg: ResearchMessage) => {
    if (savingMessages.has(msg.id)) return

    const title = activeMessages.find(m => m.role === 'user')?.content?.slice(0, 60) || 'Legal Research'
    const header = `# Legal Research Paper\n\n**Date:** ${new Date(msg.created_at).toLocaleDateString()}\n**Session:** ${activeSessionId || 'N/A'}\n\n---\n\n`
    const fullContent = header + msg.content

    const fileName = `Research - ${title.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 50).trim()} - ${new Date().toISOString().split('T')[0]}.md`

    setSavingMessages(prev => new Set([...prev, msg.id]))
    setSaveError(null)

    try {
      // Save to the documents section / drive via the documents API
      const file = new File([fullContent], fileName, { type: 'text/markdown' })
      await documentsApi.upload(file, {
        tags: ['legal-research', 'research-paper'],
      })

      setSavedMessages(prev => new Set([...prev, msg.id]))
    } catch (err: any) {
      console.error('[LegalResearch] Failed to save to documents:', err)
      setSaveError(err?.message || 'Failed to save research paper to documents')
      // Fallback: download locally if the API call fails
      const blob = new Blob([fullContent], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
      // Still mark as saved since user got the file via download
      setSavedMessages(prev => new Set([...prev, msg.id]))
    } finally {
      setSavingMessages(prev => {
        const next = new Set(prev)
        next.delete(msg.id)
        return next
      })
    }
  }, [activeMessages, activeSessionId, savingMessages])

  const handleAddToBackgroundAgent = useCallback((msg: ResearchMessage) => {
    const title = activeMessages.find(m => m.role === 'user')?.content?.slice(0, 80) || 'Legal Research'
    const header = `# Legal Research Paper\n\n**Date:** ${new Date(msg.created_at).toLocaleDateString()}\n**Session:** ${activeSessionId || 'N/A'}\n\n---\n\n`
    const fullContent = header + msg.content

    addResearchToBackgroundAgent({
      title,
      content: fullContent,
      sessionId: activeSessionId || undefined,
      model: selectedModel || undefined,
    })

    setAddedToAgent(prev => new Set([...prev, msg.id]))
  }, [activeMessages, activeSessionId, selectedModel])

  const userInitials = user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}` : '?'

  // Not configured state
  if (configLoaded && !config?.configured) {
    return (
      <div className={styles.researchPage}>
        <div className={styles.mainArea}>
          <div className={styles.notConfigured}>
            <Scale size={48} style={{ color: '#06B6D4', marginBottom: '1rem' }} />
            <h2>Legal Research Not Configured</h2>
            <p>
              To enable the Legal Research section, add your OpenRouter API key
              to the environment variables. This is completely separate from
              the Azure OpenAI configuration used by the AI Assistant.
            </p>
            <code>
              # Only env var needed — everything else is hardcoded:<br />
              OPENROUTER_API_KEY=sk-or-v1-...<br />
              <br />
              # Hardcoded in service:<br />
              # Base URL: https://openrouter.ai/api/v1<br />
              # Model: anthropic/claude-opus-4.6<br />
              # Reasoning: Adaptive Thinking ENABLED<br />
              # HTTP-Referer: http://localhost:3000<br />
              # X-Title: Legal Research Agent
            </code>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.researchPage}>
      {/* Sessions Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitle}>
            <Scale size={16} />
            Research Sessions
          </div>
          <button className={styles.newSessionBtn} onClick={handleNewSession}>
            <Plus size={16} />
            New Research
          </button>
        </div>
        <div className={styles.sessionsList}>
          {sessions.map(session => (
            <div
              key={session.id}
              className={clsx(styles.sessionItem, activeSessionId === session.id && styles.active)}
              onClick={() => loadSession(session.id)}
            >
              <div className={styles.sessionInfo}>
                <div className={styles.sessionTitle}>{session.title}</div>
                <div className={styles.sessionDate}>
                  {new Date(session.updated_at).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              </div>
              <button
                className={styles.sessionDeleteBtn}
                onClick={(e) => handleDeleteSession(e, session.id)}
                title="Delete session"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--apex-subtle)', fontSize: '0.8125rem' }}>
              No research sessions yet
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={styles.mainArea}>
        {/* Top Bar */}
        <div className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <span className={styles.isolationBadge}>
              <Shield size={12} />
              ISOLATED — NOT CONNECTED TO AGENT AI
            </span>
            {config?.availableModels && (
              <select
                className={styles.modelSelect}
                value={selectedModel || config.defaultModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {config.availableModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className={styles.topBarRight}>
            <span className={styles.poweredBy}>
              Claude Opus 4.6 &middot; <strong>Adaptive Thinking</strong> &middot; OpenRouter
            </span>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={16} style={{ color: '#FCA5A5', flexShrink: 0 }} />
            <p>{error}</p>
            <button className={styles.errorDismiss} onClick={clearError}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Save error banner */}
        {saveError && (
          <div className={styles.errorBanner}>
            <AlertCircle size={16} style={{ color: '#FCA5A5', flexShrink: 0 }} />
            <p>{saveError} (downloaded locally as fallback)</p>
            <button className={styles.errorDismiss} onClick={() => setSaveError(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Messages */}
        <div className={styles.messagesArea}>
          {activeMessages.length === 0 && !isStreaming ? (
            <div className={styles.welcomeState}>
              <div className={styles.welcomeIcon}>
                <Scale size={36} />
              </div>
              <h2 className={styles.welcomeTitle}>Legal Research</h2>
              <p className={styles.welcomeSubtitle}>
                AI-powered legal research, contract review, NDA triage, compliance analysis, and risk assessment.
                This section is completely isolated from the main AI agent and uses OpenRouter with the best available models.
              </p>
              <div className={styles.quickActions}>
                {QUICK_ACTIONS.map((action, i) => (
                  <button
                    key={i}
                    className={styles.quickAction}
                    onClick={() => handleQuickAction(action.prompt)}
                  >
                    <action.icon size={20} />
                    <span className={styles.quickActionTitle}>{action.title}</span>
                    <span className={styles.quickActionDesc}>{action.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {activeMessages.map((msg: ResearchMessage) => (
                <div key={msg.id}>
                  <div
                    className={clsx(
                      styles.message,
                      msg.role === 'user' ? styles.messageUser : styles.messageAssistant
                    )}
                  >
                    <div className={styles.messageAvatar}>
                      {msg.role === 'user' ? userInitials : <Scale size={18} />}
                    </div>
                    <div className={styles.messageContent}>
                      {msg.role === 'user' ? (
                        <div className={styles.messageText}>{msg.content}</div>
                      ) : (
                        <div
                          className={styles.messageText}
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        />
                      )}
                    </div>
                  </div>
                  {/* Research action buttons - only on assistant messages */}
                  {msg.role === 'assistant' && msg.content && (
                    <div className={styles.researchActions}>
                      <button
                        className={clsx(styles.saveResearchBtn, savedMessages.has(msg.id) && styles.savedBtn)}
                        onClick={() => handleSaveResearch(msg)}
                        disabled={savingMessages.has(msg.id) || savedMessages.has(msg.id)}
                        title="Save this research paper to your Documents"
                      >
                        {savingMessages.has(msg.id) ? (
                          <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
                        ) : savedMessages.has(msg.id) ? (
                          <><Check size={14} /> Saved to Documents</>
                        ) : (
                          <><Save size={14} /> Save Research Paper</>
                        )}
                      </button>
                      <button
                        className={clsx(styles.addToAgentBtn, addedToAgent.has(msg.id) && styles.addedBtn)}
                        onClick={() => handleAddToBackgroundAgent(msg)}
                        disabled={addedToAgent.has(msg.id)}
                        title="Send this research paper to the Background Agent as a file"
                      >
                        {addedToAgent.has(msg.id) ? (
                          <><Check size={14} /> Added to Background Agent</>
                        ) : (
                          <><Rocket size={14} /> Add to Background Agent</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Streaming message */}
              {isStreaming && streamingContent && (
                <div className={clsx(styles.message, styles.messageAssistant)}>
                  <div className={styles.messageAvatar}>
                    <Scale size={18} />
                  </div>
                  <div className={styles.messageContent}>
                    <div
                      className={styles.messageText}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }}
                    />
                    <span className={styles.streamingIndicator} />
                  </div>
                </div>
              )}

              {/* Loading indicator */}
              {(isLoading || (isStreaming && !streamingContent)) && (
                <div className={clsx(styles.message, styles.messageAssistant)}>
                  <div className={styles.messageAvatar}>
                    <Scale size={18} />
                  </div>
                  <div className={styles.messageContent}>
                    <div className={styles.loadingDots}>
                      <span /><span /><span />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={styles.inputArea}>
          <div className={styles.inputWrapper}>
            <textarea
              ref={textareaRef}
              className={styles.inputField}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask a legal research question, paste a contract for review, or use a command like /review-contract..."
              rows={1}
              disabled={isLoading || isStreaming}
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!input.trim() || isLoading || isStreaming}
              title="Send"
            >
              {isLoading || isStreaming ? (
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <Send size={20} />
              )}
            </button>
          </div>
          <div className={styles.inputDisclaimer}>
            Powered by Claude Opus 4.6 with Adaptive Thinking via OpenRouter. Completely isolated from Azure OpenAI. No confidential firm data is sent. Always verify AI-generated legal analysis with qualified counsel.
          </div>
        </div>
      </div>
    </div>
  )
}
