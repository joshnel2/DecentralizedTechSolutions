import { createContext, useContext, useState, ReactNode } from 'react'

interface SuggestedPrompt {
  label: string
  prompt: string
}

interface AIChatContextType {
  isOpen: boolean
  openChat: (suggestions?: SuggestedPrompt[], contextLabel?: string) => void
  closeChat: () => void
  refreshSuggestions: number
  suggestedPrompts: SuggestedPrompt[]
  contextLabel: string | null
}

const AIChatContext = createContext<AIChatContextType | null>(null)

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [refreshSuggestions, setRefreshSuggestions] = useState(0)
  const [suggestedPrompts, setSuggestedPrompts] = useState<SuggestedPrompt[]>([])
  const [contextLabel, setContextLabel] = useState<string | null>(null)

  const openChat = (suggestions?: SuggestedPrompt[], label?: string) => {
    if (suggestions) {
      setSuggestedPrompts(suggestions)
    } else {
      setSuggestedPrompts([])
    }
    if (label) {
      setContextLabel(label)
    } else {
      setContextLabel(null)
    }
    setRefreshSuggestions(prev => prev + 1)
    setIsOpen(true)
  }

  const closeChat = () => {
    setIsOpen(false)
  }

  return (
    <AIChatContext.Provider value={{ isOpen, openChat, closeChat, refreshSuggestions, suggestedPrompts, contextLabel }}>
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
