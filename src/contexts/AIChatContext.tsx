import { createContext, useContext, useState, ReactNode } from 'react'

interface AIChatContextType {
  isOpen: boolean
  openChat: () => void
  closeChat: () => void
  refreshSuggestions: number
}

const AIChatContext = createContext<AIChatContextType | null>(null)

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [refreshSuggestions, setRefreshSuggestions] = useState(0)

  const openChat = () => {
    setRefreshSuggestions(prev => prev + 1)
    setIsOpen(true)
  }

  const closeChat = () => {
    setIsOpen(false)
  }

  return (
    <AIChatContext.Provider value={{ isOpen, openChat, closeChat, refreshSuggestions }}>
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
