import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  
  // Template Actions
  addTemplate: (template: Omit<DocumentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => DocumentTemplate
  updateTemplate: (id: string, data: Partial<DocumentTemplate>) => void
  deleteTemplate: (id: string) => void
  duplicateTemplate: (id: string) => DocumentTemplate
  
  // Variable Actions
  addVariable: (templateId: string, variable: Omit<TemplateVariable, 'id'>) => void
  updateVariable: (templateId: string, variableId: string, data: Partial<TemplateVariable>) => void
  removeVariable: (templateId: string, variableId: string) => void
  
  // AI Prompt Actions
  addAIPrompt: (templateId: string, prompt: Omit<AITemplatePrompt, 'id'>) => void
  updateAIPrompt: (templateId: string, promptId: string, data: Partial<AITemplatePrompt>) => void
  removeAIPrompt: (templateId: string, promptId: string) => void
  
  // Document Generation
  generateDocument: (templateId: string, variables: Record<string, string>, matterId?: string, clientId?: string) => GeneratedDocument
  updateGeneratedDocument: (id: string, data: Partial<GeneratedDocument>) => void
  deleteGeneratedDocument: (id: string) => void
  
  // AI Actions
  aiAutoFillVariables: (templateId: string, matterId: string) => Promise<Record<string, string>>
  aiReviewDocument: (documentId: string) => Promise<string>
  aiImproveContent: (content: string, prompt: string) => Promise<string>
  
  // Search & Filter
  searchTemplates: (query: string) => DocumentTemplate[]
  getTemplatesByCategory: (category: DocumentTemplate['category']) => DocumentTemplate[]
}

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Demo templates
const demoTemplates: DocumentTemplate[] = [
  {
    id: 'tmpl-1',
    name: 'Engagement Letter',
    description: 'Standard client engagement letter with fee agreement',
    category: 'letter',
    practiceArea: 'general',
    content: `[FIRM_NAME]
[FIRM_ADDRESS]
[FIRM_CITY], [FIRM_STATE] [FIRM_ZIP]

[DATE]

[CLIENT_NAME]
[CLIENT_ADDRESS]
[CLIENT_CITY], [CLIENT_STATE] [CLIENT_ZIP]

RE: Engagement Letter - [MATTER_NAME]

Dear [CLIENT_FIRST_NAME]:

Thank you for choosing [FIRM_NAME] to represent you in connection with [MATTER_DESCRIPTION]. This letter confirms the terms of our engagement.

SCOPE OF REPRESENTATION
We will provide legal services related to [MATTER_DESCRIPTION]. This engagement does not include representation in any other matters unless specifically agreed upon in writing.

FEES AND BILLING
Our fees will be based on [BILLING_TYPE] at a rate of [HOURLY_RATE] per hour. We will bill [BILLING_FREQUENCY] and payment is due within [PAYMENT_TERMS] days of invoice date.

[RETAINER_CLAUSE]

COMMUNICATION
We will keep you informed about significant developments in your matter. You may contact us at [ATTORNEY_EMAIL] or [ATTORNEY_PHONE].

Please sign and return a copy of this letter to confirm your acceptance of these terms.

Sincerely,

[ATTORNEY_NAME]
[ATTORNEY_TITLE]

ACCEPTED AND AGREED:

_______________________________
[CLIENT_NAME]

Date: _______________`,
    variables: [
      { id: 'v1', name: 'CLIENT_NAME', label: 'Client Name', type: 'client', required: true, aiAutoFill: true },
      { id: 'v2', name: 'CLIENT_ADDRESS', label: 'Client Address', type: 'text', required: true, aiAutoFill: true },
      { id: 'v3', name: 'MATTER_NAME', label: 'Matter Name', type: 'matter', required: true, aiAutoFill: true },
      { id: 'v4', name: 'MATTER_DESCRIPTION', label: 'Matter Description', type: 'text', required: true, aiAutoFill: true },
      { id: 'v5', name: 'BILLING_TYPE', label: 'Billing Type', type: 'select', options: ['hourly billing', 'flat fee', 'contingency'], required: true, aiAutoFill: false },
      { id: 'v6', name: 'HOURLY_RATE', label: 'Hourly Rate', type: 'currency', required: true, aiAutoFill: true },
      { id: 'v7', name: 'PAYMENT_TERMS', label: 'Payment Terms (days)', type: 'number', defaultValue: '30', required: true, aiAutoFill: false },
      { id: 'v8', name: 'RETAINER_CLAUSE', label: 'Retainer Clause', type: 'text', required: false, aiAutoFill: true }
    ],
    aiEnabled: true,
    aiPrompts: [
      { id: 'ai1', name: 'Generate Retainer Clause', prompt: 'Generate an appropriate retainer clause based on the matter type and billing arrangement', targetVariable: 'RETAINER_CLAUSE', action: 'generate' },
      { id: 'ai2', name: 'Review for Completeness', prompt: 'Review this engagement letter for any missing terms or potential issues', action: 'review' }
    ],
    isActive: true,
    usageCount: 45,
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-11-01T00:00:00Z'
  },
  {
    id: 'tmpl-2',
    name: 'Demand Letter',
    description: 'Pre-litigation demand letter template',
    category: 'letter',
    practiceArea: 'litigation',
    content: `[FIRM_LETTERHEAD]

[DATE]

VIA CERTIFIED MAIL AND EMAIL

[OPPOSING_PARTY_NAME]
[OPPOSING_PARTY_ADDRESS]

RE: Demand for [DEMAND_TYPE] - [MATTER_NAME]
    Our Client: [CLIENT_NAME]

Dear [OPPOSING_PARTY_SALUTATION]:

This firm represents [CLIENT_NAME] in connection with [MATTER_DESCRIPTION].

[FACTUAL_BACKGROUND]

[LEGAL_BASIS]

[DEMAND_TERMS]

We demand that you [SPECIFIC_DEMANDS] within [RESPONSE_DEADLINE] days of the date of this letter.

If we do not receive a satisfactory response, our client has authorized us to take all necessary legal action to protect their interests, including filing a lawsuit without further notice.

Please direct all future communications regarding this matter to our office.

Sincerely,

[ATTORNEY_NAME]
[ATTORNEY_TITLE]

cc: [CLIENT_NAME]`,
    variables: [
      { id: 'v1', name: 'OPPOSING_PARTY_NAME', label: 'Opposing Party Name', type: 'text', required: true, aiAutoFill: false },
      { id: 'v2', name: 'DEMAND_TYPE', label: 'Demand Type', type: 'select', options: ['Payment', 'Performance', 'Cease and Desist', 'Settlement'], required: true, aiAutoFill: false },
      { id: 'v3', name: 'FACTUAL_BACKGROUND', label: 'Factual Background', type: 'text', required: true, aiAutoFill: true },
      { id: 'v4', name: 'LEGAL_BASIS', label: 'Legal Basis', type: 'text', required: true, aiAutoFill: true },
      { id: 'v5', name: 'DEMAND_TERMS', label: 'Demand Terms', type: 'text', required: true, aiAutoFill: true },
      { id: 'v6', name: 'SPECIFIC_DEMANDS', label: 'Specific Demands', type: 'text', required: true, aiAutoFill: false },
      { id: 'v7', name: 'RESPONSE_DEADLINE', label: 'Response Deadline (days)', type: 'number', defaultValue: '14', required: true, aiAutoFill: false }
    ],
    aiEnabled: true,
    aiPrompts: [
      { id: 'ai1', name: 'Generate Factual Background', prompt: 'Based on the matter details, generate a clear and persuasive factual background section', targetVariable: 'FACTUAL_BACKGROUND', action: 'generate' },
      { id: 'ai2', name: 'Suggest Legal Basis', prompt: 'Identify and articulate the legal basis for this demand based on the facts', targetVariable: 'LEGAL_BASIS', action: 'generate' },
      { id: 'ai3', name: 'Strengthen Language', prompt: 'Review and strengthen the language to be more persuasive while remaining professional', action: 'improve' }
    ],
    isActive: true,
    usageCount: 32,
    createdBy: 'user-1',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-10-15T00:00:00Z'
  },
  {
    id: 'tmpl-3',
    name: 'Motion Template',
    description: 'General motion template for court filings',
    category: 'pleading',
    practiceArea: 'litigation',
    content: `[COURT_CAPTION]

Case No.: [CASE_NUMBER]

[MOTION_TITLE]

[PARTY_NAME], [PARTY_DESIGNATION], by and through undersigned counsel, respectfully moves this Honorable Court for [RELIEF_SOUGHT] and in support thereof states as follows:

I. INTRODUCTION

[INTRODUCTION]

II. FACTUAL BACKGROUND

[FACTUAL_BACKGROUND]

III. LEGAL ARGUMENT

[LEGAL_ARGUMENT]

IV. CONCLUSION

For the foregoing reasons, [PARTY_NAME] respectfully requests that this Court [CONCLUSION_RELIEF].

Respectfully submitted,

[ATTORNEY_SIGNATURE_BLOCK]

CERTIFICATE OF SERVICE

I hereby certify that on [DATE], a copy of the foregoing was served via [SERVICE_METHOD] on:

[OPPOSING_COUNSEL_INFO]

_______________________________
[ATTORNEY_NAME]`,
    variables: [
      { id: 'v1', name: 'COURT_CAPTION', label: 'Court Caption', type: 'text', required: true, aiAutoFill: true },
      { id: 'v2', name: 'CASE_NUMBER', label: 'Case Number', type: 'text', required: true, aiAutoFill: true },
      { id: 'v3', name: 'MOTION_TITLE', label: 'Motion Title', type: 'text', required: true, aiAutoFill: false },
      { id: 'v4', name: 'RELIEF_SOUGHT', label: 'Relief Sought', type: 'text', required: true, aiAutoFill: false },
      { id: 'v5', name: 'INTRODUCTION', label: 'Introduction', type: 'text', required: true, aiAutoFill: true },
      { id: 'v6', name: 'FACTUAL_BACKGROUND', label: 'Factual Background', type: 'text', required: true, aiAutoFill: true },
      { id: 'v7', name: 'LEGAL_ARGUMENT', label: 'Legal Argument', type: 'text', required: true, aiAutoFill: true }
    ],
    aiEnabled: true,
    aiPrompts: [
      { id: 'ai1', name: 'Draft Introduction', prompt: 'Draft a compelling introduction for this motion based on the relief sought', targetVariable: 'INTRODUCTION', action: 'generate' },
      { id: 'ai2', name: 'Research Legal Argument', prompt: 'Research and draft legal arguments supporting this motion with relevant case citations', targetVariable: 'LEGAL_ARGUMENT', action: 'generate' },
      { id: 'ai3', name: 'Citation Check', prompt: 'Verify all legal citations are accurate and current', action: 'review' }
    ],
    isActive: true,
    usageCount: 67,
    createdBy: 'user-1',
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-11-10T00:00:00Z'
  },
  {
    id: 'tmpl-4',
    name: 'NDA - Mutual',
    description: 'Mutual non-disclosure agreement for business transactions',
    category: 'contract',
    practiceArea: 'corporate',
    content: `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of [EFFECTIVE_DATE] by and between:

[PARTY_A_NAME], a [PARTY_A_ENTITY_TYPE] ("Party A")
and
[PARTY_B_NAME], a [PARTY_B_ENTITY_TYPE] ("Party B")

(collectively, the "Parties")

RECITALS

The Parties wish to explore [PURPOSE] (the "Purpose") and in connection therewith may disclose certain confidential information to each other.

1. DEFINITION OF CONFIDENTIAL INFORMATION

[CONFIDENTIAL_INFO_DEFINITION]

2. OBLIGATIONS OF RECEIVING PARTY

[OBLIGATIONS]

3. TERM

This Agreement shall remain in effect for [TERM_YEARS] years from the Effective Date.

4. RETURN OF MATERIALS

[RETURN_CLAUSE]

5. GOVERNING LAW

This Agreement shall be governed by the laws of the State of [GOVERNING_STATE].

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the date first written above.

[PARTY_A_NAME]                      [PARTY_B_NAME]

By: _________________________      By: _________________________
Name:                               Name:
Title:                              Title:
Date:                               Date:`,
    variables: [
      { id: 'v1', name: 'EFFECTIVE_DATE', label: 'Effective Date', type: 'date', required: true, aiAutoFill: false },
      { id: 'v2', name: 'PARTY_A_NAME', label: 'Party A Name', type: 'client', required: true, aiAutoFill: true },
      { id: 'v3', name: 'PARTY_B_NAME', label: 'Party B Name', type: 'text', required: true, aiAutoFill: false },
      { id: 'v4', name: 'PURPOSE', label: 'Purpose of Disclosure', type: 'text', required: true, aiAutoFill: true },
      { id: 'v5', name: 'CONFIDENTIAL_INFO_DEFINITION', label: 'Definition of Confidential Info', type: 'text', required: true, aiAutoFill: true },
      { id: 'v6', name: 'TERM_YEARS', label: 'Term (years)', type: 'number', defaultValue: '3', required: true, aiAutoFill: false },
      { id: 'v7', name: 'GOVERNING_STATE', label: 'Governing State', type: 'text', required: true, aiAutoFill: true }
    ],
    aiEnabled: true,
    aiPrompts: [
      { id: 'ai1', name: 'Generate Confidential Info Definition', prompt: 'Generate a comprehensive definition of confidential information appropriate for this transaction', targetVariable: 'CONFIDENTIAL_INFO_DEFINITION', action: 'generate' },
      { id: 'ai2', name: 'Review for Red Flags', prompt: 'Review this NDA for any unusual or potentially problematic terms', action: 'review' }
    ],
    isActive: true,
    usageCount: 89,
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-09-01T00:00:00Z'
  }
]

export const useTemplateStore = create<TemplateStoreState>()(
  persist(
    (set, get) => ({
      templates: demoTemplates,
      generatedDocuments: [],

      addTemplate: (data) => {
        const template: DocumentTemplate = {
          ...data,
          id: generateId(),
          usageCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        set(state => ({ templates: [...state.templates, template] }))
        return template
      },

      updateTemplate: (id, data) => {
        set(state => ({
          templates: state.templates.map(t =>
            t.id === id ? { ...t, ...data, updatedAt: new Date().toISOString() } : t
          )
        }))
      },

      deleteTemplate: (id) => {
        set(state => ({ templates: state.templates.filter(t => t.id !== id) }))
      },

      duplicateTemplate: (id) => {
        const original = get().templates.find(t => t.id === id)
        if (!original) throw new Error('Template not found')
        
        const duplicate: DocumentTemplate = {
          ...original,
          id: generateId(),
          name: `${original.name} (Copy)`,
          usageCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        set(state => ({ templates: [...state.templates, duplicate] }))
        return duplicate
      },

      addVariable: (templateId, variable) => {
        const newVariable: TemplateVariable = {
          ...variable,
          id: generateId()
        }
        set(state => ({
          templates: state.templates.map(t =>
            t.id === templateId 
              ? { ...t, variables: [...t.variables, newVariable], updatedAt: new Date().toISOString() }
              : t
          )
        }))
      },

      updateVariable: (templateId, variableId, data) => {
        set(state => ({
          templates: state.templates.map(t =>
            t.id === templateId
              ? {
                  ...t,
                  variables: t.variables.map(v => v.id === variableId ? { ...v, ...data } : v),
                  updatedAt: new Date().toISOString()
                }
              : t
          )
        }))
      },

      removeVariable: (templateId, variableId) => {
        set(state => ({
          templates: state.templates.map(t =>
            t.id === templateId
              ? { ...t, variables: t.variables.filter(v => v.id !== variableId), updatedAt: new Date().toISOString() }
              : t
          )
        }))
      },

      addAIPrompt: (templateId, prompt) => {
        const newPrompt: AITemplatePrompt = {
          ...prompt,
          id: generateId()
        }
        set(state => ({
          templates: state.templates.map(t =>
            t.id === templateId
              ? { ...t, aiPrompts: [...t.aiPrompts, newPrompt], updatedAt: new Date().toISOString() }
              : t
          )
        }))
      },

      updateAIPrompt: (templateId, promptId, data) => {
        set(state => ({
          templates: state.templates.map(t =>
            t.id === templateId
              ? {
                  ...t,
                  aiPrompts: t.aiPrompts.map(p => p.id === promptId ? { ...p, ...data } : p),
                  updatedAt: new Date().toISOString()
                }
              : t
          )
        }))
      },

      removeAIPrompt: (templateId, promptId) => {
        set(state => ({
          templates: state.templates.map(t =>
            t.id === templateId
              ? { ...t, aiPrompts: t.aiPrompts.filter(p => p.id !== promptId), updatedAt: new Date().toISOString() }
              : t
          )
        }))
      },

      generateDocument: (templateId, variables, matterId, clientId) => {
        const template = get().templates.find(t => t.id === templateId)
        if (!template) throw new Error('Template not found')

        // Replace variables in content
        let content = template.content
        Object.entries(variables).forEach(([key, value]) => {
          content = content.replace(new RegExp(`\\[${key}\\]`, 'g'), value)
        })

        const doc: GeneratedDocument = {
          id: generateId(),
          templateId,
          matterId,
          clientId,
          name: `${template.name} - ${new Date().toLocaleDateString()}`,
          content,
          variables,
          status: 'draft',
          createdBy: 'user-1',
          createdAt: new Date().toISOString()
        }

        // Increment usage count
        get().updateTemplate(templateId, { usageCount: template.usageCount + 1 })

        set(state => ({ generatedDocuments: [...state.generatedDocuments, doc] }))
        return doc
      },

      updateGeneratedDocument: (id, data) => {
        set(state => ({
          generatedDocuments: state.generatedDocuments.map(d =>
            d.id === id ? { ...d, ...data } : d
          )
        }))
      },

      deleteGeneratedDocument: (id) => {
        set(state => ({
          generatedDocuments: state.generatedDocuments.filter(d => d.id !== id)
        }))
      },

      aiAutoFillVariables: async (templateId, matterId) => {
        // Simulate AI call
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        // Return mock auto-filled values
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
        
        // Return slightly modified content (in real implementation, this would call Azure OpenAI)
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
    }),
    {
      name: 'apex-templates'
    }
  )
)
