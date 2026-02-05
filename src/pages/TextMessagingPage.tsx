import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  MessageSquare, Phone, Calendar, Shield, Check, 
  AlertCircle, Settings, ArrowLeft
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function TextMessagingPage() {
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  
  const [settings, setSettings] = useState({
    // SMS Settings
    smsEnabled: true,
    phoneNumber: '+1 (555) 123-4567',
    smsProvider: 'twilio',
    
    // Message Types
    appointmentReminders: true,
    deadlineAlerts: true,
    paymentReminders: true,
    caseUpdates: false,
    
    // Reminder Settings
    reminderTime: '24',
    reminderCount: '2',
    
    // Opt-out
    honorOptOut: true,
    includeOptOutLink: true,
    
    // Compliance
    consentRequired: true,
    logAllMessages: true
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
        <h1>Text Messaging</h1>
        <p>Configure SMS notifications for clients and calendar reminders</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* SMS Provider */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Phone size={20} />
              <div>
                <h2>SMS Configuration</h2>
                <p>Your text messaging setup</p>
              </div>
            </div>

            <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
              <div>
                <span className={styles.toggleLabel}>Enable Text Messaging</span>
                <span className={styles.toggleDesc}>Send SMS notifications to clients</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.smsEnabled}
                  onChange={e => setSettings({...settings, smsEnabled: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            {settings.smsEnabled && (
              <div style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-lg)'
              }}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>SMS Phone Number</label>
                    <input
                      type="tel"
                      value={settings.phoneNumber}
                      onChange={e => setSettings({...settings, phoneNumber: e.target.value})}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>SMS Provider</label>
                    <select
                      value={settings.smsProvider}
                      onChange={e => setSettings({...settings, smsProvider: e.target.value})}
                    >
                      <option value="twilio">Twilio</option>
                      <option value="messagebird">MessageBird</option>
                      <option value="vonage">Vonage (Nexmo)</option>
                    </select>
                  </div>
                </div>
                <button className={styles.secondaryBtn} onClick={() => {
                  const provider = settings.smsProvider;
                  const urls: Record<string, string> = {
                    twilio: 'https://console.twilio.com',
                    messagebird: 'https://dashboard.messagebird.com',
                    vonage: 'https://dashboard.nexmo.com'
                  };
                  window.open(urls[provider] || 'https://twilio.com', '_blank');
                }}>
                  <Settings size={16} />
                  Configure Provider
                </button>
              </div>
            )}
          </div>

          {/* Message Types */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <MessageSquare size={20} />
              <div>
                <h2>Message Types</h2>
                <p>Choose which notifications to send via SMS</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Appointment Reminders</span>
                  <span className={styles.toggleDesc}>Remind clients of upcoming appointments</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.appointmentReminders}
                    onChange={e => setSettings({...settings, appointmentReminders: e.target.checked})}
                    disabled={!settings.smsEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Deadline Alerts</span>
                  <span className={styles.toggleDesc}>Alert clients about approaching deadlines</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.deadlineAlerts}
                    onChange={e => setSettings({...settings, deadlineAlerts: e.target.checked})}
                    disabled={!settings.smsEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Payment Reminders</span>
                  <span className={styles.toggleDesc}>Remind clients about outstanding invoices</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.paymentReminders}
                    onChange={e => setSettings({...settings, paymentReminders: e.target.checked})}
                    disabled={!settings.smsEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Case Updates</span>
                  <span className={styles.toggleDesc}>Notify clients about case status changes</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.caseUpdates}
                    onChange={e => setSettings({...settings, caseUpdates: e.target.checked})}
                    disabled={!settings.smsEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Reminder Settings */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Calendar size={20} />
              <div>
                <h2>Reminder Timing</h2>
                <p>Configure when reminders are sent</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Send Reminder Before</label>
                <select
                  value={settings.reminderTime}
                  onChange={e => setSettings({...settings, reminderTime: e.target.value})}
                  disabled={!settings.smsEnabled}
                >
                  <option value="1">1 hour</option>
                  <option value="2">2 hours</option>
                  <option value="4">4 hours</option>
                  <option value="24">24 hours</option>
                  <option value="48">48 hours</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Number of Reminders</label>
                <select
                  value={settings.reminderCount}
                  onChange={e => setSettings({...settings, reminderCount: e.target.value})}
                  disabled={!settings.smsEnabled}
                >
                  <option value="1">1 reminder</option>
                  <option value="2">2 reminders</option>
                  <option value="3">3 reminders</option>
                </select>
              </div>
            </div>
          </div>

          {/* Compliance */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <Shield size={20} />
              <div>
                <h2>Compliance & Privacy</h2>
                <p>TCPA and messaging compliance settings</p>
              </div>
            </div>

            <div style={{
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-lg)',
              display: 'flex',
              gap: '0.75rem'
            }}>
              <AlertCircle size={20} style={{ color: 'var(--gold-primary)', flexShrink: 0 }} />
              <div>
                <p style={{ color: 'var(--text-primary)', marginBottom: '0.25rem', fontWeight: 500 }}>
                  TCPA Compliance Notice
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Ensure you have proper consent before sending text messages. Violations of the TCPA can result in significant fines.
                </p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Require Consent</span>
                  <span className={styles.toggleDesc}>Only text clients who have given written consent</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.consentRequired}
                    onChange={e => setSettings({...settings, consentRequired: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Honor Opt-Out Requests</span>
                  <span className={styles.toggleDesc}>Automatically stop texting when clients reply STOP</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.honorOptOut}
                    onChange={e => setSettings({...settings, honorOptOut: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Include Opt-Out Instructions</span>
                  <span className={styles.toggleDesc}>Add "Reply STOP to unsubscribe" to messages</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.includeOptOutLink}
                    onChange={e => setSettings({...settings, includeOptOutLink: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Log All Messages</span>
                  <span className={styles.toggleDesc}>Keep a record of all sent messages for compliance</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.logAllMessages}
                    onChange={e => setSettings({...settings, logAllMessages: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Save Bar */}
          <div className={styles.saveBar}>
            {saved && (
              <span className={styles.savedMessage}>
                <Check size={16} />
                Text messaging settings saved!
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
