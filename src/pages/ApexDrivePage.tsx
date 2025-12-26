import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, HardDrive, Check, X, RefreshCw, 
  AlertCircle, Loader2, FileText, Users, Lock,
  History, GitCompare, Download, Cloud, CheckCircle2,
  Monitor, Globe, FolderOpen, Copy, Eye
} from 'lucide-react'
import { driveApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import styles from './ApexDrivePage.module.css'

export function ApexDrivePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  const [isEnabled, setIsEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [enabling, setEnabling] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Stats
  const [stats, setStats] = useState({
    documentCount: 0,
    userCount: 0,
    lastSync: null as string | null,
  })

  // Admin: Connection info and drive browser
  const [connectionInfo, setConnectionInfo] = useState<{
    configured: boolean
    windowsPath?: string
    macPath?: string
    firmFolder?: string
    instructions?: { windows: string[]; mac: string[] }
  } | null>(null)
  const [showConnectionInfo, setShowConnectionInfo] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    setLoading(true)
    try {
      const result = await driveApi.getConfigurations()
      const firmDrive = result.drives?.find((d: any) => !d.isPersonal && d.isDefault)
      if (firmDrive) {
        setIsEnabled(true)
        setStats({
          documentCount: firmDrive.documentCount || 0,
          userCount: firmDrive.userCount || 0,
          lastSync: firmDrive.lastSyncAt,
        })
        // Load connection info for admins
        if (isAdmin) {
          loadConnectionInfo()
        }
      }
    } catch (error) {
      console.error('Failed to check status:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadConnectionInfo = async () => {
    try {
      const info = await driveApi.getConnectionInfo()
      setConnectionInfo(info)
    } catch (error) {
      console.error('Failed to load connection info:', error)
    }
  }

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(true)
    setTimeout(() => setCopiedPath(false), 2000)
  }

  const enableApexDrive = async () => {
    setEnabling(true)
    try {
      // Create the default Apex Drive configuration
      // Storage is handled by the backend (Azure)
      await driveApi.createConfiguration({
        name: 'Apex Drive',
        driveType: 'azure_files',
        rootPath: 'apex-drive', // Backend will set up Azure storage
        syncEnabled: true,
        syncIntervalMinutes: 5,
        syncDirection: 'bidirectional',
        autoVersionOnSave: true,
        conflictResolution: 'keep_both',
        isDefault: true,
        isPersonal: false,
      })

      setIsEnabled(true)
      setNotification({ type: 'success', message: 'Apex Drive is now enabled!' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to enable Apex Drive' })
    } finally {
      setEnabling(false)
    }
  }

  const disableApexDrive = async () => {
    if (!confirm('Are you sure you want to disable Apex Drive? Your documents will still be accessible, but sync will stop.')) {
      return
    }

    try {
      const result = await driveApi.getConfigurations()
      const firmDrive = result.drives?.find((d: any) => !d.isPersonal && d.isDefault)
      if (firmDrive) {
        await driveApi.deleteConfiguration(firmDrive.id)
      }
      setIsEnabled(false)
      setNotification({ type: 'success', message: 'Apex Drive disabled' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to disable' })
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spinning} />
          <span>Loading...</span>
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

      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/app/settings')}>
          <ArrowLeft size={20} />
        </button>
        <div className={styles.headerContent}>
          <div className={styles.headerIcon}>
            <HardDrive size={28} />
          </div>
          <div>
            <h1>Apex Drive</h1>
            <p>Securely store and manage your firm's documents</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        {!isEnabled ? (
          /* Not Enabled State */
          <div className={styles.enableSection}>
            <div className={styles.enableCard}>
              <div className={styles.enableIcon}>
                <Cloud size={48} />
              </div>
              <h2>Enable Apex Drive</h2>
              <p>
                Apex Drive provides secure cloud storage for all your firm's documents. 
                Access files from anywhere, track versions, and collaborate in real-time.
              </p>

              {isAdmin ? (
                <button 
                  className={styles.enableBtn}
                  onClick={enableApexDrive}
                  disabled={enabling}
                >
                  {enabling ? (
                    <><Loader2 size={20} className={styles.spinning} /> Enabling...</>
                  ) : (
                    <><Check size={20} /> Enable Apex Drive</>
                  )}
                </button>
              ) : (
                <p className={styles.adminNote}>
                  Contact your administrator to enable Apex Drive.
                </p>
              )}
            </div>

            {/* Features */}
            <div className={styles.features}>
              <h3>What you get with Apex Drive:</h3>
              <div className={styles.featureGrid}>
                <div className={styles.feature}>
                  <Lock size={24} />
                  <div>
                    <h4>Smart Document Locks</h4>
                    <p>Edit documents without conflicts. Locks automatically release when you're done.</p>
                  </div>
                </div>
                <div className={styles.feature}>
                  <History size={24} />
                  <div>
                    <h4>Complete Version History</h4>
                    <p>Every change is tracked. See who edited what and when.</p>
                  </div>
                </div>
                <div className={styles.feature}>
                  <GitCompare size={24} />
                  <div>
                    <h4>Redline Comparison</h4>
                    <p>Compare any two versions side-by-side with tracked changes.</p>
                  </div>
                </div>
                <div className={styles.feature}>
                  <Users size={24} />
                  <div>
                    <h4>Real-Time Collaboration</h4>
                    <p>Edit documents together in Word Online. See who's viewing.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Enabled State */
          <div className={styles.enabledSection}>
            {/* Status Card */}
            <div className={styles.statusCard}>
              <div className={styles.statusHeader}>
                <div className={styles.statusIcon}>
                  <CheckCircle2 size={32} />
                </div>
                <div className={styles.statusText}>
                  <h2>Apex Drive is enabled</h2>
                  <p>Your documents are syncing to the cloud</p>
                </div>
                {isAdmin && (
                  <button className={styles.disableBtn} onClick={disableApexDrive}>
                    Disable
                  </button>
                )}
              </div>

              <div className={styles.statsRow}>
                <div className={styles.stat}>
                  <FileText size={20} />
                  <div>
                    <span className={styles.statValue}>{stats.documentCount.toLocaleString()}</span>
                    <span className={styles.statLabel}>Documents</span>
                  </div>
                </div>
                <div className={styles.stat}>
                  <Users size={20} />
                  <div>
                    <span className={styles.statValue}>{stats.userCount || 'All'}</span>
                    <span className={styles.statLabel}>Users</span>
                  </div>
                </div>
                <div className={styles.stat}>
                  <RefreshCw size={20} />
                  <div>
                    <span className={styles.statValue}>
                      {stats.lastSync ? 'Just now' : 'Syncing...'}
                    </span>
                    <span className={styles.statLabel}>Last Sync</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin: Drive Connection Info */}
            {isAdmin && connectionInfo?.configured && (
              <div className={styles.adminSection}>
                <div className={styles.adminHeader}>
                  <FolderOpen size={20} />
                  <h3>Admin: Map Your Drive</h3>
                  <button 
                    className={styles.toggleBtn}
                    onClick={() => setShowConnectionInfo(!showConnectionInfo)}
                  >
                    <Eye size={16} />
                    {showConnectionInfo ? 'Hide' : 'Show'} Connection Info
                  </button>
                </div>
                
                {showConnectionInfo && (
                  <div className={styles.connectionInfo}>
                    <p className={styles.connectionNote}>
                      Map this drive on your computer to drag files from Clio Drive. Users access documents through the web app.
                    </p>
                    
                    <div className={styles.pathBox}>
                      <label>Windows Path:</label>
                      <div className={styles.pathRow}>
                        <code>{connectionInfo.windowsPath}</code>
                        <button onClick={() => copyPath(connectionInfo.windowsPath || '')}>
                          <Copy size={14} />
                          {copiedPath ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div className={styles.pathBox}>
                      <label>Mac Path:</label>
                      <div className={styles.pathRow}>
                        <code>{connectionInfo.macPath}</code>
                        <button onClick={() => copyPath(connectionInfo.macPath || '')}>
                          <Copy size={14} />
                          {copiedPath ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div className={styles.instructions}>
                      <h4>Windows Instructions:</h4>
                      <ol>
                        {connectionInfo.instructions?.windows.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>

                    <p className={styles.keyNote}>
                      <AlertCircle size={14} />
                      Get the storage account key from your platform administrator or Azure Portal.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Access Options */}
            <div className={styles.accessSection}>
              <h3>Access your documents</h3>
              <div className={styles.accessGrid}>
                <div className={styles.accessCard}>
                  <Globe size={32} />
                  <h4>Web Browser</h4>
                  <p>Access documents from any browser. View, edit, and share files.</p>
                  <button onClick={() => navigate('/app/documents')}>
                    Open Documents
                  </button>
                </div>
                <div className={styles.accessCard}>
                  <Monitor size={32} />
                  <h4>Map Network Drive</h4>
                  <p>Access files from Windows Explorer or Mac Finder like a local drive.</p>
                  <button className={styles.secondary} onClick={() => setShowConnectionInfo(true)}>
                    <FolderOpen size={16} />
                    View Instructions
                  </button>
                </div>
              </div>
            </div>

            {/* Microsoft Integration Note */}
            <div className={styles.integrationNote}>
              <div className={styles.noteIcon}>
                <Cloud size={24} />
              </div>
              <div className={styles.noteContent}>
                <h4>Want Word Online editing?</h4>
                <p>Connect your Microsoft account to edit documents directly in Word Online with real-time collaboration.</p>
              </div>
              <button onClick={() => navigate('/app/integrations')}>
                Connect Microsoft
              </button>
            </div>

            {/* Better than Clio */}
            <div className={styles.comparison}>
              <h3>Better than Clio Drive</h3>
              <div className={styles.comparisonGrid}>
                <div className={styles.comparisonItem}>
                  <X size={20} className={styles.xIcon} />
                  <span><strong>Clio:</strong> Documents get stuck locked</span>
                </div>
                <div className={styles.comparisonItem}>
                  <Check size={20} className={styles.checkIcon} />
                  <span><strong>Apex:</strong> Smart locks auto-expire</span>
                </div>
                <div className={styles.comparisonItem}>
                  <X size={20} className={styles.xIcon} />
                  <span><strong>Clio:</strong> Hard to compare versions</span>
                </div>
                <div className={styles.comparisonItem}>
                  <Check size={20} className={styles.checkIcon} />
                  <span><strong>Apex:</strong> Built-in redline comparison</span>
                </div>
                <div className={styles.comparisonItem}>
                  <X size={20} className={styles.xIcon} />
                  <span><strong>Clio:</strong> No real-time co-editing</span>
                </div>
                <div className={styles.comparisonItem}>
                  <Check size={20} className={styles.checkIcon} />
                  <span><strong>Apex:</strong> Word Online collaboration</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
