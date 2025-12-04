import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../services/api'
import { 
  Building2, Users, Plus, Edit, Trash2, Search, 
  ChevronRight, BarChart3, FileText, Clock, X,
  Shield, Eye, EyeOff, ArrowLeft
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './AdminPortalPage.module.css'

interface Firm {
  id: string
  name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zipCode: string
  website: string
  userCount: number
  matterCount: number
  clientCount: number
  createdAt: string
}

interface User {
  id: string
  firmId: string
  firmName: string
  email: string
  firstName: string
  lastName: string
  role: string
  phone: string
  hourlyRate: number
  isActive: boolean
  createdAt: string
}

interface Stats {
  total_firms: number
  total_users: number
  active_users: number
  total_matters: number
  total_clients: number
  total_documents: number
  total_time_entries: number
}

export function AdminPortalPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'overview' | 'firms' | 'users'>('overview')
  const [firms, setFirms] = useState<Firm[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFirmId, setSelectedFirmId] = useState<string | null>(null)
  
  // Modal states
  const [showFirmModal, setShowFirmModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingFirm, setEditingFirm] = useState<Firm | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsRes, firmsRes, usersRes] = await Promise.all([
        adminApi.getStats(),
        adminApi.getFirms(),
        adminApi.getUsers()
      ])
      setStats(statsRes)
      setFirms(firmsRes.firms || [])
      setUsers(usersRes.users || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data. You may not have admin access.')
    } finally {
      setLoading(false)
    }
  }

  const filteredFirms = firms.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFirm = !selectedFirmId || u.firmId === selectedFirmId
    return matchesSearch && matchesFirm
  })

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading admin portal...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.error}>
        <Shield size={48} />
        <h2>Access Denied</h2>
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className={styles.adminPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Shield size={28} />
          <div>
            <h1>Admin Portal</h1>
            <p>Manage firms and users across the platform</p>
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button 
          className={clsx(styles.tab, activeTab === 'overview' && styles.active)}
          onClick={() => setActiveTab('overview')}
        >
          <BarChart3 size={18} />
          Overview
        </button>
        <button 
          className={clsx(styles.tab, activeTab === 'firms' && styles.active)}
          onClick={() => setActiveTab('firms')}
        >
          <Building2 size={18} />
          Firms ({firms.length})
        </button>
        <button 
          className={clsx(styles.tab, activeTab === 'users' && styles.active)}
          onClick={() => setActiveTab('users')}
        >
          <Users size={18} />
          Users ({users.length})
        </button>
      </div>

      {activeTab === 'overview' && stats && (
        <div className={styles.overview}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <Building2 size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_firms}</span>
                <span className={styles.statLabel}>Total Firms</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <Users size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_users}</span>
                <span className={styles.statLabel}>Total Users</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <Users size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.active_users}</span>
                <span className={styles.statLabel}>Active Users</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <FileText size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_matters}</span>
                <span className={styles.statLabel}>Total Matters</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <Users size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_clients}</span>
                <span className={styles.statLabel}>Total Clients</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <FileText size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_documents}</span>
                <span className={styles.statLabel}>Documents</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <Clock size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_time_entries}</span>
                <span className={styles.statLabel}>Time Entries</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'firms' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Search firms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className={styles.addBtn} onClick={() => { setEditingFirm(null); setShowFirmModal(true) }}>
              <Plus size={18} />
              Add Firm
            </button>
          </div>

          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>Firm Name</th>
                  <th>Contact</th>
                  <th>Users</th>
                  <th>Matters</th>
                  <th>Clients</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFirms.map(firm => (
                  <tr key={firm.id}>
                    <td>
                      <div className={styles.firmName}>
                        <Building2 size={16} />
                        <span>{firm.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.contact}>
                        {firm.email && <span>{firm.email}</span>}
                        {firm.phone && <span>{firm.phone}</span>}
                      </div>
                    </td>
                    <td>{firm.userCount}</td>
                    <td>{firm.matterCount}</td>
                    <td>{firm.clientCount}</td>
                    <td>{format(parseISO(firm.createdAt), 'MMM d, yyyy')}</td>
                    <td>
                      <div className={styles.actions}>
                        <button onClick={() => { setEditingFirm(firm); setShowFirmModal(true) }} title="Edit">
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => { setSelectedFirmId(firm.id); setActiveTab('users') }} 
                          title="View Users"
                        >
                          <Users size={16} />
                        </button>
                        <button 
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteFirm(firm.id)}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select 
              value={selectedFirmId || ''} 
              onChange={(e) => setSelectedFirmId(e.target.value || null)}
              className={styles.firmFilter}
            >
              <option value="">All Firms</option>
              {firms.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button className={styles.addBtn} onClick={() => { setEditingUser(null); setShowUserModal(true) }}>
              <Plus size={18} />
              Add User
            </button>
          </div>

          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Firm</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td>{user.firstName} {user.lastName}</td>
                    <td>{user.email}</td>
                    <td>{user.firmName}</td>
                    <td>
                      <span className={clsx(styles.roleBadge, styles[user.role])}>
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <span className={clsx(styles.statusBadge, user.isActive ? styles.active : styles.inactive)}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{format(parseISO(user.createdAt), 'MMM d, yyyy')}</td>
                    <td>
                      <div className={styles.actions}>
                        <button onClick={() => { setEditingUser(user); setShowUserModal(true) }} title="Edit">
                          <Edit size={16} />
                        </button>
                        <button 
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteUser(user.id)}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Firm Modal */}
      {showFirmModal && (
        <FirmModal
          firm={editingFirm}
          onClose={() => setShowFirmModal(false)}
          onSave={async (data) => {
            if (editingFirm) {
              await adminApi.updateFirm(editingFirm.id, data)
            } else {
              await adminApi.createFirm(data)
            }
            loadData()
            setShowFirmModal(false)
          }}
        />
      )}

      {/* User Modal */}
      {showUserModal && (
        <UserModal
          user={editingUser}
          firms={firms}
          onClose={() => setShowUserModal(false)}
          onSave={async (data) => {
            if (editingUser) {
              await adminApi.updateUser(editingUser.id, data)
            } else {
              await adminApi.createUser(data)
            }
            loadData()
            setShowUserModal(false)
          }}
        />
      )}
    </div>
  )

  async function handleDeleteFirm(id: string) {
    if (!confirm('Are you sure you want to delete this firm? This will delete all users, matters, clients, and data associated with this firm.')) {
      return
    }
    try {
      await adminApi.deleteFirm(id)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete firm')
    }
  }

  async function handleDeleteUser(id: string) {
    if (!confirm('Are you sure you want to delete this user?')) {
      return
    }
    try {
      await adminApi.deleteUser(id)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete user')
    }
  }
}

// Firm Modal Component
function FirmModal({ firm, onClose, onSave }: { 
  firm: Firm | null
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [formData, setFormData] = useState({
    name: firm?.name || '',
    email: firm?.email || '',
    phone: firm?.phone || '',
    address: firm?.address || '',
    city: firm?.city || '',
    state: firm?.state || '',
    zipCode: firm?.zipCode || '',
    website: firm?.website || ''
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(formData)
    } catch (err: any) {
      alert(err.message || 'Failed to save firm')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{firm ? 'Edit Firm' : 'Add New Firm'}</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Firm Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Website</label>
              <input
                type="text"
                value={formData.website}
                onChange={e => setFormData({ ...formData, website: e.target.value })}
              />
            </div>
            <div className={styles.formGroup + ' ' + styles.fullWidth}>
              <label>Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>City</label>
              <input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>State</label>
              <input
                type="text"
                value={formData.state}
                onChange={e => setFormData({ ...formData, state: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>ZIP Code</label>
              <input
                type="text"
                value={formData.zipCode}
                onChange={e => setFormData({ ...formData, zipCode: e.target.value })}
              />
            </div>
          </div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : (firm ? 'Update Firm' : 'Create Firm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// User Modal Component
function UserModal({ user, firms, onClose, onSave }: { 
  user: User | null
  firms: Firm[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [formData, setFormData] = useState({
    firmId: user?.firmId || '',
    email: user?.email || '',
    password: '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    role: user?.role || 'staff',
    phone: user?.phone || '',
    hourlyRate: user?.hourlyRate?.toString() || '',
    isActive: user?.isActive ?? true
  })
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data: any = { ...formData }
      if (data.hourlyRate) data.hourlyRate = parseFloat(data.hourlyRate)
      if (!data.password) delete data.password
      await onSave(data)
    } catch (err: any) {
      alert(err.message || 'Failed to save user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{user ? 'Edit User' : 'Add New User'}</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup + ' ' + styles.fullWidth}>
              <label>Firm *</label>
              <select
                value={formData.firmId}
                onChange={e => setFormData({ ...formData, firmId: e.target.value })}
                required
                disabled={!!user}
              >
                <option value="">Select a firm</option>
                {firms.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>First Name *</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Last Name *</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>{user ? 'New Password (leave blank to keep)' : 'Password *'}</label>
              <div className={styles.passwordInput}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  required={!user}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Role</label>
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="attorney">Attorney</option>
                <option value="paralegal">Paralegal</option>
                <option value="staff">Staff</option>
                <option value="billing">Billing</option>
                <option value="readonly">Read Only</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Hourly Rate</label>
              <input
                type="number"
                step="0.01"
                value={formData.hourlyRate}
                onChange={e => setFormData({ ...formData, hourlyRate: e.target.value })}
              />
            </div>
            {user && (
              <div className={styles.formGroup}>
                <label>Status</label>
                <select
                  value={formData.isActive ? 'active' : 'inactive'}
                  onChange={e => setFormData({ ...formData, isActive: e.target.value === 'active' })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
          </div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : (user ? 'Update User' : 'Create User')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
