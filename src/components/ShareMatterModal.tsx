/**
 * ShareMatterModal Component
 * Quick share button that opens a modal to add users/groups to a matter
 */

import { useState, useEffect } from 'react'
import { 
  Share2, X, Search, Users, Shield, Loader2,
  Check, AlertCircle, Globe, Lock
} from 'lucide-react'
import { clsx } from 'clsx'
import { mattersApi } from '../services/api'
import styles from './ShareMatterModal.module.css'

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface Group {
  id: string
  name: string
  description: string
  color: string
  memberCount: number
}

interface ShareMatterModalProps {
  isOpen: boolean
  onClose: () => void
  matterId: string
  matterName: string
  currentVisibility: 'firm_wide' | 'restricted'
  onPermissionsChanged?: () => void
}

export function ShareMatterModal({
  isOpen,
  onClose,
  matterId,
  matterName,
  currentVisibility,
  onPermissionsChanged
}: ShareMatterModalProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  const [tab, setTab] = useState<'users' | 'groups'>('users')
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Load available users and groups
  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen, matterId])

  // Filter users by search query
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const [usersData, groupsData] = await Promise.all([
        mattersApi.getAvailableUsers(matterId),
        mattersApi.getAvailableGroups(matterId)
      ])
      setUsers(usersData.users || [])
      setGroups(groupsData.groups || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load users and groups')
    } finally {
      setLoading(false)
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  async function handleShare() {
    if (selectedIds.length === 0) {
      setError('Please select at least one user or group')
      return
    }

    try {
      setSaving(true)
      setError(null)

      // Add permissions for each selected user/group
      for (const id of selectedIds) {
        const isUser = users.some(u => u.id === id)
        const isGroup = groups.some(g => g.id === id)

        if (isUser) {
          await mattersApi.addPermission(matterId, { userId: id })
        } else if (isGroup) {
          await mattersApi.addPermission(matterId, { groupId: id })
        }
      }

      setSuccess(`Shared with ${selectedIds.length} user${selectedIds.length > 1 ? 's/groups' : ''}`)
      setSelectedIds([])
      
      if (onPermissionsChanged) {
        onPermissionsChanged()
      }

      // Close after short delay
      setTimeout(() => {
        onClose()
        setSuccess(null)
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to share matter')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <Share2 size={20} />
            <div>
              <h3>Share Matter</h3>
              <p className={styles.matterName}>{matterName}</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Current visibility status */}
        <div className={styles.visibilityInfo}>
          {currentVisibility === 'firm_wide' ? (
            <>
              <Globe size={16} />
              <span>This matter is <strong>Firm Wide</strong> - all users can access it.</span>
            </>
          ) : (
            <>
              <Lock size={16} />
              <span>This matter is <strong>Restricted</strong> - only selected users can access it.</span>
            </>
          )}
        </div>

        {error && (
          <div className={styles.error}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {success && (
          <div className={styles.success}>
            <Check size={16} />
            {success}
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={clsx(tab === 'users' && styles.activeTab)}
            onClick={() => setTab('users')}
          >
            <Users size={16} />
            Users ({users.length})
          </button>
          <button
            className={clsx(tab === 'groups' && styles.activeTab)}
            onClick={() => setTab('groups')}
          >
            <Shield size={16} />
            Groups ({groups.length})
          </button>
        </div>

        {/* Search (users only) */}
        {tab === 'users' && (
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Content */}
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>
              <Loader2 className={styles.spinner} size={24} />
              <span>Loading...</span>
            </div>
          ) : tab === 'users' ? (
            filteredUsers.length === 0 ? (
              <div className={styles.empty}>
                {searchQuery ? 'No users match your search' : 'No users available to add'}
              </div>
            ) : (
              <div className={styles.list}>
                {filteredUsers.map((user) => (
                  <label 
                    key={user.id} 
                    className={clsx(
                      styles.item, 
                      selectedIds.includes(user.id) && styles.selected
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(user.id)}
                      onChange={() => toggleSelection(user.id)}
                    />
                    <div className={styles.avatar}>
                      {user.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className={styles.itemInfo}>
                      <span className={styles.itemName}>{user.name}</span>
                      <span className={styles.itemMeta}>{user.email}</span>
                    </div>
                    <span className={clsx(styles.roleBadge, styles[user.role])}>
                      {user.role}
                    </span>
                  </label>
                ))}
              </div>
            )
          ) : (
            groups.length === 0 ? (
              <div className={styles.empty}>
                No groups available to add
              </div>
            ) : (
              <div className={styles.list}>
                {groups.map((group) => (
                  <label 
                    key={group.id} 
                    className={clsx(
                      styles.item, 
                      selectedIds.includes(group.id) && styles.selected
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(group.id)}
                      onChange={() => toggleSelection(group.id)}
                    />
                    <div 
                      className={styles.groupAvatar}
                      style={{ backgroundColor: group.color }}
                    >
                      <Users size={14} />
                    </div>
                    <div className={styles.itemInfo}>
                      <span className={styles.itemName}>{group.name}</span>
                      <span className={styles.itemMeta}>
                        {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.selectionCount}>
            {selectedIds.length > 0 && `${selectedIds.length} selected`}
          </span>
          <div className={styles.footerActions}>
            <button 
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button 
              className={styles.shareBtn}
              onClick={handleShare}
              disabled={saving || selectedIds.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 className={styles.spinner} size={16} />
                  Sharing...
                </>
              ) : (
                <>
                  <Share2 size={16} />
                  Share
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ShareMatterModal
