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
  Eye, ExternalLink, Wand2, History, GitCompare, Lock, Edit3,
  HardDrive, Settings, Share2, Shield, Mail, Users, CheckSquare, Square,
  LayoutGrid, LayoutList, Folder
} from 'lucide-react'
import { FolderBrowser, invalidateFolderBrowserCache } from '../components/FolderBrowser'
import { documentsApi, driveApi, wordOnlineApi } from '../services/api'
import { useEmailCompose } from '../contexts/EmailComposeContext'
import { format, parseISO } from 'date-fns'
import styles from './DocumentsPage.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { ShareDocumentModal } from '../components/ShareDocumentModal'
import { DocumentVersionPanel } from '../components/DocumentVersionPanel'
import { parseDocument } from '../utils/documentParser'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useToast } from '../components/Toast'

// AI suggestion prompts for document analysis
const AI_SUGGESTIONS = [
  { icon: FileSearch, label: 'Summarize', prompt: 'Please provide a concise summary of this document, highlighting the key points and main takeaways.' },
  { icon: Scale, label: 'Legal Analysis', prompt: 'Analyze this document from a legal perspective. Identify any legal issues, risks, or important clauses.' },
  { icon: AlertTriangle, label: 'Find Risks', prompt: 'Review this document and identify any potential risks, red flags, or areas of concern.' },
  { icon: List, label: 'Extract Key Terms', prompt: 'Extract and list all the key terms, definitions, and important provisions from this document.' },
  { icon: MessageSquare, label: 'Ask Questions', prompt: '' },
]

export function DocumentsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { documents, matters, fetchDocuments, fetchMatters, addDocument, deleteDocument, documentsLoading, mattersLoading } = useDataStore()
  const { setSelectedMode, setDocumentContext, createConversation, setInitialMessage } = useAIStore()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  const { openChat } = useAIChat()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isOpeningWord, setIsOpeningWord] = useState(false)
  
  // View mode: 'list' (classic table) or 'folders' (Clio-style folder browser)
  const [viewMode, setViewMode] = useState<'list' | 'folders'>(() => {
    // Default to folders view for better Clio-style experience
    const saved = localStorage.getItem('documentsViewMode')
    return (saved === 'list' || saved === 'folders') ? saved : 'folders'
  })
  
  // Save view mode preference
  useEffect(() => {
    localStorage.setItem('documentsViewMode', viewMode)
  }, [viewMode])
  
  // Fetch data from API on mount (uses cache if available, preventing reload on every navigation)
  useEffect(() => {
    // These calls will use cached data if available and not stale (5 min cache)
    fetchDocuments()
    fetchMatters()
  }, [fetchDocuments, fetchMatters])
  
  // Open document in Word (Desktop or Online)
  const editInWord = async (doc: typeof documents[0], preferDesktop = true, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    
    // Check if it's a Word document
    const wordExtensions = ['.doc', '.docx', '.odt', '.rtf']
    const docName = doc.originalName || doc.name
    const isWordDoc = wordExtensions.some(ext => docName.toLowerCase().endsWith(ext))
    
    if (!isWordDoc) {
      toast.warning('Word editing is only available for Word documents (.doc, .docx)')
      return
    }

    setIsOpeningWord(true)
    try {
      // Try to open in desktop Word first (preferred for lawyers)
      if (preferDesktop) {
        const result = await wordOnlineApi.openDesktop(doc.id)
        
        if (result.desktopUrl) {
          // Try to open using ms-word: protocol (opens in desktop Word)
          // Create a hidden iframe to try the protocol without navigating away
          const iframe = document.createElement('iframe')
          iframe.style.display = 'none'
          document.body.appendChild(iframe)
          
          // Set a timeout to detect if the protocol handler didn't work
          const timeoutId = setTimeout(() => {
            document.body.removeChild(iframe)
            setIsOpeningWord(false)
            // Protocol didn't work - offer alternatives
            const choice = confirm(
              'Could not open Microsoft Word automatically.\n\n' +
              'Options:\n' +
              '• Click OK to open in Word Online (browser)\n' +
              '• Click Cancel to download the file\n\n' +
              'Tip: Make sure Microsoft Office is installed on your computer.'
            )
            if (choice && result.webUrl) {
              window.open(result.webUrl, '_blank')
            } else {
              downloadDocument(doc)
            }
          }, 2000)
          
          // Try to open the protocol
          try {
            iframe.contentWindow!.location.href = result.desktopUrl
            // If we get here without error, the protocol might be working
            setTimeout(() => {
              clearTimeout(timeoutId)
              try { document.body.removeChild(iframe) } catch { /* ignore cleanup errors */ }
              setIsOpeningWord(false)
            }, 3000)
          } catch (e) {
            // Protocol blocked - clear timeout and offer alternatives immediately
            clearTimeout(timeoutId)
            try { document.body.removeChild(iframe) } catch { /* ignore cleanup errors */ }
            setIsOpeningWord(false)
            if (result.webUrl) {
              window.open(result.webUrl, '_blank')
            } else {
              downloadDocument(doc)
            }
          }
          return
        } else if (result.needsMicrosoftAuth) {
          // Microsoft not connected - offer to download instead
          const confirmed = confirm(
            'Microsoft is not connected. Would you like to download the document to edit locally?\n\n' +
            'Tip: Connect Microsoft in Settings → Integrations for seamless editing.'
          )
          if (confirmed) {
            downloadDocument(doc)
          }
          return
        } else if (result.downloadUrl) {
          // Desktop upload failed but we can still download
          const confirmed = confirm(
            'Could not sync to OneDrive. Would you like to download and edit locally?\n\n' +
            'After editing, upload the file back to save your changes.'
          )
          if (confirmed) {
            downloadDocument(doc)
          }
          return
        }
      }
      
      // Fallback to Word Online
      const result = await wordOnlineApi.openDocument(doc.id)
      
      if (result.editUrl) {
        // Open Word Online in new tab
        window.open(result.editUrl, '_blank')
      } else if (result.desktopUrl) {
        // Try desktop Word URL in new window
        window.open(result.desktopUrl, '_blank')
      } else if (result.fallback === 'desktop' || result.downloadUrl || result.needsMicrosoftAuth) {
        // Fallback to downloading
        const confirmed = confirm(
          'Would you like to download the document to edit locally?'
        )
        if (confirmed) {
          downloadDocument(doc)
        }
      } else {
        // Only show error if we truly couldn't do anything
        console.error('Open in Word failed:', result.message)
        const confirmed = confirm(
          'Could not open in Word. Would you like to download instead?'
        )
        if (confirmed) {
          downloadDocument(doc)
        }
      }
    } catch (error: any) {
      console.error('Failed to open Word:', error)
      // Don't show alert for network/API errors - just offer download
      const confirmed = confirm(
        'Could not connect to Word service. Would you like to download the document instead?'
      )
      if (confirmed) {
        downloadDocument(doc)
      }
    } finally {
      setIsOpeningWord(false)
    }
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
        console.error('Download failed:', response.status, response.statusText)
        toast.error('Failed to download document', 'Please try again.')
      }
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to download document', 'Please try again.')
    }
  }
  
  // Delete document
  const handleDeleteDocument = (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const doc = documents.find(d => d.id === docId)
    setConfirmModal({
      isOpen: true,
      docId,
      docName: doc?.name || 'this document'
    })
  }

  const confirmDeleteDocument = async () => {
    try {
      await deleteDocument(confirmModal.docId)
      setConfirmModal({ isOpen: false, docId: '', docName: '' })
      setVersionPanelDoc(null)
      invalidateFolderBrowserCache() // Invalidate folder view cache
      fetchDocuments()
    } catch (error) {
      console.error('Failed to delete document:', error)
      toast.error('Failed to delete document')
    }
  }

  // Bulk selection handlers
  const lastSelectedIndex = useRef<number | null>(null)
  const [isBulkDownloading, setIsBulkDownloading] = useState(false)
  
  const toggleSelectDoc = (docId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const currentIndex = filteredDocuments.findIndex(d => d.id === docId)
    
    // Shift+click for range selection
    if (e.shiftKey && lastSelectedIndex.current !== null && currentIndex !== -1) {
      const start = Math.min(lastSelectedIndex.current, currentIndex)
      const end = Math.max(lastSelectedIndex.current, currentIndex)
      const rangeIds = filteredDocuments.slice(start, end + 1).map(d => d.id)
      
      setSelectedDocIds(prev => {
        const newSet = new Set(prev)
        rangeIds.forEach(id => newSet.add(id))
        return newSet
      })
    } else {
      // Normal toggle
      setSelectedDocIds(prev => {
        const newSet = new Set(prev)
        if (newSet.has(docId)) {
          newSet.delete(docId)
        } else {
          newSet.add(docId)
        }
        return newSet
      })
      lastSelectedIndex.current = currentIndex
    }
  }

  const toggleSelectAll = () => {
    if (selectedDocIds.size === filteredDocuments.length) {
      setSelectedDocIds(new Set())
    } else {
      setSelectedDocIds(new Set(filteredDocuments.map(d => d.id)))
    }
  }

  const clearSelection = () => {
    setSelectedDocIds(new Set())
    lastSelectedIndex.current = null
  }

  const confirmBulkDelete = async () => {
    if (selectedDocIds.size === 0) return
    
    setIsBulkDeleting(true)
    try {
      // Delete each selected document
      const deletePromises = Array.from(selectedDocIds).map(id => deleteDocument(id))
      await Promise.all(deletePromises)
      
      setBulkDeleteModal(false)
      setSelectedDocIds(new Set())
      setVersionPanelDoc(null)
      invalidateFolderBrowserCache() // Invalidate folder view cache
      fetchDocuments()
    } catch (error) {
      console.error('Failed to delete documents:', error)
      toast.error('Failed to delete some documents', 'Please try again.')
    } finally {
      setIsBulkDeleting(false)
    }
  }
  
  // Bulk download selected documents
  const bulkDownload = async () => {
    if (selectedDocIds.size === 0) return
    
    setIsBulkDownloading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const token = localStorage.getItem('apex-access-token') || localStorage.getItem('token') || ''
      
      // If single document, download directly
      if (selectedDocIds.size === 1) {
        const docId = Array.from(selectedDocIds)[0]
        const doc = documents.find(d => d.id === docId)
        const response = await fetch(`${apiUrl}/documents/${docId}/download`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = doc?.originalName || doc?.name || 'document'
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        // Multiple documents - download as zip
        const response = await fetch(`${apiUrl}/documents/bulk-download`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ documentIds: Array.from(selectedDocIds) })
        })
        
        if (!response.ok) {
          throw new Error('Failed to create download')
        }
        
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
    } catch (error) {
      console.error('Bulk download failed:', error)
      toast.error('Failed to download documents', 'Please try again.')
    } finally {
      setIsBulkDownloading(false)
    }
  }
  
  // Open AI with document context and optional prompt
  const openAIWithDocument = async (doc: typeof documents[0], prompt?: string) => {
    setIsExtracting(true)
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const token = localStorage.getItem('apex-access-token') || localStorage.getItem('token') || ''
      
      let extractedContent = ''
      
      // Try server-side content extraction first
      try {
        const contentResponse = await fetch(`${apiUrl}/documents/${doc.id}/content`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        
        if (contentResponse.ok) {
          const data = await contentResponse.json()
          if (data.content && data.content.trim().length > 50) {
            extractedContent = data.content
          }
        }
      } catch (e) {
        console.log('Server content extraction not available, trying client-side')
      }
      
      // If server didn't return content, download and extract client-side
      if (!extractedContent) {
        try {
          const downloadResponse = await fetch(`${apiUrl}/documents/${doc.id}/download`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          
          if (downloadResponse.ok) {
            const blob = await downloadResponse.blob()
            const fileType = doc.type || blob.type || 'application/octet-stream'
            const file = new File([blob], doc.name, { type: fileType })
            const parseResult = await parseDocument(file)
            extractedContent = parseResult.content
          }
        } catch (e) {
          console.error('Failed to download document for extraction:', e)
        }
      }
      
      // If we still don't have content, provide a fallback message
      if (!extractedContent) {
        extractedContent = `[Document: ${doc.name}]\nType: ${doc.type}\nSize: ${formatFileSize(doc.size)}\n\nUnable to extract text content. The document may be an image or scanned PDF.`
      }
      
      // Set up AI context
      setSelectedMode('document')
      setDocumentContext({
        id: doc.id,
        name: doc.name,
        content: extractedContent,
        type: doc.type,
        size: doc.size
      })
      
      // Set initial message if prompt provided
      if (prompt && setInitialMessage) {
        setInitialMessage(prompt)
      }
      
      createConversation('document')
      setVersionPanelDoc(null)
      navigate('/app/ai')
      
    } catch (error) {
      console.error('Failed to extract document:', error)
      toast.error('Failed to analyze document', 'Please try again.')
    } finally {
      setIsExtracting(false)
    }
  }
  
  const [searchQuery, setSearchQuery] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [selectedMatterId, setSelectedMatterId] = useState('')
  
  // Version history panel state - shows on right side when document clicked
  const [versionPanelDoc, setVersionPanelDoc] = useState<typeof documents[0] | null>(null)
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    docId: string
    docName: string
  }>({ isOpen: false, docId: '', docName: '' })

  // Bulk selection state
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false)

  // Share modal state
  const [shareModal, setShareModal] = useState<{
    isOpen: boolean
    documentId: string
    documentName: string
  }>({ isOpen: false, documentId: '', documentName: '' })

  // Email compose (global)
  const { emailDocument } = useEmailCompose()

  // Open email with document attached
  const openEmailWithDocument = (doc: typeof documents[0]) => {
    emailDocument({
      id: doc.id,
      name: doc.name,
      size: doc.size
    })
    setVersionPanelDoc(null)
  }

  // Document viewer state (preview only - no editing)
  const [editorDoc, setEditorDoc] = useState<typeof documents[0] | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [isLoadingContent, setIsLoadingContent] = useState(false)

  // Open document preview
  const openDocumentViewer = async (doc: typeof documents[0]) => {
    setEditorDoc(doc)
    setIsLoadingContent(true)
    
    try {
      const response = await documentsApi.getContent(doc.id)
      const content = response.content || response.text || ''
      setEditorContent(content)
    } catch (error) {
      console.error('Failed to load document content:', error)
      setEditorContent('[Unable to load document content. The document may be in a format that cannot be displayed as text.]')
    } finally {
      setIsLoadingContent(false)
    }
  }

  // Close preview
  const closeEditor = () => {
    setEditorDoc(null)
    setEditorContent('')
  }
  
  // Open file on computer (download and open)
  const openFileOnComputer = async (doc: typeof documents[0]) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
    const token = localStorage.getItem('apex-access-token') || localStorage.getItem('token') || ''
    
    try {
      const response = await fetch(`${apiUrl}/documents/${doc.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        
        // Open in new tab (browser will either display or download based on file type)
        window.open(url, '_blank')
        
        // Clean up after a delay
        setTimeout(() => window.URL.revokeObjectURL(url), 10000)
      } else {
        toast.error('Failed to open file', 'Please try downloading instead.')
      }
    } catch (error) {
      console.error('Open file error:', error)
      toast.error('Failed to open file')
    }
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
      invalidateFolderBrowserCache() // Invalidate folder view cache
      fetchDocuments()
      setShowUploadModal(false)
      setPendingFiles([])
      setSelectedMatterId('')
    } catch (error) {
      console.error('Upload failed:', error)
      toast.error('Failed to upload file', 'Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return documents.filter(doc =>
      (doc.originalName || doc.name).toLowerCase().includes(query) ||
      doc.name.toLowerCase().includes(query)
    ).sort((a, b) => {
      const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
      const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
      return dateB - dateA
    })
  }, [documents, searchQuery])

  const getMatterName = (matterId?: string) => 
    matterId ? matters.find(m => m.id === matterId)?.name : null

  const getFileIcon = (type: string) => {
    if (type?.includes('pdf')) return '📄'
    if (type?.includes('word') || type?.includes('document')) return '📝'
    if (type?.includes('spreadsheet') || type?.includes('excel')) return '📊'
    if (type?.includes('image')) return '🖼️'
    return '📁'
  }

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  return (
    <div className={styles.documentsPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Documents</h1>
          {viewMode === 'list' && (
            <span className={styles.count}>{documents.length} files</span>
          )}
          {viewMode === 'folders' && (
            <span className={styles.count}>Apex Drive</span>
          )}
          {selectedDocIds.size > 0 && (
            <span className={styles.selectedCount}>
              {selectedDocIds.size} selected
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          {/* Bulk actions when items selected */}
          {selectedDocIds.size > 0 && (
            <>
              <button 
                className={styles.bulkDownloadBtn}
                onClick={bulkDownload}
                disabled={isBulkDownloading}
                title={`Download ${selectedDocIds.size} documents`}
              >
                {isBulkDownloading ? <Loader2 size={18} className={styles.spinner} /> : <Download size={18} />}
                Download{selectedDocIds.size > 1 ? ' as ZIP' : ''}
              </button>
              <button 
                className={styles.bulkDeleteBtn}
                onClick={() => setBulkDeleteModal(true)}
                disabled={isBulkDeleting}
                title={`Delete ${selectedDocIds.size} documents`}
              >
                <Trash2 size={18} />
                Delete ({selectedDocIds.size})
              </button>
              <button 
                className={styles.clearSelectionBtn}
                onClick={clearSelection}
                title="Clear selection"
              >
                <X size={18} />
                Clear
              </button>
            </>
          )}
          {/* View Mode Toggle */}
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewToggleBtn} ${viewMode === 'folders' ? styles.activeView : ''}`}
              onClick={() => setViewMode('folders')}
              title="Folder view (Clio-style)"
            >
              <Folder size={16} />
            </button>
            <button
              className={`${styles.viewToggleBtn} ${viewMode === 'list' ? styles.activeView : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <LayoutList size={16} />
            </button>
          </div>

          {/* Admin-only buttons */}
          {isAdmin && selectedDocIds.size === 0 && (
            <>
              <button 
                className={styles.driveBtn}
                onClick={() => navigate('/app/settings/drives')}
                title="Apex Drive settings"
              >
                <HardDrive size={18} />
                Apex Drive
              </button>
              <button 
                className={styles.permissionsBtn}
                onClick={() => navigate('/app/documents/permissions')}
                title="Manage folder permissions"
              >
                <Shield size={18} />
                Permissions
              </button>
              <button 
                className={styles.automationBtn}
                onClick={() => navigate('/app/settings/documents')}
              >
                <Wand2 size={18} />
                Automation
              </button>
            </>
          )}
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
          />
        </div>
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

      {/* Folder Browser View - Documents organized by Matter */}
      {viewMode === 'folders' && (
        <ErrorBoundary>
          <FolderBrowser
            showHeader={false}
            className={styles.folderBrowser}
            onDocumentSelect={(doc) => {
              // Try to find the full document in the main documents array
              const fullDoc = documents.find(d => d.id === doc.id)
              if (fullDoc) {
                setVersionPanelDoc(fullDoc)
              } else {
                // Create a compatible document object for display
                setVersionPanelDoc({
                  id: doc.id,
                  name: doc.name || 'Unknown',
                  originalName: doc.originalName,
                  type: doc.contentType || 'application/octet-stream',
                  size: doc.size || 0,
                  uploadedAt: doc.uploadedAt || new Date().toISOString(),
                  uploadedBy: '',
                  version: 1,
                  tags: [],
                  isConfidential: false,
                  matterId: doc.matterId,
                  matterName: doc.matterName,
                } as any)
              }
            }}
            selectedDocumentId={versionPanelDoc?.id}
          />
        </ErrorBoundary>
      )}

      {/* List View (Classic table) */}
      {viewMode === 'list' && (
        <>
      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.documentsTable}>
        <table>
          <thead>
            <tr>
              <th className={styles.checkboxCol}>
                <button 
                  className={styles.selectAllBtn}
                  onClick={toggleSelectAll}
                  title={selectedDocIds.size === filteredDocuments.length ? 'Deselect all' : 'Select all'}
                >
                  {selectedDocIds.size === filteredDocuments.length && filteredDocuments.length > 0 ? (
                    <CheckSquare size={18} />
                  ) : selectedDocIds.size > 0 ? (
                    <Square size={18} className={styles.partialSelect} />
                  ) : (
                    <Square size={18} />
                  )}
                </button>
              </th>
              <th>Name</th>
              <th>Matter</th>
              <th>Size</th>
              <th>Version</th>
              <th>Last Modified</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map(doc => {
              const wordExtensions = ['.doc', '.docx', '.odt', '.rtf']
              const docName = doc.originalName || doc.name
              const isWordDoc = wordExtensions.some(ext => docName.toLowerCase().endsWith(ext))
              const isRowSelected = versionPanelDoc?.id === doc.id
              const isChecked = selectedDocIds.has(doc.id)
              
              return (
                <tr 
                  key={doc.id} 
                  onClick={() => setVersionPanelDoc(doc)}
                  className={`${styles.clickableRow} ${isRowSelected ? styles.selectedRow : ''} ${isChecked ? styles.checkedRow : ''}`}
                >
                  <td className={styles.checkboxCol}>
                    <button 
                      className={`${styles.rowCheckbox} ${isChecked ? styles.checked : ''}`}
                      onClick={(e) => toggleSelectDoc(doc.id, e)}
                      title={isChecked ? 'Deselect' : 'Select'}
                    >
                      {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                  </td>
                  <td>
                    <div className={styles.nameCell}>
                      <span className={styles.fileIcon}>{getFileIcon(doc.type)}</span>
                      <span className={styles.docNameLink}>{doc.originalName || doc.name}</span>
                      {isWordDoc && (
                        <span className={styles.wordBadge} title="Word Document">
                          <Edit3 size={12} />
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{getMatterName(doc.matterId) || '-'}</td>
                  <td>{formatFileSize(doc.size)}</td>
                  <td>
                    <span className={styles.versionBadge}>
                      v{doc.version || 1}
                    </span>
                  </td>
                  <td>{doc.uploadedAt ? format(parseISO(doc.uploadedAt), 'MMM d, yyyy') : '-'}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button 
                        onClick={(e) => downloadDocument(doc, e)}
                        title="Download"
                        className={styles.actionBtn}
                      >
                        <Download size={16} />
                      </button>
                      <button 
                        onClick={(e) => handleDeleteDocument(doc.id, e)}
                        title="Delete"
                        className={styles.deleteBtn}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filteredDocuments.length === 0 && (
        <div className={styles.emptyState}>
          <FolderOpen size={48} />
          <h3>No documents found</h3>
          <p>Upload your first document to get started</p>
        </div>
      )}

      {/* Helpful tip for documents */}
      {filteredDocuments.length > 0 && (
        <div className={styles.documentTip}>
          <Edit3 size={14} />
          <span>
            <strong>Tip:</strong> Click any document to view version history and actions. For Word documents, click "Open in Word" to edit directly. 
            {!isAdmin && ' '}Connect Microsoft 365 in <a href="/app/integrations" style={{ color: 'inherit', textDecoration: 'underline' }}>Integrations</a> for seamless editing.
          </span>
        </div>
      )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, docId: '', docName: '' })}
        onConfirm={confirmDeleteDocument}
        title="Delete Document"
        message={`Are you sure you want to delete "${confirmModal.docName}"? This action cannot be undone.`}
        confirmText="Delete"
        type="danger"
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={bulkDeleteModal}
        onClose={() => setBulkDeleteModal(false)}
        onConfirm={confirmBulkDelete}
        title="Delete Multiple Documents"
        message={`Are you sure you want to delete ${selectedDocIds.size} document${selectedDocIds.size === 1 ? '' : 's'}? This action cannot be undone.`}
        confirmText={isBulkDeleting ? 'Deleting...' : `Delete ${selectedDocIds.size} Document${selectedDocIds.size === 1 ? '' : 's'}`}
        type="danger"
      />

      {/* Share Document Modal */}
      <ShareDocumentModal
        isOpen={shareModal.isOpen}
        onClose={() => setShareModal({ isOpen: false, documentId: '', documentName: '' })}
        documentId={shareModal.documentId}
        documentName={shareModal.documentName}
      />

      {/* Document Preview Modal */}
      {editorDoc && (
        <div className={styles.editorOverlay} onClick={closeEditor}>
          <div className={styles.editorModal} onClick={e => e.stopPropagation()}>
            <div className={styles.editorHeader}>
              <div className={styles.editorTitle}>
                <FileText size={20} />
                <h2>{editorDoc.name}</h2>
              </div>
              <div className={styles.editorActions}>
                <button 
                  className={styles.openFileBtn}
                  onClick={() => openFileOnComputer(editorDoc)}
                  title="Open file on your computer"
                >
                  <ExternalLink size={16} />
                  Open File
                </button>
                <button 
                  className={styles.downloadBtn}
                  onClick={() => downloadDocument(editorDoc)}
                  title="Download file"
                >
                  <Download size={16} />
                  Download
                </button>
                <button className={styles.closeEditorBtn} onClick={closeEditor}>
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className={styles.editorBody}>
              {isLoadingContent ? (
                <div className={styles.editorLoading}>
                  <Loader2 size={32} className={styles.spinner} />
                  <span>Loading document preview...</span>
                </div>
              ) : (
                <div className={styles.editorPreview}>
                  <pre>{editorContent || 'No content available for preview'}</pre>
                </div>
              )}
            </div>

            <div className={styles.editorFooter}>
              <span className={styles.editorMeta}>
                {editorContent.length.toLocaleString()} characters
              </span>
              <div className={styles.editorFooterActions}>
                <button
                  className={styles.aiAnalyzeBtn}
                  onClick={() => {
                    openAIWithDocument(editorDoc, 'Please analyze this document.')
                    closeEditor()
                  }}
                  title="Analyze with AI"
                >
                  <Sparkles size={16} />
                  Analyze with AI
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Version History Panel - Slides in from right when document is selected */}
      {versionPanelDoc && (
        <>
          {/* Overlay for closing panel */}
          <div 
            className={styles.panelOverlay} 
            onClick={() => setVersionPanelDoc(null)}
          />
          <DocumentVersionPanel
            document={{
              id: versionPanelDoc.id,
              name: versionPanelDoc.name || 'Unknown',
              originalName: versionPanelDoc.originalName,
              type: versionPanelDoc.type || 'application/octet-stream',
              size: versionPanelDoc.size || 0,
              uploadedAt: versionPanelDoc.uploadedAt || new Date().toISOString(),
              matterName: getMatterName(versionPanelDoc.matterId) || undefined,
              uploadedByName: versionPanelDoc.uploadedByName,
              folderPath: (versionPanelDoc as any).folderPath,
              externalPath: (versionPanelDoc as any).externalPath,
            }}
            onClose={() => setVersionPanelDoc(null)}
            onOpenInWord={(preferDesktop) => {
              const wordExtensions = ['.doc', '.docx', '.odt', '.rtf']
              const docName = versionPanelDoc.name || versionPanelDoc.originalName || ''
              const isWordDoc = wordExtensions.some(ext => 
                docName.toLowerCase().endsWith(ext)
              )
              if (isWordDoc) {
                editInWord(versionPanelDoc, preferDesktop)
              } else {
                openFileOnComputer(versionPanelDoc)
              }
            }}
            onDownload={() => downloadDocument(versionPanelDoc)}
            onPreview={() => {
              openDocumentViewer(versionPanelDoc)
              setVersionPanelDoc(null)
            }}
            onShare={() => {
              setShareModal({
                isOpen: true,
                documentId: versionPanelDoc.id,
                documentName: versionPanelDoc.name
              })
              setVersionPanelDoc(null)
            }}
            onEmail={() => {
              emailDocument({
                id: versionPanelDoc.id,
                name: versionPanelDoc.name,
                size: versionPanelDoc.size
              })
              setVersionPanelDoc(null)
            }}
            onAnalyze={() => {
              openAIWithDocument(versionPanelDoc, 'Please analyze this document and provide a summary.')
              setVersionPanelDoc(null)
            }}
            onDelete={() => {
              handleDeleteDocument(versionPanelDoc.id)
              setVersionPanelDoc(null)
            }}
          />
        </>
      )}
    </div>
  )
}
