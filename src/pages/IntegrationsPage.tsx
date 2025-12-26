import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { integrationsApi } from '../services/api'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Link2, Calendar, Cloud, FileSignature,
  Calculator, MessageSquare, Shield, CheckCircle2,
  RefreshCw, AlertTriangle,
  Lock, Globe, Zap, AlertCircle, ArrowLeft, HardDrive, FileText, Users
} from 'lucide-react'
import styles from './IntegrationsPage.module.css'

interface IntegrationStatus {
  id: string
  provider: string
  isConnected: boolean
  accountEmail?: string
  accountName?: string
  lastSyncAt?: string
  syncEnabled?: boolean
  connectedAt?: string
  settings?: {
    syncCalendar?: boolean
    syncDocuments?: boolean
    syncBilling?: boolean
    autoSync?: boolean
  }
}

interface IntegrationConfig {
  id: string
  name: string
  description: string
  category: 'calendar' | 'email' | 'storage' | 'accounting' | 'esign' | 'communication'
  icon: string
  provider?: string // Backend provider key
  features: string[]
  syncOptions?: {
    calendar?: boolean // Can sync with Calendar page
    documents?: boolean // Can sync with Documents page
    billing?: boolean // Can sync with Billing page
  }
}

const integrationConfigs: IntegrationConfig[] = [
  // Calendar - Real integrations
  { 
    id: 'google-calendar', 
    name: 'Google Calendar', 
    description: 'Sync your Google Calendar events with Apex. Just sign in with your Google account.', 
    category: 'calendar', 
    icon: '📅', 
    provider: 'google',
    features: ['Import events', 'Two-way sync', 'Automatic updates'],
    syncOptions: { calendar: true }
  },
  { 
    id: 'microsoft-365', 
    name: 'Microsoft 365', 
    description: 'Connect once for Outlook email, calendar, and Word Online document editing. One sign-in covers everything.', 
    category: 'calendar', 
    icon: '🔷', 
    provider: 'outlook',
    features: ['Outlook Email', 'Calendar Sync', 'Word Online Editing', 'Excel & PowerPoint'],
    syncOptions: { calendar: true, documents: true }
  },
  
  // Accounting - Real integrations
  { 
    id: 'quickbooks', 
    name: 'QuickBooks Online', 
    description: 'Connect QuickBooks to sync invoices and financial data. Sign in with your Intuit account.', 
    category: 'accounting', 
    icon: '📊', 
    provider: 'quickbooks',
    features: ['Invoice sync', 'Payment tracking', 'Financial reports'],
    syncOptions: { billing: true }
  },
  
  // Cloud Storage - Apex Drive
  { 
    id: 'apex-drive', 
    name: 'Apex Drive', 
    description: 'Your firm\'s document storage with version history and auto-sync. Connect Microsoft 365 above for Word Online editing.', 
    category: 'storage', 
    icon: '🚀',
    provider: 'apex-drive',
    features: ['Document storage', 'Version history', 'Auto-sync', 'Network drive access'],
    syncOptions: { documents: true }
  },
  { 
    id: 'google-drive', 
    name: 'Google Drive', 
    description: 'Connect Google Drive for document storage and collaboration. Includes Docs, Sheets.', 
    category: 'storage', 
    icon: '📁',
    provider: 'googledrive',
    features: ['Cloud storage', 'Google Docs', 'File sharing'],
    syncOptions: { documents: true }
  },
  { 
    id: 'dropbox', 
    name: 'Dropbox', 
    description: 'Sync documents with Dropbox for secure file storage.', 
    category: 'storage', 
    icon: '📦',
    provider: 'dropbox',
    features: ['Secure storage', 'File sync', 'Team folders'],
    syncOptions: { documents: true }
  },
  { 
    id: 'file-storage', 
    name: 'Local & Network Files', 
    description: 'Link documents from your computer, network drives, or any cloud storage location.', 
    category: 'storage', 
    icon: '💾',
    provider: 'file-storage',
    features: ['Local files', 'Network paths', 'Any cloud URL'],
    syncOptions: { documents: true }
  },
  
  // E-Signature
  { 
    id: 'docusign', 
    name: 'DocuSign', 
    description: 'Send documents for electronic signature with audit trails.', 
    category: 'esign', 
    icon: '✍️',
    provider: 'docusign',
    features: ['E-signatures', 'Templates', 'Audit trail'],
    syncOptions: { documents: true }
  },
  
  // Communication
  { 
    id: 'slack', 
    name: 'Slack', 
    description: 'Get notifications and updates directly in your Slack workspace.', 
    category: 'communication', 
    icon: '💬',
    provider: 'slack',
    features: ['Notifications', 'Matter updates', 'Team alerts']
  },
  { 
    id: 'zoom', 
    name: 'Zoom', 
    description: 'Schedule and join Zoom meetings from calendar events.', 
    category: 'communication', 
    icon: '📹',
    provider: 'zoom',
    features: ['Meeting scheduling', 'Calendar sync', 'One-click join'],
    syncOptions: { calendar: true }
  },

  // Accounting
  { 
    id: 'quicken', 
    name: 'Quicken', 
    description: 'Connect Quicken for personal finance and accounting data.', 
    category: 'accounting', 
    icon: '💰',
    provider: 'quicken',
    features: ['Financial tracking', 'Transaction sync', 'Reports'],
    syncOptions: { billing: true }
  }
]

const categoryLabels: Record<string, { label: string; icon: any }> = {
  calendar: { label: 'Calendar & Email', icon: Calendar },
  storage: { label: 'Cloud Storage', icon: Cloud },
  accounting: { label: 'Accounting', icon: Calculator },
  esign: { label: 'E-Signature', icon: FileSignature },
  communication: { label: 'Communication', icon: MessageSquare }
}

export function IntegrationsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [integrations, setIntegrations] = useState<Record<string, IntegrationStatus | null>>({
    google: null,
    quickbooks: null,
    outlook: null,
    googledrive: null,
    dropbox: null,
    docusign: null,
    slack: null,
    zoom: null,
    quicken: null,
    'apex-drive': null,
  })
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // All users can access integrations (not just admins)

  // Load integrations on mount
  useEffect(() => {
    loadIntegrations()
  }, [])

  // Handle OAuth callbacks
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    
    if (success) {
      setNotification({ type: 'success', message: `Successfully connected ${success}!` })
      loadIntegrations()
      // Clear search params
      setSearchParams({})
    } else if (error) {
      setNotification({ type: 'error', message: `Connection failed: ${error}` })
      setSearchParams({})
    }
  }, [searchParams])

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  const loadIntegrations = async () => {
    try {
      const result = await integrationsApi.getAll()
      setIntegrations(result.integrations)
    } catch (error) {
      console.error('Failed to load integrations:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async (provider: string) => {
    setConnecting(provider)
    try {
      let response
      switch (provider) {
        case 'google':
          response = await integrationsApi.connectGoogle()
          break
        case 'quickbooks':
          response = await integrationsApi.connectQuickBooks()
          break
        case 'outlook':
          response = await integrationsApi.connectOutlook()
          break
        case 'googledrive':
          response = await integrationsApi.connectGoogleDrive()
          break
        case 'dropbox':
          response = await integrationsApi.connectDropbox()
          break
        case 'docusign':
          response = await integrationsApi.connectDocuSign()
          break
        case 'slack':
          response = await integrationsApi.connectSlack()
          break
        case 'zoom':
          response = await integrationsApi.connectZoom()
          break
        case 'quicken':
          response = await integrationsApi.connectQuicken()
          break
        case 'file-storage':
          // File storage doesn't need OAuth - just navigate to the page
          navigate('/app/integrations/file-storage')
          setConnecting(null)
          return
        case 'apex-drive':
          // Apex Drive - navigate to drive settings
          navigate('/app/settings/drives')
          setConnecting(null)
          return
        default:
          throw new Error('Unknown provider')
      }
      
      if (response.authUrl) {
        // Redirect to OAuth
        window.location.href = response.authUrl
      } else if (response.error) {
        setNotification({ type: 'error', message: response.error })
      }
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Connection failed' })
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = async (provider: string) => {
    try {
      switch (provider) {
        case 'google':
          await integrationsApi.disconnectGoogle()
          break
        case 'quickbooks':
          await integrationsApi.disconnectQuickBooks()
          break
        case 'outlook':
          await integrationsApi.disconnectOutlook()
          break
        case 'googledrive':
          await integrationsApi.disconnectGoogleDrive()
          break
        case 'dropbox':
          await integrationsApi.disconnectDropbox()
          break
        case 'docusign':
          await integrationsApi.disconnectDocuSign()
          break
        case 'slack':
          await integrationsApi.disconnectSlack()
          break
        case 'zoom':
          await integrationsApi.disconnectZoom()
          break
        case 'quicken':
          await integrationsApi.disconnectQuicken()
          break
      }
      setNotification({ type: 'success', message: `Disconnected ${provider}` })
      loadIntegrations()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Disconnect failed' })
    }
  }

  const handleSync = async (provider: string) => {
    setSyncing(provider)
    try {
      let result
      switch (provider) {
        case 'google':
          result = await integrationsApi.syncGoogle()
          break
        case 'quickbooks':
          result = await integrationsApi.syncQuickBooks()
          break
        case 'outlook':
          result = await integrationsApi.syncOutlookCalendar()
          break
        case 'googledrive':
          result = await integrationsApi.syncGoogleDrive()
          break
        case 'dropbox':
          result = await integrationsApi.syncDropbox()
          break
        case 'docusign':
          result = await integrationsApi.syncDocuSign()
          break
        case 'slack':
          result = await integrationsApi.syncSlack()
          break
        case 'zoom':
          result = await integrationsApi.syncZoom()
          break
        case 'quicken':
          result = await integrationsApi.syncQuicken()
          break
        case 'apex-drive':
          // This syncs through the drive system
          setNotification({ type: 'success', message: 'Document sync initiated. Check Documents page.' })
          setSyncing(null)
          return
      }
      
      if (result?.syncedCount !== undefined) {
        setNotification({ type: 'success', message: `Synced ${result.syncedCount} items from ${provider}` })
      } else {
        setNotification({ type: 'success', message: `${provider} sync completed` })
      }
      loadIntegrations()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Sync failed' })
    } finally {
      setSyncing(null)
    }
  }

  const handleSyncSettingChange = async (provider: string, setting: string, value: boolean) => {
    try {
      await integrationsApi.updateSyncSettings(provider, { [setting]: value })
      // Update local state
      setIntegrations(prev => ({
        ...prev,
        [provider]: prev[provider] ? {
          ...prev[provider]!,
          settings: { ...prev[provider]!.settings, [setting]: value }
        } : null
      }))
      setNotification({ type: 'success', message: `Sync setting updated` })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to update setting' })
    }
  }

  const getIntegrationStatus = (config: IntegrationConfig) => {
    if (!config.provider) return null
    return integrations[config.provider]
  }

  const isConnected = (config: IntegrationConfig) => {
    const status = getIntegrationStatus(config)
    return status?.isConnected === true
  }

  const isComingSoon = (config: IntegrationConfig) => {
    return !config.provider
  }

  const filteredIntegrations = selectedCategory 
    ? integrationConfigs.filter(i => i.category === selectedCategory)
    : integrationConfigs

  const connectedCount = integrationConfigs.filter(i => isConnected(i)).length
  const activeIntegrations = integrationConfigs.filter(i => i.provider)

  return (
    <div className={styles.integrationsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      {/* Notification */}
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Integrations</h1>
          <p>Connect your favorite tools and services</p>
        </div>
{connectedCount > 0 && (
          <div className={styles.headerStats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{connectedCount}</span>
              <span className={styles.statLabel}>Connected</span>
            </div>
          </div>
        )}
      </div>

      {/* Infrastructure Banner */}
      <div className={styles.infrastructureBanner}>
        <div className={styles.bannerIcon}>
          <Shield size={24} />
        </div>
        <div className={styles.bannerContent}>
          <h3>Secure OAuth 2.0 Connections</h3>
          <p>All integrations use industry-standard OAuth 2.0 authentication. Your credentials are never stored - we only save secure access tokens that can be revoked at any time.</p>
        </div>
        <div className={styles.bannerBadges}>
          <span><Lock size={14} /> OAuth 2.0</span>
          <span><Shield size={14} /> Encrypted</span>
          <span><Globe size={14} /> Revocable</span>
        </div>
      </div>

      {/* Category Filter */}
      <div className={styles.categories}>
        <button 
          className={`${styles.categoryBtn} ${!selectedCategory ? styles.active : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          All
        </button>
        {Object.entries(categoryLabels).map(([key, { label, icon: Icon }]) => (
          <button
            key={key}
            className={`${styles.categoryBtn} ${selectedCategory === key ? styles.active : ''}`}
            onClick={() => setSelectedCategory(key)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loading}>
          <RefreshCw size={24} className={styles.spinning} />
          <span>Loading integrations...</span>
        </div>
      ) : (
        <>
          {/* Integrations Grid */}
          <div className={styles.integrationsGrid}>
            {filteredIntegrations.map(config => {
              const status = getIntegrationStatus(config)
              const connected = isConnected(config)
              const comingSoon = isComingSoon(config)
              
              return (
                <div 
                  key={config.id} 
                  className={`${styles.integrationCard} ${connected ? styles.connected : ''} ${comingSoon ? styles.comingSoon : ''}`}
                >
                  {comingSoon && (
                    <div className={styles.comingSoonBadge}>Coming Soon</div>
                  )}
                  
                  <div className={styles.integrationHeader}>
                    <span className={styles.integrationIcon}>{config.icon}</span>
                    <div className={styles.integrationInfo}>
                      <h3>{config.name}</h3>
                      <span className={styles.categoryTag}>
                        {categoryLabels[config.category]?.label || config.category}
                      </span>
                    </div>
                    <div className={`${styles.statusIndicator} ${connected ? styles.connected : ''}`}>
                      {connected && <CheckCircle2 size={18} />}
                    </div>
                  </div>

                  <p className={styles.integrationDesc}>{config.description}</p>

                  <div className={styles.featureList}>
                    {config.features.map((feature, idx) => (
                      <span key={idx} className={styles.featureTag}>{feature}</span>
                    ))}
                  </div>

                  {connected && status && (
                    <div className={styles.connectedInfo}>
                      {(status.accountEmail || status.accountName) && (
                        <span className={styles.accountInfo}>
                          {status.accountEmail || status.accountName}
                        </span>
                      )}
                      {status.lastSyncAt && (
                        <span className={styles.lastSync}>
                          <RefreshCw size={12} /> Last synced: {new Date(status.lastSyncAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Sync Settings - shown when connected */}
                  {connected && config.syncOptions && (
                    <div className={styles.syncSettings}>
                      <span className={styles.syncSettingsLabel}>Sync with:</span>
                      {config.syncOptions.calendar && (
                        <label className={styles.syncOption}>
                          <input 
                            type="checkbox" 
                            checked={status?.settings?.syncCalendar !== false}
                            onChange={(e) => handleSyncSettingChange(config.provider!, 'syncCalendar', e.target.checked)}
                          />
                          <Calendar size={14} />
                          Calendar
                        </label>
                      )}
                      {config.syncOptions.documents && (
                        <label className={styles.syncOption}>
                          <input 
                            type="checkbox" 
                            checked={status?.settings?.syncDocuments !== false}
                            onChange={(e) => handleSyncSettingChange(config.provider!, 'syncDocuments', e.target.checked)}
                          />
                          <Cloud size={14} />
                          Documents
                        </label>
                      )}
                      {config.syncOptions.billing && (
                        <label className={styles.syncOption}>
                          <input 
                            type="checkbox" 
                            checked={status?.settings?.syncBilling !== false}
                            onChange={(e) => handleSyncSettingChange(config.provider!, 'syncBilling', e.target.checked)}
                          />
                          <Calculator size={14} />
                          Billing
                        </label>
                      )}
                    </div>
                  )}

                  <div className={styles.integrationActions}>
                    {comingSoon ? (
                      <button className={styles.comingSoonBtn} disabled>
                        <Zap size={16} />
                        Coming Soon
                      </button>
                    ) : connected ? (
                      <>
                        <button 
                          className={styles.syncBtn}
                          onClick={() => handleSync(config.provider!)}
                          disabled={syncing === config.provider}
                        >
                          <RefreshCw size={16} className={syncing === config.provider ? styles.spinning : ''} />
                          {syncing === config.provider ? 'Syncing...' : 'Sync Now'}
                        </button>
                        <button 
                          className={styles.disconnectBtn}
                          onClick={() => handleDisconnect(config.provider!)}
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button 
                        className={styles.connectBtn}
                        onClick={() => handleConnect(config.provider!)}
                        disabled={connecting === config.provider}
                      >
                        {connecting === config.provider ? (
                          <>
                            <RefreshCw size={16} className={styles.spinning} />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Link2 size={16} />
                            Connect Account
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* How It Works Section */}
      <div className={styles.howItWorks}>
        <h2>How Integrations Work</h2>
        <div className={styles.stepsGrid}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <h4>Click Connect</h4>
            <p>Click the "Connect Account" button on any integration you want to use.</p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <h4>Sign In</h4>
            <p>You'll be redirected to sign in with your Google, Microsoft, or QuickBooks account.</p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <h4>Authorize</h4>
            <p>Grant Apex permission to access your calendar, email, or financial data.</p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>4</div>
            <h4>Sync Data</h4>
            <p>Your data syncs automatically. Click "Sync Now" anytime to update manually.</p>
          </div>
        </div>
      </div>

      {/* Security Info */}
      <div className={styles.securityInfo}>
        <div className={styles.securityHeader}>
          <Lock size={24} />
          <div>
            <h3>Your Data is Secure</h3>
            <p>We never see or store your passwords. Integrations use OAuth 2.0, the industry standard used by Google, Microsoft, and all major providers. You can disconnect at any time.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
