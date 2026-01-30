import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Folder, FolderOpen, FileText, ChevronRight,
  RefreshCw, Home, File, FileSpreadsheet, FileImage, 
  Loader2, AlertCircle, Download, Briefcase, Plus,
  FolderPlus, Edit3, Trash2, X, Check, Upload, MoreVertical
} from 'lucide-react'
import { driveApi, documentsApi } from '../services/api'
import { useToast } from './Toast'
import styles from './FolderBrowser.module.css'

// Module-level cache for browse data (persists between component mounts)
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
interface CacheEntry {
  data: BrowseResult | null
  timestamp: number
  searchQuery: string
}
let browseCache: CacheEntry = {
  data: null,
  timestamp: 0,
  searchQuery: ''
}

// Export function to invalidate cache from outside
export function invalidateFolderBrowserCache() {
  browseCache = { data: null, timestamp: 0, searchQuery: '' }
}

interface DocumentItem {
  id: string
  name: string
  originalName?: string
  contentType?: string
  size: number
  folderPath?: string
  path?: string
  matterId?: string
  matterName?: string
  matterNumber?: string
  uploadedAt?: string
  uploadedByName?: string
  versionCount?: number
  isOwned?: boolean
  isShared?: boolean
  privacyLevel?: string
}

interface MatterFolder {
  id: string
  name: string
  caseNumber?: string
  folderPath: string
}

interface BrowseResult {
  isAdmin: boolean
  files: DocumentItem[]
  matters?: MatterFolder[]
  hasUnassigned?: boolean
  stats: {
    totalFiles: number
    totalSize: number
    totalMatters?: number
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
  onUpload?: () => void
}

export function FolderBrowser({ 
  onDocumentSelect, 
  onFolderSelect,
  selectedDocumentId,
  showHeader = true,
  className,
  onUpload
}: FolderBrowserProps) {
  const toast = useToast()
  
  // Use cached data initially if available
  const [loading, setLoading] = useState(() => {
    // Don't show loading if we have valid cached data
    const cacheValid = browseCache.data && 
      Date.now() - browseCache.timestamp < CACHE_DURATION &&
      browseCache.searchQuery === ''
    return !cacheValid
  })
  const [error, setError] = useState<string | null>(null)
  const [browseData, setBrowseData] = useState<BrowseResult | null>(() => {
    // Initialize with cached data if valid
    if (browseCache.data && 
        Date.now() - browseCache.timestamp < CACHE_DURATION &&
        browseCache.searchQuery === '') {
      return browseCache.data
    }
    return null
  })
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null) // null = all, 'unassigned' = no matter
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize] = useState(100) // Show 100 docs at a time
  const [currentPage, setCurrentPage] = useState(0)
  const isInitialMount = useRef(true)
  
  // Folder management state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [contextMenuFolder, setContextMenuFolder] = useState<{ id: string; name: string; x: number; y: number } | null>(null)
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)
  
  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{current: number; total: number} | null>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch documents from database (with caching)
  const fetchData = useCallback(async (forceRefresh = false) => {
    // Check cache validity (only for empty search query)
    const cacheValid = !forceRefresh && 
      searchQuery === '' && 
      browseCache.data && 
      Date.now() - browseCache.timestamp < CACHE_DURATION &&
      browseCache.searchQuery === searchQuery
    
    if (cacheValid && browseData) {
      // Use cached data, don't fetch
      return
    }
    
    // Only show loading spinner if we don't have any data
    if (!browseData) {
      setLoading(true)
    }
    setError(null)
    
    try {
      const result = await driveApi.browseAllFiles(searchQuery || undefined)
      // Ensure result has expected structure
      const normalizedData: BrowseResult = {
        isAdmin: result?.isAdmin ?? false,
        files: result?.files ?? [],
        matters: result?.matters ?? [],
        hasUnassigned: result?.hasUnassigned ?? false,
        stats: result?.stats ?? { totalFiles: 0, totalSize: 0 },
        configured: result?.configured ?? true,
        message: result?.message,
        error: result?.error,
        source: result?.source
      }
      
      setBrowseData(normalizedData)
      
      // Update cache (only for empty search)
      if (searchQuery === '') {
        browseCache = {
          data: normalizedData,
          timestamp: Date.now(),
          searchQuery: ''
        }
      }
    } catch (err: any) {
      console.error('Failed to load files:', err)
      setError(err.message || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [searchQuery, browseData])

  // Fetch on mount (uses cache if available)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      // Only fetch if we don't have cached data
      if (!browseData) {
        fetchData()
      }
    }
  }, [fetchData, browseData])
  
  // Debounced search
  useEffect(() => {
    if (searchQuery === '') {
      // When clearing search, restore from cache if available
      if (browseCache.data && Date.now() - browseCache.timestamp < CACHE_DURATION) {
        setBrowseData(browseCache.data)
        return
      }
    }
    const timer = setTimeout(() => {
      fetchData()
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, fetchData])
  
  // Download file from database
  const downloadFile = async (doc: DocumentItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    
    setDownloadingId(doc.id)
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const token = localStorage.getItem('apex-access-token') || localStorage.getItem('token') || ''
      const response = await fetch(`${apiUrl}/documents/${doc.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        throw new Error('Download failed')
      }
      const blob = await response.blob()
      
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
      toast.error('Failed to download file', err.message || 'Unknown error')
    } finally {
      setDownloadingId(null)
    }
  }

  // Select a matter to filter documents
  const selectMatter = (matterId: string | null) => {
    setSelectedMatterId(matterId)
    onFolderSelect?.(matterId || '')
  }
  
  // Create new folder
  const createFolder = async () => {
    if (!newFolderName.trim()) {
      setFolderError('Folder name is required')
      return
    }
    
    setCreatingFolder(true)
    setFolderError(null)
    
    try {
      await driveApi.createFolder({
        name: newFolderName.trim(),
        parentPath: selectedMatterId ? `matter-${selectedMatterId}` : '/',
        matterId: (selectedMatterId && selectedMatterId !== 'unassigned') ? selectedMatterId : undefined
      })
      
      setShowNewFolderModal(false)
      setNewFolderName('')
      invalidateFolderBrowserCache()
      fetchData(true)
    } catch (err: any) {
      setFolderError(err.message || 'Failed to create folder')
    } finally {
      setCreatingFolder(false)
    }
  }
  
  // Rename folder
  const renameFolder = async (folderId: string, newName: string) => {
    if (!newName.trim()) return
    
    try {
      await driveApi.renameFolder(folderId, newName.trim())
      setRenamingFolderId(null)
      setRenameValue('')
      invalidateFolderBrowserCache()
      fetchData(true)
    } catch (err: any) {
      console.error('Failed to rename folder:', err)
      toast.error('Failed to rename folder', err.message || 'Unknown error')
    }
  }
  
  // Delete folder
  const deleteFolder = async (folderId: string) => {
    if (!confirm('Are you sure you want to delete this folder? Files inside may become unassigned.')) {
      return
    }
    
    setDeletingFolderId(folderId)
    
    try {
      await driveApi.deleteFolder(folderId)
      invalidateFolderBrowserCache()
      fetchData(true)
    } catch (err: any) {
      console.error('Failed to delete folder:', err)
      toast.error('Failed to delete folder', err.message || 'Unknown error')
    } finally {
      setDeletingFolderId(null)
    }
  }
  
  // Handle drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set false if leaving the container
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    
    await uploadFiles(files)
  }
  
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    await uploadFiles(files)
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  const uploadFiles = async (files: File[]) => {
    setIsUploading(true)
    setUploadProgress({ current: 0, total: files.length })
    
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length })
        
        // Build metadata for upload
        const metadata: { matterId?: string } = {}
        
        // Add matter ID if we're in a matter folder
        if (selectedMatterId && selectedMatterId !== 'unassigned') {
          metadata.matterId = selectedMatterId
        }
        
        await documentsApi.upload(files[i], metadata)
      }
      
      invalidateFolderBrowserCache()
      fetchData(true)
    } catch (err: any) {
      console.error('Upload failed:', err)
      toast.error('Failed to upload file(s)', err.message || 'Unknown error')
    } finally {
      setIsUploading(false)
      setUploadProgress(null)
    }
  }
  
  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenuFolder(null)
    if (contextMenuFolder) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenuFolder])

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
  const formatSize = (bytes: number | string | null | undefined) => {
    const numBytes = Number(bytes)
    if (!numBytes || isNaN(numBytes)) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = numBytes
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  // Filter documents by selected matter
  const allCurrentDocuments = browseData?.files?.filter(f => {
    if (selectedMatterId === null) return true // All documents
    if (selectedMatterId === 'unassigned') return !f.matterId // No matter assigned
    return f.matterId === selectedMatterId // Specific matter
  }) || []
  
  // Paginate to prevent rendering too many items
  const totalPages = Math.ceil(allCurrentDocuments.length / pageSize)
  const currentDocuments = allCurrentDocuments.slice(
    currentPage * pageSize, 
    (currentPage + 1) * pageSize
  )

  // Get current matter name for breadcrumb
  const currentMatterName = selectedMatterId === 'unassigned' 
    ? 'Unassigned'
    : browseData?.matters?.find(m => m.id === selectedMatterId)?.name
  
  // Reset page when matter changes
  useEffect(() => {
    setCurrentPage(0)
  }, [selectedMatterId, searchQuery])

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
            <button 
              onClick={() => setShowNewFolderModal(true)} 
              className={styles.newFolderBtn}
              title="Create new folder"
            >
              <FolderPlus size={16} />
              New Folder
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className={styles.uploadBtn}
              title="Upload files"
              disabled={isUploading}
            >
              <Upload size={16} />
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
            <button onClick={() => fetchData(true)} className={styles.refreshBtn} title="Refresh">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      )}
      
      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      <div 
        ref={dropZoneRef}
        className={`${styles.content} ${isDragOver ? styles.dragOver : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className={styles.dragOverlay}>
            <Upload size={48} />
            <p>Drop files here to upload</p>
            {selectedMatterId && selectedMatterId !== 'unassigned' && (
              <span className={styles.dragHint}>
                Files will be added to the selected matter
              </span>
            )}
          </div>
        )}
        
        {/* Upload progress indicator */}
        {isUploading && uploadProgress && (
          <div className={styles.uploadProgress}>
            <Loader2 size={16} className={styles.spinner} />
            <span>Uploading {uploadProgress.current} of {uploadProgress.total}...</span>
          </div>
        )}
        {/* Matter Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span>Matters</span>
            {browseData?.stats && (
              <span className={styles.statsCount}>{browseData.stats.totalFiles} files</span>
            )}
          </div>
          <div className={styles.folderTree}>
            {/* All Documents */}
            <div 
              className={`${styles.folderRow} ${selectedMatterId === null ? styles.selected : ''}`}
              onClick={() => selectMatter(null)}
            >
              <Home size={16} className={styles.folderIcon} />
              <span className={styles.folderName}>All Documents</span>
            </div>
            
            {/* Matters with documents */}
            {browseData?.matters && browseData.matters.length > 0 && (
              <div className={styles.matterSection}>
                <div className={styles.sectionLabel}>Matters</div>
                {browseData.matters.map(matter => (
                  <div
                    key={matter.id}
                    className={`${styles.folderRow} ${selectedMatterId === matter.id ? styles.selected : ''}`}
                    onClick={() => selectMatter(matter.id)}
                    style={{ paddingLeft: '16px' }}
                  >
                    <Briefcase size={14} className={styles.folderIcon} />
                    <span className={styles.folderName} title={matter.name}>
                      {matter.caseNumber ? `${matter.caseNumber} - ` : ''}{matter.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Unassigned documents */}
            {browseData?.hasUnassigned && (
              <div 
                className={`${styles.folderRow} ${selectedMatterId === 'unassigned' ? styles.selected : ''}`}
                onClick={() => selectMatter('unassigned')}
                style={{ paddingLeft: '16px', marginTop: '8px' }}
              >
                <Folder size={14} className={styles.folderIcon} />
                <span className={styles.folderName}>Unassigned</span>
              </div>
            )}
          </div>
        </div>

        {/* Document List */}
        <div className={styles.main}>
          {/* Breadcrumb */}
          <div className={styles.breadcrumb}>
            <button onClick={() => selectMatter(null)} className={styles.breadcrumbItem}>
              <Home size={14} />
              <span>All Documents</span>
            </button>
            {currentMatterName && (
              <>
                <ChevronRight size={14} className={styles.breadcrumbSep} />
                <span className={styles.breadcrumbItem}>{currentMatterName}</span>
              </>
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
                  <th>Matter</th>
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
                          Upload documents to your matters to see them here
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
                          {doc.isOwned && (
                            <span className={styles.ownedBadge} title="You own this document">Owner</span>
                          )}
                          {doc.isShared && !doc.isOwned && (
                            <span className={styles.sharedBadge} title="Shared with you">Shared</span>
                          )}
                        </div>
                      </td>
                      <td className={styles.folderCell}>
                        {doc.matterName ? (
                          <button 
                            className={styles.folderLink}
                            onClick={(e) => { e.stopPropagation(); selectMatter(doc.matterId!); }}
                            title={doc.matterName}
                          >
                            {doc.matterNumber ? `${doc.matterNumber} - ` : ''}{doc.matterName}
                          </button>
                        ) : (
                          <span className={styles.rootFolder}>Unassigned</span>
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
              {browseData.stats.totalMatters && (
                <>
                  <span className={styles.divider}>•</span>
                  <span>{browseData.stats.totalMatters} matters</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className={styles.modalOverlay} onClick={() => setShowNewFolderModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>
                <FolderPlus size={20} />
                Create New Folder
              </h3>
              <button 
                className={styles.modalClose} 
                onClick={() => setShowNewFolderModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label>Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter folder name..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createFolder()
                    if (e.key === 'Escape') setShowNewFolderModal(false)
                  }}
                />
              </div>
              {selectedMatterId && selectedMatterId !== 'unassigned' && (
                <p className={styles.folderHint}>
                  This folder will be created inside the selected matter
                </p>
              )}
              {folderError && (
                <p className={styles.folderErrorMsg}>{folderError}</p>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button 
                className={styles.cancelBtn}
                onClick={() => setShowNewFolderModal(false)}
                disabled={creatingFolder}
              >
                Cancel
              </button>
              <button 
                className={styles.createBtn}
                onClick={createFolder}
                disabled={creatingFolder || !newFolderName.trim()}
              >
                {creatingFolder ? (
                  <>
                    <Loader2 size={14} className={styles.spinner} />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Create Folder
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Context Menu for folders */}
      {contextMenuFolder && (
        <div 
          className={styles.contextMenu}
          style={{ 
            position: 'fixed', 
            left: contextMenuFolder.x, 
            top: contextMenuFolder.y 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className={styles.contextMenuItem}
            onClick={() => {
              setRenamingFolderId(contextMenuFolder.id)
              setRenameValue(contextMenuFolder.name)
              setContextMenuFolder(null)
            }}
          >
            <Edit3 size={14} />
            Rename
          </button>
          <button 
            className={`${styles.contextMenuItem} ${styles.deleteItem}`}
            onClick={() => {
              deleteFolder(contextMenuFolder.id)
              setContextMenuFolder(null)
            }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default FolderBrowser
