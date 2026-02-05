import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  BarChart3, Shield, Check, Building2, 
  TrendingUp, Users, Eye, ArrowLeft
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function ReportingSettingsPage() {
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  
  const [settings, setSettings] = useState({
    // Participation
    participationEnabled: true,
    firmSize: 'small',
    practiceAreas: ['litigation', 'corporate', 'family'],
    region: 'northeast',
    
    // Data Sharing
    shareRevenue: true,
    shareUtilization: true,
    shareRealization: true,
    shareClientMetrics: false,
    
    // Reports Access
    receiveBenchmarks: true,
    receiveQuarterly: true,
    receiveAnnual: true
  })

  const practiceAreaOptions = [
    { value: 'litigation', label: 'Litigation' },
    { value: 'corporate', label: 'Corporate/Business' },
    { value: 'family', label: 'Family Law' },
    { value: 'estate', label: 'Estate Planning' },
    { value: 'realestate', label: 'Real Estate' },
    { value: 'employment', label: 'Employment' },
    { value: 'ip', label: 'Intellectual Property' },
    { value: 'criminal', label: 'Criminal Defense' },
    { value: 'immigration', label: 'Immigration' },
    { value: 'bankruptcy', label: 'Bankruptcy' }
  ]

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const togglePracticeArea = (area: string) => {
    setSettings(prev => ({
      ...prev,
      practiceAreas: prev.practiceAreas.includes(area)
        ? prev.practiceAreas.filter(a => a !== area)
        : [...prev.practiceAreas, area]
    }))
  }

  return (
    <div className={styles.settingsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <h1>Aggregate Reporting</h1>
        <p>Participate in industry-wide statistics and benchmarking</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* Info Banner */}
          <div style={{
            background: 'linear-gradient(135deg, var(--gold-primary) 0%, #ff9500 100%)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--spacing-xl)',
            marginBottom: 'var(--spacing-xl)',
            color: 'var(--bg-primary)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <BarChart3 size={32} />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Legal Industry Benchmarking</h2>
            </div>
            <p style={{ fontSize: '1rem', opacity: 0.95, marginBottom: '1rem' }}>
              Participate in aggregate reporting to see how your firm compares to industry standards. 
              All data is anonymized and aggregated - no individual firm data is ever shared.
            </p>
            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={18} />
                <span>100% Anonymous</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={18} />
                <span>5,000+ Participating Firms</span>
              </div>
            </div>
          </div>

          {/* Participation Settings */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Building2 size={20} />
              <div>
                <h2>Participation</h2>
                <p>Manage your participation in aggregate reporting</p>
              </div>
            </div>

            <div className={styles.toggle} style={{ marginBottom: '1rem' }}>
              <div>
                <span className={styles.toggleLabel}>Enable Participation</span>
                <span className={styles.toggleDesc}>Contribute anonymized data to industry benchmarks</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.participationEnabled}
                  onChange={e => setSettings({...settings, participationEnabled: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.formGrid} style={{ opacity: settings.participationEnabled ? 1 : 0.5 }}>
              <div className={styles.formGroup}>
                <label>Firm Size</label>
                <select
                  value={settings.firmSize}
                  onChange={e => setSettings({...settings, firmSize: e.target.value})}
                  disabled={!settings.participationEnabled}
                >
                  <option value="solo">Solo Practitioner</option>
                  <option value="small">Small (2-10 attorneys)</option>
                  <option value="medium">Medium (11-50 attorneys)</option>
                  <option value="large">Large (51-200 attorneys)</option>
                  <option value="enterprise">Enterprise (200+ attorneys)</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Region</label>
                <select
                  value={settings.region}
                  onChange={e => setSettings({...settings, region: e.target.value})}
                  disabled={!settings.participationEnabled}
                >
                  <option value="northeast">Northeast</option>
                  <option value="southeast">Southeast</option>
                  <option value="midwest">Midwest</option>
                  <option value="southwest">Southwest</option>
                  <option value="west">West</option>
                </select>
              </div>
            </div>

            <div className={styles.formGroup} style={{ opacity: settings.participationEnabled ? 1 : 0.5 }}>
              <label>Practice Areas</label>
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '0.5rem',
                marginTop: '0.5rem'
              }}>
                {practiceAreaOptions.map(area => (
                  <button
                    key={area.value}
                    onClick={() => togglePracticeArea(area.value)}
                    disabled={!settings.participationEnabled}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '999px',
                      border: 'none',
                      background: settings.practiceAreas.includes(area.value) 
                        ? 'var(--gold-primary)' 
                        : 'var(--bg-tertiary)',
                      color: settings.practiceAreas.includes(area.value) 
                        ? 'var(--bg-primary)' 
                        : 'var(--text-secondary)',
                      cursor: settings.participationEnabled ? 'pointer' : 'not-allowed',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {area.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Data Sharing */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <TrendingUp size={20} />
              <div>
                <h2>Data Sharing</h2>
                <p>Choose which metrics to include in aggregate reports</p>
              </div>
            </div>

            <div className={styles.toggleGroup} style={{ opacity: settings.participationEnabled ? 1 : 0.5 }}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Revenue Metrics</span>
                  <span className={styles.toggleDesc}>Anonymized revenue and growth data</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.shareRevenue}
                    onChange={e => setSettings({...settings, shareRevenue: e.target.checked})}
                    disabled={!settings.participationEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Utilization Rates</span>
                  <span className={styles.toggleDesc}>Attorney utilization and productivity metrics</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.shareUtilization}
                    onChange={e => setSettings({...settings, shareUtilization: e.target.checked})}
                    disabled={!settings.participationEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Realization Rates</span>
                  <span className={styles.toggleDesc}>Billing and collection realization data</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.shareRealization}
                    onChange={e => setSettings({...settings, shareRealization: e.target.checked})}
                    disabled={!settings.participationEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Client Metrics</span>
                  <span className={styles.toggleDesc}>Client acquisition and retention statistics</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.shareClientMetrics}
                    onChange={e => setSettings({...settings, shareClientMetrics: e.target.checked})}
                    disabled={!settings.participationEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          {/* Reports */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <Eye size={20} />
              <div>
                <h2>Benchmark Reports</h2>
                <p>Choose which reports you want to receive</p>
              </div>
            </div>

            <div className={styles.toggleGroup} style={{ opacity: settings.participationEnabled ? 1 : 0.5 }}>
              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Real-Time Benchmarks</span>
                  <span className={styles.toggleDesc}>See how you compare in the dashboard</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.receiveBenchmarks}
                    onChange={e => setSettings({...settings, receiveBenchmarks: e.target.checked})}
                    disabled={!settings.participationEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Quarterly Industry Reports</span>
                  <span className={styles.toggleDesc}>Receive quarterly industry analysis</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.receiveQuarterly}
                    onChange={e => setSettings({...settings, receiveQuarterly: e.target.checked})}
                    disabled={!settings.participationEnabled}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.toggle}>
                <div>
                  <span className={styles.toggleLabel}>Annual Benchmark Report</span>
                  <span className={styles.toggleDesc}>Comprehensive yearly industry analysis</span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.receiveAnnual}
                    onChange={e => setSettings({...settings, receiveAnnual: e.target.checked})}
                    disabled={!settings.participationEnabled}
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
                Reporting settings saved!
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
