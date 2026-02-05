import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { 
  FileText, Clock, Receipt, Check, 
  Palette, ArrowLeft, Image, CreditCard
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function BillingSettingsPage() {
  const navigate = useNavigate()
  const { user: _user, firm: _firm } = useAuthStore()
  const [saved, setSaved] = useState(false)
  
  const [settings, setSettings] = useState({
    // Billing Defaults
    defaultRate: 450,
    billingIncrement: '6',
    roundingMethod: 'up',
    minimumEntry: '6',
    
    // Invoice Settings
    invoicePrefix: 'INV',
    nextInvoiceNumber: 1001,
    paymentTerms: '30',
    lateFeePercentage: 1.5,
    
    // UTBMS / LEDES
    utbmsEnabled: true,
    ledesFormat: '1998B',
    requireUtbmsCode: false,
    
    // Bill Appearance
    billTheme: 'professional',
    showDetailedTime: true,
    showAttorneyInitials: true,
    groupByMatter: true,
    showTaskCodes: true,
    
    // Invoice Template
    logoUrl: '',
    invoiceTitle: 'INVOICE',
    headerMessage: '',
    footerMessage: 'Thank you for your business. Please include the invoice number with your payment.',
    paymentInstructions: '',
    primaryColor: '#1a1a2e',
    accentColor: '#F59E0B',
    showFirmAddress: true,
    showFirmPhone: true,
    showFirmEmail: true
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
        <h1>Billing Settings</h1>
        <p>Configure billing preferences, invoice settings, and UTBMS options</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* Time Entry Defaults */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Clock size={20} />
              <div>
                <h2>Time Entry Defaults</h2>
                <p>Default settings for time entries</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Default Hourly Rate ($)</label>
                <input
                  type="number"
                  value={settings.defaultRate}
                  onChange={e => setSettings({...settings, defaultRate: parseInt(e.target.value)})}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Billing Increment (minutes)</label>
                <select
                  value={settings.billingIncrement}
                  onChange={e => setSettings({...settings, billingIncrement: e.target.value})}
                >
                  <option value="1">1 minute</option>
                  <option value="6">6 minutes (0.1 hr)</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes (0.25 hr)</option>
                  <option value="30">30 minutes (0.5 hr)</option>
                </select>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Rounding Method</label>
                <select
                  value={settings.roundingMethod}
                  onChange={e => setSettings({...settings, roundingMethod: e.target.value})}
                >
                  <option value="up">Round Up</option>
                  <option value="down">Round Down</option>
                  <option value="nearest">Round to Nearest</option>
                  <option value="none">No Rounding</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Minimum Entry (minutes)</label>
                <select
                  value={settings.minimumEntry}
                  onChange={e => setSettings({...settings, minimumEntry: e.target.value})}
                >
                  <option value="1">1 minute</option>
                  <option value="6">6 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                </select>
              </div>
            </div>
          </div>

          {/* Invoice Settings */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Receipt size={20} />
              <div>
                <h2>Invoice Settings</h2>
                <p>Configure invoice numbering and payment terms</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Invoice Prefix</label>
                <input
                  type="text"
                  value={settings.invoicePrefix}
                  onChange={e => setSettings({...settings, invoicePrefix: e.target.value})}
                  placeholder="INV"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Next Invoice Number</label>
                <input
                  type="number"
                  value={settings.nextInvoiceNumber}
                  onChange={e => setSettings({...settings, nextInvoiceNumber: parseInt(e.target.value)})}
                />
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Payment Terms (days)</label>
                <select
                  value={settings.paymentTerms}
                  onChange={e => setSettings({...settings, paymentTerms: e.target.value})}
                >
                  <option value="0">Due on Receipt</option>
                  <option value="15">Net 15</option>
                  <option value="30">Net 30</option>
                  <option value="45">Net 45</option>
                  <option value="60">Net 60</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Late Fee (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.lateFeePercentage}
                  onChange={e => setSettings({...settings, lateFeePercentage: parseFloat(e.target.value)})}
                />
              </div>
            </div>
          </div>

          {/* UTBMS / LEDES */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <FileText size={20} />
              <div>
                <h2>UTBMS & LEDES</h2>
                <p>Task-based billing codes and electronic billing formats</p>
              </div>
            </div>

            <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
              <div>
                <span className={styles.toggleLabel}>Enable UTBMS Codes</span>
                <span className={styles.toggleDesc}>Use Uniform Task-Based Management System codes</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.utbmsEnabled}
                  onChange={e => setSettings({...settings, utbmsEnabled: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.formGroup} style={{ opacity: settings.utbmsEnabled ? 1 : 0.5 }}>
              <label>LEDES Format</label>
              <select
                value={settings.ledesFormat}
                onChange={e => setSettings({...settings, ledesFormat: e.target.value})}
                disabled={!settings.utbmsEnabled}
              >
                <option value="1998B">LEDES 1998B</option>
                <option value="1998BI">LEDES 1998BI (Insurance)</option>
                <option value="2000">LEDES 2000</option>
                <option value="XML">LEDES XML</option>
              </select>
            </div>

            <div className={styles.toggle} style={{ opacity: settings.utbmsEnabled ? 1 : 0.5 }}>
              <div>
                <span className={styles.toggleLabel}>Require UTBMS Codes</span>
                <span className={styles.toggleDesc}>Require task/activity codes for all time entries</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.requireUtbmsCode}
                  onChange={e => setSettings({...settings, requireUtbmsCode: e.target.checked})}
                  disabled={!settings.utbmsEnabled}
                />
                <span className={styles.slider}></span>
              </label>
            </div>
          </div>

          {/* Bill Appearance */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Palette size={20} />
              <div>
                <h2>Bill Appearance</h2>
                <p>Customize how your bills look</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Bill Theme</label>
              <select
                value={settings.billTheme}
                onChange={e => setSettings({...settings, billTheme: e.target.value})}
              >
                <option value="professional">Professional</option>
                <option value="modern">Modern</option>
                <option value="classic">Classic</option>
                <option value="minimal">Minimal</option>
              </select>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Show Detailed Time</span>
                  <span className={styles.toggleDesc}>Display start/end times on bills</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showDetailedTime}
                    onChange={e => setSettings({...settings, showDetailedTime: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Show Attorney Initials</span>
                  <span className={styles.toggleDesc}>Display attorney initials next to entries</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showAttorneyInitials}
                    onChange={e => setSettings({...settings, showAttorneyInitials: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Group by Matter</span>
                  <span className={styles.toggleDesc}>Group time entries by matter on bills</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.groupByMatter}
                    onChange={e => setSettings({...settings, groupByMatter: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Show Task Codes</span>
                  <span className={styles.toggleDesc}>Include UTBMS codes on bills</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showTaskCodes}
                    onChange={e => setSettings({...settings, showTaskCodes: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Invoice Template */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Image size={20} />
              <div>
                <h2>Invoice Template</h2>
                <p>Customize your invoice branding and content</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Firm Logo URL</label>
              <input
                type="url"
                value={settings.logoUrl}
                onChange={e => setSettings({...settings, logoUrl: e.target.value})}
                placeholder="https://example.com/logo.png"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--apex-text)', marginTop: '4px' }}>
                Enter a URL to your firm's logo (recommended size: 200x80px)
              </span>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Invoice Title</label>
                <input
                  type="text"
                  value={settings.invoiceTitle}
                  onChange={e => setSettings({...settings, invoiceTitle: e.target.value})}
                  placeholder="INVOICE"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Primary Color</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={e => setSettings({...settings, primaryColor: e.target.value})}
                    style={{ width: '50px', height: '38px', padding: '2px', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={settings.primaryColor}
                    onChange={e => setSettings({...settings, primaryColor: e.target.value})}
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Header Message (optional)</label>
              <textarea
                value={settings.headerMessage}
                onChange={e => setSettings({...settings, headerMessage: e.target.value})}
                placeholder="Appears at the top of your invoice..."
                rows={2}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Footer Message</label>
              <textarea
                value={settings.footerMessage}
                onChange={e => setSettings({...settings, footerMessage: e.target.value})}
                placeholder="Thank you message or additional information..."
                rows={2}
              />
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Show Firm Address</span>
                  <span className={styles.toggleDesc}>Display your firm's address on invoices</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showFirmAddress}
                    onChange={e => setSettings({...settings, showFirmAddress: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Show Firm Phone</span>
                  <span className={styles.toggleDesc}>Display your firm's phone number</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showFirmPhone}
                    onChange={e => setSettings({...settings, showFirmPhone: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Show Firm Email</span>
                  <span className={styles.toggleDesc}>Display your firm's email address</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showFirmEmail}
                    onChange={e => setSettings({...settings, showFirmEmail: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Payment Instructions */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <CreditCard size={20} />
              <div>
                <h2>Payment Instructions</h2>
                <p>Add payment details that appear on every invoice</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Payment Instructions</label>
              <textarea
                value={settings.paymentInstructions}
                onChange={e => setSettings({...settings, paymentInstructions: e.target.value})}
                placeholder="E.g., Make checks payable to [Firm Name]&#10;Wire Transfer: Bank Name, Account #12345&#10;Pay online at: pay.yourfirm.com"
                rows={4}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--apex-text)', marginTop: '4px' }}>
                These instructions will appear in the payment section of every invoice
              </span>
            </div>
          </div>

          {/* Save Bar */}
          <div className={styles.saveBar}>
            {saved && (
              <span className={styles.savedMessage}>
                <Check size={16} />
                Billing settings saved!
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
