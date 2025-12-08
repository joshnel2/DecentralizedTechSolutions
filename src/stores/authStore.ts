import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi, setAccessToken, teamApi } from '../services/api'
import type { User, Firm, UserRole } from '../types'

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
  role: UserRole
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
  register: (data: { email: string; password: string; firstName: string; lastName: string; firmName?: string }) => Promise<void>
  
  // Session restoration
  checkAuth: () => Promise<boolean>
  
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
  loadTeamMembers: () => Promise<void>
  inviteUser: (data: Omit<Invitation, 'id' | 'invitedAt' | 'expiresAt' | 'status' | 'token' | 'invitedBy'>) => Promise<Invitation>
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
}

// Permission definitions by role
const rolePermissions: Record<UserRole, string[]> = {
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
    'matters:create', 'matters:view', 'matters:edit',
    'clients:create', 'clients:view', 'clients:edit',
    'billing:view', 'billing:create',
    'documents:upload', 'documents:view', 'documents:edit',
    'calendar:create', 'calendar:view', 'calendar:edit'
  ],
  staff: [
    'matters:create', 'matters:view',
    'clients:create', 'clients:view',
    'documents:view',
    'calendar:view'
  ],
  billing: [
    'matters:create', 'matters:view',
    'clients:create', 'clients:view',
    'billing:create', 'billing:view', 'billing:edit', 'billing:approve',
    'reports:view', 'reports:create', 'reports:export'
  ],
  readonly: [
    'matters:view',
    'clients:view',
    'documents:view',
    'calendar:view',
    'reports:view'
  ]
}

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
        
        try {
          const result = await authApi.login(email, password)
          
          if (result.requires2FA) {
            set({ 
              isLoading: false,
              twoFactorRequired: true,
            })
            return { requires2FA: true }
          }

          const user: User = {
            id: result.user.id,
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            role: result.user.role,
            groupIds: result.user.groupIds || [],
            permissions: result.user.permissions || [],
            isActive: true,
            createdAt: result.user.createdAt,
            updatedAt: result.user.createdAt,
          }

          const firm: Firm = result.firm ? {
            id: result.firm.id,
            name: result.firm.name,
            address: result.firm.address,
            city: result.firm.city,
            state: result.firm.state,
            zipCode: result.firm.zipCode,
            phone: result.firm.phone,
            email: result.firm.email,
            website: result.firm.website,
            billingDefaults: result.firm.billingDefaults,
            createdAt: result.firm.createdAt,
            updatedAt: result.firm.updatedAt,
          } : null as any

          set({
            user,
            firm,
            isAuthenticated: true,
            isLoading: false,
            twoFactorRequired: false,
            twoFactorVerified: true,
            userPermissions: rolePermissions[user.role],
          })

          // Set the access token for future requests
          setAccessToken(result.accessToken)
          
          return { requires2FA: false }
        } catch (error) {
          // Demo mode fallback - allows login when backend is unavailable
          if (email === 'demo@apex.law' || email === 'admin@apex.law') {
            const demoUser: User = {
              id: 'demo-user-1',
              email: email,
              firstName: 'Demo',
              lastName: 'User',
              role: 'owner',
              groupIds: [],
              permissions: [],
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }

            const demoFirm: Firm = {
              id: 'demo-firm-1',
              name: 'Demo Law Firm',
              address: '123 Legal Way',
              city: 'San Francisco',
              state: 'CA',
              billingDefaults: {
                hourlyRate: 350,
                incrementMinutes: 6,
                paymentTerms: 30,
                currency: 'USD'
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }

            set({
              user: demoUser,
              firm: demoFirm,
              isAuthenticated: true,
              isLoading: false,
              twoFactorRequired: false,
              twoFactorVerified: true,
              userPermissions: rolePermissions['owner'],
            })

            return { requires2FA: false }
          }
          
          set({ isLoading: false })
          throw error
        }
      },

      verify2FA: async (code: string) => {
        // TODO: Implement real 2FA verification
        if (code.length === 6) {
          set({
            isAuthenticated: true,
            twoFactorRequired: false,
            twoFactorVerified: true,
          })
          return true
        }
        return false
      },

      logout: async () => {
        try {
          await authApi.logout()
        } catch (error) {
          console.error('Logout error:', error)
        } finally {
          setAccessToken(null)
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
        }
      },

      register: async (data) => {
        set({ isLoading: true })
        
        try {
          const result = await authApi.register(data)

          const user: User = {
            id: result.user.id,
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            role: result.user.role,
            groupIds: [],
            permissions: [],
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }

          const firm: Firm = result.firm ? {
            id: result.firm.id,
            name: result.firm.name,
            billingDefaults: {
              hourlyRate: 350,
              incrementMinutes: 6,
              paymentTerms: 30,
              currency: 'USD'
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          } : null as any

          setAccessToken(result.accessToken)

          set({
            user,
            firm,
            isAuthenticated: true,
            isLoading: false,
            userPermissions: rolePermissions['owner']
          })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      checkAuth: async () => {
        try {
          const result = await authApi.getMe()
          
          if (result.user) {
            const user: User = {
              id: result.user.id,
              email: result.user.email,
              firstName: result.user.firstName,
              lastName: result.user.lastName,
              role: result.user.role,
              groupIds: result.user.groupIds || [],
              permissions: result.user.permissions || [],
              isActive: true,
              createdAt: result.user.createdAt,
              updatedAt: result.user.createdAt,
            }

            const firm: Firm = result.firm ? {
              id: result.firm.id,
              name: result.firm.name,
              address: result.firm.address,
              city: result.firm.city,
              state: result.firm.state,
              zipCode: result.firm.zipCode,
              phone: result.firm.phone,
              email: result.firm.email,
              website: result.firm.website,
              billingDefaults: result.firm.billingDefaults,
              createdAt: result.firm.createdAt,
              updatedAt: result.firm.updatedAt,
            } : null as any

            set({
              user,
              firm,
              isAuthenticated: true,
              twoFactorVerified: true,
              userPermissions: rolePermissions[user.role],
            })

            return true
          }
        } catch (error) {
          console.error('Auth check failed:', error)
        }

        set({
          user: null,
          firm: null,
          isAuthenticated: false,
        })
        return false
      },

      setupFirm: (data) => {
        const { firm } = get()
        if (firm) {
          set({ firm: { ...firm, ...data } as Firm })
        }
      },

      updateFirm: (data) => {
        const { firm } = get()
        if (firm) {
          set({ firm: { ...firm, ...data } as Firm })
        }
      },

      updateUser: (data) => {
        const { user } = get()
        if (user) {
          set({ user: { ...user, ...data } as User })
        }
      },

      updatePassword: async (currentPassword: string, newPassword: string) => {
        try {
          await authApi.updatePassword(currentPassword, newPassword)
          return true
        } catch (error) {
          console.error('Password update failed:', error)
          return false
        }
      },

      enable2FA: async (method) => {
        const setup: TwoFactorSetup = {
          enabled: true,
          method,
          verifiedAt: new Date().toISOString(),
          backupCodes: get().generateBackupCodes()
        }

        set({ twoFactorSetup: setup })

        if (method === 'authenticator') {
          return {
            secret: 'JBSWY3DPEHPK3PXP',
            qrCode: 'otpauth://totp/Apex:user@apex.law?secret=JBSWY3DPEHPK3PXP&issuer=Apex'
          }
        }
        
        return {}
      },

      disable2FA: () => {
        set({ twoFactorSetup: null })
      },

      generateBackupCodes: () => {
        return Array.from({ length: 10 }, () => 
          Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
          Math.random().toString(36).substring(2, 6).toUpperCase()
        )
      },

      getSessions: () => get().sessions,

      revokeSession: async (sessionId: string) => {
        try {
          await authApi.revokeSession(sessionId)
          set(state => ({
            sessions: state.sessions.filter(s => s.id !== sessionId)
          }))
        } catch (error) {
          console.error('Revoke session failed:', error)
        }
      },

      revokeAllOtherSessions: async () => {
        try {
          await authApi.revokeAllSessions()
          set(state => ({
            sessions: state.sessions.filter(s => s.isCurrent)
          }))
        } catch (error) {
          console.error('Revoke sessions failed:', error)
        }
      },

      loadTeamMembers: async () => {
        try {
          const result = await teamApi.getMembers()
          set({ teamMembers: result.teamMembers })
        } catch (error) {
          console.error('Load team members failed:', error)
        }
      },

      inviteUser: async (data) => {
        const result = await teamApi.invite(data)
        const invitation = result.invitation
        
        set(state => ({
          invitations: [...state.invitations, invitation]
        }))

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
      },

      revokeInvitation: async (invitationId: string) => {
        try {
          await teamApi.revokeInvitation(invitationId)
          set(state => ({
            invitations: state.invitations.map(inv =>
              inv.id === invitationId ? { ...inv, status: 'revoked' as const } : inv
            )
          }))
        } catch (error) {
          console.error('Revoke invitation failed:', error)
        }
      },

      updateTeamMember: async (userId: string, data: Partial<User>) => {
        try {
          await teamApi.updateMember(userId, data)
          set(state => ({
            teamMembers: state.teamMembers.map(m =>
              m.id === userId ? { ...m, ...data } : m
            )
          }))
        } catch (error) {
          console.error('Update team member failed:', error)
        }
      },

      removeTeamMember: async (userId: string) => {
        try {
          await teamApi.removeMember(userId)
          set(state => ({
            teamMembers: state.teamMembers.filter(m => m.id !== userId)
          }))
        } catch (error) {
          console.error('Remove team member failed:', error)
        }
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
        return false
      },

      canAccessClient: (clientId: string) => {
        const { user, hasPermission } = get()
        if (!user) return false
        if (hasPermission('clients:view')) return true
        return false
      },

      logAction: (action: string, resource: string, resourceId?: string, details?: Record<string, any>) => {
        // Audit logging is now handled server-side
      },

      getAuditLog: (filters) => {
        // Audit logs are now fetched from the server
        return []
      },
    }),
    {
      name: 'apex-auth',
      partialize: (state) => ({
        // Only persist minimal data, full auth state comes from server
        isAuthenticated: state.isAuthenticated,
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
