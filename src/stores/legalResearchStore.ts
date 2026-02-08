/**
 * Legal Research Store
 * 
 * COMPLETELY ISOLATED from aiStore.ts and all other AI stores.
 * This store manages the legal research UI state and API calls
 * to the /api/legal-research endpoints, which use OpenRouter
 * (NOT Azure OpenAI).
 */

import { create } from 'zustand'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

function getToken() {
  try {
    return localStorage.getItem('apex-access-token')
  } catch {
    return null
  }
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(body.error || `API error: ${response.status}`)
  }

  return response
}

export interface ResearchSession {
  id: number
  title: string
  jurisdiction: string | null
  practice_area: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface ResearchMessage {
  id: number
  session_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: any
  created_at: string
}

export interface ResearchConfig {
  configured: boolean
  baseUrl: string
  defaultModel: string
  appName: string
  availableModels: Array<{
    id: string
    name: string
    description: string
    default?: boolean
  }>
}

interface LegalResearchState {
  // Config
  config: ResearchConfig | null
  configLoaded: boolean

  // Sessions
  sessions: ResearchSession[]
  activeSessionId: number | null
  activeMessages: ResearchMessage[]

  // UI state
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  error: string | null
  selectedModel: string | null

  // Actions
  fetchConfig: () => Promise<void>
  fetchSessions: () => Promise<void>
  createSession: (title?: string, jurisdiction?: string, practiceArea?: string) => Promise<ResearchSession>
  loadSession: (sessionId: number) => Promise<void>
  deleteSession: (sessionId: number) => Promise<void>
  sendMessage: (message: string, options?: { model?: string; jurisdiction?: string; practiceArea?: string }) => Promise<void>
  sendMessageStream: (message: string, options?: { model?: string; jurisdiction?: string; practiceArea?: string }) => Promise<void>
  setSelectedModel: (model: string) => void
  clearError: () => void
  clearActiveSession: () => void
}

export const useLegalResearchStore = create<LegalResearchState>((set, get) => ({
  config: null,
  configLoaded: false,
  sessions: [],
  activeSessionId: null,
  activeMessages: [],
  isLoading: false,
  isStreaming: false,
  streamingContent: '',
  error: null,
  selectedModel: null,

  fetchConfig: async () => {
    try {
      const response = await fetchWithAuth('/legal-research/config')
      const config = await response.json()
      set({ config, configLoaded: true })
    } catch (error: any) {
      console.error('[LegalResearch] Failed to fetch config:', error)
      set({ configLoaded: true, config: { configured: false, baseUrl: '', defaultModel: '', appName: '', availableModels: [] } })
    }
  },

  fetchSessions: async () => {
    try {
      const response = await fetchWithAuth('/legal-research/sessions')
      const data = await response.json()
      set({ sessions: data.sessions || [] })
    } catch (error: any) {
      console.error('[LegalResearch] Failed to fetch sessions:', error)
    }
  },

  createSession: async (title, jurisdiction, practiceArea) => {
    const response = await fetchWithAuth('/legal-research/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: title || 'New Research', jurisdiction, practiceArea }),
    })
    const data = await response.json()
    const session = data.session

    set(state => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
      activeMessages: [],
    }))

    return session
  },

  loadSession: async (sessionId) => {
    try {
      set({ isLoading: true, error: null })
      const response = await fetchWithAuth(`/legal-research/sessions/${sessionId}`)
      const data = await response.json()
      set({
        activeSessionId: sessionId,
        activeMessages: data.messages || [],
        isLoading: false,
      })
    } catch (error: any) {
      set({ isLoading: false, error: error.message })
    }
  },

  deleteSession: async (sessionId) => {
    try {
      await fetchWithAuth(`/legal-research/sessions/${sessionId}`, { method: 'DELETE' })
      set(state => ({
        sessions: state.sessions.filter(s => s.id !== sessionId),
        activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
        activeMessages: state.activeSessionId === sessionId ? [] : state.activeMessages,
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  sendMessage: async (message, options = {}) => {
    const { activeSessionId, selectedModel } = get()
    
    set(state => ({
      isLoading: true,
      error: null,
      activeMessages: [
        ...state.activeMessages,
        {
          id: Date.now(),
          session_id: activeSessionId || 0,
          role: 'user' as const,
          content: message,
          metadata: null,
          created_at: new Date().toISOString(),
        }
      ]
    }))

    try {
      const response = await fetchWithAuth('/legal-research/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          sessionId: activeSessionId,
          model: options.model || selectedModel,
          jurisdiction: options.jurisdiction,
          practiceArea: options.practiceArea,
        }),
      })
      const data = await response.json()

      set(state => ({
        isLoading: false,
        activeSessionId: data.sessionId,
        activeMessages: [
          ...state.activeMessages,
          {
            id: Date.now() + 1,
            session_id: data.sessionId,
            role: 'assistant' as const,
            content: data.message,
            metadata: { model: data.model, usage: data.usage },
            created_at: new Date().toISOString(),
          }
        ]
      }))

      // Refresh sessions list to update timestamps
      get().fetchSessions()
    } catch (error: any) {
      set({ isLoading: false, error: error.message })
    }
  },

  sendMessageStream: async (message, options = {}) => {
    const { activeSessionId, selectedModel } = get()

    // Add user message to UI immediately
    set(state => ({
      isStreaming: true,
      streamingContent: '',
      error: null,
      activeMessages: [
        ...state.activeMessages,
        {
          id: Date.now(),
          session_id: activeSessionId || 0,
          role: 'user' as const,
          content: message,
          metadata: null,
          created_at: new Date().toISOString(),
        }
      ]
    }))

    try {
      const token = getToken()
      const response = await fetch(`${API_URL}/legal-research/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          message,
          sessionId: activeSessionId,
          model: options.model || selectedModel,
          jurisdiction: options.jurisdiction,
          practiceArea: options.practiceArea,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(body.error || `API error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let fullContent = ''
      let sessionId = activeSessionId
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (!data) continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'session') {
                sessionId = parsed.sessionId
                set({ activeSessionId: sessionId })
              } else if (parsed.type === 'content') {
                fullContent += parsed.content
                set({ streamingContent: fullContent })
              } else if (parsed.type === 'done') {
                // Streaming complete
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error)
              }
            } catch (e: any) {
              if (e.message && e.message !== 'Unexpected end of JSON input') {
                // Real error, not just a parse issue
                if (e.message !== data) throw e
              }
            }
          }
        }
      }

      // Add the complete assistant message
      if (fullContent) {
        set(state => ({
          isStreaming: false,
          streamingContent: '',
          activeMessages: [
            ...state.activeMessages,
            {
              id: Date.now() + 1,
              session_id: sessionId || 0,
              role: 'assistant' as const,
              content: fullContent,
              metadata: null,
              created_at: new Date().toISOString(),
            }
          ]
        }))
      } else {
        set({ isStreaming: false, streamingContent: '' })
      }

      // Refresh sessions
      get().fetchSessions()
    } catch (error: any) {
      set({ isStreaming: false, streamingContent: '', error: error.message })
    }
  },

  setSelectedModel: (model) => set({ selectedModel: model }),
  clearError: () => set({ error: null }),
  clearActiveSession: () => set({ activeSessionId: null, activeMessages: [], streamingContent: '' }),
}))
