import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sparkles, Send, X, Loader2, MessageSquare, ChevronRight, Zap, ExternalLink, Paperclip, FileText, Image, File, Bot, Mail } from 'lucide-react'
import { aiApi, documentsApi } from '../services/api'
import { useAIChat } from '../contexts/AIChatContext'
import styles from './AIChat.module.css'

interface NavigationInfo {
  type: string
  path: string
  label: string
  id?: string
  action?: string
  prefill?: Record<string, any>
}

interface UploadedFile {
  file: File
  name: string
  type: string
  size: number
  content?: string  // Extracted text content
  base64?: string   // For images
  extracting?: boolean
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  toolsUsed?: boolean  // Indicates if AI took an action
  backgroundTaskStarted?: boolean  // Indicates if background task was started
  backgroundTask?: { taskId: string; goal: string }
  navigation?: NavigationInfo  // Navigation command from AI
  attachedFile?: { name: string; type: string }  // File that was attached
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
  const navigate = useNavigate()
  const { refreshSuggestions, chatContext } = useAIChat()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [useBackgroundAgent, setUseBackgroundAgent] = useState(false) // Background agent toggle - OFF by default
  const [pendingNavigation, setPendingNavigation] = useState<NavigationInfo | null>(null)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const lastUserMessageRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset background agent toggle to OFF when chat is closed
  useEffect(() => {
    if (!isOpen) {
      setUseBackgroundAgent(false)
    }
  }, [isOpen])

  const currentPage = getPageFromPath(location.pathname)
  const pathContext = getContextFromPath(location.pathname)
  
  // Merge additional context from chat context
  const mergedContext = { ...pathContext, ...additionalContext, ...(chatContext?.additionalContext || {}) }

  // Scroll to the last user message when messages change
  useEffect(() => {
    if (lastUserMessageRef.current && messages.length > 0) {
      // Scroll to the last user message with some offset for better visibility
      lastUserMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [messages, isLoading])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Load suggestions when page changes or when AI Insights button is clicked
  useEffect(() => {
    if (isOpen) {
      // Use context-specific suggestions if provided, otherwise fetch from API
      if (chatContext?.suggestedQuestions && chatContext.suggestedQuestions.length > 0) {
        setSuggestions(chatContext.suggestedQuestions)
      } else {
        aiApi.getSuggestions(currentPage)
          .then(data => setSuggestions(data.suggestions || []))
          .catch(() => setSuggestions([]))
      }
      // Show suggestions whenever opened via AI Insights button
      setShowSuggestions(true)
    }
  }, [currentPage, isOpen, refreshSuggestions, chatContext])

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const uploadFile: UploadedFile = {
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      extracting: true
    }
    setUploadedFile(uploadFile)

    // Extract text content from the file
    try {
      const response = await documentsApi.extractText(file)
      
      // For images, also get base64 for vision
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          setUploadedFile(prev => prev ? { ...prev, content: response.content, base64, extracting: false } : null)
        }
        reader.readAsDataURL(file)
      } else {
        setUploadedFile(prev => prev ? { ...prev, content: response.content, extracting: false } : null)
      }
    } catch (error) {
      console.error('Error extracting file content:', error)
      setUploadedFile(prev => prev ? { ...prev, extracting: false, content: '[Could not extract text from this file]' } : null)
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeUploadedFile = () => {
    setUploadedFile(null)
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image size={16} />
    if (type.includes('pdf') || type.includes('word') || type.includes('document')) return <FileText size={16} />
    return <File size={16} />
  }

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim()
    if ((!text && !uploadedFile) || isLoading) return

    // Build message content including file info
    let messageContent = text
    if (uploadedFile) {
      messageContent = text || `Analyze this file: ${uploadedFile.name}`
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
      attachedFile: uploadedFile ? { name: uploadedFile.name, type: uploadedFile.type } : undefined
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    const currentFile = uploadedFile
    setUploadedFile(null)
    setIsLoading(true)

    try {
      // Build conversation history for context
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }))

      let response;
      
      // If there's a file, include its content in the context
      // Also include any additional context (like email draft)
      const fileContext = {
        ...(currentFile ? {
          uploadedDocument: {
            name: currentFile.name,
            type: currentFile.type,
            size: currentFile.size,
            content: currentFile.content,
            base64: currentFile.base64
          }
        } : {}),
        // Include email draft context if present
        ...(mergedContext.emailDraft ? {
          emailDraft: mergedContext.emailDraft,
          contextHint: `The user is drafting an email. Current draft:\n${mergedContext.draftSummary || ''}\n\nHelp them with their email.`
        } : {})
      }
      
      // Always use AI Agent with function calling (can take actions!)
      // The useBackgroundAgent flag enables long-running background tasks with progress bar
      response = await aiApi.agentChat(
        text || `Analyze and summarize this document: ${currentFile?.name}`, 
        conversationHistory, 
        fileContext,
        useBackgroundAgent // When ON, enables background tasks with progress bar
      )

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        toolsUsed: response.toolsUsed,
        backgroundTaskStarted: response.backgroundTaskStarted,
        backgroundTask: response.backgroundTask,
        navigation: response.navigation,
      }

      setMessages(prev => [...prev, assistantMessage])
      
      // If background task started, trigger global progress bar
      if (response.backgroundTaskStarted) {
        window.dispatchEvent(new CustomEvent('backgroundTaskStarted', { 
          detail: response.backgroundTask 
        }));
      }
      
      // If there's a navigation command, set it as pending so user can click to navigate
      if (response.navigation) {
        setPendingNavigation(response.navigation)
      }
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

  const handleNavigation = (nav: NavigationInfo) => {
    // Close the chat panel
    onClose()
    // Navigate to the path
    navigate(nav.path)
    // Clear pending navigation
    setPendingNavigation(null)
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
          <span className={styles.contextPage}>
            {chatContext?.label || currentPage.replace('-', ' ')}
          </span>
          <div className={styles.toggleWrapper}>
            <span className={styles.toggleLabel}>Background Agent</span>
            <button 
              className={`${styles.toggleSwitch} ${useBackgroundAgent ? styles.toggleOn : ''}`}
              onClick={() => setUseBackgroundAgent(!useBackgroundAgent)}
              title={useBackgroundAgent ? "Background Agent: ON" : "Background Agent: OFF"}
              role="switch"
              aria-checked={useBackgroundAgent}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className={styles.messages} ref={messagesContainerRef}>
          {/* Email Draft Context Banner */}
          {mergedContext.emailDraft && (
            <div className={styles.contextBanner}>
              <Mail size={14} />
              <span>I can see your email draft. Ask me to help improve it, check grammar, or suggest changes!</span>
            </div>
          )}
          
          {messages.length === 0 ? (
            <div className={styles.welcome}>
              <div className={styles.welcomeIcon}>
                <Sparkles size={32} />
              </div>
              <h3>{mergedContext.emailDraft ? 'Need help with your email?' : 'How can I help you?'}</h3>
              <p>
                {mergedContext.emailDraft 
                  ? "I can see your draft. Ask me to improve it, make it more professional, check for errors, or suggest a better subject line."
                  : "I can answer questions and take actions like logging time, creating events, and more."}
                {useBackgroundAgent && " Background Agent is ON - I'll run tasks with a progress bar."}
              </p>
              
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
              {messages.map((message, index) => {
                // Find the last user message to attach the ref
                const isLastUserMessage = message.role === 'user' && 
                  messages.slice(index + 1).every(m => m.role !== 'user')
                
                return (
                  <div
                    key={message.id}
                    ref={isLastUserMessage ? lastUserMessageRef : null}
                    className={`${styles.message} ${styles[message.role]}`}
                  >
                    {message.role === 'assistant' && (
                      <div className={styles.avatar}>
                        <Sparkles size={16} />
                      </div>
                    )}
                    <div className={styles.messageContent}>
                      <div className={styles.messageText}>
                        {message.attachedFile && (
                          <div className={styles.attachedFile}>
                            <FileText size={14} />
                            <span>{message.attachedFile.name}</span>
                          </div>
                        )}
                        {message.backgroundTaskStarted && (
                          <div className={styles.backgroundAgentDeployed}>
                            <Zap size={12} /> Background Agent Deployed
                          </div>
                        )}
                        {message.toolsUsed && !message.backgroundTaskStarted && (
                          <div className={styles.actionTaken}>
                            <Zap size={12} /> Action taken
                          </div>
                        )}
                        {message.content.split('\n').map((line, i) => (
                          <p key={i}>{line || <br />}</p>
                        ))}
                        {message.navigation && (
                          <button 
                            className={styles.navigationBtn}
                            onClick={() => handleNavigation(message.navigation!)}
                          >
                            <ExternalLink size={14} />
                            Open {message.navigation.label}
                          </button>
                        )}
                      </div>
                      <span className={styles.timestamp}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )
              })}
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
              
              {/* Always show suggestions even with existing messages */}
              {showSuggestions && suggestions.length > 0 && !isLoading && (
                <div className={styles.inlineSuggestions}>
                  <div className={styles.suggestionsHeader}>
                    <span className={styles.suggestionsLabel}>Quick questions:</span>
                    <button 
                      className={styles.hideSuggestionsBtn}
                      onClick={() => setShowSuggestions(false)}
                    >
                      Hide
                    </button>
                  </div>
                  <div className={styles.suggestionPills}>
                    {suggestions.slice(0, 3).map((suggestion, i) => (
                      <button
                        key={i}
                        className={styles.suggestionPill}
                        onClick={() => sendMessage(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Uploaded File Preview */}
        {uploadedFile && (
          <div className={styles.filePreview}>
            <div className={styles.fileInfo}>
              {getFileIcon(uploadedFile.type)}
              <span className={styles.fileName}>{uploadedFile.name}</span>
              <span className={styles.fileSize}>({(uploadedFile.size / 1024).toFixed(1)} KB)</span>
              {uploadedFile.extracting && <Loader2 size={14} className={styles.spinner} />}
            </div>
            <button onClick={removeUploadedFile} className={styles.removeFileBtn}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Input */}
        <div className={styles.inputArea}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.gif,.webp"
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={styles.attachBtn}
            disabled={isLoading}
            title="Attach file"
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={uploadedFile ? "Add a message or press send..." : "Ask anything..."}
            disabled={isLoading}
            className={styles.input}
          />
          <button
            onClick={() => sendMessage()}
            disabled={(!input.trim() && !uploadedFile) || isLoading}
            className={styles.sendBtn}
          >
            {isLoading ? <Loader2 size={18} className={styles.spinner} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}
