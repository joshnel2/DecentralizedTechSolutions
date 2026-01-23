import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, HardDrive, Check, AlertCircle, Loader2, 
  Download, Monitor, Apple, RefreshCw, Copy, CheckCircle2,
  Shield, Key, FolderOpen, Wifi, WifiOff, Settings, ExternalLink,
  Terminal, FileText, HelpCircle, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react'
import { driveApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import styles from './DriveSetupPage.module.css'

interface ConnectionInfo {
  configured: boolean
  firmId?: string
  firmName?: string
  firmFolder?: string
  storageAccount?: string
  shareName?: string
  paths?: {
    windows: string
    mac: string
    linux: string
  }
}

interface DrivePreference {
  driveLetter: string
  setupCompleted: boolean
  setupCompletedAt?: string
  os?: 'windows' | 'mac'
}

export function DriveSetupPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<'windows' | 'mac' | null>(null)
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null)
  const [selectedDriveLetter, setSelectedDriveLetter] = useState('Z')
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [copiedPath, setCopiedPath] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showWindowsHelp, setShowWindowsHelp] = useState(false)
  const [showMacHelp, setShowMacHelp] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'accessible' | 'not-accessible' | 'not-configured'>('checking')
  const [drivePreference, setDrivePreference] = useState<DrivePreference | null>(null)
  const [showSetupAnyway, setShowSetupAnyway] = useState(false)

  const driveLetters = ['Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S', 'R', 'Q', 'P', 'O', 'N', 'M', 'L', 'K', 'J', 'I', 'H', 'G', 'F', 'E', 'D']

  useEffect(() => {
    loadConnectionInfo()
    loadDrivePreference()
  }, [])

  const loadConnectionInfo = async () => {
    setLoading(true)
    setConnectionStatus('checking')
    try {
      const info = await driveApi.getConnectionInfo()
      setConnectionInfo(info)
      setConnectionStatus(info.configured ? 'accessible' : 'not-configured')
    } catch (error: any) {
      console.error('Failed to load connection info:', error)
      setConnectionStatus('not-configured')
      if (error.status === 403) {
        setNotification({ type: 'error', message: 'Admin access required to set up document drive' })
      }
    } finally {
      setLoading(false)
    }
  }

  const loadDrivePreference = async () => {
    try {
      const pref = await driveApi.getDrivePreference()
      if (pref) {
        setDrivePreference(pref)
        if (pref.driveLetter) {
          setSelectedDriveLetter(pref.driveLetter)
        }
      }
    } catch (error) {
      console.error('Failed to load drive preference:', error)
    }
  }

  const markSetupComplete = async (os: 'windows' | 'mac') => {
    try {
      await driveApi.updateDrivePreference({
        driveLetter: selectedDriveLetter,
        setupCompleted: true,
        setupCompletedAt: new Date().toISOString(),
        os
      })
      setDrivePreference({
        driveLetter: selectedDriveLetter,
        setupCompleted: true,
        setupCompletedAt: new Date().toISOString(),
        os
      })
    } catch (error) {
      console.error('Failed to save drive preference:', error)
    }
  }

  const handleDownloadWindowsScript = async () => {
    if (!connectionInfo?.configured) return
    
    setDownloading('windows')
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/drive/setup-script/windows?driveLetter=${selectedDriveLetter}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('apex-access-token')}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to generate script')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${connectionInfo.firmName?.replace(/[^a-zA-Z0-9]/g, '') || 'ApexDrive'}_Setup.ps1`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      setNotification({ type: 'success', message: 'Windows setup script downloaded! Right-click and Run with PowerShell.' })
      await markSetupComplete('windows')
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Failed to download setup script' })
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadMacScript = async () => {
    if (!connectionInfo?.configured) return
    
    setDownloading('mac')
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/drive/setup-script/mac`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('apex-access-token')}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to generate script')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${connectionInfo.firmName?.replace(/[^a-zA-Z0-9]/g, '') || 'ApexDrive'}_Setup.sh`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      setNotification({ type: 'success', message: 'Mac setup script downloaded! Open Terminal and run it.' })
      await markSetupComplete('mac')
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Failed to download setup script' })
    } finally {
      setDownloading(null)
    }
  }

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(true)
    setTimeout(() => setCopiedPath(false), 2000)
  }

  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.accessDenied}>
          <Shield size={48} />
          <h2>Admin Access Required</h2>
          <p>Only firm administrators can set up the document drive.</p>
          <button onClick={() => navigate('/app/documents')}>
            Go to Documents
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spinning} />
          <span>Checking drive configuration...</span>
        </div>
      </div>
    )
  }

  // Already connected state - beautiful confirmation screen
  if (drivePreference?.setupCompleted && connectionInfo?.configured && !showSetupAnyway) {
    return (
      <div className={styles.container}>
        <div className={styles.connectedWrapper}>
          <div className={styles.connectedCard}>
            <div className={styles.connectedIcon}>
              <div className={styles.connectedIconRing}>
                <CheckCircle2 size={64} />
              </div>
              <Sparkles className={styles.sparkle1} size={20} />
              <Sparkles className={styles.sparkle2} size={16} />
              <Sparkles className={styles.sparkle3} size={14} />
            </div>
            
            <h1>You're All Set!</h1>
            <p className={styles.connectedSubtitle}>
              Your firm's documents are mapped to your {drivePreference.os === 'mac' ? 'Mac' : 'Windows'} computer
            </p>

            <div className={styles.connectedDriveInfo}>
              <div className={styles.driveIcon}>
                <HardDrive size={32} />
              </div>
              <div className={styles.driveDetails}>
                <span className={styles.driveLetter}>{drivePreference.driveLetter}: Drive</span>
                <span className={styles.firmName}>{connectionInfo.firmName}</span>
              </div>
            </div>

            <div className={styles.connectedPath}>
              <code>{connectionInfo.paths?.[drivePreference.os === 'mac' ? 'mac' : 'windows']}</code>
              <button onClick={() => copyPath(connectionInfo.paths?.[drivePreference.os === 'mac' ? 'mac' : 'windows'] || '')}>
                <Copy size={14} />
              </button>
            </div>

            <div className={styles.connectedActions}>
              <button 
                className={styles.primaryBtn}
                onClick={() => navigate('/app/documents')}
              >
                <FolderOpen size={18} />
                Go to Documents
              </button>
              <button 
                className={styles.secondaryBtn}
                onClick={() => {
                  // Try to open the drive
                  const firmdocsUrl = `firmdocs://${drivePreference.driveLetter}:/`
                  const iframe = document.createElement('iframe')
                  iframe.style.display = 'none'
                  iframe.src = firmdocsUrl
                  document.body.appendChild(iframe)
                  setTimeout(() => document.body.removeChild(iframe), 1000)
                }}
              >
                <ExternalLink size={18} />
                Open in {drivePreference.os === 'mac' ? 'Finder' : 'Explorer'}
              </button>
            </div>

            <div className={styles.connectedFooter}>
              <p>
                Setup completed {drivePreference.setupCompletedAt ? new Date(drivePreference.setupCompletedAt).toLocaleDateString() : 'previously'}
              </p>
              <button 
                className={styles.textBtn}
                onClick={() => setShowSetupAnyway(true)}
              >
                Need to reconnect or change drive letter?
              </button>
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

      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/app/settings')}>
          <ArrowLeft size={20} />
          <span>Back to Settings</span>
        </button>
        <div className={styles.headerContent}>
          <div className={styles.headerIcon}>
            <HardDrive size={28} />
          </div>
          <div>
            <h1>Connect Your Documents Drive</h1>
            <p>Map your firm's cloud storage as a local drive</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Status Card */}
        <div className={`${styles.statusCard} ${connectionStatus === 'accessible' ? styles.connected : ''}`}>
          <div className={styles.statusHeader}>
            <div className={styles.statusIcon}>
              {connectionStatus === 'checking' && <Loader2 size={32} className={styles.spinning} />}
              {connectionStatus === 'accessible' && <CheckCircle2 size={32} />}
              {connectionStatus === 'not-accessible' && <WifiOff size={32} />}
              {connectionStatus === 'not-configured' && <AlertCircle size={32} />}
            </div>
            <div className={styles.statusText}>
              {connectionStatus === 'checking' && <h2>Checking connection...</h2>}
              {connectionStatus === 'accessible' && (
                <>
                  <h2>Azure File Share Ready</h2>
                  <p>Your firm's storage is configured and ready to connect</p>
                </>
              )}
              {connectionStatus === 'not-accessible' && (
                <>
                  <h2>Connection Issue</h2>
                  <p>Cannot reach Azure storage. Check firewall settings.</p>
                </>
              )}
              {connectionStatus === 'not-configured' && (
                <>
                  <h2>Not Configured</h2>
                  <p>Azure File Share needs to be configured by your platform administrator.</p>
                </>
              )}
            </div>
            <button className={styles.refreshBtn} onClick={loadConnectionInfo} disabled={loading}>
              <RefreshCw size={18} className={loading ? styles.spinning : ''} />
            </button>
          </div>

          {connectionInfo?.configured && (
            <div className={styles.firmInfo}>
              <div className={styles.infoItem}>
                <span className={styles.label}>Firm:</span>
                <span className={styles.value}>{connectionInfo.firmName}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Folder:</span>
                <span className={styles.value}>{connectionInfo.firmFolder}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Storage:</span>
                <span className={styles.value}>{connectionInfo.storageAccount}.file.core.windows.net</span>
              </div>
            </div>
          )}
        </div>

        {connectionInfo?.configured && (
          <>
            {/* Drive Letter Selector */}
            <div className={styles.driveLetterSection}>
              <h3>Select Drive Letter</h3>
              <p>Choose which drive letter to use for your firm's documents</p>
              <div className={styles.driveLetterSelector}>
                <select 
                  value={selectedDriveLetter} 
                  onChange={(e) => setSelectedDriveLetter(e.target.value)}
                >
                  {driveLetters.map(letter => (
                    <option key={letter} value={letter}>{letter}: Drive</option>
                  ))}
                </select>
                <span className={styles.drivePreview}>
                  {selectedDriveLetter}:\{connectionInfo.firmName?.replace(/[^a-zA-Z0-9]/g, '')}
                </span>
              </div>
            </div>

            {/* Download Buttons */}
            <div className={styles.downloadSection}>
              <h3>Download Setup Script</h3>
              <p>Choose your operating system to download the one-click setup script</p>
              
              <div className={styles.osCards}>
                {/* Windows Card */}
                <div className={styles.osCard}>
                  <div className={styles.osHeader}>
                    <Monitor size={32} />
                    <h4>Windows</h4>
                  </div>
                  <p>PowerShell script that maps your firm drive and enables "Open in Explorer" links</p>
                  <button 
                    className={styles.downloadBtn}
                    onClick={handleDownloadWindowsScript}
                    disabled={downloading !== null}
                  >
                    {downloading === 'windows' ? (
                      <Loader2 size={18} className={styles.spinning} />
                    ) : (
                      <Download size={18} />
                    )}
                    Download Windows Script
                  </button>
                  <button 
                    className={styles.helpToggle}
                    onClick={() => setShowWindowsHelp(!showWindowsHelp)}
                  >
                    <HelpCircle size={14} />
                    {showWindowsHelp ? 'Hide' : 'Show'} Instructions
                    {showWindowsHelp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  
                  {showWindowsHelp && (
                    <div className={styles.instructions}>
                      <h5>How to run the script:</h5>
                      <ol>
                        <li>Download the .ps1 file</li>
                        <li>Right-click the file</li>
                        <li>Select "Run with PowerShell"</li>
                        <li>If prompted, click "Run" to allow</li>
                        <li>Wait for the drive to connect</li>
                      </ol>
                      <h5>What the script does:</h5>
                      <ul>
                        <li>Checks if port 445 is accessible</li>
                        <li>Stores Azure credentials securely</li>
                        <li>Maps the drive to {selectedDriveLetter}:</li>
                        <li>Makes it persist after reboot</li>
                        <li>Registers "firmdocs://" protocol for quick links</li>
                        <li>Opens the drive in File Explorer</li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Mac Card */}
                <div className={styles.osCard}>
                  <div className={styles.osHeader}>
                    <Apple size={32} />
                    <h4>Mac</h4>
                  </div>
                  <p>Shell script that mounts your firm drive and adds it to Finder favorites</p>
                  <button 
                    className={styles.downloadBtn}
                    onClick={handleDownloadMacScript}
                    disabled={downloading !== null}
                  >
                    {downloading === 'mac' ? (
                      <Loader2 size={18} className={styles.spinning} />
                    ) : (
                      <Download size={18} />
                    )}
                    Download Mac Script
                  </button>
                  <button 
                    className={styles.helpToggle}
                    onClick={() => setShowMacHelp(!showMacHelp)}
                  >
                    <HelpCircle size={14} />
                    {showMacHelp ? 'Hide' : 'Show'} Instructions
                    {showMacHelp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  
                  {showMacHelp && (
                    <div className={styles.instructions}>
                      <h5>How to run the script:</h5>
                      <ol>
                        <li>Download the .sh file</li>
                        <li>Open Terminal app</li>
                        <li>Run: <code>chmod +x ~/Downloads/*_Setup.sh</code></li>
                        <li>Run: <code>~/Downloads/*_Setup.sh</code></li>
                        <li>Enter your Mac password when prompted</li>
                      </ol>
                      <h5>What the script does:</h5>
                      <ul>
                        <li>Creates mount point in /Volumes</li>
                        <li>Mounts the Azure SMB share</li>
                        <li>Adds to Login Items for persistence</li>
                        <li>Opens the drive in Finder</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Manual Connection */}
            <div className={styles.manualSection}>
              <button 
                className={styles.advancedToggle}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <Settings size={16} />
                Advanced: Manual Connection
                {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              
              {showAdvanced && (
                <div className={styles.advancedContent}>
                  <p className={styles.advancedNote}>
                    If the automatic script doesn't work, you can connect manually using these paths:
                  </p>
                  
                  <div className={styles.pathBox}>
                    <label>Windows Path:</label>
                    <div className={styles.pathRow}>
                      <code>{connectionInfo.paths?.windows}</code>
                      <button onClick={() => copyPath(connectionInfo.paths?.windows || '')}>
                        <Copy size={14} />
                        {copiedPath ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <span className={styles.pathHint}>
                      Open File Explorer → Right-click "This PC" → "Map network drive" → Paste this path
                    </span>
                  </div>

                  <div className={styles.pathBox}>
                    <label>Mac Path:</label>
                    <div className={styles.pathRow}>
                      <code>{connectionInfo.paths?.mac}</code>
                      <button onClick={() => copyPath(connectionInfo.paths?.mac || '')}>
                        <Copy size={14} />
                        {copiedPath ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <span className={styles.pathHint}>
                      In Finder: Go → Connect to Server (Cmd+K) → Paste this path
                    </span>
                  </div>

                  <div className={styles.credentialsNote}>
                    <Key size={16} />
                    <div>
                      <strong>Credentials:</strong>
                      <p>Username: AZURE\{connectionInfo.storageAccount}</p>
                      <p>Password: Contact your platform administrator for the storage key</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Troubleshooting */}
            <div className={styles.troubleshootSection}>
              <h3>
                <HelpCircle size={20} />
                Troubleshooting
              </h3>
              <div className={styles.troubleshootGrid}>
                <div className={styles.troubleshootItem}>
                  <h4>Connection refused / Timeout</h4>
                  <p>Your firewall or ISP may be blocking port 445. Check with your IT administrator or try connecting from a different network.</p>
                </div>
                <div className={styles.troubleshootItem}>
                  <h4>Access denied</h4>
                  <p>Verify the credentials are correct. The username format should be AZURE\{connectionInfo.storageAccount}</p>
                </div>
                <div className={styles.troubleshootItem}>
                  <h4>Drive disconnects</h4>
                  <p>Ensure "Reconnect at sign-in" is checked when mapping, or re-run the setup script.</p>
                </div>
                <div className={styles.troubleshootItem}>
                  <h4>Script won't run</h4>
                  <p>Windows may block scripts by default. Right-click → Properties → "Unblock" checkbox, then run again.</p>
                </div>
              </div>
            </div>

            {/* After Setup Info */}
            <div className={styles.afterSetup}>
              <h3>
                <FolderOpen size={20} />
                After Setup
              </h3>
              <p>Once connected, you'll have access to:</p>
              <ul>
                <li><strong>{selectedDriveLetter}:\Matters\</strong> - All client matters organized by client name</li>
                <li><strong>{selectedDriveLetter}:\Clients\</strong> - Client-level documents</li>
                <li><strong>{selectedDriveLetter}:\Templates\</strong> - Document templates</li>
              </ul>
              <p className={styles.syncNote}>
                Files you save here will automatically appear in the Documents section of Apex Drive, 
                and vice versa - they're the same files!
              </p>
            </div>
          </>
        )}

        {!connectionInfo?.configured && (
          <div className={styles.notConfigured}>
            <AlertCircle size={48} />
            <h3>Azure Storage Not Configured</h3>
            <p>
              To enable document drive mapping, your platform administrator needs to configure 
              Azure Storage settings in the Platform Admin portal.
            </p>
            <div className={styles.configSteps}>
              <h4>For Platform Administrators:</h4>
              <ol>
                <li>Go to the Platform Admin Dashboard</li>
                <li>Navigate to "Platform Settings" → "Azure Storage"</li>
                <li>Enter your Azure Storage Account name and key</li>
                <li>Specify the File Share name (default: apexdrive)</li>
                <li>Save settings and return here</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
