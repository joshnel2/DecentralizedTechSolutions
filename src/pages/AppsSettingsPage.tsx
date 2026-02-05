import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  AppWindow, Shield, Trash2, Check, ExternalLink, Clock, ArrowLeft
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function AppsSettingsPage() {
  const navigate = useNavigate()
  const [apps, setApps] = useState([
    { 
      id: '1', 
      name: 'Zapier', 
      description: 'Workflow automation tool',
      permissions: ['Read Matters', 'Read Clients', 'Read Documents'],
      authorizedAt: '2024-01-10T14:30:00Z',
      lastUsed: '2024-01-15T09:00:00Z'
    },
    { 
      id: '2', 
      name: 'Microsoft Outlook', 
      description: 'Email and calendar integration',
      permissions: ['Read Calendar', 'Write Calendar', 'Read Contacts'],
      authorizedAt: '2023-12-01T10:00:00Z',
      lastUsed: '2024-01-15T16:30:00Z'
    }
  ])

  const revokeAccess = (id: string) => {
    setApps(apps.filter(app => app.id !== id))
  }

  return (
    <div className={styles.settingsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <h1>Connected Apps</h1>
        <p>Manage third-party applications authorized to access your Apex account</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* Security Notice */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-md)',
            marginBottom: 'var(--spacing-xl)',
            display: 'flex',
            gap: '0.75rem'
          }}>
            <Shield size={20} style={{ color: '#3b82f6', flexShrink: 0 }} />
            <div>
              <p style={{ color: 'var(--text-primary)', marginBottom: '0.25rem', fontWeight: 500 }}>
                Keep your account secure
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Only authorize applications you trust. Regularly review and revoke access for apps you no longer use.
              </p>
            </div>
          </div>

          {/* Connected Apps Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <AppWindow size={20} />
              <div>
                <h2>Authorized Applications</h2>
                <p>Applications with access to your account data</p>
              </div>
            </div>

            {apps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {apps.map(app => (
                  <div 
                    key={app.id}
                    style={{
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                      border: '1px solid var(--border-primary)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.25rem' }}>
                          {app.name}
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                          {app.description}
                        </p>
                      </div>
                      <button 
                        onClick={() => revokeAccess(app.id)}
                        className={styles.dangerBtn}
                      >
                        <Trash2 size={16} />
                        Revoke Access
                      </button>
                    </div>

                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '0.5rem', 
                      marginBottom: '1rem' 
                    }}>
                      {app.permissions.map(perm => (
                        <span 
                          key={perm}
                          style={{
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-secondary)',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem'
                          }}
                        >
                          <Check size={12} style={{ color: 'var(--success)' }} />
                          {perm}
                        </span>
                      ))}
                    </div>

                    <div style={{ 
                      display: 'flex', 
                      gap: '1.5rem', 
                      fontSize: '0.75rem', 
                      color: 'var(--text-tertiary)' 
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Clock size={12} />
                        Authorized {new Date(app.authorizedAt).toLocaleDateString()}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Clock size={12} />
                        Last used {new Date(app.lastUsed).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: 'var(--spacing-2xl)',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)'
              }}>
                <AppWindow size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No Connected Apps</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  You haven't authorized any third-party applications yet.
                </p>
              </div>
            )}
          </div>

          {/* OAuth Info Section */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <ExternalLink size={20} />
              <div>
                <h2>Developer Access</h2>
                <p>Information for developers integrating with Apex</p>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-lg)'
            }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Building an integration with Apex? Visit our developer documentation to learn about our OAuth 2.0 authentication flow and API endpoints.
              </p>
              <button className={styles.secondaryBtn} onClick={() => window.open('https://docs.apex.law/api', '_blank')}>
                <ExternalLink size={16} />
                View Developer Docs
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
