import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, Send, X, Loader2, MessageSquare, ChevronRight } from 'lucide-react'
import { aiApi } from '../services/api'
import styles from './AIChat.module.css'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface AIChatProps {
  isOpen: boolean
  onClose: () => void
  additionalContext?: Record<string, any>
}

// Map routes to page names for context
function getPageFromPath(pathname: string): string {
  if (pathname === '/app' || pathname === '/app/') return 'dashboard'
  if (pathname.startsWith('/app/matters/')) return 'matter-detail'
  if (pathname === '/app/matters') return 'matters'
  if (pathname.startsWith('/app/clients/')) return 'client-detail'
  if (pathname === '/app/clients') return 'clients'
  if (pathname === '/app/billing') return 'billing'
  if (pathname === '/app/calendar') return 'calendar'
  if (pathname === '/app/time') return 'time-tracking'
  if (pathname === '/app/documents') return 'documents'
  if (pathname === '/app/team') return 'team'
  if (pathname === '/app/reports') return 'reports'
  if (pathname === '/app/analytics') return 'analytics'
  return 'general'
}

// Extract IDs from path for detail pages
function getContextFromPath(pathname: string): Record<string, any> {
  const matterMatch = pathname.match(/\/app\/matters\/([^/]+)/)
  if (matterMatch) return { matterId: matterMatch[1] }
  
  const clientMatch = pathname.match(/\/app\/clients\/([^/]+)/)
  if (clientMatch) return { clientId: clientMatch[1] }
  
  return {}
}

export function AIChat({ isOpen, onClose, additionalContext = {} }: AIChatProps) {
  const location = useLocation()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentPage = getPageFromPath(location.pathname)
  const pathContext = getContextFromPath(location.pathname)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Load suggestions when page changes
  useEffect(() => {
    if (isOpen) {
      aiApi.getSuggestions(currentPage)
        .then(data => setSuggestions(data.suggestions || []))
        .catch(() => setSuggestions([]))
    }
  }, [currentPage, isOpen])

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim()
    if (!text || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Build conversation history for context
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }))

      const response = await aiApi.chat(
        text,
        currentPage,
        { ...pathContext, ...additionalContext },
        conversationHistory
      )

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('AI chat error:', error)
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Sparkles size={20} className={styles.sparkle} />
            <span>AI Assistant</span>
          </div>
          <div className={styles.headerActions}>
            {messages.length > 0 && (
              <button onClick={clearChat} className={styles.clearBtn}>
                Clear
              </button>
            )}
            <button onClick={onClose} className={styles.closeBtn}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Context indicator */}
        <div className={styles.contextBar}>
          <span>Context:</span>
          <span className={styles.contextPage}>{currentPage.replace('-', ' ')}</span>
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {messages.length === 0 ? (
            <div className={styles.welcome}>
              <div className={styles.welcomeIcon}>
                <Sparkles size={32} />
              </div>
              <h3>How can I help you?</h3>
              <p>I have access to your firm data and can help with questions about matters, clients, billing, and more.</p>
              
              {suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  <span className={styles.suggestionsLabel}>Try asking:</span>
                  {suggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      className={styles.suggestionBtn}
                      onClick={() => sendMessage(suggestion)}
                    >
                      <MessageSquare size={14} />
                      {suggestion}
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`${styles.message} ${styles[message.role]}`}
                >
                  {message.role === 'assistant' && (
                    <div className={styles.avatar}>
                      <Sparkles size={16} />
                    </div>
                  )}
                  <div className={styles.messageContent}>
                    <div className={styles.messageText}>
                      {message.content.split('\n').map((line, i) => (
                        <p key={i}>{line || <br />}</p>
                      ))}
                    </div>
                    <span className={styles.timestamp}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className={`${styles.message} ${styles.assistant}`}>
                  <div className={styles.avatar}>
                    <Sparkles size={16} />
                  </div>
                  <div className={styles.messageContent}>
                    <div className={styles.typing}>
                      <Loader2 size={16} className={styles.spinner} />
                      <span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className={styles.inputArea}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            disabled={isLoading}
            className={styles.input}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className={styles.sendBtn}
          >
            {isLoading ? <Loader2 size={18} className={styles.spinner} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}
