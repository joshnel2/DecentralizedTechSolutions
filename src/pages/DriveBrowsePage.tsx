import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Folder, FileText, File, Image, Video, Music,
  Download, ChevronRight,
  Search, Grid, List, RefreshCw, Upload, FolderPlus, Home,
  Loader2, AlertCircle, CheckCircle2, Eye, Clock
} from 'lucide-react'
import { driveApi, documentsApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import styles from './DriveBrowsePage.module.css'

interface DriveFile {
  id: string
  name: string
  originalName?: string
  contentType?: string
  size?: number
  folderPath?: string
  matterId?: string
  matterName?: string
  uploadedAt: string
  uploadedByName?: string
  isFolder: boolean
  versionCount: number
  isOwned: boolean
}

export function DriveBrowsePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  const currentPath = searchParams.get('path') || ''
  
  const [files, setFiles] = useState<DriveFile[]>([])
  const [_folders, setFolders] = useState<string[]>([])
  const [stats, setStats] = useState({ totalFiles: 0, totalSize: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadItems()
  }, [currentPath])

  const loadItems = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await driveApi.browseDrive(currentPath)
      const filteredFiles = result.files || []
      // Backend already filters by permissions - no client-side filtering needed
      setFiles(filteredFiles)
      setFolders(result.folders || [])
      setStats({
        totalFiles: filteredFiles.length,
        totalSize: filteredFiles.reduce((acc: number, f: DriveFile) => acc + (f.size || 0), 0)
      })
    } catch (err: any) {
      setError(err.message || 'Failed to load drive contents')
      setFiles([])
      setFolders([])
    } finally {
      setLoading(false)
    }
  }

  const navigateToFolder = (path: string) => {
    setSearchParams({ path })
    setSelectedItems([])
  }

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    navigateToFolder(parts.join('/'))
  }

  const getFileIcon = (file: DriveFile) => {
    if (file.isFolder) return <Folder size={24} />
    
    const mimeType = file.contentType || ''
    if (mimeType.startsWith('image/')) return <Image size={24} />
    if (mimeType.startsWith('video/')) return <Video size={24} />
    if (mimeType.startsWith('audio/')) return <Music size={24} />
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('word')) 
      return <FileText size={24} />
    return <File size={24} />
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleItemClick = (file: DriveFile) => {
    if (file.isFolder) {
      navigateToFolder(file.folderPath || file.name)
    } else {
      // Open document detail or download
      navigate(`/app/documents?highlight=${file.id}`)
    }
  }

  const handleDownload = async (file: DriveFile) => {
    if (file.isFolder) return
    try {
      const blob = await documentsApi.download(file.id)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setNotification({ type: 'success', message: `Downloaded ${file.name}` })
    } catch (err) {
      setNotification({ type: 'error', message: 'Download failed' })
    }
  }

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const breadcrumbs = currentPath.split('/').filter(Boolean)

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/app/settings/drives')}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon}>
            <Folder size={28} />
          </div>
          <div>
            <h1>Firm Drive</h1>
            <p>Browse and manage all firm documents</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.refreshBtn} onClick={loadItems} disabled={loading}>
            <RefreshCw size={18} className={loading ? styles.spinning : ''} />
          </button>
          {isAdmin && (
            <>
              <button className={styles.actionBtn}>
                <FolderPlus size={18} />
                New Folder
              </button>
              <button className={styles.uploadBtn}>
                <Upload size={18} />
                Upload
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        {/* Breadcrumbs */}
        <div className={styles.breadcrumbs}>
          <button 
            className={styles.breadcrumb}
            onClick={() => navigateToFolder('')}
          >
            <Home size={16} />
            <span>Firm Drive</span>
          </button>
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className={styles.breadcrumbItem}>
              <ChevronRight size={14} />
              <button
                className={styles.breadcrumb}
                onClick={() => navigateToFolder(breadcrumbs.slice(0, index + 1).join('/'))}
              >
                {crumb}
              </button>
            </span>
          ))}
        </div>

        {/* Search & View Toggle */}
        <div className={styles.toolbarRight}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className={styles.viewToggle}>
            <button 
              className={viewMode === 'list' ? styles.active : ''}
              onClick={() => setViewMode('list')}
            >
              <List size={18} />
            </button>
            <button 
              className={viewMode === 'grid' ? styles.active : ''}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}>
            <Loader2 size={32} className={styles.spinning} />
            <span>Loading files...</span>
          </div>
        ) : error ? (
          <div className={styles.error}>
            <AlertCircle size={48} />
            <h3>Unable to load drive</h3>
            <p>{error}</p>
            <button onClick={loadItems}>Try Again</button>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className={styles.empty}>
            <Folder size={64} />
            <h3>{searchQuery ? 'No matching files' : 'This folder is empty'}</h3>
            <p>{searchQuery ? 'Try a different search term' : 'Upload files or create folders to get started'}</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className={styles.listView}>
            <div className={styles.listHeader}>
              <div className={styles.listColName}>Name</div>
              <div className={styles.listColModified}>Modified</div>
              <div className={styles.listColSize}>Size</div>
              <div className={styles.listColActions}></div>
            </div>
            {filteredFiles.map(file => (
              <div 
                key={file.id} 
                className={styles.listItem}
                onClick={() => handleItemClick(file)}
              >
                <div className={styles.listColName}>
                  <div className={`${styles.fileIcon} ${file.isFolder ? styles.folder : ''}`}>
                    {getFileIcon(file)}
                  </div>
                  <span className={styles.fileName}>{file.name}</span>
                  {file.matterName && (
                    <span className={styles.itemCount}>{file.matterName}</span>
                  )}
                  {file.versionCount > 1 && (
                    <span className={styles.versionBadge}>v{file.versionCount}</span>
                  )}
                </div>
                <div className={styles.listColModified}>
                  <Clock size={14} />
                  {formatDate(file.uploadedAt)}
                  {file.uploadedByName && <span className={styles.uploadedBy}>{file.uploadedByName}</span>}
                </div>
                <div className={styles.listColSize}>
                  {!file.isFolder ? formatSize(file.size) : '-'}
                </div>
                <div className={styles.listColActions}>
                  {!file.isFolder && (
                    <>
                      <button 
                        className={styles.itemAction}
                        onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                        title="Download"
                      >
                        <Download size={16} />
                      </button>
                      <button 
                        className={styles.itemAction}
                        onClick={(e) => { e.stopPropagation(); navigate(`/app/documents/${file.id}/versions`); }}
                        title="View Versions"
                      >
                        <Eye size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.gridView}>
            {filteredFiles.map(file => (
              <div 
                key={file.id} 
                className={styles.gridItem}
                onClick={() => handleItemClick(file)}
              >
                <div className={`${styles.gridIcon} ${file.isFolder ? styles.folder : ''}`}>
                  {getFileIcon(file)}
                </div>
                <div className={styles.gridName}>{file.name}</div>
                <div className={styles.gridMeta}>
                  {file.isFolder 
                    ? 'Folder' 
                    : formatSize(file.size)
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
