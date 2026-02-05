/**
 * BulkPermissionsPage
 * Admin-only page for bulk editing matter permissions
 * Accessible from Settings
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { mattersApi } from '../services/api'
import {
  ArrowLeft, Shield, Globe, Lock, Search,
  CheckSquare, Square, Loader2, AlertCircle, Check
} from 'lucide-react'
import { clsx } from 'clsx'
import styles from './BulkPermissionsPage.module.css'

interface MatterItem {
  id: string
  number: string
  name: string
  clientName: string | null
  visibility: 'firm_wide' | 'restricted'
  responsibleAttorneyName: string | null
}

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface Group {
  id: string
  name: string
  color: string
  memberCount: number
}

export function BulkPermissionsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Data
  const [matters, setMatters] = useState<MatterItem[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  
  // Selection
  const [selectedMatterIds, setSelectedMatterIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'firm_wide' | 'restricted'>('all')
  
  // Action form
  const [action, setAction] = useState<'visibility' | 'add_user' | 'add_group' | 'remove_user' | 'remove_group'>('visibility')
  const [newVisibility, setNewVisibility] = useState<'firm_wide' | 'restricted'>('firm_wide')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')

  // Check admin access
  useEffect(() => {
    if (user && !['owner', 'admin'].includes(user.role)) {
      navigate('/app/settings')
    }
  }, [user, navigate])

  // Load data
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      
      const [mattersResult, usersResult, groupsResult] = await Promise.all([
        mattersApi.getAll(),
        mattersApi.getAvailableUsers(),
        mattersApi.getAvailableGroups()
      ])
      
      setMatters(mattersResult.matters || [])
      setUsers(usersResult.users || [])
      setGroups(groupsResult.groups || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // Filter matters
  const filteredMatters = matters.filter(m => {
    const matchesSearch = !searchQuery || 
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.clientName?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    
    const matchesVisibility = visibilityFilter === 'all' || m.visibility === visibilityFilter
    
    return matchesSearch && matchesVisibility
  })

  function toggleMatterSelection(id: string) {
    setSelectedMatterIds(prev => 
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  function toggleSelectAll() {
    if (selectedMatterIds.length === filteredMatters.length) {
      setSelectedMatterIds([])
    } else {
      setSelectedMatterIds(filteredMatters.map(m => m.id))
    }
  }

  async function handleApplyAction() {
    if (selectedMatterIds.length === 0) {
      setError('Please select at least one matter')
      return
    }

    try {
      setProcessing(true)
      setError(null)
      setSuccess(null)

      const requestData: any = {
        matterIds: selectedMatterIds,
      }

      if (action === 'visibility') {
        requestData.visibility = newVisibility
        requestData.action = 'add'
      } else if (action === 'add_user') {
        if (!selectedUserId) {
          setError('Please select a user')
          return
        }
        requestData.action = 'add'
        requestData.userId = selectedUserId
      } else if (action === 'add_group') {
        if (!selectedGroupId) {
          setError('Please select a group')
          return
        }
        requestData.action = 'add'
        requestData.groupId = selectedGroupId
      } else if (action === 'remove_user') {
        if (!selectedUserId) {
          setError('Please select a user')
          return
        }
        requestData.action = 'remove'
        requestData.userId = selectedUserId
      } else if (action === 'remove_group') {
        if (!selectedGroupId) {
          setError('Please select a group')
          return
        }
        requestData.action = 'remove'
        requestData.groupId = selectedGroupId
      }

      const result = await mattersApi.bulkUpdatePermissions(requestData)
      
      setSuccess(`Updated ${result.results.success} matter${result.results.success !== 1 ? 's' : ''} successfully`)
      setSelectedMatterIds([])
      
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to apply bulk action')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <Loader2 className={styles.spinner} size={32} />
          <span>Loading matters...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/app/settings')}>
          <ArrowLeft size={18} />
          Back to Settings
        </button>
        <div className={styles.headerContent}>
          <h1>
            <Shield size={28} />
            Bulk Edit Permissions
          </h1>
          <p>Update visibility and permissions for multiple matters at once</p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className={styles.error}>
          <AlertCircle size={18} />
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      {success && (
        <div className={styles.success}>
          <Check size={18} />
          {success}
          <button onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      <div className={styles.content}>
        {/* Left panel - Matter selection */}
        <div className={styles.mattersPanel}>
          <div className={styles.panelHeader}>
            <h2>Select Matters</h2>
            <span className={styles.selectionCount}>
              {selectedMatterIds.length} of {filteredMatters.length} selected
            </span>
          </div>

          {/* Filters */}
          <div className={styles.filters}>
            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search matters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value as any)}
              className={styles.filterSelect}
            >
              <option value="all">All Visibility</option>
              <option value="firm_wide">Firm Wide Only</option>
              <option value="restricted">Restricted Only</option>
            </select>
          </div>

          {/* Select all */}
          <button 
            className={styles.selectAllBtn}
            onClick={toggleSelectAll}
          >
            {selectedMatterIds.length === filteredMatters.length && filteredMatters.length > 0 ? (
              <CheckSquare size={18} />
            ) : (
              <Square size={18} />
            )}
            {selectedMatterIds.length === filteredMatters.length && filteredMatters.length > 0
              ? 'Deselect All'
              : 'Select All'}
          </button>

          {/* Matter list */}
          <div className={styles.matterList}>
            {filteredMatters.length === 0 ? (
              <div className={styles.emptyList}>
                No matters match your filters
              </div>
            ) : (
              filteredMatters.map((matter) => (
                <label 
                  key={matter.id}
                  className={clsx(
                    styles.matterItem,
                    selectedMatterIds.includes(matter.id) && styles.selected
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedMatterIds.includes(matter.id)}
                    onChange={() => toggleMatterSelection(matter.id)}
                  />
                  <div className={styles.matterInfo}>
                    <span className={styles.matterNumber}>{matter.number}</span>
                    <span className={styles.matterName}>{matter.name}</span>
                    {matter.clientName && (
                      <span className={styles.matterClient}>{matter.clientName}</span>
                    )}
                  </div>
                  <span className={clsx(
                    styles.visibilityBadge,
                    matter.visibility === 'restricted' && styles.restricted
                  )}>
                    {matter.visibility === 'firm_wide' ? (
                      <><Globe size={12} /> Firm Wide</>
                    ) : (
                      <><Lock size={12} /> Restricted</>
                    )}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Right panel - Actions */}
        <div className={styles.actionsPanel}>
          <div className={styles.panelHeader}>
            <h2>Bulk Action</h2>
          </div>

          <div className={styles.actionForm}>
            <div className={styles.formGroup}>
              <label>Action Type</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as any)}
                className={styles.select}
              >
                <option value="visibility">Change Visibility</option>
                <option value="add_user">Add User to Matters</option>
                <option value="add_group">Add Group to Matters</option>
                <option value="remove_user">Remove User from Matters</option>
                <option value="remove_group">Remove Group from Matters</option>
              </select>
            </div>

            {action === 'visibility' && (
              <div className={styles.formGroup}>
                <label>New Visibility</label>
                <div className={styles.visibilityOptions}>
                  <button
                    type="button"
                    className={clsx(
                      styles.visibilityOption,
                      newVisibility === 'firm_wide' && styles.active
                    )}
                    onClick={() => setNewVisibility('firm_wide')}
                  >
                    <Globe size={18} />
                    <span>Firm Wide</span>
                  </button>
                  <button
                    type="button"
                    className={clsx(
                      styles.visibilityOption,
                      newVisibility === 'restricted' && styles.active
                    )}
                    onClick={() => setNewVisibility('restricted')}
                  >
                    <Lock size={18} />
                    <span>Restricted</span>
                  </button>
                </div>
              </div>
            )}

            {(action === 'add_user' || action === 'remove_user') && (
              <div className={styles.formGroup}>
                <label>Select User</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className={styles.select}
                >
                  <option value="">Choose a user...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(action === 'add_group' || action === 'remove_group') && (
              <div className={styles.formGroup}>
                <label>Select Group</label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className={styles.select}
                >
                  <option value="">Choose a group...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.memberCount} members)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              className={styles.applyBtn}
              onClick={handleApplyAction}
              disabled={processing || selectedMatterIds.length === 0}
            >
              {processing ? (
                <>
                  <Loader2 className={styles.spinner} size={18} />
                  Processing...
                </>
              ) : (
                <>
                  <Shield size={18} />
                  Apply to {selectedMatterIds.length} Matter{selectedMatterIds.length !== 1 ? 's' : ''}
                </>
              )}
            </button>

            <div className={styles.infoBox}>
              <AlertCircle size={16} />
              <p>
                {action === 'visibility' && (
                  <>Changing visibility to <strong>{newVisibility === 'firm_wide' ? 'Firm Wide' : 'Restricted'}</strong> will update all selected matters.</>
                )}
                {action === 'add_user' && (
                  <>The selected user will be granted access to all selected restricted matters.</>
                )}
                {action === 'add_group' && (
                  <>All members of the selected group will be granted access to all selected restricted matters.</>
                )}
                {action === 'remove_user' && (
                  <>The selected user will lose access to all selected restricted matters (unless they are the responsible attorney).</>
                )}
                {action === 'remove_group' && (
                  <>The selected group will lose access to all selected restricted matters.</>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BulkPermissionsPage
