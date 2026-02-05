import { create } from 'zustand'
import { documentTemplatesApi } from '../services/api'

// Document Template Types
export interface DocumentTemplate {
  id: string
  name: string
  description?: string
  category: 'contract' | 'letter' | 'pleading' | 'discovery' | 'estate' | 'corporate' | 'custom'
  practiceArea?: string
  content: string
  variables: TemplateVariable[]
  aiEnabled: boolean
  aiPrompts: AITemplatePrompt[]
  isActive: boolean
  usageCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TemplateVariable {
  id: string
  name: string
  label: string
  type: 'text' | 'date' | 'number' | 'currency' | 'select' | 'client' | 'matter' | 'user' | 'firm'
  defaultValue?: string
  options?: string[]
  required: boolean
  aiAutoFill: boolean
}

export interface AITemplatePrompt {
  id: string
  name: string
  prompt: string
  targetVariable?: string
  action: 'generate' | 'review' | 'summarize' | 'improve'
}

export interface GeneratedDocument {
  id: string
  templateId: string
  matterId?: string
  clientId?: string
  name: string
  content: string
  variables: Record<string, string>
  status: 'draft' | 'review' | 'approved' | 'sent'
  aiReviewNotes?: string
  createdBy: string
  createdAt: string
}

// Template Store State
interface TemplateStoreState {
  templates: DocumentTemplate[]
  generatedDocuments: GeneratedDocument[]
  isLoading: boolean
  isInitialized: boolean
  
  // Fetch all data
  fetchAll: () => Promise<void>
  
  // Template Actions
  addTemplate: (template: Omit<DocumentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => Promise<DocumentTemplate>
  updateTemplate: (id: string, data: Partial<DocumentTemplate>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  duplicateTemplate: (id: string) => Promise<DocumentTemplate>
  
  // Variable Actions
  addVariable: (templateId: string, variable: Omit<TemplateVariable, 'id'>) => Promise<void>
  updateVariable: (templateId: string, variableId: string, data: Partial<TemplateVariable>) => Promise<void>
  removeVariable: (templateId: string, variableId: string) => Promise<void>
  
  // AI Prompt Actions
  addAIPrompt: (templateId: string, prompt: Omit<AITemplatePrompt, 'id'>) => Promise<void>
  updateAIPrompt: (templateId: string, promptId: string, data: Partial<AITemplatePrompt>) => Promise<void>
  removeAIPrompt: (templateId: string, promptId: string) => Promise<void>
  
  // Document Generation
  generateDocument: (templateId: string, variables: Record<string, string>, matterId?: string, clientId?: string) => Promise<GeneratedDocument>
  updateGeneratedDocument: (id: string, data: Partial<GeneratedDocument>) => Promise<void>
  deleteGeneratedDocument: (id: string) => Promise<void>
  
  // AI Actions
  aiAutoFillVariables: (templateId: string, matterId: string) => Promise<Record<string, string>>
  aiReviewDocument: (documentId: string) => Promise<string>
  aiImproveContent: (content: string, prompt: string) => Promise<string>
  
  // Search & Filter
  searchTemplates: (query: string) => DocumentTemplate[]
  getTemplatesByCategory: (category: DocumentTemplate['category']) => DocumentTemplate[]
}

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useTemplateStore = create<TemplateStoreState>()(
  (set, get) => ({
    templates: [],
    generatedDocuments: [],
    isLoading: false,
    isInitialized: false,

    // Fetch all template data from database
    fetchAll: async () => {
      if (get().isLoading) return
      set({ isLoading: true })
      try {
        const data = await documentTemplatesApi.getAll()
        set({
          templates: data.templates || [],
          generatedDocuments: data.generatedDocuments || [],
          isInitialized: true,
          isLoading: false,
        })
      } catch (error) {
        console.error('Failed to fetch template data:', error)
        set({ isLoading: false, isInitialized: true })
      }
    },

    addTemplate: async (data) => {
      const template = await documentTemplatesApi.createTemplate(data)
      set(state => ({ templates: [...state.templates, template] }))
      return template
    },

    updateTemplate: async (id, data) => {
      await documentTemplatesApi.updateTemplate(id, data)
      set(state => ({
        templates: state.templates.map(t =>
          t.id === id ? { ...t, ...data, updatedAt: new Date().toISOString() } : t
        )
      }))
    },

    deleteTemplate: async (id) => {
      await documentTemplatesApi.deleteTemplate(id)
      set(state => ({ templates: state.templates.filter(t => t.id !== id) }))
    },

    duplicateTemplate: async (id) => {
      const duplicate = await documentTemplatesApi.duplicateTemplate(id)
      set(state => ({ templates: [...state.templates, duplicate] }))
      return duplicate
    },

    addVariable: async (templateId, variable) => {
      const template = get().templates.find(t => t.id === templateId)
      if (!template) return
      
      const newVariable: TemplateVariable = { ...variable, id: generateId() }
      const updatedVariables = [...template.variables, newVariable]
      
      await documentTemplatesApi.updateTemplate(templateId, { variables: updatedVariables })
      set(state => ({
        templates: state.templates.map(t =>
          t.id === templateId 
            ? { ...t, variables: updatedVariables, updatedAt: new Date().toISOString() }
            : t
        )
      }))
    },

    updateVariable: async (templateId, variableId, data) => {
      const template = get().templates.find(t => t.id === templateId)
      if (!template) return
      
      const updatedVariables = template.variables.map(v => 
        v.id === variableId ? { ...v, ...data } : v
      )
      
      await documentTemplatesApi.updateTemplate(templateId, { variables: updatedVariables })
      set(state => ({
        templates: state.templates.map(t =>
          t.id === templateId
            ? { ...t, variables: updatedVariables, updatedAt: new Date().toISOString() }
            : t
        )
      }))
    },

    removeVariable: async (templateId, variableId) => {
      const template = get().templates.find(t => t.id === templateId)
      if (!template) return
      
      const updatedVariables = template.variables.filter(v => v.id !== variableId)
      
      await documentTemplatesApi.updateTemplate(templateId, { variables: updatedVariables })
      set(state => ({
        templates: state.templates.map(t =>
          t.id === templateId
            ? { ...t, variables: updatedVariables, updatedAt: new Date().toISOString() }
            : t
        )
      }))
    },

    addAIPrompt: async (templateId, prompt) => {
      const template = get().templates.find(t => t.id === templateId)
      if (!template) return
      
      const newPrompt: AITemplatePrompt = { ...prompt, id: generateId() }
      const updatedPrompts = [...template.aiPrompts, newPrompt]
      
      await documentTemplatesApi.updateTemplate(templateId, { aiPrompts: updatedPrompts })
      set(state => ({
        templates: state.templates.map(t =>
          t.id === templateId
            ? { ...t, aiPrompts: updatedPrompts, updatedAt: new Date().toISOString() }
            : t
        )
      }))
    },

    updateAIPrompt: async (templateId, promptId, data) => {
      const template = get().templates.find(t => t.id === templateId)
      if (!template) return
      
      const updatedPrompts = template.aiPrompts.map(p => 
        p.id === promptId ? { ...p, ...data } : p
      )
      
      await documentTemplatesApi.updateTemplate(templateId, { aiPrompts: updatedPrompts })
      set(state => ({
        templates: state.templates.map(t =>
          t.id === templateId
            ? { ...t, aiPrompts: updatedPrompts, updatedAt: new Date().toISOString() }
            : t
        )
      }))
    },

    removeAIPrompt: async (templateId, promptId) => {
      const template = get().templates.find(t => t.id === templateId)
      if (!template) return
      
      const updatedPrompts = template.aiPrompts.filter(p => p.id !== promptId)
      
      await documentTemplatesApi.updateTemplate(templateId, { aiPrompts: updatedPrompts })
      set(state => ({
        templates: state.templates.map(t =>
          t.id === templateId
            ? { ...t, aiPrompts: updatedPrompts, updatedAt: new Date().toISOString() }
            : t
        )
      }))
    },

    generateDocument: async (templateId, variables, matterId, clientId) => {
      const template = get().templates.find(t => t.id === templateId)
      if (!template) throw new Error('Template not found')

      // Replace variables in content
      let content = template.content
      Object.entries(variables).forEach(([key, value]) => {
        content = content.replace(new RegExp(`\\[${key}\\]`, 'g'), value)
      })

      const doc = await documentTemplatesApi.createGeneratedDocument({
        templateId,
        matterId,
        clientId,
        name: `${template.name} - ${new Date().toLocaleDateString()}`,
        content,
        variables,
        status: 'draft',
      })

      // Increment usage count locally (API handles it too)
      set(state => ({
        templates: state.templates.map(t =>
          t.id === templateId ? { ...t, usageCount: t.usageCount + 1 } : t
        ),
        generatedDocuments: [...state.generatedDocuments, doc]
      }))

      return doc
    },

    updateGeneratedDocument: async (id, data) => {
      await documentTemplatesApi.updateGeneratedDocument(id, data)
      set(state => ({
        generatedDocuments: state.generatedDocuments.map(d =>
          d.id === id ? { ...d, ...data } : d
        )
      }))
    },

    deleteGeneratedDocument: async (id) => {
      await documentTemplatesApi.deleteGeneratedDocument(id)
      set(state => ({
        generatedDocuments: state.generatedDocuments.filter(d => d.id !== id)
      }))
    },

    aiAutoFillVariables: async (_templateId, _matterId) => {
      // Simulate AI call - in production this would call the AI API
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      return {
        CLIENT_NAME: 'Quantum Technologies Inc.',
        CLIENT_ADDRESS: '500 Innovation Drive, San Francisco, CA 94105',
        MATTER_NAME: 'Quantum v. TechStart - Patent Infringement',
        MATTER_DESCRIPTION: 'patent infringement litigation regarding quantum computing algorithms',
        HOURLY_RATE: '$550',
        RETAINER_CLAUSE: 'Client agrees to pay an initial retainer of $25,000, which will be held in our trust account and applied against invoices as they are issued.'
      }
    },

    aiReviewDocument: async (documentId) => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      return `AI Document Review Complete:

✓ All required sections present
✓ Party names consistent throughout
✓ Dates properly formatted
⚠ Consider adding jurisdiction-specific language in Section 3
⚠ Payment terms should specify accepted methods
✓ Signature blocks properly formatted

Overall: Document is well-structured and ready for review.`
    },

    aiImproveContent: async (content, prompt) => {
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      return content.replace(/respectfully/gi, 'hereby').replace(/states as follows/gi, 'represents and states')
    },

    searchTemplates: (query) => {
      const lowerQuery = query.toLowerCase()
      return get().templates.filter(t =>
        t.name.toLowerCase().includes(lowerQuery) ||
        t.description?.toLowerCase().includes(lowerQuery) ||
        t.category.toLowerCase().includes(lowerQuery)
      )
    },

    getTemplatesByCategory: (category) => {
      return get().templates.filter(t => t.category === category)
    }
  })
)
