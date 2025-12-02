import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAIStore } from '../stores/aiStore'
import { useAIChat } from '../contexts/AIChatContext'
import { 
  Plus, Search, FolderOpen, FileText, Upload, Grid, List,
  MoreVertical, Sparkles, Download, Trash2, Wand2, Eye, X, 
  Filter, ChevronDown, File, FileSpreadsheet, FileImage,
  Folder, Star, Clock, SortAsc, SortDesc, FolderPlus
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './DocumentsPage.module.css'

type FileType = 'all' | 'pdf' | 'document' | 'spreadsheet' | 'image' | 'other'
type SortOption = 'name' | 'date' | 'size' | 'type'

export function DocumentsPage() {
  const navigate = useNavigate()
  const { documents, matters, fetchDocuments, fetchMatters, addDocument } = useDataStore()
  const { setSelectedMode, setDocumentContext, createConversation } = useAIStore()
  const { openChat } = useAIChat()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  // Fetch data from API on mount
  useEffect(() => {
    fetchDocuments()
    fetchMatters()
  }, [fetchDocuments, fetchMatters])
  
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [selectedMatterId, setSelectedMatterId] = useState('')
  const [previewDoc, setPreviewDoc] = useState<typeof documents[0] | null>(null)
  const [fileTypeFilter, setFileTypeFilter] = useState<FileType>('all')
  const [sortBy, setSortBy] = useState<SortOption>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())

  // Get unique folders from documents (using matter names as folders)
  const folders = useMemo(() => {
    const folderMap = new Map<string, { id: string; name: string; count: number }>()
    documents.forEach(doc => {
      if (doc.matterId) {
        const matter = matters.find(m => m.id === doc.matterId)
        if (matter && !folderMap.has(doc.matterId)) {
          folderMap.set(doc.matterId, { id: doc.matterId, name: matter.name, count: 0 })
        }
        if (folderMap.has(doc.matterId)) {
          folderMap.get(doc.matterId)!.count++
        }
      }
    })
    return Array.from(folderMap.values())
  }, [documents, matters])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setPendingFiles(Array.from(files))
    setShowUploadModal(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleUploadConfirm = async () => {
    if (pendingFiles.length === 0) return
    
    setIsUploading(true)
    try {
      for (const file of pendingFiles) {
        await addDocument(file, { 
          matterId: selectedMatterId || currentFolder || undefined 
        })
      }
      fetchDocuments()
      setShowUploadModal(false)
      setPendingFiles([])
      setSelectedMatterId('')
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Failed to upload file. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const getFileType = (type: string): FileType => {
    if (type.includes('pdf')) return 'pdf'
    if (type.includes('word') || type.includes('document') || type.includes('text')) return 'document'
    if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return 'spreadsheet'
    if (type.includes('image')) return 'image'
    return 'other'
  }

  const filteredDocuments = useMemo(() => {
    let filtered = documents.filter(doc => {
      // Search filter
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase())
      
      // Folder filter
      const matchesFolder = !currentFolder || doc.matterId === currentFolder
      
      // Type filter
      let matchesType = true
      if (fileTypeFilter !== 'all') {
        matchesType = getFileType(doc.type) === fileTypeFilter
      }
      
      return matchesSearch && matchesFolder && matchesType
    })

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'date':
          comparison = new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
          break
        case 'size':
          comparison = b.size - a.size
          break
        case 'type':
          comparison = a.type.localeCompare(b.type)
          break
      }
      return sortOrder === 'asc' ? -comparison : comparison
    })

    return filtered
  }, [documents, searchQuery, currentFolder, fileTypeFilter, sortBy, sortOrder])

  const getMatterName = (matterId?: string) => 
    matterId ? matters.find(m => m.id === matterId)?.name : null

  const getFileIcon = (type: string) => {
    const fileType = getFileType(type)
    switch (fileType) {
      case 'pdf':
        return <FileText size={24} className={styles.pdfIcon} />
      case 'document':
        return <File size={24} className={styles.docIcon} />
      case 'spreadsheet':
        return <FileSpreadsheet size={24} className={styles.spreadsheetIcon} />
      case 'image':
        return <FileImage size={24} className={styles.imageIcon} />
      default:
        return <File size={24} className={styles.fileIcon} />
    }
  }

  const getFileEmoji = (type: string) => {
    const fileType = getFileType(type)
    switch (fileType) {
      case 'pdf':
        return '📄'
      case 'document':
        return '📝'
      case 'spreadsheet':
        return '📊'
      case 'image':
        return '🖼️'
      default:
        return '📁'
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  const analyzeDocument = async (doc: typeof documents[0]) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const response = await fetch(`${apiUrl}/documents/${doc.id}/content`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`
        }
      })
      
      let content = ''
      if (response.ok) {
        const data = await response.json()
        content = data.content || `[Document: ${doc.name}]\nNo text content extracted.`
      } else {
        content = `[Document: ${doc.name}]\nType: ${doc.type}\nSize: ${formatFileSize(doc.size)}\n\nDocument loaded for analysis.`
      }
      
      setSelectedMode('document')
      setDocumentContext({
        id: doc.id,
        name: doc.name,
        content: content,
        type: doc.type,
        size: doc.size
      })
      createConversation('document')
      navigate('/app/ai')
    } catch (error) {
      console.error('Failed to load document:', error)
      setSelectedMode('document')
      setDocumentContext({
        id: doc.id,
        name: doc.name,
        content: `[Document: ${doc.name}]\nType: ${doc.type}\nSize: ${formatFileSize(doc.size)}`,
        type: doc.type,
        size: doc.size
      })
      createConversation('document')
      navigate('/app/ai')
    }
  }

  const getDocumentUrl = (doc: typeof documents[0]) => {
    return `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/documents/${doc.id}/download`
  }

  const canPreview = (type: string) => {
    return type.includes('pdf') || type.includes('image')
  }

  const toggleDocSelection = (docId: string) => {
    const newSelected = new Set(selectedDocs)
    if (newSelected.has(docId)) {
      newSelected.delete(docId)
    } else {
      newSelected.add(docId)
    }
    setSelectedDocs(newSelected)
  }

  return (
    <div className={styles.documentsPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Documents</h1>
          <span className={styles.count}>{documents.length} files</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.aiBtn} onClick={() => openChat()}>
            <Sparkles size={16} />
            AI Insights
          </button>
          <button 
            className={styles.automationBtn}
            onClick={() => navigate('/app/settings/documents')}
          >
            <Wand2 size={18} />
            Automation
          </button>
          <button 
            className={styles.primaryBtn} 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload size={18} />
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.toolbarRight}>
          {/* Type Filter */}
          <div className={styles.filterDropdown}>
            <button 
              className={styles.filterBtn}
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            >
              <Filter size={16} />
              {fileTypeFilter === 'all' ? 'All Types' : fileTypeFilter}
              <ChevronDown size={14} />
            </button>
            {showFilterDropdown && (
              <div className={styles.dropdown}>
                <button 
                  className={clsx(styles.dropdownItem, fileTypeFilter === 'all' && styles.active)}
                  onClick={() => { setFileTypeFilter('all'); setShowFilterDropdown(false) }}
                >
                  All Types
                </button>
                <button 
                  className={clsx(styles.dropdownItem, fileTypeFilter === 'pdf' && styles.active)}
                  onClick={() => { setFileTypeFilter('pdf'); setShowFilterDropdown(false) }}
                >
                  📄 PDF
                </button>
                <button 
                  className={clsx(styles.dropdownItem, fileTypeFilter === 'document' && styles.active)}
                  onClick={() => { setFileTypeFilter('document'); setShowFilterDropdown(false) }}
                >
                  📝 Documents
                </button>
                <button 
                  className={clsx(styles.dropdownItem, fileTypeFilter === 'spreadsheet' && styles.active)}
                  onClick={() => { setFileTypeFilter('spreadsheet'); setShowFilterDropdown(false) }}
                >
                  📊 Spreadsheets
                </button>
                <button 
                  className={clsx(styles.dropdownItem, fileTypeFilter === 'image' && styles.active)}
                  onClick={() => { setFileTypeFilter('image'); setShowFilterDropdown(false) }}
                >
                  🖼️ Images
                </button>
              </div>
            )}
          </div>

          {/* Sort Options */}
          <div className={styles.sortOptions}>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={styles.sortSelect}
            >
              <option value="date">Date</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="type">Type</option>
            </select>
            <button 
              className={styles.sortOrderBtn}
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />}
            </button>
          </div>

          {/* View Toggle */}
          <div className={styles.viewToggle}>
            <button 
              className={clsx(viewMode === 'grid' && styles.active)}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={18} />
            </button>
            <button 
              className={clsx(viewMode === 'list' && styles.active)}
              onClick={() => setViewMode('list')}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      {currentFolder && (
        <div className={styles.breadcrumb}>
          <button onClick={() => setCurrentFolder(null)}>
            <FolderOpen size={16} />
            All Documents
          </button>
          <span className={styles.breadcrumbSeparator}>/</span>
          <span className={styles.breadcrumbCurrent}>
            <Folder size={16} />
            {getMatterName(currentFolder)}
          </span>
        </div>
      )}

      {/* Main Content Area */}
      <div className={styles.mainContent}>
        {/* Folders Section - Only show when not in a folder */}
        {!currentFolder && folders.length > 0 && (
          <div className={styles.foldersSection}>
            <h3>
              <Folder size={18} />
              Matter Folders
            </h3>
            <div className={styles.foldersGrid}>
              {folders.map(folder => (
                <button 
                  key={folder.id}
                  className={styles.folderCard}
                  onClick={() => setCurrentFolder(folder.id)}
                >
                  <div className={styles.folderIcon}>
                    <Folder size={32} />
                  </div>
                  <div className={styles.folderInfo}>
                    <span className={styles.folderName}>{folder.name}</span>
                    <span className={styles.folderCount}>{folder.count} files</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Files Section */}
        <div className={styles.filesSection}>
          <div className={styles.filesSectionHeader}>
            <h3>
              <FileText size={18} />
              {currentFolder ? 'Files' : 'Recent Files'}
            </h3>
            <span className={styles.fileCount}>{filteredDocuments.length} files</span>
          </div>

          {viewMode === 'grid' ? (
            <div className={styles.documentsGrid}>
              {filteredDocuments.map(doc => (
                <div 
                  key={doc.id} 
                  className={clsx(styles.fileCard, selectedDocs.has(doc.id) && styles.selected)}
                  onClick={() => setPreviewDoc(doc)}
                >
                  <div className={styles.fileCardPreview}>
                    <span className={styles.fileEmoji}>{getFileEmoji(doc.type)}</span>
                  </div>
                  <div className={styles.fileCardContent}>
                    <span className={styles.fileName} title={doc.name}>{doc.name}</span>
                    <div className={styles.fileMeta}>
                      <span>{formatFileSize(doc.size)}</span>
                      <span>•</span>
                      <span>{format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}</span>
                    </div>
                    {getMatterName(doc.matterId) && !currentFolder && (
                      <span className={styles.fileMatter}>
                        <Folder size={12} />
                        {getMatterName(doc.matterId)}
                      </span>
                    )}
                  </div>
                  <div className={styles.fileCardActions}>
                    <button 
                      className={styles.actionBtn}
                      onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc) }}
                      title="Preview"
                    >
                      <Eye size={14} />
                    </button>
                    <button 
                      className={styles.aiActionBtn}
                      onClick={(e) => { e.stopPropagation(); analyzeDocument(doc) }}
                      title="AI Analyze"
                    >
                      <Sparkles size={14} />
                    </button>
                    <button 
                      className={styles.actionBtn}
                      onClick={(e) => { 
                        e.stopPropagation()
                        window.open(getDocumentUrl(doc), '_blank')
                      }}
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.documentsTable}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Matter</th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map(doc => (
                    <tr key={doc.id} onClick={() => setPreviewDoc(doc)}>
                      <td>
                        <div className={styles.nameCell}>
                          <span className={styles.fileEmoji}>{getFileEmoji(doc.type)}</span>
                          <span>{doc.name}</span>
                        </div>
                      </td>
                      <td>
                        {getMatterName(doc.matterId) ? (
                          <span className={styles.matterTag}>
                            <Folder size={12} />
                            {getMatterName(doc.matterId)}
                          </span>
                        ) : '-'}
                      </td>
                      <td>{formatFileSize(doc.size)}</td>
                      <td>{format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc) }}
                            title="Preview"
                          >
                            <Eye size={16} />
                          </button>
                          <button 
                            className={styles.aiActionBtn}
                            onClick={(e) => { e.stopPropagation(); analyzeDocument(doc) }}
                            title="AI Analyze"
                          >
                            <Sparkles size={14} />
                          </button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation()
                              window.open(getDocumentUrl(doc), '_blank')
                            }}
                            title="Download"
                          >
                            <Download size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {filteredDocuments.length === 0 && (
        <div className={styles.emptyState}>
          <FolderOpen size={64} />
          <h3>No documents found</h3>
          <p>{searchQuery || fileTypeFilter !== 'all' ? 'Try adjusting your filters' : 'Upload your first document to get started'}</p>
          {!searchQuery && fileTypeFilter === 'all' && (
            <button 
              className={styles.primaryBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={18} />
              Upload Document
            </button>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className={styles.modalOverlay} onClick={() => setShowUploadModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Upload Documents</h2>
              <button onClick={() => setShowUploadModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <div className={styles.modalForm}>
              <div className={styles.fileList}>
                {pendingFiles.map((file, i) => (
                  <div key={i} className={styles.fileItem}>
                    <span className={styles.fileEmoji}>{getFileEmoji(file.type)}</span>
                    <span>{file.name}</span>
                    <span className={styles.fileSize}>({formatFileSize(file.size)})</span>
                  </div>
                ))}
              </div>
              
              <div className={styles.formGroup}>
                <label>Add to Matter Folder (optional)</label>
                <select
                  value={selectedMatterId}
                  onChange={(e) => setSelectedMatterId(e.target.value)}
                >
                  <option value="">No folder selected</option>
                  {matters.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.modalActions}>
                <button 
                  type="button" 
                  onClick={() => setShowUploadModal(false)} 
                  className={styles.cancelBtn}
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUploadConfirm} 
                  className={styles.saveBtn}
                  disabled={isUploading}
                >
                  {isUploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className={styles.previewModal} onClick={() => setPreviewDoc(null)}>
          <div className={styles.previewContainer} onClick={e => e.stopPropagation()}>
            <div className={styles.previewHeader}>
              <div className={styles.previewTitle}>
                <span className={styles.previewEmoji}>{getFileEmoji(previewDoc.type)}</span>
                <span>{previewDoc.name}</span>
              </div>
              <div className={styles.previewActions}>
                <button 
                  className={styles.aiBtn}
                  onClick={() => {
                    analyzeDocument(previewDoc)
                    setPreviewDoc(null)
                  }}
                >
                  <Sparkles size={16} />
                  AI Analyze
                </button>
                <a 
                  href={getDocumentUrl(previewDoc)}
                  download={previewDoc.name}
                  className={styles.downloadBtn}
                >
                  <Download size={16} />
                  Download
                </a>
                <button className={styles.closePreviewBtn} onClick={() => setPreviewDoc(null)}>
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className={styles.previewContent}>
              {canPreview(previewDoc.type) ? (
                <iframe 
                  src={getDocumentUrl(previewDoc)}
                  title={previewDoc.name}
                  className={styles.previewFrame}
                />
              ) : (
                <div className={styles.noPreview}>
                  <span className={styles.bigEmoji}>{getFileEmoji(previewDoc.type)}</span>
                  <h3>{previewDoc.name}</h3>
                  <div className={styles.previewMeta}>
                    <span>{previewDoc.type}</span>
                    <span>•</span>
                    <span>{formatFileSize(previewDoc.size)}</span>
                    <span>•</span>
                    <span>{format(parseISO(previewDoc.uploadedAt), 'MMMM d, yyyy')}</span>
                  </div>
                  {getMatterName(previewDoc.matterId) && (
                    <div className={styles.previewFolder}>
                      <Folder size={14} />
                      {getMatterName(previewDoc.matterId)}
                    </div>
                  )}
                  <p className={styles.noPreviewHint}>Preview not available for this file type</p>
                  <div className={styles.previewBtns}>
                    <a 
                      href={getDocumentUrl(previewDoc)}
                      download={previewDoc.name}
                      className={styles.downloadBtnLarge}
                    >
                      <Download size={18} />
                      Download to View
                    </a>
                    <button 
                      className={styles.aiBtnLarge}
                      onClick={() => {
                        analyzeDocument(previewDoc)
                        setPreviewDoc(null)
                      }}
                    >
                      <Sparkles size={18} />
                      Analyze with AI
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
