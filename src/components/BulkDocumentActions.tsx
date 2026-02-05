import { useState } from 'react'
import { 
  Download, Trash2, FolderInput, Tag, 
  Archive, X, Loader2, CheckCircle, AlertCircle 
} from 'lucide-react'
import { documentsApi } from '../services/api'
import styles from './BulkDocumentActions.module.css'

interface SelectedDocument {
  id: string
  name: string
  matterId?: string
}

interface BulkDocumentActionsProps {
  selectedDocuments: SelectedDocument[]
  onClearSelection: () => void
  onActionComplete: () => void
  availableFolders?: Array<{ id: string; name: string; path: string }>
  availableTags?: string[]
}

type BulkAction = 'download' | 'delete' | 'move' | 'tag' | 'share' | 'archive'

interface ActionResult {
  success: boolean
  processed: number
  failed: number
  errors: string[]
}

/**
 * Bulk document operations for efficient firm-wide document management
 * Essential for law firms with thousands of documents
 */
export function BulkDocumentActions({
  selectedDocuments,
  onClearSelection,
  onActionComplete,
  availableFolders = [],
  availableTags = []
}: BulkDocumentActionsProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [_currentAction, setCurrentAction] = useState<BulkAction | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState<ActionResult | null>(null)
  
  // Modal states for actions that need input
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showTagModal, setShowTagModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  
  const documentCount = selectedDocuments.length
  
  if (documentCount === 0) return null
  
  const processAction = async (
    action: BulkAction, 
    processor: (doc: SelectedDocument, index: number) => Promise<void>
  ) => {
    setIsProcessing(true)
    setCurrentAction(action)
    setProgress({ current: 0, total: documentCount })
    
    const errors: string[] = []
    let processed = 0
    let failed = 0
    
    for (let i = 0; i < selectedDocuments.length; i++) {
      const doc = selectedDocuments[i]
      try {
        await processor(doc, i)
        processed++
      } catch (err: any) {
        failed++
        errors.push(`${doc.name}: ${err.message || 'Failed'}`)
      }
      setProgress({ current: i + 1, total: documentCount })
    }
    
    setResult({ success: failed === 0, processed, failed, errors })
    setIsProcessing(false)
    setCurrentAction(null)
    
    if (failed === 0) {
      // Auto-close after success
      setTimeout(() => {
        setResult(null)
        onClearSelection()
        onActionComplete()
      }, 1500)
    }
  }
  
  const handleDownloadAll = async () => {
    setIsProcessing(true)
    setCurrentAction('download')
    
    try {
      // Use the API to download all selected as zip
      const blob = await documentsApi.downloadAll()
      
      // Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `apex-documents-${new Date().toISOString().split('T')[0]}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      setResult({ success: true, processed: documentCount, failed: 0, errors: [] })
    } catch (err: any) {
      setResult({ 
        success: false, 
        processed: 0, 
        failed: 1, 
        errors: [err.message || 'Download failed'] 
      })
    } finally {
      setIsProcessing(false)
      setCurrentAction(null)
    }
  }
  
  const handleDeleteAll = async () => {
    setShowDeleteConfirm(false)
    
    await processAction('delete', async (doc) => {
      await documentsApi.delete(doc.id)
    })
  }
  
  const handleMoveAll = async () => {
    if (!selectedFolderId) return
    
    setShowMoveModal(false)
    
    await processAction('move', async (doc) => {
      await documentsApi.update(doc.id, { folderId: selectedFolderId })
    })
    
    setSelectedFolderId('')
  }
  
  const handleTagAll = async () => {
    if (selectedTags.length === 0 && !newTag) return
    
    setShowTagModal(false)
    const tagsToApply = [...selectedTags]
    if (newTag.trim()) {
      tagsToApply.push(newTag.trim())
    }
    
    await processAction('tag', async (doc) => {
      await documentsApi.update(doc.id, { 
        tags: tagsToApply 
      })
    })
    
    setSelectedTags([])
    setNewTag('')
  }
  
  const handleArchiveAll = async () => {
    await processAction('archive', async (doc) => {
      await documentsApi.update(doc.id, { status: 'archived' })
    })
  }
  
  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.selectionInfo}>
          <span className={styles.count}>{documentCount}</span>
          <span className={styles.label}>selected</span>
          <button 
            className={styles.clearBtn}
            onClick={onClearSelection}
            title="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
        
        <div className={styles.actions}>
          <button 
            className={styles.actionBtn}
            onClick={handleDownloadAll}
            disabled={isProcessing}
            title="Download as ZIP"
          >
            <Download size={16} />
            <span>Download</span>
          </button>
          
          <button 
            className={styles.actionBtn}
            onClick={() => setShowMoveModal(true)}
            disabled={isProcessing || availableFolders.length === 0}
            title="Move to folder"
          >
            <FolderInput size={16} />
            <span>Move</span>
          </button>
          
          <button 
            className={styles.actionBtn}
            onClick={() => setShowTagModal(true)}
            disabled={isProcessing}
            title="Add tags"
          >
            <Tag size={16} />
            <span>Tag</span>
          </button>
          
          <button 
            className={styles.actionBtn}
            onClick={handleArchiveAll}
            disabled={isProcessing}
            title="Archive documents"
          >
            <Archive size={16} />
            <span>Archive</span>
          </button>
          
          <button 
            className={`${styles.actionBtn} ${styles.danger}`}
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isProcessing}
            title="Delete documents"
          >
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
        </div>
        
        {/* Progress indicator */}
        {isProcessing && (
          <div className={styles.progress}>
            <Loader2 size={16} className={styles.spin} />
            <span>Processing {progress.current}/{progress.total}...</span>
          </div>
        )}
        
        {/* Result message */}
        {result && !isProcessing && (
          <div className={`${styles.result} ${result.success ? styles.success : styles.error}`}>
            {result.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>
              {result.success 
                ? `${result.processed} documents processed`
                : `${result.failed} failed. ${result.processed} succeeded.`
              }
            </span>
            <button onClick={() => setResult(null)}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <AlertCircle size={24} className={styles.dangerIcon} />
              <h3>Delete {documentCount} Documents?</h3>
            </div>
            <p className={styles.modalText}>
              This action cannot be undone. The documents will be moved to the recovery bin 
              for 30 days before permanent deletion.
            </p>
            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn}
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className={styles.deleteBtn}
                onClick={handleDeleteAll}
              >
                Delete {documentCount} Documents
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Move Modal */}
      {showMoveModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <FolderInput size={24} />
              <h3>Move {documentCount} Documents</h3>
            </div>
            <div className={styles.modalContent}>
              <label>Select destination folder:</label>
              <select 
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className={styles.folderSelect}
              >
                <option value="">Select a folder...</option>
                {availableFolders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.path || folder.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn}
                onClick={() => setShowMoveModal(false)}
              >
                Cancel
              </button>
              <button 
                className={styles.primaryBtn}
                onClick={handleMoveAll}
                disabled={!selectedFolderId}
              >
                Move Documents
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Tag Modal */}
      {showTagModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <Tag size={24} />
              <h3>Tag {documentCount} Documents</h3>
            </div>
            <div className={styles.modalContent}>
              <label>Select existing tags:</label>
              <div className={styles.tagList}>
                {availableTags.map(tag => (
                  <label key={tag} className={styles.tagOption}>
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTags([...selectedTags, tag])
                        } else {
                          setSelectedTags(selectedTags.filter(t => t !== tag))
                        }
                      }}
                    />
                    <span>{tag}</span>
                  </label>
                ))}
              </div>
              
              <label>Or add a new tag:</label>
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Enter new tag..."
                className={styles.tagInput}
              />
            </div>
            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn}
                onClick={() => setShowTagModal(false)}
              >
                Cancel
              </button>
              <button 
                className={styles.primaryBtn}
                onClick={handleTagAll}
                disabled={selectedTags.length === 0 && !newTag.trim()}
              >
                Apply Tags
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
