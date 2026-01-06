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
  HardDrive, Settings, Share2, Shield, Mail, Users
} from 'lucide-react'
import { documentsApi, driveApi, wordOnlineApi } from '../services/api'
import { useEmailCompose } from '../contexts/EmailComposeContext'
import { format, parseISO } from 'date-fns'
import styles from './DocumentsPage.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { ShareDocumentModal } from '../components/ShareDocumentModal'
import { DocumentVersionPanel } from '../components/DocumentVersionPanel'
import { parseDocument } from '../utils/documentParser'

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
  const { documents, matters, fetchDocuments, fetchMatters, addDocument, deleteDocument } = useDataStore()
  const { setSelectedMode, setDocumentContext, createConversation, setInitialMessage } = useAIStore()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  const { openChat } = useAIChat()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isOpeningWord, setIsOpeningWord] = useState(false)
  
  // Fetch data from API on mount
  useEffect(() => {
    fetchDocuments()
    fetchMatters()
  }, [fetchDocuments, fetchMatters])
  
  // Open document in Word (Desktop or Online)
  const editInWord = async (doc: typeof documents[0], preferDesktop = true, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    
    // Check if it's a Word document
    const wordExtensions = ['.doc', '.docx', '.odt', '.rtf']
    const isWordDoc = wordExtensions.some(ext => doc.name.toLowerCase().endsWith(ext))
    
    if (!isWordDoc) {
      alert('Word editing is only available for Word documents (.doc, .docx)')
      return
    }

    setIsOpeningWord(true)
    try {
      // Try to open in desktop Word first (preferred for lawyers)
      if (preferDesktop) {
        const result = await wordOnlineApi.openDesktop(doc.id)
        
        if (result.desktopUrl) {
          // Open using ms-word: protocol (opens in desktop Word)
          window.location.href = result.desktopUrl
          
          // Show instructions toast
          setTimeout(() => {
            if (result.autoSync) {
              console.log('Document opened in Word. Changes will auto-sync when you save.')
            }
          }, 1000)
          return
        } else if (result.needsMicrosoftAuth) {
          // Microsoft not connected - try Word Online or download
          alert('Connect Microsoft in Settings → Integrations for seamless Word editing. Downloading document instead...')
          downloadDocument(doc)
          return
        }
      }
      
      // Fallback to Word Online
      const result = await wordOnlineApi.openDocument(doc.id)
      
      if (result.editUrl) {
        // Open Word Online in new tab
        window.open(result.editUrl, '_blank')
      } else if (result.desktopUrl) {
        // Desktop Word URL available
        window.location.href = result.desktopUrl
      } else if (result.fallback === 'desktop') {
        // Fallback to downloading
        const confirmed = confirm(
          'Word Online is not available for this document. Would you like to download and edit it locally instead?'
        )
        if (confirmed) {
          downloadDocument(doc)
        }
      } else {
        alert(result.message || 'Unable to open in Word')
      }
    } catch (error: any) {
      console.error('Failed to open Word:', error)
      // Fallback - offer to download
      const confirmed = confirm(
        'Could not open Word. Would you like to download the document to edit locally?'
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
        alert('Failed to download document. Please try again.')
      }
    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download document. Please try again.')
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
      setSelectedDoc(null)
      fetchDocuments()
    } catch (error) {
      console.error('Failed to delete document:', error)
      alert('Failed to delete document')
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
      setSelectedDoc(null)
      navigate('/app/ai')
      
    } catch (error) {
      console.error('Failed to extract document:', error)
      alert('Failed to analyze document. Please try again.')
    } finally {
      setIsExtracting(false)
    }
  }
  
  const [searchQuery, setSearchQuery] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [selectedMatterId, setSelectedMatterId] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<typeof documents[0] | null>(null)
  
  // Version history panel state - shows on right side when document clicked
  const [versionPanelDoc, setVersionPanelDoc] = useState<typeof documents[0] | null>(null)
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    docId: string
    docName: string
  }>({ isOpen: false, docId: '', docName: '' })

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
    setSelectedDoc(null)
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
        alert('Failed to open file. Please try downloading instead.')
      }
    } catch (error) {
      console.error('Open file error:', error)
      alert('Failed to open file.')
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
    return documents.filter(doc =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
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
          <span className={styles.count}>{documents.length} files</span>
        </div>
        <div className={styles.headerActions}>
          {/* Admin-only buttons */}
          {isAdmin && (
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
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
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
              const isWordDoc = wordExtensions.some(ext => doc.name.toLowerCase().endsWith(ext))
              const isSelected = versionPanelDoc?.id === doc.id
              
              return (
                <tr 
                  key={doc.id} 
                  onClick={() => setVersionPanelDoc(doc)} 
                  onDoubleClick={() => {
                    // Double-click opens directly in Word (for Word docs) or opens file
                    if (isWordDoc) {
                      editInWord(doc, true)
                    } else {
                      openFileOnComputer(doc)
                    }
                  }}
                  className={`${styles.clickableRow} ${isSelected ? styles.selectedRow : ''}`}
                >
                  <td>
                    <div className={styles.nameCell}>
                      <span className={styles.fileIcon}>{getFileIcon(doc.type)}</span>
                      <span className={styles.docNameLink}>{doc.name}</span>
                      {isWordDoc && (
                        <span className={styles.wordBadge} title="Word Document - Double-click to edit">
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
                <td>{format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}</td>
                <td>
                    <div className={styles.rowActions}>
                      {isWordDoc ? (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            editInWord(doc, true)
                          }}
                          title="Edit in Word"
                          className={styles.wordBtn}
                        >
                          <Edit3 size={16} />
                        </button>
                      ) : (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            openFileOnComputer(doc)
                          }}
                          title="Open File"
                          className={styles.openBtn}
                        >
                          <ExternalLink size={16} />
                        </button>
                      )}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          setVersionPanelDoc(doc)
                        }}
                        title="Version History"
                        className={styles.historyRowBtn}
                      >
                        <History size={16} />
                      </button>
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

      {/* Helpful tip for Word documents */}
      {filteredDocuments.length > 0 && (
        <div className={styles.documentTip}>
          <Edit3 size={14} />
          <span>
            <strong>Tip:</strong> Double-click Word documents to open directly in Microsoft Word. 
            Single-click to view version history. Changes save automatically.
          </span>
        </div>
      )}

      {/* Document Quick Actions Modal */}
      {selectedDoc && (
        <div className={styles.modalOverlay} onClick={() => setSelectedDoc(null)}>
          <div className={styles.docModal} onClick={e => e.stopPropagation()}>
            <div className={styles.docModalHeader}>
              <div className={styles.docModalTitle}>
                <span className={styles.docModalIcon}>{getFileIcon(selectedDoc.type)}</span>
                <div className={styles.docModalInfo}>
                  <h3>{selectedDoc.name}</h3>
                  <span className={styles.docModalMeta}>
                    {formatFileSize(selectedDoc.size)} • {format(parseISO(selectedDoc.uploadedAt), 'MMM d, yyyy')}
                    {getMatterName(selectedDoc.matterId) && ` • ${getMatterName(selectedDoc.matterId)}`}
                  </span>
                </div>
              </div>
              <button className={styles.closeBtn} onClick={() => setSelectedDoc(null)}>
                <X size={18} />
              </button>
            </div>
            
            <div className={styles.docModalContent}>
              <div className={styles.quickActions}>
                {/* Edit in Word - Primary action for Word docs */}
                {(selectedDoc.name.toLowerCase().endsWith('.doc') || 
                  selectedDoc.name.toLowerCase().endsWith('.docx') ||
                  selectedDoc.name.toLowerCase().endsWith('.odt')) && (
                  <button 
                    className={styles.editWordBtn}
                    onClick={() => {
                      editInWord(selectedDoc)
                      setSelectedDoc(null)
                    }}
                    disabled={isOpeningWord}
                  >
                    <Edit3 size={18} />
                    {isOpeningWord ? 'Opening...' : 'Edit in Word'}
                  </button>
                )}
                <button 
                  className={styles.openFileBtn}
                  onClick={() => {
                    openFileOnComputer(selectedDoc)
                    setSelectedDoc(null)
                  }}
                >
                  <ExternalLink size={18} />
                  Open File
                </button>
                <button 
                  className={styles.previewBtn}
                  onClick={() => {
                    openDocumentViewer(selectedDoc)
                    setSelectedDoc(null)
                  }}
                >
                  <Eye size={18} />
                  Preview
                </button>
                <button 
                  className={styles.historyBtn}
                  onClick={() => {
                    navigate(`/app/documents/${selectedDoc.id}/versions`)
                    setSelectedDoc(null)
                  }}
                >
                  <History size={18} />
                  Version History
                </button>
                <button 
                  className={styles.compareBtn}
                  onClick={() => {
                    navigate(`/app/documents/${selectedDoc.id}/compare`)
                    setSelectedDoc(null)
                  }}
                >
                  <GitCompare size={18} />
                  Compare Versions
                </button>
                <button 
                  className={styles.shareBtn}
                  onClick={() => {
                    setShareModal({
                      isOpen: true,
                      documentId: selectedDoc.id,
                      documentName: selectedDoc.name
                    })
                    setSelectedDoc(null)
                  }}
                >
                  <Share2 size={18} />
                  Share
                </button>
                <button 
                  className={styles.emailBtn}
                  onClick={() => openEmailWithDocument(selectedDoc)}
                >
                  <Mail size={18} />
                  Email
                </button>
                <button 
                  className={styles.downloadBtn}
                  onClick={() => downloadDocument(selectedDoc)}
                >
                  <Download size={18} />
                  Download
                </button>
                <button 
                  className={styles.deleteDocBtn}
                  onClick={() => handleDeleteDocument(selectedDoc.id)}
                >
                  <Trash2 size={18} />
                  Delete
                </button>
              </div>

              <div className={styles.aiSection}>
                <div className={styles.aiSectionHeader}>
                  <Sparkles size={16} />
                  <span>AI Document Analysis</span>
                </div>
                
                {isExtracting ? (
                  <div className={styles.extractingState}>
                    <Loader2 size={24} className={styles.spinner} />
                    <span>Preparing document for analysis...</span>
                  </div>
                ) : (
                  <div className={styles.aiSuggestions}>
                    {AI_SUGGESTIONS.map((suggestion, i) => (
                      <button
                        key={i}
                        className={styles.suggestionBtn}
                        onClick={() => openAIWithDocument(selectedDoc, suggestion.prompt)}
                      >
                        <suggestion.icon size={16} />
                        <span>{suggestion.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
              name: versionPanelDoc.name,
              originalName: versionPanelDoc.originalName,
              type: versionPanelDoc.type,
              size: versionPanelDoc.size,
              uploadedAt: versionPanelDoc.uploadedAt,
              matterName: getMatterName(versionPanelDoc.matterId) || undefined,
              uploadedByName: versionPanelDoc.uploadedByName,
            }}
            onClose={() => setVersionPanelDoc(null)}
            onOpenInWord={(preferDesktop) => {
              const wordExtensions = ['.doc', '.docx', '.odt', '.rtf']
              const isWordDoc = wordExtensions.some(ext => 
                versionPanelDoc.name.toLowerCase().endsWith(ext)
              )
              if (isWordDoc) {
                editInWord(versionPanelDoc, preferDesktop)
              } else {
                openFileOnComputer(versionPanelDoc)
              }
            }}
            onDownload={() => downloadDocument(versionPanelDoc)}
          />
        </>
      )}
    </div>
  )
}
