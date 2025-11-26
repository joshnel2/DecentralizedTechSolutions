import { useState, useRef, useEffect } from 'react'
import { useAIStore, type AIModel } from '../stores/aiStore'
import { useDataStore } from '../stores/dataStore'
import { 
  Sparkles, Send, Plus, MessageSquare, Trash2, 
  MessageCircle, FileEdit, Files, Zap
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './AIAssistantPage.module.css'

// Model configurations for display
const AI_MODELS = {
  standard: {
    id: 'standard' as AIModel,
    name: 'Standard Chat',
    description: 'Balanced AI for general legal queries and everyday tasks',
    icon: <MessageCircle size={24} />,
    color: '#3B82F6'
  },
  redline: {
    id: 'redline' as AIModel,
    name: 'Redline AI',
    description: 'Contract comparison, markup, and clause analysis',
    icon: <FileEdit size={24} />,
    color: '#EF4444'
  },
  'large-docs': {
    id: 'large-docs' as AIModel,
    name: 'Large Documents',
    description: 'Process lengthy documents, due diligence, discovery',
    icon: <Files size={24} />,
    color: '#8B5CF6'
  },
  fast: {
    id: 'fast' as AIModel,
    name: 'Fast',
    description: 'Quick responses for simple queries and formatting',
    icon: <Zap size={24} />,
    color: '#F59E0B'
  }
}

export function AIAssistantPage() {
  const { 
    conversations, 
    activeConversationId, 
    selectedModel,
    isLoading,
    setSelectedModel,
    createConversation, 
    setActiveConversation,
    generateResponse,
    deleteConversation
  } = useAIStore()
  const { matters } = useDataStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find(c => c.id === activeConversationId)
  const currentModel = AI_MODELS[selectedModel]

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

  const handleModelSelect = (model: AIModel) => {
    setSelectedModel(model)
    createConversation()
  }

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
            {/* Model indicator bar */}
            <div className={styles.modelBar} style={{ borderColor: currentModel.color }}>
              <div className={styles.modelBarIcon} style={{ color: currentModel.color }}>
                {currentModel.icon}
              </div>
              <div className={styles.modelBarInfo}>
                <span className={styles.modelBarName}>{currentModel.name}</span>
                <span className={styles.modelBarDesc}>{currentModel.description}</span>
              </div>
              <button 
                className={styles.switchModelBtn}
                onClick={() => setActiveConversation(null)}
              >
                Switch Model
              </button>
            </div>

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
                    <div className={styles.aiAvatar} style={{ background: `linear-gradient(135deg, ${currentModel.color}, ${currentModel.color}88)` }}>
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
                  <div className={styles.aiAvatar} style={{ background: `linear-gradient(135deg, ${currentModel.color}, ${currentModel.color}88)` }}>
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
                placeholder={`Message ${currentModel.name}...`}
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
              Choose an AI model to get started. Each model is optimized for different tasks.
            </p>

            {/* Model Selection Cards */}
            <div className={styles.modelCards}>
              {(Object.keys(AI_MODELS) as AIModel[]).map((modelId) => {
                const model = AI_MODELS[modelId]
                return (
                  <button
                    key={modelId}
                    className={styles.modelCard}
                    onClick={() => handleModelSelect(modelId)}
                    style={{ '--model-color': model.color } as React.CSSProperties}
                  >
                    <div className={styles.modelCardIcon}>
                      {model.icon}
                    </div>
                    <div className={styles.modelCardContent}>
                      <h3>{model.name}</h3>
                      <p>{model.description}</p>
                    </div>
                    <div className={styles.modelCardArrow}>→</div>
                  </button>
                )
              })}
            </div>

            <div className={styles.tryAsking}>
              <h4>Or try asking:</h4>
              <div className={styles.suggestions}>
                <button onClick={() => { handleModelSelect('standard'); setTimeout(() => setInput('Research case law on patent infringement'), 100) }}>
                  Research case law on patent infringement
                </button>
                <button onClick={() => { handleModelSelect('standard'); setTimeout(() => setInput('Draft a motion for summary judgment'), 100) }}>
                  Draft a motion for summary judgment
                </button>
                <button onClick={() => { handleModelSelect('standard'); setTimeout(() => setInput('Summarize my active matters'), 100) }}>
                  Summarize my active matters
                </button>
                <button onClick={() => { handleModelSelect('standard'); setTimeout(() => setInput('Explain recent changes to employment law'), 100) }}>
                  Explain recent changes to employment law
                </button>
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
