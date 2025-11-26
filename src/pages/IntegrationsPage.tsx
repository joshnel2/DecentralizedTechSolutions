import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import {
  Link2, Calendar, Mail, Cloud, CreditCard, FileSignature,
  Calculator, MessageSquare, Shield, CheckCircle2, XCircle,
  ExternalLink, Settings, RefreshCw, AlertTriangle, Sparkles,
  Database, Lock, Globe, Zap
} from 'lucide-react'
import styles from './IntegrationsPage.module.css'

interface Integration {
  id: string
  name: string
  description: string
  category: 'calendar' | 'email' | 'storage' | 'payment' | 'accounting' | 'esign' | 'communication' | 'ai'
  icon: string
  status: 'connected' | 'disconnected' | 'error'
  lastSync?: string
  accountInfo?: string
}

const availableIntegrations: Integration[] = [
  // Calendar
  { id: 'google-calendar', name: 'Google Calendar', description: 'Sync events and deadlines with Google Calendar', category: 'calendar', icon: '📅', status: 'disconnected' },
  { id: 'outlook-calendar', name: 'Microsoft Outlook', description: 'Sync with Outlook/Microsoft 365 calendar', category: 'calendar', icon: '📆', status: 'connected', lastSync: '2 minutes ago', accountInfo: 'john@apexlaw.com' },
  { id: 'apple-calendar', name: 'Apple Calendar', description: 'Sync with iCloud Calendar', category: 'calendar', icon: '🍎', status: 'disconnected' },
  
  // Email
  { id: 'gmail', name: 'Gmail', description: 'Link emails to matters and clients automatically', category: 'email', icon: '✉️', status: 'disconnected' },
  { id: 'outlook-mail', name: 'Outlook Mail', description: 'Connect Microsoft 365 email', category: 'email', icon: '📧', status: 'connected', lastSync: '5 minutes ago', accountInfo: 'john@apexlaw.com' },
  
  // Cloud Storage
  { id: 'onedrive', name: 'OneDrive', description: 'Store and sync documents with OneDrive', category: 'storage', icon: '☁️', status: 'connected', lastSync: '1 hour ago', accountInfo: 'Apex Legal - 50GB used' },
  { id: 'google-drive', name: 'Google Drive', description: 'Connect Google Drive for document storage', category: 'storage', icon: '📁', status: 'disconnected' },
  { id: 'dropbox', name: 'Dropbox', description: 'Sync documents with Dropbox', category: 'storage', icon: '📦', status: 'disconnected' },
  { id: 'sharepoint', name: 'SharePoint', description: 'Enterprise document management with SharePoint', category: 'storage', icon: '🏢', status: 'disconnected' },
  
  // Payments
  { id: 'stripe', name: 'Stripe', description: 'Accept credit card payments online', category: 'payment', icon: '💳', status: 'connected', accountInfo: 'apex_legal_llp' },
  { id: 'lawpay', name: 'LawPay', description: 'Legal-specific payment processing', category: 'payment', icon: '⚖️', status: 'disconnected' },
  { id: 'paypal', name: 'PayPal', description: 'Accept PayPal payments', category: 'payment', icon: '🅿️', status: 'disconnected' },
  
  // Accounting
  { id: 'quickbooks', name: 'QuickBooks Online', description: 'Sync invoices and payments with QuickBooks', category: 'accounting', icon: '📊', status: 'connected', lastSync: '1 day ago', accountInfo: 'Apex Legal Partners' },
  { id: 'xero', name: 'Xero', description: 'Connect Xero accounting software', category: 'accounting', icon: '📈', status: 'disconnected' },
  { id: 'freshbooks', name: 'FreshBooks', description: 'Sync with FreshBooks accounting', category: 'accounting', icon: '📒', status: 'disconnected' },
  
  // E-Signature
  { id: 'docusign', name: 'DocuSign', description: 'Send documents for electronic signature', category: 'esign', icon: '✍️', status: 'connected', accountInfo: 'Enterprise Plan' },
  { id: 'adobe-sign', name: 'Adobe Sign', description: 'Adobe Acrobat e-signature integration', category: 'esign', icon: '📝', status: 'disconnected' },
  { id: 'hellosign', name: 'HelloSign', description: 'Simple e-signature solution', category: 'esign', icon: '👋', status: 'disconnected' },
  
  // Communication
  { id: 'slack', name: 'Slack', description: 'Get notifications and updates in Slack', category: 'communication', icon: '💬', status: 'disconnected' },
  { id: 'teams', name: 'Microsoft Teams', description: 'Integrate with Microsoft Teams', category: 'communication', icon: '👥', status: 'connected', accountInfo: 'Apex Legal Workspace' },
  { id: 'zoom', name: 'Zoom', description: 'Schedule and join Zoom meetings', category: 'communication', icon: '📹', status: 'connected', accountInfo: 'Pro Account' },
  
  // AI Services
  { id: 'azure-openai', name: 'Azure OpenAI', description: 'Power AI features with Azure OpenAI Service', category: 'ai', icon: '🤖', status: 'connected', accountInfo: 'GPT-4 Turbo' },
  { id: 'azure-cognitive', name: 'Azure Cognitive Services', description: 'Document analysis and OCR capabilities', category: 'ai', icon: '🧠', status: 'connected', accountInfo: 'Form Recognizer enabled' }
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
  const [integrations, setIntegrations] = useState(availableIntegrations)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  const handleConnect = async (integrationId: string) => {
    setConnecting(integrationId)
    // Simulate OAuth flow
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    setIntegrations(prev => prev.map(i => 
      i.id === integrationId 
        ? { ...i, status: 'connected' as const, lastSync: 'Just now' }
        : i
    ))
    setConnecting(null)
  }

  const handleDisconnect = (integrationId: string) => {
    setIntegrations(prev => prev.map(i => 
      i.id === integrationId 
        ? { ...i, status: 'disconnected' as const, lastSync: undefined, accountInfo: undefined }
        : i
    ))
  }

  const filteredIntegrations = selectedCategory 
    ? integrations.filter(i => i.category === selectedCategory)
    : integrations

  const connectedCount = integrations.filter(i => i.status === 'connected').length

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
            <span className={styles.statValue}>{integrations.length - connectedCount}</span>
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
          <h3>Enterprise-Grade Infrastructure</h3>
          <p>All integrations use secure OAuth 2.0 authentication. Data is encrypted in transit (TLS 1.3) and at rest (AES-256). Your credentials are never stored.</p>
        </div>
        <div className={styles.bannerBadges}>
          <span><Lock size={14} /> SOC 2</span>
          <span><Shield size={14} /> HIPAA</span>
          <span><Globe size={14} /> GDPR</span>
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

      {/* Integrations Grid */}
      <div className={styles.integrationsGrid}>
        {filteredIntegrations.map(integration => (
          <div 
            key={integration.id} 
            className={`${styles.integrationCard} ${integration.status === 'connected' ? styles.connected : ''}`}
          >
            <div className={styles.integrationHeader}>
              <span className={styles.integrationIcon}>{integration.icon}</span>
              <div className={styles.integrationInfo}>
                <h3>{integration.name}</h3>
                <span className={styles.categoryTag}>
                  {categoryLabels[integration.category].label}
                </span>
              </div>
              <div className={`${styles.statusIndicator} ${styles[integration.status]}`}>
                {integration.status === 'connected' ? (
                  <CheckCircle2 size={18} />
                ) : integration.status === 'error' ? (
                  <XCircle size={18} />
                ) : null}
              </div>
            </div>

            <p className={styles.integrationDesc}>{integration.description}</p>

            {integration.status === 'connected' && (
              <div className={styles.connectedInfo}>
                {integration.accountInfo && (
                  <span className={styles.accountInfo}>{integration.accountInfo}</span>
                )}
                {integration.lastSync && (
                  <span className={styles.lastSync}>
                    <RefreshCw size={12} /> Synced {integration.lastSync}
                  </span>
                )}
              </div>
            )}

            <div className={styles.integrationActions}>
              {integration.status === 'connected' ? (
                <>
                  <button className={styles.settingsBtn}>
                    <Settings size={16} />
                    Configure
                  </button>
                  <button 
                    className={styles.disconnectBtn}
                    onClick={() => handleDisconnect(integration.id)}
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button 
                  className={styles.connectBtn}
                  onClick={() => handleConnect(integration.id)}
                  disabled={connecting === integration.id}
                >
                  {connecting === integration.id ? (
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
        ))}
      </div>

      {/* Data Flow Diagram */}
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
            <h4>Azure Cloud Infrastructure</h4>
            <ul>
              <li>Azure SQL Database with geo-replication</li>
              <li>Azure Blob Storage for documents</li>
              <li>Azure Key Vault for secrets</li>
              <li>Azure CDN for global delivery</li>
            </ul>
          </div>
          <div className={styles.dataFlowCard}>
            <div className={styles.dataFlowIcon}>
              <Lock size={32} />
            </div>
            <h4>Security & Encryption</h4>
            <ul>
              <li>AES-256 encryption at rest</li>
              <li>TLS 1.3 encryption in transit</li>
              <li>Customer-managed encryption keys</li>
              <li>Zero-knowledge architecture option</li>
            </ul>
          </div>
          <div className={styles.dataFlowCard}>
            <div className={styles.dataFlowIcon}>
              <Shield size={32} />
            </div>
            <h4>Compliance & Certifications</h4>
            <ul>
              <li>SOC 2 Type II certified</li>
              <li>HIPAA compliant</li>
              <li>GDPR compliant</li>
              <li>State bar ethics compliant</li>
            </ul>
          </div>
          <div className={styles.dataFlowCard}>
            <div className={styles.dataFlowIcon}>
              <Zap size={32} />
            </div>
            <h4>Performance & Reliability</h4>
            <ul>
              <li>99.99% uptime SLA</li>
              <li>Automatic failover</li>
              <li>Daily encrypted backups</li>
              <li>30-day backup retention</li>
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
