import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { integrationsApi } from '../services/api'
import { useSearchParams } from 'react-router-dom'
import {
  Link2, Calendar, Mail, Cloud, CreditCard, FileSignature,
  Calculator, MessageSquare, Shield, CheckCircle2, XCircle,
  ExternalLink, Settings, RefreshCw, AlertTriangle, Sparkles,
  Database, Lock, Globe, Zap, AlertCircle
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
}

interface IntegrationConfig {
  id: string
  name: string
  description: string
  category: 'calendar' | 'email' | 'storage' | 'payment' | 'accounting' | 'esign' | 'communication' | 'ai'
  icon: string
  provider?: string // Backend provider key
  features: string[]
}

const integrationConfigs: IntegrationConfig[] = [
  // Calendar - Real integrations
  { 
    id: 'google-calendar', 
    name: 'Google Calendar', 
    description: 'Sync events and deadlines with Google Calendar. Two-way sync keeps your schedule updated.', 
    category: 'calendar', 
    icon: '📅', 
    provider: 'google',
    features: ['Two-way sync', 'Event import/export', 'Automatic updates']
  },
  { 
    id: 'outlook-calendar', 
    name: 'Microsoft Outlook Calendar', 
    description: 'Sync with Outlook/Microsoft 365 calendar for seamless scheduling.', 
    category: 'calendar', 
    icon: '📆', 
    provider: 'outlook',
    features: ['Two-way sync', 'Microsoft 365 integration', 'Team calendars']
  },
  
  // Email - Real integrations
  { 
    id: 'outlook-mail', 
    name: 'Outlook Mail', 
    description: 'View recent emails, link emails to matters, and access your inbox from within Apex.', 
    category: 'email', 
    icon: '📧', 
    provider: 'outlook',
    features: ['Email viewing', 'Matter linking', 'Contact sync']
  },
  
  // Accounting - Real integrations
  { 
    id: 'quickbooks', 
    name: 'QuickBooks Online', 
    description: 'Sync invoices, payments, and financial data with QuickBooks for comprehensive accounting.', 
    category: 'accounting', 
    icon: '📊', 
    provider: 'quickbooks',
    features: ['Invoice sync', 'Payment tracking', 'Bank account access', 'Financial reports']
  },
  
  // Cloud Storage - Coming Soon
  { 
    id: 'onedrive', 
    name: 'OneDrive', 
    description: 'Store and sync documents with Microsoft OneDrive.', 
    category: 'storage', 
    icon: '☁️',
    features: ['Document storage', 'File sharing', 'Version control']
  },
  { 
    id: 'google-drive', 
    name: 'Google Drive', 
    description: 'Connect Google Drive for document storage and collaboration.', 
    category: 'storage', 
    icon: '📁',
    features: ['Cloud storage', 'Collaboration', 'File sharing']
  },
  { 
    id: 'dropbox', 
    name: 'Dropbox', 
    description: 'Sync documents with Dropbox for secure file storage.', 
    category: 'storage', 
    icon: '📦',
    features: ['Secure storage', 'File sync', 'Team folders']
  },
  
  // Payments - Coming Soon
  { 
    id: 'stripe', 
    name: 'Stripe', 
    description: 'Accept credit card payments online with secure payment processing.', 
    category: 'payment', 
    icon: '💳',
    features: ['Credit cards', 'ACH transfers', 'Recurring billing']
  },
  { 
    id: 'lawpay', 
    name: 'LawPay', 
    description: 'Legal-specific payment processing with trust account compliance.', 
    category: 'payment', 
    icon: '⚖️',
    features: ['Trust accounting', 'IOLTA compliant', 'Payment plans']
  },
  
  // E-Signature - Coming Soon
  { 
    id: 'docusign', 
    name: 'DocuSign', 
    description: 'Send documents for electronic signature with audit trails.', 
    category: 'esign', 
    icon: '✍️',
    features: ['E-signatures', 'Templates', 'Audit trail']
  },
  
  // Communication - Coming Soon
  { 
    id: 'slack', 
    name: 'Slack', 
    description: 'Get notifications and updates directly in your Slack workspace.', 
    category: 'communication', 
    icon: '💬',
    features: ['Notifications', 'Matter updates', 'Team alerts']
  },
  { 
    id: 'zoom', 
    name: 'Zoom', 
    description: 'Schedule and join Zoom meetings from calendar events.', 
    category: 'communication', 
    icon: '📹',
    features: ['Meeting scheduling', 'Calendar sync', 'One-click join']
  },
  
  // AI Services - Pre-configured
  { 
    id: 'azure-openai', 
    name: 'Azure OpenAI', 
    description: 'Power AI features with Azure OpenAI Service - pre-configured for Apex.', 
    category: 'ai', 
    icon: '🤖',
    features: ['AI Assistant', 'Document analysis', 'Smart suggestions']
  }
]

const categoryLabels: Record<string, { label: string; icon: any }> = {
  calendar: { label: 'Calendar', icon: Calendar },
  email: { label: 'Email', icon: Mail },
  storage: { label: 'Cloud Storage', icon: Cloud },
  payment: { label: 'Payments', icon: CreditCard },
  accounting: { label: 'Accounting', icon: Calculator },
  esign: { label: 'E-Signature', icon: FileSignature },
  communication: { label: 'Communication', icon: MessageSquare },
  ai: { label: 'AI Services', icon: Sparkles }
}

export function IntegrationsPage() {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [integrations, setIntegrations] = useState<Record<string, IntegrationStatus | null>>({
    google: null,
    quickbooks: null,
    outlook: null,
  })
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

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
      }
      
      if (result.syncedCount !== undefined) {
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

  const getIntegrationStatus = (config: IntegrationConfig) => {
    if (!config.provider) return null
    return integrations[config.provider]
  }

  const isConnected = (config: IntegrationConfig) => {
    const status = getIntegrationStatus(config)
    return status?.isConnected === true
  }

  const isComingSoon = (config: IntegrationConfig) => {
    return !config.provider || (config.category === 'storage' || config.category === 'payment' || config.category === 'esign' || config.category === 'communication')
  }

  const filteredIntegrations = selectedCategory 
    ? integrationConfigs.filter(i => i.category === selectedCategory)
    : integrationConfigs

  const connectedCount = integrationConfigs.filter(i => isConnected(i)).length
  const activeIntegrations = integrationConfigs.filter(i => i.provider)

  if (!isAdmin) {
    return (
      <div className={styles.noAccess}>
        <AlertTriangle size={48} />
        <h2>Access Denied</h2>
        <p>Only administrators can manage integrations.</p>
      </div>
    )
  }

  return (
    <div className={styles.integrationsPage}>
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
        <div className={styles.headerStats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{connectedCount}</span>
            <span className={styles.statLabel}>Connected</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{activeIntegrations.length - connectedCount}</span>
            <span className={styles.statLabel}>Available</span>
          </div>
        </div>
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
              const isAI = config.category === 'ai'
              
              return (
                <div 
                  key={config.id} 
                  className={`${styles.integrationCard} ${connected ? styles.connected : ''} ${comingSoon ? styles.comingSoon : ''}`}
                >
                  {comingSoon && !isAI && (
                    <div className={styles.comingSoonBadge}>Coming Soon</div>
                  )}
                  {isAI && (
                    <div className={styles.preConfiguredBadge}>Pre-configured</div>
                  )}
                  
                  <div className={styles.integrationHeader}>
                    <span className={styles.integrationIcon}>{config.icon}</span>
                    <div className={styles.integrationInfo}>
                      <h3>{config.name}</h3>
                      <span className={styles.categoryTag}>
                        {categoryLabels[config.category].label}
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

                  <div className={styles.integrationActions}>
                    {isAI ? (
                      <div className={styles.aiStatus}>
                        <CheckCircle2 size={16} />
                        <span>Active - AI features enabled</span>
                      </div>
                    ) : comingSoon ? (
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
                            Connect
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

      {/* Setup Guide */}
      <div className={styles.setupGuide}>
        <h2>
          <Settings size={20} />
          Integration Setup Guide
        </h2>
        <div className={styles.setupGrid}>
          <div className={styles.setupCard}>
            <div className={styles.setupIcon}>
              <Calendar size={28} />
            </div>
            <h4>Google Calendar</h4>
            <ol>
              <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener">Google Cloud Console</a></li>
              <li>Create a new project or select existing</li>
              <li>Enable Calendar API</li>
              <li>Create OAuth 2.0 credentials</li>
              <li>Add redirect URI: <code>{window.location.origin}/api/integrations/google/callback</code></li>
              <li>Copy Client ID and Secret to your .env file</li>
            </ol>
          </div>
          <div className={styles.setupCard}>
            <div className={styles.setupIcon}>
              <Calculator size={28} />
            </div>
            <h4>QuickBooks Online</h4>
            <ol>
              <li>Go to <a href="https://developer.intuit.com" target="_blank" rel="noopener">Intuit Developer Portal</a></li>
              <li>Create a new app</li>
              <li>Select QuickBooks Online Accounting</li>
              <li>Copy OAuth keys</li>
              <li>Add redirect URI: <code>{window.location.origin}/api/integrations/quickbooks/callback</code></li>
              <li>Set environment (sandbox/production)</li>
            </ol>
          </div>
          <div className={styles.setupCard}>
            <div className={styles.setupIcon}>
              <Mail size={28} />
            </div>
            <h4>Microsoft Outlook</h4>
            <ol>
              <li>Go to <a href="https://portal.azure.com" target="_blank" rel="noopener">Azure Portal</a></li>
              <li>Register a new application in Azure AD</li>
              <li>Add Microsoft Graph permissions (Mail.Read, Calendars.ReadWrite)</li>
              <li>Create a client secret</li>
              <li>Add redirect URI: <code>{window.location.origin}/api/integrations/outlook/callback</code></li>
              <li>Copy Application ID and Secret</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Data Flow Section */}
      <div className={styles.dataFlowSection}>
        <h2>
          <Database size={20} />
          Data Architecture
        </h2>
        <div className={styles.dataFlowGrid}>
          <div className={styles.dataFlowCard}>
            <div className={styles.dataFlowIcon}>
              <Cloud size={32} />
            </div>
            <h4>Cloud Infrastructure</h4>
            <ul>
              <li>Secure token storage</li>
              <li>Encrypted at rest</li>
              <li>Automatic token refresh</li>
              <li>Multi-region availability</li>
            </ul>
          </div>
          <div className={styles.dataFlowCard}>
            <div className={styles.dataFlowIcon}>
              <Lock size={32} />
            </div>
            <h4>Security</h4>
            <ul>
              <li>OAuth 2.0 standard</li>
              <li>No password storage</li>
              <li>Revocable access tokens</li>
              <li>Audit logging</li>
            </ul>
          </div>
          <div className={styles.dataFlowCard}>
            <div className={styles.dataFlowIcon}>
              <Shield size={32} />
            </div>
            <h4>Compliance</h4>
            <ul>
              <li>SOC 2 compliant providers</li>
              <li>GDPR data handling</li>
              <li>State bar ethics compliant</li>
              <li>Data isolation by firm</li>
            </ul>
          </div>
          <div className={styles.dataFlowCard}>
            <div className={styles.dataFlowIcon}>
              <Zap size={32} />
            </div>
            <h4>Sync Features</h4>
            <ul>
              <li>Manual sync on demand</li>
              <li>Incremental updates</li>
              <li>Conflict resolution</li>
              <li>Sync status tracking</li>
            </ul>
          </div>
        </div>
      </div>

      {/* API Section */}
      <div className={styles.apiSection}>
        <div className={styles.apiHeader}>
          <div>
            <h2>Developer API</h2>
            <p>Build custom integrations with our REST API</p>
          </div>
          <a href="/app/settings/api-keys" className={styles.apiDocsBtn}>
            <ExternalLink size={16} />
            API Documentation
          </a>
        </div>
        <div className={styles.apiFeatures}>
          <div className={styles.apiFeature}>
            <code>REST API</code>
            <span>Full CRUD operations for all resources</span>
          </div>
          <div className={styles.apiFeature}>
            <code>Webhooks</code>
            <span>Real-time event notifications</span>
          </div>
          <div className={styles.apiFeature}>
            <code>OAuth 2.0</code>
            <span>Secure third-party authentication</span>
          </div>
          <div className={styles.apiFeature}>
            <code>Rate Limiting</code>
            <span>10,000 requests per hour</span>
          </div>
        </div>
      </div>
    </div>
  )
}
