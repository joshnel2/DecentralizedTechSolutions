import { useState, useRef, useCallback, useEffect } from 'react'
import { 
  FileEdit, Upload, Sparkles, Download, FileText, X, 
  Loader2, Check, XCircle, ChevronDown, ArrowLeft,
  RotateCcw
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { parseDocument, getSupportedFileTypes } from '../utils/documentParser'
import { aiApi } from '../services/api'
import styles from './RedlineAIPage.module.css'

interface Change {
  id: string
  type: 'insertion' | 'deletion' | 'replacement'
  original: string
  replacement: string
  position: number
  status: 'pending' | 'accepted' | 'declined'
  context?: string
}

interface RedlineResult {
  originalText: string
  editedText: string
  changes: Change[]
}

export function RedlineAIPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // State
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string; type: string } | null>(null)
  const [instructions, setInstructions] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [redlineResult, setRedlineResult] = useState<RedlineResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; changeId: string } | null>(null)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    e.target.value = ''
    setIsExtracting(true)
    setError(null)

    try {
      const result = await parseDocument(file)
      if (!result.success && !result.content) {
        throw new Error(result.error || 'Failed to extract text from document')
      }
      
      setUploadedFile({
        name: file.name,
        content: result.content,
        type: file.type
      })
      setRedlineResult(null)
    } catch (err) {
      console.error('Failed to extract document text:', err)
      setError('Failed to extract text from document. Please try a different file format.')
    } finally {
      setIsExtracting(false)
    }
  }

  // Process document with AI
  const processDocument = async () => {
    if (!uploadedFile) return
    
    setIsProcessing(true)
    setError(null)

    try {
      const prompt = `You are a professional document editor. Your task is to edit the following document to improve it.

${instructions ? `EDITING INSTRUCTIONS FROM USER:\n${instructions}\n\n` : 'Make improvements for clarity, grammar, and professional tone.\n\n'}IMPORTANT RULES:
1. Always maintain proper grammar and punctuation
2. Preserve the original meaning and intent
3. Keep legal terminology accurate
4. Make the document more professional and clear

DOCUMENT TO EDIT:
---
${uploadedFile.content}
---

RESPONSE FORMAT:
You MUST respond with a valid JSON object in this exact format (no markdown, no code blocks, just raw JSON):
{
  "editedText": "The complete edited document text here",
  "changes": [
    {
      "type": "replacement",
      "original": "original text that was changed",
      "replacement": "new text that replaces it",
      "reason": "brief explanation of why this change was made"
    }
  ]
}

List ALL changes you made. Types can be:
- "insertion" (new text added, original should be empty string)
- "deletion" (text removed, replacement should be empty string)
- "replacement" (text was replaced with different text)

Be thorough - include every single change, even small grammar fixes.`

      const response = await aiApi.chat(prompt, 'redline-editor', {})
      
      // Parse the AI response
      let parsedResponse
      try {
        // Try to extract JSON from the response
        let jsonStr = response.response
        
        // Remove markdown code blocks if present
        jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '')
        
        // Try to find JSON object in the response
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          jsonStr = jsonMatch[0]
        }
        
        parsedResponse = JSON.parse(jsonStr)
      } catch (parseErr) {
        console.error('Failed to parse AI response:', parseErr)
        console.log('Raw response:', response.response)
        throw new Error('Failed to parse AI response. Please try again.')
      }

      // Build changes array with IDs and positions
      const changes: Change[] = (parsedResponse.changes || []).map((change: any, index: number) => ({
        id: `change-${index}-${Date.now()}`,
        type: change.type || 'replacement',
        original: change.original || '',
        replacement: change.replacement || '',
        position: index,
        status: 'pending' as const,
        context: change.reason
      }))

      setRedlineResult({
        originalText: uploadedFile.content,
        editedText: parsedResponse.editedText || uploadedFile.content,
        changes
      })
    } catch (err) {
      console.error('AI processing error:', err)
      setError(err instanceof Error ? err.message : 'Failed to process document. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle right-click on a change
  const handleContextMenu = useCallback((e: React.MouseEvent, changeId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, changeId })
  }, [])

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // Accept a change
  const acceptChange = (changeId: string) => {
    if (!redlineResult) return
    setRedlineResult({
      ...redlineResult,
      changes: redlineResult.changes.map(c => 
        c.id === changeId ? { ...c, status: 'accepted' } : c
      )
    })
    setContextMenu(null)
  }

  // Decline a change
  const declineChange = (changeId: string) => {
    if (!redlineResult) return
    setRedlineResult({
      ...redlineResult,
      changes: redlineResult.changes.map(c => 
        c.id === changeId ? { ...c, status: 'declined' } : c
      )
    })
    setContextMenu(null)
  }

  // Accept all changes
  const acceptAllChanges = () => {
    if (!redlineResult) return
    setRedlineResult({
      ...redlineResult,
      changes: redlineResult.changes.map(c => ({ ...c, status: 'accepted' }))
    })
  }

  // Decline all changes
  const declineAllChanges = () => {
    if (!redlineResult) return
    setRedlineResult({
      ...redlineResult,
      changes: redlineResult.changes.map(c => ({ ...c, status: 'declined' }))
    })
  }

  // Reset all changes to pending
  const resetAllChanges = () => {
    if (!redlineResult) return
    setRedlineResult({
      ...redlineResult,
      changes: redlineResult.changes.map(c => ({ ...c, status: 'pending' }))
    })
  }

  // Generate final document based on accepted/declined changes
  const generateFinalDocument = useCallback(() => {
    if (!redlineResult || !uploadedFile) return uploadedFile?.content || ''
    
    // Start with original text
    let finalText = redlineResult.originalText
    
    // Apply only accepted changes (or pending changes use original)
    // For pending, use original text (decline behavior)
    redlineResult.changes
      .filter(c => c.status === 'accepted')
      .forEach(change => {
        if (change.type === 'deletion') {
          // Remove the original text
          finalText = finalText.replace(change.original, '')
        } else if (change.type === 'insertion') {
          // Insertions are trickier - for now just use edited text for accepted
        } else if (change.type === 'replacement') {
          finalText = finalText.replace(change.original, change.replacement)
        }
      })
    
    // If all changes are accepted, just return the edited text
    const allAccepted = redlineResult.changes.every(c => c.status === 'accepted')
    if (allAccepted) {
      return redlineResult.editedText
    }
    
    // If all changes are declined or pending, return original
    const allDeclinedOrPending = redlineResult.changes.every(c => c.status === 'declined' || c.status === 'pending')
    if (allDeclinedOrPending) {
      return redlineResult.originalText
    }
    
    return finalText
  }, [redlineResult, uploadedFile])

  // Download functions
  const downloadDocument = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setDownloadMenuOpen(false)
  }

  const downloadRedlined = () => {
    if (!redlineResult || !uploadedFile) return
    
    // Create a redlined version with markup
    let redlinedContent = '=== REDLINED DOCUMENT ===\n'
    redlinedContent += `Original File: ${uploadedFile.name}\n`
    redlinedContent += `Total Changes: ${redlineResult.changes.length}\n`
    redlinedContent += '========================\n\n'
    
    // Add the edited text with change annotations
    redlinedContent += redlineResult.editedText + '\n\n'
    
    redlinedContent += '=== CHANGE LOG ===\n'
    redlineResult.changes.forEach((change, i) => {
      redlinedContent += `\n[Change ${i + 1}] ${change.type.toUpperCase()}\n`
      if (change.original) redlinedContent += `  Original: "${change.original}"\n`
      if (change.replacement) redlinedContent += `  Replacement: "${change.replacement}"\n`
      if (change.context) redlinedContent += `  Reason: ${change.context}\n`
      redlinedContent += `  Status: ${change.status}\n`
    })
    
    const baseName = uploadedFile.name.replace(/\.[^/.]+$/, '')
    downloadDocument(redlinedContent, `${baseName}_redlined.txt`)
  }

  const downloadFinal = () => {
    if (!redlineResult || !uploadedFile) return
    const baseName = uploadedFile.name.replace(/\.[^/.]+$/, '')
    downloadDocument(redlineResult.editedText, `${baseName}_final.txt`)
  }

  const downloadCustom = () => {
    if (!uploadedFile) return
    const finalContent = generateFinalDocument()
    const baseName = uploadedFile.name.replace(/\.[^/.]+$/, '')
    downloadDocument(finalContent, `${baseName}_custom.txt`)
  }

  const downloadOriginal = () => {
    if (!uploadedFile) return
    const baseName = uploadedFile.name.replace(/\.[^/.]+$/, '')
    downloadDocument(uploadedFile.content, `${baseName}_original.txt`)
  }

  // Render the document with tracked changes
  const renderTrackedChanges = () => {
    if (!redlineResult) return null

    return (
      <div className={styles.trackedChangesContainer}>
        {redlineResult.changes.map((change) => (
          <div 
            key={change.id}
            className={clsx(
              styles.changeItem,
              styles[change.type],
              styles[change.status]
            )}
            onContextMenu={(e) => handleContextMenu(e, change.id)}
          >
            <div className={styles.changeHeader}>
              <span className={styles.changeType}>
                {change.type === 'insertion' && '+ Added'}
                {change.type === 'deletion' && '− Deleted'}
                {change.type === 'replacement' && '↔ Changed'}
              </span>
              <span className={clsx(styles.changeStatus, styles[change.status])}>
                {change.status === 'pending' && 'Pending'}
                {change.status === 'accepted' && '✓ Accepted'}
                {change.status === 'declined' && '✗ Declined'}
              </span>
            </div>
            
            <div className={styles.changeContent}>
              {change.original && (
                <div className={styles.originalText}>
                  <span className={styles.label}>Original:</span>
                  <span className={styles.deleted}>{change.original}</span>
                </div>
              )}
              {change.replacement && (
                <div className={styles.replacementText}>
                  <span className={styles.label}>New:</span>
                  <span className={styles.inserted}>{change.replacement}</span>
                </div>
              )}
            </div>
            
            {change.context && (
              <div className={styles.changeReason}>
                <Sparkles size={12} />
                {change.context}
              </div>
            )}

            <div className={styles.changeActions}>
              <button 
                className={clsx(styles.actionBtn, styles.acceptBtn)}
                onClick={() => acceptChange(change.id)}
                disabled={change.status === 'accepted'}
              >
                <Check size={14} /> Accept
              </button>
              <button 
                className={clsx(styles.actionBtn, styles.declineBtn)}
                onClick={() => declineChange(change.id)}
                disabled={change.status === 'declined'}
              >
                <XCircle size={14} /> Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.redlinePage}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/app/ai')}>
          <ArrowLeft size={18} />
          Back to AI Assistant
        </button>
        <div className={styles.headerTitle}>
          <FileEdit size={24} />
          <h1>Redline AI</h1>
        </div>
        <p className={styles.headerDesc}>
          Upload a document, provide optional instructions, and let AI suggest improvements with tracked changes.
        </p>
      </div>

      {!redlineResult ? (
        // Upload & Instructions View
        <div className={styles.setupContainer}>
          {/* File Upload */}
          <div className={styles.uploadSection}>
            <h3>1. Upload Document</h3>
            
            {isExtracting ? (
              <div className={styles.uploadBox}>
                <Loader2 size={32} className={styles.spinner} />
                <span>Extracting text from document...</span>
              </div>
            ) : uploadedFile ? (
              <div className={styles.uploadedFile}>
                <FileText size={24} />
                <div className={styles.fileInfo}>
                  <span className={styles.fileName}>{uploadedFile.name}</span>
                  <span className={styles.fileSize}>
                    {uploadedFile.content.length.toLocaleString()} characters extracted
                  </span>
                </div>
                <button 
                  className={styles.removeBtn}
                  onClick={() => setUploadedFile(null)}
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <button 
                className={styles.uploadBox}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={32} />
                <span>Click to upload or drag & drop</span>
                <span className={styles.fileTypes}>PDF, DOCX, DOC, TXT, RTF</span>
              </button>
            )}
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              accept={getSupportedFileTypes()}
            />
          </div>

          {/* Instructions */}
          <div className={styles.instructionsSection}>
            <h3>2. Add Instructions (Optional)</h3>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="E.g., 'Make this more formal', 'Simplify the language', 'Fix grammar and punctuation', 'Make it more concise'..."
              rows={4}
            />
            <p className={styles.hint}>
              Leave blank for general improvements to grammar, clarity, and professionalism.
            </p>
          </div>

          {/* Process Button */}
          <button
            className={styles.processBtn}
            onClick={processDocument}
            disabled={!uploadedFile || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 size={20} className={styles.spinner} />
                Processing with AI...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Generate Redline
              </>
            )}
          </button>

          {error && (
            <div className={styles.error}>
              <XCircle size={18} />
              {error}
            </div>
          )}
        </div>
      ) : (
        // Results View
        <div className={styles.resultsContainer}>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <span className={styles.changeCount}>
                {redlineResult.changes.length} change{redlineResult.changes.length !== 1 ? 's' : ''} found
              </span>
              <span className={styles.statusSummary}>
                <span className={styles.accepted}>
                  {redlineResult.changes.filter(c => c.status === 'accepted').length} accepted
                </span>
                <span className={styles.declined}>
                  {redlineResult.changes.filter(c => c.status === 'declined').length} declined
                </span>
                <span className={styles.pending}>
                  {redlineResult.changes.filter(c => c.status === 'pending').length} pending
                </span>
              </span>
            </div>
            <div className={styles.toolbarRight}>
              <button className={styles.toolBtn} onClick={acceptAllChanges}>
                <Check size={16} /> Accept All
              </button>
              <button className={styles.toolBtn} onClick={declineAllChanges}>
                <XCircle size={16} /> Decline All
              </button>
              <button className={styles.toolBtn} onClick={resetAllChanges}>
                <RotateCcw size={16} /> Reset
              </button>
              
              <div className={styles.downloadDropdown}>
                <button 
                  className={styles.downloadBtn}
                  onClick={() => setDownloadMenuOpen(!downloadMenuOpen)}
                >
                  <Download size={16} />
                  Download
                  <ChevronDown size={14} />
                </button>
                {downloadMenuOpen && (
                  <div className={styles.downloadMenu}>
                    <button onClick={downloadCustom}>
                      <FileText size={16} />
                      <div>
                        <span>This Version</span>
                        <small>Based on your accept/decline choices</small>
                      </div>
                    </button>
                    <button onClick={downloadFinal}>
                      <Check size={16} />
                      <div>
                        <span>Final (All Changes)</span>
                        <small>All AI suggestions applied</small>
                      </div>
                    </button>
                    <button onClick={downloadRedlined}>
                      <FileEdit size={16} />
                      <div>
                        <span>Redlined Version</span>
                        <small>With change log and annotations</small>
                      </div>
                    </button>
                    <button onClick={downloadOriginal}>
                      <RotateCcw size={16} />
                      <div>
                        <span>Original Document</span>
                        <small>Unmodified source document</small>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Changes List */}
          <div className={styles.changesPanel}>
            <h3>Tracked Changes</h3>
            <p className={styles.hint}>Right-click on any change to accept or decline it.</p>
            {renderTrackedChanges()}
          </div>

          {/* Document Preview */}
          <div className={styles.previewPanel}>
            <div className={styles.previewTabs}>
              <h3>Document Preview</h3>
            </div>
            <div className={styles.previewContent}>
              <pre>{generateFinalDocument()}</pre>
            </div>
          </div>

          {/* Start Over Button */}
          <button 
            className={styles.startOverBtn}
            onClick={() => {
              setRedlineResult(null)
              setUploadedFile(null)
              setInstructions('')
            }}
          >
            <RotateCcw size={18} />
            Start Over with New Document
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={() => acceptChange(contextMenu.changeId)}>
            <Check size={14} /> Accept Change
          </button>
          <button onClick={() => declineChange(contextMenu.changeId)}>
            <XCircle size={14} /> Decline Change
          </button>
        </div>
      )}
    </div>
  )
}
