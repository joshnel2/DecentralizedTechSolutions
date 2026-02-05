import { create } from 'zustand'
import { 
  clientsApi, 
  mattersApi, 
  timeEntriesApi, 
  invoicesApi, 
  calendarApi, 
  documentsApi,
  matterTypesApi,
  teamApi,
  apiKeysApi
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

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000

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
  
  // Cache timestamps
  documentsLastFetched: number | null
  mattersLastFetched: number | null
  clientsLastFetched: number | null
  
  // Loading states
  isLoading: boolean
  documentsLoading: boolean
  mattersLoading: boolean
  clientsLoading: boolean
  error: string | null
  
  // Fetch actions (with optional forceRefresh)
  fetchClients: (params?: { view?: 'my' | 'all'; forceRefresh?: boolean }) => Promise<void>
  fetchMatters: (params?: { view?: 'my' | 'all'; forceRefresh?: boolean }) => Promise<void>
  fetchTimeEntries: (params?: { matterId?: string; limit?: number; offset?: number }) => Promise<void>
  fetchInvoices: (params?: { view?: 'my' | 'all' }) => Promise<void>
  fetchEvents: (params?: { startDate?: string; endDate?: string }) => Promise<void>
  fetchDocuments: (params?: { matterId?: string; forceRefresh?: boolean }) => Promise<void>
  
  // Cache helpers
  isDocumentsCacheValid: () => boolean
  isMattersCacheValid: () => boolean
  isClientsCacheValid: () => boolean
  invalidateDocumentsCache: () => void
  
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
  
  // API Key actions
  fetchAPIKeys: () => Promise<void>
  addAPIKey: (data: any) => Promise<any>
  deleteAPIKey: (id: string) => Promise<void>
  
  // Group actions
  fetchGroups: () => Promise<void>
  addGroup: (data: any) => Promise<any>
  updateGroup: (id: string, data: any) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  
  // Matter Type actions
  fetchMatterTypes: () => Promise<void>
  addMatterType: (data: { value: string; label: string }) => Promise<void>
  updateMatterType: (id: string, data: Partial<MatterTypeConfig>) => Promise<void>
  deleteMatterType: (id: string) => Promise<void>
  toggleMatterTypeActive: (id: string) => Promise<void>
  getMatterTypeOptions: () => { value: string; label: string }[]
  
  // Clear all data (for logout)
  clearAll: () => void
}

export const useDataStore = create<DataState>()(
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
  
  // Cache timestamps
  documentsLastFetched: null,
  mattersLastFetched: null,
  clientsLastFetched: null,
  
  // Loading states
  isLoading: false,
  documentsLoading: false,
  mattersLoading: false,
  clientsLoading: false,
  error: null,
  
  // Cache validation helpers
  isDocumentsCacheValid: () => {
    const { documentsLastFetched, documents } = get()
    if (!documentsLastFetched || documents.length === 0) return false
    return Date.now() - documentsLastFetched < CACHE_DURATION
  },
  
  isMattersCacheValid: () => {
    const { mattersLastFetched, matters } = get()
    if (!mattersLastFetched || matters.length === 0) return false
    return Date.now() - mattersLastFetched < CACHE_DURATION
  },
  
  isClientsCacheValid: () => {
    const { clientsLastFetched, clients } = get()
    if (!clientsLastFetched || clients.length === 0) return false
    return Date.now() - clientsLastFetched < CACHE_DURATION
  },
  
  invalidateDocumentsCache: () => {
    set({ documentsLastFetched: null })
  },

  // Fetch clients from API (with caching)
  fetchClients: async (params) => {
    const { isClientsCacheValid } = get()
    
    // Use cache if valid and not forcing refresh
    if (!params?.forceRefresh && isClientsCacheValid()) {
      return
    }
    
    set({ clientsLoading: true, error: null })
    try {
      const response = await clientsApi.getAll({ view: params?.view || 'my' })
      set({ 
        clients: response.clients, 
        clientsLoading: false,
        clientsLastFetched: Date.now()
      })
    } catch (error) {
      console.error('Failed to fetch clients:', error)
      set({ error: 'Failed to fetch clients', clientsLoading: false })
    }
  },

  // Fetch matters from API (with caching)
  fetchMatters: async (params) => {
    const { isMattersCacheValid } = get()
    
    // Use cache if valid and not forcing refresh
    if (!params?.forceRefresh && isMattersCacheValid()) {
      return
    }
    
    set({ mattersLoading: true, error: null })
    try {
      const response = await mattersApi.getAll({ view: params?.view || 'my' })
      set({ 
        matters: response.matters, 
        mattersLoading: false,
        mattersLastFetched: Date.now()
      })
    } catch (error) {
      console.error('Failed to fetch matters:', error)
      set({ error: 'Failed to fetch matters', mattersLoading: false })
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
  fetchInvoices: async (params?: { view?: 'my' | 'all' }) => {
    set({ isLoading: true, error: null })
    try {
      const response = await invoicesApi.getAll({ view: params?.view || 'my' })
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

  // Fetch documents from API (with caching)
  fetchDocuments: async (params) => {
    const { isDocumentsCacheValid, documents } = get()
    
    // Use cache if valid, not forcing refresh, and no specific matterId filter
    if (!params?.forceRefresh && !params?.matterId && isDocumentsCacheValid()) {
      return
    }
    
    // Only show loading spinner if we don't have any cached documents
    const showLoading = documents.length === 0
    set({ documentsLoading: true, isLoading: showLoading, error: null })
    
    try {
      const response = await documentsApi.getAll(params)
      set({ 
        documents: response.documents, 
        documentsLoading: false, 
        isLoading: false,
        documentsLastFetched: params?.matterId ? get().documentsLastFetched : Date.now()
      })
    } catch (error) {
      console.error('Failed to fetch documents:', error)
      set({ error: 'Failed to fetch documents', documentsLoading: false, isLoading: false })
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
    set(state => ({ 
      documents: [...state.documents, response],
      documentsLastFetched: null // Invalidate cache to ensure fresh data on next fetch
    }))
    return response
  },

  deleteDocument: async (id) => {
    await documentsApi.delete(id)
    set(state => ({ 
      documents: state.documents.filter(d => d.id !== id),
      documentsLastFetched: null // Invalidate cache
    }))
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

  // API Key actions
  fetchAPIKeys: async () => {
    try {
      const response = await apiKeysApi.getAll()
      const apiKeys = response.apiKeys || response.data || []
      set({ apiKeys })
    } catch (error) {
      console.error('Failed to fetch API keys:', error)
    }
  },

  addAPIKey: async (data) => {
    try {
      const response = await apiKeysApi.create(data)
      const newKey = response.apiKey || response
      // Add to local state (note: the full key is only returned on creation)
      set(state => ({ apiKeys: [...state.apiKeys, newKey] }))
      return newKey
    } catch (error) {
      console.error('Failed to create API key:', error)
      throw error
    }
  },

  deleteAPIKey: async (id) => {
    try {
      await apiKeysApi.revoke(id)
      set(state => ({ apiKeys: state.apiKeys.filter(k => k.id !== id) }))
    } catch (error) {
      console.error('Failed to revoke API key:', error)
      throw error
    }
  },

  // Group actions
  fetchGroups: async () => {
    try {
      const response = await teamApi.getGroups()
      const groups = response.groups || response.data || (Array.isArray(response) ? response : [])
      set({ groups })
    } catch (error) {
      console.error('Failed to fetch groups:', error)
    }
  },

  addGroup: async (data) => {
    try {
      const response = await teamApi.createGroup(data)
      const newGroup = response.group || response.data || response
      set(state => ({ groups: [...state.groups, newGroup] }))
      return newGroup
    } catch (error) {
      // Fallback to local creation if API fails
      const newGroup = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date().toISOString(),
      }
      set(state => ({ groups: [...state.groups, newGroup] }))
      return newGroup
    }
  },

  updateGroup: async (id, data) => {
    try {
      await teamApi.updateGroup(id, data)
      set(state => ({
        groups: state.groups.map(g => g.id === id ? { ...g, ...data } : g)
      }))
    } catch (error) {
      console.error('Failed to update group:', error)
      // Still update locally
      set(state => ({
        groups: state.groups.map(g => g.id === id ? { ...g, ...data } : g)
      }))
    }
  },

  deleteGroup: async (id) => {
    try {
      await teamApi.deleteGroup(id)
      set(state => ({ groups: state.groups.filter(g => g.id !== id) }))
    } catch (error) {
      console.error('Failed to delete group:', error)
      // Still delete locally
      set(state => ({ groups: state.groups.filter(g => g.id !== id) }))
    }
  },

  // Matter Type actions
  fetchMatterTypes: async () => {
    try {
      const response = await matterTypesApi.getAll()
      if (response.matterTypes && response.matterTypes.length > 0) {
        set({ matterTypes: response.matterTypes })
      } else {
        // Seed defaults if empty
        await matterTypesApi.seedDefaults()
        const seededResponse = await matterTypesApi.getAll()
        set({ matterTypes: seededResponse.matterTypes || defaultMatterTypes })
      }
    } catch (error) {
      console.error('Failed to fetch matter types:', error)
      // Keep default matter types on error
    }
  },

  addMatterType: async (data) => {
    try {
      const newType = await matterTypesApi.create(data)
      set(state => ({ matterTypes: [...state.matterTypes, newType] }))
    } catch (error) {
      console.error('Failed to add matter type:', error)
      throw error
    }
  },

  updateMatterType: async (id, data) => {
    try {
      const updated = await matterTypesApi.update(id, data)
      set(state => ({
        matterTypes: state.matterTypes.map(t => 
          t.id === id ? { ...t, ...updated } : t
        )
      }))
    } catch (error) {
      console.error('Failed to update matter type:', error)
      throw error
    }
  },

  deleteMatterType: async (id) => {
    try {
      await matterTypesApi.delete(id)
      set(state => ({ matterTypes: state.matterTypes.filter(t => t.id !== id) }))
    } catch (error) {
      console.error('Failed to delete matter type:', error)
      throw error
    }
  },

  toggleMatterTypeActive: async (id) => {
    const { matterTypes } = get()
    const matterType = matterTypes.find(t => t.id === id)
    if (matterType) {
      try {
        await matterTypesApi.update(id, { active: !matterType.active })
        set(state => ({
          matterTypes: state.matterTypes.map(t => 
            t.id === id ? { ...t, active: !t.active } : t
          )
        }))
      } catch (error) {
        console.error('Failed to toggle matter type:', error)
        throw error
      }
    }
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
      // Clear cache timestamps
      documentsLastFetched: null,
      mattersLastFetched: null,
      clientsLastFetched: null,
    })
  },
})
)
