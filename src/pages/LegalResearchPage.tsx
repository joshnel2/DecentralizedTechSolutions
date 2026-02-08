import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Scale,
  Search,
  BookOpen,
  FileText,
  Clock,
  Star,
  Trash2,
  ChevronLeft,
  Loader2,
  AlertCircle,
  X,
  Rocket,
  Pin,
  Globe,
  Briefcase,
  Gavel,
  Library,
  TrendingUp,
  CheckCircle,
  XCircle,
  ArrowRight,
  Sparkles,
  Bookmark,
  LayoutTemplate,
  Eye,
} from 'lucide-react'
import { useLegalResearchStore } from '../stores/legalResearchStore'
import type { ResearchSession, SavedResearch, ResearchTemplate } from '../stores/legalResearchStore'
import styles from './LegalResearchPage.module.css'

type TabType = 'research' | 'sessions' | 'saved' | 'templates'

export function LegalResearchPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('research')
  const [queryText, setQueryText] = useState('')
  const [viewingSession, setViewingSession] = useState<ResearchSession | null>(null)
  
  const {
    sessions,
    savedResearch,
    templates,
    config,
    stats,
    isLoading,
    isStartingResearch,
    error,
    selectedJurisdiction,
    selectedResearchType,
    selectedPracticeArea,
    loadConfig,
    loadSessions,
    loadSaved,
    loadTemplates,
    loadStats,
    startResearch,
    deleteSession,
    deleteSaved,
    togglePin,
    setSelectedJurisdiction,
    setSelectedResearchType,
    setSelectedPracticeArea,
    clearError,
    loadSession,
    activeSession,
  } = useLegalResearchStore()

  // Load initial data
  useEffect(() => {
    loadConfig()
    loadSessions()
    loadSaved()
    loadTemplates()
    loadStats()
  }, [loadConfig, loadSessions, loadSaved, loadTemplates, loadStats])

  // Handle starting research
  const handleStartResearch = useCallback(async () => {
    if (!queryText.trim()) return
    
    const taskId = await startResearch(queryText.trim(), {
      research_type: selectedResearchType,
      jurisdiction: selectedJurisdiction,
      practice_area: selectedPracticeArea,
    })
    
    if (taskId) {
      setQueryText('')
      // Navigate to background agent to watch progress
      navigate('/app/background-agent', {
        state: {
          highlightTaskId: taskId,
          fromTaskBar: true,
        }
      })
    }
  }, [queryText, selectedResearchType, selectedJurisdiction, selectedPracticeArea, startResearch, navigate])

  // Handle template selection
  const handleTemplateSelect = useCallback((template: ResearchTemplate) => {
    setQueryText(template.query_template)
    setSelectedResearchType(template.research_type)
    setSelectedJurisdiction(template.jurisdiction)
    setSelectedPracticeArea(template.practice_area)
    setActiveTab('research')
  }, [setSelectedResearchType, setSelectedJurisdiction, setSelectedPracticeArea])

  // Handle viewing a session
  const handleViewSession = useCallback(async (session: ResearchSession) => {
    setViewingSession(session)
    await loadSession(session.id)
  }, [loadSession])

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  // Quality score color
  const getScoreClass = (score: number) => {
    if (score >= 70) return styles.scoreHigh
    if (score >= 40) return styles.scoreMedium
    return styles.scoreLow
  }

  // Session status icon
  const getSessionIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <div className={`${styles.sessionIcon} ${styles.sessionIconCompleted}`}><CheckCircle size={18} /></div>
      case 'in_progress':
      case 'initialized':
        return <div className={`${styles.sessionIcon} ${styles.sessionIconActive}`}><Loader2 size={18} className={styles.spinning} /></div>
      case 'failed':
        return <div className={`${styles.sessionIcon} ${styles.sessionIconFailed}`}><XCircle size={18} /></div>
      default:
        return <div className={`${styles.sessionIcon} ${styles.sessionIconActive}`}><Scale size={18} /></div>
    }
  }

  // If viewing a session detail
  if (viewingSession) {
    const session = activeSession || viewingSession
    return (
      <div className={styles.page}>
        <div className={styles.sessionDetail}>
          <div className={styles.detailHeader}>
            <button className={styles.backButton} onClick={() => setViewingSession(null)}>
              <ChevronLeft size={16} />
            </button>
            <div className={styles.detailTitle}>
              {session.query_text}
            </div>
            <div className={`${styles.sessionScore} ${getScoreClass(session.quality_score)}`}>
              <Star size={14} />
              {session.quality_score}/100
            </div>
          </div>
          
          <div className={styles.detailBody}>
            {/* Session metadata */}
            <div className={styles.sessionMeta} style={{ marginBottom: '1rem' }}>
              <span><Globe size={12} /> {session.jurisdiction}</span>
              <span><Briefcase size={12} /> {session.practice_area}</span>
              <span><FileText size={12} /> {session.research_type}</span>
              <span><Clock size={12} /> {formatDate(session.created_at)}</span>
              {session.matter_name && <span><Gavel size={12} /> {session.matter_name}</span>}
            </div>

            {/* Findings */}
            {session.findings && session.findings.length > 0 && (
              <div className={styles.findingsSection}>
                <div className={styles.sectionTitle}>
                  <BookOpen size={16} /> Findings ({session.findings.length})
                </div>
                {session.findings.map((finding: any, idx: number) => (
                  <div key={idx} className={styles.findingCard}>
                    <div className={styles.findingTitle}>{finding.title}</div>
                    <div className={styles.findingContent}>{finding.content}</div>
                    {finding.citations && finding.citations.length > 0 && (
                      <div className={styles.savedMeta} style={{ marginTop: '0.5rem' }}>
                        {finding.citations.map((c: string, i: number) => (
                          <span key={i} className={`${styles.templateTag} ${styles.tagType}`}>{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Citations */}
            {session.citations && session.citations.length > 0 && (
              <div className={styles.findingsSection}>
                <div className={styles.sectionTitle}>
                  <Library size={16} /> Citations ({session.citations.length})
                </div>
                <div className={styles.citationsList}>
                  {session.citations.map((citation: any, idx: number) => (
                    <div key={idx} className={styles.citationItem}>
                      <div className={styles.citationText}>{citation.citation}</div>
                      <span className={styles.citationType}>{citation.sourceType || citation.source_type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Memo Preview */}
            {session.memo && (
              <div className={styles.findingsSection}>
                <div className={styles.sectionTitle}>
                  <FileText size={16} /> Research Memo
                </div>
                <div className={styles.memoPreview}>
                  {typeof session.memo === 'string' ? session.memo : JSON.stringify(session.memo, null, 2)}
                </div>
              </div>
            )}

            {/* Analysis */}
            {session.analysis && (
              <div className={styles.findingsSection}>
                <div className={styles.sectionTitle}>
                  <Sparkles size={16} /> Analysis
                </div>
                <div className={styles.findingCard}>
                  {session.analysis.briefAnswer && (
                    <>
                      <div className={styles.findingTitle}>Brief Answer</div>
                      <div className={styles.findingContent}>{session.analysis.briefAnswer}</div>
                    </>
                  )}
                  {session.analysis.conclusion && (
                    <>
                      <div className={styles.findingTitle} style={{ marginTop: '0.75rem' }}>Conclusion</div>
                      <div className={styles.findingContent}>{session.analysis.conclusion}</div>
                    </>
                  )}
                  {session.analysis.recommendations && session.analysis.recommendations.length > 0 && (
                    <>
                      <div className={styles.findingTitle} style={{ marginTop: '0.75rem' }}>Recommendations</div>
                      {session.analysis.recommendations.map((rec: string, i: number) => (
                        <div key={i} className={styles.findingContent}>{i + 1}. {rec}</div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
            
            {/* Empty state for sessions with no data yet */}
            {(!session.findings || session.findings.length === 0) && 
             (!session.citations || session.citations.length === 0) && 
             !session.memo && !session.analysis && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <Loader2 size={24} className={session.status === 'in_progress' ? styles.spinning : ''} />
                </div>
                <div className={styles.emptyTitle}>
                  {session.status === 'in_progress' ? 'Research in Progress' : 'No Data Yet'}
                </div>
                <div className={styles.emptyText}>
                  {session.status === 'in_progress' 
                    ? 'The background agent is conducting research. Check back soon for findings, citations, and the research memo.'
                    : 'This session has not yet produced any findings.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <div className={styles.titleIcon}>
            <Scale size={22} />
          </div>
          <div>
            <div className={styles.title}>Legal Research</div>
            <div className={styles.subtitle}>
              Plug into AI's legal research mastery -- structured workflows, real citations, attorney-ready memos
            </div>
          </div>
        </div>
        
        {stats && (
          <div className={styles.statsRow}>
            <div className={styles.statBadge}>
              <FileText size={12} />
              <strong>{stats.completed_sessions}</strong> completed
            </div>
            <div className={styles.statBadge}>
              <Star size={12} />
              <strong>{stats.avg_quality_score}</strong> avg score
            </div>
            <div className={styles.statBadge}>
              <Bookmark size={12} />
              <strong>{stats.saved_count}</strong> saved
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className={styles.error}>
          <AlertCircle size={16} />
          {error}
          <button className={styles.errorDismiss} onClick={clearError}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Research Input */}
      <div className={styles.researchInput}>
        <label className={styles.inputLabel}>
          <Search size={14} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
          What legal question do you need researched?
        </label>
        <textarea
          className={styles.queryInput}
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="e.g., What is the statute of limitations for a breach of fiduciary duty claim in New York? Does the discovery rule apply?"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleStartResearch()
            }
          }}
        />
        
        <div className={styles.optionsRow}>
          <div className={styles.optionGroup}>
            <span className={styles.optionLabel}>Research Type</span>
            <select
              className={styles.optionSelect}
              value={selectedResearchType}
              onChange={(e) => setSelectedResearchType(e.target.value)}
            >
              {(config?.researchTypes || []).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          
          <div className={styles.optionGroup}>
            <span className={styles.optionLabel}>Jurisdiction</span>
            <select
              className={styles.optionSelect}
              value={selectedJurisdiction}
              onChange={(e) => setSelectedJurisdiction(e.target.value)}
            >
              {(config?.jurisdictions || []).map(j => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
          </div>
          
          <div className={styles.optionGroup}>
            <span className={styles.optionLabel}>Practice Area</span>
            <select
              className={styles.optionSelect}
              value={selectedPracticeArea}
              onChange={(e) => setSelectedPracticeArea(e.target.value)}
            >
              {(config?.practiceAreas || []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          
          <button
            className={styles.startButton}
            onClick={handleStartResearch}
            disabled={!queryText.trim() || isStartingResearch}
          >
            {isStartingResearch ? (
              <>
                <Loader2 size={16} className={styles.spinning} />
                Starting...
              </>
            ) : (
              <>
                <Rocket size={16} />
                Start Research
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'research' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('research')}
        >
          <Scale size={15} />
          Quick Start
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'sessions' ? styles.tabActive : ''}`}
          onClick={() => { setActiveTab('sessions'); loadSessions() }}
        >
          <Clock size={15} />
          Sessions
          {sessions.length > 0 && (
            <span className={styles.tabBadge}>{sessions.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'saved' ? styles.tabActive : ''}`}
          onClick={() => { setActiveTab('saved'); loadSaved() }}
        >
          <Bookmark size={15} />
          Saved
          {savedResearch.length > 0 && (
            <span className={styles.tabBadge}>{savedResearch.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'templates' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <LayoutTemplate size={15} />
          Templates
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Quick Start Tab - Templates Grid */}
        {activeTab === 'research' && (
          <>
            <div className={styles.templatesGrid}>
              {/* Pre-built research workflows */}
              <div className={styles.templateCard} onClick={() => {
                setQueryText('What is the statute of limitations for personal injury claims? Include tolling provisions and discovery rules.')
                setSelectedResearchType('statutory')
              }}>
                <div className={styles.templateName}>
                  <Clock size={15} style={{ color: '#6366f1' }} /> Statute of Limitations
                </div>
                <div className={styles.templateDesc}>
                  Research limitation periods, tolling provisions, discovery rules, and savings statutes for any claim type.
                </div>
                <div className={styles.templateMeta}>
                  <span className={`${styles.templateTag} ${styles.tagType}`}>Statutory</span>
                  <span className={`${styles.templateTag} ${styles.tagArea}`}>Litigation</span>
                </div>
              </div>
              
              <div className={styles.templateCard} onClick={() => {
                setQueryText('Research the legal standard and key case law for a motion to dismiss for failure to state a claim.')
                setSelectedResearchType('case_law')
              }}>
                <div className={styles.templateName}>
                  <Gavel size={15} style={{ color: '#6366f1' }} /> Motion to Dismiss
                </div>
                <div className={styles.templateDesc}>
                  Find the governing standard, burden of proof, key cases, and recent developments for dismissal motions.
                </div>
                <div className={styles.templateMeta}>
                  <span className={`${styles.templateTag} ${styles.tagType}`}>Case Law</span>
                  <span className={`${styles.templateTag} ${styles.tagArea}`}>Litigation</span>
                </div>
              </div>
              
              <div className={styles.templateCard} onClick={() => {
                setQueryText('Analyze the enforceability of non-compete agreements. Include requirements, limitations, and recent trends.')
                setSelectedResearchType('multi_jurisdiction')
              }}>
                <div className={styles.templateName}>
                  <Globe size={15} style={{ color: '#6366f1' }} /> Non-Compete Analysis
                </div>
                <div className={styles.templateDesc}>
                  Multi-jurisdiction analysis of non-compete enforceability, including reasonableness factors and blue penciling.
                </div>
                <div className={styles.templateMeta}>
                  <span className={`${styles.templateTag} ${styles.tagType}`}>Multi-Jurisdiction</span>
                  <span className={`${styles.templateTag} ${styles.tagArea}`}>Employment</span>
                </div>
              </div>
              
              <div className={styles.templateCard} onClick={() => {
                setQueryText('Research fiduciary duty standards and breach of fiduciary duty elements. Include applicable defenses.')
                setSelectedResearchType('case_law')
              }}>
                <div className={styles.templateName}>
                  <Scale size={15} style={{ color: '#6366f1' }} /> Fiduciary Duty
                </div>
                <div className={styles.templateDesc}>
                  Case law research on fiduciary duties, standards of care, business judgment rule, and breach remedies.
                </div>
                <div className={styles.templateMeta}>
                  <span className={`${styles.templateTag} ${styles.tagType}`}>Case Law</span>
                  <span className={`${styles.templateTag} ${styles.tagArea}`}>Corporate</span>
                </div>
              </div>
              
              <div className={styles.templateCard} onClick={() => {
                setQueryText('What are the requirements and procedures for summary judgment? Include standard of review and evidentiary requirements.')
                setSelectedResearchType('case_law')
              }}>
                <div className={styles.templateName}>
                  <FileText size={15} style={{ color: '#6366f1' }} /> Summary Judgment
                </div>
                <div className={styles.templateDesc}>
                  Research summary judgment standards, genuine issue of material fact, burden shifting, and opposition strategies.
                </div>
                <div className={styles.templateMeta}>
                  <span className={`${styles.templateTag} ${styles.tagType}`}>Case Law</span>
                  <span className={`${styles.templateTag} ${styles.tagArea}`}>Litigation</span>
                </div>
              </div>
              
              <div className={styles.templateCard} onClick={() => {
                setQueryText('Research regulatory compliance requirements. Include applicable regulations, enforcement guidance, and penalties.')
                setSelectedResearchType('regulatory')
              }}>
                <div className={styles.templateName}>
                  <TrendingUp size={15} style={{ color: '#6366f1' }} /> Regulatory Compliance
                </div>
                <div className={styles.templateDesc}>
                  Regulatory research including enabling statutes, implementing regulations, agency guidance, and enforcement history.
                </div>
                <div className={styles.templateMeta}>
                  <span className={`${styles.templateTag} ${styles.tagType}`}>Regulatory</span>
                  <span className={`${styles.templateTag} ${styles.tagArea}`}>Corporate</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <>
            {isLoading ? (
              <div className={styles.loading}>
                <Loader2 size={18} className={styles.spinning} />
                Loading sessions...
              </div>
            ) : sessions.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><Scale size={24} /></div>
                <div className={styles.emptyTitle}>No Research Sessions Yet</div>
                <div className={styles.emptyText}>
                  Start a legal research task and the background agent will conduct structured research using AI's legal mastery.
                </div>
              </div>
            ) : (
              <div className={styles.sessionsList}>
                {sessions.map(session => (
                  <div
                    key={session.id}
                    className={styles.sessionCard}
                    onClick={() => handleViewSession(session)}
                  >
                    {getSessionIcon(session.status)}
                    <div className={styles.sessionInfo}>
                      <div className={styles.sessionQuery}>{session.query_text}</div>
                      <div className={styles.sessionMeta}>
                        <span><Globe size={11} /> {session.jurisdiction}</span>
                        <span><FileText size={11} /> {session.research_type?.replace(/_/g, ' ')}</span>
                        <span><Clock size={11} /> {formatDate(session.created_at)} {formatTime(session.created_at)}</span>
                        {session.matter_name && <span><Gavel size={11} /> {session.matter_name}</span>}
                      </div>
                    </div>
                    {session.quality_score > 0 && (
                      <div className={`${styles.sessionScore} ${getScoreClass(session.quality_score)}`}>
                        <Star size={14} />
                        {session.quality_score}
                      </div>
                    )}
                    <div className={styles.sessionActions}>
                      <button
                        className={styles.iconButton}
                        onClick={(e) => { e.stopPropagation(); handleViewSession(session) }}
                        title="View details"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                        onClick={(e) => { e.stopPropagation(); deleteSession(session.id) }}
                        title="Delete session"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Saved Tab */}
        {activeTab === 'saved' && (
          <>
            {savedResearch.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><Bookmark size={24} /></div>
                <div className={styles.emptyTitle}>No Saved Research</div>
                <div className={styles.emptyText}>
                  Save important research findings, memos, and citations for quick reference across matters.
                </div>
              </div>
            ) : (
              <div className={styles.savedList}>
                {savedResearch.map(saved => (
                  <div key={saved.id} className={styles.savedCard}>
                    <div className={styles.savedContent}>
                      <div className={styles.savedTitle}>
                        {saved.is_pinned && <Pin size={13} className={styles.pinIcon} />}
                        {saved.title}
                      </div>
                      <div className={styles.savedPreview}>{saved.content}</div>
                      <div className={styles.savedMeta}>
                        {saved.research_type && (
                          <span className={`${styles.templateTag} ${styles.tagType}`}>
                            {saved.research_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        {saved.jurisdiction && (
                          <span className={`${styles.templateTag} ${styles.tagJurisdiction}`}>
                            {saved.jurisdiction}
                          </span>
                        )}
                        {saved.tags?.map((tag, i) => (
                          <span key={i} className={`${styles.templateTag} ${styles.tagArea}`}>{tag}</span>
                        ))}
                        {saved.matter_name && (
                          <span className={`${styles.templateTag} ${styles.tagJurisdiction}`}>
                            {saved.matter_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={styles.sessionActions}>
                      <button
                        className={styles.iconButton}
                        onClick={() => togglePin(saved.id)}
                        title={saved.is_pinned ? 'Unpin' : 'Pin'}
                      >
                        <Pin size={14} />
                      </button>
                      <button
                        className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                        onClick={() => deleteSaved(saved.id)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <>
            {templates.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><LayoutTemplate size={24} /></div>
                <div className={styles.emptyTitle}>No Custom Templates</div>
                <div className={styles.emptyText}>
                  Use the Quick Start templates above or create custom research query templates for your firm's common research needs.
                </div>
              </div>
            ) : (
              <div className={styles.templatesGrid}>
                {templates.map(template => (
                  <div
                    key={template.id}
                    className={styles.templateCard}
                    onClick={() => handleTemplateSelect(template)}
                  >
                    <div className={styles.templateName}>
                      <LayoutTemplate size={15} style={{ color: '#6366f1' }} />
                      {template.name}
                    </div>
                    <div className={styles.templateDesc}>{template.description}</div>
                    <div className={styles.templateMeta}>
                      <span className={`${styles.templateTag} ${styles.tagType}`}>
                        {template.research_type?.replace(/_/g, ' ')}
                      </span>
                      <span className={`${styles.templateTag} ${styles.tagJurisdiction}`}>
                        {template.jurisdiction}
                      </span>
                      <span className={`${styles.templateTag} ${styles.tagArea}`}>
                        {template.practice_area?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {template.usage_count > 0 && (
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        Used {template.usage_count} times
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
