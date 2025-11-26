import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Firm } from '../types'

interface AuthState {
  user: User | null
  firm: Firm | null
  isAuthenticated: boolean
  isLoading: boolean
  
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
  setupFirm: (data: Partial<Firm>) => Promise<void>
  updateUser: (data: Partial<User>) => void
  updateFirm: (data: Partial<Firm>) => void
}

interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
}

// Demo users for the platform
const demoUsers: Record<string, { user: User; password: string }> = {
  'admin@apex.law': {
    password: 'apex2024',
    user: {
      id: 'user-1',
      email: 'admin@apex.law',
      firstName: 'Alexandra',
      lastName: 'Chen',
      role: 'owner',
      firmId: 'firm-1',
      groupIds: ['group-1'],
      avatar: undefined,
      createdAt: '2024-01-01T00:00:00Z'
    }
  }
}

const demoFirm: Firm = {
  id: 'firm-1',
  name: 'Chen & Associates',
  address: '100 Legal Tower, Suite 4500',
  city: 'New York',
  state: 'NY',
  zipCode: '10001',
  phone: '(212) 555-0100',
  email: 'info@chenassociates.law',
  website: 'https://chenassociates.law',
  timezone: 'America/New_York',
  billingRate: 450,
  currency: 'USD',
  createdAt: '2024-01-01T00:00:00Z',
  settings: {
    azureOpenAIEndpoint: '',
    azureOpenAIKey: '',
    azureOpenAIDeployment: 'gpt-4',
    aiEnabled: true,
    defaultBillingIncrement: 6,
    invoicePrefix: 'INV',
    matterPrefix: 'MTR'
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      firm: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true })
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800))
        
        const demoUser = demoUsers[email.toLowerCase()]
        
        if (demoUser && demoUser.password === password) {
          set({
            user: demoUser.user,
            firm: demoFirm,
            isAuthenticated: true,
            isLoading: false
          })
        } else if (email && password) {
          // Allow any login for demo purposes
          const newUser: User = {
            id: `user-${Date.now()}`,
            email,
            firstName: email.split('@')[0],
            lastName: 'User',
            role: 'attorney',
            firmId: undefined,
            groupIds: [],
            createdAt: new Date().toISOString()
          }
          set({
            user: newUser,
            firm: null,
            isAuthenticated: true,
            isLoading: false
          })
        } else {
          set({ isLoading: false })
          throw new Error('Invalid credentials')
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true })
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800))
        
        const newUser: User = {
          id: `user-${Date.now()}`,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: 'owner',
          firmId: undefined,
          groupIds: [],
          createdAt: new Date().toISOString()
        }
        
        set({
          user: newUser,
          firm: null,
          isAuthenticated: true,
          isLoading: false
        })
      },

      logout: () => {
        set({
          user: null,
          firm: null,
          isAuthenticated: false
        })
      },

      setupFirm: async (data: Partial<Firm>) => {
        set({ isLoading: true })
        
        await new Promise(resolve => setTimeout(resolve, 600))
        
        const { user } = get()
        const newFirm: Firm = {
          id: `firm-${Date.now()}`,
          name: data.name || 'My Firm',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          zipCode: data.zipCode || '',
          phone: data.phone || '',
          email: data.email || user?.email || '',
          website: data.website,
          timezone: data.timezone || 'America/New_York',
          billingRate: data.billingRate || 350,
          currency: data.currency || 'USD',
          createdAt: new Date().toISOString(),
          settings: {
            azureOpenAIEndpoint: '',
            azureOpenAIKey: '',
            azureOpenAIDeployment: 'gpt-4',
            aiEnabled: true,
            defaultBillingIncrement: 6,
            invoicePrefix: 'INV',
            matterPrefix: 'MTR',
            ...data.settings
          }
        }
        
        set({
          firm: newFirm,
          user: user ? { ...user, firmId: newFirm.id } : null,
          isLoading: false
        })
      },

      updateUser: (data: Partial<User>) => {
        const { user } = get()
        if (user) {
          set({ user: { ...user, ...data } })
        }
      },

      updateFirm: (data: Partial<Firm>) => {
        const { firm } = get()
        if (firm) {
          set({ 
            firm: { 
              ...firm, 
              ...data,
              settings: { ...firm.settings, ...data.settings }
            } 
          })
        }
      }
    }),
    {
      name: 'apex-auth'
    }
  )
)
