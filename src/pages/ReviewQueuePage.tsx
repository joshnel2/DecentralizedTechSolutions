import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ClipboardCheck, CheckCircle, XCircle, FileText, StickyNote, 
  ListTodo, AlertTriangle, Clock, RefreshCw, Loader2, Inbox, 
  ChevronDown, ChevronUp, Star, ThumbsUp, ThumbsDown, Send
} from 'lucide-react'
import { aiApi } from '../services/api'
import styles from './ReviewQueuePage.module.css'

interface ReviewDeliverable {
  id: string
  name?: string
  title?: string
  content?: string
  contentPreview?: string
  contentLength?: number
  description?: string
  type?: string
  matterName?: string
  matterId?: string
  priority?: string
  dueDate?: string
  status?: string
  flags?: string[]
  createdAt?: string
}

interface ReviewItem {
  id: string
  goal: string
  status: string
  reviewStatus: string
  reviewFeedback?: string
  reviewedAt?: string
  createdAt: string
  completedAt?: string
  createdByName?: string
  result?: {
    summary?: string
    evaluation?: { score?: number; issues?: string[]; strengths?: string[] }
    deliverables?: { documents?: string[]; notes?: number; tasks?: string[]; events?: string[] }
    remaining_work?: string[]
    key_findings?: string[]
  }
  evaluationScore?: number
  evaluationIssues?: string[]
  evaluationStrengths?: string[]
  deliverables: {
    documents: ReviewDeliverable[]
    notes: ReviewDeliverable[]
    tasks: ReviewDeliverable[]
    events: ReviewDeliverable[]
  }
  flags: Array<{ type: string; name: string; issue: string }>
  totalDeliverables: number
}

type TabFilter = 'pending_review' | 'approved' | 'rejected' | 'all'

export function ReviewQueuePage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabFilter>('pending_review')
  const [pendingCount, setPendingCount] = useState(0)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [feedbackText, setFeedbackText] = useState<Record<string, string>>({})
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  type FeedbackState = Record<string, string>

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const data = await aiApi.getReviewQueue(activeTab, 20)
      setItems(data.items || [])
      setPendingCount(data.pendingCount || 0)
    } catch (err) {
      console.error('Failed to fetch review queue:', err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleApprove = async (taskId: string) => {
    setActionInProgress(taskId)
    try {
      await aiApi.approveReviewItem(taskId, feedbackText[taskId] || undefined)
      await fetchQueue()
      setFeedbackText((prev: FeedbackState) => { const n = { ...prev }; delete n[taskId]; return n })
    } catch (err) {
      console.error('Failed to approve:', err)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleReject = async (taskId: string) => {
    const feedback = feedbackText[taskId]?.trim()
    if (!feedback) {
      alert('Please enter feedback explaining what needs to be fixed.')
      return
    }
    setActionInProgress(taskId)
    try {
      await aiApi.rejectReviewItem(taskId, feedback)
      await fetchQueue()
      setFeedbackText((prev: FeedbackState) => { const n = { ...prev }; delete n[taskId]; return n })
    } catch (err) {
      console.error('Failed to reject:', err)
    } finally {
      setActionInProgress(null)
    }
  }

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return d.toLocaleDateString()
  }

  const getScoreClass = (score?: number) => {
    if (!score && score !== 0) return ''
    if (score >= 70) return styles.scoreGood
    if (score >= 40) return styles.scoreOk
    return styles.scoreBad
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>
          <ClipboardCheck size={24} />
          <div>
            <h1>Review Queue {pendingCount > 0 && <span className={styles.badge}>{pendingCount}</span>}</h1>
            <p>Review and approve agent work product before it goes to clients</p>
          </div>
        </div>
        <button className={styles.refreshBtn} onClick={fetchQueue} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      <div className={styles.tabs}>
        {([
          ['pending_review', 'Needs Review'],
          ['approved', 'Approved'],
          ['rejected', 'Rejected'],
          ['all', 'All'],
        ] as [TabFilter, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`${styles.tab} ${activeTab === key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loader}>
          <Loader2 size={20} className="spin" />
          Loading review queue...
        </div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <Inbox size={40} />
          <h3>{activeTab === 'pending_review' ? 'No tasks waiting for review' : 'No tasks found'}</h3>
          <p>{activeTab === 'pending_review' 
            ? 'Completed agent tasks will appear here for your review.' 
            : 'Try a different filter or run some background agent tasks.'}
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map(item => {
            const expanded = expandedItems.has(item.id)
            const isActioning = actionInProgress === item.id
            const isPending = item.reviewStatus === 'pending'

            return (
              <div key={item.id} className={styles.card}>
                {/* Header */}
                <div className={styles.cardHeader}>
                  <div style={{ flex: 1 }}>
                    <p className={styles.cardGoal}>{item.goal}</p>
                    <div className={styles.cardMeta}>
                      <span><Clock size={12} /> {formatTime(item.completedAt)}</span>
                      <span><ListTodo size={12} /> {item.totalDeliverables} deliverable{item.totalDeliverables !== 1 ? 's' : ''}</span>
                      {item.flags.length > 0 && (
                        <span style={{ color: '#fbbf24' }}>
                          <AlertTriangle size={12} /> {item.flags.length} flag{item.flags.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.evaluationScore != null && item.evaluationScore >= 0 && (
                    <div className={`${styles.score} ${getScoreClass(item.evaluationScore)}`}>
                      <Star size={14} /> {item.evaluationScore}/100
                    </div>
                  )}
                  {item.reviewStatus === 'approved' && (
                    <div className={styles.statusApproved}><CheckCircle size={14} /> Approved</div>
                  )}
                  {item.reviewStatus === 'rejected' && (
                    <div className={styles.statusRejected}><XCircle size={14} /> Rejected</div>
                  )}
                </div>

                {/* Summary */}
                {item.result?.summary && (
                  <div className={styles.summary}>
                    {item.result.summary.substring(0, expanded ? 1000 : 200)}
                    {item.result.summary.length > 200 && !expanded && '...'}
                  </div>
                )}

                {/* Flags */}
                {item.flags.length > 0 && (
                  <div className={styles.flags}>
                    {item.flags.slice(0, expanded ? 10 : 2).map((flag, i) => (
                      <div key={i} className={styles.flag}>
                        <AlertTriangle size={14} />
                        <strong>{flag.name}:</strong> {flag.issue}
                      </div>
                    ))}
                    {!expanded && item.flags.length > 2 && (
                      <button className={styles.expandBtn} onClick={() => toggleExpand(item.id)}>
                        +{item.flags.length - 2} more flags
                      </button>
                    )}
                  </div>
                )}

                {/* Deliverables (expandable) */}
                <div className={styles.deliverables}>
                  <button className={styles.expandBtn} onClick={() => toggleExpand(item.id)}>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {expanded ? 'Collapse deliverables' : 'Show deliverables'}
                  </button>

                  {expanded && (
                    <>
                      {/* Documents */}
                      {item.deliverables.documents.length > 0 && (
                        <div className={styles.delivSection}>
                          <p className={styles.delivSectionTitle}>Documents</p>
                          {item.deliverables.documents.map(doc => (
                            <div key={doc.id} className={styles.delivItem}>
                              <FileText size={16} color="#60a5fa" />
                              <div>
                                <div className={styles.delivName}>{doc.name}</div>
                                {doc.contentPreview && (
                                  <div className={styles.delivPreview}>{doc.contentPreview}</div>
                                )}
                                <div className={styles.delivMeta}>
                                  {doc.contentLength ? `${doc.contentLength.toLocaleString()} chars` : ''}
                                  {doc.flags && doc.flags.length > 0 && (
                                    <span style={{ color: '#fbbf24', marginLeft: 8 }}>
                                      {doc.flags.join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Notes */}
                      {item.deliverables.notes.length > 0 && (
                        <div className={styles.delivSection}>
                          <p className={styles.delivSectionTitle}>Notes</p>
                          {item.deliverables.notes.map(note => (
                            <div key={note.id} className={styles.delivItem}>
                              <StickyNote size={16} color="#a78bfa" />
                              <div>
                                <div className={styles.delivName}>
                                  {note.matterName ? `Note on ${note.matterName}` : 'Matter Note'}
                                </div>
                                {note.content && (
                                  <div className={styles.delivPreview}>{note.content}</div>
                                )}
                                <div className={styles.delivMeta}>
                                  {note.contentLength ? `${note.contentLength.toLocaleString()} chars` : ''} · {note.type}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Tasks */}
                      {item.deliverables.tasks.length > 0 && (
                        <div className={styles.delivSection}>
                          <p className={styles.delivSectionTitle}>Tasks Created</p>
                          {item.deliverables.tasks.map(task => (
                            <div key={task.id} className={styles.delivItem}>
                              <ListTodo size={16} color="#34d399" />
                              <div>
                                <div className={styles.delivName}>{task.title}</div>
                                {task.description && (
                                  <div className={styles.delivPreview}>
                                    {task.description.substring(0, 150)}
                                  </div>
                                )}
                                <div className={styles.delivMeta}>
                                  {task.priority && `${task.priority} priority`}
                                  {task.dueDate && ` · Due ${new Date(task.dueDate).toLocaleDateString()}`}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Evaluation details */}
                      {(item.evaluationIssues?.length || item.evaluationStrengths?.length) && (
                        <div className={styles.delivSection}>
                          <p className={styles.delivSectionTitle}>Agent Self-Evaluation</p>
                          {item.evaluationStrengths?.map((s, i) => (
                            <div key={`s${i}`} className={styles.delivItem}>
                              <CheckCircle size={14} color="#4ade80" />
                              <span style={{ color: '#94a3b8', fontSize: 12 }}>{s}</span>
                            </div>
                          ))}
                          {item.evaluationIssues?.map((issue, i) => (
                            <div key={`i${i}`} className={styles.delivItem}>
                              <AlertTriangle size={14} color="#fbbf24" />
                              <span style={{ color: '#94a3b8', fontSize: 12 }}>{issue}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Rejected feedback */}
                      {item.reviewStatus === 'rejected' && item.reviewFeedback && (
                        <div className={styles.delivSection}>
                          <p className={styles.delivSectionTitle}>Rejection Feedback</p>
                          <div className={styles.delivItem} style={{ borderLeft: '3px solid #f87171' }}>
                            <XCircle size={14} color="#f87171" />
                            <span style={{ color: '#fca5a5', fontSize: 13 }}>{item.reviewFeedback}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Action Bar */}
                {isPending && (
                  <div className={styles.actions}>
                    <input
                      className={styles.feedbackInput}
                      placeholder="Optional feedback (required for reject)..."
                      value={feedbackText[item.id] || ''}
                      onChange={e => setFeedbackText((prev: FeedbackState) => ({ ...prev, [item.id]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleApprove(item.id)
                        }
                      }}
                    />
                    <button
                      className={styles.approveBtn}
                      onClick={() => handleApprove(item.id)}
                      disabled={isActioning}
                    >
                      {isActioning ? <Loader2 size={14} className="spin" /> : <ThumbsUp size={14} />}
                      Approve
                    </button>
                    <button
                      className={styles.rejectBtn}
                      onClick={() => handleReject(item.id)}
                      disabled={isActioning}
                    >
                      <ThumbsDown size={14} />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
