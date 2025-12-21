import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAIStore } from '../stores/aiStore'
import { useAIChat } from '../contexts/AIChatContext'
import { 
  Search, FolderOpen, FileText, Upload,
  Sparkles, Download, Trash2, Wand2, X, Loader2,
  FileSearch, Scale, AlertTriangle, List, MessageSquare,
  Eye, Edit3, Save, RotateCcw
} from 'lucide-react'
import { documentsApi } from '../services/api'
import { format, parseISO } from 'date-fns'
import styles from './DocumentsPage.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'
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
  const { openChat } = useAIChat()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  
  // Fetch data from API on mount
  useEffect(() => {
    fetchDocuments()
    fetchMatters()
  }, [fetchDocuments, fetchMatters])
  
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
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    docId: string
    docName: string
  }>({ isOpen: false, docId: '', docName: '' })

  // Document viewer/editor state
  const [editorDoc, setEditorDoc] = useState<typeof documents[0] | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [externalPath, setExternalPath] = useState('')
  const [externalType, setExternalType] = useState('')
  const [showExternalPathInput, setShowExternalPathInput] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Open document viewer/editor
  const openDocumentViewer = async (doc: typeof documents[0]) => {
    setEditorDoc(doc)
    setIsLoadingContent(true)
    setIsEditing(false)
    setSaveSuccess(false)
    setExternalPath((doc as any).externalPath || '')
    setExternalType((doc as any).externalType || '')
    setShowExternalPathInput(false)
    
    try {
      const response = await documentsApi.getContent(doc.id)
      const content = response.content || response.text || ''
      setEditorContent(content)
      setOriginalContent(content)
    } catch (error) {
      console.error('Failed to load document content:', error)
      setEditorContent('[Unable to load document content. The document may be in a format that cannot be displayed as text.]')
      setOriginalContent('')
    } finally {
      setIsLoadingContent(false)
    }
  }

  // Save document content
  const saveDocumentContent = async () => {
    if (!editorDoc) return
    
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      const updateData: any = { content: editorContent }
      if (externalPath) {
        updateData.externalPath = externalPath
        updateData.externalType = externalType || 'url'
      }
      await documentsApi.update(editorDoc.id, updateData)
      setOriginalContent(editorContent)
      setIsEditing(false)
      setSaveSuccess(true)
      fetchDocuments() // Refresh the list
      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Failed to save document:', error)
      alert('Failed to save document. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  // Reset content to original
  const resetContent = () => {
    setEditorContent(originalContent)
  }

  // Close editor
  const closeEditor = () => {
    if (isEditing && editorContent !== originalContent) {
      if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
        return
      }
    }
    setEditorDoc(null)
    setEditorContent('')
    setOriginalContent('')
    setIsEditing(false)
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
              <th>Uploaded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map(doc => (
              <tr key={doc.id} onClick={() => setSelectedDoc(doc)} className={styles.clickableRow}>
                <td>
                  <div className={styles.nameCell}>
                    <span className={styles.fileIcon}>{getFileIcon(doc.type)}</span>
                    <span className={styles.docNameLink}>{doc.name}</span>
                  </div>
                </td>
                <td>{getMatterName(doc.matterId) || '-'}</td>
                <td>{formatFileSize(doc.size)}</td>
                <td>{format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}</td>
                <td>
                  <div className={styles.rowActions}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        openDocumentViewer(doc)
                      }}
                      title="View & Edit"
                      className={styles.editBtn}
                    >
                      <Edit3 size={16} />
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
            ))}
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
                <button 
                  className={styles.viewEditBtn}
                  onClick={() => {
                    openDocumentViewer(selectedDoc)
                    setSelectedDoc(null)
                  }}
                >
                  <Eye size={18} />
                  View & Edit
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

      {/* Document Viewer/Editor Modal */}
      {editorDoc && (
        <div className={styles.editorOverlay} onClick={closeEditor}>
          <div className={styles.editorModal} onClick={e => e.stopPropagation()}>
            <div className={styles.editorHeader}>
              <div className={styles.editorTitle}>
                <FileText size={20} />
                <h2>{editorDoc.name}</h2>
              </div>
              <div className={styles.editorActions}>
                {!isEditing ? (
                  <button 
                    className={styles.editModeBtn}
                    onClick={() => setIsEditing(true)}
                    disabled={isLoadingContent || !originalContent}
                    title={!originalContent ? 'This document cannot be edited' : 'Edit document'}
                  >
                    <Edit3 size={16} />
                    Edit
                  </button>
                ) : (
                  <>
                    <button 
                      className={styles.resetBtn}
                      onClick={resetContent}
                      disabled={editorContent === originalContent}
                      title="Reset to original"
                    >
                      <RotateCcw size={16} />
                      Reset
                    </button>
                    <button 
                      className={styles.saveBtn}
                      onClick={saveDocumentContent}
                      disabled={isSaving || editorContent === originalContent}
                    >
                      {isSaving ? <Loader2 size={16} className={styles.spinner} /> : <Save size={16} />}
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                )}
                <button className={styles.closeEditorBtn} onClick={closeEditor}>
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className={styles.editorBody}>
              {isLoadingContent ? (
                <div className={styles.editorLoading}>
                  <Loader2 size={32} className={styles.spinner} />
                  <span>Loading document content...</span>
                </div>
              ) : isEditing ? (
                <textarea
                  className={styles.editorTextarea}
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  placeholder="Document content..."
                  autoFocus
                />
              ) : (
                <div className={styles.editorPreview}>
                  <pre>{editorContent || 'No content available'}</pre>
                </div>
              )}
            </div>

            <div className={styles.editorFooter}>
              <span className={styles.editorMeta}>
                {isEditing && editorContent !== originalContent && (
                  <span className={styles.unsavedIndicator}>• Unsaved changes</span>
                )}
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
    </div>
  )
}
