import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIConversation, AIMessage } from '../types'

// AI Model types for Azure deployments
export type AIModel = 'standard' | 'redline' | 'large-docs' | 'fast'

interface AIState {
  conversations: AIConversation[]
  activeConversationId: string | null
  selectedModel: AIModel
  isLoading: boolean
  
  setSelectedModel: (model: AIModel) => void
  createConversation: (matterId?: string, clientId?: string) => AIConversation
  setActiveConversation: (id: string | null) => void
  addMessage: (conversationId: string, message: Omit<AIMessage, 'id' | 'timestamp'>) => void
  deleteConversation: (id: string) => void
  generateResponse: (conversationId: string, userMessage: string) => Promise<void>
}

const generateId = () => `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Simulated AI responses for demo
const aiResponses: Record<string, string> = {
  default: `I'm Apex AI, your legal practice assistant. I can help you with:

• **Research** - Case law analysis, statute lookups, and legal research
• **Drafting** - Contract clauses, motions, and correspondence
• **Analysis** - Document review, risk assessment, and due diligence
• **Billing** - Time entry suggestions and invoice review
• **Calendar** - Scheduling optimization and deadline tracking

What would you like help with today?`,
  
  research: `Based on my analysis of recent case law, here are the key findings:

**Relevant Precedents:**
1. *Smith v. TechCorp* (2023) - Established that software algorithms can constitute patentable subject matter when tied to specific technical improvements
2. *Digital Innovations LLC v. Cloud Services Inc.* (2022) - Set forth the framework for analyzing functional claim limitations

**Recommendations:**
- Focus claim construction arguments on the technical implementation details
- Prepare expert testimony addressing the algorithm's technical benefits
- Consider analogous art from non-software patents

Would you like me to draft a memo summarizing these findings?`,

  draft: `I've drafted the following clause based on your requirements:

\`\`\`
SECTION 4.2 - LIMITATION OF LIABILITY

Notwithstanding any other provision of this Agreement, in no event shall either Party be liable to the other Party for any indirect, incidental, consequential, special, or exemplary damages arising out of or related to this Agreement, including but not limited to loss of revenue, loss of profits, loss of business, or loss of data, even if such Party has been advised of the possibility of such damages.

The total cumulative liability of either Party under this Agreement shall not exceed the greater of (i) the fees paid or payable by Client to Service Provider during the twelve (12) month period preceding the event giving rise to such liability, or (ii) One Hundred Thousand Dollars ($100,000).
\`\`\`

This clause includes standard carve-outs and a reasonable liability cap. Would you like me to adjust the cap amount or add any specific exceptions?`,

  analyze: `**Document Analysis Summary**

I've reviewed the uploaded documents and identified the following key points:

**Strengths:**
✓ Clear breach of duty established by surveillance footage
✓ Medical records consistently document injury progression
✓ Expert witness available to testify on causation

**Potential Issues:**
⚠️ Pre-existing condition mentioned in 2019 records could be used by defense
⚠️ 48-hour gap between incident and initial medical treatment
⚠️ Witness statement has minor inconsistency regarding time of day

**Recommended Actions:**
1. Obtain supplemental declaration addressing the treatment delay
2. Request additional medical records from 2019 to contextualize pre-existing condition
3. Re-interview witness to clarify timeline

Risk Assessment: **MODERATE** - Strong case on liability, some exposure on damages.`,

  billing: `**Time Entry Analysis for This Week**

Based on your activity, I've identified the following unbilled work:

| Date | Matter | Description | Suggested Hours |
|------|--------|-------------|-----------------|
| Nov 25 | Quantum v. TechStart | Email correspondence with opposing counsel | 0.3 |
| Nov 25 | Quantum v. TechStart | Document review (expert report) | 1.2 |
| Nov 24 | Series C Funding | Call with client re: investor concerns | 0.5 |

**Total Suggested Entries:** 2.0 hours ($1,050 at blended rate)

Would you like me to create these time entries for your review?`
}

function getAIResponse(message: string): string {
  const lowerMessage = message.toLowerCase()
  
  if (lowerMessage.includes('research') || lowerMessage.includes('case law') || lowerMessage.includes('precedent')) {
    return aiResponses.research
  }
  if (lowerMessage.includes('draft') || lowerMessage.includes('write') || lowerMessage.includes('clause')) {
    return aiResponses.draft
  }
  if (lowerMessage.includes('analyze') || lowerMessage.includes('review') || lowerMessage.includes('document')) {
    return aiResponses.analyze
  }
  if (lowerMessage.includes('billing') || lowerMessage.includes('time') || lowerMessage.includes('hours')) {
    return aiResponses.billing
  }
  
  return aiResponses.default
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      selectedModel: 'standard',
      isLoading: false,

      setSelectedModel: (model) => {
        set({ selectedModel: model })
      },

      createConversation: (matterId, clientId) => {
        const conversation: AIConversation = {
          id: generateId(),
          title: 'New Conversation',
          messages: [{
            id: generateId(),
            role: 'assistant',
            content: aiResponses.default,
            timestamp: new Date().toISOString()
          }],
          matterId,
          clientId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        
        set(state => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: conversation.id
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
              const title = c.title === 'New Conversation' && message.role === 'user'
                ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
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

      generateResponse: async (conversationId, userMessage) => {
        const { addMessage } = get()
        
        // Add user message
        addMessage(conversationId, {
          role: 'user',
          content: userMessage
        })
        
        set({ isLoading: true })
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        // Generate and add AI response
        const response = getAIResponse(userMessage)
        addMessage(conversationId, {
          role: 'assistant',
          content: response
        })
        
        set({ isLoading: false })
      }
    }),
    {
      name: 'apex-ai'
    }
  )
)
