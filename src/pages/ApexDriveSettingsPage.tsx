import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, HardDrive, Cloud, Check, X, RefreshCw, 
  AlertCircle, Loader2, Save, FileText, Users, Lock,
  History, GitCompare, Shield, Zap, CheckCircle2
} from 'lucide-react'
import { driveApi, driveSyncApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import styles from './ApexDriveSettingsPage.module.css'

interface ApexDriveConfig {
  id: string
  name: string
  status: 'not_configured' | 'active' | 'syncing' | 'error'
  rootPath: string
  lastSyncAt: string | null
  documentCount: number
  storageUsed: number
  autoSync: boolean
  syncIntervalMinutes: number
}

export function ApexDriveSettingsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  const [config, setConfig] = useState<ApexDriveConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Setup form
  const [showSetup, setShowSetup] = useState(false)
  const [setupData, setSetupData] = useState({
    storageType: 'azure' as 'azure' | 'local',
    connectionString: '',
    shareName: '',
    localPath: '',
  })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const result = await driveApi.getConfigurations()
      // Find the firm's main drive (not personal)
      const firmDrive = result.drives?.find((d: any) => !d.isPersonal && d.isDefault)
      if (firmDrive) {
        setConfig({
          id: firmDrive.id,
          name: firmDrive.name || 'Apex Drive',
          status: firmDrive.status || 'active',
          rootPath: firmDrive.rootPath,
          lastSyncAt: firmDrive.lastSyncAt,
          documentCount: firmDrive.documentCount || 0,
          storageUsed: firmDrive.storageUsed || 0,
          autoSync: firmDrive.syncEnabled !== false,
          syncIntervalMinutes: firmDrive.syncIntervalMinutes || 5,
        })
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const rootPath = setupData.storageType === 'azure'
        ? `azure://${setupData.shareName}`
        : setupData.localPath

      await driveApi.createConfiguration({
        name: 'Apex Drive',
        driveType: setupData.storageType === 'azure' ? 'azure_files' : 'local',
        rootPath,
        syncEnabled: true,
        syncIntervalMinutes: 5,
        syncDirection: 'bidirectional',
        autoVersionOnSave: true,
        conflictResolution: 'keep_both',
        isDefault: true,
        isPersonal: false,
        // Store Azure connection string securely
        credentials: setupData.storageType === 'azure' ? {
          connectionString: setupData.connectionString,
        } : undefined,
      })

      setNotification({ type: 'success', message: 'Apex Drive configured successfully!' })
      setShowSetup(false)
      loadConfig()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Setup failed' })
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    if (!config) return
    setSyncing(true)
    try {
      const result = await driveSyncApi.syncDrive(config.id)
      setNotification({ 
        type: 'success', 
        message: `Synced ${result.synced} new documents, updated ${result.updated}` 
      })
      loadConfig()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 GB'
    const gb = bytes / (1024 * 1024 * 1024)
    return gb < 1 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${gb.toFixed(1)} GB`
  }

  // Non-admin users see a simple info page
  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate('/app/documents')}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon}>
            <HardDrive size={28} />
          </div>
          <div>
            <h1>Apex Drive</h1>
            <p>Your firm's document storage</p>
          </div>
        </div>

        <div className={styles.userView}>
          <div className={styles.userCard}>
            <CheckCircle2 size={48} className={styles.checkIcon} />
            <h2>You're all set!</h2>
            <p>Your firm's Apex Drive is configured. Access all your documents from the Documents page.</p>
            <button className={styles.primaryBtn} onClick={() => navigate('/app/documents')}>
              Go to Documents
            </button>
          </div>

          <div className={styles.features}>
            <h3>What makes Apex Drive better:</h3>
            <div className={styles.featureGrid}>
              <div className={styles.feature}>
                <Lock size={24} />
                <h4>Smart Locks</h4>
                <p>No more stuck documents. Locks auto-expire when you're done.</p>
              </div>
              <div className={styles.feature}>
                <History size={24} />
                <h4>Version History</h4>
                <p>Every save is tracked. See who changed what and when.</p>
              </div>
              <div className={styles.feature}>
                <GitCompare size={24} />
                <h4>Redline Comparison</h4>
                <p>Compare any two versions side-by-side with tracked changes.</p>
              </div>
              <div className={styles.feature}>
                <Users size={24} />
                <h4>Real-time Editing</h4>
                <p>See who's editing. Collaborate in Word Online together.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/app/settings')}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon}>
            <HardDrive size={28} />
          </div>
          <div>
            <h1>Apex Drive</h1>
            <p>Your firm's document storage - like Clio Drive, but better</p>
          </div>
        </div>
      </div>

      {/* Azure Banner */}
      <div className={styles.azureBanner}>
        <div className={styles.azureInfo}>
          <div className={styles.azureLogo}>
            <Cloud size={28} />
          </div>
          <div>
            <h3>Powered by Microsoft Azure</h3>
            <p>Your firm's documents are stored on Azure File Share - the same enterprise-grade infrastructure used by Fortune 500 companies. Integrates seamlessly with Word Online for real-time editing.</p>
          </div>
        </div>
      </div>

      {/* Comparison Banner */}
      <div className={styles.comparisonBanner}>
        <div className={styles.comparison}>
          <div className={styles.comparisonItem}>
            <span className={styles.comparisonLabel}>Clio Drive</span>
            <ul className={styles.cons}>
              <li>❌ Documents get stuck locked</li>
              <li>❌ Hard to see version history</li>
              <li>❌ No redline comparison</li>
              <li>❌ Confusing sync conflicts</li>
            </ul>
          </div>
          <div className={styles.vs}>VS</div>
          <div className={styles.comparisonItem}>
            <span className={styles.comparisonLabel}>Apex Drive <span className={styles.azureTag}>Azure</span></span>
            <ul className={styles.pros}>
              <li>✅ Smart locks auto-expire</li>
              <li>✅ Full version history with names</li>
              <li>✅ Built-in redline comparison</li>
              <li>✅ Word Online co-editing</li>
            </ul>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <Loader2 size={24} className={styles.spinning} />
          <span>Loading...</span>
        </div>
      ) : config ? (
        /* Drive is configured - show status */
        <div className={styles.configured}>
          <div className={styles.statusCard}>
            <div className={styles.statusHeader}>
              <div className={styles.statusIcon}>
                <Cloud size={32} />
              </div>
              <div className={styles.statusInfo}>
                <h2>{config.name}</h2>
                <div className={styles.statusBadge} data-status={config.status}>
                  {config.status === 'active' && <><CheckCircle2 size={14} /> Connected</>}
                  {config.status === 'syncing' && <><RefreshCw size={14} className={styles.spinning} /> Syncing</>}
                  {config.status === 'error' && <><AlertCircle size={14} /> Error</>}
                </div>
              </div>
              <button 
                className={styles.syncBtn} 
                onClick={handleSync}
                disabled={syncing}
              >
                <RefreshCw size={18} className={syncing ? styles.spinning : ''} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>

            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{config.documentCount.toLocaleString()}</span>
                <span className={styles.statLabel}>Documents</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{formatBytes(config.storageUsed)}</span>
                <span className={styles.statLabel}>Storage Used</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>
                  {config.lastSyncAt ? new Date(config.lastSyncAt).toLocaleTimeString() : 'Never'}
                </span>
                <span className={styles.statLabel}>Last Sync</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{config.syncIntervalMinutes} min</span>
                <span className={styles.statLabel}>Sync Interval</span>
              </div>
            </div>
          </div>

          <div className={styles.settingsCard}>
            <h3>Drive Settings</h3>
            <div className={styles.settingRow}>
              <div>
                <strong>Storage Location</strong>
                <p>{config.rootPath}</p>
              </div>
            </div>
            <div className={styles.settingRow}>
              <div>
                <strong>Auto-Sync</strong>
                <p>Documents sync automatically every {config.syncIntervalMinutes} minutes</p>
              </div>
              <label className={styles.toggle}>
                <input type="checkbox" checked={config.autoSync} readOnly />
                <span className={styles.slider}></span>
              </label>
            </div>
            <div className={styles.settingRow}>
              <div>
                <strong>Version History</strong>
                <p>Automatically save versions on every edit</p>
              </div>
              <label className={styles.toggle}>
                <input type="checkbox" checked={true} readOnly />
                <span className={styles.slider}></span>
              </label>
            </div>
          </div>

          <div className={styles.quickLinks}>
            <h3>Quick Actions</h3>
            <div className={styles.linkGrid}>
              <button onClick={() => navigate('/app/documents')}>
                <FileText size={20} />
                View Documents
              </button>
              <button onClick={() => navigate('/app/documents/permissions')}>
                <Shield size={20} />
                Manage Permissions
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Drive not configured - show setup */
        <div className={styles.setup}>
          {!showSetup ? (
            <div className={styles.setupPrompt}>
              <div className={styles.setupIcon}>
                <HardDrive size={64} />
              </div>
              <h2>Set Up Apex Drive</h2>
              <p>Connect your firm's document storage to enable seamless document management with version history, redlining, and smart collaboration.</p>
              
              <div className={styles.setupOptions}>
                <button 
                  className={`${styles.setupOption} ${styles.primary}`}
                  onClick={() => { setSetupData({ ...setupData, storageType: 'azure' }); setShowSetup(true); }}
                >
                  <Cloud size={32} />
                  <h4>Azure File Share</h4>
                  <p>Your firm's cloud drive on Microsoft Azure. Secure, scalable, and integrates with Word Online.</p>
                  <span className={styles.recommended}>Your Branded Drive</span>
                </button>
              </div>
              <p className={styles.altOption}>
                Need to use a local network drive instead?{' '}
                <button 
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => { setSetupData({ ...setupData, storageType: 'local' }); setShowSetup(true); }}
                >
                  Configure local storage
                </button>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSetup} className={styles.setupForm}>
              <h2>
                {setupData.storageType === 'azure' ? 'Connect Azure File Share' : 'Connect Local/Network Drive'}
              </h2>

              {setupData.storageType === 'azure' ? (
                <>
                  <div className={styles.formGroup}>
                    <label>Azure Storage Connection String</label>
                    <input
                      type="password"
                      value={setupData.connectionString}
                      onChange={e => setSetupData({ ...setupData, connectionString: e.target.value })}
                      placeholder="DefaultEndpointsProtocol=https;AccountName=..."
                      required
                    />
                    <span className={styles.hint}>
                      Find this in Azure Portal → Storage Account → Access Keys
                    </span>
                  </div>
                  <div className={styles.formGroup}>
                    <label>File Share Name</label>
                    <input
                      type="text"
                      value={setupData.shareName}
                      onChange={e => setSetupData({ ...setupData, shareName: e.target.value })}
                      placeholder="firmfiles"
                      required
                    />
                    <span className={styles.hint}>
                      The name of your Azure File Share
                    </span>
                  </div>
                </>
              ) : (
                <div className={styles.formGroup}>
                  <label>Folder Path</label>
                  <input
                    type="text"
                    value={setupData.localPath}
                    onChange={e => setSetupData({ ...setupData, localPath: e.target.value })}
                    placeholder="\\server\firmfiles or C:\FirmDocuments"
                    required
                  />
                  <span className={styles.hint}>
                    Network path (\\server\share) or local folder path
                  </span>
                </div>
              )}

              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowSetup(false)}>
                  Back
                </button>
                <button type="submit" className={styles.saveBtn} disabled={saving}>
                  {saving ? (
                    <><Loader2 size={16} className={styles.spinning} /> Connecting...</>
                  ) : (
                    <><Zap size={16} /> Connect Drive</>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
