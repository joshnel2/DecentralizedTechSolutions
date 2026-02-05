import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, GitCompare, FileText, Download,
  Loader2, AlertCircle, Check, User, Clock,
  ArrowLeftRight, Maximize2, Minimize2
} from 'lucide-react'
import { driveApi } from '../services/api'
import { format, parseISO } from 'date-fns'
import styles from './DocumentComparePage.module.css'

interface VersionInfo {
  versionNumber: number
  versionLabel: string | null
  content: string
  wordCount: number
  createdBy: string
  createdAt: string
}

interface DiffResult {
  type: 'equal' | 'insert' | 'delete' | 'replace'
  oldText: string
  newText: string
  oldStart: number
  newStart: number
}

// Simple word-level diff algorithm
function computeWordDiff(oldText: string, newText: string): DiffResult[] {
  const oldWords = oldText.split(/(\s+)/)
  const newWords = newText.split(/(\s+)/)
  
  const results: DiffResult[] = []
  let i = 0, j = 0
  
  while (i < oldWords.length || j < newWords.length) {
    if (i >= oldWords.length) {
      // Remaining words in new text are insertions
      results.push({
        type: 'insert',
        oldText: '',
        newText: newWords.slice(j).join(''),
        oldStart: i,
        newStart: j
      })
      break
    }
    
    if (j >= newWords.length) {
      // Remaining words in old text are deletions
      results.push({
        type: 'delete',
        oldText: oldWords.slice(i).join(''),
        newText: '',
        oldStart: i,
        newStart: j
      })
      break
    }
    
    if (oldWords[i] === newWords[j]) {
      // Words match
      results.push({
        type: 'equal',
        oldText: oldWords[i],
        newText: newWords[j],
        oldStart: i,
        newStart: j
      })
      i++
      j++
    } else {
      // Words differ - find the next matching point
      let foundMatch = false
      
      // Look ahead in new text for current old word
      for (let k = j + 1; k < Math.min(j + 10, newWords.length); k++) {
        if (oldWords[i] === newWords[k]) {
          // Insert words from new text
          results.push({
            type: 'insert',
            oldText: '',
            newText: newWords.slice(j, k).join(''),
            oldStart: i,
            newStart: j
          })
          j = k
          foundMatch = true
          break
        }
      }
      
      if (!foundMatch) {
        // Look ahead in old text for current new word
        for (let k = i + 1; k < Math.min(i + 10, oldWords.length); k++) {
          if (oldWords[k] === newWords[j]) {
            // Delete words from old text
            results.push({
              type: 'delete',
              oldText: oldWords.slice(i, k).join(''),
              newText: '',
              oldStart: i,
              newStart: j
            })
            i = k
            foundMatch = true
            break
          }
        }
      }
      
      if (!foundMatch) {
        // Simple replacement
        results.push({
          type: 'replace',
          oldText: oldWords[i],
          newText: newWords[j],
          oldStart: i,
          newStart: j
        })
        i++
        j++
      }
    }
  }
  
  return results
}

export function DocumentComparePage() {
  const navigate = useNavigate()
  const { documentId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const version1Param = searchParams.get('v1')
  const version2Param = searchParams.get('v2')
  
  const [versions, setVersions] = useState<Array<{
    id: string
    versionNumber: number
    versionLabel: string | null
    createdBy: string
    createdByName: string
    createdAt: string
    wordCount: number
  }>>([])
  const [documentName, setDocumentName] = useState('')
  
  const [version1, setVersion1] = useState<VersionInfo | null>(null)
  const [version2, setVersion2] = useState<VersionInfo | null>(null)
  const [selectedV1, setSelectedV1] = useState<number>(parseInt(version1Param || '0'))
  const [selectedV2, setSelectedV2] = useState<number>(parseInt(version2Param || '0'))
  
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified' | 'changes-only'>('side-by-side')
  const [showLineNumbers, setShowLineNumbers] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Load versions list
  useEffect(() => {
    if (!documentId) return
    loadVersions()
  }, [documentId])

  // Compare when versions are selected
  useEffect(() => {
    if (selectedV1 > 0 && selectedV2 > 0 && selectedV1 !== selectedV2) {
      compareVersions()
    }
  }, [selectedV1, selectedV2])

  const loadVersions = async () => {
    try {
      setLoading(true)
      const result = await driveApi.getVersions(documentId!)
      setVersions(result.versions || [])
      setDocumentName(result.documentName || 'Document')
      
      // Auto-select versions if not specified
      if (result.versions?.length >= 2) {
        const latestVersion = result.versions[0].versionNumber
        const previousVersion = result.versions[1].versionNumber
        
        if (!selectedV1) setSelectedV1(previousVersion)
        if (!selectedV2) setSelectedV2(latestVersion)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load versions')
    } finally {
      setLoading(false)
    }
  }

  const compareVersions = async () => {
    if (!documentId || selectedV1 === selectedV2) return
    
    try {
      setComparing(true)
      setError(null)
      
      const result = await driveApi.compareVersions(documentId, selectedV1, selectedV2)
      
      setVersion1({
        versionNumber: result.version1.versionNumber,
        versionLabel: result.version1.versionLabel,
        content: result.version1.content || '',
        wordCount: result.version1.wordCount || 0,
        createdBy: result.version1.createdBy || 'Unknown',
        createdAt: result.version1.createdAt,
      })
      
      setVersion2({
        versionNumber: result.version2.versionNumber,
        versionLabel: result.version2.versionLabel,
        content: result.version2.content || '',
        wordCount: result.version2.wordCount || 0,
        createdBy: result.version2.createdBy || 'Unknown',
        createdAt: result.version2.createdAt,
      })
      
      // Update URL params
      setSearchParams({ v1: String(selectedV1), v2: String(selectedV2) })
    } catch (err: any) {
      setError(err.message || 'Failed to compare versions')
    } finally {
      setComparing(false)
    }
  }

  // Compute diff
  const diff = useMemo(() => {
    if (!version1 || !version2) return []
    return computeWordDiff(version1.content, version2.content)
  }, [version1, version2])

  // Calculate stats
  const stats = useMemo(() => {
    const insertions = diff.filter(d => d.type === 'insert').length
    const deletions = diff.filter(d => d.type === 'delete').length
    const replacements = diff.filter(d => d.type === 'replace').length
    const wordDiff = (version2?.wordCount || 0) - (version1?.wordCount || 0)
    
    return { insertions, deletions, replacements, wordDiff }
  }, [diff, version1, version2])

  // Render diff with highlighting
  const renderDiff = (mode: 'old' | 'new' | 'unified') => {
    if (!diff.length) return <div className={styles.emptyDiff}>No differences found</div>
    
    return diff.map((d, i) => {
      if (d.type === 'equal') {
        return <span key={i} className={styles.equal}>{d.oldText}</span>
      }
      
      if (mode === 'unified') {
        if (d.type === 'delete') {
          return <span key={i} className={styles.deleted}>{d.oldText}</span>
        }
        if (d.type === 'insert') {
          return <span key={i} className={styles.inserted}>{d.newText}</span>
        }
        if (d.type === 'replace') {
          return (
            <span key={i}>
              <span className={styles.deleted}>{d.oldText}</span>
              <span className={styles.inserted}>{d.newText}</span>
            </span>
          )
        }
      }
      
      if (mode === 'old') {
        if (d.type === 'delete' || d.type === 'replace') {
          return <span key={i} className={styles.deleted}>{d.oldText}</span>
        }
        return null
      }
      
      if (mode === 'new') {
        if (d.type === 'insert' || d.type === 'replace') {
          return <span key={i} className={styles.inserted}>{d.newText}</span>
        }
        return null
      }
      
      return null
    })
  }

  const renderChangesOnly = () => {
    const changes = diff.filter(d => d.type !== 'equal')
    
    if (!changes.length) {
      return (
        <div className={styles.noChanges}>
          <Check size={48} />
          <h3>No differences found</h3>
          <p>These versions are identical</p>
        </div>
      )
    }
    
    return (
      <div className={styles.changesList}>
        {changes.map((change, i) => (
          <div key={i} className={`${styles.changeItem} ${styles[change.type]}`}>
            <div className={styles.changeHeader}>
              <span className={styles.changeType}>
                {change.type === 'insert' && '+ Added'}
                {change.type === 'delete' && '− Removed'}
                {change.type === 'replace' && '↔ Changed'}
              </span>
            </div>
            <div className={styles.changeContent}>
              {(change.type === 'delete' || change.type === 'replace') && (
                <div className={styles.oldContent}>
                  <span className={styles.label}>Was:</span>
                  <span className={styles.text}>{change.oldText}</span>
                </div>
              )}
              {(change.type === 'insert' || change.type === 'replace') && (
                <div className={styles.newContent}>
                  <span className={styles.label}>Now:</span>
                  <span className={styles.text}>{change.newText}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content)
  }

  const downloadRedline = () => {
    if (!version1 || !version2) return
    
    let content = `REDLINE COMPARISON\n`
    content += `==================\n\n`
    content += `Document: ${documentName}\n`
    content += `Comparing Version ${version1.versionNumber} → Version ${version2.versionNumber}\n\n`
    content += `Version ${version1.versionNumber}: ${version1.createdBy} on ${format(parseISO(version1.createdAt), 'MMM d, yyyy h:mm a')}\n`
    content += `Version ${version2.versionNumber}: ${version2.createdBy} on ${format(parseISO(version2.createdAt), 'MMM d, yyyy h:mm a')}\n\n`
    content += `SUMMARY\n`
    content += `-------\n`
    content += `Additions: ${stats.insertions}\n`
    content += `Deletions: ${stats.deletions}\n`
    content += `Changes: ${stats.replacements}\n`
    content += `Word count change: ${stats.wordDiff > 0 ? '+' : ''}${stats.wordDiff}\n\n`
    content += `CHANGES\n`
    content += `-------\n\n`
    
    diff.filter(d => d.type !== 'equal').forEach((change, i) => {
      content += `[${i + 1}] ${change.type.toUpperCase()}\n`
      if (change.oldText) content += `  - ${change.oldText}\n`
      if (change.newText) content += `  + ${change.newText}\n`
      content += `\n`
    })
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${documentName}_redline_v${version1.versionNumber}_v${version2.versionNumber}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spinning} />
          <span>Loading document versions...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.container} ${isFullscreen ? styles.fullscreen : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon}>
            <GitCompare size={24} />
          </div>
          <div>
            <h1>Compare Versions</h1>
            <p className={styles.docName}>
              <FileText size={14} />
              {documentName}
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.iconBtn}
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button className={styles.downloadBtn} onClick={downloadRedline} disabled={!version1 || !version2}>
            <Download size={18} />
            Export Redline
          </button>
        </div>
      </div>

      {/* Version Selectors */}
      <div className={styles.versionSelectors}>
        <div className={styles.versionSelect}>
          <label>Original Version</label>
          <select 
            value={selectedV1} 
            onChange={e => setSelectedV1(parseInt(e.target.value))}
          >
            <option value={0}>Select version...</option>
            {versions.map(v => (
              <option key={v.id} value={v.versionNumber}>
                v{v.versionNumber} - {v.createdByName} ({format(parseISO(v.createdAt), 'MMM d, yyyy')})
              </option>
            ))}
          </select>
        </div>
        
        <div className={styles.compareArrow}>
          <ArrowLeftRight size={24} />
        </div>
        
        <div className={styles.versionSelect}>
          <label>New Version</label>
          <select 
            value={selectedV2} 
            onChange={e => setSelectedV2(parseInt(e.target.value))}
          >
            <option value={0}>Select version...</option>
            {versions.map(v => (
              <option key={v.id} value={v.versionNumber}>
                v{v.versionNumber} - {v.createdByName} ({format(parseISO(v.createdAt), 'MMM d, yyyy')})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.viewModes}>
          <button 
            className={viewMode === 'side-by-side' ? styles.active : ''}
            onClick={() => setViewMode('side-by-side')}
          >
            Side by Side
          </button>
          <button 
            className={viewMode === 'unified' ? styles.active : ''}
            onClick={() => setViewMode('unified')}
          >
            Unified
          </button>
          <button 
            className={viewMode === 'changes-only' ? styles.active : ''}
            onClick={() => setViewMode('changes-only')}
          >
            Changes Only
          </button>
        </div>
        
        {(version1 && version2) && (
          <div className={styles.stats}>
            <span className={styles.statAdded}>+{stats.insertions} added</span>
            <span className={styles.statRemoved}>−{stats.deletions} removed</span>
            <span className={styles.statChanged}>↔{stats.replacements} changed</span>
            <span className={styles.statWords}>
              {stats.wordDiff > 0 ? '+' : ''}{stats.wordDiff} words
            </span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className={styles.error}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Comparing indicator */}
      {comparing && (
        <div className={styles.comparing}>
          <Loader2 size={24} className={styles.spinning} />
          <span>Comparing versions...</span>
        </div>
      )}

      {/* Main Content */}
      {(!comparing && version1 && version2) && (
        <div className={styles.content}>
          {viewMode === 'side-by-side' && (
            <div className={styles.sideBySide}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <span className={styles.versionBadge}>v{version1.versionNumber}</span>
                  <span className={styles.panelTitle}>
                    {version1.versionLabel || `Version ${version1.versionNumber}`}
                  </span>
                  <div className={styles.panelMeta}>
                    <User size={14} />
                    {version1.createdBy}
                    <Clock size={14} />
                    {format(parseISO(version1.createdAt), 'MMM d, yyyy')}
                  </div>
                </div>
                <div className={styles.panelContent}>
                  <pre>{renderDiff('old')}</pre>
                </div>
              </div>
              
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <span className={`${styles.versionBadge} ${styles.new}`}>v{version2.versionNumber}</span>
                  <span className={styles.panelTitle}>
                    {version2.versionLabel || `Version ${version2.versionNumber}`}
                  </span>
                  <div className={styles.panelMeta}>
                    <User size={14} />
                    {version2.createdBy}
                    <Clock size={14} />
                    {format(parseISO(version2.createdAt), 'MMM d, yyyy')}
                  </div>
                </div>
                <div className={styles.panelContent}>
                  <pre>{renderDiff('new')}</pre>
                </div>
              </div>
            </div>
          )}
          
          {viewMode === 'unified' && (
            <div className={styles.unified}>
              <div className={styles.panelHeader}>
                <span>Unified View</span>
                <span className={styles.legend}>
                  <span className={styles.legendDeleted}>Removed</span>
                  <span className={styles.legendInserted}>Added</span>
                </span>
              </div>
              <div className={styles.panelContent}>
                <pre>{renderDiff('unified')}</pre>
              </div>
            </div>
          )}
          
          {viewMode === 'changes-only' && renderChangesOnly()}
        </div>
      )}

      {/* Empty state */}
      {(!comparing && !version1 && !version2 && versions.length >= 2) && (
        <div className={styles.emptyState}>
          <GitCompare size={48} />
          <h3>Select versions to compare</h3>
          <p>Choose two versions above to see the differences</p>
        </div>
      )}

      {(!comparing && versions.length < 2) && (
        <div className={styles.emptyState}>
          <FileText size={48} />
          <h3>Not enough versions</h3>
          <p>This document needs at least 2 versions to compare</p>
          <button onClick={() => navigate(-1)}>Go Back</button>
        </div>
      )}
    </div>
  )
}
