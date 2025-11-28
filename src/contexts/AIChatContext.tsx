import { createContext, useContext, useState, ReactNode } from 'react'

interface DocumentToAnalyze {
  id: string
  name: string
  type: string
  size: number
  matterId?: string
  matterName?: string
  uploadedAt: string
}

interface AIChatContextType {
  isOpen: boolean
  openChat: (initialMessage?: string) => void
  openWithDocument: (document: DocumentToAnalyze) => void
  closeChat: () => void
  initialMessage: string | null
  documentToAnalyze: DocumentToAnalyze | null
  clearInitialMessage: () => void
  clearDocument: () => void
}

const AIChatContext = createContext<AIChatContextType | null>(null)

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [initialMessage, setInitialMessage] = useState<string | null>(null)
  const [documentToAnalyze, setDocumentToAnalyze] = useState<DocumentToAnalyze | null>(null)

  const openChat = (message?: string) => {
    if (message) {
      setInitialMessage(message)
    }
    setIsOpen(true)
  }

  const openWithDocument = (document: DocumentToAnalyze) => {
    setDocumentToAnalyze(document)
    setIsOpen(true)
  }

  const closeChat = () => {
    setIsOpen(false)
  }

  const clearInitialMessage = () => {
    setInitialMessage(null)
  }

  const clearDocument = () => {
    setDocumentToAnalyze(null)
  }

  return (
    <AIChatContext.Provider value={{ 
      isOpen, 
      openChat, 
      openWithDocument,
      closeChat, 
      initialMessage, 
      documentToAnalyze,
      clearInitialMessage,
      clearDocument
    }}>
      {children}
    </AIChatContext.Provider>
  )
}

export function useAIChat() {
  const context = useContext(AIChatContext)
  if (!context) {
    throw new Error('useAIChat must be used within AIChatProvider')
  }
  return context
}
