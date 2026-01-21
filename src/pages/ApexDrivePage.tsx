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

  // Admin: Connection info for mapping drive
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
      // Get document count
      const docsResult = await documentsApi.getAll({})
      setStats({
        documentCount: docsResult.total || docsResult.documents?.length || 0,
        userCount: 0,
      })
      
      // Load connection info for admins
      if (isAdmin) {
        try {
          const info = await driveApi.getConnectionInfo()
          setConnectionInfo(info)
        } catch (e) {
          // Connection info not available
        }
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

        {/* Admin: Drive Connection Info */}
        {isAdmin && connectionInfo?.configured && (
          <div className={styles.adminSection}>
            <div className={styles.adminHeader}>
              <HardDrive size={20} />
              <h3>Admin: Map Drive to Your Computer</h3>
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
                  As an admin, you can map this drive to your computer to manage files directly. Regular users access documents through the web app.
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
