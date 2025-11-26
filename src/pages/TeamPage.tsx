import { useState } from 'react'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { 
  Plus, Users, UserPlus, Shield, Trash2, Edit2,
  Mail, MoreVertical
} from 'lucide-react'
import { clsx } from 'clsx'
import styles from './TeamPage.module.css'

const teamMembers = [
  { id: 'user-1', name: 'Alexandra Chen', email: 'admin@apex.law', role: 'owner', status: 'active' },
  { id: 'user-2', name: 'Marcus Williams', email: 'm.williams@apex.law', role: 'attorney', status: 'active' },
  { id: 'user-3', name: 'Sarah Johnson', email: 's.johnson@apex.law', role: 'paralegal', status: 'active' },
  { id: 'user-4', name: 'David Park', email: 'd.park@apex.law', role: 'staff', status: 'active' }
]

export function TeamPage() {
  const { groups, addGroup, updateGroup, deleteGroup } = useDataStore()
  const { user } = useAuthStore()
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)

  return (
    <div className={styles.teamPage}>
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
          <span className={styles.count}>{teamMembers.length} members</span>
        </div>

        <div className={styles.membersGrid}>
          {teamMembers.map(member => (
            <div key={member.id} className={styles.memberCard}>
              <div className={styles.memberAvatar}>
                {member.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className={styles.memberInfo}>
                <h3>{member.name}</h3>
                <p>{member.email}</p>
                <span className={clsx(styles.roleBadge, styles[member.role])}>
                  {member.role}
                </span>
              </div>
              <button className={styles.menuBtn}>
                <MoreVertical size={18} />
              </button>
            </div>
          ))}
        </div>
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
                <button><Edit2 size={14} /> Edit</button>
                <button 
                  className={styles.deleteBtn}
                  onClick={() => deleteGroup(group.id)}
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

function GroupModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    memberIds: [],
    permissions: ['matters:view', 'documents:view']
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
          <h2>Create Group</h2>
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
              Create Group
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
