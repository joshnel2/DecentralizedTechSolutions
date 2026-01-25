import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { FixedSizeList as VirtualList } from 'react-window'
import { 
  Folder, FolderOpen, FileText, ChevronRight, ChevronDown,
  RefreshCw, Home, File, FileSpreadsheet, FileImage, 
  Loader2, AlertCircle, Download
} from 'lucide-react'
import { driveApi } from '../services/api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
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
  type?: string
  contentType?: string
  size: number
  folderPath?: string
  path?: string
  azurePath?: string
  externalPath?: string
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

const LIST_PAGE_SIZE = 60
const LIST_ROW_HEIGHT = 52
const CACHE_TTL_MS = 45000
const FOLDER_CACHE_TTL_MS = 300000
const REQUEST_GAP_MS = 200

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
  const [currentPath, setCurrentPath] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [folderTree, setFolderTree] = useState<Map<string, FolderItem[]>>(new Map())
  const [foldersLoading, setFoldersLoading] = useState(true)
  const [foldersError, setFoldersError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<BrowseResult['stats'] | null>(null)
  const [isAdminView, setIsAdminView] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const cacheKey = useMemo(() => `${currentPath}::${debouncedSearch}`, [currentPath, debouncedSearch])
  const documentCacheRef = useRef(new Map<string, { items: DocumentItem[]; total: number; stats: BrowseResult['stats']; timestamp: number }>())
  const foldersCacheRef = useRef<{ timestamp: number; folders: string[] } | null>(null)
  const requestIdRef = useRef(0)
  const lastRequestAtRef = useRef(0)
  const hasMoreRef = useRef(hasMore)
  const loadingRef = useRef(loading)
  const loadingMoreRef = useRef(isLoadingMore)

  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => {
    loadingMoreRef.current = isLoadingMore
  }, [isLoadingMore])

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

  const fetchFolders = useCallback(async (force = false) => {
    const cached = foldersCacheRef.current
    if (!force && cached && Date.now() - cached.timestamp < FOLDER_CACHE_TTL_MS) {
      setFolderTree(buildFolderTree(cached.folders))
      setFoldersLoading(false)
      setFoldersError(null)
      return
    }

    setFoldersLoading(true)
    setFoldersError(null)

    try {
      const result = await driveApi.getFolders()
      const folderPaths = (result.folders || [])
        .map((folder: { path: string }) => folder.path)
        .filter(Boolean)
      foldersCacheRef.current = { timestamp: Date.now(), folders: folderPaths }
      setFolderTree(buildFolderTree(folderPaths))
    } catch (err: any) {
      console.error('Failed to load folders:', err)
      setFoldersError(err.message || 'Failed to load folders')
    } finally {
      setFoldersLoading(false)
    }
  }, [buildFolderTree])

  const fetchDocumentsPage = useCallback(async (offset: number, options: { reset?: boolean } = {}) => {
    const isReset = options.reset ?? false
    const now = Date.now()
    if (!isReset && (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current)) return
    if (now - lastRequestAtRef.current < REQUEST_GAP_MS) return
    lastRequestAtRef.current = now
    const requestId = ++requestIdRef.current

    if (isReset) {
      setLoading(true)
      setError(null)
    } else {
      setIsLoadingMore(true)
    }

    try {
      const result = await driveApi.browseAllFiles({
        search: debouncedSearch || undefined,
        folder: currentPath || undefined,
        limit: LIST_PAGE_SIZE,
        offset,
        includeChildren: true,
        sort: 'name',
        order: 'asc',
      })

      if (requestId !== requestIdRef.current) {
        return
      }

      const incoming = (result.files || []).map((doc: DocumentItem) => ({
        ...doc,
        type: doc.type || doc.contentType,
      }))
      const totalFiles = result.total ?? result.stats?.totalFiles ?? incoming.length

      setDocuments(prev => {
        const nextDocuments = isReset ? incoming : [...prev, ...incoming]
        setHasMore(nextDocuments.length < totalFiles)
        documentCacheRef.current.set(cacheKey, {
          items: nextDocuments,
          total: totalFiles,
          stats: result.stats || { totalFiles: totalFiles, totalSize: 0 },
          timestamp: Date.now(),
        })
        return nextDocuments
      })
      setTotal(totalFiles)
      setStats(result.stats || { totalFiles: totalFiles, totalSize: 0 })
      setIsAdminView(!!result.isAdmin)
      setSource(result.source || null)
      setEmptyMessage(result.message || null)
    } catch (err: any) {
      if (requestId !== requestIdRef.current) {
        return
      }
      console.error('Failed to load files:', err)
      setError(err.message || 'Failed to load documents')
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
        setIsLoadingMore(false)
      }
    }
  }, [
    cacheKey,
    currentPath,
    debouncedSearch,
  ])
  
  // Sync from Azure (runs in background)
  const syncFromAzure = useCallback(async () => {
    setSyncing(true)
    try {
      const result = await driveApi.syncFromAzure()
      console.log('Sync started:', result)
      alert(result.message || 'Sync started. Refresh the page in a few minutes.')
      // Refresh after a delay
      setTimeout(() => {
        documentCacheRef.current.delete(cacheKey)
        fetchFolders(true)
        fetchDocumentsPage(0, { reset: true })
        setSyncing(false)
      }, 5000)
    } catch (err: any) {
      console.error('Sync failed:', err)
      alert('Sync failed: ' + err.message)
      setSyncing(false)
    }
  }, [cacheKey, fetchDocumentsPage, fetchFolders])

  const refreshData = useCallback(() => {
    documentCacheRef.current.delete(cacheKey)
    fetchFolders(true)
    fetchDocumentsPage(0, { reset: true })
  }, [cacheKey, fetchDocumentsPage, fetchFolders])

  useEffect(() => {
    fetchFolders()
  }, [fetchFolders])

  useEffect(() => {
    const cached = documentCacheRef.current.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setDocuments(cached.items)
      setTotal(cached.total)
      setStats(cached.stats)
      setHasMore(cached.items.length < cached.total)
      setSource('cache')
      setLoading(false)
      setError(null)
      return
    }

    setDocuments([])
    setTotal(0)
    setStats(null)
    setHasMore(true)
    fetchDocumentsPage(0, { reset: true })
  }, [cacheKey, fetchDocumentsPage])
  
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

  const handleItemsRendered = useCallback(({ visibleStopIndex }: { visibleStopIndex: number }) => {
    if (!hasMore || isLoadingMore) return
    if (visibleStopIndex >= documents.length - 10) {
      fetchDocumentsPage(documents.length)
    }
  }, [documents.length, fetchDocumentsPage, hasMore, isLoadingMore])

  const renderDocumentRow = ({ index, style }: { index: number; style: CSSProperties }) => {
    if (index >= documents.length) {
      return (
        <div style={style} className={styles.loadingRow}>
          <Loader2 size={16} className={styles.spinner} />
          <span>{isLoadingMore ? 'Loading more documents...' : 'Scroll to load more'}</span>
        </div>
      )
    }

    const doc = documents[index]
    const isSelected = selectedDocumentId === doc.id

    return (
      <div
        style={style}
        className={`${styles.docRow} ${isSelected ? styles.selectedDoc : ''}`}
        onClick={() => onDocumentSelect?.(doc)}
      >
        <div className={styles.nameCell}>
          {getFileIcon(doc.contentType || doc.type, doc.name)}
          <span className={styles.docName}>{doc.originalName || doc.name}</span>
          {doc.isFromAzure && (
            <span className={styles.azureBadge} title="Stored in Azure">Azure</span>
          )}
          {doc.isOwned && (
            <span className={styles.ownedBadge} title="You own this document">Owner</span>
          )}
        </div>
        <div className={styles.folderCell}>
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
        </div>
        <div>{formatSize(doc.size)}</div>
        <div>
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
        </div>
      </div>
    )
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


  if (error && documents.length === 0) {
    return (
      <div className={`${styles.container} ${className || ''}`}>
        <div className={styles.error}>
          <AlertCircle size={32} />
          <p>{error}</p>
          <button onClick={refreshData} className={styles.retryBtn}>
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
            {isAdminView && <span className={styles.adminBadge}>Admin View</span>}
          </h2>
          <div className={styles.headerActions}>
            <button onClick={refreshData} className={styles.refreshBtn} title="Refresh">
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
            {stats && (
              <span className={styles.statsCount}>{stats.totalFiles} files</span>
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

            {foldersLoading && (
              <div className={styles.folderLoading}>
                <Loader2 size={14} className={styles.spinner} />
                <span>Loading folders...</span>
              </div>
            )}

            {!foldersLoading && foldersError && (
              <div className={styles.folderError}>
                <AlertCircle size={14} />
                <span>{foldersError}</span>
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
            <div className={styles.tableHeader}>
              <div>Name</div>
              <div>Folder</div>
              <div>Size</div>
              <div>Actions</div>
            </div>
            <div className={styles.tableBody}>
              {loading && documents.length === 0 ? (
                <div className={styles.skeletonList}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className={styles.skeletonRow}>
                      <div className={styles.skeletonCell} />
                      <div className={styles.skeletonCell} />
                      <div className={styles.skeletonCell} />
                      <div className={styles.skeletonCell} />
                    </div>
                  ))}
                </div>
              ) : documents.length === 0 ? (
                <div className={styles.emptyState}>
                  <FolderOpen size={32} />
                  <p>{emptyMessage || 'No documents found'}</p>
                  <p className={styles.emptyHint}>
                    Click "Sync from Azure" to load documents from Azure storage
                  </p>
                </div>
              ) : (
                <AutoSizer
                  renderProp={({ height, width }: { height: number | undefined; width: number | undefined }) => {
                    if (height == null || width == null) return null
                    return (
                      <VirtualList
                        height={height}
                        width={width}
                        itemCount={hasMore ? documents.length + 1 : documents.length}
                        itemSize={LIST_ROW_HEIGHT}
                        onItemsRendered={handleItemsRendered}
                        itemKey={(index: number) => documents[index]?.id || `loading-${index}`}
                        overscanCount={6}
                      >
                        {renderDocumentRow}
                      </VirtualList>
                    )
                  }}
                />
              )}
            </div>
          </div>

          {/* Stats footer */}
          {stats && (
            <div className={styles.footer}>
              <span>{documents.length} documents in this view</span>
              <span className={styles.divider}>•</span>
              <span>{stats.totalFiles} total files</span>
              <span className={styles.divider}>•</span>
              <span>{formatSize(stats.totalSize)}</span>
              {source === 'cache' && (
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
