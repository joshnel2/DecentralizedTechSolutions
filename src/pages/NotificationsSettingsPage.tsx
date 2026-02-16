import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Bell, Mail, Smartphone,
  Check, ArrowLeft, AlertCircle, Loader2, Send,
  Phone, Shield, Clock, Volume2, VolumeX
} from 'lucide-react'
import styles from './SettingsPage.module.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface NotificationPreferences {
  // In-App
  in_app: boolean;
  document_changes: boolean;
  document_shares: boolean;
  co_editing: boolean;
  matter_updates: boolean;
  billing_updates: boolean;
  
  // Email
  email_immediate: boolean;
  email_digest: boolean;
  digest_frequency: string;
  
  // SMS
  sms_enabled: boolean;
  sms_phone: string;
  sms_deadlines: boolean;
  sms_urgent_matters: boolean;
  sms_payments: boolean;
  sms_calendar: boolean;
  
  // Other
  ai_notifications: boolean;
  push_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export function NotificationsSettingsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [testingSms, setTestingSms] = useState(false)
  const [smsTestSent, setSmsTestSent] = useState(false)
  
  const [settings, setSettings] = useState<NotificationPreferences>({
    // In-App
    in_app: true,
    document_changes: true,
    document_shares: true,
    co_editing: true,
    matter_updates: true,
    billing_updates: true,
    
    // Email
    email_immediate: false,
    email_digest: true,
    digest_frequency: 'daily',
    
    // SMS
    sms_enabled: false,
    sms_phone: '',
    sms_deadlines: true,
    sms_urgent_matters: true,
    sms_payments: false,
    sms_calendar: false,
    
    // Other
    ai_notifications: true,
    push_enabled: true,
    quiet_hours_start: '',
    quiet_hours_end: ''
  })

  useEffect(() => {
    fetchPreferences()
  }, [])

  const fetchPreferences = async () => {
    try {
      const response = await fetch(`${API_BASE}/notifications/preferences`, {
        headers: {
          'Content-Type': 'application/json',
          'x-firm-id': localStorage.getItem('firmId') || '',
          'x-user-id': localStorage.getItem('userId') || ''
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.preferences) {
          setSettings(prev => ({
            ...prev,
            ...data.preferences,
            quiet_hours_start: data.preferences.quiet_hours_start || '',
            quiet_hours_end: data.preferences.quiet_hours_end || ''
          }))
        }
      }
    } catch (err) {
      console.error('Error fetching preferences:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    
    try {
      const response = await fetch(`${API_BASE}/notifications/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-firm-id': localStorage.getItem('firmId') || '',
          'x-user-id': localStorage.getItem('userId') || ''
        },
        body: JSON.stringify(settings)
      })
      
      if (response.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to save preferences')
      }
    } catch (err) {
      setError('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  const handleTestSms = async () => {
    if (!settings.sms_phone) {
      setError('Please enter a phone number first')
      return
    }
    
    setTestingSms(true)
    setError('')
    
    try {
      const response = await fetch(`${API_BASE}/notifications/test-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-firm-id': localStorage.getItem('firmId') || '',
          'x-user-id': localStorage.getItem('userId') || ''
        },
        body: JSON.stringify({ phone: settings.sms_phone })
      })
      
      if (response.ok) {
        setSmsTestSent(true)
        setTimeout(() => setSmsTestSent(false), 5000)
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to send test SMS')
      }
    } catch (err) {
      setError('Failed to send test SMS')
    } finally {
      setTestingSms(false)
    }
  }

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const cleaned = value.replace(/\D/g, '')
    // Format as (XXX) XXX-XXXX
    if (cleaned.length >= 10) {
      return `+1${cleaned.slice(-10)}`
    }
    return value
  }

  if (loading) {
    return (
      <div className={styles.settingsPage}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: '#6366f1' }} />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.settingsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <h1>Notifications</h1>
        <p>Manage how and when you receive notifications via in-app, email, and SMS</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          
          {error && (
            <div className={styles.errorBanner} style={{ marginBottom: '1.5rem', padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#dc2626' }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {/* SMS Notifications Section - Featured */}
          <div className={styles.section} style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div className={styles.sectionHeader}>
              <Smartphone size={20} style={{ color: '#16a34a' }} />
              <div>
                <h2 style={{ color: '#166534' }}>SMS Text Notifications</h2>
                <p>Receive important alerts via text message</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Enable SMS Notifications</span>
                  <span className={styles.toggleDesc}>Receive text messages for urgent alerts</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.sms_enabled}
                    onChange={e => setSettings({...settings, sms_enabled: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              {settings.sms_enabled && (
                <>
                  <div className={styles.formGroup} style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Phone size={16} />
                      Phone Number
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <input
                        type="tel"
                        placeholder="+1 (555) 555-5555"
                        value={settings.sms_phone}
                        onChange={e => setSettings({...settings, sms_phone: formatPhoneNumber(e.target.value)})}
                        style={{ flex: 1 }}
                      />
                      <button 
                        onClick={handleTestSms}
                        disabled={testingSms || !settings.sms_phone}
                        style={{
                          padding: '0.5rem 1rem',
                          background: smsTestSent ? '#16a34a' : '#6366f1',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          opacity: testingSms || !settings.sms_phone ? 0.5 : 1
                        }}
                      >
                        {testingSms ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : smsTestSent ? (
                          <Check size={16} />
                        ) : (
                          <Send size={16} />
                        )}
                        {smsTestSent ? 'Sent!' : 'Test SMS'}
                      </button>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Standard message rates apply. Reply STOP to unsubscribe.
                    </span>
                  </div>

                  <div className={styles.toggle} style={{ opacity: settings.sms_enabled ? 1 : 0.5 }}>
                    <div>
                      <span className={styles.toggleLabel}>Deadline Reminders</span>
                      <span className={styles.toggleDesc}>SMS alerts for upcoming deadlines</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={settings.sms_deadlines}
                        onChange={e => setSettings({...settings, sms_deadlines: e.target.checked})}
                        disabled={!settings.sms_enabled}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle} style={{ opacity: settings.sms_enabled ? 1 : 0.5 }}>
                    <div>
                      <span className={styles.toggleLabel}>Urgent Matter Alerts</span>
                      <span className={styles.toggleDesc}>Immediate SMS for urgent case updates</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={settings.sms_urgent_matters}
                        onChange={e => setSettings({...settings, sms_urgent_matters: e.target.checked})}
                        disabled={!settings.sms_enabled}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle} style={{ opacity: settings.sms_enabled ? 1 : 0.5 }}>
                    <div>
                      <span className={styles.toggleLabel}>Payment Notifications</span>
                      <span className={styles.toggleDesc}>SMS when payments are received</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={settings.sms_payments}
                        onChange={e => setSettings({...settings, sms_payments: e.target.checked})}
                        disabled={!settings.sms_enabled}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle} style={{ opacity: settings.sms_enabled ? 1 : 0.5 }}>
                    <div>
                      <span className={styles.toggleLabel}>Calendar Reminders</span>
                      <span className={styles.toggleDesc}>SMS reminders for appointments</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={settings.sms_calendar}
                        onChange={e => setSettings({...settings, sms_calendar: e.target.checked})}
                        disabled={!settings.sms_enabled}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Email Notifications Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Mail size={20} />
              <div>
                <h2>Email Notifications</h2>
                <p>Choose what emails you want to receive</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Immediate Email Alerts</span>
                  <span className={styles.toggleDesc}>Get emails immediately for important events</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.email_immediate}
                    onChange={e => setSettings({...settings, email_immediate: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Email Digest</span>
                  <span className={styles.toggleDesc}>Receive a summary of activity</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.email_digest}
                    onChange={e => setSettings({...settings, email_digest: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              {settings.email_digest && (
                <div className={styles.formGroup} style={{ marginTop: '0.5rem', marginLeft: '1rem' }}>
                  <label>Digest Frequency</label>
                  <select
                    value={settings.digest_frequency}
                    onChange={e => setSettings({...settings, digest_frequency: e.target.value})}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* In-App Notifications Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Bell size={20} />
              <div>
                <h2>In-App Notifications</h2>
                <p>Notifications that appear within Apex</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>In-App Notifications</span>
                  <span className={styles.toggleDesc}>Show notifications in the app</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.in_app}
                    onChange={e => setSettings({...settings, in_app: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.in_app ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Matter Updates</span>
                  <span className={styles.toggleDesc}>Activity on your assigned matters</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.matter_updates}
                    onChange={e => setSettings({...settings, matter_updates: e.target.checked})}
                    disabled={!settings.in_app}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.in_app ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Document Changes</span>
                  <span className={styles.toggleDesc}>Edits to shared documents</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.document_changes}
                    onChange={e => setSettings({...settings, document_changes: e.target.checked})}
                    disabled={!settings.in_app}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.in_app ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Document Sharing</span>
                  <span className={styles.toggleDesc}>When documents are shared with you</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.document_shares}
                    onChange={e => setSettings({...settings, document_shares: e.target.checked})}
                    disabled={!settings.in_app}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.in_app ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Billing Alerts</span>
                  <span className={styles.toggleDesc}>Invoice and payment notifications</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.billing_updates}
                    onChange={e => setSettings({...settings, billing_updates: e.target.checked})}
                    disabled={!settings.in_app}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.in_app ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>AI Insights & Suggestions</span>
                  <span className={styles.toggleDesc}>AI-generated recommendations and alerts</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.ai_notifications}
                    onChange={e => setSettings({...settings, ai_notifications: e.target.checked})}
                    disabled={!settings.in_app}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Quiet Hours Section */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <Clock size={20} />
              <div>
                <h2>Quiet Hours</h2>
                <p>Pause non-urgent notifications during specific times</p>
              </div>
            </div>

            <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
              <div>
                <span className={styles.toggleLabel}>Enable Quiet Hours</span>
                <span className={styles.toggleDesc}>Only urgent notifications will come through</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={!!(settings.quiet_hours_start && settings.quiet_hours_end)}
                  onChange={e => {
                    if (e.target.checked) {
                      setSettings({...settings, quiet_hours_start: '22:00', quiet_hours_end: '07:00'})
                    } else {
                      setSettings({...settings, quiet_hours_start: '', quiet_hours_end: ''})
                    }
                  }}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            {settings.quiet_hours_start && settings.quiet_hours_end && (
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <VolumeX size={16} />
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={settings.quiet_hours_start}
                    onChange={e => setSettings({...settings, quiet_hours_start: e.target.value})}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Volume2 size={16} />
                    End Time
                  </label>
                  <input
                    type="time"
                    value={settings.quiet_hours_end}
                    onChange={e => setSettings({...settings, quiet_hours_end: e.target.value})}
                  />
                </div>
              </div>
            )}

            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <Shield size={18} style={{ color: '#6366f1', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                <strong style={{ color: '#334155' }}>Note:</strong> Urgent notifications (marked as high priority) 
                will still be delivered during quiet hours. This ensures you never miss critical deadlines 
                or urgent matter updates.
              </div>
            </div>
          </div>

          {/* Save Bar */}
          <div className={styles.saveBar}>
            {saved && (
              <span className={styles.savedMessage}>
                <Check size={16} />
                Notification preferences saved!
              </span>
            )}
            <button 
              className={styles.saveBtn} 
              onClick={handleSave}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
