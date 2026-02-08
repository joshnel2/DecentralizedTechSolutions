import { create } from 'zustand'
import { legalResearchApi, aiApi } from '../services/api'

// ============================================
// TYPES
// ============================================

export interface ResearchSession {
  id: string
  user_id: string
  firm_id: string
  research_type: string
  jurisdiction: string
  practice_area: string
  query_text: string
  matter_id?: string
  matter_name?: string
  matter_number?: string
  status: string
  findings: any[]
  citations: any[]
  authorities: { primary: any[]; secondary: any[] }
  memo: any | null
  analysis: any | null
  quality_score: number
  created_at: string
  updated_at: string
}

export interface SavedResearch {
  id: string
  session_id?: string
  matter_id?: string
  matter_name?: string
  title: string
  content: string
  research_type: string
  jurisdiction?: string
  citations: any[]
  tags: string[]
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export interface ResearchTemplate {
  id: string
  name: string
  description: string
  research_type: string
  jurisdiction: string
  practice_area: string
  query_template: string
  variables: Array<{ name: string; label: string }>
  is_system: boolean
  usage_count: number
}

export interface ResearchConfig {
  researchTypes: Array<{ id: string; name: string }>
  jurisdictions: Array<{ id: string; name: string; courts: string[]; primarySources: string[]; citationFormat: string }>
  practiceAreas: Array<{ id: string; name: string; focusAreas: string[] }>
}

export interface ResearchStats {
  total_sessions: number
  completed_sessions: number
  active_sessions: number
  avg_quality_score: number
  jurisdictions_researched: number
  practice_areas_researched: number
  saved_count: number
  last_research_at?: string
}

// ============================================
// STORE
// ============================================

interface LegalResearchState {
  // Data
  sessions: ResearchSession[]
  savedResearch: SavedResearch[]
  templates: ResearchTemplate[]
  config: ResearchConfig | null
  stats: ResearchStats | null
  activeSession: ResearchSession | null
  
  // UI State
  isLoading: boolean
  isStartingResearch: boolean
  error: string | null
  selectedJurisdiction: string
  selectedResearchType: string
  selectedPracticeArea: string
  
  // Actions
  loadConfig: () => Promise<void>
  loadSessions: (params?: any) => Promise<void>
  loadSession: (id: string) => Promise<void>
  loadSaved: (params?: any) => Promise<void>
  loadTemplates: () => Promise<void>
  loadStats: () => Promise<void>
  
  startResearch: (query: string, options?: {
    research_type?: string
    jurisdiction?: string
    practice_area?: string
    matter_id?: string
    extended?: boolean
  }) => Promise<string | null>
  
  saveResearchResult: (data: {
    session_id?: string
    matter_id?: string
    title: string
    content: string
    research_type?: string
    jurisdiction?: string
    citations?: any[]
    tags?: string[]
  }) => Promise<void>
  
  togglePin: (id: string) => Promise<void>
  deleteSaved: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  
  setSelectedJurisdiction: (j: string) => void
  setSelectedResearchType: (t: string) => void
  setSelectedPracticeArea: (p: string) => void
  clearError: () => void
}

export const useLegalResearchStore = create<LegalResearchState>()((set, get) => ({
  // Initial state
  sessions: [],
  savedResearch: [],
  templates: [],
  config: null,
  stats: null,
  activeSession: null,
  isLoading: false,
  isStartingResearch: false,
  error: null,
  selectedJurisdiction: 'federal',
  selectedResearchType: 'case_law',
  selectedPracticeArea: 'litigation',

  // Load research configuration (jurisdictions, types, practice areas)
  loadConfig: async () => {
    try {
      const data = await legalResearchApi.getConfig()
      set({ config: data })
    } catch (error: any) {
      console.error('Failed to load legal research config:', error)
      // Provide defaults if API fails
      set({
        config: {
          researchTypes: [
            { id: 'case_law', name: 'Case Law' },
            { id: 'statutory', name: 'Statutory' },
            { id: 'regulatory', name: 'Regulatory' },
            { id: 'multi_jurisdiction', name: 'Multi Jurisdiction' },
            { id: 'issue_spotting', name: 'Issue Spotting' },
            { id: 'precedent_analysis', name: 'Precedent Analysis' },
            { id: 'compliance_check', name: 'Compliance Check' },
            { id: 'contract_review', name: 'Contract Review' },
            { id: 'legislative_history', name: 'Legislative History' },
            { id: 'secondary_sources', name: 'Secondary Sources' },
          ],
          jurisdictions: [
            { id: 'federal', name: 'Federal', courts: ['Supreme Court', 'Circuit Courts', 'District Courts'], primarySources: ['U.S. Code', 'C.F.R.'], citationFormat: 'Bluebook' },
            { id: 'ny', name: 'New York', courts: ['Court of Appeals', 'Appellate Division', 'Supreme Court'], primarySources: ['NY CPLR'], citationFormat: 'NY Official Reports' },
            { id: 'ca', name: 'California', courts: ['Supreme Court', 'Courts of Appeal', 'Superior Courts'], primarySources: ['CA Civil Code'], citationFormat: 'California Style Manual' },
            { id: 'tx', name: 'Texas', courts: ['Supreme Court', 'Courts of Appeals'], primarySources: ['TX Civil Practice Code'], citationFormat: 'Texas Rules of Form' },
            { id: 'il', name: 'Illinois', courts: ['Supreme Court', 'Appellate Court'], primarySources: ['IL Compiled Statutes'], citationFormat: 'Illinois Style' },
            { id: 'fl', name: 'Florida', courts: ['Supreme Court', 'District Courts of Appeal'], primarySources: ['FL Statutes'], citationFormat: 'Florida Style' },
          ],
          practiceAreas: [
            { id: 'litigation', name: 'Litigation', focusAreas: ['Case law', 'Procedural rules', 'Evidence'] },
            { id: 'corporate', name: 'Corporate & Business', focusAreas: ['Contracts', 'M&A', 'Governance'] },
            { id: 'real_estate', name: 'Real Estate', focusAreas: ['Property law', 'Zoning', 'Leases'] },
            { id: 'employment', name: 'Employment', focusAreas: ['Discrimination', 'Wage & hour', 'Benefits'] },
            { id: 'intellectual_property', name: 'Intellectual Property', focusAreas: ['Patents', 'Trademarks'] },
            { id: 'family', name: 'Family Law', focusAreas: ['Divorce', 'Custody', 'Support'] },
            { id: 'criminal', name: 'Criminal Law', focusAreas: ['Defense', 'Sentencing'] },
            { id: 'immigration', name: 'Immigration', focusAreas: ['Visas', 'Green cards'] },
            { id: 'bankruptcy', name: 'Bankruptcy', focusAreas: ['Chapter 7', 'Chapter 11'] },
            { id: 'tax', name: 'Tax', focusAreas: ['Income tax', 'Estate tax'] },
          ],
        }
      })
    }
  },

  // Load research sessions
  loadSessions: async (params) => {
    set({ isLoading: true })
    try {
      const data = await legalResearchApi.getSessions(params)
      set({ sessions: data.sessions || [], isLoading: false })
    } catch (error: any) {
      console.error('Failed to load research sessions:', error)
      set({ isLoading: false, error: 'Failed to load research sessions' })
    }
  },

  // Load a single session
  loadSession: async (id: string) => {
    set({ isLoading: true })
    try {
      const data = await legalResearchApi.getSession(id)
      set({ activeSession: data.session || null, isLoading: false })
    } catch (error: any) {
      console.error('Failed to load research session:', error)
      set({ isLoading: false, error: 'Failed to load research session' })
    }
  },

  // Load saved research
  loadSaved: async (params) => {
    try {
      const data = await legalResearchApi.getSaved(params)
      set({ savedResearch: data.saved || [] })
    } catch (error: any) {
      console.error('Failed to load saved research:', error)
    }
  },

  // Load templates
  loadTemplates: async () => {
    try {
      const data = await legalResearchApi.getTemplates()
      set({ templates: data.templates || [] })
    } catch (error: any) {
      console.error('Failed to load research templates:', error)
    }
  },

  // Load stats
  loadStats: async () => {
    try {
      const data = await legalResearchApi.getStats()
      set({ stats: data.stats || null })
    } catch (error: any) {
      console.error('Failed to load research stats:', error)
    }
  },

  // Start a new research task via the background agent
  startResearch: async (researchQuery, options = {}) => {
    set({ isStartingResearch: true, error: null })
    try {
      const {
        research_type = get().selectedResearchType,
        jurisdiction = get().selectedJurisdiction,
        practice_area = get().selectedPracticeArea,
        matter_id,
        extended = false,
      } = options

      // Build the research goal for the background agent
      const jurisdictionName = get().config?.jurisdictions.find(j => j.id === jurisdiction)?.name || jurisdiction
      const researchTypeName = get().config?.researchTypes.find(t => t.id === research_type)?.name || research_type
      const practiceAreaName = get().config?.practiceAreas.find(p => p.id === practice_area)?.name || practice_area

      const goal = `Legal Research: ${researchTypeName} research in ${jurisdictionName} (${practiceAreaName}). ` +
        `Research question: ${researchQuery}. ` +
        `Use the conduct_legal_research tool to start a structured research session, then use ` +
        `search_legal_authority, add_research_finding, and add_research_citation to build the research. ` +
        `Finally, use generate_research_memo to produce the formal research memorandum.` +
        (matter_id ? ` Link all research to matter ID: ${matter_id}.` : '')

      // Start as a background agent task
      const result = await aiApi.startBackgroundTask(goal, {
        extended,
        research_type,
        jurisdiction,
        practice_area,
        matter_id,
        taskType: 'legal_research',
      })

      // Dispatch event so BackgroundTaskBar picks it up
      window.dispatchEvent(new CustomEvent('backgroundTaskStarted', {
        detail: {
          taskId: result.task?.id || result.taskId,
          goal,
          isAmplifier: true,
        }
      }))

      set({ isStartingResearch: false })
      
      // Reload sessions
      setTimeout(() => get().loadSessions(), 2000)
      
      return result.task?.id || result.taskId || null
    } catch (error: any) {
      console.error('Failed to start research:', error)
      set({ 
        isStartingResearch: false, 
        error: error.message || 'Failed to start research task' 
      })
      return null
    }
  },

  // Save a research result
  saveResearchResult: async (data) => {
    try {
      await legalResearchApi.saveResearch(data)
      get().loadSaved()
    } catch (error: any) {
      console.error('Failed to save research:', error)
      set({ error: 'Failed to save research result' })
    }
  },

  // Toggle pin on saved research
  togglePin: async (id: string) => {
    try {
      await legalResearchApi.togglePin(id)
      set(state => ({
        savedResearch: state.savedResearch.map(s =>
          s.id === id ? { ...s, is_pinned: !s.is_pinned } : s
        )
      }))
    } catch (error: any) {
      console.error('Failed to toggle pin:', error)
    }
  },

  // Delete saved research
  deleteSaved: async (id: string) => {
    try {
      await legalResearchApi.deleteSaved(id)
      set(state => ({
        savedResearch: state.savedResearch.filter(s => s.id !== id)
      }))
    } catch (error: any) {
      console.error('Failed to delete saved research:', error)
    }
  },

  // Delete a session
  deleteSession: async (id: string) => {
    try {
      await legalResearchApi.deleteSession(id)
      set(state => ({
        sessions: state.sessions.filter(s => s.id !== id)
      }))
    } catch (error: any) {
      console.error('Failed to delete session:', error)
    }
  },

  // UI state setters
  setSelectedJurisdiction: (j) => set({ selectedJurisdiction: j }),
  setSelectedResearchType: (t) => set({ selectedResearchType: t }),
  setSelectedPracticeArea: (p) => set({ selectedPracticeArea: p }),
  clearError: () => set({ error: null }),
}))
