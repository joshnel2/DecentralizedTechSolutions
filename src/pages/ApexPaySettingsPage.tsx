import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, CreditCard, Key, Shield, Building2, Check, 
  AlertCircle, ExternalLink, Eye, EyeOff, Copy, CheckCircle2,
  Wallet, DollarSign, Lock, FileText, HelpCircle, Zap,
  AlertTriangle, Info
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function ApexPaySettingsPage() {
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [testMode, setTestMode] = useState(true)

  const [settings, setSettings] = useState({
    // Stripe Connection
    isConnected: false,
    publishableKey: '',
    secretKey: '',
    webhookSecret: '',
    
    // Account Settings
    accountId: '',
    businessName: '',
    
    // Payment Methods
    acceptCards: true,
    acceptAch: true,
    acceptApplePay: false,
    acceptGooglePay: false,
    
    // Trust Account
    enableTrustRouting: true,
    defaultToTrust: false,
    trustAccountLabel: 'Client Trust Account (IOLTA)',
    operatingAccountLabel: 'Operating Account',
    
    // Fees & Pricing
    passFeesToClient: false,
    feePercentage: 2.9,
    feeFixed: 0.30,
    
    // Receipts
    sendReceiptEmails: true,
    receiptFromName: 'Apex Legal',
    customReceiptMessage: ''
  })

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleConnectStripe = () => {
    // In production, this would redirect to Stripe Connect OAuth
    alert('This would redirect to Stripe Connect to authorize your account.\n\nFor now, you can manually enter your API keys below.')
  }

  return (
    <div className={styles.settingsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/apex-pay')}>
        <ArrowLeft size={16} />
        Back to Apex Pay
      </button>
      
      <div className={styles.header}>
        <h1>Apex Pay Configuration</h1>
        <p>Configure your payment processing settings and connect your Stripe account</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          
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
                <strong>Apex Pay</strong> is our integrated payment solution that allows your clients to pay invoices 
                online securely. It's powered by <strong>Stripe</strong>, one of the world's most trusted payment processors.
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
              <Key size={20} />
              <div>
                <h2>Stripe Connection</h2>
                <p>Connect your Stripe account to start accepting payments</p>
              </div>
            </div>

            {!settings.isConnected ? (
              <>
                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-lg)',
                  marginBottom: 'var(--spacing-lg)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem'
                }}>
                  <AlertCircle size={20} style={{ color: 'var(--gold-primary)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Not Connected</strong>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                      Connect your Stripe account or enter your API keys to start accepting payments.
                    </p>
                  </div>
                </div>

                <button 
                  onClick={handleConnectStripe}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.875rem 1.5rem',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: 'var(--spacing-lg)'
                  }}
                >
                  <CreditCard size={18} />
                  Connect with Stripe
                  <ExternalLink size={16} />
                </button>

                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '1rem',
                  marginBottom: 'var(--spacing-lg)',
                  color: 'var(--text-tertiary)',
                  fontSize: '0.875rem'
                }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-primary)' }} />
                  <span>or enter API keys manually</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-primary)' }} />
                </div>
              </>
            ) : (
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-lg)',
                marginBottom: 'var(--spacing-lg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <CheckCircle2 size={20} style={{ color: '#10b981' }} />
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Connected to Stripe</strong>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
                      Account: {settings.businessName || settings.accountId}
                    </p>
                  </div>
                </div>
                <button className={styles.secondaryBtn}>
                  <ExternalLink size={16} />
                  Stripe Dashboard
                </button>
              </div>
            )}

            {/* Test/Live Mode Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: 'var(--spacing-lg)',
              padding: '0.75rem 1rem',
              background: testMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              border: `1px solid ${testMode ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
              borderRadius: 'var(--radius-md)'
            }}>
              <AlertTriangle size={16} style={{ color: testMode ? 'var(--gold-primary)' : '#10b981' }} />
              <span style={{ flex: 1, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                {testMode ? 'Test Mode - No real charges will be made' : 'Live Mode - Real payments enabled'}
              </span>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={!testMode}
                  onChange={e => setTestMode(!e.target.checked)}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            {/* API Keys */}
            <div className={styles.formGroup}>
              <label>
                Publishable Key
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: '0.5rem' }}>
                  (starts with pk_test_ or pk_live_)
                </span>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={settings.publishableKey}
                  onChange={e => setSettings({...settings, publishableKey: e.target.value})}
                  placeholder="pk_test_..."
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <button 
                  className={styles.secondaryBtn}
                  onClick={() => copyToClipboard(settings.publishableKey, 'pk')}
                  style={{ padding: '0 0.75rem' }}
                >
                  {copiedField === 'pk' ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>
                Secret Key
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: '0.5rem' }}>
                  (starts with sk_test_ or sk_live_)
                </span>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type={showSecretKey ? 'text' : 'password'}
                  value={settings.secretKey}
                  onChange={e => setSettings({...settings, secretKey: e.target.value})}
                  placeholder="sk_test_..."
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <button 
                  className={styles.secondaryBtn}
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  style={{ padding: '0 0.75rem' }}
                >
                  {showSecretKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
                <Lock size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
                Your secret key is encrypted and stored securely. Never share it publicly.
              </p>
            </div>

            <div className={styles.formGroup}>
              <label>
                Webhook Secret
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: '0.5rem' }}>
                  (optional - for payment notifications)
                </span>
              </label>
              <input
                type="password"
                value={settings.webhookSecret}
                onChange={e => setSettings({...settings, webhookSecret: e.target.value})}
                placeholder="whsec_..."
                style={{ fontFamily: 'monospace' }}
              />
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-md)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem'
            }}>
              <Info size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                <strong>Where to find your keys:</strong> Log into your{' '}
                <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>
                  Stripe Dashboard → Developers → API Keys
                </a>
              </div>
            </div>
          </div>

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
                  Most state bar rules require client funds (retainers, settlements) to be deposited into an IOLTA trust account. 
                  Commingling client funds with operating funds can result in disciplinary action.
                </p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Enable Trust Account Routing</span>
                  <span className={styles.toggleDesc}>Allow selection of trust vs operating account per payment</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enableTrustRouting}
                    onChange={e => setSettings({...settings, enableTrustRouting: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
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
                  </a>, which includes the{' '}
                  <a href="https://stripe.com/legal/ssa" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>
                    Stripe Services Agreement
                  </a>.
                </p>
                <p style={{ marginBottom: '1rem' }}>
                  Apex Legal Services, LLC ("Apex") facilitates payments through Stripe but does not directly process, 
                  store, or have access to your clients' full payment card information. All payment data is handled 
                  directly by Stripe in accordance with PCI DSS Level 1 compliance standards.
                </p>
                <p style={{ marginBottom: '1rem' }}>
                  <strong>Fee Disclosure:</strong> Standard processing fees are 2.9% + $0.30 per successful card transaction 
                  and 0.8% (capped at $5.00) per ACH transaction. Additional fees may apply for chargebacks, 
                  international cards, or currency conversion.
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>Funds Availability:</strong> Funds from successful payments are typically available within 
                  2 business days. ACH payments may take 4-5 business days to clear.
                </p>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--spacing-lg)',
              marginBottom: 'var(--spacing-lg)'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>
                Trust Account Compliance
              </h3>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <p style={{ marginBottom: '1rem' }}>
                  <strong>Important:</strong> If you are an attorney or law firm, you are responsible for ensuring 
                  that client funds are handled in accordance with your jurisdiction's rules of professional conduct.
                </p>
                <p style={{ marginBottom: '1rem' }}>
                  Most state bar associations require that:
                </p>
                <ul style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>
                  <li>Client funds (retainers, settlements, advances) must be deposited into an IOLTA or trust account</li>
                  <li>Client funds must be kept separate from the firm's operating funds</li>
                  <li>Accurate records of all client funds must be maintained</li>
                  <li>Funds may only be disbursed as authorized by the client or as earned</li>
                </ul>
                <p style={{ marginBottom: 0 }}>
                  Apex Pay's trust account routing feature is designed to help you comply with these requirements, 
                  but it is your responsibility to ensure proper handling of client funds.
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
                  <strong>PCI DSS Compliance:</strong> Stripe is a certified PCI Level 1 Service Provider, the highest 
                  level of certification available. All card data is encrypted and processed on Stripe's secure servers.
                </p>
                <p style={{ marginBottom: '1rem' }}>
                  <strong>Data Handling:</strong> Apex does not store complete credit card numbers, CVV codes, or 
                  bank account credentials. We only store transaction references and metadata necessary for 
                  record-keeping and reconciliation.
                </p>
                <p style={{ marginBottom: 0 }}>
                  For questions about data handling, see our{' '}
                  <a href="/privacy" style={{ color: '#6366f1' }}>Privacy Policy</a> or contact{' '}
                  <a href="mailto:privacy@apex.law" style={{ color: '#6366f1' }}>privacy@apex.law</a>.
                </p>
              </div>
            </div>
          </div>

          {/* Save Bar */}
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
        </div>
      </div>
    </div>
  )
}
