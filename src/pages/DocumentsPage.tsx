import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAIStore } from '../stores/aiStore'
import { useAIChat } from '../contexts/AIChatContext'
import { 
  Plus, Search, FolderOpen, FileText, Upload, Grid, List,
  MoreVertical, Sparkles, Download, Trash2, Eye, X,
  Folder, FolderPlus, ChevronRight, Home, Filter, Calendar,
  File, FileImage, FileSpreadsheet, FileCode, Star, StarOff,
  SortAsc, SortDesc, Clock
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './DocumentsPage.module.css'

// Virtual folder structure
const virtualFolders = [
  { id: 'all', name: 'All Documents', icon: FolderOpen },
  { id: 'recent', name: 'Recent', icon: Clock },
  { id: 'starred', name: 'Starred', icon: Star },
  { id: 'contracts', name: 'Contracts', icon: Folder },
  { id: 'pleadings', name: 'Pleadings', icon: Folder },
  { id: 'correspondence', name: 'Correspondence', icon: Folder },
  { id: 'discovery', name: 'Discovery', icon: Folder },
  { id: 'evidence', name: 'Evidence', icon: Folder },
]

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
  const [activeFolder, setActiveFolder] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [matterFilter, setMatterFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [starredDocs, setStarredDocs] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('starredDocs')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })
  const [showFilters, setShowFilters] = useState(false)

  // Save starred docs to localStorage
  useEffect(() => {
    localStorage.setItem('starredDocs', JSON.stringify([...starredDocs]))
  }, [starredDocs])

  const toggleStar = (docId: string) => {
    setStarredDocs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(docId)) {
        newSet.delete(docId)
      } else {
        newSet.add(docId)
      }
      return newSet
    })
  }

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
          matterId: selectedMatterId || undefined 
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

  const filteredDocuments = useMemo(() => {
    let filtered = [...documents]
    
    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(doc =>
        doc.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    // Folder filter
    if (activeFolder === 'starred') {
      filtered = filtered.filter(doc => starredDocs.has(doc.id))
    } else if (activeFolder === 'recent') {
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      filtered = filtered.filter(doc => new Date(doc.uploadedAt).getTime() > oneWeekAgo)
    } else if (activeFolder !== 'all') {
      // Filter by document category based on name/type
      filtered = filtered.filter(doc => {
        const name = doc.name.toLowerCase()
        switch (activeFolder) {
          case 'contracts': return name.includes('contract') || name.includes('agreement')
          case 'pleadings': return name.includes('pleading') || name.includes('motion') || name.includes('complaint')
          case 'correspondence': return name.includes('letter') || name.includes('email')
          case 'discovery': return name.includes('discovery') || name.includes('interrogator')
          case 'evidence': return name.includes('exhibit') || name.includes('evidence')
          default: return true
        }
      })
    }
    
    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(doc => {
        const type = doc.type.toLowerCase()
        switch (typeFilter) {
          case 'pdf': return type.includes('pdf')
          case 'doc': return type.includes('word') || type.includes('document')
          case 'image': return type.includes('image')
          case 'spreadsheet': return type.includes('spreadsheet') || type.includes('excel')
          default: return true
        }
      })
    }
    
    // Matter filter
    if (matterFilter !== 'all') {
      filtered = filtered.filter(doc => doc.matterId === matterFilter)
    }
    
    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'date':
          comparison = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
          break
        case 'size':
          comparison = a.size - b.size
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
    
    return filtered
  }, [documents, searchQuery, activeFolder, typeFilter, matterFilter, sortBy, sortOrder, starredDocs])

  const getMatterName = (matterId?: string) => 
    matterId ? matters.find(m => m.id === matterId)?.name : null

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <FileText size={24} className={styles.pdfIcon} />
    if (type.includes('word') || type.includes('document')) return <FileText size={24} className={styles.docIcon} />
    if (type.includes('spreadsheet') || type.includes('excel')) return <FileSpreadsheet size={24} className={styles.sheetIcon} />
    if (type.includes('image')) return <FileImage size={24} className={styles.imageIcon} />
    if (type.includes('code') || type.includes('json')) return <FileCode size={24} className={styles.codeIcon} />
    return <File size={24} className={styles.fileIcon} />
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

  return (
    <div className={styles.documentsPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Documents</h1>
          <span className={styles.count}>{documents.length} files</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.aiBtn} onClick={openChat}>
            <Sparkles size={16} />
            AI Insights
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

      {/* Main Layout */}
      <div className={styles.mainLayout}>
        {/* Sidebar - Folders */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <FolderPlus size={18} />
            <span>Folders</span>
          </div>
          <nav className={styles.folderNav}>
            {virtualFolders.map(folder => (
              <button
                key={folder.id}
                className={clsx(styles.folderItem, activeFolder === folder.id && styles.active)}
                onClick={() => setActiveFolder(folder.id)}
              >
                <folder.icon size={18} />
                <span>{folder.name}</span>
                {folder.id === 'starred' && starredDocs.size > 0 && (
                  <span className={styles.folderCount}>{starredDocs.size}</span>
                )}
              </button>
            ))}
          </nav>
          
          {/* Matter Folders */}
          <div className={styles.sidebarSection}>
            <div className={styles.sidebarHeader}>
              <Folder size={18} />
              <span>By Matter</span>
            </div>
            <div className={styles.matterFolders}>
              {matters.slice(0, 5).map(matter => {
                const docCount = documents.filter(d => d.matterId === matter.id).length
                return (
                  <button
                    key={matter.id}
                    className={clsx(styles.folderItem, styles.matterFolder, matterFilter === matter.id && styles.active)}
                    onClick={() => {
                      setMatterFilter(matterFilter === matter.id ? 'all' : matter.id)
                      setActiveFolder('all')
                    }}
                  >
                    <Folder size={16} />
                    <span>{matter.name}</span>
                    <span className={styles.folderCount}>{docCount}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={styles.mainContent}>
          {/* Breadcrumb */}
          <div className={styles.breadcrumb}>
            <button onClick={() => { setActiveFolder('all'); setMatterFilter('all') }}>
              <Home size={16} />
            </button>
            <ChevronRight size={14} />
            <span>{virtualFolders.find(f => f.id === activeFolder)?.name || 'All Documents'}</span>
            {matterFilter !== 'all' && (
              <>
                <ChevronRight size={14} />
                <span>{getMatterName(matterFilter)}</span>
              </>
            )}
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
              {searchQuery && (
                <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
                  <X size={16} />
                </button>
              )}
            </div>

            <div className={styles.toolbarRight}>
              <button 
                className={clsx(styles.filterBtn, showFilters && styles.active)}
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter size={16} />
                Filters
              </button>
              
              <div className={styles.sortSelect}>
                <select 
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [by, order] = e.target.value.split('-')
                    setSortBy(by as any)
                    setSortOrder(order as any)
                  }}
                >
                  <option value="date-desc">Newest First</option>
                  <option value="date-asc">Oldest First</option>
                  <option value="name-asc">Name A-Z</option>
                  <option value="name-desc">Name Z-A</option>
                  <option value="size-desc">Largest First</option>
                  <option value="size-asc">Smallest First</option>
                </select>
              </div>
              
              <div className={styles.viewToggle}>
                <button 
                  className={clsx(viewMode === 'grid' && styles.active)}
                  onClick={() => setViewMode('grid')}
                  title="Grid View"
                >
                  <Grid size={18} />
                </button>
                <button 
                  className={clsx(viewMode === 'list' && styles.active)}
                  onClick={() => setViewMode('list')}
                  title="List View"
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className={styles.filterPanel}>
              <div className={styles.filterGroup}>
                <label>File Type</label>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">All Types</option>
                  <option value="pdf">PDF</option>
                  <option value="doc">Word Documents</option>
                  <option value="spreadsheet">Spreadsheets</option>
                  <option value="image">Images</option>
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Matter</label>
                <select value={matterFilter} onChange={(e) => setMatterFilter(e.target.value)}>
                  <option value="all">All Matters</option>
                  {matters.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <button className={styles.clearFilters} onClick={() => {
                setTypeFilter('all')
                setMatterFilter('all')
                setSearchQuery('')
              }}>
                Clear All
              </button>
            </div>
          )}

          {/* Results Info */}
          <div className={styles.resultsInfo}>
            <span>{filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}</span>
          </div>

          {/* Documents Grid/List */}
          {viewMode === 'grid' ? (
            <div className={styles.documentsGrid}>
              {filteredDocuments.map(doc => (
                <div key={doc.id} className={styles.docCard}>
                  <div 
                    className={styles.docPreview}
                    onClick={() => setPreviewDoc(doc)}
                  >
                    {getFileIcon(doc.type)}
                  </div>
                  <button 
                    className={clsx(styles.starBtn, starredDocs.has(doc.id) && styles.starred)}
                    onClick={() => toggleStar(doc.id)}
                  >
                    {starredDocs.has(doc.id) ? <Star size={16} /> : <StarOff size={16} />}
                  </button>
                  <div className={styles.docInfo}>
                    <span className={styles.docName} title={doc.name}>{doc.name}</span>
                    <span className={styles.docMeta}>
                      {formatFileSize(doc.size)} • {format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}
                    </span>
                    {getMatterName(doc.matterId) && (
                      <span className={styles.docMatter}>{getMatterName(doc.matterId)}</span>
                    )}
                  </div>
                  <div className={styles.docActions}>
                    <button 
                      className={styles.actionBtn}
                      onClick={() => setPreviewDoc(doc)}
                      title="Preview"
                    >
                      <Eye size={14} />
                    </button>
                    <button 
                      className={clsx(styles.actionBtn, styles.aiAction)}
                      onClick={() => analyzeDocument(doc)}
                      title="AI Analyze"
                    >
                      <Sparkles size={14} />
                    </button>
                    <a 
                      href={getDocumentUrl(doc)}
                      download={doc.name}
                      className={styles.actionBtn}
                      title="Download"
                    >
                      <Download size={14} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.documentsTable}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Name</th>
                    <th>Matter</th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <button 
                          className={clsx(styles.starBtnSmall, starredDocs.has(doc.id) && styles.starred)}
                          onClick={() => toggleStar(doc.id)}
                        >
                          {starredDocs.has(doc.id) ? <Star size={14} /> : <StarOff size={14} />}
                        </button>
                      </td>
                      <td>
                        <div className={styles.nameCell}>
                          {getFileIcon(doc.type)}
                          <span>{doc.name}</span>
                        </div>
                      </td>
                      <td>{getMatterName(doc.matterId) || '—'}</td>
                      <td>{formatFileSize(doc.size)}</td>
                      <td>{format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button onClick={() => setPreviewDoc(doc)} title="Preview">
                            <Eye size={16} />
                          </button>
                          <button 
                            className={styles.aiAction}
                            onClick={() => analyzeDocument(doc)}
                            title="AI Analyze"
                          >
                            <Sparkles size={14} />
                          </button>
                          <a href={getDocumentUrl(doc)} download={doc.name} title="Download">
                            <Download size={16} />
                          </a>
                          <button title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredDocuments.length === 0 && (
            <div className={styles.emptyState}>
              <FolderOpen size={64} />
              <h3>No documents found</h3>
              <p>
                {searchQuery || typeFilter !== 'all' || matterFilter !== 'all' 
                  ? 'Try adjusting your search or filters'
                  : 'Upload your first document to get started'}
              </p>
              {!searchQuery && typeFilter === 'all' && matterFilter === 'all' && (
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
        </main>
      </div>

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
                    <FileText size={16} />
                    <span>{file.name}</span>
                    <span className={styles.fileSize}>({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                ))}
              </div>
              
              <div className={styles.formGroup}>
                <label>Attach to Matter (optional)</label>
                <select
                  value={selectedMatterId}
                  onChange={(e) => setSelectedMatterId(e.target.value)}
                >
                  <option value="">No matter selected</option>
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
                {getFileIcon(previewDoc.type)}
                <span>{previewDoc.name}</span>
              </div>
              <div className={styles.previewActions}>
                <button 
                  className={styles.aiAnalyzeBtn}
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
                  <div className={styles.bigIcon}>{getFileIcon(previewDoc.type)}</div>
                  <h3>{previewDoc.name}</h3>
                  <p>{previewDoc.type} • {formatFileSize(previewDoc.size)}</p>
                  <p className={styles.noPreviewHint}>Preview not available for this file type</p>
                  <a 
                    href={getDocumentUrl(previewDoc)}
                    download={previewDoc.name}
                    className={styles.downloadBtnLarge}
                  >
                    <Download size={18} />
                    Download to View
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
