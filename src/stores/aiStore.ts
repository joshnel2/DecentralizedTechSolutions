import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIConversation, AIMessage } from '../types'

// AI Model configurations
export type AIModel = 'standard' | 'redline' | 'large-docs' | 'fast'

export interface AIModelConfig {
  id: AIModel
  name: string
  description: string
  icon: string
  azureDeployment: string
  maxTokens: number
  temperature: number
  capabilities: string[]
  bestFor: string
}

export const AI_MODELS: Record<AIModel, AIModelConfig> = {
  standard: {
    id: 'standard',
    name: 'Standard Chat',
    description: 'Balanced performance for general legal queries',
    icon: '💬',
    azureDeployment: 'gpt-4-turbo',
    maxTokens: 4096,
    temperature: 0.7,
    capabilities: ['Research', 'Q&A', 'Analysis', 'Drafting'],
    bestFor: 'General legal questions, research, and everyday tasks'
  },
  redline: {
    id: 'redline',
    name: 'Redline AI',
    description: 'Contract comparison and markup specialist',
    icon: '📝',
    azureDeployment: 'gpt-4-turbo-redline',
    maxTokens: 8192,
    temperature: 0.3,
    capabilities: ['Contract Review', 'Redlining', 'Clause Analysis', 'Risk Detection'],
    bestFor: 'Comparing documents, tracking changes, contract negotiation'
  },
  'large-docs': {
    id: 'large-docs',
    name: 'Large Documents',
    description: 'Process and analyze lengthy documents',
    icon: '📚',
    azureDeployment: 'gpt-4-32k',
    maxTokens: 32768,
    temperature: 0.5,
    capabilities: ['Document Analysis', 'Due Diligence', 'Discovery Review', 'Summarization'],
    bestFor: 'Large contracts, discovery documents, lengthy briefs'
  },
  fast: {
    id: 'fast',
    name: 'Fast',
    description: 'Quick responses for simple queries',
    icon: '⚡',
    azureDeployment: 'gpt-35-turbo',
    maxTokens: 2048,
    temperature: 0.8,
    capabilities: ['Quick Answers', 'Simple Drafts', 'Formatting', 'Summaries'],
    bestFor: 'Quick questions, simple formatting, fast turnaround'
  }
}

interface AIState {
  conversations: AIConversation[]
  activeConversationId: string | null
  selectedModel: AIModel
  isLoading: boolean
  
  // Model actions
  setSelectedModel: (model: AIModel) => void
  
  // Conversation actions
  createConversation: (matterId?: string, clientId?: string) => AIConversation
  setActiveConversation: (id: string | null) => void
  addMessage: (conversationId: string, message: Omit<AIMessage, 'id' | 'timestamp'>) => void
  deleteConversation: (id: string) => void
  generateResponse: (conversationId: string, userMessage: string) => Promise<void>
}

const generateId = () => `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Simulated AI responses for demo - organized by model
const aiResponses: Record<AIModel, Record<string, string>> = {
  standard: {
    default: `I'm Apex AI using **Standard Chat** mode. I can help you with:

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

This clause includes standard carve-outs and a reasonable liability cap. Would you like me to adjust the cap amount or add any specific exceptions?`
  },
  
  redline: {
    default: `I'm Apex AI in **Redline Mode** - specialized for contract review and comparison.

Upload two documents or paste contract text, and I'll help you:

• **Compare Versions** - Track changes between drafts
• **Identify Deviations** - Find differences from your standard templates
• **Risk Analysis** - Flag problematic clauses and terms
• **Negotiation Prep** - Suggest alternative language
• **Markup Generation** - Create detailed redlines with comments

Ready to analyze your contracts. Paste your document text or describe what you'd like to compare.`,

    draft: `**🔴 Redline Analysis Complete**

I've compared the two versions and found the following changes:

**Critical Changes (3):**
🔴 Section 5.1 - Liability cap reduced from $500K to $100K
🔴 Section 8.2 - New non-compete clause added (2-year term)
🔴 Section 12.1 - Governing law changed from NY to DE

**Moderate Changes (5):**
🟡 Section 2.3 - Payment terms extended from Net-30 to Net-45
🟡 Section 4.1 - Warranty period shortened by 6 months
🟡 Section 7.2 - New data protection obligations added
🟡 Section 9.1 - Termination notice increased to 90 days
🟡 Section 11.4 - Insurance requirements increased

**Minor Changes (12):**
🟢 Various formatting and defined term updates

**Risk Assessment:** ⚠️ HIGH - Recommend pushback on liability cap and non-compete

Would you like me to generate suggested markup language for the critical issues?`
  },
  
  'large-docs': {
    default: `I'm Apex AI in **Large Documents Mode** - optimized for processing extensive documents up to 100+ pages.

I'm designed for:

• **Due Diligence Reviews** - Analyze entire deal rooms
• **Discovery Processing** - Review large document productions
• **Contract Analysis** - Process lengthy master agreements
• **Brief Review** - Analyze appellate briefs and memoranda
• **Document Summarization** - Condense lengthy materials

Upload your documents or paste the content. I can process up to 50,000 words in a single analysis.`,

    draft: `**📚 Large Document Analysis Complete**

**Document:** Master Services Agreement (87 pages, 42,350 words)

**Executive Summary:**
This is a comprehensive MSA for enterprise software services with notable deviations from market standard terms. Key areas of concern identified.

**Document Structure:**
- Preamble & Definitions (Pages 1-8)
- Scope of Services (Pages 9-15)
- Pricing & Payment (Pages 16-22)
- Intellectual Property (Pages 23-31)
- Data Protection & Security (Pages 32-45)
- Liability & Indemnification (Pages 46-55)
- Term & Termination (Pages 56-62)
- General Provisions (Pages 63-87)

**Key Findings by Priority:**

🔴 **Critical Issues (4):**
1. Unlimited liability exposure in Section 14.2
2. Broad IP assignment clause in Section 9.3
3. One-sided audit rights in Section 18.1
4. Aggressive termination penalties in Section 16.4

🟡 **Moderate Issues (8):**
[Detailed analysis available on request]

🟢 **Minor Issues (15):**
[Detailed analysis available on request]

**Recommended Actions:**
1. Negotiate liability cap based on contract value
2. Limit IP assignment to deliverables only
3. Add mutual audit rights with notice requirements
4. Reduce termination penalties to 30-day fees

Would you like detailed analysis on any specific section?`
  },
  
  fast: {
    default: `⚡ **Fast Mode** active - quick responses for simple queries.

How can I help? I'm optimized for:
• Quick legal questions
• Simple formatting
• Brief summaries
• Fast lookups

What do you need?`,

    draft: `⚡ Here's a quick response:

**Short Answer:** Yes, under most jurisdictions, a 30-day notice period is enforceable for month-to-month agreements.

**Key Points:**
• Standard notice = 30 days
• Check local requirements
• Document the notice in writing

Need more detail? Switch to Standard mode for comprehensive analysis.`,

    research: `⚡ Quick research result:

**Answer:** The statute of limitations for breach of contract in New York is **6 years** (CPLR § 213).

Key exceptions:
• Written contracts: 6 years
• Oral contracts: 6 years  
• UCC sales: 4 years

Need deeper analysis? Switch to Standard mode.`
  }
}

function getAIResponse(message: string, model: AIModel): string {
  const lowerMessage = message.toLowerCase()
  const responses = aiResponses[model]
  
  if (lowerMessage.includes('research') || lowerMessage.includes('case law') || lowerMessage.includes('precedent') || lowerMessage.includes('statute')) {
    return responses.research || responses.draft || responses.default
  }
  if (lowerMessage.includes('draft') || lowerMessage.includes('write') || lowerMessage.includes('clause') || lowerMessage.includes('compare') || lowerMessage.includes('redline') || lowerMessage.includes('document')) {
    return responses.draft || responses.default
  }
  
  return responses.default
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
        const { selectedModel } = get()
        const modelConfig = AI_MODELS[selectedModel]
        
        const conversation: AIConversation = {
          id: generateId(),
          title: 'New Conversation',
          messages: [{
            id: generateId(),
            role: 'assistant',
            content: aiResponses[selectedModel].default,
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
        const { addMessage, selectedModel } = get()
        
        // Add user message
        addMessage(conversationId, {
          role: 'user',
          content: userMessage
        })
        
        set({ isLoading: true })
        
        // Simulate API delay - faster for 'fast' model
        const delay = selectedModel === 'fast' ? 500 : selectedModel === 'large-docs' ? 2500 : 1500
        await new Promise(resolve => setTimeout(resolve, delay))
        
        // Generate and add AI response
        const response = getAIResponse(userMessage, selectedModel)
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
