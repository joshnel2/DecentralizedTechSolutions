import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  FileText, Save, X, Lock, Unlock, History, 
  Loader2, Check, AlertCircle, User, Clock
} from 'lucide-react'
import { useDocumentLock } from '../hooks/useDocumentLock'
import { driveApi, documentsApi } from '../services/api'
import styles from './DocumentEditor.module.css'

interface DocumentEditorProps {
  documentId: string
  documentName: string
  initialContent?: string
  onClose: () => void
  onSave?: (content: string, versionNumber: number) => void
}

export function DocumentEditor({
  documentId,
  documentName,
  initialContent = '',
  onClose,
  onSave
}: DocumentEditorProps) {
  const [content, setContent] = useState(initialContent)
  const [originalContent, setOriginalContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  const {
    lockState,
    loading: lockLoading,
    error: lockError,
    acquireLock,
    releaseLock,
    canEdit,
    isOwnLock,
    lockedByName,
  } = useDocumentLock({ documentId, autoLock: true })
  
  // Load content on mount
  useEffect(() => {
    const loadContent = async () => {
      try {
        const result = await documentsApi.getContent(documentId)
        if (result.content) {
          setContent(result.content)
          setOriginalContent(result.content)
        }
      } catch (err) {
        console.error('Failed to load content:', err)
      }
    }
    
    if (!initialContent) {
      loadContent()
    }
  }, [documentId, initialContent])
  
  // Track changes
  useEffect(() => {
    setHasChanges(content !== originalContent)
  }, [content, originalContent])
  
  // Auto-save every 2 minutes if there are changes
  useEffect(() => {
    if (hasChanges && isOwnLock) {
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave(true) // Auto-save
      }, 120000) // 2 minutes
    }
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [hasChanges, isOwnLock, content])
  
  // Handle save
  const handleSave = async (isAutoSave: boolean = false) => {
    if (!hasChanges || saving) return
    
    setSaving(true)
    setNotification(null)
    
    try {
      const result = await driveApi.createVersion(documentId, {
        content,
        changeType: isAutoSave ? 'auto_save' : 'edit',
      })
      
      if (result.skipped) {
        setNotification({ type: 'warning', message: 'No changes to save' })
      } else {
        setOriginalContent(content)
        setLastSaved(new Date())
        setNotification({ 
          type: 'success', 
          message: isAutoSave 
            ? `Auto-saved as v${result.versionNumber}` 
            : `Saved as version ${result.versionNumber}`
        })
        
        if (onSave) {
          onSave(content, result.versionNumber)
        }
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }
  
  // Handle close with unsaved changes warning
  const handleClose = async () => {
    if (hasChanges) {
      const confirmed = window.confirm('You have unsaved changes. Do you want to discard them?')
      if (!confirmed) return
    }
    
    // Release lock
    await releaseLock('save_completed')
    onClose()
  }
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content, hasChanges, saving])
  
  const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length
  const charCount = content.length
  
  return (
    <div className={styles.editorOverlay}>
      <div className={styles.editorContainer}>
        {/* Header */}
        <div className={styles.editorHeader}>
          <div className={styles.headerLeft}>
            <FileText size={20} />
            <h2>{documentName}</h2>
            {hasChanges && <span className={styles.unsavedDot}>●</span>}
          </div>
          
          <div className={styles.headerCenter}>
            {/* Lock Status */}
            {lockLoading ? (
              <div className={styles.lockStatus}>
                <Loader2 size={16} className={styles.spinning} />
                <span>Checking lock...</span>
              </div>
            ) : lockState.locked && !isOwnLock ? (
              <div className={`${styles.lockStatus} ${styles.lockedByOther}`}>
                <Lock size={16} />
                <span>Editing locked by {lockedByName}</span>
              </div>
            ) : isOwnLock ? (
              <div className={`${styles.lockStatus} ${styles.ownLock}`}>
                <Unlock size={16} />
                <span>You have the editing lock</span>
              </div>
            ) : null}
          </div>
          
          <div className={styles.headerRight}>
            {lastSaved && (
              <span className={styles.lastSaved}>
                <Check size={14} />
                Saved at {lastSaved.toLocaleTimeString()}
              </span>
            )}
            
            <button 
              className={styles.saveBtn}
              onClick={() => handleSave(false)}
              disabled={saving || !hasChanges || !canEdit}
            >
              {saving ? (
                <Loader2 size={16} className={styles.spinning} />
              ) : (
                <Save size={16} />
              )}
              {saving ? 'Saving...' : 'Save'}
            </button>
            
            <button 
              className={styles.closeBtn}
              onClick={handleClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        
        {/* Notification */}
        {notification && (
          <div className={`${styles.notification} ${styles[notification.type]}`}>
            {notification.type === 'success' && <Check size={16} />}
            {notification.type === 'error' && <AlertCircle size={16} />}
            {notification.type === 'warning' && <AlertCircle size={16} />}
            {notification.message}
            <button onClick={() => setNotification(null)}>×</button>
          </div>
        )}
        
        {/* Lock Error */}
        {lockError && (
          <div className={`${styles.notification} ${styles.error}`}>
            <Lock size={16} />
            {lockError}
          </div>
        )}
        
        {/* Editor Body */}
        <div className={styles.editorBody}>
          <textarea
            ref={contentRef}
            className={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start typing..."
            disabled={!canEdit}
          />
        </div>
        
        {/* Footer */}
        <div className={styles.editorFooter}>
          <div className={styles.footerLeft}>
            <span className={styles.stat}>{wordCount.toLocaleString()} words</span>
            <span className={styles.stat}>{charCount.toLocaleString()} characters</span>
          </div>
          
          <div className={styles.footerRight}>
            <span className={styles.hint}>
              Ctrl/⌘ + S to save
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
