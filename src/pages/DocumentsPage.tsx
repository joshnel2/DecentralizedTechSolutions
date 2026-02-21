import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAIStore } from '../stores/aiStore'
import { useAuthStore } from '../stores/authStore'
import { useAIChat } from '../contexts/AIChatContext'
import { 
  Search, FolderOpen, FileText, Upload,
  Sparkles, Download, Trash2, X, Loader2,
  FileSearch, Scale, AlertTriangle, List, MessageSquare,
  Edit3, Clock,
  Share2, Shield, Users, CheckSquare, Square,
  LayoutGrid, Folder, ChevronRight, ChevronDown,
  Star, Lock, Briefcase,
  Image, FileSpreadsheet, File
} from 'lucide-react'
import { FolderBrowser, invalidateFolderBrowserCache } from '../components/FolderBrowser'
import { wordOnlineApi } from '../services/api'
import { useEmailCompose } from '../contexts/EmailComposeContext'
import { parseISO, formatDistanceToNow } from 'date-fns'
import styles from './DocumentsPage.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { ShareDocumentModal } from '../components/ShareDocumentModal'
import { DocumentVersionPanel } from '../components/DocumentVersionPanel'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useToast } from '../components/Toast'
import { clsx } from 'clsx'

// Document categories for filtering
type DocumentCategory = 'all' | 'my-uploads' | 'shared' | 'matter' | 'recent' | 'favorites'

// AI suggestion prompts for document analysis
const _AI_SUGGESTIONS = [
  { icon: FileSearch, label: 'Summarize', prompt: 'Please provide a concise summary of this document, highlighting the key points and main takeaways.' },
  { icon: Scale, label: 'Legal Analysis', prompt: 'Analyze this document from a legal perspective. Identify any legal issues, risks, or important clauses.' },
  { icon: AlertTriangle, label: 'Find Risks', prompt: 'Review this document and identify any potential risks, red flags, or areas of concern.' },
  { icon: List, label: 'Extract Key Terms', prompt: 'Extract and list all the key terms, definitions, and important provisions from this document.' },
  { icon: MessageSquare, label: 'Ask Questions', prompt: '' },
]

// File type icon mapping
const getFileIcon = (type: string, name: string) => {
  const ext = name?.split('.').pop()?.toLowerCase() || ''
  
  if (type?.includes('pdf') || ext === 'pdf') return { icon: FileText, color: '#EF4444' }
  if (type?.includes('word') || ['doc', 'docx', 'odt', 'rtf'].includes(ext)) return { icon: FileText, color: '#2563EB' }
  if (type?.includes('spreadsheet') || type?.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) return { icon: FileSpreadsheet, color: '#22C55E' }
  if (type?.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return { icon: Image, color: '#A855F7' }
  if (type?.includes('presentation') || ['ppt', 'pptx'].includes(ext)) return { icon: FileText, color: '#F97316' }
  return { icon: File, color: '#64748B' }
}

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function DocumentsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { documents, matters, fetchDocuments, fetchMatters, addDocument, deleteDocument, documentsLoading: _documentsLoading, mattersLoading: _mattersLoading } = useDataStore()
  const { setSelectedMode, setDocumentContext, createConversation, setInitialMessage } = useAIStore()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  const { openChat: _openChat } = useAIChat()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // State
  const [isUploading, setIsUploading] = useState(false)
  const [_isExtracting, setIsExtracting] = useState(false)
  const [_isOpeningWord, setIsOpeningWord] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<DocumentCategory>('all')
  const [expandedMatters, setExpandedMatters] = useState<Set<string>>(new Set())
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [selectedMatterId, setSelectedMatterId] = useState('')
  const [versionPanelDoc, setVersionPanelDoc] = useState<typeof documents[0] | null>(null)
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false)
  const [isBulkDownloading, setIsBulkDownloading] = useState(false)
  const [viewMode, setViewMode] = useState<'categories' | 'folders'>(() => {
    const saved = localStorage.getItem('documentsViewMode')
    return (saved === 'categories' || saved === 'folders') ? saved : 'categories'
  })
  
  // Modal states
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; docId: string; docName: string }>({ isOpen: false, docId: '', docName: '' })
  const [shareModal, setShareModal] = useState<{ isOpen: boolean; documentId: string; documentName: string }>({ isOpen: false, documentId: '', documentName: '' })
  
  // Email compose
  const { emailDocument } = useEmailCompose()
  
  // Save view mode preference
  useEffect(() => {
    localStorage.setItem('documentsViewMode', viewMode)
  }, [viewMode])
  
  // Fetch data on mount
  useEffect(() => {
    fetchDocuments()
    fetchMatters()
  }, [fetchDocuments, fetchMatters])

  // Categorize documents
  const categorizedDocs = useMemo(() => {
    const userId = user?.id
    const query = searchQuery.toLowerCase()
    
    // Filter by search query first
    const searchFiltered = documents.filter(doc =>
      (doc.originalName || doc.name).toLowerCase().includes(query) ||
      doc.name.toLowerCase().includes(query)
    )
    
    // My uploads - documents uploaded by current user
    const myUploads = searchFiltered.filter(doc => doc.uploadedBy === userId)
    
    // Shared with me - documents explicitly shared (check for any sharing metadata)
    const sharedWithMe = searchFiltered.filter(doc => 
      (doc as any).sharedWith?.includes(userId) || 
      (doc as any).permissions?.some((p: any) => p.userId === userId) ||
      (doc as any).isSharedWithMe
    )
    
    // Matter documents - the backend already filters by permission, so any doc with a matterId
    // that's in our documents list is one the user has access to
    const matterDocs = searchFiltered.filter(doc => doc.matterId)
    
    // Recent - last 30 days, sorted by date
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentDocs = searchFiltered
      .filter(doc => doc.uploadedAt && new Date(doc.uploadedAt) > thirtyDaysAgo)
      .sort((a, b) => new Date(b.uploadedAt!).getTime() - new Date(a.uploadedAt!).getTime())
    
    // Favorites - marked as favorite
    const favorites = searchFiltered.filter(doc => (doc as any).isFavorite)
    
    // Group matter docs by matter
    const byMatter = new Map<string, typeof documents>()
    matterDocs.forEach(doc => {
      if (doc.matterId) {
        const existing = byMatter.get(doc.matterId) || []
        existing.push(doc)
        byMatter.set(doc.matterId, existing)
      }
    })
    
    return {
      all: searchFiltered,
      myUploads,
      sharedWithMe,
      matterDocs,
      byMatter,
      recentDocs,
      favorites,
      counts: {
        all: searchFiltered.length,
        myUploads: myUploads.length,
        shared: sharedWithMe.length,
        matter: matterDocs.length,
        recent: recentDocs.length,
        favorites: favorites.length
      }
    }
  }, [documents, matters, user, searchQuery])

  // Get documents for current category
  const displayedDocuments = useMemo(() => {
    switch (activeCategory) {
      case 'my-uploads': return categorizedDocs.myUploads
      case 'shared': return categorizedDocs.sharedWithMe
      case 'matter': return categorizedDocs.matterDocs
      case 'recent': return categorizedDocs.recentDocs
      case 'favorites': return categorizedDocs.favorites
      default: return categorizedDocs.all
    }
  }, [activeCategory, categorizedDocs])

  // Toggle matter expansion
  const toggleMatter = (matterId: string) => {
    setExpandedMatters(prev => {
      const next = new Set(prev)
      if (next.has(matterId)) {
        next.delete(matterId)
      } else {
        next.add(matterId)
      }
      return next
    })
  }

  // Download document
  const downloadDocument = async (doc: typeof documents[0], e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
    const token = localStorage.getItem('apex-access-token') || localStorage.getItem('token') || ''
    try {
      const response = await fetch(`${apiUrl}/documents/${doc.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = doc.originalName || doc.name
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        toast.error('Failed to download document')
      }
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to download document')
    }
  }

  // Edit in Word
  const editInWord = async (doc: typeof documents[0], preferDesktop = true, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    
    const wordExtensions = ['.doc', '.docx', '.odt', '.rtf']
    const docName = doc.originalName || doc.name
    const isWordDoc = wordExtensions.some(ext => docName.toLowerCase().endsWith(ext))
    
    if (!isWordDoc) {
      toast.warning('Word editing is only available for Word documents (.doc, .docx)')
      return
    }

    setIsOpeningWord(true)
    try {
      if (preferDesktop) {
        const result = await wordOnlineApi.openDesktop(doc.id)
        if (result.desktopUrl) {
          window.open(result.desktopUrl, '_blank')
        } else if (result.webUrl) {
          window.open(result.webUrl, '_blank')
        } else {
          downloadDocument(doc)
        }
      } else {
        const result = await wordOnlineApi.openDocument(doc.id)
        if (result.editUrl) {
          window.open(result.editUrl, '_blank')
        } else {
          downloadDocument(doc)
        }
      }
    } catch (error) {
      console.error('Failed to open Word:', error)
      downloadDocument(doc)
    } finally {
      setIsOpeningWord(false)
    }
  }

  // Delete document
  const handleDeleteDocument = (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const doc = documents.find(d => d.id === docId)
    setConfirmModal({ isOpen: true, docId, docName: doc?.name || 'this document' })
  }

  const confirmDeleteDocument = async () => {
    try {
      await deleteDocument(confirmModal.docId)
      setConfirmModal({ isOpen: false, docId: '', docName: '' })
      setVersionPanelDoc(null)
      invalidateFolderBrowserCache()
      fetchDocuments()
    } catch (error) {
      console.error('Failed to delete document:', error)
      toast.error('Failed to delete document')
    }
  }

  // Share document
  const handleShareDocument = (doc: typeof documents[0], e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setShareModal({ isOpen: true, documentId: doc.id, documentName: doc.name })
  }

  // File upload
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setPendingFiles(Array.from(files))
    setShowUploadModal(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUploadConfirm = async () => {
    if (pendingFiles.length === 0) return
    setIsUploading(true)
    try {
      for (const file of pendingFiles) {
        await addDocument(file, { matterId: selectedMatterId || undefined })
      }
      invalidateFolderBrowserCache()
      fetchDocuments()
      setShowUploadModal(false)
      setPendingFiles([])
      setSelectedMatterId('')
      toast.success(`Uploaded ${pendingFiles.length} file(s)`)
    } catch (error) {
      console.error('Upload failed:', error)
      toast.error('Failed to upload file')
    } finally {
      setIsUploading(false)
    }
  }

  // Bulk actions
  const toggleSelectDoc = (docId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedDocIds.size === displayedDocuments.length) {
      setSelectedDocIds(new Set())
    } else {
      setSelectedDocIds(new Set(displayedDocuments.map(d => d.id)))
    }
  }

  const clearSelection = () => setSelectedDocIds(new Set())

  const bulkDownload = async () => {
    if (selectedDocIds.size === 0) return
    setIsBulkDownloading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const token = localStorage.getItem('apex-access-token') || ''
      
      if (selectedDocIds.size === 1) {
        const docId = Array.from(selectedDocIds)[0]
        const doc = documents.find(d => d.id === docId)
        await downloadDocument(doc!)
      } else {
        const response = await fetch(`${apiUrl}/documents/bulk-download`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentIds: Array.from(selectedDocIds) })
        })
        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `documents-${new Date().toISOString().split('T')[0]}.zip`
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
        }
      }
    } catch (error) {
      toast.error('Failed to download documents')
    } finally {
      setIsBulkDownloading(false)
    }
  }

  const confirmBulkDelete = async () => {
    if (selectedDocIds.size === 0) return
    setIsBulkDeleting(true)
    try {
      await Promise.all(Array.from(selectedDocIds).map(id => deleteDocument(id)))
      setBulkDeleteModal(false)
      setSelectedDocIds(new Set())
      setVersionPanelDoc(null)
      invalidateFolderBrowserCache()
      fetchDocuments()
    } catch (error) {
      toast.error('Failed to delete some documents')
    } finally {
      setIsBulkDeleting(false)
    }
  }

  // AI analysis
  const openAIWithDocument = async (doc: typeof documents[0], prompt?: string) => {
    setIsExtracting(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const token = localStorage.getItem('apex-access-token') || ''
      
      let extractedContent = ''
      try {
        const contentResponse = await fetch(`${apiUrl}/documents/${doc.id}/content`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (contentResponse.ok) {
          const data = await contentResponse.json()
          if (data.content?.trim().length > 50) extractedContent = data.content
        }
      } catch { /* ignore */ }
      
      if (!extractedContent) {
        extractedContent = `[Document: ${doc.name}]\nType: ${doc.type}\nSize: ${formatFileSize(doc.size)}\n\nUnable to extract text content.`
      }
      
      setSelectedMode('document')
      setDocumentContext({ id: doc.id, name: doc.name, content: extractedContent, type: doc.type, size: doc.size })
      if (prompt && setInitialMessage) setInitialMessage(prompt)
      createConversation('document')
      setVersionPanelDoc(null)
      navigate('/app/ai')
    } catch (error) {
      toast.error('Failed to analyze document')
    } finally {
      setIsExtracting(false)
    }
  }

  // Get matter name
  const getMatterName = (matterId?: string) => 
    matterId ? matters.find(m => m.id === matterId)?.name : null

  // Document card component
  const DocumentCard = ({ doc, showMatter = true }: { doc: typeof documents[0], showMatter?: boolean }) => {
    const iconInfo = getFileIcon(doc.type, doc.originalName || doc.name)
    const IconComponent = iconInfo.icon
    const isSelected = selectedDocIds.has(doc.id)
    const isPanelOpen = versionPanelDoc?.id === doc.id
    const wordExtensions = ['.doc', '.docx', '.odt', '.rtf']
    const isWordDoc = wordExtensions.some(ext => (doc.originalName || doc.name).toLowerCase().endsWith(ext))
    
    return (
      <div 
        className={clsx(
          styles.documentCard,
          isSelected && styles.cardSelected,
          isPanelOpen && styles.cardActive
        )}
        onClick={() => setVersionPanelDoc(doc)}
      >
        <div className={styles.cardCheckbox} onClick={(e) => toggleSelectDoc(doc.id, e)}>
          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
        </div>
        
        <div className={styles.cardIcon} style={{ backgroundColor: `${iconInfo.color}15`, color: iconInfo.color }}>
          <IconComponent size={24} />
        </div>
        
        <div className={styles.cardContent}>
          <div className={styles.cardName}>
            {doc.originalName || doc.name}
            {doc.isConfidential && <Lock size={12} className={styles.confidentialIcon} />}
          </div>
          <div className={styles.cardMeta}>
            {showMatter && doc.matterId && (
              <span className={styles.cardMatter}>
                <Briefcase size={12} />
                {getMatterName(doc.matterId)}
              </span>
            )}
            <span className={styles.cardSize}>{formatFileSize(doc.size)}</span>
            <span className={styles.cardDate}>
              {doc.uploadedAt ? formatDistanceToNow(parseISO(doc.uploadedAt), { addSuffix: true }) : ''}
            </span>
          </div>
        </div>
        
        <div className={styles.cardActions}>
          {isWordDoc && (
            <button 
              className={styles.cardAction}
              onClick={(e) => editInWord(doc, true, e)}
              title="Edit in Word"
            >
              <Edit3 size={16} />
            </button>
          )}
          <button 
            className={styles.cardAction}
            onClick={(e) => { e.stopPropagation(); openAIWithDocument(doc) }}
            title="Analyze with AI"
          >
            <Sparkles size={16} />
          </button>
          <button 
            className={styles.cardAction}
            onClick={(e) => handleShareDocument(doc, e)}
            title="Share"
          >
            <Share2 size={16} />
          </button>
          <button 
            className={styles.cardAction}
            onClick={(e) => downloadDocument(doc, e)}
            title="Download"
          >
            <Download size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.documentsPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Documents</h1>
          <span className={styles.count}></span>
        </div>
        <div className={styles.headerActions}>
          {selectedDocIds.size > 0 ? (
            <>
              <button className={styles.bulkBtn} onClick={bulkDownload} disabled={isBulkDownloading}>
                {isBulkDownloading ? <Loader2 size={18} className={styles.spin} /> : <Download size={18} />}
                Download ({selectedDocIds.size})
              </button>
              <button className={styles.bulkBtnDanger} onClick={() => setBulkDeleteModal(true)} disabled={isBulkDeleting}>
                <Trash2 size={18} />
                Delete ({selectedDocIds.size})
              </button>
              <button className={styles.textBtn} onClick={clearSelection}>
                <X size={18} />
                Clear
              </button>
            </>
          ) : (
            <>
              <div className={styles.viewToggle}>
                <button
                  className={clsx(styles.viewBtn, viewMode === 'categories' && styles.viewBtnActive)}
                  onClick={() => setViewMode('categories')}
                  title="Category view"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  className={clsx(styles.viewBtn, viewMode === 'folders' && styles.viewBtnActive)}
                  onClick={() => setViewMode('folders')}
                  title="Folder view"
                >
                  <Folder size={16} />
                </button>
              </div>
              {isAdmin && (
                <button className={styles.secondaryBtn} onClick={() => navigate('/app/documents/permissions')}>
                  <Shield size={18} />
                  Permissions
                </button>
              )}
              <button className={styles.primaryBtn} onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                <Upload size={18} />
                {isUploading ? 'Uploading...' : 'Upload'}
              </button>
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
            </>
          )}
        </div>
      </div>

      {/* Category View */}
      {viewMode === 'categories' && (
        <div className={styles.categoryLayout}>
          {/* Sidebar */}
          <div className={styles.sidebar}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <nav className={styles.categoryNav}>
              <button 
                className={clsx(styles.categoryBtn, activeCategory === 'all' && styles.categoryActive)}
                onClick={() => setActiveCategory('all')}
              >
                <FolderOpen size={18} />
                <span>All Documents</span>
                <span className={styles.categoryCount}>{categorizedDocs.counts.all}</span>
              </button>
              
              <button 
                className={clsx(styles.categoryBtn, activeCategory === 'recent' && styles.categoryActive)}
                onClick={() => setActiveCategory('recent')}
              >
                <Clock size={18} />
                <span>Recent</span>
                <span className={styles.categoryCount}>{categorizedDocs.counts.recent}</span>
              </button>
              
              <button 
                className={clsx(styles.categoryBtn, activeCategory === 'my-uploads' && styles.categoryActive)}
                onClick={() => setActiveCategory('my-uploads')}
              >
                <Upload size={18} />
                <span>My Uploads</span>
                <span className={styles.categoryCount}>{categorizedDocs.counts.myUploads}</span>
              </button>
              
              <button 
                className={clsx(styles.categoryBtn, activeCategory === 'shared' && styles.categoryActive)}
                onClick={() => setActiveCategory('shared')}
              >
                <Users size={18} />
                <span>Shared With Me</span>
                <span className={styles.categoryCount}>{categorizedDocs.counts.shared}</span>
              </button>
              
              <button 
                className={clsx(styles.categoryBtn, activeCategory === 'matter' && styles.categoryActive)}
                onClick={() => setActiveCategory('matter')}
              >
                <Briefcase size={18} />
                <span>Matter Documents</span>
                <span className={styles.categoryCount}>{categorizedDocs.counts.matter}</span>
              </button>
              
              <button 
                className={clsx(styles.categoryBtn, activeCategory === 'favorites' && styles.categoryActive)}
                onClick={() => setActiveCategory('favorites')}
              >
                <Star size={18} />
                <span>Favorites</span>
                <span className={styles.categoryCount}>{categorizedDocs.counts.favorites}</span>
              </button>
            </nav>
            
            {/* Quick Stats */}
            <div className={styles.quickStats}>
              <h4>Storage</h4>
              <div className={styles.storageBar}>
                <div className={styles.storageUsed} style={{ width: '35%' }} />
              </div>
              <span className={styles.storageText}>3.5 GB of 10 GB used</span>
            </div>
          </div>
          
          {/* Main Content */}
          <div className={styles.mainContent}>
            {/* Category Header */}
            <div className={styles.categoryHeader}>
              <h2>
                {activeCategory === 'all' && 'All Documents'}
                {activeCategory === 'recent' && 'Recent Documents'}
                {activeCategory === 'my-uploads' && 'My Uploads'}
                {activeCategory === 'shared' && 'Shared With Me'}
                {activeCategory === 'matter' && 'Matter Documents'}
                {activeCategory === 'favorites' && 'Favorites'}
              </h2>
              {displayedDocuments.length > 0 && (
                <button className={styles.selectAllBtn} onClick={toggleSelectAll}>
                  {selectedDocIds.size === displayedDocuments.length ? <CheckSquare size={16} /> : <Square size={16} />}
                  {selectedDocIds.size === displayedDocuments.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
            
            {/* Document Grid/List */}
            {activeCategory === 'matter' ? (
              // Matter-organized view
              <div className={styles.matterList}>
                {Array.from(categorizedDocs.byMatter.entries()).map(([matterId, docs]) => {
                  const matter = matters.find(m => m.id === matterId)
                  const isExpanded = expandedMatters.has(matterId)
                  
                  return (
                    <div key={matterId} className={styles.matterGroup}>
                      <button 
                        className={styles.matterHeader}
                        onClick={() => toggleMatter(matterId)}
                      >
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        <Briefcase size={18} />
                        <span className={styles.matterName}>{matter?.name || 'Unknown Matter'}</span>
                        <span className={styles.matterDocCount}>{docs.length} docs</span>
                      </button>
                      
                      {isExpanded && (
                        <div className={styles.matterDocs}>
                          {docs.map(doc => (
                            <DocumentCard key={doc.id} doc={doc} showMatter={false} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {categorizedDocs.byMatter.size === 0 && (
                  <div className={styles.emptyState}>
                    <Briefcase size={48} />
                    <h3>No Matter Documents</h3>
                    <p>Documents from your assigned matters will appear here.</p>
                  </div>
                )}
              </div>
            ) : (
              // Standard card view
              <div className={styles.documentGrid}>
                {displayedDocuments.map(doc => (
                  <DocumentCard key={doc.id} doc={doc} />
                ))}
                {displayedDocuments.length === 0 && (
                  <div className={styles.emptyState}>
                    <FileText size={48} />
                    <h3>No Documents</h3>
                    <p>
                      {activeCategory === 'my-uploads' && 'Documents you upload will appear here.'}
                      {activeCategory === 'shared' && 'Documents shared with you will appear here.'}
                      {activeCategory === 'favorites' && 'Star documents to add them to favorites.'}
                      {activeCategory === 'recent' && 'Recently accessed documents will appear here.'}
                      {activeCategory === 'all' && 'Upload your first document to get started.'}
                    </p>
                    <button className={styles.emptyUploadBtn} onClick={() => fileInputRef.current?.click()}>
                      <Upload size={18} />
                      Upload Document
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Document Details Panel */}
          {versionPanelDoc && (
            <div className={styles.detailsPanel}>
              <DocumentVersionPanel
                document={versionPanelDoc}
                onClose={() => setVersionPanelDoc(null)}
                onOpenInWord={(preferDesktop) => editInWord(versionPanelDoc, preferDesktop)}
                onDownload={() => downloadDocument(versionPanelDoc)}
                onDelete={() => handleDeleteDocument(versionPanelDoc.id)}
                onShare={() => handleShareDocument(versionPanelDoc)}
                onAnalyze={() => openAIWithDocument(versionPanelDoc)}
                onEmail={() => emailDocument({ id: versionPanelDoc.id, name: versionPanelDoc.name, size: versionPanelDoc.size })}
              />
            </div>
          )}
        </div>
      )}

      {/* Folder View */}
      {viewMode === 'folders' && (
        <ErrorBoundary>
          <FolderBrowser
            showHeader={false}
            className={styles.folderBrowser}
            onDocumentSelect={(doc) => {
              const fullDoc = documents.find(d => d.id === doc.id)
              if (fullDoc) setVersionPanelDoc(fullDoc)
              else setVersionPanelDoc(doc as any)
            }}
            selectedDocumentId={versionPanelDoc?.id}
          />
        </ErrorBoundary>
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
                    <FileText size={16} />
                    <span>{file.name}</span>
                    <span className={styles.fileSize}>({formatFileSize(file.size)})</span>
                  </div>
                ))}
              </div>
              
              <div className={styles.formGroup}>
                <label>Attach to Matter (optional)</label>
                <select value={selectedMatterId} onChange={(e) => setSelectedMatterId(e.target.value)}>
                  <option value="">No matter selected</option>
                  {matters.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.modalActions}>
                <button onClick={() => setShowUploadModal(false)} className={styles.cancelBtn} disabled={isUploading}>
                  Cancel
                </button>
                <button onClick={handleUploadConfirm} className={styles.saveBtn} disabled={isUploading}>
                  {isUploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title="Delete Document"
        message={`Are you sure you want to delete "${confirmModal.docName}"? This action cannot be undone.`}
        confirmText="Delete"
        onConfirm={confirmDeleteDocument}
        onClose={() => setConfirmModal({ isOpen: false, docId: '', docName: '' })}
        type="danger"
      />

      {/* Bulk Delete Modal */}
      <ConfirmationModal
        isOpen={bulkDeleteModal}
        title="Delete Documents"
        message={`Are you sure you want to delete ${selectedDocIds.size} document(s)? This action cannot be undone.`}
        confirmText="Delete All"
        onConfirm={confirmBulkDelete}
        onClose={() => setBulkDeleteModal(false)}
        type="danger"
        isLoading={isBulkDeleting}
      />

      {/* Share Modal */}
      <ShareDocumentModal
        isOpen={shareModal.isOpen}
        onClose={() => setShareModal({ isOpen: false, documentId: '', documentName: '' })}
        documentId={shareModal.documentId}
        documentName={shareModal.documentName}
      />
    </div>
  )
}
