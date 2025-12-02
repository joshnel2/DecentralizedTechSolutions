import { useState } from 'react'
import { 
  Smartphone, Download, Bell, Shield, Trash2, CheckCircle2,
  QrCode, Apple, Play
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function MobileSettingsPage() {
  const [devices, setDevices] = useState([
    { id: '1', name: 'iPhone 15 Pro', platform: 'iOS', lastActive: '2024-01-15T10:30:00Z', current: true },
    { id: '2', name: 'iPad Pro', platform: 'iOS', lastActive: '2024-01-10T14:20:00Z', current: false }
  ])

  const [notifications, setNotifications] = useState({
    pushEnabled: true,
    matterUpdates: true,
    calendarReminders: true,
    billingAlerts: true,
    aiInsights: false
  })

  const removeDevice = (id: string) => {
    setDevices(devices.filter(d => d.id !== id))
  }

  return (
    <div className={styles.settingsPage}>
      <div className={styles.header}>
        <h1>Apex Mobile App</h1>
        <p>Download Apex Mobile and manage your device settings</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* Download Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Download size={20} />
              <div>
                <h2>Download Apex Mobile</h2>
                <p>Access your practice from anywhere</p>
              </div>
            </div>

            <div style={{ 
              background: 'var(--bg-tertiary)', 
              borderRadius: 'var(--radius-md)', 
              padding: 'var(--spacing-xl)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--spacing-xl)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ 
                  width: '120px', 
                  height: '120px', 
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <QrCode size={80} style={{ color: 'var(--text-tertiary)' }} />
                </div>
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Scan to Download</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    Scan this QR code with your phone camera to download the Apex Mobile app
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '1rem 1.5rem',
                  background: '#000',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  cursor: 'pointer'
                }}>
                  <Apple size={24} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Download on the</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>App Store</div>
                  </div>
                </button>

                <button style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '1rem 1.5rem',
                  background: '#000',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  cursor: 'pointer'
                }}>
                  <Play size={24} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Get it on</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>Google Play</div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Authorized Devices Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Smartphone size={20} />
              <div>
                <h2>Authorized Devices</h2>
                <p>Manage devices that can access your account</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {devices.map(device => (
                <div 
                  key={device.id}
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Smartphone size={24} style={{ color: 'var(--text-secondary)' }} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{device.name}</span>
                        {device.current && (
                          <span style={{
                            background: 'var(--gold-primary)',
                            color: 'var(--bg-primary)',
                            padding: '0.125rem 0.5rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}>
                            This Device
                          </span>
                        )}
                      </div>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                        {device.platform} • Last active {new Date(device.lastActive).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {!device.current && (
                    <button 
                      onClick={() => removeDevice(device.id)}
                      className={styles.dangerBtn}
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Mobile Notifications Section */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <Bell size={20} />
              <div>
                <h2>Mobile Notifications</h2>
                <p>Configure push notification preferences</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Push Notifications</span>
                  <span className={styles.toggleDesc}>Receive notifications on your mobile device</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={notifications.pushEnabled}
                    onChange={e => setNotifications({...notifications, pushEnabled: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Matter Updates</span>
                  <span className={styles.toggleDesc}>Notify when matters are updated</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={notifications.matterUpdates}
                    onChange={e => setNotifications({...notifications, matterUpdates: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Calendar Reminders</span>
                  <span className={styles.toggleDesc}>Receive reminders for upcoming events</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={notifications.calendarReminders}
                    onChange={e => setNotifications({...notifications, calendarReminders: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Billing Alerts</span>
                  <span className={styles.toggleDesc}>Invoice and payment notifications</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={notifications.billingAlerts}
                    onChange={e => setNotifications({...notifications, billingAlerts: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Save Bar */}
          <div className={styles.saveBar}>
            <button className={styles.saveBtn}>
              <CheckCircle2 size={16} />
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
