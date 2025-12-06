import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAIStore, type AIMode } from '../stores/aiStore'
import { useAuthStore } from '../stores/authStore'
import { 
  Sparkles, Send, Plus, MessageSquare, Trash2, 
  MessageCircle, FileEdit, FileText, Paperclip, X,
  FileSearch, History, ChevronRight, Loader2
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './AIAssistantPage.module.css'

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
  const { 
    conversations, 
    activeConversationId, 
    selectedMode,
    isLoading,
    documentContext,
    redlineDocuments,
    setSelectedMode,
    setDocumentContext,
    setRedlineDocument,
    createConversation, 
    setActiveConversation,
    generateResponse,
    deleteConversation,
    clearDocumentContext
  } = useAIStore()
  const { user } = useAuthStore()
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
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

  // Scroll to the last user message when messages change
  useEffect(() => {
    if (lastUserMessageRef.current && activeConversation?.messages?.length) {
      lastUserMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activeConversation?.messages])

  // Client-side file content extraction
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = async (e) => {
        const result = e.target?.result
        
        // Handle image files
        if (file.type.startsWith('image/')) {
          resolve(`[IMAGE FILE: ${file.name}]\n\nThis appears to be an image file. For best results with legal documents, please:\n1. Convert the image to PDF format, or\n2. Use OCR software to extract the text first, or\n3. Describe what you see in the image and I can provide guidance.\n\nI can still help analyze and draft documents based on your description of the image content.`)
        }
        // Handle PDF files
        else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          try {
            const arrayBuffer = result as ArrayBuffer
            const pdfjsLib = await import('pdfjs-dist')
            
            // Use the worker from unpkg CDN which is more reliable for cross-origin
            // Match the exact version from our package
            pdfjsLib.GlobalWorkerOptions.workerSrc = 
              `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`
            
            const uint8Array = new Uint8Array(arrayBuffer)
            const loadingTask = pdfjsLib.getDocument({ 
              data: uint8Array,
              useSystemFonts: true,
              // Disable some features for better compatibility
              disableFontFace: true,
              isEvalSupported: false
            })
            
            const pdf = await loadingTask.promise
            
            let fullText = ''
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i)
              const textContent = await page.getTextContent()
              // Better text extraction with proper spacing
              const pageText = textContent.items
                .map((item: any) => {
                  const text = item.str || ''
                  // Add space if the item has a significant transform (new line/word)
                  const hasTransform = item.hasEOL || (item.transform && item.transform[5] !== 0)
                  return hasTransform ? text + ' ' : text
                })
                .join('')
                .replace(/\s+/g, ' ')
                .trim()
              
              if (pageText) {
                fullText += `\n--- Page ${i} ---\n${pageText}\n`
              }
            }
            
            if (fullText.trim().length === 0) {
              resolve(`[PDF FILE: ${file.name}]\n\nThis PDF appears to be scanned or image-based with no extractable text. For best results:\n1. Use OCR software to extract the text first, or\n2. Describe the content you need analyzed.`)
            } else {
              resolve(`[PDF FILE: ${file.name}]\n\nExtracted content from PDF (${pdf.numPages} pages):\n${fullText}`)
            }
          } catch (err) {
            console.error('PDF extraction error:', err)
            // Provide more helpful error message
            const errorMessage = err instanceof Error ? err.message : 'Unknown error'
            resolve(`[PDF FILE: ${file.name}]\n\nUnable to extract text from this PDF. Error: ${errorMessage}\n\nThis may be a scanned/image-based PDF or a protected document. Please try:\n1. Using OCR software to extract the text first, or\n2. Copying and pasting the text content manually.`)
          }
        }
        // Handle Word .docx files
        else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                 file.name.toLowerCase().endsWith('.docx')) {
          try {
            const arrayBuffer = result as ArrayBuffer
            const mammoth = await import('mammoth')
            const result2 = await mammoth.extractRawText({ arrayBuffer })
            if (result2.value.trim().length === 0) {
              resolve(`[WORD DOCUMENT: ${file.name}]\n\nThis document appears to be empty or contains only non-text content (images, charts, etc.).`)
            } else {
              resolve(`[WORD DOCUMENT: ${file.name}]\n\nExtracted content:\n${result2.value}`)
            }
          } catch (err) {
            console.error('DOCX extraction error:', err)
            resolve(`[WORD DOCUMENT: ${file.name}]\n\nUnable to extract text from this Word document. The file may be corrupted or in an unsupported format.`)
          }
        }
        // Handle old Word .doc files
        else if (file.type === 'application/msword' || file.name.toLowerCase().endsWith('.doc')) {
          // Basic text extraction attempt for .doc files
          try {
            const arrayBuffer = result as ArrayBuffer
            const textDecoder = new TextDecoder('utf-8', { fatal: false })
            const text = textDecoder.decode(arrayBuffer)
            // Extract readable text (filter out binary garbage)
            const cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim()
            if (cleanText.length > 100) {
              resolve(`[WORD DOCUMENT: ${file.name}]\n\nExtracted content (legacy .doc format - some formatting may be lost):\n${cleanText.substring(0, 50000)}`)
            } else {
              resolve(`[WORD DOCUMENT: ${file.name}]\n\nThis is a legacy .doc format. For best results, please save as .docx and re-upload.`)
            }
          } catch (err) {
            resolve(`[WORD DOCUMENT: ${file.name}]\n\nUnable to extract text. Please convert to .docx format.`)
          }
        }
        // Handle Excel files
        else if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                 file.type === 'application/vnd.ms-excel' ||
                 file.name.toLowerCase().endsWith('.xlsx') ||
                 file.name.toLowerCase().endsWith('.xls')) {
          try {
            const arrayBuffer = result as ArrayBuffer
            const XLSX = await import('xlsx')
            const workbook = XLSX.read(arrayBuffer, { type: 'array' })
            
            let fullContent = `[EXCEL FILE: ${file.name}]\n\nExtracted content:\n`
            workbook.SheetNames.forEach((sheetName: string) => {
              const sheet = workbook.Sheets[sheetName]
              const csv = XLSX.utils.sheet_to_csv(sheet)
              fullContent += `\n--- Sheet: ${sheetName} ---\n${csv}\n`
            })
            resolve(fullContent)
          } catch (err) {
            console.error('Excel extraction error:', err)
            resolve(`[EXCEL FILE: ${file.name}]\n\nUnable to extract data from this Excel file.`)
          }
        }
        // Handle RTF files
        else if (file.type === 'application/rtf' || file.name.toLowerCase().endsWith('.rtf')) {
          try {
            const text = result as string
            // Basic RTF to text conversion - strip RTF control words
            const plainText = text
              .replace(/\\[a-z]+\d*\s?/gi, '') // Remove RTF control words
              .replace(/[{}]/g, '') // Remove braces
              .replace(/\\\\/g, '\\') // Unescape backslashes
              .replace(/\\'/g, "'") // Unescape quotes
              .replace(/\s+/g, ' ')
              .trim()
            
            if (plainText.length > 50) {
              resolve(`[RTF FILE: ${file.name}]\n\nExtracted content:\n${plainText}`)
            } else {
              resolve(`[RTF FILE: ${file.name}]\n\nUnable to extract meaningful text from this RTF file.`)
            }
          } catch (err) {
            resolve(`[RTF FILE: ${file.name}]\n\nUnable to extract text from this RTF file.`)
          }
        }
        // Handle text-based files (txt, csv, json, xml, html, md, etc.)
        else {
          const textContent = result as string
          const fileExt = file.name.split('.').pop()?.toLowerCase() || 'txt'
          const fileTypeLabel = {
            'txt': 'TEXT FILE',
            'csv': 'CSV FILE',
            'json': 'JSON FILE',
            'xml': 'XML FILE',
            'html': 'HTML FILE',
            'md': 'MARKDOWN FILE'
          }[fileExt] || 'FILE'
          
          if (textContent.trim().length === 0) {
            resolve(`[${fileTypeLabel}: ${file.name}]\n\nThis file appears to be empty.`)
          } else {
            resolve(`[${fileTypeLabel}: ${file.name}]\n\nContent:\n${textContent}`)
          }
        }
      }
      
      reader.onerror = () => reject(reader.error)
      
      // Determine if file needs binary or text reading
      const needsArrayBuffer = 
        file.type === 'application/pdf' || 
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel' ||
        file.type === 'application/msword' ||
        file.name.toLowerCase().endsWith('.pdf') ||
        file.name.toLowerCase().endsWith('.docx') ||
        file.name.toLowerCase().endsWith('.doc') ||
        file.name.toLowerCase().endsWith('.xlsx') ||
        file.name.toLowerCase().endsWith('.xls')
      
      if (needsArrayBuffer) {
        reader.readAsArrayBuffer(file)
      } else {
        // Read as text for CSV, TXT, RTF, and other text-based files
        reader.readAsText(file)
      }
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target?: 'doc1' | 'doc2') => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Reset input immediately
    e.target.value = ''
    setIsExtracting(true)

    try {
      const content = await readFileContent(file)
      const doc = {
        name: file.name,
        content,
        type: file.type,
        size: file.size
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
                  <FileText size={14} />
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
                  accept=".pdf,.doc,.docx,.txt,.rtf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.webp,.json,.xml,.html,.md"
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
                <p>Upload a document to analyze. Ask questions, get summaries, or extract key information.</p>
                
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
                        {documentContext.type} • Ready to analyze
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
                  accept=".pdf,.doc,.docx,.txt,.rtf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.webp,.json,.xml,.html,.md"
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
                      accept=".pdf,.doc,.docx,.txt,.rtf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.webp,.json,.xml,.html,.md"
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
                      accept=".pdf,.doc,.docx,.txt,.rtf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.webp,.json,.xml,.html,.md"
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
