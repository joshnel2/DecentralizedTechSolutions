/**
 * Background Agent File Store
 * 
 * STANDALONE file management store for the Background Agent.
 * This store manages files that users can attach/provide to the Background Agent.
 * Files can come from:
 *   1. Direct user uploads (file picker)
 *   2. Research papers transferred from Legal Research (via "Add to Background Agent" button)
 * 
 * This store has ZERO imports from legalResearchStore, aiStore, or any other
 * feature-specific store. It only manages file metadata in localStorage.
 * 
 * The Legal Research page writes to this store via the exported helper function
 * addFileToBackgroundAgent() — that is the ONLY bridge between the two features.
 */

import { create } from 'zustand'

const STORAGE_KEY = 'apex-background-agent-files'

export interface AgentFile {
  id: string
  name: string
  type: 'research-paper' | 'uploaded-document' | 'user-document'
  content: string
  mimeType: string
  size: number
  source: string // e.g. "Legal Research", "Upload", "Documents"
  addedAt: string
  metadata?: Record<string, unknown>
}

interface BackgroundAgentFileState {
  files: AgentFile[]
  
  // Actions
  loadFiles: () => void
  addFile: (file: Omit<AgentFile, 'id' | 'addedAt'>) => AgentFile
  removeFile: (fileId: string) => void
  clearFiles: () => void
  getFileById: (fileId: string) => AgentFile | undefined
}

function generateId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function loadFromStorage(): AgentFile[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // corrupt data, reset
    localStorage.removeItem(STORAGE_KEY)
  }
  return []
}

function saveToStorage(files: AgentFile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
  } catch (e) {
    console.error('[AgentFileStore] Failed to save to localStorage:', e)
  }
}

export const useBackgroundAgentFileStore = create<BackgroundAgentFileState>((set, get) => ({
  files: [],

  loadFiles: () => {
    const files = loadFromStorage()
    set({ files })
  },

  addFile: (fileData) => {
    const file: AgentFile = {
      ...fileData,
      id: generateId(),
      addedAt: new Date().toISOString(),
    }
    
    set(state => {
      const updated = [file, ...state.files]
      saveToStorage(updated)
      return { files: updated }
    })

    // Dispatch a custom event so the Background Agent page can react if open
    window.dispatchEvent(new CustomEvent('backgroundAgentFileAdded', {
      detail: { file }
    }))

    return file
  },

  removeFile: (fileId) => {
    set(state => {
      const updated = state.files.filter(f => f.id !== fileId)
      saveToStorage(updated)
      return { files: updated }
    })
  },

  clearFiles: () => {
    saveToStorage([])
    set({ files: [] })
  },

  getFileById: (fileId) => {
    return get().files.find(f => f.id === fileId)
  },
}))

/**
 * Standalone helper function to add a research paper to the Background Agent's file store.
 * This is the ONLY bridge between Legal Research and Background Agent.
 * It does NOT import anything from either page's components or stores.
 */
export function addResearchToBackgroundAgent(research: {
  title: string
  content: string
  sessionId?: number
  model?: string
}): AgentFile {
  const store = useBackgroundAgentFileStore.getState()
  
  const file = store.addFile({
    name: `Research: ${research.title}`,
    type: 'research-paper',
    content: research.content,
    mimeType: 'text/markdown',
    size: new Blob([research.content]).size,
    source: 'Legal Research',
    metadata: {
      sessionId: research.sessionId,
      model: research.model,
      transferredAt: new Date().toISOString(),
    },
  })

  return file
}
