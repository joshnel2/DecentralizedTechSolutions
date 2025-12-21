import { useState, useEffect, useRef } from 'react'
import { 
  Mail, RefreshCw, Link2, Search, User, Briefcase, 
  ArrowLeft, FileEdit, Inbox, Send, Reply, ReplyAll, 
  Forward, Trash2, Star, Paperclip, X, ChevronLeft,
  Settings, Archive, AlertCircle, Check, Loader2,
  PenSquare, MoreVertical, Clock
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { integrationsApi, mattersApi, clientsApi, userSettingsApi } from '../services/api'
import styles from './OutlookIntegrationPage.module.css'

interface Email {
  id: string
  subject: string
  from: string
  fromName: string
  to?: string
  toName?: string
  receivedAt: string
  isRead: boolean
  preview: string
  body?: string
  bodyPreview?: string
  hasAttachments?: boolean
  importance?: string
  conversationId?: string
}

interface Draft {
  id: string
  subject: string
  to: string
  toNames: string
  createdAt: string
  lastModified: string
  preview: string
  body?: string
}

interface Matter {
  id: string
  name: string
  number: string
}

interface Client {
  id: string
  name: string
  displayName: string
  email?: string
}

type Folder = 'inbox' | 'drafts' | 'sent' | 'archive'
type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward' | null

export function OutlookIntegrationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const composeBodyRef = useRef<HTMLTextAreaElement>(null)
  
  // State
  const [activeFolder, setActiveFolder] = useState<Folder>('inbox')
  const [emails, setEmails] = useState<Email[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [sentEmails, setSentEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [emailBody, setEmailBody] = useState<string>('')
  const [loadingBody, setLoadingBody] = useState(false)
  
  // Link to matter/client
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [matters, setMatters] = useState<Matter[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [linkType, setLinkType] = useState<'matter' | 'client'>('matter')
  const [selectedLinkId, setSelectedLinkId] = useState('')
  const [linking, setLinking] = useState(false)
  
  // Compose email
  const [composeMode, setComposeMode] = useState<ComposeMode>(null)
  const [composeTo, setComposeTo] = useState('')
  const [composeCc, setComposeCc] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [sending, setSending] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  
  // Signature
  const [signature, setSignature] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [editingSignature, setEditingSignature] = useState('')
  
  // Notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadEmails()
    loadDrafts()
    loadSentEmails()
    loadMattersAndClients()
    loadSignature()
  }, [])

  // Handle emailId URL parameter to open a specific email
  useEffect(() => {
    const emailId = searchParams.get('emailId')
    if (emailId && emails.length > 0) {
      const email = emails.find(e => e.id === emailId)
      if (email) {
        loadEmailBody(email)
      }
    }
  }, [emails, searchParams])

  const loadEmails = async () => {
    try {
      setLoading(true)
      const data = await integrationsApi.getOutlookEmails()
      setEmails(data.emails || [])
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to load emails' })
    } finally {
      setLoading(false)
    }
  }

  const loadDrafts = async () => {
    try {
      const data = await integrationsApi.getOutlookDrafts()
      setDrafts(data.drafts || [])
    } catch (error: any) {
      console.error('Failed to load drafts:', error)
    }
  }

  const loadSentEmails = async () => {
    try {
      const data = await integrationsApi.getOutlookSent?.() || { emails: [] }
      setSentEmails(data.emails || [])
    } catch (error) {
      console.error('Failed to load sent emails:', error)
    }
  }

  const loadMattersAndClients = async () => {
    try {
      const [mattersData, clientsData] = await Promise.all([
        mattersApi.getAll(),
        clientsApi.getAll()
      ])
      setMatters(mattersData.matters || [])
      setClients(clientsData.clients || [])
    } catch (error) {
      // Silently fail
    }
  }

  const loadSignature = async () => {
    try {
      const settings = await userSettingsApi.get()
      if (settings?.emailSignature) {
        setSignature(settings.emailSignature)
        setEditingSignature(settings.emailSignature)
      }
    } catch (error) {
      console.error('Failed to load signature:', error)
    }
  }

  const saveSignature = async () => {
    try {
      await userSettingsApi.update({ emailSignature: editingSignature })
      setSignature(editingSignature)
      setShowSettings(false)
      setNotification({ type: 'success', message: 'Signature saved' })
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to save signature' })
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await loadEmails()
      await loadDrafts()
      await loadSentEmails()
      setNotification({ type: 'success', message: 'Outlook synced successfully' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  const loadEmailBody = async (email: Email) => {
    setSelectedEmail(email)
    setLoadingBody(true)
    try {
      const data = await integrationsApi.getOutlookEmailBody?.(email.id)
      setEmailBody(data?.body || email.preview || '')
    } catch (error) {
      setEmailBody(email.preview || 'Unable to load email body')
    } finally {
      setLoadingBody(false)
    }
  }

  const handleLinkEmail = async () => {
    if (!selectedEmail || !selectedLinkId) return
    
    setLinking(true)
    try {
      await integrationsApi.linkEmailToMatter(selectedEmail.id, {
        matterId: linkType === 'matter' ? selectedLinkId : undefined,
        clientId: linkType === 'client' ? selectedLinkId : undefined,
      })
      setNotification({ type: 'success', message: `Email linked to ${linkType} successfully` })
      setShowLinkModal(false)
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to link email' })
    } finally {
      setLinking(false)
    }
  }

  const openCompose = (mode: ComposeMode, replyToEmail?: Email) => {
    setComposeMode(mode)
    
    if (mode === 'new') {
      setComposeTo('')
      setComposeCc('')
      setComposeSubject('')
      setComposeBody(signature ? `\n\n${signature}` : '')
    } else if (replyToEmail && (mode === 'reply' || mode === 'replyAll')) {
      setComposeTo(replyToEmail.from || '')
      setComposeCc('')
      setComposeSubject(`Re: ${replyToEmail.subject}`)
      const quotedText = `\n\n---\nOn ${formatFullDate(replyToEmail.receivedAt)}, ${replyToEmail.fromName || replyToEmail.from} wrote:\n\n${emailBody || replyToEmail.preview}`
      setComposeBody((signature ? `\n\n${signature}` : '') + quotedText)
    } else if (replyToEmail && mode === 'forward') {
      setComposeTo('')
      setComposeCc('')
      setComposeSubject(`Fwd: ${replyToEmail.subject}`)
      const forwardedText = `\n\n---\n---------- Forwarded message ----------\nFrom: ${replyToEmail.fromName || replyToEmail.from}\nDate: ${formatFullDate(replyToEmail.receivedAt)}\nSubject: ${replyToEmail.subject}\n\n${emailBody || replyToEmail.preview}`
      setComposeBody((signature ? `\n\n${signature}` : '') + forwardedText)
    }
    
    setTimeout(() => composeBodyRef.current?.focus(), 100)
  }

  const closeCompose = () => {
    if (composeBody.trim() && composeBody !== signature) {
      if (!confirm('Discard this draft?')) return
    }
    setComposeMode(null)
    setComposeTo('')
    setComposeCc('')
    setComposeSubject('')
    setComposeBody('')
  }

  const sendEmail = async () => {
    if (!composeTo.trim()) {
      setNotification({ type: 'error', message: 'Please enter a recipient' })
      return
    }

    setSending(true)
    try {
      await integrationsApi.sendOutlookEmail?.({
        to: composeTo,
        cc: composeCc || undefined,
        subject: composeSubject,
        body: composeBody,
      })
      setNotification({ type: 'success', message: 'Email sent successfully' })
      setComposeMode(null)
      setComposeTo('')
      setComposeCc('')
      setComposeSubject('')
      setComposeBody('')
      loadSentEmails()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to send email' })
    } finally {
      setSending(false)
    }
  }

  const saveDraft = async () => {
    setSavingDraft(true)
    try {
      await integrationsApi.saveOutlookDraft?.({
        to: composeTo,
        cc: composeCc || undefined,
        subject: composeSubject,
        body: composeBody,
      })
      setNotification({ type: 'success', message: 'Draft saved' })
      loadDrafts()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to save draft' })
    } finally {
      setSavingDraft(false)
    }
  }

  const deleteEmail = async (emailId: string) => {
    if (!confirm('Move this email to trash?')) return
    try {
      await integrationsApi.deleteOutlookEmail?.(emailId)
      setEmails(emails.filter(e => e.id !== emailId))
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null)
        setEmailBody('')
      }
      setNotification({ type: 'success', message: 'Email moved to trash' })
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Failed to delete email' })
    }
  }

  const archiveEmail = async (emailId: string) => {
    try {
      await integrationsApi.archiveOutlookEmail?.(emailId)
      setEmails(emails.filter(e => e.id !== emailId))
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null)
        setEmailBody('')
      }
      setNotification({ type: 'success', message: 'Email archived' })
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Failed to archive email' })
    }
  }

  const getFilteredList = () => {
    const term = searchTerm.toLowerCase()
    switch (activeFolder) {
      case 'inbox':
        return emails.filter(e => 
          e.subject?.toLowerCase().includes(term) ||
          e.from?.toLowerCase().includes(term) ||
          e.fromName?.toLowerCase().includes(term)
        )
      case 'drafts':
        return drafts.filter(d =>
          d.subject?.toLowerCase().includes(term) ||
          d.to?.toLowerCase().includes(term)
        )
      case 'sent':
        return sentEmails.filter(e =>
          e.subject?.toLowerCase().includes(term) ||
          e.to?.toLowerCase().includes(term)
        )
      default:
        return []
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Yesterday'
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString([], { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const folderCounts = {
    inbox: emails.length,
    drafts: drafts.length,
    sent: sentEmails.length,
    archive: 0
  }

  const unreadCount = emails.filter(e => !e.isRead).length

  return (
    <div className={styles.emailClient}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button className={styles.backBtn} onClick={() => navigate('/app/integrations')}>
            <ArrowLeft size={18} />
          </button>
          <div className={styles.logoSection}>
            <Mail size={24} />
            <span>Outlook</span>
          </div>
        </div>

        <button className={styles.composeBtn} onClick={() => openCompose('new')}>
          <PenSquare size={18} />
          Compose
        </button>

        <nav className={styles.folders}>
          <button 
            className={`${styles.folder} ${activeFolder === 'inbox' ? styles.active : ''}`}
            onClick={() => { setActiveFolder('inbox'); setSelectedEmail(null) }}
          >
            <Inbox size={18} />
            <span>Inbox</span>
            {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
          </button>
          <button 
            className={`${styles.folder} ${activeFolder === 'drafts' ? styles.active : ''}`}
            onClick={() => { setActiveFolder('drafts'); setSelectedEmail(null) }}
          >
            <FileEdit size={18} />
            <span>Drafts</span>
            {folderCounts.drafts > 0 && <span className={styles.count}>{folderCounts.drafts}</span>}
          </button>
          <button 
            className={`${styles.folder} ${activeFolder === 'sent' ? styles.active : ''}`}
            onClick={() => { setActiveFolder('sent'); setSelectedEmail(null) }}
          >
            <Send size={18} />
            <span>Sent</span>
          </button>
          <button 
            className={`${styles.folder} ${activeFolder === 'archive' ? styles.active : ''}`}
            onClick={() => { setActiveFolder('archive'); setSelectedEmail(null) }}
          >
            <Archive size={18} />
            <span>Archive</span>
          </button>
        </nav>

        <div className={styles.sidebarFooter}>
          <button className={styles.settingsBtn} onClick={() => setShowSettings(true)}>
            <Settings size={18} />
            Settings
          </button>
          <button 
            className={styles.syncBtn} 
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={18} className={syncing ? styles.spinning : ''} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Email List */}
      <div className={styles.emailList}>
        <div className={styles.listHeader}>
          <h2>{activeFolder.charAt(0).toUpperCase() + activeFolder.slice(1)}</h2>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingList}>
            <Loader2 size={24} className={styles.spinning} />
          </div>
        ) : (
          <div className={styles.listItems}>
            {getFilteredList().length === 0 ? (
              <div className={styles.emptyList}>
                <Mail size={32} />
                <p>No emails</p>
              </div>
            ) : (
              getFilteredList().map((item: any) => (
                <div 
                  key={item.id}
                  className={`${styles.emailItem} ${!item.isRead ? styles.unread : ''} ${selectedEmail?.id === item.id ? styles.selected : ''}`}
                  onClick={() => loadEmailBody(item)}
                >
                  <div className={styles.emailItemHeader}>
                    <span className={styles.sender}>
                      {activeFolder === 'sent' ? `To: ${item.toName || item.to || '(No recipient)'}` : (item.fromName || item.from || 'Unknown')}
                    </span>
                    <span className={styles.date}>{formatDate(item.receivedAt || item.lastModified || item.createdAt)}</span>
                  </div>
                  <div className={styles.emailItemSubject}>
                    {item.hasAttachments && <Paperclip size={12} />}
                    {item.subject || '(No Subject)'}
                  </div>
                  <div className={styles.emailItemPreview}>
                    {item.preview || item.bodyPreview || ''}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Email Detail / Reading Pane */}
      <div className={styles.readingPane}>
        {selectedEmail ? (
          <>
            <div className={styles.emailHeader}>
              <button className={styles.closePane} onClick={() => setSelectedEmail(null)}>
                <ChevronLeft size={20} />
              </button>
              <div className={styles.emailActions}>
                <button onClick={() => openCompose('reply', selectedEmail)} title="Reply">
                  <Reply size={18} />
                </button>
                <button onClick={() => openCompose('replyAll', selectedEmail)} title="Reply All">
                  <ReplyAll size={18} />
                </button>
                <button onClick={() => openCompose('forward', selectedEmail)} title="Forward">
                  <Forward size={18} />
                </button>
                <button onClick={() => archiveEmail(selectedEmail.id)} title="Archive">
                  <Archive size={18} />
                </button>
                <button onClick={() => deleteEmail(selectedEmail.id)} title="Delete" className={styles.deleteAction}>
                  <Trash2 size={18} />
                </button>
                <button 
                  onClick={() => setShowLinkModal(true)} 
                  title="Link to Matter/Client"
                  className={styles.linkAction}
                >
                  <Link2 size={18} />
                </button>
              </div>
            </div>

            <div className={styles.emailContent}>
              <h1 className={styles.emailSubject}>{selectedEmail.subject || '(No Subject)'}</h1>
              
              <div className={styles.emailMeta}>
                <div className={styles.senderInfo}>
                  <div className={styles.avatar}>
                    {(selectedEmail.fromName || selectedEmail.from || '?')[0].toUpperCase()}
                  </div>
                  <div className={styles.senderDetails}>
                    <span className={styles.senderName}>{selectedEmail.fromName || 'Unknown'}</span>
                    <span className={styles.senderEmail}>&lt;{selectedEmail.from}&gt;</span>
                  </div>
                </div>
                <div className={styles.emailDate}>
                  <Clock size={14} />
                  {formatFullDate(selectedEmail.receivedAt)}
                </div>
              </div>

              {selectedEmail.to && (
                <div className={styles.recipients}>
                  <span>To:</span> {selectedEmail.toName || selectedEmail.to}
                </div>
              )}

              <div className={styles.emailBody}>
                {loadingBody ? (
                  <div className={styles.loadingBody}>
                    <Loader2 size={20} className={styles.spinning} />
                    Loading...
                  </div>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: emailBody.replace(/\n/g, '<br/>') }} />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className={styles.noEmailSelected}>
            <Mail size={48} />
            <h3>Select an email to read</h3>
            <p>Click on an email from the list to view its contents</p>
          </div>
        )}
      </div>

      {/* Compose Modal */}
      {composeMode && (
        <div className={styles.composeOverlay}>
          <div className={styles.composeModal}>
            <div className={styles.composeHeader}>
              <h3>
                {composeMode === 'new' ? 'New Message' : 
                 composeMode === 'reply' ? 'Reply' :
                 composeMode === 'replyAll' ? 'Reply All' : 'Forward'}
              </h3>
              <div className={styles.composeHeaderActions}>
                <button onClick={saveDraft} disabled={savingDraft} title="Save Draft">
                  {savingDraft ? <Loader2 size={16} className={styles.spinning} /> : <FileEdit size={16} />}
                </button>
                <button onClick={closeCompose} title="Close">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className={styles.composeFields}>
              <div className={styles.composeField}>
                <label>To:</label>
                <input
                  type="text"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                />
              </div>
              <div className={styles.composeField}>
                <label>Cc:</label>
                <input
                  type="text"
                  value={composeCc}
                  onChange={(e) => setComposeCc(e.target.value)}
                />
              </div>
              <div className={styles.composeField}>
                <label>Subject:</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                />
              </div>
            </div>

            <textarea
              ref={composeBodyRef}
              className={styles.composeBody}
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
            />

            <div className={styles.composeFooter}>
              <div className={styles.composeTools}>
                <button title="Attach file">
                  <Paperclip size={18} />
                </button>
              </div>
              <button 
                className={styles.sendBtn}
                onClick={sendEmail}
                disabled={sending || !composeTo.trim()}
              >
                {sending ? <Loader2 size={18} className={styles.spinning} /> : <Send size={18} />}
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Modal */}
      {showLinkModal && selectedEmail && (
        <div className={styles.modalOverlay} onClick={() => setShowLinkModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2>Link Email</h2>
            <p className={styles.emailSubjectModal}>"{selectedEmail.subject}"</p>

            <div className={styles.linkTypeToggle}>
              <button 
                className={linkType === 'matter' ? styles.active : ''}
                onClick={() => setLinkType('matter')}
              >
                <Briefcase size={16} />
                Matter
              </button>
              <button 
                className={linkType === 'client' ? styles.active : ''}
                onClick={() => setLinkType('client')}
              >
                <User size={16} />
                Client
              </button>
            </div>

            <select 
              value={selectedLinkId}
              onChange={(e) => setSelectedLinkId(e.target.value)}
              className={styles.selectField}
            >
              <option value="">Select a {linkType}...</option>
              {linkType === 'matter' ? (
                matters.map(m => (
                  <option key={m.id} value={m.id}>{m.number} - {m.name}</option>
                ))
              ) : (
                clients.map(c => (
                  <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
                ))
              )}
            </select>

            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowLinkModal(false)}>
                Cancel
              </button>
              <button 
                className={styles.confirmBtn}
                onClick={handleLinkEmail}
                disabled={!selectedLinkId || linking}
              >
                {linking ? 'Linking...' : 'Link Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className={styles.modalOverlay} onClick={() => setShowSettings(false)}>
          <div className={styles.settingsModal} onClick={e => e.stopPropagation()}>
            <h2>Email Settings</h2>
            
            <div className={styles.settingSection}>
              <h3>Email Signature</h3>
              <p>Your signature will be automatically added to new emails</p>
              <textarea
                value={editingSignature}
                onChange={(e) => setEditingSignature(e.target.value)}
                placeholder="Enter your email signature...

Example:
Best regards,
John Smith
Attorney at Law
Apex Legal | (555) 123-4567"
                rows={8}
              />
            </div>

            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              <button className={styles.confirmBtn} onClick={saveSignature}>
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
