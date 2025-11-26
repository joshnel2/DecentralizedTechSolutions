import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { ArrowRight, Sparkles, Building2 } from 'lucide-react'
import styles from './AuthPages.module.css'

export function FirmSetupPage() {
  const navigate = useNavigate()
  const { setupFirm, isLoading, user } = useAuthStore()
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    email: user?.email || '',
    website: '',
    timezone: 'America/New_York',
    billingRate: 350,
    currency: 'USD',
    azureOpenAIEndpoint: '',
    azureOpenAIKey: '',
    azureOpenAIDeployment: 'gpt-4'
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value
    setFormData(prev => ({ ...prev, [e.target.name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    await setupFirm({
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
        azureOpenAIEndpoint: formData.azureOpenAIEndpoint,
        azureOpenAIKey: formData.azureOpenAIKey,
        azureOpenAIDeployment: formData.azureOpenAIDeployment,
        aiEnabled: !!formData.azureOpenAIKey,
        defaultBillingIncrement: 6,
        invoicePrefix: 'INV',
        matterPrefix: 'MTR'
      }
    })
    
    navigate('/app/dashboard')
  }

  const handleSkip = async () => {
    await setupFirm({
      name: 'My Firm',
      email: user?.email || '',
      timezone: 'America/New_York',
      billingRate: 350,
      currency: 'USD'
    })
    navigate('/app/dashboard')
  }

  return (
    <div className={styles.setupPage}>
      {/* Background Effects */}
      <div className={styles.bgEffects}>
        <div className={styles.gradientOrb1} />
        <div className={styles.gradientOrb2} />
        <div className={styles.gridOverlay} />
      </div>

      <div className={styles.setupContainer}>
        <div className={styles.setupHeader}>
          <div className={styles.logo} style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#setupGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="setupGrad" x1="16" y1="4" x2="16" y2="28">
                  <stop stopColor="#FBBF24"/>
                  <stop offset="1" stopColor="#F59E0B"/>
                </linearGradient>
              </defs>
            </svg>
            <span className={styles.logoText}>Apex</span>
          </div>
          <h1>Set up your firm</h1>
          <p>Configure your practice settings to get started</p>
        </div>

        <div className={styles.setupCard}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="name">
                <Building2 size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                Firm Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Smith & Associates LLP"
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="address">Street Address</label>
              <input
                type="text"
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="123 Legal Street, Suite 100"
              />
            </div>

            <div className={styles.inputRow3}>
              <div className={styles.inputGroup}>
                <label htmlFor="city">City</label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  placeholder="New York"
                />
              </div>
              <div className={styles.inputGroup}>
                <label htmlFor="state">State</label>
                <input
                  type="text"
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="NY"
                />
              </div>
              <div className={styles.inputGroup}>
                <label htmlFor="zipCode">ZIP</label>
                <input
                  type="text"
                  id="zipCode"
                  name="zipCode"
                  value={formData.zipCode}
                  onChange={handleChange}
                  placeholder="10001"
                />
              </div>
            </div>

            <div className={styles.inputRow}>
              <div className={styles.inputGroup}>
                <label htmlFor="phone">Phone</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="(212) 555-0100"
                />
              </div>
              <div className={styles.inputGroup}>
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="info@yourfirm.com"
                />
              </div>
            </div>

            <div className={styles.inputRow}>
              <div className={styles.inputGroup}>
                <label htmlFor="billingRate">Default Hourly Rate ($)</label>
                <input
                  type="number"
                  id="billingRate"
                  name="billingRate"
                  value={formData.billingRate}
                  onChange={handleChange}
                  min="0"
                  step="25"
                />
              </div>
              <div className={styles.inputGroup}>
                <label htmlFor="timezone">Timezone</label>
                <select
                  id="timezone"
                  name="timezone"
                  value={formData.timezone}
                  onChange={handleChange}
                >
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                </select>
              </div>
            </div>

            {/* AI Configuration Section */}
            <div className={styles.aiSection}>
              <div className={styles.aiSectionHeader}>
                <Sparkles size={20} style={{ color: 'var(--apex-ai)' }} />
                <h3>AI Configuration</h3>
                <span>Optional</span>
              </div>
              
              <div className={styles.inputGroup}>
                <label htmlFor="azureOpenAIEndpoint">Azure OpenAI Endpoint</label>
                <input
                  type="text"
                  id="azureOpenAIEndpoint"
                  name="azureOpenAIEndpoint"
                  value={formData.azureOpenAIEndpoint}
                  onChange={handleChange}
                  placeholder="https://your-resource.openai.azure.com"
                />
              </div>

              <div className={styles.inputRow}>
                <div className={styles.inputGroup}>
                  <label htmlFor="azureOpenAIKey">API Key</label>
                  <input
                    type="password"
                    id="azureOpenAIKey"
                    name="azureOpenAIKey"
                    value={formData.azureOpenAIKey}
                    onChange={handleChange}
                    placeholder="••••••••••••••••"
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label htmlFor="azureOpenAIDeployment">Deployment Name</label>
                  <input
                    type="text"
                    id="azureOpenAIDeployment"
                    name="azureOpenAIDeployment"
                    value={formData.azureOpenAIDeployment}
                    onChange={handleChange}
                    placeholder="gpt-4"
                  />
                </div>
              </div>
            </div>

            <div className={styles.setupActions}>
              <button 
                type="button" 
                className={styles.skipBtn}
                onClick={handleSkip}
              >
                Skip for now
              </button>
              <button 
                type="submit" 
                className={styles.submitBtn}
                style={{ width: 'auto' }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className={styles.spinner} />
                ) : (
                  <>
                    Complete Setup
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
