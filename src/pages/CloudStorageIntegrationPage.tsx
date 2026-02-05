import { useState, useEffect } from 'react'
import { Cloud, RefreshCw, Search, ArrowLeft, FolderOpen, FileText, ExternalLink, File, Image, Video } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { integrationsApi } from '../services/api'
import styles from './IntegrationDataPage.module.css'

interface CloudFile {
  id: string
  name: string
  size?: number
  folder?: boolean
  mimeType?: string
  webUrl?: string
  path?: string
}

const providerConfig: Record<string, { name: string; icon: any; syncFn: () => Promise<any> }> = {
  onedrive: {
    name: 'OneDrive',
    icon: Cloud,
    syncFn: () => integrationsApi.syncOneDrive()
  },
  'google-drive': {
    name: 'Google Drive',
    icon: FolderOpen,
    syncFn: () => integrationsApi.syncGoogleDrive()
  },
  dropbox: {
    name: 'Dropbox',
    icon: FolderOpen,
    syncFn: () => integrationsApi.syncDropbox()
  }
}

export function CloudStorageIntegrationPage() {
  const navigate = useNavigate()
  const { provider } = useParams<{ provider: string }>()
  const config = providerConfig[provider || 'onedrive']
  
  const [files, setFiles] = useState<CloudFile[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (config) {
      loadFiles()
    }
  }, [provider])

  const loadFiles = async () => {
    try {
      setLoading(true)
      const result = await config.syncFn()
      setFiles(result.files || [])
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to load files' })
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await config.syncFn()
      setFiles(result.files || [])
      setNotification({ type: 'success', message: result.message || `${config.name} synced successfully` })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return ''
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  const getFileIcon = (file: CloudFile) => {
    if (file.folder) return 'folder'
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const mimeType = file.mimeType || ''
    
    if (ext === 'pdf' || mimeType.includes('pdf')) return 'pdf'
    if (['doc', 'docx'].includes(ext) || mimeType.includes('document') || mimeType.includes('word')) return 'word'
    if (['xls', 'xlsx'].includes(ext) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'excel'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || mimeType.includes('image')) return 'image'
    if (['mp4', 'mov', 'avi'].includes(ext) || mimeType.includes('video')) return 'video'
    return 'other'
  }

  const getFileIconComponent = (type: string) => {
    switch (type) {
      case 'folder': return <FolderOpen size={20} />
      case 'pdf': return <FileText size={20} />
      case 'image': return <Image size={20} />
      case 'video': return <Video size={20} />
      default: return <File size={20} />
    }
  }

  const filteredFiles = files.filter(file =>
    file.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const Icon = config?.icon || Cloud

  if (!config) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <Cloud size={48} />
          <h3>Unknown provider</h3>
          <p>This cloud storage provider is not supported</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon}>
            <Icon size={28} />
          </div>
          <div>
            <h1>{config.name}</h1>
            <p>View and sync files from {config.name}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.syncBtn}
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={18} className={syncing ? styles.spinning : ''} />
            {syncing ? 'Syncing...' : 'Sync to Documents'}
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className={styles.stats}>
          <span>{files.filter(f => !f.folder).length} files</span>
          <span>{files.filter(f => f.folder).length} folders</span>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <RefreshCw size={24} className={styles.spinning} />
          <span>Loading files...</span>
        </div>
      ) : (
        <div className={styles.dataList}>
          {filteredFiles.length === 0 ? (
            <div className={styles.empty}>
              <Cloud size={48} />
              <h3>No files found</h3>
              <p>Your {config.name} files will appear here</p>
            </div>
          ) : (
            filteredFiles.map(file => {
              const fileType = getFileIcon(file)
              return (
                <div key={file.id} className={styles.fileItem}>
                  <div className={`${styles.fileIcon} ${styles[fileType]}`}>
                    {getFileIconComponent(fileType)}
                  </div>
                  <div className={styles.fileInfo}>
                    <span className={styles.fileName}>{file.name}</span>
                    <span className={styles.fileSize}>
                      {file.folder ? 'Folder' : formatSize(file.size)}
                    </span>
                  </div>
                  {file.webUrl && (
                    <a 
                      href={file.webUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={styles.openBtn}
                    >
                      <ExternalLink size={14} />
                      Open
                    </a>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
