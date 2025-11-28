import { createContext, useContext, useState, ReactNode } from 'react'

interface AIChatContextType {
  isOpen: boolean
  openChat: (initialMessage?: string) => void
  closeChat: () => void
  initialMessage: string | null
  clearInitialMessage: () => void
}

const AIChatContext = createContext<AIChatContextType | null>(null)

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [initialMessage, setInitialMessage] = useState<string | null>(null)

  const openChat = (message?: string) => {
    if (message) {
      setInitialMessage(message)
    }
    setIsOpen(true)
  }

  const closeChat = () => {
    setIsOpen(false)
  }

  const clearInitialMessage = () => {
    setInitialMessage(null)
  }

  return (
    <AIChatContext.Provider value={{ isOpen, openChat, closeChat, initialMessage, clearInitialMessage }}>
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
