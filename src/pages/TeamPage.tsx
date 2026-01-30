import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { teamApi } from '../services/api'
import { 
  Plus, Users, UserPlus, Shield, Trash2, Edit2,
  Mail, MoreVertical, Eye, Key, XCircle, ArrowLeft, RefreshCw
} from 'lucide-react'
import { clsx } from 'clsx'
import styles from './TeamPage.module.css'
import { useToast } from '../components/Toast'

interface TeamMember {
  id: string
  firstName?: string
  lastName?: string
  email: string
  role: string
  isActive: boolean
  avatarUrl?: string
  hourlyRate?: number
}

interface Group {
  id: string
  name: string
  description: string
  color: string
  memberIds: string[]
  permissions: string[]
}

export function TeamPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { groups, addGroup, updateGroup, deleteGroup, fetchGroups } = useDataStore()
  const { user } = useAuthStore()
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<any>(null)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // Real team members from API
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch team members from API
  const fetchTeamMembers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await teamApi.getMembers()
      if (response.teamMembers) {
        setTeamMembers(response.teamMembers)
      } else if (response.success && response.data) {
        setTeamMembers(response.data)
      } else if (Array.isArray(response)) {
        setTeamMembers(response)
      }
    } catch (err) {
      console.error('Failed to fetch team members:', err)
      setError('Failed to load team members')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    fetchTeamMembers()
    fetchGroups?.()
  }, [fetchTeamMembers, fetchGroups])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={styles.teamPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Team & Groups</h1>
          <p>Manage your firm's team members and groups</p>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.secondaryBtn}
            onClick={() => setShowGroupModal(true)}
          >
            <Shield size={18} />
            New Group
          </button>
          <button 
            className={styles.primaryBtn}
            onClick={() => setShowInviteModal(true)}
          >
            <UserPlus size={18} />
            Invite Member
          </button>
        </div>
      </div>

      {/* Team Members */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Team Members</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className={styles.count}>{teamMembers.length} members</span>
            <button 
              onClick={fetchTeamMembers} 
              className={styles.refreshBtn}
              disabled={loading}
              title="Refresh team members"
            >
              <RefreshCw size={14} className={loading ? styles.spinning : ''} />
            </button>
          </div>
        </div>

        {error && (
          <div className={styles.errorMessage}>
            {error}
            <button onClick={fetchTeamMembers}>Try again</button>
          </div>
        )}

        {loading && teamMembers.length === 0 ? (
          <div className={styles.loadingState}>Loading team members...</div>
        ) : teamMembers.length === 0 ? (
          <div className={styles.emptyState}>
            <Users size={48} />
            <h3>No team members yet</h3>
            <p>Invite your first team member to get started</p>
          </div>
        ) : (
          <div className={styles.membersGrid}>
            {teamMembers.map(member => {
              const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email
              const initials = member.firstName && member.lastName 
                ? `${member.firstName[0]}${member.lastName[0]}`
                : member.email?.[0]?.toUpperCase() || '?'
              
              return (
                <div key={member.id} className={clsx(styles.memberCard, !member.isActive && styles.inactive)}>
                  <div className={styles.memberAvatar}>
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt={fullName} />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className={styles.memberInfo}>
                    <h3>{fullName}</h3>
                    <p>{member.email}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={clsx(styles.roleBadge, styles[member.role])}>
                        {member.role}
                      </span>
                      {!member.isActive && (
                        <span className={clsx(styles.roleBadge, styles.inactive)}>Inactive</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.menuWrapper} ref={openDropdownId === member.id ? dropdownRef : null}>
                    <button 
                      className={styles.menuBtn}
                      onClick={() => setOpenDropdownId(openDropdownId === member.id ? null : member.id)}
                    >
                      <MoreVertical size={18} />
                    </button>
                    {openDropdownId === member.id && (
                      <div className={styles.dropdown}>
                        <button 
                          className={styles.dropdownItem}
                          onClick={() => {
                            setOpenDropdownId(null)
                            navigate(`/app/settings/team/${member.id}`)
                          }}
                        >
                          <Eye size={14} />
                          View Profile
                        </button>
                        <button 
                          className={styles.dropdownItem}
                          onClick={() => {
                            setOpenDropdownId(null)
                            navigate(`/app/settings/team/${member.id}/permissions`)
                          }}
                        >
                          <Key size={14} />
                          Edit Permissions
                        </button>
                        {member.role !== 'owner' && member.id !== user?.id && (
                          <>
                            <div className={styles.dropdownDivider} />
                            <button 
                              className={clsx(styles.dropdownItem, styles.danger)}
                              onClick={async () => {
                                if (confirm(`Are you sure you want to remove ${fullName} from the team?`)) {
                                  try {
                                    await teamApi.removeMember(member.id)
                                    fetchTeamMembers()
                                    setOpenDropdownId(null)
                                  } catch (err) {
                                    alert('Failed to remove team member')
                                  }
                                }
                              }}
                            >
                              <XCircle size={14} />
                              Remove from Team
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Groups */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Groups</h2>
          <span className={styles.count}>{groups.length} groups</span>
        </div>

        <div className={styles.groupsGrid}>
          {groups.map(group => (
            <div 
              key={group.id} 
              className={styles.groupCard}
              style={{ borderLeftColor: group.color }}
            >
              <div className={styles.groupHeader}>
                <div 
                  className={styles.groupColor}
                  style={{ background: group.color }}
                />
                <h3>{group.name}</h3>
              </div>
              <p className={styles.groupDesc}>{group.description}</p>
              <div className={styles.groupMeta}>
                <span className={styles.memberCount}>
                  <Users size={14} />
                  {group.memberIds.length} members
                </span>
                <span className={styles.permCount}>
                  {group.permissions.length} permissions
                </span>
              </div>
              <div className={styles.groupActions}>
                <button onClick={() => setEditingGroup(group)}><Edit2 size={14} /> Edit</button>
                <button 
                  className={styles.deleteBtn}
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete the group "${group.name}"?`)) {
                      deleteGroup(group.id)
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {showInviteModal && (
        <InviteModal onClose={() => setShowInviteModal(false)} />
      )}

      {showGroupModal && (
        <GroupModal 
          onClose={() => setShowGroupModal(false)}
          onSave={(data) => {
            addGroup(data)
            setShowGroupModal(false)
          }}
        />
      )}

      {editingGroup && (
        <GroupModal 
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSave={(data) => {
            updateGroup(editingGroup.id, data)
            setEditingGroup(null)
          }}
        />
      )}
    </div>
  )
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState({
    email: '',
    role: 'attorney',
    groups: [] as string[]
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // In a real app, this would send an invitation
    onClose()
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Invite Team Member</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="colleague@lawfirm.com"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({...formData, role: e.target.value})}
            >
              <option value="admin">Admin</option>
              <option value="attorney">Attorney</option>
              <option value="paralegal">Paralegal</option>
              <option value="staff">Staff</option>
            </select>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn}>
              <Mail size={16} />
              Send Invitation
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function GroupModal({ group, onClose, onSave }: { group?: any; onClose: () => void; onSave: (data: any) => void }) {
  const isEditing = !!group
  const [formData, setFormData] = useState({
    name: group?.name || '',
    description: group?.description || '',
    color: group?.color || '#3B82F6',
    memberIds: group?.memberIds || [],
    permissions: group?.permissions || ['matters:view', 'documents:view']
  })

  const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899']

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{isEditing ? 'Edit Group' : 'Create Group'}</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Group Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., Litigation Team"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Brief description of this group"
              rows={2}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Color</label>
            <div className={styles.colorPicker}>
              {colors.map(color => (
                <button
                  key={color}
                  type="button"
                  className={clsx(styles.colorOption, formData.color === color && styles.selected)}
                  style={{ background: color }}
                  onClick={() => setFormData({...formData, color})}
                />
              ))}
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn}>
              {isEditing ? 'Save Changes' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
