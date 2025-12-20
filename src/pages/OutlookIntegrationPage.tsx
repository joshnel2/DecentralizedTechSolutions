import { useState, useEffect } from 'react'
import { Mail, RefreshCw, Link2, Search, User, Briefcase, CheckCircle, Clock, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { integrationsApi, mattersApi, clientsApi } from '../services/api'
import styles from './IntegrationDataPage.module.css'

interface Email {
  id: string
  subject: string
  from: string
  fromName: string
  receivedAt: string
  isRead: boolean
  preview: string
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
}

export function OutlookIntegrationPage() {
  const navigate = useNavigate()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [matters, setMatters] = useState<Matter[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [linkType, setLinkType] = useState<'matter' | 'client'>('matter')
  const [selectedLinkId, setSelectedLinkId] = useState('')
  const [linking, setLinking] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadEmails()
    loadMattersAndClients()
  }, [])

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

  const handleSync = async () => {
    setSyncing(true)
    try {
      await integrationsApi.syncOutlookCalendar()
      await loadEmails()
      setNotification({ type: 'success', message: 'Outlook synced successfully' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Sync failed' })
    } finally {
      setSyncing(false)
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
      setSelectedEmail(null)
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to link email' })
    } finally {
      setLinking(false)
    }
  }

  const filteredEmails = emails.filter(email =>
    email.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    email.from?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    email.fromName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

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

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon}>
            <Mail size={28} />
          </div>
          <div>
            <h1>Outlook</h1>
            <p>View and link emails to matters and clients</p>
          </div>
        </div>
        <div className={styles.headerActions}>
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

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search emails..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className={styles.stats}>
          <span>{emails.length} emails</span>
          <span>{emails.filter(e => !e.isRead).length} unread</span>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <RefreshCw size={24} className={styles.spinning} />
          <span>Loading emails...</span>
        </div>
      ) : (
        <div className={styles.dataList}>
          {filteredEmails.length === 0 ? (
            <div className={styles.empty}>
              <Mail size={48} />
              <h3>No emails found</h3>
              <p>Your Outlook emails will appear here</p>
            </div>
          ) : (
            filteredEmails.map(email => (
              <div 
                key={email.id} 
                className={`${styles.dataItem} ${!email.isRead ? styles.unread : ''}`}
              >
                <div className={styles.itemIcon}>
                  <Mail size={20} />
                </div>
                <div className={styles.itemContent}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemTitle}>{email.subject || '(No Subject)'}</span>
                    <span className={styles.itemDate}>{formatDate(email.receivedAt)}</span>
                  </div>
                  <div className={styles.itemMeta}>
                    <span className={styles.itemFrom}>
                      {email.fromName || email.from}
                    </span>
                  </div>
                  <p className={styles.itemPreview}>{email.preview}</p>
                </div>
                <div className={styles.itemActions}>
                  <button 
                    className={styles.linkBtn}
                    onClick={() => {
                      setSelectedEmail(email)
                      setShowLinkModal(true)
                    }}
                    title="Link to Matter or Client"
                  >
                    <Link2 size={16} />
                    Link
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Link Modal */}
      {showLinkModal && selectedEmail && (
        <div className={styles.modalOverlay} onClick={() => setShowLinkModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2>Link Email</h2>
            <p className={styles.emailSubject}>"{selectedEmail.subject}"</p>

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
              <button 
                className={styles.cancelBtn}
                onClick={() => setShowLinkModal(false)}
              >
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
    </div>
  )
}
