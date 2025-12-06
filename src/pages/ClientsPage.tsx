import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAIChat } from '../contexts/AIChatContext'
import { Plus, Search, Users, Building2, User, MoreVertical, Sparkles, Eye, Edit2, Trash2, Archive } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './ListPages.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'

export function ClientsPage() {
  const { clients, matters, addClient, updateClient, deleteClient, fetchClients, fetchMatters } = useDataStore()
  const { openChat } = useAIChat()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  // Fetch data when component mounts
  useEffect(() => {
    fetchClients()
    fetchMatters()
  }, [])
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showNewModal, setShowNewModal] = useState(false)
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    clientId: string
    clientName: string
    action: 'delete' | 'deactivate' | 'activate'
  }>({ isOpen: false, clientId: '', clientName: '', action: 'delete' })

  const handleConfirmAction = async () => {
    const { action, clientId } = confirmModal
    
    try {
      if (action === 'delete') {
        await deleteClient(clientId)
      } else {
        await updateClient(clientId, { isActive: action === 'activate' })
      }
      setConfirmModal({ isOpen: false, clientId: '', clientName: '', action: 'delete' })
      setOpenDropdownId(null)
      fetchClients()
    } catch (error) {
      console.error(`Failed to ${action} client:`, error)
      alert(`Failed to ${action} client`)
    }
  }

  const getConfirmModalContent = () => {
    const { action, clientName } = confirmModal
    switch (action) {
      case 'delete':
        return {
          title: 'Delete Client',
          message: `Are you sure you want to delete "${clientName}"? This action cannot be undone and will remove all associated data.`,
          confirmText: 'Delete Client',
          type: 'danger' as const
        }
      case 'deactivate':
        return {
          title: 'Deactivate Client',
          message: `Are you sure you want to deactivate "${clientName}"? The client will be marked as inactive.`,
          confirmText: 'Deactivate',
          type: 'warning' as const
        }
      case 'activate':
        return {
          title: 'Activate Client',
          message: `Are you sure you want to activate "${clientName}"? The client will be marked as active.`,
          confirmText: 'Activate',
          type: 'success' as const
        }
      default:
        return {
          title: 'Confirm Action',
          message: 'Are you sure you want to proceed?',
          confirmText: 'Confirm',
          type: 'info' as const
        }
    }
  }

  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      const clientName = client.name || client.displayName || ''
      const matchesSearch = 
        clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (client.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      const clientStatus = client.isActive !== false ? 'active' : 'inactive'
      const matchesStatus = statusFilter === 'all' || clientStatus === statusFilter
      const matchesType = typeFilter === 'all' || 
        (typeFilter === 'individual' && client.type === 'person') ||
        (typeFilter === 'organization' && client.type === 'company')
      return matchesSearch && matchesStatus && matchesType
    }).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  }, [clients, searchQuery, statusFilter, typeFilter])

  const getMatterCount = (clientId: string) => {
    return matters.filter(m => m.clientId === clientId).length
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Clients</h1>
          <span className={styles.count}>{clients.length} total</span>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.aiBtn} 
            onClick={() => openChat({
              label: 'Clients',
              contextType: 'clients',
              suggestedQuestions: [
                'Give me an overview of all clients',
                'Which clients have the most active matters?',
                'Analyze client billing and revenue',
                'Which clients need follow-up?',
                'Summarize client acquisition trends'
              ]
            })}
          >
            <Sparkles size={16} />
            AI Insights
          </button>
          <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
            <Plus size={18} />
            New Client
          </button>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="prospective">Prospective</option>
        </select>

        <select 
          value={typeFilter} 
          onChange={(e) => setTypeFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="all">All Types</option>
          <option value="individual">Individual</option>
          <option value="organization">Organization</option>
        </select>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Client</th>
              <th>Contact</th>
              <th>Type</th>
              <th>Status</th>
              <th>Matters</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => {
              const clientStatus = client.isActive ? 'active' : 'inactive'
              return (
              <tr key={client.id}>
                <td>
                  <Link to={`/app/clients/${client.id}`} className={styles.nameCell}>
                    <div className={styles.icon}>
                      {client.type === 'company' ? <Building2 size={16} /> : <User size={16} />}
                    </div>
                    <div>
                      <span className={styles.name}>{client.name}</span>
                      <span className={styles.subtitle}>{client.addressCity}, {client.addressState}</span>
                    </div>
                  </Link>
                </td>
                <td>
                  <div>
                    <span className={styles.name}>{client.email}</span>
                    <span className={styles.subtitle}>{client.phone}</span>
                  </div>
                </td>
                <td>
                  <span className={styles.typeTag}>
                    {client.type === 'company' ? 'Organization' : 'Individual'}
                  </span>
                </td>
                <td>
                  <span className={clsx(styles.statusBadge, styles[clientStatus])}>
                    {clientStatus}
                  </span>
                </td>
                <td>{getMatterCount(client.id)}</td>
                <td className={styles.dateCell}>
                  {format(parseISO(client.createdAt), 'MMM d, yyyy')}
                </td>
                <td>
                  <div className={styles.menuWrapper} ref={openDropdownId === client.id ? dropdownRef : null}>
                    <button 
                      className={styles.menuBtn}
                      onClick={() => setOpenDropdownId(openDropdownId === client.id ? null : client.id)}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openDropdownId === client.id && (
                      <div className={styles.dropdown}>
                        <button 
                          className={styles.dropdownItem}
                          onClick={() => {
                            setOpenDropdownId(null)
                            navigate(`/app/clients/${client.id}`)
                          }}
                        >
                          <Eye size={14} />
                          View Details
                        </button>
                        <button 
                          className={styles.dropdownItem}
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              clientId: client.id,
                              clientName: client.name,
                              action: client.isActive ? 'deactivate' : 'activate'
                            })
                            setOpenDropdownId(null)
                          }}
                        >
                          <Archive size={14} />
                          {client.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <div className={styles.dropdownDivider} />
                        <button 
                          className={clsx(styles.dropdownItem, styles.danger)}
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              clientId: client.id,
                              clientName: client.name,
                              action: 'delete'
                            })
                            setOpenDropdownId(null)
                          }}
                        >
                          <Trash2 size={14} />
                          Delete Client
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>

        {filteredClients.length === 0 && (
          <div className={styles.emptyState}>
            <Users size={48} />
            <h3>No clients found</h3>
            <p>Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {showNewModal && (
        <NewClientModal 
          onClose={() => setShowNewModal(false)}
          onSave={async (data) => {
            try {
              await addClient(data)
              setShowNewModal(false)
              fetchClients()
            } catch (error) {
              console.error('Failed to create client:', error)
              alert('Failed to create client. Please try again.')
            }
          }}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, clientId: '', clientName: '', action: 'delete' })}
        onConfirm={handleConfirmAction}
        {...getConfirmModalContent()}
      />
    </div>
  )
}

function NewClientModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => Promise<void> }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    type: 'person' as 'person' | 'company',
    displayName: '',
    name: '',
    email: '',
    phone: '',
    addressStreet: '',
    addressCity: '',
    addressState: '',
    addressZip: '',
    notes: '',
    tags: [] as string[],
    contactType: 'client' as const,
    isActive: true
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        displayName: formData.name,
        email: formData.email || undefined, // Make email optional
        phone: formData.phone || undefined
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>New Client</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Client Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value as 'person' | 'company'})}
            >
              <option value="person">Individual</option>
              <option value="company">Organization</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>{formData.type === 'company' ? 'Organization Name' : 'Full Name'} (optional)</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder={formData.type === 'company' ? 'Company Name, LLC' : 'John Smith'}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Email (optional)</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="email@example.com"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Phone (optional)</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                placeholder="(555) 555-0100"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Address (optional)</label>
            <input
              type="text"
              value={formData.addressStreet}
              onChange={(e) => setFormData({...formData, addressStreet: e.target.value})}
              placeholder="123 Main Street"
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>City (optional)</label>
              <input
                type="text"
                value={formData.addressCity}
                onChange={(e) => setFormData({...formData, addressCity: e.target.value})}
                placeholder="New York"
              />
            </div>
            <div className={styles.formGroup}>
              <label>State (optional)</label>
              <input
                type="text"
                value={formData.addressState}
                onChange={(e) => setFormData({...formData, addressState: e.target.value})}
                placeholder="NY"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Notes (optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Additional notes about the client"
              rows={3}
            />
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
