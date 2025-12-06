import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { 
  clientsApi, 
  mattersApi, 
  timeEntriesApi, 
  invoicesApi, 
  calendarApi, 
  documentsApi 
} from '../services/api'
import type { 
  Client, Matter, TimeEntry, Invoice, CalendarEvent, 
  Document, APIKey, Group, Notification, Expense
} from '../types'

// Matter type configuration
export interface MatterTypeConfig {
  id: string
  value: string
  label: string
  active: boolean
  createdAt: string
}

// Default matter types
const defaultMatterTypes: MatterTypeConfig[] = [
  { id: '1', value: 'litigation', label: 'Litigation', active: true, createdAt: new Date().toISOString() },
  { id: '2', value: 'corporate', label: 'Corporate', active: true, createdAt: new Date().toISOString() },
  { id: '3', value: 'real_estate', label: 'Real Estate', active: true, createdAt: new Date().toISOString() },
  { id: '4', value: 'intellectual_property', label: 'Intellectual Property', active: true, createdAt: new Date().toISOString() },
  { id: '5', value: 'employment', label: 'Employment', active: true, createdAt: new Date().toISOString() },
  { id: '6', value: 'personal_injury', label: 'Personal Injury', active: true, createdAt: new Date().toISOString() },
  { id: '7', value: 'estate_planning', label: 'Estate Planning', active: true, createdAt: new Date().toISOString() },
  { id: '8', value: 'family', label: 'Family Law', active: true, createdAt: new Date().toISOString() },
  { id: '9', value: 'criminal', label: 'Criminal', active: true, createdAt: new Date().toISOString() },
  { id: '10', value: 'immigration', label: 'Immigration', active: true, createdAt: new Date().toISOString() },
  { id: '11', value: 'bankruptcy', label: 'Bankruptcy', active: true, createdAt: new Date().toISOString() },
  { id: '12', value: 'tax', label: 'Tax', active: true, createdAt: new Date().toISOString() },
  { id: '13', value: 'other', label: 'Other', active: true, createdAt: new Date().toISOString() },
]

interface DataState {
  // Data
  clients: Client[]
  matters: Matter[]
  timeEntries: TimeEntry[]
  expenses: Expense[]
  invoices: Invoice[]
  events: CalendarEvent[]
  documents: Document[]
  apiKeys: APIKey[]
  groups: Group[]
  notifications: Notification[]
  matterTypes: MatterTypeConfig[]
  
  // Loading states
  isLoading: boolean
  error: string | null
  
  // Fetch actions
  fetchClients: () => Promise<void>
  fetchMatters: () => Promise<void>
  fetchTimeEntries: (params?: { matterId?: string }) => Promise<void>
  fetchInvoices: () => Promise<void>
  fetchEvents: (params?: { startDate?: string; endDate?: string }) => Promise<void>
  fetchDocuments: (params?: { matterId?: string }) => Promise<void>
  
  // Client actions
  addClient: (client: Omit<Client, 'id' | 'createdAt' | 'matterIds'>) => Promise<Client>
  updateClient: (id: string, data: Partial<Client>) => Promise<void>
  deleteClient: (id: string) => Promise<void>
  
  // Matter actions
  addMatter: (matter: Omit<Matter, 'id' | 'number' | 'createdAt'>) => Promise<Matter>
  updateMatter: (id: string, data: Partial<Matter>) => Promise<void>
  deleteMatter: (id: string) => Promise<void>
  
  // Time Entry actions (userId is set automatically by backend from auth token)
  addTimeEntry: (entry: Omit<TimeEntry, 'id' | 'createdAt' | 'amount' | 'userId'>) => Promise<TimeEntry>
  updateTimeEntry: (id: string, data: Partial<TimeEntry>) => Promise<void>
  deleteTimeEntry: (id: string) => Promise<void>
  
  // Invoice actions
  addInvoice: (invoice: Omit<Invoice, 'id' | 'number' | 'createdAt'>) => Promise<Invoice>
  updateInvoice: (id: string, data: Partial<Invoice>) => Promise<void>
  deleteInvoice: (id: string) => Promise<void>
  
  // Event actions
  addEvent: (event: Omit<CalendarEvent, 'id' | 'createdAt'>) => Promise<CalendarEvent>
  updateEvent: (id: string, data: Partial<CalendarEvent>) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
  
  // Document actions
  addDocument: (file: File, metadata: { matterId?: string; clientId?: string; tags?: string[] }) => Promise<Document>
  deleteDocument: (id: string) => Promise<void>
  
  // Notification actions
  markNotificationRead: (id: string) => void
  clearNotifications: () => void
  
  // API Key actions (stub - not yet implemented on backend)
  addAPIKey: (data: any) => Promise<any>
  deleteAPIKey: (id: string) => Promise<void>
  
  // Group actions (stub - uses team API)
  addGroup: (data: any) => Promise<any>
  updateGroup: (id: string, data: any) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  
  // Matter Type actions
  addMatterType: (data: { value: string; label: string }) => void
  updateMatterType: (id: string, data: Partial<MatterTypeConfig>) => void
  deleteMatterType: (id: string) => void
  toggleMatterTypeActive: (id: string) => void
  getMatterTypeOptions: () => { value: string; label: string }[]
  
  // Clear all data (for logout)
  clearAll: () => void
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
  clients: [],
  matters: [],
  timeEntries: [],
  expenses: [],
  invoices: [],
  events: [],
  documents: [],
  apiKeys: [],
  groups: [],
  notifications: [],
  matterTypes: defaultMatterTypes,
  isLoading: false,
  error: null,

  // Fetch clients from API
  fetchClients: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await clientsApi.getAll()
      set({ clients: response.clients, isLoading: false })
    } catch (error) {
      console.error('Failed to fetch clients:', error)
      set({ error: 'Failed to fetch clients', isLoading: false })
    }
  },

  // Fetch matters from API
  fetchMatters: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await mattersApi.getAll()
      set({ matters: response.matters, isLoading: false })
    } catch (error) {
      console.error('Failed to fetch matters:', error)
      set({ error: 'Failed to fetch matters', isLoading: false })
    }
  },

  // Fetch time entries from API
  fetchTimeEntries: async (params) => {
    set({ isLoading: true, error: null })
    try {
      const response = await timeEntriesApi.getAll(params)
      set({ timeEntries: response.timeEntries, isLoading: false })
    } catch (error) {
      console.error('Failed to fetch time entries:', error)
      set({ error: 'Failed to fetch time entries', isLoading: false })
    }
  },

  // Fetch invoices from API
  fetchInvoices: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await invoicesApi.getAll()
      set({ invoices: response.invoices, isLoading: false })
    } catch (error) {
      console.error('Failed to fetch invoices:', error)
      set({ error: 'Failed to fetch invoices', isLoading: false })
    }
  },

  // Fetch calendar events from API
  fetchEvents: async (params) => {
    set({ isLoading: true, error: null })
    try {
      const response = await calendarApi.getEvents(params)
      set({ events: response.events, isLoading: false })
    } catch (error) {
      console.error('Failed to fetch events:', error)
      set({ error: 'Failed to fetch events', isLoading: false })
    }
  },

  // Fetch documents from API
  fetchDocuments: async (params) => {
    set({ isLoading: true, error: null })
    try {
      const response = await documentsApi.getAll(params)
      set({ documents: response.documents, isLoading: false })
    } catch (error) {
      console.error('Failed to fetch documents:', error)
      set({ error: 'Failed to fetch documents', isLoading: false })
    }
  },

  // Client actions
  addClient: async (data) => {
    const response = await clientsApi.create(data)
    set(state => ({ clients: [...state.clients, response] }))
    return response
  },

  updateClient: async (id, data) => {
    await clientsApi.update(id, data)
    set(state => ({
      clients: state.clients.map(c => c.id === id ? { ...c, ...data } : c)
    }))
  },

  deleteClient: async (id) => {
    await clientsApi.delete(id)
    set(state => ({ clients: state.clients.filter(c => c.id !== id) }))
  },

  // Matter actions
  addMatter: async (data) => {
    const response = await mattersApi.create(data)
    set(state => ({ matters: [...state.matters, response] }))
    return response
  },

  updateMatter: async (id, data) => {
    await mattersApi.update(id, data)
    set(state => ({
      matters: state.matters.map(m => m.id === id ? { ...m, ...data } : m)
    }))
  },

  deleteMatter: async (id) => {
    await mattersApi.delete(id)
    set(state => ({ matters: state.matters.filter(m => m.id !== id) }))
  },

  // Time Entry actions
  addTimeEntry: async (data) => {
    const response = await timeEntriesApi.create(data)
    set(state => ({ timeEntries: [...state.timeEntries, response] }))
    return response
  },

  updateTimeEntry: async (id, data) => {
    await timeEntriesApi.update(id, data)
    set(state => ({
      timeEntries: state.timeEntries.map(t => t.id === id ? { ...t, ...data } : t)
    }))
  },

  deleteTimeEntry: async (id) => {
    await timeEntriesApi.delete(id)
    set(state => ({ timeEntries: state.timeEntries.filter(t => t.id !== id) }))
  },

  // Invoice actions
  addInvoice: async (data) => {
    const response = await invoicesApi.create(data)
    set(state => ({ invoices: [...state.invoices, response] }))
    return response
  },

  updateInvoice: async (id, data) => {
    await invoicesApi.update(id, data)
    set(state => ({
      invoices: state.invoices.map(i => i.id === id ? { ...i, ...data } : i)
    }))
  },

  deleteInvoice: async (id) => {
    await invoicesApi.delete(id)
    set(state => ({ invoices: state.invoices.filter(i => i.id !== id) }))
  },

  // Event actions
  addEvent: async (data) => {
    const response = await calendarApi.create(data)
    set(state => ({ events: [...state.events, response] }))
    return response
  },

  updateEvent: async (id, data) => {
    await calendarApi.update(id, data)
    set(state => ({
      events: state.events.map(e => e.id === id ? { ...e, ...data } : e)
    }))
  },

  deleteEvent: async (id) => {
    await calendarApi.delete(id)
    set(state => ({ events: state.events.filter(e => e.id !== id) }))
  },

  // Document actions
  addDocument: async (file, metadata) => {
    const response = await documentsApi.upload(file, metadata)
    set(state => ({ documents: [...state.documents, response] }))
    return response
  },

  deleteDocument: async (id) => {
    await documentsApi.delete(id)
    set(state => ({ documents: state.documents.filter(d => d.id !== id) }))
  },

  // Notification actions
  markNotificationRead: (id) => {
    set(state => ({
      notifications: state.notifications.map(n => 
        n.id === id ? { ...n, read: true } : n
      )
    }))
  },

  clearNotifications: () => {
    set({ notifications: [] })
  },

  // API Key actions (stub implementation - full implementation needed when backend supports it)
  addAPIKey: async (data) => {
    // For now, create a local API key (won't persist to backend)
    const newKey = {
      id: crypto.randomUUID(),
      ...data,
      key: `apex_${crypto.randomUUID().replace(/-/g, '')}`,
      createdAt: new Date().toISOString(),
    }
    set(state => ({ apiKeys: [...state.apiKeys, newKey] }))
    return newKey
  },

  deleteAPIKey: async (id) => {
    set(state => ({ apiKeys: state.apiKeys.filter(k => k.id !== id) }))
  },

  // Group actions (stub implementation)
  addGroup: async (data) => {
    const newGroup = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date().toISOString(),
    }
    set(state => ({ groups: [...state.groups, newGroup] }))
    return newGroup
  },

  updateGroup: async (id, data) => {
    set(state => ({
      groups: state.groups.map(g => g.id === id ? { ...g, ...data } : g)
    }))
  },

  deleteGroup: async (id) => {
    set(state => ({ groups: state.groups.filter(g => g.id !== id) }))
  },

  // Matter Type actions
  addMatterType: (data) => {
    const newType: MatterTypeConfig = {
      id: crypto.randomUUID(),
      value: data.value.toLowerCase().replace(/\s+/g, '_'),
      label: data.label,
      active: true,
      createdAt: new Date().toISOString(),
    }
    set(state => ({ matterTypes: [...state.matterTypes, newType] }))
  },

  updateMatterType: (id, data) => {
    set(state => ({
      matterTypes: state.matterTypes.map(t => 
        t.id === id ? { ...t, ...data } : t
      )
    }))
  },

  deleteMatterType: (id) => {
    set(state => ({ matterTypes: state.matterTypes.filter(t => t.id !== id) }))
  },

  toggleMatterTypeActive: (id) => {
    set(state => ({
      matterTypes: state.matterTypes.map(t => 
        t.id === id ? { ...t, active: !t.active } : t
      )
    }))
  },

  getMatterTypeOptions: () => {
    const { matterTypes } = get()
    return matterTypes
      .filter(t => t.active)
      .map(t => ({ value: t.value, label: t.label }))
  },

  // Clear all data
  clearAll: () => {
    set({
      clients: [],
      matters: [],
      timeEntries: [],
      expenses: [],
      invoices: [],
      events: [],
      documents: [],
      apiKeys: [],
      groups: [],
      notifications: [],
      matterTypes: defaultMatterTypes,
    })
  },
}),
    {
      name: 'apex-data-store',
      partialize: (state) => ({ matterTypes: state.matterTypes }),
    }
  )
)
