import { useState, useEffect, useCallback } from 'react'
import { 
  Folder, FolderOpen, FileText, ChevronRight, ChevronDown,
  RefreshCw, Home, File, FileSpreadsheet, FileImage, 
  FilePlus, Loader2, AlertCircle, Lock, Download, List, FolderTree
} from 'lucide-react'
import { driveApi } from '../services/api'
import styles from './FolderBrowser.module.css'

interface FolderItem {
  path: string
  name: string
  fileCount?: number
}

interface DocumentItem {
  id: string
  name: string
  originalName?: string
  contentType?: string
  size: number
  folderPath?: string
  path?: string
  azurePath?: string
  matterId?: string
  matterName?: string
  matterNumber?: string
  uploadedAt?: string
  uploadedByName?: string
  versionCount?: number
  isOwned?: boolean
  privacyLevel?: string
  isFromAzure?: boolean
  storageLocation?: string
}

interface BrowseResult {
  firmFolder: string
  currentPath?: string
  isAdmin: boolean
  files: DocumentItem[]
  folders: string[]
  matters?: { id: string; name: string; caseNumber?: string; folderPath: string }[]
  stats: {
    totalFiles: number
    totalSize: number
    mattersWithFiles?: number
    totalFolders?: number
  }
  azureConfig?: {
    configured: boolean
    shareName?: string
    connectionPath?: string
  }
  configured?: boolean
  message?: string
  error?: string
  source?: string
}

interface FolderBrowserProps {
  onDocumentSelect?: (doc: DocumentItem) => void
  onFolderSelect?: (path: string) => void
  selectedDocumentId?: string
  showHeader?: boolean
  className?: string
}

export function FolderBrowser({ 
  onDocumentSelect, 
  onFolderSelect,
  selectedDocumentId,
  showHeader = true,
  className
}: FolderBrowserProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null)
  const [currentPath, setCurrentPath] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [folderTree, setFolderTree] = useState<Map<string, FolderItem[]>>(new Map())
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [pageSize] = useState(100) // Show 100 docs at a time
  const [currentPage, setCurrentPage] = useState(0)

  // Build folder tree from flat folder list
  const buildFolderTree = useCallback((folders: string[]) => {
    const tree = new Map<string, FolderItem[]>()
    tree.set('', []) // Root level
    
    // Sort folders for consistent ordering
    const sortedFolders = [...folders].sort()
    
    for (const folderPath of sortedFolders) {
      if (!folderPath) continue
      
      const parts = folderPath.split('/').filter(p => p)
      let currentParent = ''
      
      for (let i = 0; i < parts.length; i++) {
        const partPath = parts.slice(0, i + 1).join('/')
        const parentPath = i === 0 ? '' : parts.slice(0, i).join('/')
        
        if (!tree.has(parentPath)) {
          tree.set(parentPath, [])
        }
        
        // Check if this folder already exists in parent
        const siblings = tree.get(parentPath)!
        if (!siblings.find(f => f.path === partPath)) {
          siblings.push({
            path: partPath,
            name: parts[i]
          })
        }
        
        currentParent = partPath
      }
    }
    
    return tree
  }, [])

  // Fetch files from database (instant)
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await driveApi.browseAllFiles(searchQuery || undefined)
      setBrowseData(result)
      
      if (result.folders) {
        const tree = buildFolderTree(result.folders)
        setFolderTree(tree)
      }
    } catch (err: any) {
      console.error('Failed to load files:', err)
      setError(err.message || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [buildFolderTree, searchQuery])
  
  // Sync from Azure (runs in background)
  const syncFromAzure = useCallback(async () => {
    setSyncing(true)
    try {
      const result = await driveApi.syncFromAzure()
      console.log('Sync started:', result)
      alert(result.message || 'Sync started. Refresh the page in a few minutes.')
      // Refresh after a delay
      setTimeout(() => {
        fetchData()
        setSyncing(false)
      }, 5000)
    } catch (err: any) {
      console.error('Sync failed:', err)
      alert('Sync failed: ' + err.message)
      setSyncing(false)
    }
  }, [fetchData])

  // Fetch on mount
  useEffect(() => {
    fetchData()
  }, [])
  
  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData()
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])
  
  // Download file (handles both database and Azure files)
  const downloadFile = async (doc: DocumentItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    
    setDownloadingId(doc.id)
    
    try {
      let blob: Blob
      
      // Check if this is an Azure file
      if (doc.isFromAzure || doc.storageLocation === 'azure' || doc.id.startsWith('azure-')) {
        // Use the full Azure path for download
        // Priority: azurePath > path > constructed path
        const downloadPath = doc.azurePath || doc.path || 
          (doc.folderPath ? `${doc.folderPath}/${doc.name}` : doc.name)
        
        console.log('[FolderBrowser] Downloading Azure file:', downloadPath)
        blob = await driveApi.downloadAzureFile(downloadPath)
      } else {
        // Use standard document download for database files
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
        const token = localStorage.getItem('apex-access-token') || localStorage.getItem('token') || ''
        const response = await fetch(`${apiUrl}/documents/${doc.id}/download`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!response.ok) {
          throw new Error('Download failed')
        }
        blob = await response.blob()
      }
      
      // Create download link
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.originalName || doc.name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
    } catch (err: any) {
      console.error('Download failed:', err)
      alert('Failed to download file: ' + (err.message || 'Unknown error'))
    } finally {
      setDownloadingId(null)
    }
  }

  // Toggle folder expansion
  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  // Navigate to folder
  const navigateToFolder = (path: string) => {
    setCurrentPath(path)
    onFolderSelect?.(path)
    
    // Expand parent folders
    const parts = path.split('/').filter(p => p)
    const newExpanded = new Set(expandedFolders)
    let currentParent = ''
    for (const part of parts) {
      currentParent = currentParent ? `${currentParent}/${part}` : part
      newExpanded.add(currentParent)
    }
    setExpandedFolders(newExpanded)
  }

  // Get file icon based on type
  const getFileIcon = (contentType?: string, name?: string) => {
    const ext = name?.split('.').pop()?.toLowerCase() || ''
    
    if (contentType?.includes('pdf') || ext === 'pdf') {
      return <FileText size={16} className={styles.pdfIcon} />
    }
    if (contentType?.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(ext)) {
      return <FileSpreadsheet size={16} className={styles.spreadsheetIcon} />
    }
    if (contentType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
      return <FileImage size={16} className={styles.imageIcon} />
    }
    if (contentType?.includes('word') || ['doc', 'docx', 'rtf'].includes(ext)) {
      return <FileText size={16} className={styles.wordIcon} />
    }
    return <File size={16} />
  }

  // Format file size
  const formatSize = (bytes: number) => {
    if (!bytes) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  // Render folder tree recursively
  const renderFolderTree = (parentPath: string = '', level: number = 0) => {
    const children = folderTree.get(parentPath) || []
    if (children.length === 0) return null

    return children.map(folder => {
      const isExpanded = expandedFolders.has(folder.path)
      const isSelected = currentPath === folder.path
      const hasChildren = folderTree.has(folder.path) && (folderTree.get(folder.path)?.length || 0) > 0
      
      return (
        <div key={folder.path} className={styles.folderItem}>
          <div 
            className={`${styles.folderRow} ${isSelected ? styles.selected : ''}`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => navigateToFolder(folder.path)}
          >
            <span 
              className={styles.expandIcon}
              onClick={(e) => { e.stopPropagation(); toggleFolder(folder.path) }}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              ) : (
                <span style={{ width: 14 }} />
              )}
            </span>
            {isExpanded ? <FolderOpen size={16} className={styles.folderIcon} /> : <Folder size={16} className={styles.folderIcon} />}
            <span className={styles.folderName}>{folder.name}</span>
          </div>
          {isExpanded && renderFolderTree(folder.path, level + 1)}
        </div>
      )
    })
  }

  // Filter documents by current path
  const allCurrentDocuments = browseData?.files?.filter(f => {
    if (!currentPath) return true
    return f.folderPath === currentPath || f.folderPath?.startsWith(currentPath + '/')
  }) || []
  
  // Paginate to prevent rendering too many items
  const totalPages = Math.ceil(allCurrentDocuments.length / pageSize)
  const currentDocuments = allCurrentDocuments.slice(
    currentPage * pageSize, 
    (currentPage + 1) * pageSize
  )

  // Get breadcrumb path parts
  const pathParts = currentPath.split('/').filter(p => p)
  
  // Reset page when path changes
  useEffect(() => {
    setCurrentPage(0)
  }, [currentPath, searchQuery])

  if (loading && !browseData) {
    return (
      <div className={`${styles.container} ${className || ''}`}>
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spinner} />
          <p>Loading documents...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${styles.container} ${className || ''}`}>
        <div className={styles.error}>
          <AlertCircle size={32} />
          <p>{error}</p>
          <button onClick={() => fetchData()} className={styles.retryBtn}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.container} ${className || ''}`}>
      {showHeader && (
        <div className={styles.header}>
          <h2>
            <FolderOpen size={24} />
            Documents
            {browseData?.isAdmin && <span className={styles.adminBadge}>Admin View</span>}
          </h2>
          <div className={styles.headerActions}>
            <button onClick={fetchData} className={styles.refreshBtn} title="Refresh">
              <RefreshCw size={16} />
            </button>
            <button 
              onClick={syncFromAzure} 
              className={styles.syncBtn} 
              disabled={syncing}
              title="Sync from Azure"
            >
              {syncing ? <Loader2 size={16} className={styles.spinner} /> : <Download size={16} />}
              {syncing ? 'Syncing...' : 'Sync from Azure'}
            </button>
          </div>
        </div>
      )}

      <div className={styles.content}>
        {/* Folder Tree Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span>Folders</span>
            {browseData?.stats && (
              <span className={styles.statsCount}>{browseData.stats.totalFiles} files</span>
            )}
          </div>
          <div className={styles.folderTree}>
            {/* Root folder */}
            <div 
              className={`${styles.folderRow} ${!currentPath ? styles.selected : ''}`}
              onClick={() => navigateToFolder('')}
            >
              <Home size={16} className={styles.folderIcon} />
              <span className={styles.folderName}>All Documents</span>
            </div>
            
            {/* Matter folders */}
            {browseData?.matters && browseData.matters.length > 0 && (
              <div className={styles.matterSection}>
                <div className={styles.sectionLabel}>Matters</div>
                {browseData.matters.map(matter => (
                  <div
                    key={matter.id}
                    className={`${styles.folderRow} ${currentPath === matter.folderPath ? styles.selected : ''}`}
                    onClick={() => navigateToFolder(matter.folderPath)}
                    style={{ paddingLeft: '16px' }}
                  >
                    <Folder size={14} className={styles.folderIcon} />
                    <span className={styles.folderName} title={matter.name}>
                      {matter.caseNumber ? `${matter.caseNumber} - ` : ''}{matter.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Custom folders from Clio */}
            {folderTree.size > 0 && (
              <div className={styles.customFolders}>
                <div className={styles.sectionLabel}>Folders</div>
                {renderFolderTree()}
              </div>
            )}
          </div>
        </div>

        {/* Document List */}
        <div className={styles.main}>
          {/* Breadcrumb / Actions */}
          <div className={styles.breadcrumb}>
            <button onClick={() => setCurrentPath('')} className={styles.breadcrumbItem}>
              <Home size={14} />
              <span>All Documents</span>
            </button>
            {currentPath && (
              <>
                <ChevronRight size={14} className={styles.breadcrumbSep} />
                <span className={styles.breadcrumbItem}>{currentPath}</span>
              </>
            )}
            {/* Sync button when header is hidden */}
            {!showHeader && (
              <button 
                onClick={syncFromAzure} 
                className={styles.inlineSyncBtn} 
                disabled={syncing}
                title="Sync from Azure"
              >
                {syncing ? <Loader2 size={14} className={styles.spinner} /> : <Download size={14} />}
                {syncing ? 'Syncing...' : 'Sync from Azure'}
              </button>
            )}
          </div>

          {/* Loading indicator for refresh */}
          {loading && (
            <div className={styles.refreshing}>
              <Loader2 size={16} className={styles.spinner} />
              <span>Refreshing...</span>
            </div>
          )}

          {/* Search bar */}
          <div className={styles.searchBar}>
            <input 
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          {/* Documents Table */}
          <div className={styles.documentsTable}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Folder</th>
                  <th>Size</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyRow}>
                      <div className={styles.emptyState}>
                        <FolderOpen size={32} />
                        <p>{browseData?.message || 'No documents found'}</p>
                        <p className={styles.emptyHint}>
                          Click "Sync from Azure" to load documents from Azure storage
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentDocuments.map(doc => (
                    <tr 
                      key={doc.id}
                      className={`${styles.docRow} ${selectedDocumentId === doc.id ? styles.selectedDoc : ''}`}
                      onClick={() => onDocumentSelect?.(doc)}
                    >
                      <td>
                        <div className={styles.nameCell}>
                          {getFileIcon(doc.contentType, doc.name)}
                          <span className={styles.docName}>{doc.originalName || doc.name}</span>
                          {doc.isFromAzure && (
                            <span className={styles.azureBadge} title="Stored in Azure">Azure</span>
                          )}
                          {doc.isOwned && (
                            <span className={styles.ownedBadge} title="You own this document">Owner</span>
                          )}
                        </div>
                      </td>
                      <td className={styles.folderCell}>
                        {doc.folderPath ? (
                          <button 
                            className={styles.folderLink}
                            onClick={(e) => { e.stopPropagation(); navigateToFolder(doc.folderPath!); }}
                            title={doc.folderPath}
                          >
                            {doc.folderPath.length > 30 
                              ? '...' + doc.folderPath.slice(-30) 
                              : doc.folderPath
                            }
                          </button>
                        ) : (
                          <span className={styles.rootFolder}>Root</span>
                        )}
                      </td>
                      <td>{formatSize(doc.size)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button 
                            className={styles.downloadBtn}
                            onClick={(e) => downloadFile(doc, e)}
                            disabled={downloadingId === doc.id}
                            title="Download"
                          >
                            {downloadingId === doc.id ? (
                              <Loader2 size={16} className={styles.spinner} />
                            ) : (
                              <Download size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button 
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className={styles.pageBtn}
              >
                Previous
              </button>
              <span className={styles.pageInfo}>
                Page {currentPage + 1} of {totalPages} ({allCurrentDocuments.length} documents)
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className={styles.pageBtn}
              >
                Next
              </button>
            </div>
          )}

          {/* Stats footer */}
          {browseData?.stats && (
            <div className={styles.footer}>
              <span>{allCurrentDocuments.length} documents in this view</span>
              <span className={styles.divider}>•</span>
              <span>{browseData.stats.totalFiles} total files</span>
              <span className={styles.divider}>•</span>
              <span>{formatSize(browseData.stats.totalSize)}</span>
              {browseData.source === 'cache' && (
                <>
                  <span className={styles.divider}>•</span>
                  <span className={styles.cacheIndicator}>Cached</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FolderBrowser
