import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Building2, DollarSign, Sparkles, Globe, Save } from 'lucide-react'
import styles from './SettingsPage.module.css'

export function FirmSettingsPage() {
  const { firm, updateFirm } = useAuthStore()
  const [formData, setFormData] = useState({
    name: firm?.name || '',
    address: firm?.address || '',
    city: firm?.city || '',
    state: firm?.state || '',
    zipCode: firm?.zipCode || '',
    phone: firm?.phone || '',
    email: firm?.email || '',
    website: firm?.website || '',
    timezone: firm?.timezone || 'America/New_York',
    billingRate: firm?.billingRate || 350,
    currency: firm?.currency || 'USD',
    defaultBillingIncrement: firm?.settings?.defaultBillingIncrement || 6,
    invoicePrefix: firm?.settings?.invoicePrefix || 'INV',
    matterPrefix: firm?.settings?.matterPrefix || 'MTR',
    azureOpenAIEndpoint: firm?.settings?.azureOpenAIEndpoint || '',
    azureOpenAIKey: firm?.settings?.azureOpenAIKey || '',
    azureOpenAIDeployment: firm?.settings?.azureOpenAIDeployment || 'gpt-4'
  })
  const [saved, setSaved] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateFirm({
      name: formData.name,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      zipCode: formData.zipCode,
      phone: formData.phone,
      email: formData.email,
      website: formData.website,
      timezone: formData.timezone,
      billingRate: formData.billingRate,
      currency: formData.currency,
      settings: {
        defaultBillingIncrement: formData.defaultBillingIncrement,
        invoicePrefix: formData.invoicePrefix,
        matterPrefix: formData.matterPrefix,
        azureOpenAIEndpoint: formData.azureOpenAIEndpoint,
        azureOpenAIKey: formData.azureOpenAIKey,
        azureOpenAIDeployment: formData.azureOpenAIDeployment,
        aiEnabled: !!formData.azureOpenAIKey
      }
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className={styles.settingsPage}>
      <div className={styles.header}>
        <h1>Firm Settings</h1>
        <p>Manage your firm's details and configuration</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.settingsForm}>
        {/* Firm Details */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Building2 size={20} />
            <div>
              <h2>Firm Information</h2>
              <p>Basic details about your firm</p>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Firm Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
            />
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({...formData, city: e.target.value})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>State</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({...formData, state: e.target.value})}
              />
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Website</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({...formData, website: e.target.value})}
              placeholder="https://yourfirm.com"
            />
          </div>
        </section>

        {/* Billing Settings */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <DollarSign size={20} />
            <div>
              <h2>Billing Configuration</h2>
              <p>Default billing rates and preferences</p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Default Hourly Rate ($)</label>
              <input
                type="number"
                value={formData.billingRate}
                onChange={(e) => setFormData({...formData, billingRate: parseInt(e.target.value)})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({...formData, currency: e.target.value})}
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="CAD">CAD - Canadian Dollar</option>
              </select>
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Billing Increment (minutes)</label>
              <select
                value={formData.defaultBillingIncrement}
                onChange={(e) => setFormData({...formData, defaultBillingIncrement: parseInt(e.target.value)})}
              >
                <option value="1">1 minute</option>
                <option value="6">6 minutes (0.1 hr)</option>
                <option value="15">15 minutes (0.25 hr)</option>
                <option value="30">30 minutes (0.5 hr)</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Timezone</label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({...formData, timezone: e.target.value})}
              >
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
              </select>
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Invoice Prefix</label>
              <input
                type="text"
                value={formData.invoicePrefix}
                onChange={(e) => setFormData({...formData, invoicePrefix: e.target.value})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Matter Prefix</label>
              <input
                type="text"
                value={formData.matterPrefix}
                onChange={(e) => setFormData({...formData, matterPrefix: e.target.value})}
              />
            </div>
          </div>
        </section>

        {/* AI Configuration */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Sparkles size={20} />
            <div>
              <h2>AI Configuration</h2>
              <p>Configure Azure OpenAI integration</p>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Azure OpenAI Endpoint</label>
            <input
              type="text"
              value={formData.azureOpenAIEndpoint}
              onChange={(e) => setFormData({...formData, azureOpenAIEndpoint: e.target.value})}
              placeholder="https://your-resource.openai.azure.com"
            />
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>API Key</label>
              <input
                type="password"
                value={formData.azureOpenAIKey}
                onChange={(e) => setFormData({...formData, azureOpenAIKey: e.target.value})}
                placeholder="••••••••••••••••"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Deployment Name</label>
              <input
                type="text"
                value={formData.azureOpenAIDeployment}
                onChange={(e) => setFormData({...formData, azureOpenAIDeployment: e.target.value})}
                placeholder="gpt-4"
              />
            </div>
          </div>
        </section>

        <div className={styles.actions}>
          {saved && (
            <span className={styles.savedMessage}>Settings saved successfully!</span>
          )}
          <button type="submit" className={styles.saveBtn}>
            <Save size={18} />
            Save Changes
          </button>
        </div>
      </form>
    </div>
  )
}
