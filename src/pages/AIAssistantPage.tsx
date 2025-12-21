import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAIStore, type AIMode } from '../stores/aiStore'
import { useAuthStore } from '../stores/authStore'
import { 
  Sparkles, Send, Plus, MessageSquare, Trash2, 
  MessageCircle, FileEdit, FileText, Paperclip, X,
  FileSearch, History, ChevronRight, Loader2, Image, Bot, Clock, CheckCircle, AlertCircle
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './AIAssistantPage.module.css'
import { parseDocument, getSupportedFileTypes } from '../utils/documentParser'
import { aiApi } from '../services/api'

interface AgentTask {
  id: string
  goal: string
  status: string
  duration: string | null
  durationSeconds: number | null
  iterations: number
  result: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

// Mode configurations
const AI_MODES = {
  document: {
    id: 'document' as AIMode,
    name: 'Document Analyzer',
    description: 'Upload a document and ask questions about it',
    icon: <FileSearch size={24} />,
    color: '#10B981',
    placeholder: 'Ask about this document...'
  },
  redline: {
    id: 'redline' as AIMode,
    name: 'Redline AI',
    description: 'Compare two documents and identify changes',
    icon: <FileEdit size={24} />,
    color: '#EF4444',
    placeholder: 'Compare these documents...'
  },
  standard: {
    id: 'standard' as AIMode,
    name: 'Standard Chat',
    description: 'General legal assistant for research and drafting',
    icon: <MessageCircle size={24} />,
    color: '#8B5CF6',
    placeholder: 'Ask anything...'
  }
}

export function AIAssistantPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { 
    conversations, 
    activeConversationId, 
    selectedMode,
    isLoading,
    initialMessage,
    documentContext,
    redlineDocuments,
    setSelectedMode,
    setDocumentContext,
    setRedlineDocument,
    setInitialMessage,
    createConversation, 
    setActiveConversation,
    generateResponse,
    deleteConversation,
    clearDocumentContext
  } = useAIStore()
  const { user } = useAuthStore()
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [showAgentHistory, setShowAgentHistory] = useState(false)
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([])
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null)
  const [loadingAgentHistory, setLoadingAgentHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastUserMessageRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const redlineInput1Ref = useRef<HTMLInputElement>(null)
  const redlineInput2Ref = useRef<HTMLInputElement>(null)

  const activeConversation = conversations.find(c => c.id === activeConversationId)
  const currentMode = AI_MODES[selectedMode]
  const [isExtracting, setIsExtracting] = useState(false)

  // Handle document passed via URL params (from Documents page)
  useEffect(() => {
    const docId = searchParams.get('docId')
    const docName = searchParams.get('docName')
    const docContent = searchParams.get('docContent')
    
    if (docName && docContent) {
      setSelectedMode('document')
      setDocumentContext({
        id: docId || undefined,
        name: decodeURIComponent(docName),
        content: decodeURIComponent(docContent)
      })
      createConversation('document')
    }
  }, [searchParams])

  // Handle document passed via sessionStorage (from Document Automation page)
  useEffect(() => {
    const storedData = sessionStorage.getItem('documentAI_content')
    if (storedData) {
      try {
        const { content, templateName } = JSON.parse(storedData)
        if (content && templateName) {
          // Clear the sessionStorage to prevent re-loading on refresh
          sessionStorage.removeItem('documentAI_content')
          
          // Set up document context with the generated document
          setSelectedMode('document')
          setDocumentContext({
            name: `${templateName}.txt`,
            content: content,
            type: 'text/plain'
          })
          
          // Create a conversation and start analysis
          const conv = createConversation('document')
          generateResponse(conv.id, `I just generated this ${templateName} document. Please review it and let me know if there are any issues, missing information, or improvements I should make.`)
        }
      } catch (e) {
        console.error('Error parsing document automation content:', e)
        sessionStorage.removeItem('documentAI_content')
      }
    }
  }, [])

  // Handle initial message from document page AI suggestions
  useEffect(() => {
    if (initialMessage) {
      setInput(initialMessage)
      setInitialMessage(null)
    }
  }, [initialMessage, setInitialMessage])

  // Load agent history when toggled
  useEffect(() => {
    if (showAgentHistory && agentTasks.length === 0) {
      loadAgentHistory()
    }
  }, [showAgentHistory])

  const loadAgentHistory = async () => {
    setLoadingAgentHistory(true)
    try {
      const response = await aiApi.getTasks()
      setAgentTasks(response.tasks || [])
    } catch (error) {
      console.error('Error loading agent history:', error)
    } finally {
      setLoadingAgentHistory(false)
    }
  }

  // Scroll to the last user message when messages change
  useEffect(() => {
    if (lastUserMessageRef.current && activeConversation?.messages?.length) {
      lastUserMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activeConversation?.messages])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target?: 'doc1' | 'doc2') => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Reset input immediately
    e.target.value = ''
    setIsExtracting(true)

    try {
      const result = await parseDocument(file)
      const doc = {
        name: file.name,
        content: result.content,
        type: file.type,
        size: file.size,
        // Include image data if present (for AI vision analysis)
        imageData: result.imageData
      }
      
      if (selectedMode === 'redline' && target) {
        setRedlineDocument(target, doc)
      } else {
        setDocumentContext(doc)
      }
    } catch (error) {
      console.error('Failed to extract document text:', error)
      const doc = {
        name: file.name,
        content: `[Error extracting text from ${file.name}. Please try again.]`,
        type: file.type,
        size: file.size
      }
      if (selectedMode === 'redline' && target) {
        setRedlineDocument(target, doc)
      } else {
        setDocumentContext(doc)
      }
    } finally {
      setIsExtracting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    let conversationId = activeConversationId
    if (!conversationId) {
      const newConv = createConversation(selectedMode)
      conversationId = newConv.id
    }

    const userMessage = input
    setInput('')
    await generateResponse(conversationId, userMessage)
  }

  const handleModeSelect = (mode: AIMode) => {
    // Navigate to dedicated Redline AI page
    if (mode === 'redline') {
      navigate('/app/ai/redline')
      return
    }
    setSelectedMode(mode)
    clearDocumentContext()
    setActiveConversation(null)
  }

  const handleNewChat = () => {
    clearDocumentContext()
    createConversation(selectedMode)
  }

  const startDocumentAnalysis = () => {
    if (!documentContext) return
    createConversation('document')
  }

  const startRedlineComparison = () => {
    if (!redlineDocuments.doc1 || !redlineDocuments.doc2) return
    const conv = createConversation('redline')
    generateResponse(conv.id, 'Please compare these two documents, identify all changes, and highlight the key differences.')
  }

  return (
    <div className={styles.aiPage}>
      {/* Left Panel - Mode Selection & History */}
      <div className={styles.leftPanel}>
        <div className={styles.modeSection}>
          <h3>AI Assistant</h3>
          <div className={styles.modeButtons}>
            {(Object.keys(AI_MODES) as AIMode[]).map((modeId) => {
              const mode = AI_MODES[modeId]
              return (
                <button
                  key={modeId}
                  className={clsx(styles.modeBtn, selectedMode === modeId && styles.active)}
                  onClick={() => handleModeSelect(modeId)}
                  style={{ '--mode-color': mode.color } as React.CSSProperties}
                >
                  <div className={styles.modeBtnIcon}>{mode.icon}</div>
                  <div className={styles.modeBtnText}>
                    <span className={styles.modeBtnName}>{mode.name}</span>
                    <span className={styles.modeBtnDesc}>{mode.description}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.historySection}>
          <button 
            className={styles.historyToggle}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={18} />
            <span>Chat History</span>
            <ChevronRight size={16} className={clsx(styles.chevron, showHistory && styles.open)} />
          </button>
          
          {showHistory && (
            <div className={styles.historyList}>
              {conversations.length === 0 ? (
                <div className={styles.noHistory}>No conversations yet</div>
              ) : (
                conversations.slice(0, 10).map(conv => (
                  <div 
                    key={conv.id}
                    className={clsx(styles.historyItem, conv.id === activeConversationId && styles.active)}
                    onClick={() => setActiveConversation(conv.id)}
                  >
                    <MessageSquare size={14} />
                    <span className={styles.historyTitle}>{conv.title}</span>
                    <span className={styles.historyDate}>
                      {format(parseISO(conv.updatedAt), 'MMM d')}
                    </span>
                    <button 
                      className={styles.historyDelete}
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteConversation(conv.id)
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Agent History Section */}
        <div className={styles.historySection}>
          <button 
            className={styles.historyToggle}
            onClick={() => setShowAgentHistory(!showAgentHistory)}
          >
            <Bot size={18} />
            <span>Agent History</span>
            <ChevronRight size={16} className={clsx(styles.chevron, showAgentHistory && styles.open)} />
          </button>
          
          {showAgentHistory && (
            <div className={styles.historyList}>
              {loadingAgentHistory ? (
                <div className={styles.noHistory}>
                  <Loader2 size={16} className={styles.spinner} /> Loading...
                </div>
              ) : agentTasks.length === 0 ? (
                <div className={styles.noHistory}>No background tasks yet</div>
              ) : (
                agentTasks.slice(0, 15).map(task => (
                  <div 
                    key={task.id}
                    className={clsx(styles.agentHistoryItem, selectedTask?.id === task.id && styles.active)}
                    onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                  >
                    <div className={styles.agentItemHeader}>
                      {task.status === 'completed' ? (
                        <CheckCircle size={14} className={styles.statusComplete} />
                      ) : task.status === 'error' ? (
                        <AlertCircle size={14} className={styles.statusError} />
                      ) : (
                        <Bot size={14} className={styles.statusRunning} />
                      )}
                      <span className={styles.agentGoal}>{task.goal}</span>
                    </div>
                    <div className={styles.agentItemMeta}>
                      <span className={styles.agentDate}>
                        {format(parseISO(task.created_at), 'MMM d, h:mm a')}
                      </span>
                      {task.duration && (
                        <span className={styles.agentDuration}>
                          <Clock size={10} /> {task.duration}
                        </span>
                      )}
                    </div>
                    
                    {/* Expanded summary */}
                    {selectedTask?.id === task.id && task.result && (
                      <div className={styles.agentSummary}>
                        <div className={styles.agentSummaryTitle}>Summary</div>
                        <div className={styles.agentSummaryContent}>
                          {task.result.split('\n').map((line, i) => (
                            <p key={i}>{line || <br />}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {selectedTask?.id === task.id && task.error && (
                      <div className={styles.agentError}>
                        <strong>Error:</strong> {task.error}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className={styles.poweredBy}>
          <Sparkles size={14} />
          <span>Powered by Azure OpenAI</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={styles.mainArea}>
        {activeConversation ? (
          // Chat View
          <>
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderMode} style={{ color: currentMode.color }}>
                {currentMode.icon}
                <span>{currentMode.name}</span>
              </div>
              {documentContext && selectedMode === 'document' && (
                <div className={styles.documentIndicator}>
                  {documentContext.imageData ? <Image size={14} /> : <FileText size={14} />}
                  <span>{documentContext.name}</span>
                </div>
              )}
              <button className={styles.newChatBtn} onClick={handleNewChat}>
                <Plus size={16} />
                New Chat
              </button>
            </div>

            <div className={styles.messagesContainer}>
              {activeConversation.messages.map((message, index) => {
                // Find the last user message to attach the ref
                const isLastUserMessage = message.role === 'user' && 
                  activeConversation.messages.slice(index + 1).every(m => m.role !== 'user')
                
                return (
                  <div 
                    key={message.id}
                    ref={isLastUserMessage ? lastUserMessageRef : null}
                    className={clsx(
                      styles.message,
                      message.role === 'user' ? styles.userMessage : styles.aiMessage
                    )}
                  >
                    {message.role === 'assistant' && (
                      <div className={styles.aiAvatar} style={{ background: currentMode.color }}>
                        <Sparkles size={16} />
                      </div>
                    )}
                    <div className={styles.messageContent}>
                      <div 
                        className={styles.messageText}
                        dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }}
                      />
                      <span className={styles.messageTime}>
                        {format(parseISO(message.timestamp), 'h:mm a')}
                      </span>
                    </div>
                  </div>
                )
              })}
              {isLoading && (
                <div className={clsx(styles.message, styles.aiMessage)}>
                  <div className={styles.aiAvatar} style={{ background: currentMode.color }}>
                    <Sparkles size={16} />
                  </div>
                  <div className={styles.messageContent}>
                    <div className={styles.typingIndicator}>
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className={styles.inputArea}>
              <div className={styles.inputRow}>
                {selectedMode === 'document' && (
                  <button 
                    type="button" 
                    className={styles.attachBtn}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach document"
                  >
                    <Paperclip size={18} />
                  </button>
                )}
                <input type="hidden" />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileUpload(e)}
                  style={{ display: 'none' }}
                  accept={getSupportedFileTypes()}
                />
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={currentMode.placeholder}
                  disabled={isLoading}
                />
                <button type="submit" disabled={isLoading || !input.trim()}>
                  <Send size={18} />
                </button>
              </div>
            </form>
          </>
        ) : (
          // Mode Setup View
          <div className={styles.setupView}>
            {selectedMode === 'document' && (
              <div className={styles.documentSetup}>
                <div className={styles.setupIcon} style={{ color: AI_MODES.document.color }}>
                  <FileSearch size={48} />
                </div>
                <h2>Document Analyzer</h2>
                <p>Upload a document or image to analyze. Ask questions, get summaries, extract text from images, or identify key information.</p>
                
                {isExtracting ? (
                  <div className={styles.uploadedDoc}>
                    <Loader2 size={24} className={styles.spinner} />
                    <div className={styles.uploadedDocInfo}>
                      <span className={styles.uploadedDocName}>Extracting text...</span>
                      <span className={styles.uploadedDocMeta}>
                        Please wait while we process your document
                      </span>
                    </div>
                  </div>
                ) : documentContext ? (
                  <div className={styles.uploadedDoc}>
                    <FileText size={24} />
                    <div className={styles.uploadedDocInfo}>
                      <span className={styles.uploadedDocName}>{documentContext.name}</span>
                      <span className={styles.uploadedDocMeta}>
                        {documentContext.imageData 
                          ? 'Image • AI Vision ready' 
                          : `${documentContext.type} • Ready to analyze`}
                      </span>
                    </div>
                    <button onClick={() => setDocumentContext(null)} className={styles.removeDoc}>
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button 
                    className={styles.uploadBtn}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={20} />
                    Upload Document
                  </button>
                )}
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileUpload(e)}
                  style={{ display: 'none' }}
                  accept={getSupportedFileTypes()}
                />
                
                {documentContext && (
                  <button 
                    className={styles.startBtn}
                    onClick={startDocumentAnalysis}
                    style={{ background: AI_MODES.document.color }}
                  >
                    Start Analysis
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
            )}

            {selectedMode === 'redline' && (
              <div className={styles.redlineSetup}>
                <div className={styles.setupIcon} style={{ color: AI_MODES.redline.color }}>
                  <FileEdit size={48} />
                </div>
                <h2>Redline AI</h2>
                <p>Upload two versions of a document to compare. I'll identify all changes and highlight key differences.</p>
                
                <div className={styles.redlineUploads}>
                  <div className={styles.redlineUpload}>
                    <span className={styles.redlineLabel}>Original Document</span>
                    {isExtracting && !redlineDocuments.doc1 ? (
                      <div className={styles.uploadedDoc}>
                        <Loader2 size={20} className={styles.spinner} />
                        <span>Extracting text...</span>
                      </div>
                    ) : redlineDocuments.doc1 ? (
                      <div className={styles.uploadedDoc}>
                        <FileText size={20} />
                        <span>{redlineDocuments.doc1.name}</span>
                        <button onClick={() => setRedlineDocument('doc1', null)}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        className={styles.redlineUploadBtn}
                        onClick={() => redlineInput1Ref.current?.click()}
                      >
                        <Paperclip size={16} />
                        Upload Original
                      </button>
                    )}
                    <input
                      type="file"
                      ref={redlineInput1Ref}
                      onChange={(e) => handleFileUpload(e, 'doc1')}
                      style={{ display: 'none' }}
                      accept={getSupportedFileTypes()}
                    />
                  </div>
                  
                  <div className={styles.redlineVs}>VS</div>
                  
                  <div className={styles.redlineUpload}>
                    <span className={styles.redlineLabel}>Revised Document</span>
                    {isExtracting && !redlineDocuments.doc2 && redlineDocuments.doc1 ? (
                      <div className={styles.uploadedDoc}>
                        <Loader2 size={20} className={styles.spinner} />
                        <span>Extracting text...</span>
                      </div>
                    ) : redlineDocuments.doc2 ? (
                      <div className={styles.uploadedDoc}>
                        <FileText size={20} />
                        <span>{redlineDocuments.doc2.name}</span>
                        <button onClick={() => setRedlineDocument('doc2', null)}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        className={styles.redlineUploadBtn}
                        onClick={() => redlineInput2Ref.current?.click()}
                      >
                        <Paperclip size={16} />
                        Upload Revised
                      </button>
                    )}
                    <input
                      type="file"
                      ref={redlineInput2Ref}
                      onChange={(e) => handleFileUpload(e, 'doc2')}
                      style={{ display: 'none' }}
                      accept={getSupportedFileTypes()}
                    />
                  </div>
                </div>
                
                {redlineDocuments.doc1 && redlineDocuments.doc2 && (
                  <button 
                    className={styles.startBtn}
                    onClick={startRedlineComparison}
                    style={{ background: AI_MODES.redline.color }}
                  >
                    Compare Documents
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
            )}

            {selectedMode === 'standard' && (
              <div className={styles.standardSetup}>
                <div className={styles.setupIcon} style={{ color: AI_MODES.standard.color }}>
                  <MessageCircle size={48} />
                </div>
                <h2>Standard Chat</h2>
                <p>Your AI-powered legal assistant. Ask questions, get research help, or draft documents.</p>
                
                <div className={styles.suggestions}>
                  <button onClick={() => {
                    createConversation('standard')
                    setTimeout(() => {
                      setInput('Research case law on breach of contract')
                    }, 100)
                  }}>
                    Research case law on breach of contract
                  </button>
                  <button onClick={() => {
                    createConversation('standard')
                    setTimeout(() => {
                      setInput('Draft a confidentiality clause')
                    }, 100)
                  }}>
                    Draft a confidentiality clause
                  </button>
                  <button onClick={() => {
                    createConversation('standard')
                    setTimeout(() => {
                      setInput('Explain the statute of limitations')
                    }, 100)
                  }}>
                    Explain the statute of limitations
                  </button>
                </div>
                
                <button 
                  className={styles.startBtn}
                  onClick={() => createConversation('standard')}
                  style={{ background: AI_MODES.standard.color }}
                >
                  Start New Chat
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function formatMessageContent(content: string): string {
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
