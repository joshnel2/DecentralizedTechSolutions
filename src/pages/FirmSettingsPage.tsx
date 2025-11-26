import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { 
  Building2, CreditCard, Brain, Shield, Save, Users, Briefcase,
  FileText, DollarSign, Clock, Sparkles, Key, CheckCircle2,
  AlertTriangle, Plus, Trash2, Edit2
} from 'lucide-react'
import styles from './FirmSettingsPage.module.css'

export function FirmSettingsPage() {
  const { firm, updateFirm, user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('general')
  const [saved, setSaved] = useState(false)

  const [firmData, setFirmData] = useState({
    name: firm?.name || '',
    address: firm?.address || '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    fax: '',
    email: '',
    website: '',
    taxId: ''
  })

  const [billingSettings, setBillingSettings] = useState({
    defaultHourlyRate: firm?.billingDefaults?.hourlyRate || 350,
    billingIncrement: firm?.billingDefaults?.incrementMinutes || 6,
    paymentTerms: 30,
    lateFeePercent: 1.5,
    currency: 'USD',
    taxRate: 0,
    trustAccountRequired: true,
    retainerMinimum: 5000
  })

  const [practiceAreas, setPracticeAreas] = useState([
    { id: '1', name: 'Corporate Law', active: true },
    { id: '2', name: 'Litigation', active: true },
    { id: '3', name: 'Real Estate', active: true },
    { id: '4', name: 'Intellectual Property', active: true },
    { id: '5', name: 'Employment Law', active: true },
    { id: '6', name: 'Tax Law', active: true },
    { id: '7', name: 'Estate Planning', active: true },
    { id: '8', name: 'Bankruptcy', active: false },
    { id: '9', name: 'Family Law', active: false },
    { id: '10', name: 'Immigration', active: false }
  ])

  const [activityCodes, setActivityCodes] = useState([
    { id: '1', code: 'A101', description: 'Legal Research', billable: true },
    { id: '2', code: 'A102', description: 'Document Review', billable: true },
    { id: '3', code: 'A103', description: 'Client Meeting', billable: true },
    { id: '4', code: 'A104', description: 'Court Appearance', billable: true },
    { id: '5', code: 'A105', description: 'Drafting', billable: true },
    { id: '6', code: 'A201', description: 'Administrative', billable: false },
    { id: '7', code: 'A202', description: 'Pro Bono', billable: false }
  ])

  const [aiSettings, setAiSettings] = useState({
    enabled: true,
    provider: 'azure',
    endpoint: firm?.azureOpenAI?.endpoint || '',
    apiKey: firm?.azureOpenAI?.apiKey || '',
    deploymentName: firm?.azureOpenAI?.deploymentName || '',
    autoSuggest: true,
    documentAnalysis: true,
    matterSummaries: true,
    conflictCheck: true
  })

  const [securitySettings, setSecuritySettings] = useState({
    requireMfa: true,
    sessionTimeout: 60,
    passwordMinLength: 12,
    passwordRequireSpecial: true,
    ipWhitelist: '',
    auditLogging: true,
    dataRetentionDays: 365
  })

  const [newPracticeArea, setNewPracticeArea] = useState('')
  const [newActivityCode, setNewActivityCode] = useState({ code: '', description: '', billable: true })

  const handleSave = () => {
    updateFirm({
      name: firmData.name,
      address: firmData.address,
      billingDefaults: {
        hourlyRate: billingSettings.defaultHourlyRate,
        incrementMinutes: billingSettings.billingIncrement
      },
      azureOpenAI: {
        endpoint: aiSettings.endpoint,
        apiKey: aiSettings.apiKey,
        deploymentName: aiSettings.deploymentName
      }
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const addPracticeArea = () => {
    if (newPracticeArea.trim()) {
      setPracticeAreas([...practiceAreas, {
        id: Date.now().toString(),
        name: newPracticeArea,
        active: true
      }])
      setNewPracticeArea('')
    }
  }

  const addActivityCode = () => {
    if (newActivityCode.code && newActivityCode.description) {
      setActivityCodes([...activityCodes, {
        id: Date.now().toString(),
        ...newActivityCode
      }])
      setNewActivityCode({ code: '', description: '', billable: true })
    }
  }

  const tabs = [
    { id: 'general', label: 'Firm Info', icon: Building2 },
    { id: 'billing', label: 'Billing & Rates', icon: DollarSign },
    { id: 'practice', label: 'Practice Areas', icon: Briefcase },
    { id: 'activities', label: 'Activity Codes', icon: Clock },
    { id: 'ai', label: 'AI Configuration', icon: Brain },
    { id: 'security', label: 'Security', icon: Shield }
  ]

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  if (!isAdmin) {
    return (
      <div className={styles.noAccess}>
        <AlertTriangle size={48} />
        <h2>Access Denied</h2>
        <p>You need administrator privileges to access firm settings.</p>
      </div>
    )
  }

  return (
    <div className={styles.firmSettingsPage}>
      <div className={styles.header}>
        <h1>Firm Settings</h1>
        <p>Manage your firm's configuration, billing, and AI settings</p>
      </div>

      <div className={styles.settingsLayout}>
        {/* Settings Navigation */}
        <nav className={styles.settingsNav}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`${styles.navItem} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Settings Content */}
        <div className={styles.settingsContent}>
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Building2 size={20} />
                  <div>
                    <h2>Firm Information</h2>
                    <p>Basic information about your law firm</p>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Firm Name</label>
                  <input
                    type="text"
                    value={firmData.name}
                    onChange={e => setFirmData({...firmData, name: e.target.value})}
                    placeholder="Your Law Firm LLP"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Street Address</label>
                  <input
                    type="text"
                    value={firmData.address}
                    onChange={e => setFirmData({...firmData, address: e.target.value})}
                    placeholder="123 Legal Avenue, Suite 400"
                  />
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>City</label>
                    <input
                      type="text"
                      value={firmData.city}
                      onChange={e => setFirmData({...firmData, city: e.target.value})}
                      placeholder="New York"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>State</label>
                    <input
                      type="text"
                      value={firmData.state}
                      onChange={e => setFirmData({...firmData, state: e.target.value})}
                      placeholder="NY"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>ZIP Code</label>
                    <input
                      type="text"
                      value={firmData.zip}
                      onChange={e => setFirmData({...firmData, zip: e.target.value})}
                      placeholder="10001"
                    />
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={firmData.phone}
                      onChange={e => setFirmData({...firmData, phone: e.target.value})}
                      placeholder="(555) 555-0100"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Fax</label>
                    <input
                      type="tel"
                      value={firmData.fax}
                      onChange={e => setFirmData({...firmData, fax: e.target.value})}
                      placeholder="(555) 555-0101"
                    />
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Email</label>
                    <input
                      type="email"
                      value={firmData.email}
                      onChange={e => setFirmData({...firmData, email: e.target.value})}
                      placeholder="info@yourfirm.com"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Website</label>
                    <input
                      type="url"
                      value={firmData.website}
                      onChange={e => setFirmData({...firmData, website: e.target.value})}
                      placeholder="https://yourfirm.com"
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Tax ID / EIN</label>
                  <input
                    type="text"
                    value={firmData.taxId}
                    onChange={e => setFirmData({...firmData, taxId: e.target.value})}
                    placeholder="XX-XXXXXXX"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <DollarSign size={20} />
                  <div>
                    <h2>Billing Defaults</h2>
                    <p>Default billing rates and settings for the firm</p>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Default Hourly Rate ($)</label>
                    <input
                      type="number"
                      value={billingSettings.defaultHourlyRate}
                      onChange={e => setBillingSettings({...billingSettings, defaultHourlyRate: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Billing Increment (minutes)</label>
                    <select
                      value={billingSettings.billingIncrement}
                      onChange={e => setBillingSettings({...billingSettings, billingIncrement: parseInt(e.target.value)})}
                    >
                      <option value={1}>1 minute</option>
                      <option value={6}>6 minutes (0.1 hr)</option>
                      <option value={10}>10 minutes</option>
                      <option value={15}>15 minutes (0.25 hr)</option>
                      <option value={30}>30 minutes (0.5 hr)</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Payment Terms (days)</label>
                    <select
                      value={billingSettings.paymentTerms}
                      onChange={e => setBillingSettings({...billingSettings, paymentTerms: parseInt(e.target.value)})}
                    >
                      <option value={15}>Net 15</option>
                      <option value={30}>Net 30</option>
                      <option value={45}>Net 45</option>
                      <option value={60}>Net 60</option>
                      <option value={90}>Net 90</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Late Fee (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={billingSettings.lateFeePercent}
                      onChange={e => setBillingSettings({...billingSettings, lateFeePercent: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Currency</label>
                    <select
                      value={billingSettings.currency}
                      onChange={e => setBillingSettings({...billingSettings, currency: e.target.value})}
                    >
                      <option value="USD">USD - US Dollar</option>
                      <option value="CAD">CAD - Canadian Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Tax Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={billingSettings.taxRate}
                      onChange={e => setBillingSettings({...billingSettings, taxRate: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <CreditCard size={20} />
                  <div>
                    <h2>Trust Accounting</h2>
                    <p>IOLTA and trust account settings</p>
                  </div>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Require Trust Account</span>
                    <span className={styles.toggleDesc}>Require retainer deposits before work begins</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={billingSettings.trustAccountRequired}
                      onChange={e => setBillingSettings({...billingSettings, trustAccountRequired: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.formGroup}>
                  <label>Minimum Retainer ($)</label>
                  <input
                    type="number"
                    value={billingSettings.retainerMinimum}
                    onChange={e => setBillingSettings({...billingSettings, retainerMinimum: parseInt(e.target.value)})}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Practice Areas Tab */}
          {activeTab === 'practice' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Briefcase size={20} />
                  <div>
                    <h2>Practice Areas</h2>
                    <p>Define the areas of law your firm practices</p>
                  </div>
                </div>

                <div className={styles.addForm}>
                  <input
                    type="text"
                    value={newPracticeArea}
                    onChange={e => setNewPracticeArea(e.target.value)}
                    placeholder="Add new practice area..."
                    onKeyPress={e => e.key === 'Enter' && addPracticeArea()}
                  />
                  <button onClick={addPracticeArea} className={styles.addBtn}>
                    <Plus size={18} />
                    Add
                  </button>
                </div>

                <div className={styles.itemsList}>
                  {practiceAreas.map(area => (
                    <div key={area.id} className={styles.listItem}>
                      <div className={styles.listItemContent}>
                        <span className={`${styles.statusDot} ${area.active ? styles.active : styles.inactive}`}></span>
                        <span className={styles.itemName}>{area.name}</span>
                      </div>
                      <div className={styles.listItemActions}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => setPracticeAreas(practiceAreas.map(a => 
                            a.id === area.id ? {...a, active: !a.active} : a
                          ))}
                        >
                          {area.active ? 'Disable' : 'Enable'}
                        </button>
                        <button 
                          className={styles.iconBtnDanger}
                          onClick={() => setPracticeAreas(practiceAreas.filter(a => a.id !== area.id))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Activity Codes Tab */}
          {activeTab === 'activities' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Clock size={20} />
                  <div>
                    <h2>Activity Codes</h2>
                    <p>Standard codes for time entries and billing</p>
                  </div>
                </div>

                <div className={styles.addFormGrid}>
                  <input
                    type="text"
                    value={newActivityCode.code}
                    onChange={e => setNewActivityCode({...newActivityCode, code: e.target.value})}
                    placeholder="Code (e.g., A101)"
                  />
                  <input
                    type="text"
                    value={newActivityCode.description}
                    onChange={e => setNewActivityCode({...newActivityCode, description: e.target.value})}
                    placeholder="Description"
                  />
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={newActivityCode.billable}
                      onChange={e => setNewActivityCode({...newActivityCode, billable: e.target.checked})}
                    />
                    Billable
                  </label>
                  <button onClick={addActivityCode} className={styles.addBtn}>
                    <Plus size={18} />
                    Add
                  </button>
                </div>

                <div className={styles.activityTable}>
                  <div className={styles.tableHeader}>
                    <span>Code</span>
                    <span>Description</span>
                    <span>Type</span>
                    <span>Actions</span>
                  </div>
                  {activityCodes.map(code => (
                    <div key={code.id} className={styles.tableRow}>
                      <span className={styles.code}>{code.code}</span>
                      <span>{code.description}</span>
                      <span>
                        <span className={`${styles.tag} ${code.billable ? styles.billable : styles.nonBillable}`}>
                          {code.billable ? 'Billable' : 'Non-Billable'}
                        </span>
                      </span>
                      <span>
                        <button 
                          className={styles.iconBtnDanger}
                          onClick={() => setActivityCodes(activityCodes.filter(c => c.id !== code.id))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* AI Configuration Tab */}
          {activeTab === 'ai' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Brain size={20} />
                  <div>
                    <h2>AI Configuration</h2>
                    <p>Configure AI services for intelligent features</p>
                  </div>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Enable AI Features</span>
                    <span className={styles.toggleDesc}>Use AI for document analysis, suggestions, and insights</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={aiSettings.enabled}
                      onChange={e => setAiSettings({...aiSettings, enabled: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                {aiSettings.enabled && (
                  <>
                    <div className={styles.formGroup}>
                      <label>AI Provider</label>
                      <select
                        value={aiSettings.provider}
                        onChange={e => setAiSettings({...aiSettings, provider: e.target.value})}
                      >
                        <option value="azure">Azure OpenAI</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic Claude</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label>API Endpoint</label>
                      <input
                        type="url"
                        value={aiSettings.endpoint}
                        onChange={e => setAiSettings({...aiSettings, endpoint: e.target.value})}
                        placeholder="https://your-resource.openai.azure.com/"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>API Key</label>
                      <input
                        type="password"
                        value={aiSettings.apiKey}
                        onChange={e => setAiSettings({...aiSettings, apiKey: e.target.value})}
                        placeholder="Enter your API key"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Deployment Name</label>
                      <input
                        type="text"
                        value={aiSettings.deploymentName}
                        onChange={e => setAiSettings({...aiSettings, deploymentName: e.target.value})}
                        placeholder="gpt-4"
                      />
                    </div>

                    <div className={styles.aiFeatures}>
                      <h3>
                        <Sparkles size={18} />
                        AI Features
                      </h3>
                      <div className={styles.toggleGroup}>
                        <div className={styles.toggle}>
                          <div>
                            <span className={styles.toggleLabel}>Auto-Suggest</span>
                            <span className={styles.toggleDesc}>AI suggestions while typing</span>
                          </div>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={aiSettings.autoSuggest}
                              onChange={e => setAiSettings({...aiSettings, autoSuggest: e.target.checked})}
                            />
                            <span className={styles.slider}></span>
                          </label>
                        </div>

                        <div className={styles.toggle}>
                          <div>
                            <span className={styles.toggleLabel}>Document Analysis</span>
                            <span className={styles.toggleDesc}>AI-powered document review and summarization</span>
                          </div>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={aiSettings.documentAnalysis}
                              onChange={e => setAiSettings({...aiSettings, documentAnalysis: e.target.checked})}
                            />
                            <span className={styles.slider}></span>
                          </label>
                        </div>

                        <div className={styles.toggle}>
                          <div>
                            <span className={styles.toggleLabel}>Matter Summaries</span>
                            <span className={styles.toggleDesc}>Automatic matter status summaries</span>
                          </div>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={aiSettings.matterSummaries}
                              onChange={e => setAiSettings({...aiSettings, matterSummaries: e.target.checked})}
                            />
                            <span className={styles.slider}></span>
                          </label>
                        </div>

                        <div className={styles.toggle}>
                          <div>
                            <span className={styles.toggleLabel}>Conflict Check</span>
                            <span className={styles.toggleDesc}>AI-assisted conflict of interest checking</span>
                          </div>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={aiSettings.conflictCheck}
                              onChange={e => setAiSettings({...aiSettings, conflictCheck: e.target.checked})}
                            />
                            <span className={styles.slider}></span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Shield size={20} />
                  <div>
                    <h2>Security Settings</h2>
                    <p>Configure firm-wide security policies</p>
                  </div>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Require Multi-Factor Authentication</span>
                    <span className={styles.toggleDesc}>All users must enable MFA</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={securitySettings.requireMfa}
                      onChange={e => setSecuritySettings({...securitySettings, requireMfa: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Session Timeout (minutes)</label>
                    <select
                      value={securitySettings.sessionTimeout}
                      onChange={e => setSecuritySettings({...securitySettings, sessionTimeout: parseInt(e.target.value)})}
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={480}>8 hours</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Password Minimum Length</label>
                    <select
                      value={securitySettings.passwordMinLength}
                      onChange={e => setSecuritySettings({...securitySettings, passwordMinLength: parseInt(e.target.value)})}
                    >
                      <option value={8}>8 characters</option>
                      <option value={10}>10 characters</option>
                      <option value={12}>12 characters</option>
                      <option value={14}>14 characters</option>
                      <option value={16}>16 characters</option>
                    </select>
                  </div>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Require Special Characters</span>
                    <span className={styles.toggleDesc}>Passwords must contain special characters</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={securitySettings.passwordRequireSpecial}
                      onChange={e => setSecuritySettings({...securitySettings, passwordRequireSpecial: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Audit Logging</span>
                    <span className={styles.toggleDesc}>Log all user actions for compliance</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={securitySettings.auditLogging}
                      onChange={e => setSecuritySettings({...securitySettings, auditLogging: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.formGroup}>
                  <label>IP Whitelist (optional)</label>
                  <textarea
                    value={securitySettings.ipWhitelist}
                    onChange={e => setSecuritySettings({...securitySettings, ipWhitelist: e.target.value})}
                    placeholder="Enter IP addresses, one per line"
                    rows={3}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Data Retention (days)</label>
                  <select
                    value={securitySettings.dataRetentionDays}
                    onChange={e => setSecuritySettings({...securitySettings, dataRetentionDays: parseInt(e.target.value)})}
                  >
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                    <option value={730}>2 years</option>
                    <option value={1825}>5 years</option>
                    <option value={3650}>10 years</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className={styles.saveBar}>
            {saved && (
              <span className={styles.savedMessage}>
                <CheckCircle2 size={16} />
                Settings saved successfully!
              </span>
            )}
            <button className={styles.saveBtn} onClick={handleSave}>
              <Save size={18} />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
