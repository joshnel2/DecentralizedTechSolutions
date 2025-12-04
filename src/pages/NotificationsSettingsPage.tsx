import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Bell, Mail, MessageSquare, Calendar, Briefcase, DollarSign,
  Sparkles, FileText, Check, ArrowLeft
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function NotificationsSettingsPage() {
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  
  const [settings, setSettings] = useState({
    // Email Notifications
    emailEnabled: true,
    emailDeadlines: true,
    emailMatterUpdates: true,
    emailBilling: true,
    emailAiInsights: true,
    emailWeeklyDigest: true,
    
    // In-App Notifications
    inAppEnabled: true,
    inAppDeadlines: true,
    inAppMatterUpdates: true,
    inAppBilling: true,
    inAppDocuments: true,
    
    // Calendar Reminders
    calendarReminders: true,
    reminderTime: '30',
    
    // Quiet Hours
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00'
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
        <h1>Notifications</h1>
        <p>Manage how and when you receive notifications</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
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
                  <span className={styles.toggleLabel}>Email Notifications</span>
                  <span className={styles.toggleDesc}>Master toggle for all email notifications</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.emailEnabled}
                    onChange={e => setSettings({...settings, emailEnabled: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.emailEnabled ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Deadline Reminders</span>
                  <span className={styles.toggleDesc}>Get notified before important deadlines</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.emailDeadlines}
                    onChange={e => setSettings({...settings, emailDeadlines: e.target.checked})}
                    disabled={!settings.emailEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.emailEnabled ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Matter Updates</span>
                  <span className={styles.toggleDesc}>Activity on your assigned matters</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.emailMatterUpdates}
                    onChange={e => setSettings({...settings, emailMatterUpdates: e.target.checked})}
                    disabled={!settings.emailEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.emailEnabled ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Billing Alerts</span>
                  <span className={styles.toggleDesc}>Invoice and payment notifications</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.emailBilling}
                    onChange={e => setSettings({...settings, emailBilling: e.target.checked})}
                    disabled={!settings.emailEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.emailEnabled ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>AI Insights</span>
                  <span className={styles.toggleDesc}>AI-generated suggestions and analysis</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.emailAiInsights}
                    onChange={e => setSettings({...settings, emailAiInsights: e.target.checked})}
                    disabled={!settings.emailEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.emailEnabled ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Weekly Digest</span>
                  <span className={styles.toggleDesc}>Summary of your weekly activity</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.emailWeeklyDigest}
                    onChange={e => setSettings({...settings, emailWeeklyDigest: e.target.checked})}
                    disabled={!settings.emailEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
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
                    checked={settings.inAppEnabled}
                    onChange={e => setSettings({...settings, inAppEnabled: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.inAppEnabled ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Deadline Alerts</span>
                  <span className={styles.toggleDesc}>Upcoming deadline notifications</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.inAppDeadlines}
                    onChange={e => setSettings({...settings, inAppDeadlines: e.target.checked})}
                    disabled={!settings.inAppEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.inAppEnabled ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Matter Activity</span>
                  <span className={styles.toggleDesc}>Updates on your matters</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.inAppMatterUpdates}
                    onChange={e => setSettings({...settings, inAppMatterUpdates: e.target.checked})}
                    disabled={!settings.inAppEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle} style={{ opacity: settings.inAppEnabled ? 1 : 0.5 }}>
                <div>
                  <span className={styles.toggleLabel}>Document Updates</span>
                  <span className={styles.toggleDesc}>New or modified documents</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.inAppDocuments}
                    onChange={e => setSettings({...settings, inAppDocuments: e.target.checked})}
                    disabled={!settings.inAppEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Calendar Reminders Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Calendar size={20} />
              <div>
                <h2>Calendar Reminders</h2>
                <p>Event and meeting reminder preferences</p>
              </div>
            </div>

            <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
              <div>
                <span className={styles.toggleLabel}>Calendar Reminders</span>
                <span className={styles.toggleDesc}>Receive reminders for calendar events</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.calendarReminders}
                  onChange={e => setSettings({...settings, calendarReminders: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.formGroup}>
              <label>Default Reminder Time</label>
              <select
                value={settings.reminderTime}
                onChange={e => setSettings({...settings, reminderTime: e.target.value})}
                disabled={!settings.calendarReminders}
              >
                <option value="5">5 minutes before</option>
                <option value="10">10 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="1440">1 day before</option>
              </select>
            </div>
          </div>

          {/* Quiet Hours Section */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <MessageSquare size={20} />
              <div>
                <h2>Quiet Hours</h2>
                <p>Pause notifications during specific times</p>
              </div>
            </div>

            <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
              <div>
                <span className={styles.toggleLabel}>Enable Quiet Hours</span>
                <span className={styles.toggleDesc}>Suppress non-urgent notifications during set hours</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.quietHoursEnabled}
                  onChange={e => setSettings({...settings, quietHoursEnabled: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.formGrid} style={{ opacity: settings.quietHoursEnabled ? 1 : 0.5 }}>
              <div className={styles.formGroup}>
                <label>Start Time</label>
                <input
                  type="time"
                  value={settings.quietStart}
                  onChange={e => setSettings({...settings, quietStart: e.target.value})}
                  disabled={!settings.quietHoursEnabled}
                />
              </div>
              <div className={styles.formGroup}>
                <label>End Time</label>
                <input
                  type="time"
                  value={settings.quietEnd}
                  onChange={e => setSettings({...settings, quietEnd: e.target.value})}
                  disabled={!settings.quietHoursEnabled}
                />
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
            <button className={styles.saveBtn} onClick={handleSave}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
