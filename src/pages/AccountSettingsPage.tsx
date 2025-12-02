import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { 
  CreditCard, Building2, Users, Calendar, Check, AlertCircle, 
  Download, RefreshCw, Shield
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function AccountSettingsPage() {
  const { user } = useAuthStore()
  const [saved, setSaved] = useState(false)
  
  const [billingInfo, setBillingInfo] = useState({
    cardLast4: '4242',
    cardBrand: 'Visa',
    expiryMonth: '12',
    expiryYear: '2026',
    billingEmail: user?.email || '',
    billingAddress: '123 Legal Street, Suite 100, New York, NY 10001'
  })

  const subscription = {
    plan: 'Professional',
    status: 'Active',
    users: 5,
    maxUsers: 10,
    nextBillingDate: '2024-02-01',
    amount: 99,
    billingCycle: 'monthly'
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className={styles.settingsPage}>
      <div className={styles.header}>
        <h1>Account & Payment</h1>
        <p>Manage your subscription, billing information, and payment methods</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* Current Plan Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Shield size={20} />
              <div>
                <h2>Current Plan</h2>
                <p>Your subscription details and usage</p>
              </div>
            </div>

            <div style={{ 
              background: 'linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-secondary) 100%)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-lg)',
              marginBottom: 'var(--spacing-lg)',
              color: 'var(--bg-primary)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    {subscription.plan} Plan
                  </h3>
                  <p style={{ opacity: 0.9 }}>
                    ${subscription.amount}/user/{subscription.billingCycle}
                  </p>
                </div>
                <span style={{
                  background: 'rgba(0,0,0,0.2)',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.875rem',
                  fontWeight: 600
                }}>
                  {subscription.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '2rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={16} />
                  <span>{subscription.users} of {subscription.maxUsers} users</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={16} />
                  <span>Renews {new Date(subscription.nextBillingDate).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
              <button className={styles.secondaryBtn}>
                <RefreshCw size={16} />
                Change Plan
              </button>
              <button className={styles.secondaryBtn}>
                <Users size={16} />
                Add Users
              </button>
              <button className={styles.secondaryBtn}>
                <Download size={16} />
                Download Invoices
              </button>
            </div>
          </div>

          {/* Payment Method Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <CreditCard size={20} />
              <div>
                <h2>Payment Method</h2>
                <p>Manage your payment information</p>
              </div>
            </div>

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
                  background: 'var(--bg-secondary)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <CreditCard size={24} />
                </div>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {billingInfo.cardBrand} ending in {billingInfo.cardLast4}
                  </p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Expires {billingInfo.expiryMonth}/{billingInfo.expiryYear}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)' }}>
                <Check size={16} />
                <span style={{ fontSize: '0.875rem' }}>Default</span>
              </div>
            </div>

            <button className={styles.secondaryBtn}>
              <CreditCard size={16} />
              Update Payment Method
            </button>
          </div>

          {/* Billing Address Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Building2 size={20} />
              <div>
                <h2>Billing Information</h2>
                <p>Address and contact for invoices</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Billing Email</label>
              <input
                type="email"
                value={billingInfo.billingEmail}
                onChange={e => setBillingInfo({...billingInfo, billingEmail: e.target.value})}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Billing Address</label>
              <textarea
                value={billingInfo.billingAddress}
                onChange={e => setBillingInfo({...billingInfo, billingAddress: e.target.value})}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          {/* Account Actions */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <AlertCircle size={20} />
              <div>
                <h2>Account Actions</h2>
                <p>Manage your account status</p>
              </div>
            </div>

            <div className={styles.actionButtons}>
              <button className={styles.dangerBtn}>
                Cancel Subscription
              </button>
            </div>
          </div>

          {/* Save Bar */}
          <div className={styles.saveBar}>
            {saved && (
              <span className={styles.savedMessage}>
                <Check size={16} />
                Changes saved successfully!
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
