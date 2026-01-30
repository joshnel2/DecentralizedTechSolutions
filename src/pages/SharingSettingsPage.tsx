import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Share2, Users, Mail, Eye, FileText, Shield, Check, 
  Plus, Trash2, ExternalLink, ArrowLeft
} from 'lucide-react'
import styles from './SettingsPage.module.css'
import { useToast } from '../components/Toast'

export function SharingSettingsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  
  const [settings, setSettings] = useState({
    // Portal Branding
    portalEnabled: true,
    customBranding: true,
    portalLogo: 'firm-logo.png',
    primaryColor: '#D4AF37',
    
    // Sharing Defaults
    defaultPermission: 'view',
    requireApproval: true,
    expirationDays: 30,
    
    // Notifications
    notifyOnAccess: true,
    notifyOnDownload: true,
    dailyAccessDigest: false,
    
    // Security
    requirePassword: false,
    allowDownloads: true,
    watermarkDocuments: false
  })

  const [sharedUsers, setSharedUsers] = useState([
    { id: '1', name: 'Anderson & Partners', email: 'co-counsel@anderson.law', access: 'Matter 2024-001', expires: '2024-02-15' },
    { id: '2', name: 'Expert Witness Inc.', email: 'expert@witness.com', access: 'Documents Folder', expires: '2024-01-30' }
  ])

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const removeAccess = (id: string) => {
    setSharedUsers(sharedUsers.filter(u => u.id !== id))
  }

  return (
    <div className={styles.settingsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <h1>Co-Counsel & Sharing</h1>
        <p>Manage client portal branding, external sharing, and co-counsel access</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* Portal Settings */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <ExternalLink size={20} />
              <div>
                <h2>Client Portal</h2>
                <p>Customize your client-facing portal</p>
              </div>
            </div>

            <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
              <div>
                <span className={styles.toggleLabel}>Enable Client Portal</span>
                <span className={styles.toggleDesc}>Allow clients to access their matters online</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.portalEnabled}
                  onChange={e => setSettings({...settings, portalEnabled: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.toggle}>
              <div>
                <span className={styles.toggleLabel}>Custom Branding</span>
                <span className={styles.toggleDesc}>Use your firm's logo and colors on the portal</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.customBranding}
                  onChange={e => setSettings({...settings, customBranding: e.target.checked})}
                  disabled={!settings.portalEnabled}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            {settings.customBranding && settings.portalEnabled && (
              <div style={{ 
                background: 'var(--bg-tertiary)', 
                padding: 'var(--spacing-lg)', 
                borderRadius: 'var(--radius-md)',
                marginTop: '1rem'
              }}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Portal Logo</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <FileText size={24} style={{ color: 'var(--text-tertiary)' }} />
                      </div>
                      <button className={styles.secondaryBtn} onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) {
                            alert(`Logo "${file.name}" selected. In production, this would upload to your portal.`);
                          }
                        };
                        input.click();
                      }}>Upload Logo</button>
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Primary Color</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <input
                        type="color"
                        value={settings.primaryColor}
                        onChange={e => setSettings({...settings, primaryColor: e.target.value})}
                        style={{ width: '48px', height: '40px', padding: 0, border: 'none', cursor: 'pointer' }}
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
              </div>
            )}
          </div>

          {/* Sharing Defaults */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Share2 size={20} />
              <div>
                <h2>Sharing Defaults</h2>
                <p>Default settings for shared resources</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Default Permission Level</label>
                <select
                  value={settings.defaultPermission}
                  onChange={e => setSettings({...settings, defaultPermission: e.target.value})}
                >
                  <option value="view">View Only</option>
                  <option value="comment">View & Comment</option>
                  <option value="edit">Edit</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Link Expiration</label>
                <select
                  value={settings.expirationDays.toString()}
                  onChange={e => setSettings({...settings, expirationDays: parseInt(e.target.value)})}
                >
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="0">Never</option>
                </select>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Require Approval</span>
                  <span className={styles.toggleDesc}>Admin must approve external sharing requests</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.requireApproval}
                    onChange={e => setSettings({...settings, requireApproval: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Allow Downloads</span>
                  <span className={styles.toggleDesc}>Let external users download shared documents</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.allowDownloads}
                    onChange={e => setSettings({...settings, allowDownloads: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Watermark Documents</span>
                  <span className={styles.toggleDesc}>Add watermark to shared documents</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.watermarkDocuments}
                    onChange={e => setSettings({...settings, watermarkDocuments: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Mail size={20} />
              <div>
                <h2>Sharing Notifications</h2>
                <p>Get notified about shared content activity</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Notify on Access</span>
                  <span className={styles.toggleDesc}>Email when someone views shared content</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.notifyOnAccess}
                    onChange={e => setSettings({...settings, notifyOnAccess: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Notify on Download</span>
                  <span className={styles.toggleDesc}>Email when someone downloads shared content</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.notifyOnDownload}
                    onChange={e => setSettings({...settings, notifyOnDownload: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Daily Access Digest</span>
                  <span className={styles.toggleDesc}>Receive a daily summary of sharing activity</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.dailyAccessDigest}
                    onChange={e => setSettings({...settings, dailyAccessDigest: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Active Shares */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <Users size={20} />
              <div>
                <h2>Active External Access</h2>
                <p>Users with access to your firm's resources</p>
              </div>
            </div>

            {sharedUsers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {sharedUsers.map(user => (
                  <div 
                    key={user.id}
                    style={{
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{user.name}</div>
                      <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                        {user.email} • Access to: {user.access} • Expires: {new Date(user.expires).toLocaleDateString()}
                      </div>
                    </div>
                    <button 
                      onClick={() => removeAccess(user.id)}
                      className={styles.dangerBtn}
                    >
                      <Trash2 size={16} />
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: 'var(--spacing-xl)',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)'
              }}>
                <Share2 size={32} style={{ color: 'var(--text-tertiary)', marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--text-secondary)' }}>No active external shares</p>
              </div>
            )}
          </div>

          {/* Save Bar */}
          <div className={styles.saveBar}>
            {saved && (
              <span className={styles.savedMessage}>
                <Check size={16} />
                Sharing settings saved!
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
