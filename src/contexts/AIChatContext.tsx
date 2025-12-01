import { createContext, useContext, useState, ReactNode } from 'react'

interface AIChatContextType {
  isOpen: boolean
  openChat: (initialMessage?: string) => void
  closeChat: () => void
  initialMessage: string | null
  clearInitialMessage: () => void
  refreshSuggestions: number // Counter to trigger suggestion refresh
}

const AIChatContext = createContext<AIChatContextType | null>(null)

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [initialMessage, setInitialMessage] = useState<string | null>(null)
  const [refreshSuggestions, setRefreshSuggestions] = useState(0)

  const openChat = (message?: string) => {
    if (message) {
      setInitialMessage(message)
    }
    // Always refresh suggestions when opening via AI Insights button
    setRefreshSuggestions(prev => prev + 1)
    setIsOpen(true)
  }

  const closeChat = () => {
    setIsOpen(false)
  }

  const clearInitialMessage = () => {
    setInitialMessage(null)
  }

  return (
    <AIChatContext.Provider value={{ isOpen, openChat, closeChat, initialMessage, clearInitialMessage, refreshSuggestions }}>
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
