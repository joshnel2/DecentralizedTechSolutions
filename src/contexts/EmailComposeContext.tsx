import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react'
import { integrationsApi } from '../services/api'

interface Attachment {
  id: string
  name: string
  size: number
  type: 'document' | 'invoice' | 'file'
  data?: File
}

interface EmailDraft {
  to: string
  cc: string
  subject: string
  body: string
  attachments: Attachment[]
  replyToId?: string
  isReply?: boolean
  isForward?: boolean
}

interface EmailIntegrationStatus {
  isConnected: boolean
  provider: 'outlook' | 'gmail' | null
  checkingStatus: boolean
  showSetupPrompt: boolean
}

interface EmailComposeContextType {
  isOpen: boolean
  draft: EmailDraft
  isMinimized: boolean
  emailIntegration: EmailIntegrationStatus
  openCompose: (options?: Partial<EmailDraft>) => void
  closeCompose: (saveDraft?: boolean) => void
  minimizeCompose: () => void
  maximizeCompose: () => void
  updateDraft: (updates: Partial<EmailDraft>) => void
  addAttachment: (attachment: Attachment) => void
  removeAttachment: (id: string) => void
  dismissSetupPrompt: () => void
  // Quick actions
  emailDocument: (doc: { id: string; name: string; size: number }) => void
  emailInvoice: (invoice: { id: string; invoiceNumber: string; clientName: string; total: number }) => void
}

const defaultDraft: EmailDraft = {
  to: '',
  cc: '',
  subject: '',
  body: '',
  attachments: []
}

const EmailComposeContext = createContext<EmailComposeContextType | null>(null)

export function EmailComposeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [draft, setDraft] = useState<EmailDraft>(defaultDraft)
  const [emailIntegration, setEmailIntegration] = useState<EmailIntegrationStatus>({
    isConnected: false,
    provider: null,
    checkingStatus: true,
    showSetupPrompt: false
  })

  // Check email integration status on mount
  useEffect(() => {
    checkEmailIntegration()
  }, [])

  const checkEmailIntegration = async () => {
    setEmailIntegration(prev => ({ ...prev, checkingStatus: true }))
    try {
      const data = await integrationsApi.getAll()
      const integrations = data.integrations || {}
      
      // Check Outlook first, then Gmail
      if (integrations.outlook?.isConnected) {
        setEmailIntegration({
          isConnected: true,
          provider: 'outlook',
          checkingStatus: false,
          showSetupPrompt: false
        })
      } else if (integrations.google?.isConnected) {
        setEmailIntegration({
          isConnected: true,
          provider: 'gmail',
          checkingStatus: false,
          showSetupPrompt: false
        })
      } else {
        setEmailIntegration({
          isConnected: false,
          provider: null,
          checkingStatus: false,
          showSetupPrompt: false
        })
      }
    } catch (error) {
      console.error('Failed to check email integration:', error)
      setEmailIntegration({
        isConnected: false,
        provider: null,
        checkingStatus: false,
        showSetupPrompt: false
      })
    }
  }

  const dismissSetupPrompt = useCallback(() => {
    setEmailIntegration(prev => ({ ...prev, showSetupPrompt: false }))
  }, [])

  const openCompose = useCallback((options?: Partial<EmailDraft>) => {
    // Check if email is connected
    if (!emailIntegration.isConnected && !emailIntegration.checkingStatus) {
      // Show setup prompt instead of compose
      setEmailIntegration(prev => ({ ...prev, showSetupPrompt: true }))
      return
    }
    
    setDraft({ ...defaultDraft, ...options })
    setIsOpen(true)
    setIsMinimized(false)
  }, [emailIntegration.isConnected, emailIntegration.checkingStatus])

  const closeCompose = useCallback(async (saveDraft = true) => {
    // If there's content and saveDraft is true, save to Outlook drafts
    if (saveDraft && (draft.to || draft.subject || draft.body)) {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
        const token = localStorage.getItem('apex-access-token') || localStorage.getItem('token') || ''
        
        await fetch(`${apiUrl}/integrations/outlook/drafts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: draft.to,
            cc: draft.cc,
            subject: draft.subject,
            body: draft.body
          })
        })
      } catch (error) {
        console.error('Failed to save draft:', error)
      }
    }
    
    setIsOpen(false)
    setIsMinimized(false)
    setDraft(defaultDraft)
  }, [draft])

  const minimizeCompose = useCallback(() => {
    setIsMinimized(true)
  }, [])

  const maximizeCompose = useCallback(() => {
    setIsMinimized(false)
  }, [])

  const updateDraft = useCallback((updates: Partial<EmailDraft>) => {
    setDraft(prev => ({ ...prev, ...updates }))
  }, [])

  const addAttachment = useCallback((attachment: Attachment) => {
    setDraft(prev => ({
      ...prev,
      attachments: [...prev.attachments.filter(a => a.id !== attachment.id), attachment]
    }))
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setDraft(prev => ({
      ...prev,
      attachments: prev.attachments.filter(a => a.id !== id)
    }))
  }, [])

  // Quick action: Email a document
  const emailDocument = useCallback((doc: { id: string; name: string; size: number }) => {
    openCompose({
      subject: `Document: ${doc.name}`,
      body: `Please find the attached document.\n\nBest regards`,
      attachments: [{
        id: doc.id,
        name: doc.name,
        size: doc.size,
        type: 'document'
      }]
    })
  }, [openCompose])

  // Quick action: Email an invoice
  const emailInvoice = useCallback((invoice: { id: string; invoiceNumber: string; clientName: string; total: number }) => {
    const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.total)
    openCompose({
      subject: `Invoice ${invoice.invoiceNumber} - ${formattedTotal}`,
      body: `Dear ${invoice.clientName},\n\nPlease find attached Invoice ${invoice.invoiceNumber} for ${formattedTotal}.\n\nPayment is due upon receipt. Please let us know if you have any questions.\n\nBest regards`,
      attachments: [{
        id: invoice.id,
        name: `Invoice_${invoice.invoiceNumber}.pdf`,
        size: 0,
        type: 'invoice'
      }]
    })
  }, [openCompose])

  return (
    <EmailComposeContext.Provider value={{
      isOpen,
      draft,
      isMinimized,
      emailIntegration,
      openCompose,
      closeCompose,
      minimizeCompose,
      maximizeCompose,
      updateDraft,
      addAttachment,
      removeAttachment,
      dismissSetupPrompt,
      emailDocument,
      emailInvoice
    }}>
      {children}
    </EmailComposeContext.Provider>
  )
}

export function useEmailCompose() {
  const context = useContext(EmailComposeContext)
  if (!context) {
    throw new Error('useEmailCompose must be used within EmailComposeProvider')
  }
  return context
}
