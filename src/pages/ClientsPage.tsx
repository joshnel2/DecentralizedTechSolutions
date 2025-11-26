import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { Plus, Search, Users, Building2, User, MoreVertical, Sparkles } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './ListPages.module.css'

export function ClientsPage() {
  const { clients, matters, addClient } = useDataStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showNewModal, setShowNewModal] = useState(false)

  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      const matchesSearch = 
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.email.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || client.status === statusFilter
      const matchesType = typeFilter === 'all' || client.type === typeFilter
      return matchesSearch && matchesStatus && matchesType
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
        <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
          <Plus size={18} />
          New Client
        </button>
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
            {filteredClients.map(client => (
              <tr key={client.id}>
                <td>
                  <Link to={`/clients/${client.id}`} className={styles.nameCell}>
                    <div className={styles.icon}>
                      {client.type === 'organization' ? <Building2 size={16} /> : <User size={16} />}
                    </div>
                    <div>
                      <span className={styles.name}>{client.name}</span>
                      <span className={styles.subtitle}>{client.city}, {client.state}</span>
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
                    {client.type}
                  </span>
                </td>
                <td>
                  <span className={clsx(styles.statusBadge, styles[client.status])}>
                    {client.status}
                  </span>
                </td>
                <td>{getMatterCount(client.id)}</td>
                <td className={styles.dateCell}>
                  {format(parseISO(client.createdAt), 'MMM d, yyyy')}
                </td>
                <td>
                  <button className={styles.menuBtn}>
                    <MoreVertical size={16} />
                  </button>
                </td>
              </tr>
            ))}
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
          onSave={(data) => {
            addClient(data)
            setShowNewModal(false)
          }}
        />
      )}
    </div>
  )
}

function NewClientModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({
    type: 'individual',
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    notes: '',
    tags: [],
    status: 'active'
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
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
              onChange={(e) => setFormData({...formData, type: e.target.value})}
            >
              <option value="individual">Individual</option>
              <option value="organization">Organization</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>{formData.type === 'organization' ? 'Organization Name' : 'Full Name'}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder={formData.type === 'organization' ? 'Company Name, LLC' : 'John Smith'}
              required
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="email@example.com"
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                placeholder="(555) 555-0100"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              placeholder="123 Main Street"
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({...formData, city: e.target.value})}
                placeholder="New York"
              />
            </div>
            <div className={styles.formGroup}>
              <label>State</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({...formData, state: e.target.value})}
                placeholder="NY"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Additional notes about the client"
              rows={3}
            />
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn}>
              Create Client
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
