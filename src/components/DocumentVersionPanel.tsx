import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  X, History, Clock, User, FileText, GitCompare, ExternalLink, 
  Download, ChevronDown, ChevronRight, RefreshCw, AlertCircle,
  Edit3, CheckCircle, ArrowUpRight, Loader2, Share2, Mail, 
  Sparkles, Trash2, Eye
} from 'lucide-react'
import { wordOnlineApi, documentsApi } from '../services/api'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import styles from './DocumentVersionPanel.module.css'

interface Version {
  id: string
  versionNumber: number
  versionLabel: string
  changeSummary: string
  changeType: string
  wordCount: number
  createdBy: string
  createdByName: string
  createdAt: string
  source: string
  canCompare: boolean
  wordsAdded?: number
  wordsRemoved?: number
  fileSize?: number
  hasFile?: boolean
  hasTextContent?: boolean
  storageType?: string
  downloadFilename?: string
  downloadUrl?: string
}

interface DocumentVersionPanelProps {
  document: {
    id: string
    name: string
    originalName?: string
    type: string
    size: number
    uploadedAt: string
    matterName?: string
    uploadedByName?: string
  }
  onClose: () => void
  onOpenInWord: (preferDesktop?: boolean) => void
  onDownload: () => void
  onShare?: () => void
  onEmail?: () => void
  onAnalyze?: () => void
  onDelete?: () => void
  onPreview?: () => void
}

export function DocumentVersionPanel({ 
  document, 
  onClose, 
  onOpenInWord,
  onDownload,
  onShare,
  onEmail,
  onAnalyze,
  onDelete,
  onPreview
}: DocumentVersionPanelProps) {
  const navigate = useNavigate()
  const [versions, setVersions] = useState<Version[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMicrosoftIntegration, setHasMicrosoftIntegration] = useState(false)
  const [isWordDoc, setIsWordDoc] = useState(false)
  
  // Redline comparison state
  const [selectedVersions, setSelectedVersions] = useState<number[]>([])
  const [isComparing, setIsComparing] = useState(false)
  const [redlineResult, setRedlineResult] = useState<{
    html: string
    stats: { additions: number; deletions: number; unchanged: number }
  } | null>(null)
  const [showRedline, setShowRedline] = useState(false)
  
  // Expanded version details
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null)
  
  // Downloading state
  const [downloadingVersion, setDownloadingVersion] = useState<number | null>(null)

  // Check if document is a Word document
  useEffect(() => {
    const wordExtensions = ['.doc', '.docx', '.odt', '.rtf']
    const name = document.name || document.originalName || ''
    setIsWordDoc(wordExtensions.some(ext => name.toLowerCase().endsWith(ext)))
  }, [document])

  // Fetch version history
  const fetchVersions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await wordOnlineApi.getVersionHistory(document.id)
      setVersions(result.versions || [])
      setHasMicrosoftIntegration(result.hasMicrosoftIntegration)
    } catch (err: any) {
      console.error('Failed to fetch versions:', err)
      setError('Could not load version history')
      setVersions([])
    } finally {
      setIsLoading(false)
    }
  }, [document.id])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  // Toggle version selection for comparison
  const toggleVersionSelection = (versionNumber: number) => {
    setSelectedVersions(prev => {
      if (prev.includes(versionNumber)) {
        return prev.filter(v => v !== versionNumber)
      } else if (prev.length < 2) {
        return [...prev, versionNumber].sort((a, b) => a - b)
      } else {
        // Replace the oldest selection
        return [prev[1], versionNumber].sort((a, b) => a - b)
      }
    })
    setRedlineResult(null)
    setShowRedline(false)
  }

  // Compare two versions (get redline)
  const compareVersions = async () => {
    if (selectedVersions.length !== 2) return
    
    setIsComparing(true)
    try {
      const result = await wordOnlineApi.getRedline(
        document.id, 
        selectedVersions[0], 
        selectedVersions[1]
      )
      setRedlineResult({
        html: result.redline.html,
        stats: result.redline.stats
      })
      setShowRedline(true)
    } catch (err: any) {
      console.error('Failed to compare versions:', err)
      setError('Could not generate comparison')
    } finally {
      setIsComparing(false)
    }
  }

  // Get change type icon and color
  const getChangeTypeInfo = (changeType: string) => {
    switch (changeType) {
      case 'upload':
        return { icon: ArrowUpRight, color: '#22c55e', label: 'Uploaded' }
      case 'edit':
        return { icon: Edit3, color: '#3b82f6', label: 'Edited' }
      case 'restore':
        return { icon: RefreshCw, color: '#f59e0b', label: 'Restored' }
      case 'auto_save':
        return { icon: CheckCircle, color: '#8b5cf6', label: 'Auto-saved' }
      default:
        return { icon: FileText, color: '#64748b', label: 'Modified' }
    }
  }

  // Get source label
  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'word_online':
        return 'Word Online'
      case 'apex':
        return 'Apex'
      case 'upload':
        return 'Upload'
      case 'external_sync':
        return 'External Sync'
      default:
        return source
    }
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  // Generate version download filename
  // Format: "DocumentName - EditorName - Date.extension"
  const getVersionFilename = (version: Version) => {
    const originalName = document.originalName || document.name
    const ext = originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : ''
    const baseName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName
    
    const editorName = version.createdByName || 'Unknown'
    const versionDate = new Date(version.createdAt)
    const dateStr = versionDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
    
    return `${baseName} - ${editorName} - ${dateStr}${ext}`
  }

  // Download a specific version
  const downloadVersion = async (version: Version) => {
    setDownloadingVersion(version.versionNumber)
    try {
      const { blob, filename } = await wordOnlineApi.downloadVersion(document.id, version.versionNumber)
      
      // Create download link
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = filename || getVersionFilename(version)
      window.document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      window.document.body.removeChild(a)
    } catch (err: any) {
      console.error('Failed to download version:', err)
      // If download fails (maybe file not stored), show error
      setError(`Could not download version ${version.versionNumber}. ${err.message || ''}`)
    } finally {
      setDownloadingVersion(null)
    }
  }

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <History size={20} />
          <div className={styles.docInfo}>
            <h3>{document.originalName || document.name}</h3>
            <span className={styles.meta}>
              {formatFileSize(document.size)}
              {document.matterName && ` • ${document.matterName}`}
            </span>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {/* Quick Actions - Main buttons */}
      <div className={styles.quickActions}>
        {isWordDoc ? (
          <button 
            className={styles.openWordBtn}
            onClick={() => onOpenInWord(true)}
          >
            <Edit3 size={16} />
            Open in Word
          </button>
        ) : (
          <button 
            className={styles.openBtn}
            onClick={() => onOpenInWord()}
          >
            <ExternalLink size={16} />
            Open File
          </button>
        )}
        <button 
          className={styles.downloadBtn}
          onClick={onDownload}
        >
          <Download size={16} />
          Download
        </button>
      </div>

      {/* Secondary Actions */}
      <div className={styles.secondaryActions}>
        {onPreview && (
          <button 
            className={styles.actionButton}
            onClick={onPreview}
            title="Preview document content"
          >
            <Eye size={15} />
            <span>Preview</span>
          </button>
        )}
        {onShare && (
          <button 
            className={styles.actionButton}
            onClick={onShare}
            title="Share with team members"
          >
            <Share2 size={15} />
            <span>Share</span>
          </button>
        )}
        {onEmail && (
          <button 
            className={styles.actionButton}
            onClick={onEmail}
            title="Email as attachment"
          >
            <Mail size={15} />
            <span>Email</span>
          </button>
        )}
        {onAnalyze && (
          <button 
            className={styles.aiButton}
            onClick={onAnalyze}
            title="Analyze with AI"
          >
            <Sparkles size={15} />
            <span>AI Analysis</span>
          </button>
        )}
        {onDelete && (
          <button 
            className={styles.deleteButton}
            onClick={onDelete}
            title="Delete document"
          >
            <Trash2 size={15} />
            <span>Delete</span>
          </button>
        )}
      </div>

      {/* Comparison Controls */}
      {versions.length > 1 && (
        <div className={styles.compareSection}>
          <div className={styles.compareSectionHeader}>
            <GitCompare size={16} />
            <span>Compare Versions (Redline)</span>
          </div>
          {selectedVersions.length === 2 ? (
            <div className={styles.compareActions}>
              <span className={styles.selectedInfo}>
                Comparing v{selectedVersions[0]} → v{selectedVersions[1]}
              </span>
              <button 
                className={styles.compareBtn}
                onClick={compareVersions}
                disabled={isComparing}
              >
                {isComparing ? (
                  <><Loader2 size={14} className={styles.spinner} /> Comparing...</>
                ) : (
                  <><GitCompare size={14} /> View Redline</>
                )}
              </button>
              <button 
                className={styles.clearBtn}
                onClick={() => {
                  setSelectedVersions([])
                  setRedlineResult(null)
                  setShowRedline(false)
                }}
              >
                Clear
              </button>
            </div>
          ) : (
            <p className={styles.compareHint}>
              Select 2 versions below to compare changes
            </p>
          )}
        </div>
      )}

      {/* Redline Result */}
      {showRedline && redlineResult && (
        <div className={styles.redlineSection}>
          <div className={styles.redlineHeader}>
            <h4>Redline Comparison</h4>
            <div className={styles.redlineStats}>
              <span className={styles.additions}>+{redlineResult.stats.additions} added</span>
              <span className={styles.deletions}>-{redlineResult.stats.deletions} removed</span>
            </div>
            <button 
              className={styles.closeRedlineBtn}
              onClick={() => setShowRedline(false)}
            >
              <X size={14} />
            </button>
          </div>
          <div 
            className={styles.redlineContent}
            dangerouslySetInnerHTML={{ __html: redlineResult.html }}
          />
        </div>
      )}

      {/* Version History List */}
      <div className={styles.versionList}>
        <div className={styles.versionListHeader}>
          <h4>Version History</h4>
          <button 
            className={styles.refreshBtn}
            onClick={fetchVersions}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? styles.spinner : ''} />
          </button>
        </div>

        {isLoading ? (
          <div className={styles.loading}>
            <Loader2 size={24} className={styles.spinner} />
            <span>Loading version history...</span>
          </div>
        ) : error ? (
          <div className={styles.error}>
            <AlertCircle size={20} />
            <span>{error}</span>
            <button onClick={fetchVersions}>Retry</button>
          </div>
        ) : versions.length === 0 ? (
          <div className={styles.empty}>
            <History size={32} />
            <p>No version history available</p>
            <span>Versions are created when you save changes in Word</span>
          </div>
        ) : (
          <div className={styles.timeline}>
            {versions.map((version, index) => {
              const changeInfo = getChangeTypeInfo(version.changeType)
              const ChangeIcon = changeInfo.icon
              const isSelected = selectedVersions.includes(version.versionNumber)
              const isExpanded = expandedVersion === version.versionNumber
              const isLatest = index === 0

              return (
                <div 
                  key={version.id} 
                  className={`${styles.versionItem} ${isSelected ? styles.selected : ''} ${isLatest ? styles.latest : ''}`}
                >
                  <div className={styles.timelineConnector}>
                    <div 
                      className={styles.timelineDot}
                      style={{ backgroundColor: changeInfo.color }}
                    >
                      <ChangeIcon size={12} />
                    </div>
                    {index < versions.length - 1 && <div className={styles.timelineLine} />}
                  </div>

                  <div className={styles.versionContent}>
                    <div 
                      className={styles.versionHeader}
                      onClick={() => setExpandedVersion(isExpanded ? null : version.versionNumber)}
                    >
                      <div className={styles.versionMeta}>
                        <span className={styles.versionNumber}>
                          Version {version.versionNumber}
                          {isLatest && <span className={styles.latestBadge}>Current</span>}
                        </span>
                        <span className={styles.versionTime}>
                          {formatDistanceToNow(parseISO(version.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <button 
                        className={`${styles.selectBtn} ${isSelected ? styles.selectedBtn : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleVersionSelection(version.versionNumber)
                        }}
                        title={isSelected ? 'Remove from comparison' : 'Add to comparison'}
                      >
                        {isSelected ? <CheckCircle size={16} /> : <GitCompare size={16} />}
                      </button>
                    </div>

                    <div className={styles.versionDetails}>
                      <div className={styles.editorInfo}>
                        <User size={14} />
                        <span>{version.createdByName || 'Unknown'}</span>
                      </div>
                      <div className={styles.changeInfo}>
                        <span 
                          className={styles.changeType}
                          style={{ color: changeInfo.color }}
                        >
                          {changeInfo.label}
                        </span>
                        {version.source && version.source !== 'apex' && (
                          <span className={styles.source}>
                            via {getSourceLabel(version.source)}
                          </span>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className={styles.expandedDetails}>
                        <div className={styles.detailRow}>
                          <Clock size={12} />
                          <span>
                            {format(parseISO(version.createdAt), 'MMMM d, yyyy \'at\' h:mm a')}
                          </span>
                        </div>
                        {version.changeSummary && (
                          <div className={styles.detailRow}>
                            <FileText size={12} />
                            <span>{version.changeSummary}</span>
                          </div>
                        )}
                        {version.wordCount && (
                          <div className={styles.wordStats}>
                            <span>{version.wordCount.toLocaleString()} words</span>
                            {version.wordsAdded != null && version.wordsAdded > 0 && (
                              <span className={styles.added}>+{version.wordsAdded}</span>
                            )}
                            {version.wordsRemoved != null && version.wordsRemoved > 0 && (
                              <span className={styles.removed}>-{version.wordsRemoved}</span>
                            )}
                          </div>
                        )}
                        {version.versionLabel && (
                          <div className={styles.versionLabel}>
                            {version.versionLabel}
                          </div>
                        )}
                        
                        {/* Download this version button */}
                        <div className={styles.versionActions}>
                          <button
                            className={`${styles.downloadVersionBtn} ${!version.hasFile && !version.hasTextContent ? styles.downloadDisabled : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              downloadVersion(version)
                            }}
                            disabled={downloadingVersion === version.versionNumber || (!version.hasFile && !version.hasTextContent)}
                            title={
                              version.hasFile 
                                ? `Download: ${version.downloadFilename || getVersionFilename(version)}`
                                : version.hasTextContent 
                                  ? 'Download text content (original file not stored)'
                                  : 'No downloadable content available'
                            }
                          >
                            {downloadingVersion === version.versionNumber ? (
                              <><Loader2 size={14} className={styles.spinner} /> Downloading...</>
                            ) : (
                              <><Download size={14} /> Download this version</>
                            )}
                          </button>
                          <span className={styles.downloadFilename}>
                            {version.downloadFilename || getVersionFilename(version)}
                            {version.hasFile && (
                              <span className={styles.fileAvailable}>✓ File stored</span>
                            )}
                            {!version.hasFile && version.hasTextContent && (
                              <span className={styles.textOnly}>Text only</span>
                            )}
                          </span>
                          {version.fileSize && (
                            <span className={styles.versionFileSize}>
                              {formatFileSize(version.fileSize)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <button 
                      className={styles.expandToggle}
                      onClick={() => setExpandedVersion(isExpanded ? null : version.versionNumber)}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>{isExpanded ? 'Less details' : 'More details'}</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        {!hasMicrosoftIntegration && isWordDoc && (
          <div 
            className={styles.integrationHint}
            onClick={() => navigate('/app/integrations')}
            style={{ cursor: 'pointer' }}
          >
            <AlertCircle size={14} />
            <span>
              <strong>Connect Microsoft 365</strong> in Integrations for seamless Word editing with version sync
            </span>
            <ExternalLink size={12} />
          </div>
        )}
      </div>
    </div>
  )
}
