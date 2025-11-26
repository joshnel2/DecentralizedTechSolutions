import { useState, useRef, useEffect } from 'react'
import { useAIStore, AI_MODELS, type AIModel } from '../stores/aiStore'
import { useDataStore } from '../stores/dataStore'
import { 
  Sparkles, Send, Plus, MessageSquare, Trash2, 
  FileText, Briefcase, Search, Zap, BookOpen,
  MessageCircle, FileEdit, Files, Bolt, Check, ChevronDown
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './AIAssistantPage.module.css'

const modelIcons: Record<AIModel, React.ReactNode> = {
  standard: <MessageCircle size={20} />,
  redline: <FileEdit size={20} />,
  'large-docs': <Files size={20} />,
  fast: <Bolt size={20} />
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
  const [showModelPicker, setShowModelPicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const modelPickerRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find(c => c.id === activeConversationId)
  const currentModel = AI_MODELS[selectedModel]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation?.messages])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(event.target as Node)) {
        setShowModelPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    setShowModelPicker(false)
    // Start new conversation with new model
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

        {/* Model Selector */}
        <div className={styles.modelSection}>
          <h4>AI Model</h4>
          <div className={styles.modelSelector} ref={modelPickerRef}>
            <button 
              className={styles.modelSelectorBtn}
              onClick={() => setShowModelPicker(!showModelPicker)}
            >
              <span className={styles.modelIcon}>{currentModel.icon}</span>
              <div className={styles.modelInfo}>
                <span className={styles.modelName}>{currentModel.name}</span>
                <span className={styles.modelDesc}>{currentModel.bestFor.slice(0, 30)}...</span>
              </div>
              <ChevronDown size={16} className={clsx(showModelPicker && styles.rotated)} />
            </button>

            {showModelPicker && (
              <div className={styles.modelDropdown}>
                {(Object.keys(AI_MODELS) as AIModel[]).map((modelId) => {
                  const model = AI_MODELS[modelId]
                  const isSelected = selectedModel === modelId
                  return (
                    <button
                      key={modelId}
                      className={clsx(styles.modelOption, isSelected && styles.selected)}
                      onClick={() => handleModelSelect(modelId)}
                    >
                      <span className={styles.modelOptionIcon}>{model.icon}</span>
                      <div className={styles.modelOptionInfo}>
                        <span className={styles.modelOptionName}>{model.name}</span>
                        <span className={styles.modelOptionDesc}>{model.description}</span>
                      </div>
                      {isSelected && <Check size={16} className={styles.checkIcon} />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

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
            <div className={styles.modelBar}>
              <span className={styles.modelBarIcon}>{currentModel.icon}</span>
              <span className={styles.modelBarName}>{currentModel.name}</span>
              <div className={styles.modelBarCaps}>
                {currentModel.capabilities.slice(0, 3).map((cap, i) => (
                  <span key={i} className={styles.capBadge}>{cap}</span>
                ))}
              </div>
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
                placeholder={`Ask ${currentModel.name}...`}
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
              Your AI-powered legal practice assistant. Choose a model to get started.
            </p>

            {/* Model Selection Cards */}
            <div className={styles.modelCards}>
              <h4>Select AI Model</h4>
              <div className={styles.modelGrid}>
                {(Object.keys(AI_MODELS) as AIModel[]).map((modelId) => {
                  const model = AI_MODELS[modelId]
                  const isSelected = selectedModel === modelId
                  return (
                    <button
                      key={modelId}
                      className={clsx(styles.modelCard, isSelected && styles.selected)}
                      onClick={() => handleModelSelect(modelId)}
                    >
                      <div className={styles.modelCardHeader}>
                        <span className={styles.modelCardIcon}>{model.icon}</span>
                        {isSelected && <Check size={18} className={styles.modelCardCheck} />}
                      </div>
                      <h3>{model.name}</h3>
                      <p className={styles.modelCardDesc}>{model.description}</p>
                      <div className={styles.modelCardCaps}>
                        {model.capabilities.map((cap, i) => (
                          <span key={i}>{cap}</span>
                        ))}
                      </div>
                      <p className={styles.modelCardBest}>
                        <strong>Best for:</strong> {model.bestFor}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

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
    .replace(/🔴/g, '<span style="color: #EF4444">●</span>')
    .replace(/🟡/g, '<span style="color: #F59E0B">●</span>')
    .replace(/🟢/g, '<span style="color: #10B981">●</span>')
}
