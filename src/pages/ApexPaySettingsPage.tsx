import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { 
  ArrowLeft, CreditCard, Shield, Building2, Check, 
  AlertCircle, ExternalLink, CheckCircle2,
  Wallet, DollarSign, Lock, FileText, Zap,
  AlertTriangle, Info, Loader2, XCircle, Unlink
} from 'lucide-react'
import { stripeApi } from '../services/api'
import styles from './SettingsPage.module.css'

interface StripeConnection {
  id: string
  stripeAccountId: string
  businessName: string
  email: string
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  settings: {
    defaultToTrust: boolean
    trustAccountLabel: string
    operatingAccountLabel: string
    acceptCards: boolean
    acceptAch: boolean
    acceptApplePay: boolean
    acceptGooglePay: boolean
  }
  complianceAcceptedAt: string | null
  connectedAt: string
}

export function ApexPaySettingsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<StripeConnection | null>(null)
  const [complianceAccepted, setComplianceAccepted] = useState(false)

  const [settings, setSettings] = useState({
    defaultToTrust: false,
    trustAccountLabel: 'Client Trust Account (IOLTA)',
    operatingAccountLabel: 'Operating Account',
    acceptCards: true,
    acceptAch: true,
    acceptApplePay: false,
    acceptGooglePay: false,
  })

  // Load connection status
  useEffect(() => {
    loadConnectionStatus()
  }, [])

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      setError('Connection was cancelled or failed. Please try again.')
      // Clear URL params
      navigate('/app/settings/apex-pay', { replace: true })
      return
    }

    if (code && state) {
      handleOAuthCallback(code, state)
    }
  }, [searchParams])

  const loadConnectionStatus = async () => {
    try {
      setLoading(true)
      const data = await stripeApi.getConnectionStatus()
      
      if (data.connected && data.connection) {
        setConnection(data.connection)
        setSettings(data.connection.settings)
        setComplianceAccepted(!!data.connection.complianceAcceptedAt)
      }
    } catch (err) {
      console.error('Error loading connection status:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthCallback = async (code: string, state: string) => {
    try {
      setConnecting(true)
      setError(null)
      
      const result = await stripeApi.handleCallback(code, state)
      
      if (result.success) {
        await loadConnectionStatus()
        // Clear URL params
        navigate('/app/settings/apex-pay', { replace: true })
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect Stripe account')
      navigate('/app/settings/apex-pay', { replace: true })
    } finally {
      setConnecting(false)
    }
  }

  const handleConnect = async () => {
    try {
      setConnecting(true)
      setError(null)
      
      const data = await stripeApi.getOAuthUrl()
      
      if (data.url) {
        // Redirect to Stripe
        window.location.href = data.url
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start connection')
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Stripe account? You will no longer be able to accept payments.')) {
      return
    }

    try {
      setDisconnecting(true)
      await stripeApi.disconnect()
      setConnection(null)
      setComplianceAccepted(false)
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  const handleAcceptCompliance = async () => {
    try {
      await stripeApi.acceptCompliance()
      setComplianceAccepted(true)
      if (connection) {
        setConnection({ ...connection, complianceAcceptedAt: new Date().toISOString() })
      }
    } catch (err: any) {
      setError(err.message || 'Failed to accept compliance terms')
    }
  }

  const handleSave = async () => {
    try {
      await stripeApi.updateSettings(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save settings')
    }
  }

  if (loading) {
    return (
      <div className={styles.settingsPage}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--gold-primary)' }} />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.settingsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/apex-pay')}>
        <ArrowLeft size={16} />
        Back to Apex Pay
      </button>
      
      <div className={styles.header}>
        <h1>Apex Pay Configuration</h1>
        <p>Connect your Stripe account to start accepting payments from clients</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>

          {/* Error Display */}
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <XCircle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
              <span style={{ color: 'var(--text-primary)', flex: 1 }}>{error}</span>
              <button 
                onClick={() => setError(null)}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
              >
                <XCircle size={16} />
              </button>
            </div>
          )}
          
          {/* What is Apex Pay */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Zap size={20} />
              <div>
                <h2>What is Apex Pay?</h2>
                <p>Understanding how payments work in Apex</p>
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.05))',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--spacing-lg)',
              marginBottom: 'var(--spacing-lg)'
            }}>
              <p style={{ color: 'var(--text-primary)', marginBottom: '1rem', lineHeight: 1.7 }}>
                <strong>Apex Pay</strong> lets your clients pay invoices online securely. 
                Simply connect your Stripe account (or create one) and you're ready to accept payments.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <Shield size={18} style={{ color: '#6366f1', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>PCI Compliant</strong>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: 0 }}>
                      Card data never touches your servers
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <Building2 size={18} style={{ color: '#6366f1', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>Trust Account Ready</strong>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: 0 }}>
                      Route funds to operating or trust accounts
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <CreditCard size={18} style={{ color: '#6366f1', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>Multiple Methods</strong>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: 0 }}>
                      Cards, ACH, Apple Pay, Google Pay
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <DollarSign size={18} style={{ color: '#6366f1', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>Competitive Rates</strong>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: 0 }}>
                      2.9% + $0.30 for cards, 0.8% for ACH
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connection Status */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <CreditCard size={20} />
              <div>
                <h2>Stripe Connection</h2>
                <p>Connect your Stripe account to accept payments</p>
              </div>
            </div>

            {connecting ? (
              <div style={{
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-xl)',
                textAlign: 'center'
              }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#6366f1', marginBottom: '1rem' }} />
                <p style={{ color: 'var(--text-primary)', margin: 0 }}>Connecting to Stripe...</p>
              </div>
            ) : connection ? (
              <>
                {/* Connected State */}
                <div style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-lg)',
                  marginBottom: 'var(--spacing-lg)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <CheckCircle2 size={24} style={{ color: '#10b981' }} />
                      <div>
                        <strong style={{ color: 'var(--text-primary)', display: 'block' }}>
                          Connected to Stripe
                        </strong>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                          {connection.businessName} ({connection.email})
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <a 
                        href="https://dashboard.stripe.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.secondaryBtn}
                      >
                        <ExternalLink size={16} />
                        Stripe Dashboard
                      </a>
                      <button 
                        className={styles.secondaryBtn}
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        style={{ color: '#ef4444' }}
                      >
                        {disconnecting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Unlink size={16} />}
                        Disconnect
                      </button>
                    </div>
                  </div>

                  {/* Account Status Badges */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      background: connection.chargesEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: connection.chargesEnabled ? '#10b981' : 'var(--gold-primary)'
                    }}>
                      {connection.chargesEnabled ? '✓ Charges Enabled' : '⏳ Charges Pending'}
                    </span>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      background: connection.payoutsEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: connection.payoutsEnabled ? '#10b981' : 'var(--gold-primary)'
                    }}>
                      {connection.payoutsEnabled ? '✓ Payouts Enabled' : '⏳ Payouts Pending'}
                    </span>
                  </div>
                </div>

                {/* Compliance Acceptance */}
                {!complianceAccepted && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--spacing-lg)',
                    marginBottom: 'var(--spacing-lg)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                      <AlertTriangle size={20} style={{ color: 'var(--gold-primary)', flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ color: 'var(--text-primary)' }}>Accept Compliance Terms</strong>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                          Before accepting payments, please acknowledge your compliance responsibilities.
                        </p>
                      </div>
                    </div>
                    <div style={{
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--spacing-md)',
                      marginBottom: '1rem',
                      fontSize: '0.8125rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.7
                    }}>
                      <p style={{ margin: '0 0 0.75rem 0' }}>By clicking "I Accept" below, you acknowledge that:</p>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                        <li>You are responsible for compliance with your jurisdiction's bar rules regarding client funds</li>
                        <li>Client trust funds must be properly segregated and handled according to IOLTA/trust account rules</li>
                        <li>Apex provides tools to help with compliance but does not guarantee compliance</li>
                        <li>You have read and agree to Stripe's terms of service</li>
                      </ul>
                    </div>
                    <button
                      onClick={handleAcceptCompliance}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1.5rem',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: 'white',
                        fontSize: '0.9375rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <Check size={18} />
                      I Accept These Terms
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Not Connected State */}
                <div style={{
                  background: 'rgba(99, 102, 241, 0.05)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--spacing-xl)',
                  textAlign: 'center',
                  marginBottom: 'var(--spacing-lg)'
                }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    margin: '0 auto 1rem',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white'
                  }}>
                    <CreditCard size={32} />
                  </div>
                  <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>
                    Connect Your Stripe Account
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem 0', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                    Sign in to your existing Stripe account or create a new one. 
                    You'll be redirected to Stripe to authorize the connection.
                  </p>
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.875rem 2rem',
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      color: 'white',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
                    }}
                  >
                    {connecting ? (
                      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <CreditCard size={20} />
                    )}
                    Connect with Stripe
                  </button>
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '1rem' }}>
                    <Lock size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
                    Secure connection powered by Stripe Connect
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Settings - Only show if connected */}
          {connection && complianceAccepted && (
            <>
              {/* Payment Methods */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Wallet size={20} />
                  <div>
                    <h2>Payment Methods</h2>
                    <p>Choose which payment methods to accept</p>
                  </div>
                </div>

                <div className={styles.toggleGroup}>
                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Credit & Debit Cards</span>
                      <span className={styles.toggleDesc}>Visa, Mastercard, American Express, Discover (2.9% + $0.30)</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={settings.acceptCards}
                        onChange={e => setSettings({...settings, acceptCards: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>ACH Bank Transfers</span>
                      <span className={styles.toggleDesc}>Direct bank transfers - lower fees (0.8%, max $5)</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={settings.acceptAch}
                        onChange={e => setSettings({...settings, acceptAch: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Apple Pay</span>
                      <span className={styles.toggleDesc}>Accept payments from Apple Pay wallets</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={settings.acceptApplePay}
                        onChange={e => setSettings({...settings, acceptApplePay: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Google Pay</span>
                      <span className={styles.toggleDesc}>Accept payments from Google Pay wallets</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={settings.acceptGooglePay}
                        onChange={e => setSettings({...settings, acceptGooglePay: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Trust Account Settings */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Building2 size={20} />
                  <div>
                    <h2>Trust Account Routing</h2>
                    <p>Configure how payments are routed to operating vs trust accounts</p>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-md)',
                  marginBottom: 'var(--spacing-lg)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem'
                }}>
                  <AlertTriangle size={18} style={{ color: 'var(--gold-primary)', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.875rem' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Important for Bar Compliance</strong>
                    <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
                      Most state bar rules require client funds to be deposited into an IOLTA trust account. 
                      You are responsible for proper fund handling.
                    </p>
                  </div>
                </div>

                <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
                  <div>
                    <span className={styles.toggleLabel}>Default to Trust Account</span>
                    <span className={styles.toggleDesc}>New payments default to trust account (safer for compliance)</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={settings.defaultToTrust}
                      onChange={e => setSettings({...settings, defaultToTrust: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: 'var(--spacing-md)' }}>
                  <div className={styles.formGroup} style={{ margin: 0 }}>
                    <label>Trust Account Label</label>
                    <input
                      type="text"
                      value={settings.trustAccountLabel}
                      onChange={e => setSettings({...settings, trustAccountLabel: e.target.value})}
                    />
                  </div>
                  <div className={styles.formGroup} style={{ margin: 0 }}>
                    <label>Operating Account Label</label>
                    <input
                      type="text"
                      value={settings.operatingAccountLabel}
                      onChange={e => setSettings({...settings, operatingAccountLabel: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Compliance & Legal */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <FileText size={20} />
              <div>
                <h2>Compliance & Legal Disclosures</h2>
                <p>Important information about payment processing</p>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--spacing-lg)',
              marginBottom: 'var(--spacing-lg)'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>
                Payment Processing Disclosure
              </h3>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <p style={{ marginBottom: '1rem' }}>
                  Payment processing services for Apex Pay are provided by <strong>Stripe, Inc.</strong> ("Stripe"). 
                  By using Apex Pay, you agree to be bound by Stripe's{' '}
                  <a href="https://stripe.com/legal/connect-account" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>
                    Connected Account Agreement
                  </a>.
                </p>
                <p style={{ marginBottom: '1rem' }}>
                  <strong>Fee Disclosure:</strong> Standard processing fees are 2.9% + $0.30 per successful card transaction 
                  and 0.8% (capped at $5.00) per ACH transaction.
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>Your Responsibility:</strong> You are solely responsible for compliance with your jurisdiction's 
                  rules of professional conduct regarding client funds, trust accounts, and fee handling.
                </p>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--spacing-lg)'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>
                Data Security & Privacy
              </h3>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <p style={{ marginBottom: '1rem' }}>
                  <strong>PCI DSS Compliance:</strong> Stripe is a certified PCI Level 1 Service Provider. 
                  All card data is encrypted and processed on Stripe's secure servers.
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>Data Handling:</strong> Apex does not store credit card numbers or bank account credentials. 
                  We only store transaction references for record-keeping.
                </p>
              </div>
            </div>
          </div>

          {/* Save Bar - Only show if connected and compliance accepted */}
          {connection && complianceAccepted && (
            <div className={styles.saveBar}>
              {saved && (
                <span className={styles.savedMessage}>
                  <Check size={16} />
                  Settings saved successfully!
                </span>
              )}
              <button className={styles.saveBtn} onClick={handleSave}>
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
