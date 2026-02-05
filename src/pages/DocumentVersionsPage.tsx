import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, History, FileText, RotateCcw, GitCompare,
  Loader2, AlertCircle, Check, User, Clock,
  Eye, Plus, Minus, Edit3, Upload, Sparkles
} from 'lucide-react'
import { driveApi } from '../services/api'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { ConfirmationModal } from '../components/ConfirmationModal'
import styles from './DocumentVersionsPage.module.css'

interface Version {
  id: string
  versionNumber: number
  versionLabel: string | null
  changeSummary: string | null
  changeType: string
  wordCount: number | null
  characterCount: number | null
  wordsAdded: number
  wordsRemoved: number
  fileSize: number | null
  createdBy: string
  createdByName: string
  createdAt: string
  source: string
  // Storage tier info
  storageType?: 'database' | 'azure_blob'
  tier?: 'Hot' | 'Cool' | 'Archive' | null
  archived?: boolean
  rehydrating?: boolean
}

const CHANGE_TYPE_ICONS: Record<string, any> = {
  create: Upload,
  edit: Edit3,
  restore: RotateCcw,
  merge: GitCompare,
  auto_save: Clock,
  sync: Sparkles,
  rename: FileText,
}

const CHANGE_TYPE_LABELS: Record<string, string> = {
  create: 'Created',
  edit: 'Edited',
  restore: 'Restored',
  merge: 'Merged',
  auto_save: 'Auto-saved',
  sync: 'Synced',
  rename: 'Renamed',
}

export function DocumentVersionsPage() {
  const navigate = useNavigate()
  const { documentId } = useParams()

  const [versions, setVersions] = useState<Version[]>([])
  const [documentName, setDocumentName] = useState('')
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [selectedVersions, setSelectedVersions] = useState<number[]>([])
  const [previewVersion, setPreviewVersion] = useState<Version | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const [restoreModal, setRestoreModal] = useState<{ isOpen: boolean; version: Version | null }>({
    isOpen: false,
    version: null,
  })

  useEffect(() => {
    if (documentId) {
      loadVersions()
    }
  }, [documentId])

  const loadVersions = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await driveApi.getVersions(documentId!)
      setVersions(result.versions || [])
      setDocumentName(result.documentName || 'Document')
    } catch (err: any) {
      setError(err.message || 'Failed to load version history')
    } finally {
      setLoading(false)
    }
  }

  const handlePreview = async (version: Version) => {
    if (previewVersion?.id === version.id) {
      setPreviewVersion(null)
      setPreviewContent(null)
      return
    }

    // Check if version is archived
    if (version.archived && !version.rehydrating) {
      setPreviewVersion(version)
      setPreviewContent(null)
      setNotification({ 
        type: 'error', 
        message: 'This version is archived. Click "Retrieve from Archive" to access it (takes 1-15 hours).' 
      })
      return
    }

    if (version.rehydrating) {
      setPreviewVersion(version)
      setPreviewContent(null)
      setNotification({ 
        type: 'error', 
        message: 'This version is being retrieved from archive. Please check back shortly.' 
      })
      return
    }

    try {
      setLoadingPreview(true)
      setPreviewVersion(version)
      const result = await driveApi.getVersionContent(documentId!, version.id)
      
      // Handle archived response (HTTP 202)
      if (result.archived) {
        setPreviewContent(null)
        setNotification({ 
          type: 'error', 
          message: result.message || 'This version needs to be retrieved from archive.' 
        })
        // Update local version state
        setVersions(prev => prev.map(v => 
          v.id === version.id ? { ...v, archived: true, rehydrating: result.rehydrationPending } : v
        ))
        return
      }
      
      setPreviewContent(result.content || '')
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Failed to load version content' })
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleRehydrate = async (version: Version) => {
    try {
      const result = await driveApi.rehydrateVersion(documentId!, version.versionNumber)
      setNotification({ 
        type: 'success', 
        message: result.message || 'Retrieval initiated. You will be notified when ready.' 
      })
      // Update local state to show rehydrating
      setVersions(prev => prev.map(v => 
        v.id === version.id ? { ...v, rehydrating: true } : v
      ))
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to initiate retrieval' })
    }
  }

  const handleRestore = async () => {
    if (!restoreModal.version) return

    try {
      setRestoring(restoreModal.version.id)
      await driveApi.restoreVersion(documentId!, restoreModal.version.id)
      setNotification({ 
        type: 'success', 
        message: `Restored to version ${restoreModal.version.versionNumber}` 
      })
      setRestoreModal({ isOpen: false, version: null })
      loadVersions()
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to restore version' })
    } finally {
      setRestoring(null)
    }
  }

  const handleCompare = () => {
    if (selectedVersions.length !== 2) return
    
    const [v1, v2] = selectedVersions.sort((a, b) => a - b)
    navigate(`/app/documents/${documentId}/compare?v1=${v1}&v2=${v2}`)
  }

  const toggleVersionSelection = (versionNumber: number) => {
    setSelectedVersions(prev => {
      if (prev.includes(versionNumber)) {
        return prev.filter(v => v !== versionNumber)
      }
      if (prev.length >= 2) {
        return [prev[1], versionNumber]
      }
      return [...prev, versionNumber]
    })
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const getChangeIcon = (changeType: string) => {
    return CHANGE_TYPE_ICONS[changeType] || Edit3
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spinning} />
          <span>Loading version history...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon}>
            <History size={24} />
          </div>
          <div>
            <h1>Version History</h1>
            <p className={styles.docName}>
              <FileText size={14} />
              {documentName}
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.compareBtn}
            onClick={handleCompare}
            disabled={selectedVersions.length !== 2}
          >
            <GitCompare size={18} />
            Compare Selected
            {selectedVersions.length > 0 && (
              <span className={styles.badge}>{selectedVersions.length}</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <AlertCircle size={18} />
          {error}
          <button onClick={loadVersions}>Retry</button>
        </div>
      )}

      <div className={styles.content}>
        <div className={styles.timeline}>
          <div className={styles.timelineInfo}>
            <span>{versions.length} versions</span>
            <span className={styles.hint}>
              Select 2 versions to compare them
            </span>
          </div>

          {versions.length === 0 ? (
            <div className={styles.emptyState}>
              <History size={48} />
              <h3>No version history</h3>
              <p>Versions will be created automatically when you edit this document</p>
            </div>
          ) : (
            <div className={styles.versionList}>
              {versions.map((version, index) => {
                const ChangeIcon = getChangeIcon(version.changeType)
                const isLatest = index === 0
                const isSelected = selectedVersions.includes(version.versionNumber)
                const isPreviewing = previewVersion?.id === version.id
                
                return (
                  <div 
                    key={version.id} 
                    className={`${styles.versionItem} ${isSelected ? styles.selected : ''} ${isPreviewing ? styles.previewing : ''}`}
                  >
                    <div className={styles.versionLine}>
                      <div className={`${styles.versionDot} ${isLatest ? styles.latest : ''}`} />
                    </div>
                    
                    <div className={styles.versionContent}>
                      <div className={styles.versionHeader}>
                        <div className={styles.versionInfo}>
                          <span className={`${styles.versionNumber} ${isLatest ? styles.latest : ''}`}>
                            v{version.versionNumber}
                            {isLatest && <span className={styles.latestBadge}>Latest</span>}
                          </span>
                          {version.versionLabel && (
                            <span className={styles.versionLabel}>{version.versionLabel}</span>
                          )}
                        </div>
                        
                        <label className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleVersionSelection(version.versionNumber)}
                          />
                          <span>Compare</span>
                        </label>
                      </div>

                      <div className={styles.versionMeta}>
                        <span className={styles.changeType}>
                          <ChangeIcon size={14} />
                          {CHANGE_TYPE_LABELS[version.changeType] || version.changeType}
                        </span>
                        <span className={styles.author}>
                          <User size={14} />
                          {version.createdByName || 'Unknown'}
                        </span>
                        <span className={styles.time}>
                          <Clock size={14} />
                          {formatDistanceToNow(parseISO(version.createdAt), { addSuffix: true })}
                        </span>
                      </div>

                      {version.changeSummary && (
                        <p className={styles.changeSummary}>{version.changeSummary}</p>
                      )}

                      <div className={styles.versionStats}>
                        {version.wordsAdded > 0 && (
                          <span className={styles.added}>
                            <Plus size={12} />
                            {version.wordsAdded} words
                          </span>
                        )}
                        {version.wordsRemoved > 0 && (
                          <span className={styles.removed}>
                            <Minus size={12} />
                            {version.wordsRemoved} words
                          </span>
                        )}
                        <span className={styles.size}>
                          {formatFileSize(version.fileSize)}
                        </span>
                        <span className={styles.wordCount}>
                          {version.wordCount?.toLocaleString()} words
                        </span>
                      </div>

                      <div className={styles.versionActions}>
                        <button 
                          className={styles.previewBtn}
                          onClick={() => handlePreview(version)}
                        >
                          <Eye size={14} />
                          {isPreviewing ? 'Hide' : 'Preview'}
                        </button>
                        
                        {!isLatest && (
                          <button 
                            className={styles.restoreBtn}
                            onClick={() => setRestoreModal({ isOpen: true, version })}
                            disabled={restoring === version.id}
                          >
                            {restoring === version.id ? (
                              <Loader2 size={14} className={styles.spinning} />
                            ) : (
                              <RotateCcw size={14} />
                            )}
                            Restore
                          </button>
                        )}
                        
                        {index < versions.length - 1 && (
                          <button
                            className={styles.compareWithPrevBtn}
                            onClick={() => {
                              setSelectedVersions([versions[index + 1].versionNumber, version.versionNumber])
                              handleCompare()
                            }}
                          >
                            <GitCompare size={14} />
                            Compare with previous
                          </button>
                        )}
                      </div>

                      {isPreviewing && (
                        <div className={styles.previewPane}>
                          {loadingPreview ? (
                            <div className={styles.previewLoading}>
                              <Loader2 size={20} className={styles.spinning} />
                              <span>Loading content...</span>
                            </div>
                          ) : (
                            <pre className={styles.previewContent}>
                              {previewContent || 'No content available'}
                            </pre>
                          )}
                        </div>
                      )}

                      <div className={styles.versionTimestamp}>
                        {format(parseISO(version.createdAt), 'MMMM d, yyyy \'at\' h:mm a')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={restoreModal.isOpen}
        onClose={() => setRestoreModal({ isOpen: false, version: null })}
        onConfirm={handleRestore}
        title="Restore Version"
        message={`Are you sure you want to restore to version ${restoreModal.version?.versionNumber}? This will create a new version with the restored content.`}
        confirmText="Restore"
        type="warning"
      />
    </div>
  )
}
