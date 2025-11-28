import { useState, useRef, useEffect } from 'react'
import { useAIStore, type AIModel } from '../stores/aiStore'
import { useAuthStore } from '../stores/authStore'
import { useDataStore } from '../stores/dataStore'
import { 
  Sparkles, Send, Plus, MessageSquare, Trash2, 
  MessageCircle, FileEdit, Files, Zap, Settings,
  User, Briefcase, Scale, BookOpen, HelpCircle,
  SlidersHorizontal, Brain, Target, Clock, Paperclip, X, FileText
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
  const { user } = useAuthStore()
  const { matters } = useDataStore()
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState<'models' | 'help' | 'personalize'>('models')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null)

  // Personalization state
  const [preferences, setPreferences] = useState({
    responseStyle: 'balanced',
    practiceAreas: ['litigation', 'corporate'],
    jurisdiction: 'federal',
    citationFormat: 'bluebook',
    autoSummarize: true,
    proactiveInsights: true
  })

  const activeConversation = conversations.find(c => c.id === activeConversationId)
  const currentModel = AI_MODELS[selectedModel]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation?.messages])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Read file contents
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setAttachedFile({ name: file.name, content })
    }
    
    // Read as text for text files, or notify for binary
    if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.md') || 
        file.name.endsWith('.json') || file.name.endsWith('.csv') || file.name.endsWith('.xml') ||
        file.name.endsWith('.html') || file.name.endsWith('.js') || file.name.endsWith('.ts')) {
      reader.readAsText(file)
    } else if (file.type.includes('pdf')) {
      // For PDFs, we'll just note the file name - full PDF parsing would need a library
      setAttachedFile({ 
        name: file.name, 
        content: `[PDF Document: ${file.name} - ${(file.size / 1024).toFixed(1)} KB]\n\nNote: Please describe what you'd like me to help with regarding this document.` 
      })
    } else {
      setAttachedFile({ 
        name: file.name, 
        content: `[File: ${file.name} - ${(file.size / 1024).toFixed(1)} KB]` 
      })
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && !attachedFile) || isLoading) return

    let conversationId = activeConversationId
    if (!conversationId) {
      const newConv = createConversation()
      conversationId = newConv.id
    }

    // Build message with file content if attached
    let message = input
    if (attachedFile) {
      message = `[Attached: ${attachedFile.name}]\n\n--- FILE CONTENT ---\n${attachedFile.content}\n--- END FILE ---\n\n${input || 'Please analyze this document.'}`
      setAttachedFile(null)
    }

    setInput('')
    await generateResponse(conversationId, message)
  }

  const handleNewChat = () => {
    createConversation()
  }

  const handleModelSelect = (model: AIModel, initialMessage?: string) => {
    setSelectedModel(model)
    const newConv = createConversation()
    if (initialMessage) {
      setInput(initialMessage)
      // Auto-send the message after a short delay to allow state to update
      setTimeout(() => {
        generateResponse(newConv.id, initialMessage)
        setInput('')
      }, 100)
    }
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
          {conversations.length === 0 ? (
            <div className={styles.noConversations}>
              <MessageSquare size={20} />
              <span>No conversations yet</span>
            </div>
          ) : (
            conversations.map(conv => (
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
            ))
          )}
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
              {attachedFile && (
                <div className={styles.attachedFile}>
                  <FileText size={16} />
                  <span>{attachedFile.name}</span>
                  <button type="button" onClick={() => setAttachedFile(null)}>
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className={styles.inputRow}>
                <button 
                  type="button" 
                  className={styles.attachBtn}
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  accept=".txt,.md,.json,.csv,.xml,.html,.js,.ts,.pdf,.doc,.docx"
                />
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={attachedFile ? "Add a message about this file..." : `Message ${currentModel.name}...`}
                  disabled={isLoading}
                />
                <button type="submit" disabled={isLoading || (!input.trim() && !attachedFile)}>
                  <Send size={18} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className={styles.welcomeScreen}>
            <div className={styles.welcomeHeader}>
              <div className={styles.welcomeIcon}>
                <Sparkles size={40} />
              </div>
              <div>
                <h2>Apex AI Assistant</h2>
                <p>Your AI-powered legal practice companion</p>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className={styles.tabNav}>
              <button 
                className={clsx(styles.tabBtn, activeTab === 'models' && styles.active)}
                onClick={() => setActiveTab('models')}
              >
                <Brain size={18} />
                AI Models
              </button>
              <button 
                className={clsx(styles.tabBtn, activeTab === 'help' && styles.active)}
                onClick={() => setActiveTab('help')}
              >
                <HelpCircle size={18} />
                Help & Guide
              </button>
              <button 
                className={clsx(styles.tabBtn, activeTab === 'personalize' && styles.active)}
                onClick={() => setActiveTab('personalize')}
              >
                <SlidersHorizontal size={18} />
                Personalize
              </button>
            </div>

            {/* Models Tab */}
            {activeTab === 'models' && (
              <div className={styles.tabContent}>
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

                <div className={styles.quickStart}>
                  <h4>Quick Start</h4>
                  <div className={styles.suggestions}>
                    <button onClick={() => handleModelSelect('standard', 'Research case law on patent infringement')}>
                      <Scale size={16} />
                      Research case law on patent infringement
                    </button>
                    <button onClick={() => handleModelSelect('redline', 'I need to compare two contract versions and identify changes')}>
                      <FileEdit size={16} />
                      Compare contract versions with Redline AI
                    </button>
                    <button onClick={() => handleModelSelect('large-docs', 'I have a large document that needs analysis')}>
                      <Files size={16} />
                      Analyze large documents
                    </button>
                    <button onClick={() => handleModelSelect('fast', 'Explain recent changes to employment law briefly')}>
                      <Zap size={16} />
                      Quick legal question
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Help Tab */}
            {activeTab === 'help' && (
              <div className={styles.tabContent}>
                <div className={styles.helpSection}>
                  <h3>Getting Started</h3>
                  <div className={styles.helpCards}>
                    <button className={styles.helpCard} onClick={() => handleModelSelect('standard')}>
                      <div className={styles.helpCardIcon}>
                        <MessageCircle size={24} />
                      </div>
                      <h4>Standard Chat</h4>
                      <p>Best for general legal questions, research queries, case analysis, and drafting assistance.</p>
                      <ul>
                        <li>Legal research and case law lookup</li>
                        <li>Document drafting and review</li>
                        <li>Matter summarization</li>
                        <li>Client communication drafts</li>
                      </ul>
                    </button>
                    <button className={styles.helpCard} onClick={() => handleModelSelect('redline')}>
                      <div className={styles.helpCardIcon} style={{ color: '#EF4444', background: 'rgba(239, 68, 68, 0.1)' }}>
                        <FileEdit size={24} />
                      </div>
                      <h4>Redline AI</h4>
                      <p>Specialized for contract review and comparison. Get detailed markup and analysis.</p>
                      <ul>
                        <li>Compare contract versions</li>
                        <li>Identify clause changes</li>
                        <li>Risk assessment</li>
                        <li>Negotiation suggestions</li>
                      </ul>
                    </button>
                    <button className={styles.helpCard} onClick={() => handleModelSelect('large-docs')}>
                      <div className={styles.helpCardIcon} style={{ color: '#8B5CF6', background: 'rgba(139, 92, 246, 0.1)' }}>
                        <Files size={24} />
                      </div>
                      <h4>Large Documents</h4>
                      <p>Handles extensive documents up to 100+ pages for comprehensive analysis.</p>
                      <ul>
                        <li>Due diligence reviews</li>
                        <li>Discovery document analysis</li>
                        <li>Long-form summarization</li>
                        <li>Multi-document comparison</li>
                      </ul>
                    </button>
                    <button className={styles.helpCard} onClick={() => handleModelSelect('fast')}>
                      <div className={styles.helpCardIcon} style={{ color: '#F59E0B', background: 'rgba(245, 158, 11, 0.1)' }}>
                        <Zap size={24} />
                      </div>
                      <h4>Fast</h4>
                      <p>Quick responses for simple queries when you need a fast answer.</p>
                      <ul>
                        <li>Quick legal questions</li>
                        <li>Simple formatting tasks</li>
                        <li>Brief lookups</li>
                        <li>Fast turnaround needs</li>
                      </ul>
                    </button>
                  </div>
                </div>

                <div className={styles.helpSection}>
                  <h3>Tips for Better Results</h3>
                  <div className={styles.tipsList}>
                    <div className={styles.tip}>
                      <Target size={18} />
                      <div>
                        <strong>Be Specific</strong>
                        <p>Include relevant details like jurisdiction, practice area, and specific issues for more accurate responses.</p>
                      </div>
                    </div>
                    <div className={styles.tip}>
                      <Briefcase size={18} />
                      <div>
                        <strong>Reference Matters</strong>
                        <p>Mention specific matter names or numbers to get context-aware assistance for your cases.</p>
                      </div>
                    </div>
                    <div className={styles.tip}>
                      <Clock size={18} />
                      <div>
                        <strong>Choose the Right Model</strong>
                        <p>Use Fast for quick questions, Standard for most tasks, and Large Documents for extensive analysis.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Personalize Tab */}
            {activeTab === 'personalize' && (
              <div className={styles.tabContent}>
                <div className={styles.personalizeSection}>
                  <div className={styles.personalizeHeader}>
                    <User size={20} />
                    <div>
                      <h3>AI Personalization</h3>
                      <p>Customize how Apex AI responds to your queries</p>
                    </div>
                  </div>

                  <div className={styles.preferenceGroup}>
                    <label>Response Style</label>
                    <div className={styles.optionButtons}>
                      {['concise', 'balanced', 'detailed'].map(style => (
                        <button
                          key={style}
                          className={clsx(styles.optionBtn, preferences.responseStyle === style && styles.active)}
                          onClick={() => setPreferences(p => ({ ...p, responseStyle: style }))}
                        >
                          {style.charAt(0).toUpperCase() + style.slice(1)}
                        </button>
                      ))}
                    </div>
                    <span className={styles.preferenceHint}>
                      {preferences.responseStyle === 'concise' && 'Short, to-the-point answers'}
                      {preferences.responseStyle === 'balanced' && 'Moderate detail with key points'}
                      {preferences.responseStyle === 'detailed' && 'Comprehensive explanations with context'}
                    </span>
                  </div>

                  <div className={styles.preferenceGroup}>
                    <label>Primary Practice Areas</label>
                    <div className={styles.tagSelect}>
                      {['litigation', 'corporate', 'real-estate', 'ip', 'employment', 'family', 'criminal', 'estate'].map(area => (
                        <button
                          key={area}
                          className={clsx(styles.tag, preferences.practiceAreas.includes(area) && styles.active)}
                          onClick={() => setPreferences(p => ({
                            ...p,
                            practiceAreas: p.practiceAreas.includes(area)
                              ? p.practiceAreas.filter(a => a !== area)
                              : [...p.practiceAreas, area]
                          }))}
                        >
                          {area.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </button>
                      ))}
                    </div>
                    <span className={styles.preferenceHint}>AI will prioritize context from these areas</span>
                  </div>

                  <div className={styles.preferenceGroup}>
                    <label>Default Jurisdiction</label>
                    <select 
                      value={preferences.jurisdiction}
                      onChange={(e) => setPreferences(p => ({ ...p, jurisdiction: e.target.value }))}
                    >
                      <option value="federal">Federal</option>
                      <option value="ny">New York</option>
                      <option value="ca">California</option>
                      <option value="tx">Texas</option>
                      <option value="fl">Florida</option>
                      <option value="il">Illinois</option>
                      <option value="other">Other (specify in queries)</option>
                    </select>
                  </div>

                  <div className={styles.preferenceGroup}>
                    <label>Citation Format</label>
                    <select 
                      value={preferences.citationFormat}
                      onChange={(e) => setPreferences(p => ({ ...p, citationFormat: e.target.value }))}
                    >
                      <option value="bluebook">Bluebook</option>
                      <option value="alwd">ALWD</option>
                      <option value="chicago">Chicago Manual</option>
                      <option value="none">No specific format</option>
                    </select>
                  </div>

                  <div className={styles.togglePreferences}>
                    <div className={styles.toggleRow}>
                      <div>
                        <strong>Auto-summarize documents</strong>
                        <p>Automatically generate summaries when documents are uploaded</p>
                      </div>
                      <label className={styles.switch}>
                        <input 
                          type="checkbox" 
                          checked={preferences.autoSummarize}
                          onChange={(e) => setPreferences(p => ({ ...p, autoSummarize: e.target.checked }))}
                        />
                        <span className={styles.slider}></span>
                      </label>
                    </div>
                    <div className={styles.toggleRow}>
                      <div>
                        <strong>Proactive insights</strong>
                        <p>AI suggests relevant information based on your current work</p>
                      </div>
                      <label className={styles.switch}>
                        <input 
                          type="checkbox" 
                          checked={preferences.proactiveInsights}
                          onChange={(e) => setPreferences(p => ({ ...p, proactiveInsights: e.target.checked }))}
                        />
                        <span className={styles.slider}></span>
                      </label>
                    </div>
                  </div>

                  <button className={styles.savePreferencesBtn}>
                    <Settings size={16} />
                    Save Preferences
                  </button>
                </div>
              </div>
            )}
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
