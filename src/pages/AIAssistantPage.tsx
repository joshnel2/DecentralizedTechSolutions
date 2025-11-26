import { useState, useRef, useEffect } from 'react'
import { useAIStore } from '../stores/aiStore'
import { useDataStore } from '../stores/dataStore'
import { 
  Sparkles, Send, Plus, MessageSquare, Trash2, 
  FileText, Briefcase, Search, Zap, BookOpen
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './AIAssistantPage.module.css'

export function AIAssistantPage() {
  const { 
    conversations, 
    activeConversationId, 
    isLoading,
    createConversation, 
    setActiveConversation,
    generateResponse,
    deleteConversation
  } = useAIStore()
  const { matters } = useDataStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find(c => c.id === activeConversationId)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation?.messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    let conversationId = activeConversationId
    if (!conversationId) {
      const newConv = createConversation()
      conversationId = newConv.id
    }

    const message = input
    setInput('')
    await generateResponse(conversationId, message)
  }

  const handleNewChat = () => {
    createConversation()
  }

  const suggestions = [
    { icon: Search, text: 'Research case law on patent infringement', category: 'Research' },
    { icon: FileText, text: 'Draft a motion for summary judgment', category: 'Drafting' },
    { icon: Briefcase, text: 'Summarize my active matters', category: 'Analysis' },
    { icon: BookOpen, text: 'Explain recent changes to employment law', category: 'Education' }
  ]

  return (
    <div className={styles.aiPage}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <button className={styles.newChatBtn} onClick={handleNewChat}>
          <Plus size={18} />
          New Chat
        </button>

        <div className={styles.conversationsList}>
          <h4>Recent Conversations</h4>
          {conversations.map(conv => (
            <div 
              key={conv.id}
              className={clsx(
                styles.conversationItem,
                conv.id === activeConversationId && styles.active
              )}
              onClick={() => setActiveConversation(conv.id)}
            >
              <MessageSquare size={16} />
              <div className={styles.convInfo}>
                <span className={styles.convTitle}>{conv.title}</span>
                <span className={styles.convDate}>
                  {format(parseISO(conv.updatedAt), 'MMM d')}
                </span>
              </div>
              <button 
                className={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  deleteConversation(conv.id)
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.aiPowered}>
            <Sparkles size={14} />
            Powered by Azure OpenAI
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={styles.chatArea}>
        {activeConversation ? (
          <>
            <div className={styles.messagesContainer}>
              {activeConversation.messages.map(message => (
                <div 
                  key={message.id}
                  className={clsx(
                    styles.message,
                    message.role === 'user' ? styles.userMessage : styles.aiMessage
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className={styles.aiAvatar}>
                      <Sparkles size={16} />
                    </div>
                  )}
                  <div className={styles.messageContent}>
                    <div 
                      className={styles.messageText}
                      dangerouslySetInnerHTML={{ 
                        __html: formatMessageContent(message.content) 
                      }}
                    />
                    <span className={styles.messageTime}>
                      {format(parseISO(message.timestamp), 'h:mm a')}
                    </span>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className={clsx(styles.message, styles.aiMessage)}>
                  <div className={styles.aiAvatar}>
                    <Sparkles size={16} />
                  </div>
                  <div className={styles.messageContent}>
                    <div className={styles.typingIndicator}>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className={styles.inputArea}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your cases, legal research, or drafting..."
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading || !input.trim()}>
                <Send size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className={styles.welcomeScreen}>
            <div className={styles.welcomeIcon}>
              <Sparkles size={48} />
            </div>
            <h2>Apex AI Assistant</h2>
            <p>
              Your AI-powered legal practice assistant. Get help with research, 
              drafting, analysis, and more.
            </p>

            <div className={styles.suggestions}>
              <h4>Try asking:</h4>
              <div className={styles.suggestionGrid}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    className={styles.suggestionCard}
                    onClick={() => {
                      createConversation()
                      setInput(s.text)
                    }}
                  >
                    <div className={styles.suggestionIcon}>
                      <s.icon size={20} />
                    </div>
                    <span className={styles.suggestionText}>{s.text}</span>
                    <span className={styles.suggestionCategory}>{s.category}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.capabilities}>
              <div className={styles.capability}>
                <Zap size={18} />
                <div>
                  <strong>Legal Research</strong>
                  <p>Search case law, statutes, and regulations</p>
                </div>
              </div>
              <div className={styles.capability}>
                <FileText size={18} />
                <div>
                  <strong>Document Drafting</strong>
                  <p>Generate contracts, motions, and correspondence</p>
                </div>
              </div>
              <div className={styles.capability}>
                <Briefcase size={18} />
                <div>
                  <strong>Matter Analysis</strong>
                  <p>Summarize cases and identify key issues</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatMessageContent(content: string): string {
  // Convert markdown-like syntax to HTML
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\n/g, '<br>')
    .replace(/• /g, '&bull; ')
    .replace(/✓/g, '<span style="color: #10B981">✓</span>')
    .replace(/⚠️/g, '<span style="color: #F59E0B">⚠️</span>')
}
