import { useState } from 'react'
import { 
  Sparkles, Brain, Shield, Zap, Key, Check, 
  AlertCircle, Settings, ToggleLeft, Eye
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function AIConfigPage() {
  const [saved, setSaved] = useState(false)
  
  const [settings, setSettings] = useState({
    // AI Provider
    provider: 'openai',
    model: 'gpt-4',
    apiKeyConfigured: true,
    
    // AI Features
    documentAnalysis: true,
    caseResearch: true,
    draftAssistance: true,
    timeEntryDescriptions: true,
    emailSuggestions: true,
    billingOptimization: true,
    
    // Data & Privacy
    storeConversations: false,
    useForTraining: false,
    anonymizeData: true,
    
    // Behavior
    autoSuggestions: true,
    confidenceThreshold: 'medium',
    responseLength: 'balanced'
  })

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className={styles.settingsPage}>
      <div className={styles.header}>
        <h1>AI Configuration</h1>
        <p>Configure AI services for intelligent features and automation</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* AI Provider */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Brain size={20} />
              <div>
                <h2>AI Provider</h2>
                <p>Configure your AI service provider</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>AI Provider</label>
                <select
                  value={settings.provider}
                  onChange={e => setSettings({...settings, provider: e.target.value})}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="azure">Azure OpenAI</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Model</label>
                <select
                  value={settings.model}
                  onChange={e => setSettings({...settings, model: e.target.value})}
                >
                  <option value="gpt-4">GPT-4 (Most Capable)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo (Faster)</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Economy)</option>
                </select>
              </div>
            </div>

            <div style={{
              background: settings.apiKeyConfigured ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${settings.apiKeyConfigured ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <Key size={20} style={{ color: settings.apiKeyConfigured ? 'var(--success)' : '#ef4444' }} />
              <div style={{ flex: 1 }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {settings.apiKeyConfigured ? 'API Key Configured' : 'API Key Not Configured'}
                </span>
              </div>
              <button className={styles.secondaryBtn} onClick={() => {
                const newKey = prompt(settings.apiKeyConfigured ? 'Enter new API key:' : 'Enter your API key:');
                if (newKey && newKey.trim()) {
                  setSettings({...settings, apiKeyConfigured: true});
                  alert('API key updated successfully!');
                }
              }}>
                <Settings size={16} />
                {settings.apiKeyConfigured ? 'Update Key' : 'Add Key'}
              </button>
            </div>
          </div>

          {/* AI Features */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Sparkles size={20} />
              <div>
                <h2>AI Features</h2>
                <p>Enable or disable specific AI capabilities</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Document Analysis</span>
                  <span className={styles.toggleDesc}>AI-powered document review and summarization</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.documentAnalysis}
                    onChange={e => setSettings({...settings, documentAnalysis: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Case Research</span>
                  <span className={styles.toggleDesc}>AI-assisted legal research and case law analysis</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.caseResearch}
                    onChange={e => setSettings({...settings, caseResearch: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Draft Assistance</span>
                  <span className={styles.toggleDesc}>AI help with drafting documents and correspondence</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.draftAssistance}
                    onChange={e => setSettings({...settings, draftAssistance: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Time Entry Descriptions</span>
                  <span className={styles.toggleDesc}>Suggest improved descriptions for time entries</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.timeEntryDescriptions}
                    onChange={e => setSettings({...settings, timeEntryDescriptions: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Email Suggestions</span>
                  <span className={styles.toggleDesc}>Smart email composition and response suggestions</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.emailSuggestions}
                    onChange={e => setSettings({...settings, emailSuggestions: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Billing Optimization</span>
                  <span className={styles.toggleDesc}>AI insights for billing efficiency and revenue</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.billingOptimization}
                    onChange={e => setSettings({...settings, billingOptimization: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Data & Privacy */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Shield size={20} />
              <div>
                <h2>Data & Privacy</h2>
                <p>Control how AI uses your data</p>
              </div>
            </div>

            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-lg)',
              display: 'flex',
              gap: '0.75rem'
            }}>
              <Eye size={20} style={{ color: '#3b82f6', flexShrink: 0 }} />
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Your data is processed securely and never used to train external AI models without explicit consent. 
                  All AI interactions are encrypted in transit and at rest.
                </p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Store AI Conversations</span>
                  <span className={styles.toggleDesc}>Keep history of AI interactions for reference</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.storeConversations}
                    onChange={e => setSettings({...settings, storeConversations: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Allow Model Training</span>
                  <span className={styles.toggleDesc}>Allow anonymized data to improve AI models</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.useForTraining}
                    onChange={e => setSettings({...settings, useForTraining: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Anonymize Data</span>
                  <span className={styles.toggleDesc}>Remove identifying information from AI queries</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.anonymizeData}
                    onChange={e => setSettings({...settings, anonymizeData: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* AI Behavior */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <Zap size={20} />
              <div>
                <h2>AI Behavior</h2>
                <p>Customize how AI responds and suggests</p>
              </div>
            </div>

            <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
              <div>
                <span className={styles.toggleLabel}>Auto Suggestions</span>
                <span className={styles.toggleDesc}>Proactively suggest AI insights and actions</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.autoSuggestions}
                  onChange={e => setSettings({...settings, autoSuggestions: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Confidence Threshold</label>
                <select
                  value={settings.confidenceThreshold}
                  onChange={e => setSettings({...settings, confidenceThreshold: e.target.value})}
                >
                  <option value="low">Low (More suggestions)</option>
                  <option value="medium">Medium (Balanced)</option>
                  <option value="high">High (Only confident)</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Response Length</label>
                <select
                  value={settings.responseLength}
                  onChange={e => setSettings({...settings, responseLength: e.target.value})}
                >
                  <option value="concise">Concise</option>
                  <option value="balanced">Balanced</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Save Bar */}
          <div className={styles.saveBar}>
            {saved && (
              <span className={styles.savedMessage}>
                <Check size={16} />
                AI configuration saved!
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
