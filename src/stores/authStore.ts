import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Firm } from '../types'

// Session and security types
interface Session {
  id: string
  userId: string
  deviceInfo: string
  ipAddress: string
  createdAt: string
  lastActivity: string
  expiresAt: string
  isCurrent: boolean
}

interface TwoFactorSetup {
  enabled: boolean
  method: 'authenticator' | 'sms' | 'email'
  phoneNumber?: string
  backupCodes?: string[]
  verifiedAt?: string
}

interface AuditLogEntry {
  id: string
  userId: string
  action: string
  resource: string
  resourceId?: string
  details?: Record<string, any>
  ipAddress: string
  userAgent: string
  timestamp: string
}

interface Invitation {
  id: string
  email: string
  firstName: string
  lastName: string
  role: User['role']
  invitedBy: string
  invitedAt: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  token: string
}

interface AuthState {
  // Core auth
  user: User | null
  firm: Firm | null
  isAuthenticated: boolean
  isLoading: boolean
  
  // Security
  twoFactorRequired: boolean
  twoFactorVerified: boolean
  twoFactorSetup: TwoFactorSetup | null
  sessions: Session[]
  auditLog: AuditLogEntry[]
  
  // Team management
  teamMembers: User[]
  invitations: Invitation[]
  
  // Permissions cache
  userPermissions: string[]
  
  // Actions
  login: (email: string, password: string) => Promise<{ requires2FA: boolean }>
  verify2FA: (code: string) => Promise<boolean>
  logout: () => void
  register: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>
  
  // Firm setup
  setupFirm: (data: Partial<Firm>) => void
  updateFirm: (data: Partial<Firm>) => void
  
  // User management
  updateUser: (data: Partial<User>) => void
  updatePassword: (currentPassword: string, newPassword: string) => Promise<boolean>
  
  // 2FA
  enable2FA: (method: TwoFactorSetup['method']) => Promise<{ secret?: string; qrCode?: string }>
  disable2FA: () => void
  generateBackupCodes: () => string[]
  
  // Sessions
  getSessions: () => Session[]
  revokeSession: (sessionId: string) => void
  revokeAllOtherSessions: () => void
  
  // Team
  inviteUser: (data: Omit<Invitation, 'id' | 'invitedAt' | 'expiresAt' | 'status' | 'token' | 'invitedBy'>) => Invitation
  resendInvitation: (invitationId: string) => void
  revokeInvitation: (invitationId: string) => void
  updateTeamMember: (userId: string, data: Partial<User>) => void
  removeTeamMember: (userId: string) => void
  
  // Permissions
  hasPermission: (permission: string) => boolean
  canAccessMatter: (matterId: string) => boolean
  canAccessClient: (clientId: string) => boolean
  
  // Audit
  logAction: (action: string, resource: string, resourceId?: string, details?: Record<string, any>) => void
  getAuditLog: (filters?: { userId?: string; resource?: string; startDate?: string; endDate?: string }) => AuditLogEntry[]
  
  // Demo
  loginDemo: () => void
}

// Demo data
const demoUser: User = {
  id: 'user-1',
  email: 'john@apexlaw.com',
  firstName: 'John',
  lastName: 'Mitchell',
  role: 'owner',
  groupIds: ['group-1', 'group-2'],
  createdAt: '2024-01-01T00:00:00Z'
}

const demoFirm: Firm = {
  id: 'firm-1',
  name: 'Apex Legal Partners LLP',
  address: '100 Legal Plaza, Suite 500',
  city: 'New York',
  state: 'NY',
  zipCode: '10001',
  phone: '(212) 555-0100',
  email: 'info@apexlegal.com',
  website: 'https://apexlegal.com',
  billingDefaults: {
    hourlyRate: 450,
    incrementMinutes: 6,
    paymentTerms: 30,
    currency: 'USD'
  }
}

const demoTeamMembers: User[] = [
  demoUser,
  { id: 'user-2', email: 'sarah@apexlaw.com', firstName: 'Sarah', lastName: 'Chen', role: 'admin', groupIds: ['group-1'], createdAt: '2024-01-15T00:00:00Z' },
  { id: 'user-3', email: 'michael@apexlaw.com', firstName: 'Michael', lastName: 'Roberts', role: 'attorney', groupIds: ['group-2'], createdAt: '2024-02-01T00:00:00Z' },
  { id: 'user-4', email: 'emily@apexlaw.com', firstName: 'Emily', lastName: 'Davis', role: 'paralegal', groupIds: ['group-3'], createdAt: '2024-02-15T00:00:00Z' },
  { id: 'user-5', email: 'james@apexlaw.com', firstName: 'James', lastName: 'Wilson', role: 'attorney', groupIds: ['group-1', 'group-2'], createdAt: '2024-03-01T00:00:00Z' },
  { id: 'user-6', email: 'lisa@apexlaw.com', firstName: 'Lisa', lastName: 'Thompson', role: 'staff', groupIds: ['group-3'], createdAt: '2024-03-15T00:00:00Z' }
]

// Permission definitions by role
const rolePermissions: Record<User['role'], string[]> = {
  owner: [
    'firm:manage', 'firm:billing', 'firm:delete',
    'users:invite', 'users:manage', 'users:delete',
    'groups:manage',
    'matters:create', 'matters:view', 'matters:edit', 'matters:delete', 'matters:assign',
    'clients:create', 'clients:view', 'clients:edit', 'clients:delete',
    'billing:create', 'billing:view', 'billing:edit', 'billing:delete', 'billing:approve',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
    'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete',
    'reports:view', 'reports:create', 'reports:export',
    'integrations:manage',
    'audit:view'
  ],
  admin: [
    'users:invite', 'users:manage',
    'groups:manage',
    'matters:create', 'matters:view', 'matters:edit', 'matters:delete', 'matters:assign',
    'clients:create', 'clients:view', 'clients:edit', 'clients:delete',
    'billing:create', 'billing:view', 'billing:edit', 'billing:approve',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
    'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete',
    'reports:view', 'reports:create', 'reports:export',
    'integrations:manage',
    'audit:view'
  ],
  attorney: [
    'matters:create', 'matters:view', 'matters:edit',
    'clients:create', 'clients:view', 'clients:edit',
    'billing:create', 'billing:view',
    'documents:upload', 'documents:view', 'documents:edit',
    'calendar:create', 'calendar:view', 'calendar:edit',
    'reports:view'
  ],
  paralegal: [
    'matters:view', 'matters:edit',
    'clients:view',
    'billing:view',
    'documents:upload', 'documents:view', 'documents:edit',
    'calendar:create', 'calendar:view', 'calendar:edit'
  ],
  staff: [
    'matters:view',
    'clients:view',
    'documents:view',
    'calendar:view'
  ]
}

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
const generateToken = () => Array.from({ length: 64 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]).join('')

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      firm: null,
      isAuthenticated: false,
      isLoading: false,
      twoFactorRequired: false,
      twoFactorVerified: false,
      twoFactorSetup: null,
      sessions: [],
      auditLog: [],
      teamMembers: [],
      invitations: [],
      userPermissions: [],

      login: async (email: string, password: string) => {
        set({ isLoading: true })
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800))
        
        // Demo login check
        const isValidDemo = email === 'demo@apexlaw.com' || email === 'john@apexlaw.com'
        
        if (!isValidDemo && password.length < 6) {
          set({ isLoading: false })
          throw new Error('Invalid credentials')
        }

        const { twoFactorSetup } = get()
        
        if (twoFactorSetup?.enabled) {
          set({ 
            isLoading: false,
            twoFactorRequired: true,
            user: demoUser,
            firm: demoFirm
          })
          return { requires2FA: true }
        }

        // Create session
        const session: Session = {
          id: generateId(),
          userId: demoUser.id,
          deviceInfo: navigator.userAgent,
          ipAddress: '192.168.1.1',
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          isCurrent: true
        }

        set({
          user: demoUser,
          firm: demoFirm,
          isAuthenticated: true,
          isLoading: false,
          twoFactorRequired: false,
          twoFactorVerified: true,
          teamMembers: demoTeamMembers,
          userPermissions: rolePermissions[demoUser.role],
          sessions: [session]
        })

        get().logAction('auth.login', 'session', session.id)
        
        return { requires2FA: false }
      },

      verify2FA: async (code: string) => {
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Demo: accept any 6-digit code
        if (code.length === 6) {
          const session: Session = {
            id: generateId(),
            userId: demoUser.id,
            deviceInfo: navigator.userAgent,
            ipAddress: '192.168.1.1',
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            isCurrent: true
          }

          set({
            isAuthenticated: true,
            twoFactorRequired: false,
            twoFactorVerified: true,
            teamMembers: demoTeamMembers,
            userPermissions: rolePermissions[demoUser.role],
            sessions: [session]
          })

          get().logAction('auth.2fa_verified', 'session', session.id)
          return true
        }
        
        return false
      },

      logout: () => {
        const { user } = get()
        if (user) {
          get().logAction('auth.logout', 'session')
        }
        
        set({
          user: null,
          firm: null,
          isAuthenticated: false,
          twoFactorRequired: false,
          twoFactorVerified: false,
          teamMembers: [],
          userPermissions: [],
          sessions: []
        })
      },

      register: async (data) => {
        set({ isLoading: true })
        await new Promise(resolve => setTimeout(resolve, 1000))

        const newUser: User = {
          id: generateId(),
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: 'owner',
          groupIds: [],
          createdAt: new Date().toISOString()
        }

        set({
          user: newUser,
          isAuthenticated: false, // Not fully authenticated until firm is set up
          isLoading: false,
          userPermissions: rolePermissions['owner']
        })
      },

      setupFirm: (data) => {
        const firm: Firm = {
          id: generateId(),
          name: data.name || '',
          address: data.address || '',
          billingDefaults: {
            hourlyRate: 350,
            incrementMinutes: 6,
            paymentTerms: 30,
            currency: 'USD'
          },
          ...data
        }

        const { user } = get()
        
        set({
          firm,
          isAuthenticated: true,
          teamMembers: user ? [user] : []
        })

        get().logAction('firm.created', 'firm', firm.id)
      },

      updateFirm: (data) => {
        const { firm } = get()
        if (firm) {
          set({ firm: { ...firm, ...data } })
          get().logAction('firm.updated', 'firm', firm.id, data)
        }
      },

      updateUser: (data) => {
        const { user } = get()
        if (user) {
          set({ user: { ...user, ...data } })
          get().logAction('user.updated', 'user', user.id, data)
        }
      },

      updatePassword: async (currentPassword: string, newPassword: string) => {
        await new Promise(resolve => setTimeout(resolve, 500))
        
        if (newPassword.length >= 8) {
          get().logAction('user.password_changed', 'user', get().user?.id)
          return true
        }
        return false
      },

      enable2FA: async (method) => {
        await new Promise(resolve => setTimeout(resolve, 500))
        
        const setup: TwoFactorSetup = {
          enabled: true,
          method,
          verifiedAt: new Date().toISOString(),
          backupCodes: get().generateBackupCodes()
        }

        set({ twoFactorSetup: setup })
        get().logAction('user.2fa_enabled', 'user', get().user?.id, { method })

        if (method === 'authenticator') {
          return {
            secret: 'JBSWY3DPEHPK3PXP',
            qrCode: 'otpauth://totp/Apex:demo@apexlaw.com?secret=JBSWY3DPEHPK3PXP&issuer=Apex'
          }
        }
        
        return {}
      },

      disable2FA: () => {
        set({ twoFactorSetup: null })
        get().logAction('user.2fa_disabled', 'user', get().user?.id)
      },

      generateBackupCodes: () => {
        return Array.from({ length: 10 }, () => 
          Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
          Math.random().toString(36).substring(2, 6).toUpperCase()
        )
      },

      getSessions: () => get().sessions,

      revokeSession: (sessionId: string) => {
        set(state => ({
          sessions: state.sessions.filter(s => s.id !== sessionId)
        }))
        get().logAction('session.revoked', 'session', sessionId)
      },

      revokeAllOtherSessions: () => {
        set(state => ({
          sessions: state.sessions.filter(s => s.isCurrent)
        }))
        get().logAction('session.revoked_all', 'session')
      },

      inviteUser: (data) => {
        const { user } = get()
        const invitation: Invitation = {
          id: generateId(),
          ...data,
          invitedBy: user?.id || '',
          invitedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
          token: generateToken()
        }

        set(state => ({
          invitations: [...state.invitations, invitation]
        }))

        get().logAction('user.invited', 'invitation', invitation.id, { email: data.email, role: data.role })
        
        return invitation
      },

      resendInvitation: (invitationId: string) => {
        set(state => ({
          invitations: state.invitations.map(inv =>
            inv.id === invitationId
              ? { ...inv, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }
              : inv
          )
        }))
        get().logAction('invitation.resent', 'invitation', invitationId)
      },

      revokeInvitation: (invitationId: string) => {
        set(state => ({
          invitations: state.invitations.map(inv =>
            inv.id === invitationId ? { ...inv, status: 'revoked' as const } : inv
          )
        }))
        get().logAction('invitation.revoked', 'invitation', invitationId)
      },

      updateTeamMember: (userId: string, data: Partial<User>) => {
        set(state => ({
          teamMembers: state.teamMembers.map(m =>
            m.id === userId ? { ...m, ...data } : m
          )
        }))
        get().logAction('user.updated', 'user', userId, data)
      },

      removeTeamMember: (userId: string) => {
        set(state => ({
          teamMembers: state.teamMembers.filter(m => m.id !== userId)
        }))
        get().logAction('user.removed', 'user', userId)
      },

      hasPermission: (permission: string) => {
        const { userPermissions, user } = get()
        if (user?.role === 'owner') return true
        return userPermissions.includes(permission)
      },

      canAccessMatter: (matterId: string) => {
        const { user, hasPermission } = get()
        if (!user) return false
        if (hasPermission('matters:view')) return true
        // Additional matter-level permission checks would go here
        return false
      },

      canAccessClient: (clientId: string) => {
        const { user, hasPermission } = get()
        if (!user) return false
        if (hasPermission('clients:view')) return true
        return false
      },

      logAction: (action: string, resource: string, resourceId?: string, details?: Record<string, any>) => {
        const { user } = get()
        const entry: AuditLogEntry = {
          id: generateId(),
          userId: user?.id || 'system',
          action,
          resource,
          resourceId,
          details,
          ipAddress: '192.168.1.1',
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        }

        set(state => ({
          auditLog: [entry, ...state.auditLog].slice(0, 1000) // Keep last 1000 entries
        }))
      },

      getAuditLog: (filters) => {
        let log = get().auditLog

        if (filters?.userId) {
          log = log.filter(e => e.userId === filters.userId)
        }
        if (filters?.resource) {
          log = log.filter(e => e.resource === filters.resource)
        }
        if (filters?.startDate) {
          log = log.filter(e => e.timestamp >= filters.startDate!)
        }
        if (filters?.endDate) {
          log = log.filter(e => e.timestamp <= filters.endDate!)
        }

        return log
      },

      loginDemo: () => {
        const session: Session = {
          id: generateId(),
          userId: demoUser.id,
          deviceInfo: navigator.userAgent,
          ipAddress: '192.168.1.1',
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          isCurrent: true
        }

        set({
          user: demoUser,
          firm: demoFirm,
          isAuthenticated: true,
          isLoading: false,
          twoFactorRequired: false,
          twoFactorVerified: true,
          teamMembers: demoTeamMembers,
          userPermissions: rolePermissions[demoUser.role],
          sessions: [session],
          invitations: [
            {
              id: 'inv-1',
              email: 'newattorney@email.com',
              firstName: 'Robert',
              lastName: 'Garcia',
              role: 'attorney',
              invitedBy: 'user-1',
              invitedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
              status: 'pending',
              token: generateToken()
            }
          ]
        })
      }
    }),
    {
      name: 'apex-auth',
      partialize: (state) => ({
        user: state.user,
        firm: state.firm,
        isAuthenticated: state.isAuthenticated,
        twoFactorSetup: state.twoFactorSetup,
        teamMembers: state.teamMembers,
        invitations: state.invitations,
        userPermissions: state.userPermissions
      })
    }
  )
)

// Export permission checker hook
export const usePermission = (permission: string) => {
  const hasPermission = useAuthStore(state => state.hasPermission)
  return hasPermission(permission)
}

// Export role permissions for UI
export { rolePermissions }
