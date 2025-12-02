import { useState } from 'react'
import { 
  Palette, Sun, Moon, Monitor, Check, Type, Layout, Eye
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function AppearanceSettingsPage() {
  const [saved, setSaved] = useState(false)
  
  const [settings, setSettings] = useState({
    theme: 'dark',
    fontSize: 'medium',
    sidebarPosition: 'left',
    compactMode: false,
    showAvatars: true,
    animationsEnabled: true,
    highContrast: false
  })

  const themes = [
    { id: 'light', name: 'Light', icon: Sun, preview: '#ffffff' },
    { id: 'dark', name: 'Dark', icon: Moon, preview: '#0a0a0f' },
    { id: 'system', name: 'System', icon: Monitor, preview: 'linear-gradient(90deg, #ffffff 50%, #0a0a0f 50%)' }
  ]

  const fontSizes = [
    { id: 'small', name: 'Small', size: '14px' },
    { id: 'medium', name: 'Medium', size: '16px' },
    { id: 'large', name: 'Large', size: '18px' }
  ]

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className={styles.settingsPage}>
      <div className={styles.header}>
        <h1>Appearance</h1>
        <p>Customize how Apex looks on your device</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* Theme Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Palette size={20} />
              <div>
                <h2>Theme</h2>
                <p>Choose your preferred color scheme</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {themes.map(theme => (
                <button
                  key={theme.id}
                  onClick={() => setSettings({...settings, theme: theme.id})}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-tertiary)',
                    border: settings.theme === theme.id ? '2px solid var(--gold-primary)' : '2px solid transparent',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{
                    width: '100%',
                    height: '60px',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '0.75rem',
                    background: theme.preview,
                    border: '1px solid var(--border-primary)'
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                    <theme.icon size={16} />
                    <span style={{ fontWeight: 500 }}>{theme.name}</span>
                    {settings.theme === theme.id && (
                      <Check size={16} style={{ color: 'var(--gold-primary)' }} />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Font Size Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Type size={20} />
              <div>
                <h2>Font Size</h2>
                <p>Adjust the text size throughout the application</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              {fontSizes.map(size => (
                <button
                  key={size.id}
                  onClick={() => setSettings({...settings, fontSize: size.id})}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    background: settings.fontSize === size.id ? 'var(--gold-primary)' : 'var(--bg-tertiary)',
                    color: settings.fontSize === size.id ? 'var(--bg-primary)' : 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: size.size,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {size.name}
                </button>
              ))}
            </div>
          </div>

          {/* Layout Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Layout size={20} />
              <div>
                <h2>Layout</h2>
                <p>Configure layout and display preferences</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Compact Mode</span>
                  <span className={styles.toggleDesc}>Show more content with less spacing</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.compactMode}
                    onChange={e => setSettings({...settings, compactMode: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Show User Avatars</span>
                  <span className={styles.toggleDesc}>Display profile pictures next to names</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showAvatars}
                    onChange={e => setSettings({...settings, showAvatars: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Accessibility Section */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <Eye size={20} />
              <div>
                <h2>Accessibility</h2>
                <p>Options for improved accessibility</p>
              </div>
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Enable Animations</span>
                  <span className={styles.toggleDesc}>Show smooth transitions and animations</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.animationsEnabled}
                    onChange={e => setSettings({...settings, animationsEnabled: e.target.checked})}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>High Contrast Mode</span>
                  <span className={styles.toggleDesc}>Increase contrast for better visibility</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.highContrast}
                    onChange={e => setSettings({...settings, highContrast: e.target.checked})}
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
                Appearance settings saved!
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
