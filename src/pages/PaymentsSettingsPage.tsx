import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Wallet, CreditCard, Building2, Shield, Check, AlertCircle,
  DollarSign, ExternalLink, CheckCircle2, ArrowLeft
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function PaymentsSettingsPage() {
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  
  const [settings, setSettings] = useState({
    // Payment Processing
    processorConnected: true,
    processorName: 'LawPay',
    merchantId: 'apex_live_1234567890',
    
    // Online Payment Options
    acceptCreditCards: true,
    acceptAch: true,
    acceptEcheck: false,
    
    // Payment Settings
    partialPayments: true,
    autoApplyPayments: true,
    sendReceipts: true,
    
    // Trust Account
    trustAccountEnabled: true,
    trustAccountName: 'Client Trust Account - IOLTA',
    trustAccountNumber: '****4567'
  })

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className={styles.settingsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <h1>Online Payments</h1>
        <p>Configure payment processing and online payment options</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* Connected Processor */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <CreditCard size={20} />
              <div>
                <h2>Payment Processor</h2>
                <p>Connected payment processing account</p>
              </div>
            </div>

            {settings.processorConnected ? (
              <div style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-lg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--spacing-lg)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.875rem'
                  }}>
                    LP
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{settings.processorName}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      Merchant ID: {settings.merchantId}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)' }}>
                  <CheckCircle2 size={18} />
                  <span style={{ fontWeight: 500 }}>Connected</span>
                </div>
              </div>
            ) : (
              <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-lg)',
                marginBottom: 'var(--spacing-lg)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <AlertCircle size={20} style={{ color: 'var(--gold-primary)' }} />
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>No payment processor connected</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Connect a payment processor to start accepting online payments.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className={styles.secondaryBtn} onClick={() => {
                if (settings.processorConnected) {
                  window.open('https://lawpay.com/account', '_blank');
                } else {
                  alert('Redirecting to LawPay connection wizard...');
                  window.open('https://lawpay.com/signup', '_blank');
                }
              }}>
                <ExternalLink size={16} />
                {settings.processorConnected ? 'Manage Account' : 'Connect LawPay'}
              </button>
              <button className={styles.secondaryBtn} onClick={() => {
                alert('Other supported payment processors:\n\n• LawPay (Recommended)\n• Stripe\n• Square\n• PayPal Business\n• Authorize.net\n\nContact support@apex.law for integration assistance.');
              }}>
                View Other Processors
              </button>
            </div>
          </div>

          {/* Payment Methods */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Wallet size={20} />
              <div>
                <h2>Accepted Payment Methods</h2>
                <p>Choose which payment methods to accept</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Credit/Debit Cards</span>
                  <span className={styles.toggleDesc}>Accept Visa, Mastercard, American Express, Discover</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.acceptCreditCards}
                    onChange={e => setSettings({...settings, acceptCreditCards: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>ACH Bank Transfers</span>
                  <span className={styles.toggleDesc}>Accept direct bank transfers (lower fees)</span>
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
                  <span className={styles.toggleLabel}>eChecks</span>
                  <span className={styles.toggleDesc}>Accept electronic check payments</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.acceptEcheck}
                    onChange={e => setSettings({...settings, acceptEcheck: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Payment Options */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <DollarSign size={20} />
              <div>
                <h2>Payment Options</h2>
                <p>Configure payment handling preferences</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Allow Partial Payments</span>
                  <span className={styles.toggleDesc}>Let clients pay less than the full invoice amount</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.partialPayments}
                    onChange={e => setSettings({...settings, partialPayments: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Auto-Apply Payments</span>
                  <span className={styles.toggleDesc}>Automatically apply payments to oldest invoices first</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.autoApplyPayments}
                    onChange={e => setSettings({...settings, autoApplyPayments: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Send Payment Receipts</span>
                  <span className={styles.toggleDesc}>Email clients a receipt when payment is received</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.sendReceipts}
                    onChange={e => setSettings({...settings, sendReceipts: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Trust Account */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <Building2 size={20} />
              <div>
                <h2>Trust Account</h2>
                <p>Client trust account for retainers and held funds</p>
              </div>
            </div>

            <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
              <div>
                <span className={styles.toggleLabel}>Enable Trust Account</span>
                <span className={styles.toggleDesc}>Accept payments into client trust/IOLTA account</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.trustAccountEnabled}
                  onChange={e => setSettings({...settings, trustAccountEnabled: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            {settings.trustAccountEnabled && (
              <div style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-lg)'
              }}>
                <div className={styles.formGroup} style={{ marginBottom: '1rem' }}>
                  <label>Trust Account Name</label>
                  <input
                    type="text"
                    value={settings.trustAccountName}
                    onChange={e => setSettings({...settings, trustAccountName: e.target.value})}
                  />
                </div>
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label>Account Number</label>
                  <input
                    type="text"
                    value={settings.trustAccountNumber}
                    disabled
                    style={{ opacity: 0.6 }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Save Bar */}
          <div className={styles.saveBar}>
            {saved && (
              <span className={styles.savedMessage}>
                <Check size={16} />
                Payment settings saved!
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
