import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sparkles, Send, X, Loader2, ChevronRight, Zap, ExternalLink, Paperclip, FileText, Image, File, Mail, Cpu, Terminal, AlertCircle, RefreshCw, Mic, MicOff, Volume2, ToggleLeft, ToggleRight, Rocket } from 'lucide-react'
import { aiApi, documentsApi } from '../services/api'
import { useAIChat } from '../contexts/AIChatContext'
import styles from './AIChat.module.css'

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking'

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
  navigation?: NavigationInfo  // Navigation command from AI
  attachedFile?: { name: string; type: string }  // File that was attached
  isError?: boolean  // Indicates this is an error message
  isRetryable?: boolean  // Can the user retry this request
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
  const [_pendingNavigation, setPendingNavigation] = useState<NavigationInfo | null>(null)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [lastSentMessage, setLastSentMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const lastUserMessageRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Voice mode state
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [audioLevel, setAudioLevel] = useState(0)
  
  // Background agent mode state
  const [backgroundMode, setBackgroundMode] = useState(false)
  const [backgroundAvailable, setBackgroundAvailable] = useState<boolean | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const voiceModeRef = useRef(false) // Ref to avoid stale closures
  
  // Keep ref in sync with state
  useEffect(() => {
    voiceModeRef.current = voiceMode
  }, [voiceMode])
  
  // Check background agent availability when panel opens
  useEffect(() => {
    if (isOpen && backgroundAvailable === null) {
      aiApi.getBackgroundAgentStatus()
        .then(status => {
          setBackgroundAvailable(status.available && status.configured)
        })
        .catch(() => {
          setBackgroundAvailable(false)
        })
    }
  }, [isOpen, backgroundAvailable])

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
    setLastSentMessage(text) // Track for retry
    const currentFile = uploadedFile
    setUploadedFile(null)
    setIsLoading(true)

    try {
      // BACKGROUND MODE: Start a background task with Amplifier
      // User explicitly toggled this on, so be permissive about what counts as a task
      if (backgroundMode && backgroundAvailable) {
        const lowerText = text.toLowerCase().trim()
        
        // Only skip VERY simple greetings - everything else should use background agent
        const isVerySimpleGreeting = /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|bye)[\s!.,?]*$/i.test(lowerText)
        
        // Skip if it's just a greeting under 15 chars
        if (!isVerySimpleGreeting || lowerText.length > 15) {
          const result = await aiApi.startBackgroundTask(
            text || `Analyze and summarize this document: ${currentFile?.name}`
          )
          
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `🚀 **Background task started!**\n\nYour task has been submitted to the background agent (powered by Microsoft Amplifier).\n\n**Goal:** ${result.task?.goal || text}\n**Task ID:** ${result.task?.id || 'Unknown'}\n\nYou can close this panel and continue working. Check the progress bar at the bottom of the screen to monitor the task.`,
            timestamp: new Date(),
            toolsUsed: true,
          }
          
          setMessages(prev => [...prev, assistantMessage])
          
          // Dispatch event to notify BackgroundTaskBar
          window.dispatchEvent(new CustomEvent('backgroundTaskStarted', {
            detail: {
              taskId: result.task?.id,
              goal: result.task?.goal || text,
              isAmplifier: true  // Explicitly mark as Amplifier background task
            }
          }))
          
          setIsLoading(false)
          return
        }
        // Only very simple greetings fall through to normal chat
      }

      // NORMAL MODE: Use AI Agent with function calling
      // Build conversation history for context
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }))

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
      
      // Use AI Agent with function calling (can take actions immediately!)
      const response = await aiApi.agentChat(
        text || `Analyze and summarize this document: ${currentFile?.name}`, 
        conversationHistory, 
        fileContext
      )

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        toolsUsed: response.toolsUsed,
        navigation: response.navigation,
      }

      setMessages(prev => [...prev, assistantMessage])
      
      // If there's a navigation command, set it as pending so user can click to navigate
      if (response.navigation) {
        setPendingNavigation(response.navigation)
      }
    } catch (error: any) {
      console.error('AI chat error:', error)
      
      // Parse error response for better messaging
      let errorContent = "I'm sorry, I encountered an error. Please try again."
      let isRetryable = true
      
      // Handle ApiError from the service
      if (error?.name === 'ApiError' || error?.status) {
        errorContent = error.message || errorContent
        // Check for retryable status codes
        const retryableStatuses = [429, 500, 502, 503, 504]
        isRetryable = retryableStatuses.includes(error.status)
        
        // Use data.retryable if available
        if (error.data?.retryable !== undefined) {
          isRetryable = error.data.retryable
        }
        if (error.data?.error) {
          errorContent = error.data.error
        }
      } else if (error?.message) {
        // Network errors or other JS errors
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          errorContent = "Network error - please check your connection and try again."
          isRetryable = true
        } else {
          errorContent = error.message
        }
      }
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
        isError: true,
        isRetryable,
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

  const handleRetry = () => {
    if (lastSentMessage && !isLoading) {
      // Remove the last error message before retrying
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1]
        if (lastMsg?.isError) {
          return prev.slice(0, -1)
        }
        return prev
      })
      // Retry with the last message
      sendMessage(lastSentMessage)
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

  // Voice mode cleanup
  const cleanupVoiceMode = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    mediaRecorderRef.current = null
    audioChunksRef.current = []
    analyserRef.current = null
    setAudioLevel(0)
    setVoiceState('idle')
  }, [])

  // Start listening for voice input
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      streamRef.current = stream

      // Set up audio analysis for visual feedback
      audioContextRef.current = new AudioContext()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      source.connect(analyserRef.current)

      // Monitor audio levels
      const monitorAudio = () => {
        if (!analyserRef.current) return
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        setAudioLevel(average / 255)
        
        // Reset silence timeout when audio is detected
        if (average > 20) {
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
          }
          silenceTimeoutRef.current = setTimeout(() => {
            // Stop recording after 2 seconds of silence
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop()
            }
          }, 2000)
        }
        
        animationFrameRef.current = requestAnimationFrame(monitorAudio)
      }
      monitorAudio()

      // Set up media recorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        console.log('[Voice] Data available:', event.data.size, 'bytes')
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        console.log('[Voice] Recording stopped, chunks:', audioChunksRef.current.length)
        if (audioChunksRef.current.length === 0) {
          console.log('[Voice] No audio chunks, restarting...')
          setVoiceState('idle')
          // Restart listening if still in voice mode (use ref!)
          if (voiceModeRef.current) {
            setTimeout(() => startListening(), 500)
          }
          return
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        console.log('[Voice] Created blob:', audioBlob.size, 'bytes')
        audioChunksRef.current = []
        
        // Process the voice input
        await processVoiceInput(audioBlob)
      }

      // Start recording with timeslice to ensure data is captured
      mediaRecorder.start(1000) // Capture data every 1 second
      console.log('[Voice] Recording started')
      setVoiceState('listening')

      // Auto-stop after 30 seconds max
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      }, 30000)

    } catch (error) {
      console.error('Error starting voice:', error)
      setVoiceMode(false)
      cleanupVoiceMode()
    }
  }, [voiceMode, cleanupVoiceMode])

  // Process voice input - transcribe, get AI response, and speak back
  const processVoiceInput = async (audioBlob: Blob) => {
    console.log('[Voice] Processing audio blob:', audioBlob.size, 'bytes')
    setVoiceState('processing')
    
    try {
      // Build conversation history
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }))

      console.log('[Voice] Calling voiceChat API...')
      // Use voice chat endpoint for combined STT + AI + TTS
      const result = await aiApi.voiceChat(audioBlob, conversationHistory)
      console.log('[Voice] API response:', result)
      
      if (!result.success || !result.userText || result.userText.trim() === '') {
        console.log('[Voice] No speech detected in result')
        
        // Show the AI's response if there is one (e.g., "I couldn't understand that")
        if (result.aiText) {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: result.aiText,
            timestamp: new Date(),
          }
          setMessages(prev => [...prev, assistantMessage])
        }
        
        // Restart listening
        setVoiceState('idle')
        if (voiceModeRef.current) {
          setTimeout(() => startListening(), 1000)
        }
        return
      }

      console.log('[Voice] User said:', result.userText)
      console.log('[Voice] AI response:', result.aiText?.substring(0, 100))

      // Add user message to chat
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: result.userText,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, userMessage])

      // Add AI response to chat
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.aiText,
        timestamp: new Date(),
        toolsUsed: result.toolsUsed,
      }
      setMessages(prev => [...prev, assistantMessage])

      // Play the audio response if available (base64)
      if (result.audio) {
        console.log('[Voice] Playing audio response...')
        setVoiceState('speaking')
        const audioUrl = `data:audio/mp3;base64,${result.audio}`
        const audio = new Audio(audioUrl)
        audioRef.current = audio
        
        audio.onended = () => {
          console.log('[Voice] Audio playback ended')
          setVoiceState('idle')
          // Restart listening if still in voice mode (use ref!)
          if (voiceModeRef.current) {
            setTimeout(() => startListening(), 500)
          }
        }

        audio.onerror = (e) => {
          console.error('[Voice] Audio playback error:', e)
          setVoiceState('idle')
          if (voiceModeRef.current) {
            setTimeout(() => startListening(), 500)
          }
        }

        await audio.play()
      } else {
        console.log('[Voice] No audio in response, using TTS...')
        // No audio returned, use TTS separately
        setVoiceState('speaking')
        try {
          const ttsBlob = await aiApi.synthesizeSpeech(result.aiText)
          const audioUrl = URL.createObjectURL(ttsBlob)
          const audio = new Audio(audioUrl)
          audioRef.current = audio

          audio.onended = () => {
            URL.revokeObjectURL(audioUrl)
            setVoiceState('idle')
            if (voiceModeRef.current) {
              setTimeout(() => startListening(), 500)
            }
          }

          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl)
            setVoiceState('idle')
            if (voiceModeRef.current) {
              setTimeout(() => startListening(), 500)
            }
          }

          await audio.play()
        } catch (error) {
          console.error('[Voice] TTS error:', error)
          setVoiceState('idle')
          if (voiceModeRef.current) {
            setTimeout(() => startListening(), 500)
          }
        }
      }

    } catch (error: any) {
      console.error('[Voice] Processing error:', error)
      
      // Extract detailed error message
      let errorContent = "I couldn't process your voice input. Please try again."
      if (error.data?.error) {
        errorContent = error.data.error
      } else if (error.data?.details) {
        errorContent = `Error: ${error.data.details}`
      } else if (error.message) {
        errorContent = error.message
      }
      
      // Add error message
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
        isError: true,
        isRetryable: true,
      }
      setMessages(prev => [...prev, errorMessage])
      
      setVoiceState('idle')
      // Restart listening if still in voice mode (use ref!)
      if (voiceModeRef.current) {
        setTimeout(() => startListening(), 2000)
      }
    }
  }

  // Toggle voice mode
  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) {
      // Exiting voice mode
      setVoiceMode(false)
      cleanupVoiceMode()
    } else {
      // Entering voice mode
      setVoiceMode(true)
    }
  }, [voiceMode, cleanupVoiceMode])

  // Start listening when voice mode is activated
  useEffect(() => {
    if (voiceMode && voiceState === 'idle') {
      startListening()
    }
  }, [voiceMode, voiceState, startListening])

  // Cleanup on unmount or when chat is closed
  useEffect(() => {
    return () => {
      cleanupVoiceMode()
    }
  }, [cleanupVoiceMode])

  // Cleanup voice mode when chat is closed
  useEffect(() => {
    if (!isOpen && voiceMode) {
      setVoiceMode(false)
      cleanupVoiceMode()
    }
  }, [isOpen, voiceMode, cleanupVoiceMode])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <div className={styles.headerIcon}>
              {backgroundMode ? <Rocket size={16} /> : <Terminal size={16} />}
              <div className={styles.headerIconPulse} />
            </div>
            <div className={styles.headerText}>
              <span className={styles.headerMain}>APEX AI</span>
              <span className={styles.headerSub}>
                {backgroundMode ? 'Background Agent (Amplifier)' : 'v2.0 • Your Legal Assistant'}
              </span>
            </div>
          </div>
          <div className={styles.headerActions}>
            {/* Background Mode Toggle */}
            {backgroundAvailable && (
              <button
                onClick={() => setBackgroundMode(!backgroundMode)}
                className={`${styles.backgroundToggle} ${backgroundMode ? styles.backgroundToggleActive : ''}`}
                title={backgroundMode ? 'Switch to Normal Mode' : 'Switch to Background Mode'}
              >
                {backgroundMode ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                <span>{backgroundMode ? 'Background' : 'Normal'}</span>
              </button>
            )}
            {messages.length > 0 && !voiceMode && (
              <button onClick={clearChat} className={styles.clearBtn}>
                <Terminal size={12} />
                Clear
              </button>
            )}
            {voiceMode && (
              <button onClick={toggleVoiceMode} className={styles.exitVoiceBtn}>
                <X size={14} />
                Exit Voice
              </button>
            )}
            <button onClick={onClose} className={styles.closeBtn}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Background Mode Banner */}
        {backgroundMode && (
          <div className={styles.backgroundBanner}>
            <Rocket size={14} />
            <span>Background Mode: Tasks run autonomously using Microsoft Amplifier</span>
          </div>
        )}

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
                <div className={styles.welcomeIconInner}>
                  <Cpu size={28} />
                </div>
                <div className={styles.welcomeIconRing} />
                <div className={styles.welcomeIconRing2} />
              </div>
              <div className={styles.welcomeStatus}>
                <span className={styles.statusDot} />
                <span>System Online</span>
              </div>
              <h3>{mergedContext.emailDraft ? 'Email Assistant Ready' : 'Ready to Assist'}</h3>
              <p>
                {mergedContext.emailDraft 
                  ? "I can see your draft. Ask me to improve it, make it more professional, check for errors, or suggest a better subject line."
                  : "I can answer questions, analyze documents, and help with your legal work instantly."}
              </p>
              
              {suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  <div className={styles.suggestionsLabel}>
                    <Terminal size={12} />
                    <span>Suggested Commands</span>
                  </div>
                  {suggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      className={styles.suggestionBtn}
                      onClick={() => sendMessage(suggestion)}
                    >
                      <ChevronRight size={14} className={styles.suggestionArrow} />
                      <span>{suggestion}</span>
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
                        {message.toolsUsed && !message.isError && (
                          <div className={styles.actionTaken}>
                            <Zap size={12} /> Action taken
                          </div>
                        )}
                        {message.isError && (
                          <div className={styles.errorIndicator}>
                            <AlertCircle size={12} /> Error
                          </div>
                        )}
                        {message.content.split('\n').map((line, i) => (
                          <p key={i}>{line || <br />}</p>
                        ))}
                        {message.isError && message.isRetryable && (
                          <button 
                            className={styles.retryBtn}
                            onClick={handleRetry}
                            disabled={isLoading}
                          >
                            <RefreshCw size={14} />
                            Try again
                          </button>
                        )}
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

        {/* Voice Mode Bar - compact indicator above input */}
        {voiceMode && (
          <div className={styles.voiceModeBar}>
            <div 
              className={`${styles.voiceIndicator} ${styles[voiceState]}`}
              style={{ 
                transform: voiceState === 'listening' ? `scale(${1 + audioLevel * 0.3})` : undefined
              }}
            >
              {voiceState === 'listening' && <Mic size={18} />}
              {voiceState === 'processing' && <Loader2 size={18} className={styles.spinner} />}
              {voiceState === 'speaking' && <Volume2 size={18} />}
              {voiceState === 'idle' && <Mic size={18} />}
            </div>
            <div className={styles.voiceInfo}>
              <span className={styles.voiceStateLabel}>
                {voiceState === 'listening' && 'Listening...'}
                {voiceState === 'processing' && 'Thinking...'}
                {voiceState === 'speaking' && 'Speaking...'}
                {voiceState === 'idle' && 'Starting...'}
              </span>
              <span className={styles.voiceHintSmall}>
                {voiceState === 'listening' && 'Speak now'}
                {voiceState === 'processing' && 'Processing'}
                {voiceState === 'speaking' && 'Wait for response'}
                {voiceState === 'idle' && 'Initializing...'}
              </span>
            </div>
            <button onClick={toggleVoiceMode} className={styles.exitVoiceBtnSmall}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Input */}
        <div className={styles.inputArea}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={styles.attachBtn}
            disabled={isLoading || voiceMode}
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
            disabled={isLoading || voiceMode}
            className={styles.input}
          />
          <button
            onClick={toggleVoiceMode}
            className={`${styles.micBtn} ${voiceMode ? styles.micActive : ''}`}
            disabled={isLoading}
            title={voiceMode ? "Exit voice mode" : "Start voice mode"}
          >
            {voiceMode ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            onClick={() => sendMessage()}
            disabled={(!input.trim() && !uploadedFile) || isLoading || voiceMode}
            className={styles.sendBtn}
          >
            {isLoading ? <Loader2 size={18} className={styles.spinner} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}
