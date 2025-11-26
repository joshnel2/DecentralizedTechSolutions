import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Message Types
export interface DirectMessage {
  id: string
  fromUserId: string
  toUserId: string
  content: string
  attachments: Attachment[]
  readAt?: string
  createdAt: string
}

export interface ChannelMessage {
  id: string
  channelId: string
  userId: string
  content: string
  attachments: Attachment[]
  reactions: Reaction[]
  threadId?: string
  isPinned: boolean
  createdAt: string
  editedAt?: string
}

export interface Channel {
  id: string
  name: string
  description?: string
  type: 'general' | 'matter' | 'team' | 'private'
  matterId?: string
  memberIds: string[]
  createdBy: string
  createdAt: string
}

export interface Attachment {
  id: string
  name: string
  type: string
  size: number
  url: string
}

export interface Reaction {
  emoji: string
  userIds: string[]
}

// Email Integration Types
export interface LinkedEmail {
  id: string
  messageId: string
  threadId?: string
  matterId?: string
  clientId?: string
  from: string
  to: string[]
  cc?: string[]
  subject: string
  body: string
  bodyHtml?: string
  attachments: Attachment[]
  isIncoming: boolean
  linkedBy: string
  linkedAt: string
  receivedAt: string
}

export interface EmailAccount {
  id: string
  userId: string
  email: string
  provider: 'microsoft' | 'google' | 'other'
  isConnected: boolean
  lastSynced?: string
  syncEnabled: boolean
  autoLinkEnabled: boolean
  createdAt: string
}

// Activity Feed Types
export interface ActivityFeedItem {
  id: string
  type: 'message' | 'document' | 'matter' | 'billing' | 'email' | 'calendar' | 'ai'
  action: string
  userId: string
  resourceType: string
  resourceId: string
  resourceName: string
  matterId?: string
  clientId?: string
  details?: Record<string, any>
  createdAt: string
}

// Notification Preferences
export interface NotificationPreferences {
  userId: string
  email: {
    directMessages: boolean
    channelMentions: boolean
    matterUpdates: boolean
    deadlines: boolean
    invoices: boolean
    weeklyDigest: boolean
  }
  push: {
    directMessages: boolean
    channelMentions: boolean
    urgentDeadlines: boolean
    aiInsights: boolean
  }
  inApp: {
    allActivity: boolean
    directMessages: boolean
    channelMentions: boolean
    matterUpdates: boolean
  }
}

// Communication Store State
interface CommunicationState {
  // Direct Messages
  directMessages: DirectMessage[]
  
  // Channels
  channels: Channel[]
  channelMessages: ChannelMessage[]
  
  // Email
  linkedEmails: LinkedEmail[]
  emailAccounts: EmailAccount[]
  
  // Activity
  activityFeed: ActivityFeedItem[]
  
  // Preferences
  notificationPreferences: NotificationPreferences | null
  
  // Unread counts
  unreadDMs: number
  unreadChannels: Record<string, number>
  
  // DM Actions
  sendDirectMessage: (toUserId: string, content: string, attachments?: Attachment[]) => DirectMessage
  markDMAsRead: (messageId: string) => void
  getConversation: (userId: string) => DirectMessage[]
  
  // Channel Actions
  createChannel: (channel: Omit<Channel, 'id' | 'createdAt'>) => Channel
  updateChannel: (id: string, data: Partial<Channel>) => void
  deleteChannel: (id: string) => void
  joinChannel: (channelId: string, userId: string) => void
  leaveChannel: (channelId: string, userId: string) => void
  
  // Channel Message Actions
  sendChannelMessage: (channelId: string, content: string, attachments?: Attachment[], threadId?: string) => ChannelMessage
  editChannelMessage: (messageId: string, content: string) => void
  deleteChannelMessage: (messageId: string) => void
  addReaction: (messageId: string, emoji: string, userId: string) => void
  removeReaction: (messageId: string, emoji: string, userId: string) => void
  pinMessage: (messageId: string) => void
  unpinMessage: (messageId: string) => void
  
  // Matter Channel
  getMatterChannel: (matterId: string) => Channel | undefined
  createMatterChannel: (matterId: string, matterName: string, memberIds: string[]) => Channel
  
  // Email Actions
  linkEmail: (email: Omit<LinkedEmail, 'id' | 'linkedAt'>) => LinkedEmail
  unlinkEmail: (emailId: string) => void
  getEmailsForMatter: (matterId: string) => LinkedEmail[]
  
  // Email Account Actions
  connectEmailAccount: (data: Omit<EmailAccount, 'id' | 'createdAt' | 'isConnected'>) => EmailAccount
  disconnectEmailAccount: (id: string) => void
  syncEmailAccount: (id: string) => Promise<void>
  toggleAutoLink: (id: string) => void
  
  // Activity Actions
  addActivity: (activity: Omit<ActivityFeedItem, 'id' | 'createdAt'>) => void
  getActivityFeed: (filters?: { matterId?: string; userId?: string; type?: string }) => ActivityFeedItem[]
  
  // Preference Actions
  updateNotificationPreferences: (prefs: Partial<NotificationPreferences>) => void
  
  // Search
  searchMessages: (query: string) => (DirectMessage | ChannelMessage)[]
}

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Demo data
const demoChannels: Channel[] = [
  {
    id: 'channel-general',
    name: 'General',
    description: 'Firm-wide announcements and discussions',
    type: 'general',
    memberIds: ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6'],
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'channel-litigation',
    name: 'Litigation Team',
    description: 'Litigation practice group discussions',
    type: 'team',
    memberIds: ['user-1', 'user-2', 'user-5'],
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'channel-matter-1',
    name: 'Quantum v. TechStart',
    description: 'Case discussion and updates',
    type: 'matter',
    matterId: 'matter-1',
    memberIds: ['user-1', 'user-2'],
    createdBy: 'user-1',
    createdAt: '2024-01-20T00:00:00Z'
  }
]

const demoChannelMessages: ChannelMessage[] = [
  {
    id: 'msg-1',
    channelId: 'channel-general',
    userId: 'user-1',
    content: 'Good morning everyone! Reminder that we have our weekly team meeting at 10am today.',
    attachments: [],
    reactions: [{ emoji: '👍', userIds: ['user-2', 'user-3'] }],
    isPinned: false,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'msg-2',
    channelId: 'channel-matter-1',
    userId: 'user-2',
    content: 'Just finished the prior art analysis. Found some strong references for Claims 5-8.',
    attachments: [{ id: 'att-1', name: 'Prior_Art_Analysis.pdf', type: 'application/pdf', size: 2456789, url: '#' }],
    reactions: [],
    isPinned: true,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'msg-3',
    channelId: 'channel-litigation',
    userId: 'user-1',
    content: 'Need everyone to review the motion draft by EOD tomorrow. @Sarah @James',
    attachments: [],
    reactions: [{ emoji: '✅', userIds: ['user-2', 'user-5'] }],
    isPinned: false,
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  }
]

const demoLinkedEmails: LinkedEmail[] = [
  {
    id: 'email-1',
    messageId: 'msg-id-1',
    matterId: 'matter-1',
    clientId: 'client-1',
    from: 'sarah@quantumtech.com',
    to: ['john@apexlaw.com'],
    subject: 'RE: Patent Infringement Evidence',
    body: 'John, please find attached the additional documentation you requested regarding the infringement timeline.',
    attachments: [{ id: 'att-2', name: 'Evidence_Timeline.pdf', type: 'application/pdf', size: 1234567, url: '#' }],
    isIncoming: true,
    linkedBy: 'user-1',
    linkedAt: '2024-11-20T00:00:00Z',
    receivedAt: '2024-11-20T09:30:00Z'
  }
]

const demoEmailAccounts: EmailAccount[] = [
  {
    id: 'email-acc-1',
    userId: 'user-1',
    email: 'john@apexlaw.com',
    provider: 'microsoft',
    isConnected: true,
    lastSynced: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    syncEnabled: true,
    autoLinkEnabled: true,
    createdAt: '2024-01-01T00:00:00Z'
  }
]

const demoActivityFeed: ActivityFeedItem[] = [
  {
    id: 'act-1',
    type: 'document',
    action: 'uploaded',
    userId: 'user-1',
    resourceType: 'document',
    resourceId: 'doc-1',
    resourceName: 'Patent_Claims_Analysis.pdf',
    matterId: 'matter-1',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'act-2',
    type: 'billing',
    action: 'created',
    userId: 'user-1',
    resourceType: 'invoice',
    resourceId: 'inv-1',
    resourceName: 'INV-2024-0042',
    matterId: 'matter-1',
    clientId: 'client-1',
    details: { amount: 24750 },
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'act-3',
    type: 'ai',
    action: 'generated',
    userId: 'user-1',
    resourceType: 'analysis',
    resourceId: 'ai-1',
    resourceName: 'Matter Summary - Quantum v. TechStart',
    matterId: 'matter-1',
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  }
]

export const useCommunicationStore = create<CommunicationState>()(
  persist(
    (set, get) => ({
      directMessages: [],
      channels: demoChannels,
      channelMessages: demoChannelMessages,
      linkedEmails: demoLinkedEmails,
      emailAccounts: demoEmailAccounts,
      activityFeed: demoActivityFeed,
      notificationPreferences: null,
      unreadDMs: 0,
      unreadChannels: {},

      // DM Actions
      sendDirectMessage: (toUserId, content, attachments = []) => {
        const message: DirectMessage = {
          id: generateId(),
          fromUserId: 'user-1', // Current user
          toUserId,
          content,
          attachments,
          createdAt: new Date().toISOString()
        }
        set(state => ({ directMessages: [...state.directMessages, message] }))
        
        // Add activity
        get().addActivity({
          type: 'message',
          action: 'sent',
          userId: 'user-1',
          resourceType: 'direct_message',
          resourceId: message.id,
          resourceName: `Message to ${toUserId}`
        })
        
        return message
      },

      markDMAsRead: (messageId) => {
        set(state => ({
          directMessages: state.directMessages.map(m =>
            m.id === messageId ? { ...m, readAt: new Date().toISOString() } : m
          ),
          unreadDMs: Math.max(0, state.unreadDMs - 1)
        }))
      },

      getConversation: (userId) => {
        return get().directMessages.filter(m =>
          (m.fromUserId === 'user-1' && m.toUserId === userId) ||
          (m.fromUserId === userId && m.toUserId === 'user-1')
        ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      },

      // Channel Actions
      createChannel: (data) => {
        const channel: Channel = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString()
        }
        set(state => ({ channels: [...state.channels, channel] }))
        
        get().addActivity({
          type: 'message',
          action: 'created',
          userId: data.createdBy,
          resourceType: 'channel',
          resourceId: channel.id,
          resourceName: channel.name
        })
        
        return channel
      },

      updateChannel: (id, data) => {
        set(state => ({
          channels: state.channels.map(c => c.id === id ? { ...c, ...data } : c)
        }))
      },

      deleteChannel: (id) => {
        set(state => ({
          channels: state.channels.filter(c => c.id !== id),
          channelMessages: state.channelMessages.filter(m => m.channelId !== id)
        }))
      },

      joinChannel: (channelId, userId) => {
        set(state => ({
          channels: state.channels.map(c =>
            c.id === channelId && !c.memberIds.includes(userId)
              ? { ...c, memberIds: [...c.memberIds, userId] }
              : c
          )
        }))
      },

      leaveChannel: (channelId, userId) => {
        set(state => ({
          channels: state.channels.map(c =>
            c.id === channelId
              ? { ...c, memberIds: c.memberIds.filter(id => id !== userId) }
              : c
          )
        }))
      },

      // Channel Message Actions
      sendChannelMessage: (channelId, content, attachments = [], threadId) => {
        const message: ChannelMessage = {
          id: generateId(),
          channelId,
          userId: 'user-1',
          content,
          attachments,
          reactions: [],
          threadId,
          isPinned: false,
          createdAt: new Date().toISOString()
        }
        set(state => ({ channelMessages: [...state.channelMessages, message] }))
        
        const channel = get().channels.find(c => c.id === channelId)
        get().addActivity({
          type: 'message',
          action: 'posted',
          userId: 'user-1',
          resourceType: 'channel_message',
          resourceId: message.id,
          resourceName: channel?.name || 'Channel',
          matterId: channel?.matterId
        })
        
        return message
      },

      editChannelMessage: (messageId, content) => {
        set(state => ({
          channelMessages: state.channelMessages.map(m =>
            m.id === messageId ? { ...m, content, editedAt: new Date().toISOString() } : m
          )
        }))
      },

      deleteChannelMessage: (messageId) => {
        set(state => ({
          channelMessages: state.channelMessages.filter(m => m.id !== messageId)
        }))
      },

      addReaction: (messageId, emoji, userId) => {
        set(state => ({
          channelMessages: state.channelMessages.map(m => {
            if (m.id !== messageId) return m
            const existingReaction = m.reactions.find(r => r.emoji === emoji)
            if (existingReaction) {
              if (existingReaction.userIds.includes(userId)) return m
              return {
                ...m,
                reactions: m.reactions.map(r =>
                  r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r
                )
              }
            }
            return { ...m, reactions: [...m.reactions, { emoji, userIds: [userId] }] }
          })
        }))
      },

      removeReaction: (messageId, emoji, userId) => {
        set(state => ({
          channelMessages: state.channelMessages.map(m => {
            if (m.id !== messageId) return m
            return {
              ...m,
              reactions: m.reactions
                .map(r => r.emoji === emoji ? { ...r, userIds: r.userIds.filter(id => id !== userId) } : r)
                .filter(r => r.userIds.length > 0)
            }
          })
        }))
      },

      pinMessage: (messageId) => {
        set(state => ({
          channelMessages: state.channelMessages.map(m =>
            m.id === messageId ? { ...m, isPinned: true } : m
          )
        }))
      },

      unpinMessage: (messageId) => {
        set(state => ({
          channelMessages: state.channelMessages.map(m =>
            m.id === messageId ? { ...m, isPinned: false } : m
          )
        }))
      },

      // Matter Channel
      getMatterChannel: (matterId) => {
        return get().channels.find(c => c.matterId === matterId)
      },

      createMatterChannel: (matterId, matterName, memberIds) => {
        return get().createChannel({
          name: matterName,
          description: `Discussion channel for ${matterName}`,
          type: 'matter',
          matterId,
          memberIds,
          createdBy: 'user-1'
        })
      },

      // Email Actions
      linkEmail: (data) => {
        const email: LinkedEmail = {
          ...data,
          id: generateId(),
          linkedAt: new Date().toISOString()
        }
        set(state => ({ linkedEmails: [...state.linkedEmails, email] }))
        
        get().addActivity({
          type: 'email',
          action: 'linked',
          userId: data.linkedBy,
          resourceType: 'email',
          resourceId: email.id,
          resourceName: data.subject,
          matterId: data.matterId,
          clientId: data.clientId
        })
        
        return email
      },

      unlinkEmail: (emailId) => {
        set(state => ({ linkedEmails: state.linkedEmails.filter(e => e.id !== emailId) }))
      },

      getEmailsForMatter: (matterId) => {
        return get().linkedEmails.filter(e => e.matterId === matterId)
      },

      // Email Account Actions
      connectEmailAccount: (data) => {
        const account: EmailAccount = {
          ...data,
          id: generateId(),
          isConnected: true,
          createdAt: new Date().toISOString()
        }
        set(state => ({ emailAccounts: [...state.emailAccounts, account] }))
        return account
      },

      disconnectEmailAccount: (id) => {
        set(state => ({
          emailAccounts: state.emailAccounts.map(a =>
            a.id === id ? { ...a, isConnected: false, syncEnabled: false } : a
          )
        }))
      },

      syncEmailAccount: async (id) => {
        // Simulate sync
        await new Promise(resolve => setTimeout(resolve, 2000))
        set(state => ({
          emailAccounts: state.emailAccounts.map(a =>
            a.id === id ? { ...a, lastSynced: new Date().toISOString() } : a
          )
        }))
      },

      toggleAutoLink: (id) => {
        set(state => ({
          emailAccounts: state.emailAccounts.map(a =>
            a.id === id ? { ...a, autoLinkEnabled: !a.autoLinkEnabled } : a
          )
        }))
      },

      // Activity Actions
      addActivity: (data) => {
        const activity: ActivityFeedItem = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString()
        }
        set(state => ({
          activityFeed: [activity, ...state.activityFeed].slice(0, 500)
        }))
      },

      getActivityFeed: (filters) => {
        let feed = get().activityFeed
        if (filters?.matterId) {
          feed = feed.filter(a => a.matterId === filters.matterId)
        }
        if (filters?.userId) {
          feed = feed.filter(a => a.userId === filters.userId)
        }
        if (filters?.type) {
          feed = feed.filter(a => a.type === filters.type)
        }
        return feed
      },

      // Preferences
      updateNotificationPreferences: (prefs) => {
        set(state => ({
          notificationPreferences: state.notificationPreferences
            ? { ...state.notificationPreferences, ...prefs }
            : { userId: 'user-1', ...prefs } as NotificationPreferences
        }))
      },

      // Search
      searchMessages: (query) => {
        const lowerQuery = query.toLowerCase()
        const dms = get().directMessages.filter(m =>
          m.content.toLowerCase().includes(lowerQuery)
        )
        const channelMsgs = get().channelMessages.filter(m =>
          m.content.toLowerCase().includes(lowerQuery)
        )
        return [...dms, ...channelMsgs]
      }
    }),
    {
      name: 'apex-communication'
    }
  )
)
