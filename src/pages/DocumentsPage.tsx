import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { 
  Plus, Search, FolderOpen, FileText, Upload, Grid, List,
  MoreVertical, Sparkles, Download, Trash2, Wand2
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './DocumentsPage.module.css'

export function DocumentsPage() {
  const navigate = useNavigate()
  const { documents, matters, fetchDocuments, fetchMatters, addDocument } = useDataStore()
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

  return (
    <div className={styles.documentsPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Documents</h1>
          <span className={styles.count}>{documents.length} files</span>
        </div>
        <div className={styles.headerActions}>
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

      {viewMode === 'grid' ? (
        <div className={styles.documentsGrid}>
          {filteredDocuments.map(doc => (
            <div key={doc.id} className={styles.docCard}>
              <div className={styles.docPreview}>
                <span className={styles.fileIcon}>{getFileIcon(doc.type)}</span>
              </div>
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
                {doc.aiSummary && (
                  <span className={styles.aiTag}>
                    <Sparkles size={12} />
                    AI Summary
                  </span>
                )}
                <button className={styles.menuBtn}>
                  <MoreVertical size={16} />
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
                <th>Uploaded</th>
                <th>AI</th>
                <th></th>
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
                    {doc.aiSummary && (
                      <span className={styles.aiTag}>
                        <Sparkles size={12} />
                      </span>
                    )}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button><Download size={16} /></button>
                      <button><Trash2 size={16} /></button>
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
          <FolderOpen size={48} />
          <h3>No documents found</h3>
          <p>Upload your first document to get started</p>
        </div>
      )}
    </div>
  )
}
