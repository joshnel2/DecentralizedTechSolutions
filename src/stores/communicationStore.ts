import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Message types
interface DirectMessage {
  id: string
  fromUserId: string
  toUserId: string
  content: string
  read: boolean
  createdAt: string
}

interface ChannelMessage {
  id: string
  channelId: string
  userId: string
  content: string
  mentions: string[]
  attachments: Attachment[]
  reactions: Reaction[]
  createdAt: string
  editedAt?: string
}

interface Channel {
  id: string
  name: string
  description?: string
  type: 'matter' | 'team' | 'general'
  matterId?: string
  memberIds: string[]
  createdBy: string
  createdAt: string
  lastActivity: string
}

interface Attachment {
  id: string
  name: string
  type: string
  size: number
  url: string
}

interface Reaction {
  emoji: string
  userIds: string[]
}

interface Comment {
  id: string
  resourceType: 'matter' | 'document' | 'invoice' | 'time_entry' | 'event'
  resourceId: string
  userId: string
  content: string
  mentions: string[]
  createdAt: string
  editedAt?: string
}

interface ActivityFeedItem {
  id: string
  type: 'matter_created' | 'matter_updated' | 'document_uploaded' | 'time_entry_added' | 
        'invoice_sent' | 'payment_received' | 'comment_added' | 'event_created' | 'user_mentioned'
  userId: string
  resourceType: string
  resourceId: string
  resourceName: string
  details?: Record<string, any>
  createdAt: string
}

interface CommunicationState {
  // Direct Messages
  directMessages: DirectMessage[]
  
  // Channels
  channels: Channel[]
  channelMessages: ChannelMessage[]
  
  // Comments
  comments: Comment[]
  
  // Activity Feed
  activityFeed: ActivityFeedItem[]
  
  // Unread counts
  unreadDMs: number
  unreadChannels: Record<string, number>
  
  // Actions - Direct Messages
  sendDirectMessage: (toUserId: string, content: string) => DirectMessage
  markDMAsRead: (messageId: string) => void
  getConversation: (userId: string) => DirectMessage[]
  
  // Actions - Channels
  createChannel: (data: Omit<Channel, 'id' | 'createdAt' | 'lastActivity'>) => Channel
  sendChannelMessage: (channelId: string, content: string, mentions?: string[]) => ChannelMessage
  addReaction: (messageId: string, emoji: string, userId: string) => void
  getMatterChannel: (matterId: string) => Channel | undefined
  
  // Actions - Comments
  addComment: (resourceType: Comment['resourceType'], resourceId: string, content: string, mentions?: string[]) => Comment
  getComments: (resourceType: Comment['resourceType'], resourceId: string) => Comment[]
  editComment: (commentId: string, content: string) => void
  deleteComment: (commentId: string) => void
  
  // Actions - Activity Feed
  addActivity: (data: Omit<ActivityFeedItem, 'id' | 'createdAt'>) => void
  getActivityFeed: (filters?: { resourceType?: string; userId?: string }) => ActivityFeedItem[]
}

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Demo data
const demoChannels: Channel[] = [
  {
    id: 'channel-1',
    name: 'General',
    description: 'Firm-wide announcements and discussions',
    type: 'general',
    memberIds: ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6'],
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00Z',
    lastActivity: new Date().toISOString()
  },
  {
    id: 'channel-2',
    name: 'Litigation Team',
    description: 'Litigation practice group discussions',
    type: 'team',
    memberIds: ['user-1', 'user-2', 'user-3'],
    createdBy: 'user-1',
    createdAt: '2024-01-15T00:00:00Z',
    lastActivity: new Date().toISOString()
  },
  {
    id: 'channel-matter-1',
    name: 'Quantum v. TechStart',
    type: 'matter',
    matterId: 'matter-1',
    memberIds: ['user-1', 'user-2'],
    createdBy: 'user-1',
    createdAt: '2024-01-20T00:00:00Z',
    lastActivity: new Date().toISOString()
  }
]

const demoMessages: ChannelMessage[] = [
  {
    id: 'msg-1',
    channelId: 'channel-1',
    userId: 'user-1',
    content: 'Welcome to Apex Legal! Please use this channel for firm-wide announcements.',
    mentions: [],
    attachments: [],
    reactions: [{ emoji: '👋', userIds: ['user-2', 'user-3', 'user-4'] }],
    createdAt: '2024-01-01T09:00:00Z'
  },
  {
    id: 'msg-2',
    channelId: 'channel-1',
    userId: 'user-2',
    content: 'Reminder: Monthly partner meeting tomorrow at 10 AM. @John Mitchell will be presenting Q4 results.',
    mentions: ['user-1'],
    attachments: [],
    reactions: [{ emoji: '👍', userIds: ['user-1', 'user-3'] }],
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'msg-3',
    channelId: 'channel-matter-1',
    userId: 'user-1',
    content: 'Just filed the motion for preliminary injunction. Court date set for next week.',
    mentions: [],
    attachments: [],
    reactions: [],
    createdAt: new Date(Date.now() - 3600000).toISOString()
  }
]

const demoActivityFeed: ActivityFeedItem[] = [
  {
    id: 'activity-1',
    type: 'document_uploaded',
    userId: 'user-1',
    resourceType: 'document',
    resourceId: 'doc-1',
    resourceName: 'Patent_Claims_Analysis.pdf',
    details: { matterId: 'matter-1', matterName: 'Quantum v. TechStart' },
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'activity-2',
    type: 'time_entry_added',
    userId: 'user-1',
    resourceType: 'time_entry',
    resourceId: 'time-1',
    resourceName: '3.5 hours - Legal Research',
    details: { matterId: 'matter-1', hours: 3.5 },
    createdAt: new Date(Date.now() - 7200000).toISOString()
  },
  {
    id: 'activity-3',
    type: 'invoice_sent',
    userId: 'user-1',
    resourceType: 'invoice',
    resourceId: 'inv-1',
    resourceName: 'INV-2024-0042',
    details: { clientId: 'client-1', amount: 24750 },
    createdAt: new Date(Date.now() - 86400000).toISOString()
  }
]

export const useCommunicationStore = create<CommunicationState>()(
  persist(
    (set, get) => ({
      directMessages: [],
      channels: demoChannels,
      channelMessages: demoMessages,
      comments: [],
      activityFeed: demoActivityFeed,
      unreadDMs: 0,
      unreadChannels: {},

      sendDirectMessage: (toUserId: string, content: string) => {
        const message: DirectMessage = {
          id: generateId(),
          fromUserId: 'user-1', // Current user
          toUserId,
          content,
          read: false,
          createdAt: new Date().toISOString()
        }

        set(state => ({
          directMessages: [...state.directMessages, message]
        }))

        return message
      },

      markDMAsRead: (messageId: string) => {
        set(state => ({
          directMessages: state.directMessages.map(m =>
            m.id === messageId ? { ...m, read: true } : m
          ),
          unreadDMs: Math.max(0, state.unreadDMs - 1)
        }))
      },

      getConversation: (userId: string) => {
        return get().directMessages.filter(m =>
          (m.fromUserId === 'user-1' && m.toUserId === userId) ||
          (m.fromUserId === userId && m.toUserId === 'user-1')
        ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      },

      createChannel: (data) => {
        const channel: Channel = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        }

        set(state => ({
          channels: [...state.channels, channel]
        }))

        return channel
      },

      sendChannelMessage: (channelId: string, content: string, mentions: string[] = []) => {
        const message: ChannelMessage = {
          id: generateId(),
          channelId,
          userId: 'user-1',
          content,
          mentions,
          attachments: [],
          reactions: [],
          createdAt: new Date().toISOString()
        }

        set(state => ({
          channelMessages: [...state.channelMessages, message],
          channels: state.channels.map(c =>
            c.id === channelId ? { ...c, lastActivity: new Date().toISOString() } : c
          )
        }))

        // Add activity for mentions
        mentions.forEach(userId => {
          get().addActivity({
            type: 'user_mentioned',
            userId: 'user-1',
            resourceType: 'channel',
            resourceId: channelId,
            resourceName: get().channels.find(c => c.id === channelId)?.name || 'Channel',
            details: { mentionedUserId: userId }
          })
        })

        return message
      },

      addReaction: (messageId: string, emoji: string, userId: string) => {
        set(state => ({
          channelMessages: state.channelMessages.map(m => {
            if (m.id !== messageId) return m

            const existingReaction = m.reactions.find(r => r.emoji === emoji)
            if (existingReaction) {
              if (existingReaction.userIds.includes(userId)) {
                // Remove reaction
                return {
                  ...m,
                  reactions: m.reactions.map(r =>
                    r.emoji === emoji
                      ? { ...r, userIds: r.userIds.filter(id => id !== userId) }
                      : r
                  ).filter(r => r.userIds.length > 0)
                }
              } else {
                // Add user to existing reaction
                return {
                  ...m,
                  reactions: m.reactions.map(r =>
                    r.emoji === emoji
                      ? { ...r, userIds: [...r.userIds, userId] }
                      : r
                  )
                }
              }
            } else {
              // New reaction
              return {
                ...m,
                reactions: [...m.reactions, { emoji, userIds: [userId] }]
              }
            }
          })
        }))
      },

      getMatterChannel: (matterId: string) => {
        return get().channels.find(c => c.matterId === matterId)
      },

      addComment: (resourceType, resourceId, content, mentions = []) => {
        const comment: Comment = {
          id: generateId(),
          resourceType,
          resourceId,
          userId: 'user-1',
          content,
          mentions,
          createdAt: new Date().toISOString()
        }

        set(state => ({
          comments: [...state.comments, comment]
        }))

        get().addActivity({
          type: 'comment_added',
          userId: 'user-1',
          resourceType,
          resourceId,
          resourceName: content.substring(0, 50) + (content.length > 50 ? '...' : '')
        })

        return comment
      },

      getComments: (resourceType, resourceId) => {
        return get().comments.filter(c =>
          c.resourceType === resourceType && c.resourceId === resourceId
        ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      },

      editComment: (commentId, content) => {
        set(state => ({
          comments: state.comments.map(c =>
            c.id === commentId
              ? { ...c, content, editedAt: new Date().toISOString() }
              : c
          )
        }))
      },

      deleteComment: (commentId) => {
        set(state => ({
          comments: state.comments.filter(c => c.id !== commentId)
        }))
      },

      addActivity: (data) => {
        const item: ActivityFeedItem = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString()
        }

        set(state => ({
          activityFeed: [item, ...state.activityFeed].slice(0, 500)
        }))
      },

      getActivityFeed: (filters) => {
        let feed = get().activityFeed

        if (filters?.resourceType) {
          feed = feed.filter(f => f.resourceType === filters.resourceType)
        }
        if (filters?.userId) {
          feed = feed.filter(f => f.userId === filters.userId)
        }

        return feed
      }
    }),
    {
      name: 'apex-communication'
    }
  )
)
