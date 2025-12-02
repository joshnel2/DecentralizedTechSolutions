import { useState } from 'react'
import { 
  Database, Cloud, Shield, Download, Clock, Check, 
  AlertCircle, RefreshCw, HardDrive, CheckCircle2
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function DataEscrowPage() {
  const [saved, setSaved] = useState(false)
  
  const [settings, setSettings] = useState({
    autoBackup: true,
    backupFrequency: 'daily',
    retentionDays: 90,
    encryptBackups: true,
    includeDocuments: true,
    cloudProvider: 'aws',
    lastBackup: '2024-01-15T02:30:00Z',
    nextBackup: '2024-01-16T02:30:00Z',
    storageUsed: 12.5,
    storageLimit: 50
  })

  const backupHistory = [
    { id: '1', date: '2024-01-15T02:30:00Z', size: '245 MB', status: 'completed' },
    { id: '2', date: '2024-01-14T02:30:00Z', size: '244 MB', status: 'completed' },
    { id: '3', date: '2024-01-13T02:30:00Z', size: '243 MB', status: 'completed' },
    { id: '4', date: '2024-01-12T02:30:00Z', size: '242 MB', status: 'completed' }
  ]

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const triggerBackup = () => {
    alert('Manual backup initiated. This may take a few minutes.')
  }

  return (
    <div className={styles.settingsPage}>
      <div className={styles.header}>
        <h1>Data Escrow</h1>
        <p>Manage automated backups and data protection using cloud storage</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* Status Overview */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            marginBottom: 'var(--spacing-xl)'
          }}>
            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-lg)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Last Backup</span>
              </div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {new Date(settings.lastBackup).toLocaleDateString()}
              </div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                {new Date(settings.lastBackup).toLocaleTimeString()}
              </div>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-lg)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Clock size={20} style={{ color: 'var(--gold-primary)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Next Backup</span>
              </div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {new Date(settings.nextBackup).toLocaleDateString()}
              </div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                {new Date(settings.nextBackup).toLocaleTimeString()}
              </div>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-lg)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <HardDrive size={20} style={{ color: 'var(--gold-primary)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Storage Used</span>
              </div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {settings.storageUsed} GB
              </div>
              <div style={{ 
                height: '4px', 
                background: 'var(--bg-secondary)', 
                borderRadius: '2px',
                marginTop: '0.5rem'
              }}>
                <div style={{
                  height: '100%',
                  width: `${(settings.storageUsed / settings.storageLimit) * 100}%`,
                  background: 'var(--gold-primary)',
                  borderRadius: '2px'
                }} />
              </div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                of {settings.storageLimit} GB
              </div>
            </div>
          </div>

          {/* Backup Settings */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Database size={20} />
              <div>
                <h2>Backup Settings</h2>
                <p>Configure automatic backup preferences</p>
              </div>
            </div>

            <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
              <div>
                <span className={styles.toggleLabel}>Automatic Backups</span>
                <span className={styles.toggleDesc}>Automatically backup your data on a schedule</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.autoBackup}
                  onChange={e => setSettings({...settings, autoBackup: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.formGrid} style={{ opacity: settings.autoBackup ? 1 : 0.5 }}>
              <div className={styles.formGroup}>
                <label>Backup Frequency</label>
                <select
                  value={settings.backupFrequency}
                  onChange={e => setSettings({...settings, backupFrequency: e.target.value})}
                  disabled={!settings.autoBackup}
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Retention Period</label>
                <select
                  value={settings.retentionDays.toString()}
                  onChange={e => setSettings({...settings, retentionDays: parseInt(e.target.value)})}
                  disabled={!settings.autoBackup}
                >
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Encrypt Backups</span>
                  <span className={styles.toggleDesc}>Use AES-256 encryption for all backup data</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.encryptBackups}
                    onChange={e => setSettings({...settings, encryptBackups: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Include Documents</span>
                  <span className={styles.toggleDesc}>Backup uploaded documents and files</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.includeDocuments}
                    onChange={e => setSettings({...settings, includeDocuments: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>

            <button onClick={triggerBackup} className={styles.secondaryBtn} style={{ marginTop: '1rem' }}>
              <RefreshCw size={16} />
              Backup Now
            </button>
          </div>

          {/* Cloud Storage */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Cloud size={20} />
              <div>
                <h2>Cloud Storage Provider</h2>
                <p>Where your backups are stored</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Storage Provider</label>
              <select
                value={settings.cloudProvider}
                onChange={e => setSettings({...settings, cloudProvider: e.target.value})}
              >
                <option value="aws">Amazon Web Services (AWS)</option>
                <option value="azure">Microsoft Azure</option>
                <option value="gcp">Google Cloud Platform</option>
              </select>
            </div>

            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-md)',
              display: 'flex',
              gap: '0.75rem'
            }}>
              <Shield size={20} style={{ color: '#3b82f6', flexShrink: 0 }} />
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Your backups are stored in SOC 2 Type II compliant data centers with 99.999999999% durability.
                </p>
              </div>
            </div>
          </div>

          {/* Backup History */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <Clock size={20} />
              <div>
                <h2>Backup History</h2>
                <p>Recent backup activity</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {backupHistory.map(backup => (
                <div 
                  key={backup.id}
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {new Date(backup.date).toLocaleDateString()} at {new Date(backup.date).toLocaleTimeString()}
                      </div>
                      <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                        {backup.size}
                      </div>
                    </div>
                  </div>
                  <button className={styles.secondaryBtn} style={{ padding: '0.5rem 0.75rem' }}>
                    <Download size={14} />
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Save Bar */}
          <div className={styles.saveBar}>
            {saved && (
              <span className={styles.savedMessage}>
                <Check size={16} />
                Backup settings saved!
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
