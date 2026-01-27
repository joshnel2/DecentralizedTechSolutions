import { useState, useEffect, useCallback } from 'react'
import { 
  Folder, FolderOpen, FileText, ChevronRight,
  RefreshCw, Home, File, FileSpreadsheet, FileImage, 
  Loader2, AlertCircle, Download, Briefcase
} from 'lucide-react'
import { driveApi } from '../services/api'
import styles from './FolderBrowser.module.css'

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
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null) // null = all, 'unassigned' = no matter
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize] = useState(100) // Show 100 docs at a time
  const [currentPage, setCurrentPage] = useState(0)

  // Fetch documents from database
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await driveApi.browseAllFiles(searchQuery || undefined)
      // Ensure result has expected structure
      setBrowseData({
        isAdmin: result?.isAdmin ?? false,
        files: result?.files ?? [],
        matters: result?.matters ?? [],
        hasUnassigned: result?.hasUnassigned ?? false,
        stats: result?.stats ?? { totalFiles: 0, totalSize: 0 },
        configured: result?.configured ?? true,
        message: result?.message,
        error: result?.error,
        source: result?.source
      })
    } catch (err: any) {
      console.error('Failed to load files:', err)
      setError(err.message || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  // Fetch on mount
  useEffect(() => {
    fetchData()
  }, [fetchData])
  
  // Debounced search
  useEffect(() => {
    if (searchQuery === '') return // Skip initial/empty search
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
      alert('Failed to download file: ' + (err.message || 'Unknown error'))
    } finally {
      setDownloadingId(null)
    }
  }

  // Select a matter to filter documents
  const selectMatter = (matterId: string | null) => {
    setSelectedMatterId(matterId)
    onFolderSelect?.(matterId || '')
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
            <button onClick={fetchData} className={styles.refreshBtn} title="Refresh">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      )}

      <div className={styles.content}>
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
    </div>
  )
}

export default FolderBrowser
