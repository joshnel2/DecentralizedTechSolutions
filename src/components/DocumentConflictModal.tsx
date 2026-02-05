import { useState } from 'react'
import { 
  AlertTriangle, FileText, Clock, User, 
  GitMerge, Copy, Download, RefreshCw, X 
} from 'lucide-react'
import styles from './DocumentConflictModal.module.css'

interface DocumentVersion {
  id: string
  versionNumber: number
  modifiedAt: string
  modifiedBy: string
  modifiedByName?: string
  size: number
  content?: string
}

interface ConflictInfo {
  documentId: string
  documentName: string
  localVersion: DocumentVersion
  serverVersion: DocumentVersion
  conflictType: 'concurrent_edit' | 'lock_expired' | 'force_save'
}

interface DocumentConflictModalProps {
  conflict: ConflictInfo
  onResolve: (resolution: 'keep_local' | 'keep_server' | 'keep_both' | 'merge') => void
  onCancel: () => void
  isResolving?: boolean
}

/**
 * Document conflict resolution modal
 * Critical for multi-attorney collaboration
 * Prevents data loss when two attorneys edit the same document
 */
export function DocumentConflictModal({
  conflict,
  onResolve,
  onCancel,
  isResolving = false
}: DocumentConflictModalProps) {
  const [selectedResolution, setSelectedResolution] = useState<'keep_local' | 'keep_server' | 'keep_both' | 'merge' | null>(null)
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }
  
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  
  const handleResolve = () => {
    if (selectedResolution) {
      onResolve(selectedResolution)
    }
  }
  
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <AlertTriangle size={24} />
          </div>
          <div className={styles.headerContent}>
            <h2>Document Conflict Detected</h2>
            <p>This document was modified by another user while you were editing.</p>
          </div>
          <button className={styles.closeBtn} onClick={onCancel}>
            <X size={20} />
          </button>
        </div>
        
        <div className={styles.documentInfo}>
          <FileText size={20} />
          <span className={styles.documentName}>{conflict.documentName}</span>
        </div>
        
        <div className={styles.versions}>
          {/* Your version */}
          <div className={styles.versionCard}>
            <div className={styles.versionHeader}>
              <span className={styles.versionLabel}>Your Version</span>
              <span className={styles.versionBadge}>Local</span>
            </div>
            <div className={styles.versionMeta}>
              <div className={styles.metaItem}>
                <Clock size={14} />
                <span>{formatDate(conflict.localVersion.modifiedAt)}</span>
              </div>
              <div className={styles.metaItem}>
                <User size={14} />
                <span>You</span>
              </div>
              <div className={styles.metaItem}>
                <FileText size={14} />
                <span>{formatSize(conflict.localVersion.size)}</span>
              </div>
            </div>
          </div>
          
          {/* Server version */}
          <div className={styles.versionCard}>
            <div className={styles.versionHeader}>
              <span className={styles.versionLabel}>Server Version</span>
              <span className={`${styles.versionBadge} ${styles.server}`}>v{conflict.serverVersion.versionNumber}</span>
            </div>
            <div className={styles.versionMeta}>
              <div className={styles.metaItem}>
                <Clock size={14} />
                <span>{formatDate(conflict.serverVersion.modifiedAt)}</span>
              </div>
              <div className={styles.metaItem}>
                <User size={14} />
                <span>{conflict.serverVersion.modifiedByName || 'Another user'}</span>
              </div>
              <div className={styles.metaItem}>
                <FileText size={14} />
                <span>{formatSize(conflict.serverVersion.size)}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className={styles.resolutionOptions}>
          <h3>Choose a resolution:</h3>
          
          <label className={`${styles.option} ${selectedResolution === 'keep_local' ? styles.selected : ''}`}>
            <input
              type="radio"
              name="resolution"
              value="keep_local"
              checked={selectedResolution === 'keep_local'}
              onChange={() => setSelectedResolution('keep_local')}
            />
            <div className={styles.optionIcon}>
              <RefreshCw size={20} />
            </div>
            <div className={styles.optionContent}>
              <span className={styles.optionTitle}>Keep Your Version</span>
              <span className={styles.optionDesc}>
                Overwrite the server version with your changes. The other user's changes will be lost.
              </span>
            </div>
          </label>
          
          <label className={`${styles.option} ${selectedResolution === 'keep_server' ? styles.selected : ''}`}>
            <input
              type="radio"
              name="resolution"
              value="keep_server"
              checked={selectedResolution === 'keep_server'}
              onChange={() => setSelectedResolution('keep_server')}
            />
            <div className={styles.optionIcon}>
              <Download size={20} />
            </div>
            <div className={styles.optionContent}>
              <span className={styles.optionTitle}>Keep Server Version</span>
              <span className={styles.optionDesc}>
                Discard your changes and keep the version from the server. Your local changes will be lost.
              </span>
            </div>
          </label>
          
          <label className={`${styles.option} ${selectedResolution === 'keep_both' ? styles.selected : ''}`}>
            <input
              type="radio"
              name="resolution"
              value="keep_both"
              checked={selectedResolution === 'keep_both'}
              onChange={() => setSelectedResolution('keep_both')}
            />
            <div className={styles.optionIcon}>
              <Copy size={20} />
            </div>
            <div className={styles.optionContent}>
              <span className={styles.optionTitle}>Keep Both Versions</span>
              <span className={styles.optionDesc}>
                Save your changes as a new copy alongside the server version. No changes will be lost.
              </span>
            </div>
          </label>
          
          <label className={`${styles.option} ${selectedResolution === 'merge' ? styles.selected : ''}`}>
            <input
              type="radio"
              name="resolution"
              value="merge"
              checked={selectedResolution === 'merge'}
              onChange={() => setSelectedResolution('merge')}
            />
            <div className={styles.optionIcon}>
              <GitMerge size={20} />
            </div>
            <div className={styles.optionContent}>
              <span className={styles.optionTitle}>Merge Changes</span>
              <span className={styles.optionDesc}>
                Attempt to automatically merge both versions. You'll review the result before saving.
              </span>
            </div>
          </label>
        </div>
        
        <div className={styles.actions}>
          <button 
            className={styles.cancelBtn} 
            onClick={onCancel}
            disabled={isResolving}
          >
            Cancel
          </button>
          <button 
            className={styles.resolveBtn}
            onClick={handleResolve}
            disabled={!selectedResolution || isResolving}
          >
            {isResolving ? (
              <>
                <RefreshCw size={16} className={styles.spin} />
                Resolving...
              </>
            ) : (
              'Resolve Conflict'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
