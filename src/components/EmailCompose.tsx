import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  X, Minus, Maximize2, Send, Paperclip, Trash2, 
  FileText, File, Loader2, ChevronDown, Upload, Check, Sparkles,
  Mail, Settings, AlertCircle
} from 'lucide-react'
import { useEmailCompose } from '../contexts/EmailComposeContext'
import { useAIChat } from '../contexts/AIChatContext'
import { documentsApi, integrationsApi } from '../services/api'
import styles from './EmailCompose.module.css'

export function EmailCompose() {
  const navigate = useNavigate()
  const {
    isOpen,
    draft,
    isMinimized,
    emailIntegration,
    closeCompose,
    minimizeCompose,
    maximizeCompose,
    updateDraft,
    addAttachment,
    removeAttachment,
    dismissSetupPrompt
  } = useEmailCompose()

  const { isOpen: aiChatOpen, openChat, closeChat } = useAIChat()
  
  const [sending, setSending] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [documents, setDocuments] = useState<Array<{ id: string; name: string; size: number }>>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [aiAssistActive, setAiAssistActive] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Handle opening AI assistant alongside email with draft context
  const handleOpenAI = () => {
    setAiAssistActive(true)
    
    // Build email context for AI
    const emailContext = {
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      body: draft.body,
      attachments: draft.attachments.map(a => a.name)
    }
    
    openChat({
      label: 'Email Assistant',
      contextType: 'email_draft',
      suggestedQuestions: [
        'Help me improve this email',
        'Make it more professional',
        'Make it shorter and more concise',
        'Check for grammar and spelling',
        'Suggest a better subject line'
      ],
      additionalContext: {
        emailDraft: emailContext,
        draftSummary: `Drafting email${draft.to ? ` to: ${draft.to}` : ''}${draft.subject ? `\nSubject: ${draft.subject}` : ''}${draft.body ? `\n\nBody:\n${draft.body}` : ''}`
      }
    })
  }

  // Track when AI is closed externally
  useEffect(() => {
    if (!aiChatOpen && aiAssistActive) {
      setAiAssistActive(false)
    }
  }, [aiChatOpen, aiAssistActive])

  // Load documents when attachment menu opens
  useEffect(() => {
    if (showAttachMenu && documents.length === 0) {
      loadDocuments()
    }
  }, [showAttachMenu])

  // Auto-focus body when opened
  useEffect(() => {
    if (isOpen && !isMinimized && bodyRef.current) {
      bodyRef.current.focus()
    }
  }, [isOpen, isMinimized])

  const loadDocuments = async () => {
    setLoadingDocs(true)
    try {
      const data = await documentsApi.getAll()
      setDocuments((data.documents || []).slice(0, 20).map((d: any) => ({
        id: d.id,
        name: d.name || d.originalName,
        size: d.size || 0
      })))
    } catch (error) {
      console.error('Failed to load documents:', error)
    } finally {
      setLoadingDocs(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    
    Array.from(files).forEach(file => {
      addAttachment({
        id: `file-${Date.now()}-${Math.random()}`,
        name: file.name,
        size: file.size,
        type: 'file',
        data: file
      })
    })
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setShowAttachMenu(false)
  }

  const handleDocumentAttach = (doc: { id: string; name: string; size: number }) => {
    addAttachment({
      id: doc.id,
      name: doc.name,
      size: doc.size,
      type: 'document'
    })
    setShowAttachMenu(false)
  }

  const formatFileSize = (bytes: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const handleSend = async () => {
    if (!draft.to.trim()) {
      setNotification({ type: 'error', message: 'Please enter a recipient' })
      setTimeout(() => setNotification(null), 3000)
      return
    }

    setSending(true)
    try {
      // Get document IDs for attachments
      const documentIds = draft.attachments
        .filter(a => a.type === 'document' || a.type === 'invoice')
        .map(a => a.id)

      await integrationsApi.sendOutlookEmail?.({
        to: draft.to,
        cc: draft.cc || undefined,
        subject: draft.subject,
        body: draft.body,
        documentIds: documentIds.length > 0 ? documentIds : undefined
      })

      setNotification({ type: 'success', message: 'Email sent!' })
      setTimeout(() => {
        setNotification(null)
        closeCompose(false) // Don't save draft since we sent it
      }, 1500)
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to send email' })
      setTimeout(() => setNotification(null), 3000)
    } finally {
      setSending(false)
    }
  }

  const handleDiscard = () => {
    if (draft.to || draft.subject || draft.body) {
      if (!confirm('Discard this draft?')) return
    }
    closeCompose(false)
  }

  // Show setup prompt if email not connected
  if (emailIntegration.showSetupPrompt) {
    return (
      <div className={styles.setupPrompt}>
        <div className={styles.setupPromptContent}>
          <div className={styles.setupPromptIcon}>
            <Mail size={32} />
            <AlertCircle size={16} className={styles.setupAlertIcon} />
          </div>
          <h3>Connect Your Email</h3>
          <p>
            To send emails from Apex, you need to connect your email account. 
            We support <strong>Microsoft Outlook</strong> and <strong>Gmail</strong>.
          </p>
          <div className={styles.setupPromptActions}>
            <button 
              className={styles.setupDismissBtn}
              onClick={dismissSetupPrompt}
            >
              Cancel
            </button>
            <button 
              className={styles.setupConnectBtn}
              onClick={() => {
                dismissSetupPrompt()
                navigate('/app/settings/integrations')
              }}
            >
              <Settings size={16} />
              Go to Integrations
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!isOpen) return null

  // Minimized state - just show header bar
  if (isMinimized) {
    return (
      <div className={`${styles.composeMinimized} ${aiAssistActive ? styles.shiftedLeft : ''}`} onClick={maximizeCompose}>
        <div className={styles.minimizedContent}>
          <span className={styles.minimizedSubject}>
            {draft.subject || 'New Message'}
          </span>
        </div>
        <div className={styles.minimizedActions}>
          <button onClick={(e) => { e.stopPropagation(); maximizeCompose() }}>
            <Maximize2 size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); closeCompose(true) }}>
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.composeContainer} ${aiAssistActive ? styles.shiftedLeft : ''}`}>
      {/* Notification */}
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'success' ? <Check size={14} /> : <X size={14} />}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className={styles.composeHeader}>
        <span className={styles.headerTitle}>New Message</span>
        <div className={styles.headerActions}>
          <button onClick={minimizeCompose} title="Minimize">
            <Minus size={14} />
          </button>
          <button onClick={() => closeCompose(true)} title="Save & Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Form */}
      <div className={styles.composeForm}>
        <div className={styles.formField}>
          <label>To</label>
          <input
            type="text"
            value={draft.to}
            onChange={(e) => updateDraft({ to: e.target.value })}
            placeholder="Recipients"
          />
        </div>
        
        <div className={styles.formField}>
          <label>Cc</label>
          <input
            type="text"
            value={draft.cc}
            onChange={(e) => updateDraft({ cc: e.target.value })}
            placeholder="Cc"
          />
        </div>

        <div className={styles.formField}>
          <label>Subject</label>
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => updateDraft({ subject: e.target.value })}
            placeholder="Subject"
          />
        </div>

        <textarea
          ref={bodyRef}
          className={styles.composeBody}
          value={draft.body}
          onChange={(e) => updateDraft({ body: e.target.value })}
          placeholder="Compose email..."
        />

        {/* Attachments */}
        {draft.attachments.length > 0 && (
          <div className={styles.attachmentsList}>
            {draft.attachments.map(att => (
              <div key={att.id} className={styles.attachmentChip}>
                {att.type === 'invoice' ? <FileText size={12} /> : <File size={12} />}
                <span>{att.name}</span>
                {att.size > 0 && <span className={styles.attachmentSize}>{formatFileSize(att.size)}</span>}
                <button onClick={() => removeAttachment(att.id)}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer / Toolbar */}
      <div className={styles.composeFooter}>
        <button 
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={sending || !draft.to.trim()}
        >
          {sending ? <Loader2 size={16} className={styles.spinning} /> : <Send size={16} />}
          {sending ? 'Sending...' : 'Send'}
        </button>

        <div className={styles.toolbarActions}>
          {/* Attachment Button */}
          <div className={styles.attachDropdown}>
            <button 
              className={styles.toolbarBtn}
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              title="Attach files"
            >
              <Paperclip size={18} />
            </button>
            
            {showAttachMenu && (
              <div className={styles.attachMenu}>
                <button 
                  className={styles.attachOption}
                  onClick={() => {
                    fileInputRef.current?.click()
                  }}
                >
                  <Upload size={16} />
                  Upload from computer
                </button>
                
                <div className={styles.attachDivider} />
                
                <div className={styles.attachSection}>
                  <span className={styles.attachSectionLabel}>From Documents</span>
                  {loadingDocs ? (
                    <div className={styles.attachLoading}>
                      <Loader2 size={14} className={styles.spinning} />
                      Loading...
                    </div>
                  ) : documents.length === 0 ? (
                    <span className={styles.noAttachDocs}>No documents</span>
                  ) : (
                    <div className={styles.attachDocsList}>
                      {documents.map(doc => (
                        <button
                          key={doc.id}
                          className={styles.attachDocItem}
                          onClick={() => handleDocumentAttach(doc)}
                          disabled={draft.attachments.some(a => a.id === doc.id)}
                        >
                          <FileText size={14} />
                          <span>{doc.name}</span>
                          {draft.attachments.some(a => a.id === doc.id) && (
                            <Check size={14} className={styles.attachedIcon} />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          {/* AI Assistant */}
          <button 
            className={`${styles.toolbarBtn} ${aiAssistActive ? styles.aiActive : ''}`}
            onClick={handleOpenAI}
            title="AI Assistant"
          >
            <Sparkles size={18} />
          </button>

          {/* Discard */}
          <button 
            className={styles.toolbarBtn}
            onClick={handleDiscard}
            title="Discard"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
