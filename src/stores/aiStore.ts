import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { aiApi } from '../services/api'
import type { AIConversation, AIMessage } from '../types'

// AI Mode types
export type AIMode = 'standard' | 'document' | 'redline'

interface DocumentContext {
  id?: string
  name: string
  content: string
  type?: string
  size?: number
}

interface AIState {
  conversations: AIConversation[]
  activeConversationId: string | null
  selectedMode: AIMode
  isLoading: boolean
  
  // Document context (invisible to user, sent to AI)
  documentContext: DocumentContext | null
  redlineDocuments: { doc1: DocumentContext | null; doc2: DocumentContext | null }
  
  setSelectedMode: (mode: AIMode) => void
  setDocumentContext: (doc: DocumentContext | null) => void
  setRedlineDocument: (which: 'doc1' | 'doc2', doc: DocumentContext | null) => void
  createConversation: (mode?: AIMode, initialContext?: string) => AIConversation
  setActiveConversation: (id: string | null) => void
  addMessage: (conversationId: string, message: Omit<AIMessage, 'id' | 'timestamp'>) => void
  deleteConversation: (id: string) => void
  generateResponse: (conversationId: string, userMessage: string, hiddenContext?: string) => Promise<void>
  clearDocumentContext: () => void
}

const generateId = () => `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      selectedMode: 'standard',
      isLoading: false,
      documentContext: null,
      redlineDocuments: { doc1: null, doc2: null },

      setSelectedMode: (mode) => {
        set({ selectedMode: mode })
      },

      setDocumentContext: (doc) => {
        set({ documentContext: doc })
      },

      setRedlineDocument: (which, doc) => {
        set(state => ({
          redlineDocuments: {
            ...state.redlineDocuments,
            [which]: doc
          }
        }))
      },

      clearDocumentContext: () => {
        set({ 
          documentContext: null,
          redlineDocuments: { doc1: null, doc2: null }
        })
      },

      createConversation: (mode, initialContext) => {
        const modeLabels: Record<AIMode, string> = {
          standard: 'Chat',
          document: 'Document Analysis',
          redline: 'Redline'
        }
        
        const conversation: AIConversation = {
          id: generateId(),
          title: mode ? `${modeLabels[mode]} - New` : 'New Conversation',
          messages: [],
          model: 'gpt-4',
          createdBy: 'user-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        
        set(state => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: conversation.id,
          selectedMode: mode || state.selectedMode
        }))
        
        return conversation
      },

      setActiveConversation: (id) => {
        set({ activeConversationId: id })
      },

      addMessage: (conversationId, message) => {
        const newMessage: AIMessage = {
          ...message,
          id: generateId(),
          timestamp: new Date().toISOString()
        }
        
        set(state => ({
          conversations: state.conversations.map(c => {
            if (c.id === conversationId) {
              const updatedMessages = [...c.messages, newMessage]
              // Update title based on first user message
              const title = (c.title.includes('- New') || c.title === 'New Conversation') && message.role === 'user'
                ? message.content.slice(0, 40) + (message.content.length > 40 ? '...' : '')
                : c.title
              
              return {
                ...c,
                title,
                messages: updatedMessages,
                updatedAt: new Date().toISOString()
              }
            }
            return c
          })
        }))
      },

      deleteConversation: (id) => {
        set(state => ({
          conversations: state.conversations.filter(c => c.id !== id),
          activeConversationId: state.activeConversationId === id ? null : state.activeConversationId
        }))
      },

      generateResponse: async (conversationId, userMessage, hiddenContext) => {
        const { addMessage, conversations, selectedMode, documentContext, redlineDocuments } = get()
        
        // Add user message (visible to user - without hidden context)
        addMessage(conversationId, {
          role: 'user',
          content: userMessage
        })
        
        set({ isLoading: true })
        
        try {
          // Get conversation history for context
          const conversation = conversations.find(c => c.id === conversationId)
          const history = conversation?.messages.map(m => ({
            role: m.role,
            content: m.content
          })) || []
          
          // Build the actual message sent to AI (includes hidden context)
          let aiMessage = userMessage
          
          // Add document context invisibly for document analysis mode
          if (hiddenContext) {
            aiMessage = `${hiddenContext}\n\nUser's question: ${userMessage}`
          } else if (selectedMode === 'document' && documentContext) {
            aiMessage = `[DOCUMENT CONTEXT - The user has uploaded a document for analysis]
Document Name: ${documentContext.name}
Document Type: ${documentContext.type || 'Unknown'}

--- DOCUMENT CONTENT ---
${documentContext.content}
--- END DOCUMENT ---

User's question about this document: ${userMessage}`
          } else if (selectedMode === 'redline' && redlineDocuments.doc1 && redlineDocuments.doc2) {
            aiMessage = `[REDLINE COMPARISON REQUEST - Compare these two documents and identify changes]

--- DOCUMENT 1: ${redlineDocuments.doc1.name} ---
${redlineDocuments.doc1.content}
--- END DOCUMENT 1 ---

--- DOCUMENT 2: ${redlineDocuments.doc2.name} ---
${redlineDocuments.doc2.content}
--- END DOCUMENT 2 ---

User's request: ${userMessage}`
          }
          
          // Call real AI API
          const result = await aiApi.chat(aiMessage, 'ai-assistant', {}, history)
          
          addMessage(conversationId, {
            role: 'assistant',
            content: result.response
          })
        } catch (error) {
          console.error('AI API error:', error)
          addMessage(conversationId, {
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.'
          })
        }
        
        set({ isLoading: false })
      }
    }),
    {
      name: 'apex-ai',
      partialize: (state) => ({
        conversations: state.conversations,
        selectedMode: state.selectedMode
      })
    }
  )
)
