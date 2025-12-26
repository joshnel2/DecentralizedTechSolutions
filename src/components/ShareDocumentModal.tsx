import { useState, useEffect } from 'react'
import {
  X, Share2, Users, User, Lock, Unlock, Globe, 
  UserPlus, Check, Loader2, Copy, Mail, Trash2,
  Eye, Edit3, Download, Shield, Clock
} from 'lucide-react'
import { wordOnlineApi, teamApi, documentPermissionsApi } from '../services/api'
import { format, parseISO } from 'date-fns'
import styles from './ShareDocumentModal.module.css'

interface ShareDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
  documentName: string
  currentPrivacy?: 'private' | 'shared' | 'team' | 'firm'
  isOwner?: boolean
}

interface TeamMember {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  avatarUrl?: string
}

interface Share {
  id: string
  type: 'user' | 'group'
  userId?: string
  userName?: string
  userEmail?: string
  userAvatar?: string
  groupId?: string
  groupName?: string
  groupColor?: string
  permissionLevel: string
  canView: boolean
  canDownload: boolean
  canEdit: boolean
  canShare: boolean
  expiresAt?: string
  createdAt: string
}

const PRIVACY_OPTIONS = [
  { value: 'private', label: 'Private', icon: Lock, description: 'Only you and admins can access' },
  { value: 'shared', label: 'Shared', icon: Users, description: 'You, admins, and people you share with' },
  { value: 'team', label: 'Matter Team', icon: Shield, description: 'Everyone assigned to the matter' },
  { value: 'firm', label: 'Firm-wide', icon: Globe, description: 'Everyone in the firm can view' },
]

const PERMISSION_PRESETS = [
  { value: 'view', label: 'Can view', icon: Eye, canEdit: false, canDownload: true, canShare: false },
  { value: 'comment', label: 'Can comment', icon: Eye, canEdit: false, canDownload: true, canShare: false },
  { value: 'edit', label: 'Can edit', icon: Edit3, canEdit: true, canDownload: true, canShare: false },
  { value: 'full', label: 'Full access', icon: Shield, canEdit: true, canDownload: true, canShare: true },
]

export function ShareDocumentModal({
  isOpen,
  onClose,
  documentId,
  documentName,
  currentPrivacy = 'private',
  isOwner = true,
}: ShareDocumentModalProps) {
  const [privacy, setPrivacy] = useState(currentPrivacy)
  const [shares, setShares] = useState<Share[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // New share form
  const [showAddUser, setShowAddUser] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [permissionLevel, setPermissionLevel] = useState('view')
  const [expiresAt, setExpiresAt] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen, documentId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [sharesResult, teamResult] = await Promise.all([
        wordOnlineApi.getShares(documentId),
        teamApi.getMembers(),
      ])
      setShares(sharesResult.shares || [])
      setTeamMembers(teamResult.members || [])
    } catch (error) {
      console.error('Failed to load sharing data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePrivacyChange = async (newPrivacy: string) => {
    setSaving(true)
    try {
      await documentPermissionsApi.updateDocumentPrivacy(documentId, {
        privacyLevel: newPrivacy as any,
      })
      setPrivacy(newPrivacy as any)
      setNotification({ type: 'success', message: 'Privacy updated' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to update privacy' })
    } finally {
      setSaving(false)
    }
  }

  const handleShare = async () => {
    if (selectedUsers.length === 0) return

    setSaving(true)
    try {
      const preset = PERMISSION_PRESETS.find(p => p.value === permissionLevel)
      
      await wordOnlineApi.shareDocument(documentId, {
        userIds: selectedUsers,
        permissionLevel,
        canEdit: preset?.canEdit || false,
        canDownload: preset?.canDownload || true,
        canShare: preset?.canShare || false,
        expiresAt: expiresAt || undefined,
      })

      setNotification({ type: 'success', message: `Shared with ${selectedUsers.length} people` })
      setSelectedUsers([])
      setShowAddUser(false)
      setSearchQuery('')
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to share' })
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveShare = async (shareId: string) => {
    try {
      await wordOnlineApi.removeShare(documentId, shareId)
      setShares(shares.filter(s => s.id !== shareId))
      setNotification({ type: 'success', message: 'Access removed' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to remove access' })
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/app/documents/${documentId}`)
    setNotification({ type: 'success', message: 'Link copied to clipboard' })
  }

  const filteredMembers = teamMembers.filter(m => {
    const alreadyShared = shares.some(s => s.userId === m.id)
    const matchesSearch = searchQuery === '' || 
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase())
    return !alreadyShared && matchesSearch
  })

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Share2 size={20} />
          </div>
          <div className={styles.headerText}>
            <h2>Share "{documentName}"</h2>
            <p>Manage who can access this document</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Notification */}
        {notification && (
          <div className={`${styles.notification} ${styles[notification.type]}`}>
            {notification.type === 'success' ? <Check size={16} /> : <X size={16} />}
            {notification.message}
            <button onClick={() => setNotification(null)}>×</button>
          </div>
        )}

        {loading ? (
          <div className={styles.loading}>
            <Loader2 size={24} className={styles.spinning} />
            <span>Loading...</span>
          </div>
        ) : (
          <div className={styles.content}>
            {/* Privacy Level */}
            <section className={styles.section}>
              <h3>Privacy Level</h3>
              <div className={styles.privacyOptions}>
                {PRIVACY_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    className={`${styles.privacyOption} ${privacy === option.value ? styles.active : ''}`}
                    onClick={() => handlePrivacyChange(option.value)}
                    disabled={!isOwner || saving}
                  >
                    <option.icon size={18} />
                    <div className={styles.privacyText}>
                      <span className={styles.privacyLabel}>{option.label}</span>
                      <span className={styles.privacyDesc}>{option.description}</span>
                    </div>
                    {privacy === option.value && <Check size={16} className={styles.checkIcon} />}
                  </button>
                ))}
              </div>
            </section>

            {/* Share with people */}
            {(privacy === 'shared' || privacy === 'private') && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3>Share with people</h3>
                  {!showAddUser && (
                    <button className={styles.addBtn} onClick={() => setShowAddUser(true)}>
                      <UserPlus size={16} />
                      Add people
                    </button>
                  )}
                </div>

                {/* Add users form */}
                {showAddUser && (
                  <div className={styles.addUserForm}>
                    <input
                      type="text"
                      placeholder="Search team members..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className={styles.searchInput}
                      autoFocus
                    />

                    <div className={styles.userList}>
                      {filteredMembers.slice(0, 5).map(member => (
                        <label key={member.id} className={styles.userItem}>
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(member.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedUsers([...selectedUsers, member.id])
                              } else {
                                setSelectedUsers(selectedUsers.filter(id => id !== member.id))
                              }
                            }}
                          />
                          <div className={styles.userAvatar}>
                            {member.avatarUrl ? (
                              <img src={member.avatarUrl} alt="" />
                            ) : (
                              <span>{member.firstName[0]}{member.lastName[0]}</span>
                            )}
                          </div>
                          <div className={styles.userInfo}>
                            <span className={styles.userName}>{member.firstName} {member.lastName}</span>
                            <span className={styles.userEmail}>{member.email}</span>
                          </div>
                        </label>
                      ))}
                      {filteredMembers.length === 0 && (
                        <div className={styles.noResults}>No matching team members</div>
                      )}
                    </div>

                    <div className={styles.permissionRow}>
                      <label>Permission:</label>
                      <select 
                        value={permissionLevel} 
                        onChange={e => setPermissionLevel(e.target.value)}
                      >
                        {PERMISSION_PRESETS.map(preset => (
                          <option key={preset.value} value={preset.value}>{preset.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.permissionRow}>
                      <label>Expires:</label>
                      <input
                        type="date"
                        value={expiresAt}
                        onChange={e => setExpiresAt(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                      <span className={styles.optional}>(optional)</span>
                    </div>

                    <div className={styles.addUserActions}>
                      <button className={styles.cancelBtn} onClick={() => {
                        setShowAddUser(false)
                        setSelectedUsers([])
                        setSearchQuery('')
                      }}>
                        Cancel
                      </button>
                      <button 
                        className={styles.shareBtn}
                        onClick={handleShare}
                        disabled={selectedUsers.length === 0 || saving}
                      >
                        {saving ? <Loader2 size={16} className={styles.spinning} /> : <Share2 size={16} />}
                        Share with {selectedUsers.length || '...'} {selectedUsers.length === 1 ? 'person' : 'people'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Current shares */}
                {shares.length > 0 && (
                  <div className={styles.sharesList}>
                    {shares.map(share => (
                      <div key={share.id} className={styles.shareItem}>
                        <div className={styles.shareAvatar}>
                          {share.type === 'user' ? (
                            share.userAvatar ? (
                              <img src={share.userAvatar} alt="" />
                            ) : (
                              <User size={16} />
                            )
                          ) : (
                            <Users size={16} />
                          )}
                        </div>
                        <div className={styles.shareInfo}>
                          <span className={styles.shareName}>
                            {share.type === 'user' ? share.userName : share.groupName}
                          </span>
                          <span className={styles.shareEmail}>
                            {share.type === 'user' ? share.userEmail : 'Group'}
                            {share.expiresAt && (
                              <span className={styles.expires}>
                                <Clock size={12} />
                                Expires {format(parseISO(share.expiresAt), 'MMM d, yyyy')}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className={styles.sharePerms}>
                          {share.canEdit ? (
                            <span className={styles.permBadge}><Edit3 size={12} /> Edit</span>
                          ) : (
                            <span className={styles.permBadge}><Eye size={12} /> View</span>
                          )}
                        </div>
                        {isOwner && (
                          <button 
                            className={styles.removeBtn}
                            onClick={() => handleRemoveShare(share.id)}
                            title="Remove access"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {shares.length === 0 && !showAddUser && (
                  <div className={styles.noShares}>
                    <Lock size={24} />
                    <p>This document is not shared with anyone yet</p>
                  </div>
                )}
              </section>
            )}

            {/* Quick actions */}
            <section className={styles.section}>
              <h3>Quick actions</h3>
              <div className={styles.quickActions}>
                <button className={styles.actionBtn} onClick={copyLink}>
                  <Copy size={16} />
                  Copy link
                </button>
                <button className={styles.actionBtn} disabled>
                  <Mail size={16} />
                  Send via email
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
