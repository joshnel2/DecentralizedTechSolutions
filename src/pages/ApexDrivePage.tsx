import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, HardDrive, Check, AlertCircle, Loader2, FileText, Users, Lock,
  History, GitCompare, Cloud, CheckCircle2, Globe, Copy, Eye, X
} from 'lucide-react'
import { driveApi, documentsApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import styles from './ApexDrivePage.module.css'

export function ApexDrivePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Stats
  const [stats, setStats] = useState({
    documentCount: 0,
    userCount: 0,
  })

  // Connection info for mapping drive (all users get their personal path)
  const [connectionInfo, setConnectionInfo] = useState<{
    configured: boolean
    paths?: { windows: string; mac: string; linux: string }
    adminPaths?: { firmRoot: { windows: string; mac: string; linux: string }; description: string }
    instructions?: { windows: string[]; mac: string[]; powershell: string[] }
    userName?: string
    userFolder?: string
    // Legacy fields
    windowsPath?: string
    macPath?: string
    firmFolder?: string
  } | null>(null)
  const [showConnectionInfo, setShowConnectionInfo] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)

  useEffect(() => {
    checkStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkStatus = async () => {
    setLoading(true)
    try {
      // Get document count
      const docsResult = await documentsApi.getAll({})
      setStats({
        documentCount: docsResult.total || docsResult.documents?.length || 0,
        userCount: 0,
      })
      
      // Load connection info for ALL users (each user gets their personal drive path)
      try {
        const info = await driveApi.getConnectionInfo()
        setConnectionInfo(info)
      } catch (e) {
        // Connection info not available
      }
    } catch (error) {
      console.error('Failed to check status:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(true)
    setTimeout(() => setCopiedPath(false), 2000)
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
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <div className={styles.headerContent}>
          <div className={styles.headerIcon}>
            <HardDrive size={28} />
          </div>
          <div>
            <h1>Apex Drive</h1>
            <p>Your firm's secure document storage</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Status Card */}
        <div className={styles.statusCard}>
          <div className={styles.statusHeader}>
            <div className={styles.statusIcon}>
              <CheckCircle2 size={32} />
            </div>
            <div className={styles.statusText}>
              <h2>Your Documents</h2>
              <p>All your firm's documents are securely stored and accessible</p>
            </div>
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
                <span className={styles.statValue}>All Team</span>
                <span className={styles.statLabel}>Access</span>
              </div>
            </div>
            <div className={styles.stat}>
              <Cloud size={20} />
              <div>
                <span className={styles.statValue}>Azure</span>
                <span className={styles.statLabel}>Cloud Storage</span>
              </div>
            </div>
          </div>
        </div>

        {/* Map Drive - Available to ALL users */}
        {connectionInfo?.configured && (
          <div className={styles.adminSection}>
            <div className={styles.adminHeader}>
              <HardDrive size={20} />
              <h3>Map Drive to Your Computer</h3>
              <button 
                className={styles.toggleBtn}
                onClick={() => setShowConnectionInfo(!showConnectionInfo)}
              >
                <Eye size={16} />
                {showConnectionInfo ? 'Hide' : 'Show'} Setup Instructions
              </button>
            </div>
            
            {showConnectionInfo && (
              <div className={styles.connectionInfo}>
                <p className={styles.connectionNote}>
                  Map your personal Apex Drive to your computer. Save documents directly from Word, Excel, or any application. Only you can see your files.
                </p>
                
                <div className={styles.pathBox}>
                  <label>Windows Path (copy this):</label>
                  <div className={styles.pathRow}>
                    <code>{connectionInfo.paths?.windows || connectionInfo.windowsPath}</code>
                    <button onClick={() => copyPath(connectionInfo.paths?.windows || connectionInfo.windowsPath || '')}>
                      <Copy size={14} />
                      {copiedPath ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className={styles.pathBox}>
                  <label>Mac Path (copy this):</label>
                  <div className={styles.pathRow}>
                    <code>{connectionInfo.paths?.mac || connectionInfo.macPath}</code>
                    <button onClick={() => copyPath(connectionInfo.paths?.mac || connectionInfo.macPath || '')}>
                      <Copy size={14} />
                      {copiedPath ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className={styles.instructions}>
                  <h4>Windows Setup:</h4>
                  <ol>
                    {(connectionInfo.instructions?.windows || []).map((step: string, i: number) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>

                <div className={styles.instructions}>
                  <h4>Mac Setup:</h4>
                  <ol>
                    {(connectionInfo.instructions?.mac || []).map((step: string, i: number) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>

                <p className={styles.keyNote}>
                  <AlertCircle size={14} />
                  Ask your firm administrator for the storage account access key to complete the setup.
                </p>

                {isAdmin && connectionInfo.adminPaths && (
                  <div className={styles.pathBox} style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '1rem' }}>
                    <label>Admin: Firm-Wide Root Path (all users' files):</label>
                    <div className={styles.pathRow}>
                      <code>{connectionInfo.adminPaths.firmRoot.windows}</code>
                      <button onClick={() => copyPath(connectionInfo.adminPaths?.firmRoot.windows || '')}>
                        <Copy size={14} />
                        {copiedPath ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', marginTop: '0.25rem' }}>
                      {connectionInfo.adminPaths.description}
                    </p>
                  </div>
                )}
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
              <h4>Documents Page</h4>
              <p>View, search, and manage all your documents. Edit with Word Online.</p>
              <button onClick={() => navigate('/app/documents')}>
                Open Documents
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
            <h4>Edit with Word Online</h4>
            <p>Connect your Microsoft account to edit documents directly in Word Online with real-time collaboration.</p>
          </div>
          <button onClick={() => navigate('/app/integrations')}>
            Connect Microsoft
          </button>
        </div>

        {/* Features */}
        <div className={styles.features}>
          <h3>Document Features</h3>
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
    </div>
  )
}
