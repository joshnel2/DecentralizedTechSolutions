import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { integrationsApi } from '../services/api'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Link2, Calendar, Cloud, FileSignature,
  Calculator, MessageSquare, Shield, CheckCircle2,
  RefreshCw,
  Lock, Globe, Zap, AlertCircle, ArrowLeft, HardDrive, FileText,
  Download, Monitor, Copy, ExternalLink, Laptop
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
    description: 'Connect once to enable Word Online document editing, Outlook email, and calendar sync. Click any Word document in Documents and select "Open in Word" after connecting.', 
    category: 'calendar', 
    icon: '🔷', 
    provider: 'outlook',
    features: ['Word Online & Desktop', 'Document Version History', 'Outlook Email', 'Calendar Sync'],
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
  
  // Desktop client state
  const [desktopClientInfo, setDesktopClientInfo] = useState<{
    version: string
    isAvailable: boolean
    documentCount: number
    registeredDevices: any[]
    serverUrl: string
    downloadUrl: { windows: string; mac: string }
  } | null>(null)
  const [connectionToken, setConnectionToken] = useState<{
    token: string
    code: string
    url: string
    expiresIn: number
  } | null>(null)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [showDesktopSetup, setShowDesktopSetup] = useState(false)

  // All users can access integrations (not just admins)

  // Load integrations on mount
  useEffect(() => {
    loadIntegrations()
    loadDesktopClientInfo()
  }, [])

  const loadDesktopClientInfo = async () => {
    try {
      const response = await fetch('/api/desktop-client/info', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setDesktopClientInfo(data)
      }
    } catch (error) {
      console.error('Failed to load desktop client info:', error)
    }
  }

  const generateConnectionToken = async () => {
    setGeneratingToken(true)
    try {
      const response = await fetch('/api/desktop-client/connection-token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceName: `${user?.firstName}'s Computer` }),
      })
      
      if (response.ok) {
        const data = await response.json()
        setConnectionToken({
          token: data.connectionToken,
          code: data.connectionCode,
          url: data.connectionUrl,
          expiresIn: data.expiresIn,
        })
        setShowDesktopSetup(true)
      } else {
        throw new Error('Failed to generate token')
      }
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to generate connection code' })
    } finally {
      setGeneratingToken(false)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setNotification({ type: 'success', message: `${label} copied to clipboard!` })
  }

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
          // Sync through the drive system
          try {
            const driveResult = await import('../services/api').then(m => m.driveApi.getConfigurations())
            const firmDrive = driveResult.drives?.find((d: any) => !d.isPersonal && d.isDefault)
            if (firmDrive) {
              const syncApi = await import('../services/api').then(m => m.driveSyncApi)
              await syncApi.syncDrive(firmDrive.id)
              setNotification({ type: 'success', message: 'Drive sync complete!' })
            } else {
              setNotification({ type: 'error', message: 'Apex Drive not enabled. Go to Settings > Apex Drive to enable.' })
            }
          } catch (err: any) {
            setNotification({ type: 'error', message: err.message || 'Sync failed' })
          }
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

      {/* Desktop Client Download Section */}
      <div className={styles.desktopClientSection}>
        <div className={styles.desktopClientCard}>
          <div className={styles.desktopClientHeader}>
            <div className={styles.desktopClientIcon}>
              <Laptop size={32} />
            </div>
            <div className={styles.desktopClientInfo}>
              <h2>Apex Drive Desktop</h2>
              <p>Access your documents as a local drive in Windows Explorer</p>
            </div>
            {desktopClientInfo?.isAvailable && (
              <span className={styles.availableBadge}>
                <CheckCircle2 size={14} /> Available
              </span>
            )}
          </div>

          <div className={styles.desktopClientFeatures}>
            <div className={styles.featureItem}>
              <HardDrive size={18} />
              <span>Virtual B: Drive</span>
            </div>
            <div className={styles.featureItem}>
              <RefreshCw size={18} />
              <span>Real-time Sync</span>
            </div>
            <div className={styles.featureItem}>
              <FileText size={18} />
              <span>Edit in Word/Excel</span>
            </div>
            <div className={styles.featureItem}>
              <Shield size={18} />
              <span>Matter Permissions</span>
            </div>
          </div>

          {desktopClientInfo?.isAvailable ? (
            <div className={styles.desktopClientActions}>
              <button 
                className={styles.downloadBtn}
                onClick={() => window.open(desktopClientInfo.downloadUrl?.windows || '#', '_blank')}
              >
                <Download size={18} />
                Download for Windows
              </button>
              <button 
                className={styles.connectBtn}
                onClick={generateConnectionToken}
                disabled={generatingToken}
              >
                {generatingToken ? (
                  <>
                    <RefreshCw size={18} className={styles.spinning} />
                    Generating...
                  </>
                ) : (
                  <>
                    <Link2 size={18} />
                    Connect Existing Install
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className={styles.desktopClientDisabled}>
              <AlertCircle size={18} />
              <span>Apex Drive must be enabled by your administrator to use the desktop client.</span>
            </div>
          )}

          {desktopClientInfo?.registeredDevices && desktopClientInfo.registeredDevices.length > 0 && (
            <div className={styles.registeredDevices}>
              <h4>Your Connected Devices</h4>
              <div className={styles.devicesList}>
                {desktopClientInfo.registeredDevices.map((device: any) => (
                  <div key={device.id} className={styles.deviceItem}>
                    <Monitor size={16} />
                    <span className={styles.deviceName}>{device.device_name}</span>
                    <span className={styles.devicePlatform}>{device.platform}</span>
                    <span className={styles.deviceLastSeen}>
                      Last seen: {new Date(device.last_seen_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Connection Setup Modal */}
        {showDesktopSetup && connectionToken && (
          <div className={styles.setupModal}>
            <div className={styles.setupModalContent}>
              <button className={styles.closeModal} onClick={() => setShowDesktopSetup(false)}>×</button>
              
              <h2>Connect Apex Drive Desktop</h2>
              <p>Use one of these methods to connect the desktop app:</p>

              <div className={styles.setupMethods}>
                <div className={styles.setupMethod}>
                  <h3>Option 1: Connection Code</h3>
                  <p>Enter this code in the desktop app:</p>
                  <div className={styles.connectionCode}>
                    <span>{connectionToken.code}</span>
                    <button onClick={() => copyToClipboard(connectionToken.code, 'Code')}>
                      <Copy size={16} />
                    </button>
                  </div>
                  <small>Expires in 10 minutes</small>
                </div>

                <div className={styles.setupDivider}>or</div>

                <div className={styles.setupMethod}>
                  <h3>Option 2: One-Click Connect</h3>
                  <p>Click to open Apex Drive and connect automatically:</p>
                  <a 
                    href={connectionToken.url}
                    className={styles.oneClickBtn}
                    onClick={(e) => {
                      // Try to open the app
                      window.location.href = connectionToken.url
                    }}
                  >
                    <ExternalLink size={18} />
                    Open Apex Drive
                  </a>
                  <small>Requires Apex Drive to be installed</small>
                </div>
              </div>

              <div className={styles.setupInstructions}>
                <h4>First time setup?</h4>
                <ol>
                  <li>Download Apex Drive for Windows above</li>
                  <li>Run the installer (WinFsp will be installed if needed)</li>
                  <li>Open Apex Drive and enter the connection code</li>
                  <li>Your documents will appear in the Z: drive</li>
                </ol>
              </div>
            </div>
          </div>
        )}
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
