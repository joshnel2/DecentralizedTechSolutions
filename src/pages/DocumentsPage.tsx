import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAIStore } from '../stores/aiStore'
import { useAIChat } from '../contexts/AIChatContext'
import { 
  Plus, Search, FolderOpen, FileText, Upload,
  MoreVertical, Sparkles, Download, Trash2, Wand2, Eye, X, FileSearch, Loader2
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './DocumentsPage.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'

export function DocumentsPage() {
  const navigate = useNavigate()
  const { documents, matters, fetchDocuments, fetchMatters, addDocument, deleteDocument } = useDataStore()
  const { setSelectedMode, setDocumentContext, createConversation } = useAIStore()
  const { openChat } = useAIChat()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  // Fetch data from API on mount
  useEffect(() => {
    fetchDocuments()
    fetchMatters()
  }, [fetchDocuments, fetchMatters])
  
  // Download document
  const downloadDocument = async (doc: typeof documents[0]) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
    const token = localStorage.getItem('token')
    try {
      const response = await fetch(`${apiUrl}/documents/${doc.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = doc.name
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert('Failed to download document')
      }
    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download document')
    }
  }
  
  // Delete document
  const handleDeleteDocument = (docId: string) => {
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
      fetchDocuments()
    } catch (error) {
      console.error('Failed to delete document:', error)
      alert('Failed to delete document')
    }
  }
  
  // Open AI with document context - extracts text content first
  const [isExtractingForChat, setIsExtractingForChat] = useState(false)
  
  const openAIWithDocContext = async (doc: typeof documents[0]) => {
    setIsExtractingForChat(true)
    
    try {
      // First try to get content from server
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken') || ''
      
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
          console.log('Downloading document for client-side extraction:', doc.name, doc.type)
          const downloadResponse = await fetch(`${apiUrl}/documents/${doc.id}/download`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          
          if (downloadResponse.ok) {
            const blob = await downloadResponse.blob()
            console.log('Downloaded blob:', blob.size, 'bytes, type:', blob.type)
            // Use the document's stored type, or fall back to blob type
            const fileType = doc.type || blob.type || 'application/octet-stream'
            const file = new File([blob], doc.name, { type: fileType })
            console.log('Created file for extraction:', file.name, file.type, file.size)
            extractedContent = await extractFileContent(file)
            console.log('Extracted content length:', extractedContent.length)
          } else {
            console.error('Download failed:', downloadResponse.status, downloadResponse.statusText)
          }
        } catch (e) {
          console.error('Failed to download document for extraction:', e)
        }
      }
      
      // If we still don't have content, provide a fallback message
      if (!extractedContent) {
        extractedContent = `[Document: ${doc.name}]\nType: ${doc.type}\nSize: ${formatFileSize(doc.size)}\n\nUnable to extract text content. The document may be an image or scanned PDF.`
      }
      
      // Navigate to AI page with document context
      setSelectedMode('document')
      setDocumentContext({
        id: doc.id,
        name: doc.name,
        content: extractedContent,
        type: doc.type,
        size: doc.size
      })
      createConversation('document')
      navigate('/app/ai')
      
    } catch (error) {
      console.error('Failed to extract document:', error)
      // Navigate anyway with basic info
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
    } finally {
      setIsExtractingForChat(false)
    }
  }
  
  // Client-side file content extraction
  const extractFileContent = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      
      reader.onload = async (e) => {
        const result = e.target?.result
        
        // Handle image files
        if (file.type.startsWith('image/')) {
          resolve(`[IMAGE FILE: ${file.name}]\n\nThis appears to be an image file. For best results, please use OCR software to extract the text or describe what you see in the image.`)
        }
        // Handle PDF files
        else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          try {
            const arrayBuffer = result as ArrayBuffer
            const pdfjsLib = await import('pdfjs-dist')
            
            pdfjsLib.GlobalWorkerOptions.workerSrc = 
              `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`
            
            const uint8Array = new Uint8Array(arrayBuffer)
            const loadingTask = pdfjsLib.getDocument({ 
              data: uint8Array,
              useSystemFonts: true,
              disableFontFace: true,
              isEvalSupported: false
            })
            
            const pdf = await loadingTask.promise
            
            let fullText = ''
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i)
              const textContent = await page.getTextContent()
              const pageText = textContent.items
                .map((item: any) => {
                  const text = item.str || ''
                  const hasTransform = item.hasEOL || (item.transform && item.transform[5] !== 0)
                  return hasTransform ? text + ' ' : text
                })
                .join('')
                .replace(/\s+/g, ' ')
                .trim()
              
              if (pageText) {
                fullText += `\n--- Page ${i} ---\n${pageText}\n`
              }
            }
            
            if (fullText.trim().length === 0) {
              resolve(`[PDF FILE: ${file.name}]\n\nThis PDF appears to be scanned or image-based with no extractable text.`)
            } else {
              resolve(`[PDF FILE: ${file.name}]\n\nExtracted content from PDF (${pdf.numPages} pages):\n${fullText}`)
            }
          } catch (err) {
            console.error('PDF extraction error:', err)
            resolve(`[PDF FILE: ${file.name}]\n\nUnable to extract text from this PDF.`)
          }
        }
        // Handle Word .docx files
        else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                 file.name.toLowerCase().endsWith('.docx')) {
          try {
            const arrayBuffer = result as ArrayBuffer
            const mammoth = await import('mammoth')
            const result2 = await mammoth.extractRawText({ arrayBuffer })
            if (result2.value.trim().length === 0) {
              resolve(`[WORD DOCUMENT: ${file.name}]\n\nThis document appears to be empty.`)
            } else {
              resolve(`[WORD DOCUMENT: ${file.name}]\n\nExtracted content:\n${result2.value}`)
            }
          } catch (err) {
            resolve(`[WORD DOCUMENT: ${file.name}]\n\nUnable to extract text from this Word document.`)
          }
        }
        // Handle Excel files
        else if (file.type.includes('spreadsheet') || file.type.includes('excel') ||
                 file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
          try {
            const arrayBuffer = result as ArrayBuffer
            const XLSX = await import('xlsx')
            const workbook = XLSX.read(arrayBuffer, { type: 'array' })
            
            let fullContent = `[EXCEL FILE: ${file.name}]\n\nExtracted content:\n`
            workbook.SheetNames.forEach((sheetName: string) => {
              const sheet = workbook.Sheets[sheetName]
              const csv = XLSX.utils.sheet_to_csv(sheet)
              fullContent += `\n--- Sheet: ${sheetName} ---\n${csv}\n`
            })
            resolve(fullContent)
          } catch (err) {
            resolve(`[EXCEL FILE: ${file.name}]\n\nUnable to extract data from this Excel file.`)
          }
        }
        // Handle text-based files
        else {
          const textContent = result as string
          if (textContent && textContent.trim().length > 0) {
            resolve(`[FILE: ${file.name}]\n\nContent:\n${textContent}`)
          } else {
            resolve(`[FILE: ${file.name}]\n\nThis file appears to be empty.`)
          }
        }
      }
      
      reader.onerror = () => resolve(`[FILE: ${file.name}]\n\nFailed to read file.`)
      
      // Determine if file needs binary or text reading
      const needsArrayBuffer = 
        file.type === 'application/pdf' || 
        file.type.includes('word') ||
        file.type.includes('spreadsheet') ||
        file.type.includes('excel') ||
        file.name.toLowerCase().endsWith('.pdf') ||
        file.name.toLowerCase().endsWith('.docx') ||
        file.name.toLowerCase().endsWith('.doc') ||
        file.name.toLowerCase().endsWith('.xlsx') ||
        file.name.toLowerCase().endsWith('.xls')
      
      if (needsArrayBuffer) {
        reader.readAsArrayBuffer(file)
      } else {
        reader.readAsText(file)
      }
    })
  }
  
  const [searchQuery, setSearchQuery] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [selectedMatterId, setSelectedMatterId] = useState('')
  const [previewDoc, setPreviewDoc] = useState<typeof documents[0] | null>(null)
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    docId: string
    docName: string
  }>({ isOpen: false, docId: '', docName: '' })

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
    if (type.includes('pdf')) return '📄'
    if (type.includes('word') || type.includes('document')) return '📝'
    if (type.includes('spreadsheet') || type.includes('excel')) return '📊'
    if (type.includes('image')) return '🖼️'
    return '📁'
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  const getDocumentUrl = (doc: typeof documents[0]) => {
    return `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/documents/${doc.id}/download`
  }

  const canPreview = (type: string, name: string) => {
    const lowerName = name.toLowerCase()
    return type.includes('pdf') || 
           type.includes('image') ||
           type.includes('word') ||
           type.includes('text') ||
           type.includes('spreadsheet') ||
           type.includes('excel') ||
           lowerName.endsWith('.pdf') ||
           lowerName.endsWith('.docx') ||
           lowerName.endsWith('.doc') ||
           lowerName.endsWith('.txt') ||
           lowerName.endsWith('.csv') ||
           lowerName.endsWith('.xlsx') ||
           lowerName.endsWith('.xls') ||
           lowerName.endsWith('.md') ||
           lowerName.endsWith('.json')
  }

  const isImageFile = (type: string) => type.includes('image')
  const isPdfFile = (type: string, name: string) => type.includes('pdf') || name.toLowerCase().endsWith('.pdf')

  // Preview content state
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Load preview content when preview doc changes
  const loadPreviewContent = async (doc: typeof documents[0]) => {
    // For images and PDFs that browser can render natively, skip extraction
    if (isImageFile(doc.type)) {
      setPreviewContent(null)
      return
    }

    setIsLoadingPreview(true)
    setPreviewContent(null)

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken') || ''

      const downloadResponse = await fetch(`${apiUrl}/documents/${doc.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (downloadResponse.ok) {
        const blob = await downloadResponse.blob()
        const fileType = doc.type || blob.type || 'application/octet-stream'
        const file = new File([blob], doc.name, { type: fileType })
        const content = await extractFileContent(file)
        setPreviewContent(content)
      } else {
        setPreviewContent('[Unable to load document preview]')
      }
    } catch (error) {
      console.error('Preview error:', error)
      setPreviewContent('[Error loading preview]')
    } finally {
      setIsLoadingPreview(false)
    }
  }

  // Handle opening preview
  const openPreview = (doc: typeof documents[0]) => {
    setPreviewDoc(doc)
    if (!isImageFile(doc.type)) {
      loadPreviewContent(doc)
    }
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
                <tr key={doc.id}>
                  <td>
                    <div className={styles.nameCell}>
                      <span className={styles.fileIcon}>{getFileIcon(doc.type)}</span>
                      <span>{doc.name}</span>
                    </div>
                  </td>
                  <td>{getMatterName(doc.matterId) || '-'}</td>
                  <td>{formatFileSize(doc.size)}</td>
                  <td>{format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button 
                        onClick={() => openPreview(doc)}
                        title="Preview"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={() => downloadDocument(doc)}
                        title="Download"
                      >
                        <Download size={16} />
                      </button>
                      <button 
                        className={styles.analyzeBtn}
                        onClick={() => openAIWithDocContext(doc)}
                        title="AI Analyze"
                        disabled={isExtractingForChat}
                      >
                        {isExtractingForChat ? <Loader2 size={14} className={styles.spinner} /> : <Sparkles size={14} />}
                      </button>
                      <button 
                        onClick={() => handleDeleteDocument(doc.id)}
                        title="Delete"
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

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className={styles.previewModal} onClick={() => { setPreviewDoc(null); setPreviewContent(null); }}>
          <div className={styles.previewContainer} onClick={e => e.stopPropagation()}>
            <div className={styles.previewHeader}>
              <div className={styles.previewTitle}>
                <FileText size={20} />
                <span>{previewDoc.name}</span>
              </div>
              <div className={styles.previewActions}>
                <button 
                  className={styles.downloadBtnLarge}
                  onClick={() => downloadDocument(previewDoc)}
                >
                  <Download size={16} />
                  Download
                </button>
                <button 
                  className={styles.analyzeBtn}
                  onClick={() => {
                    openAIWithDocContext(previewDoc)
                    setPreviewDoc(null)
                    setPreviewContent(null)
                  }}
                  disabled={isExtractingForChat}
                >
                  {isExtractingForChat ? <Loader2 size={16} className={styles.spinner} /> : <Sparkles size={16} />}
                  {isExtractingForChat ? 'Extracting...' : 'AI Analyze'}
                </button>
                <button className={styles.closePreviewBtn} onClick={() => { setPreviewDoc(null); setPreviewContent(null); }}>
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className={styles.previewContent}>
              {isImageFile(previewDoc.type) ? (
                /* Native image preview */
                <img 
                  src={getDocumentUrl(previewDoc)}
                  alt={previewDoc.name}
                  className={styles.previewImage}
                />
              ) : isPdfFile(previewDoc.type, previewDoc.name) ? (
                /* PDF preview - try iframe first, show extracted text as fallback */
                <div className={styles.pdfPreviewContainer}>
                  <iframe 
                    src={getDocumentUrl(previewDoc)}
                    title={previewDoc.name}
                    className={styles.previewFrame}
                  />
                  {previewContent && (
                    <details className={styles.textFallback}>
                      <summary>Show extracted text</summary>
                      <pre className={styles.extractedText}>{previewContent}</pre>
                    </details>
                  )}
                </div>
              ) : isLoadingPreview ? (
                /* Loading state */
                <div className={styles.previewLoading}>
                  <Loader2 size={32} className={styles.spinner} />
                  <p>Loading preview...</p>
                </div>
              ) : previewContent ? (
                /* Text-based preview for Word, Excel, Text files */
                <div className={styles.textPreview}>
                  <pre className={styles.extractedText}>{previewContent}</pre>
                </div>
              ) : (
                /* Fallback for unsupported types */
                <div className={styles.noPreview}>
                  <span className={styles.bigIcon}>{getFileIcon(previewDoc.type)}</span>
                  <h3>{previewDoc.name}</h3>
                  <p>{previewDoc.type} • {formatFileSize(previewDoc.size)}</p>
                  <p className={styles.noPreviewHint}>Preview not available for this file type</p>
                  <button 
                    onClick={() => downloadDocument(previewDoc)}
                    className={styles.downloadBtnLarge}
                  >
                    <Download size={18} />
                    Download to View
                  </button>
                </div>
              )}
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
    </div>
  )
}
