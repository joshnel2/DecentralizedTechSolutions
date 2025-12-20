import { useState, useEffect } from 'react'
import { MessageSquare, RefreshCw, Search, ArrowLeft, Send, Hash } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { integrationsApi } from '../services/api'
import styles from './IntegrationDataPage.module.css'

interface Channel {
  id: string
  name: string
  is_private: boolean
  num_members: number
}

export function SlackIntegrationPage() {
  const navigate = useNavigate()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadChannels()
  }, [])

  const loadChannels = async () => {
    try {
      setLoading(true)
      const data = await integrationsApi.getSlackChannels()
      setChannels(data.channels || [])
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to load channels' })
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!selectedChannel || !message.trim()) return
    
    setSending(true)
    try {
      await integrationsApi.sendSlackMessage(selectedChannel.id, message)
      setNotification({ type: 'success', message: `Message sent to #${selectedChannel.name}` })
      setMessage('')
      setSelectedChannel(null)
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to send message' })
    } finally {
      setSending(false)
    }
  }

  const filteredChannels = channels.filter(ch =>
    ch.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
            <MessageSquare size={28} />
          </div>
          <div>
            <h1>Slack</h1>
            <p>Send messages to your Slack channels</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.syncBtn}
            onClick={loadChannels}
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? styles.spinning : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search channels..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className={styles.stats}>
          <span>{channels.length} channels</span>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <RefreshCw size={24} className={styles.spinning} />
          <span>Loading channels...</span>
        </div>
      ) : (
        <div className={styles.dataList}>
          {filteredChannels.length === 0 ? (
            <div className={styles.empty}>
              <MessageSquare size={48} />
              <h3>No channels found</h3>
              <p>Your Slack channels will appear here</p>
            </div>
          ) : (
            filteredChannels.map(channel => (
              <div key={channel.id} className={styles.dataItem}>
                <div className={styles.itemIcon}>
                  <Hash size={20} />
                </div>
                <div className={styles.itemContent}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemTitle}>#{channel.name}</span>
                    {channel.is_private && (
                      <span className={styles.itemDate}>Private</span>
                    )}
                  </div>
                  <div className={styles.itemMeta}>
                    <span>{channel.num_members} members</span>
                  </div>
                </div>
                <div className={styles.itemActions}>
                  <button 
                    className={styles.linkBtn}
                    onClick={() => setSelectedChannel(channel)}
                  >
                    <Send size={14} />
                    Message
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Send Message Modal */}
      {selectedChannel && (
        <div className={styles.modalOverlay} onClick={() => setSelectedChannel(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2>Send to #{selectedChannel.name}</h2>
            
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={4}
              style={{
                width: '100%',
                padding: 'var(--spacing-sm)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                resize: 'vertical',
                marginBottom: 'var(--spacing-md)'
              }}
            />

            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn}
                onClick={() => setSelectedChannel(null)}
              >
                Cancel
              </button>
              <button 
                className={styles.confirmBtn}
                onClick={handleSendMessage}
                disabled={!message.trim() || sending}
              >
                {sending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
