import { createContext, useContext, useState, ReactNode } from 'react'

interface ChatContext {
  label?: string
  contextType?: string
  suggestedQuestions?: string[]
  additionalContext?: Record<string, any>
}

interface AIChatContextType {
  isOpen: boolean
  openChat: (context?: ChatContext) => void
  closeChat: () => void
  refreshSuggestions: number
  chatContext: ChatContext | null
}

const AIChatContext = createContext<AIChatContextType | null>(null)

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [refreshSuggestions, setRefreshSuggestions] = useState(0)
  const [chatContext, setChatContext] = useState<ChatContext | null>(null)

  const openChat = (context?: ChatContext) => {
    setRefreshSuggestions(prev => prev + 1)
    setChatContext(context || null)
    setIsOpen(true)
  }

  const closeChat = () => {
    setIsOpen(false)
    setChatContext(null)
  }

  return (
    <AIChatContext.Provider value={{ isOpen, openChat, closeChat, refreshSuggestions, chatContext }}>
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
