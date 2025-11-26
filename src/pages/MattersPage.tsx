import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { 
  Plus, Search, Filter, ChevronDown, Briefcase, 
  MoreVertical, Sparkles, Calendar, DollarSign, Users
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './ListPages.module.css'

const statusOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'intake', label: 'Intake' },
  { value: 'pending', label: 'Pending' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'closed_won', label: 'Closed - Won' },
  { value: 'closed_lost', label: 'Closed - Lost' },
  { value: 'closed_settled', label: 'Closed - Settled' }
]

const typeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'litigation', label: 'Litigation' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'intellectual_property', label: 'IP' },
  { value: 'employment', label: 'Employment' },
  { value: 'personal_injury', label: 'Personal Injury' },
  { value: 'estate_planning', label: 'Estate Planning' },
  { value: 'other', label: 'Other' }
]

export function MattersPage() {
  const { matters, clients, addMatter } = useDataStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showNewModal, setShowNewModal] = useState(false)

  const filteredMatters = useMemo(() => {
    return matters.filter(matter => {
      const matchesSearch = 
        matter.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        matter.number.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || matter.status === statusFilter
      const matchesType = typeFilter === 'all' || matter.type === typeFilter
      return matchesSearch && matchesStatus && matchesType
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [matters, searchQuery, statusFilter, typeFilter])

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Unknown Client'
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Matters</h1>
          <span className={styles.count}>{matters.length} total</span>
        </div>
        <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
          <Plus size={18} />
          New Matter
        </button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search matters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className={styles.filterSelect}
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select 
          value={typeFilter} 
          onChange={(e) => setTypeFilter(e.target.value)}
          className={styles.filterSelect}
        >
          {typeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Matter</th>
              <th>Client</th>
              <th>Type</th>
              <th>Status</th>
              <th>Billing</th>
              <th>Opened</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredMatters.map(matter => (
              <tr key={matter.id}>
                <td>
                  <Link to={`/app/matters/${matter.id}`} className={styles.nameCell}>
                    <div className={styles.icon}>
                      <Briefcase size={16} />
                    </div>
                    <div>
                      <span className={styles.name}>{matter.name}</span>
                      <span className={styles.subtitle}>{matter.number}</span>
                    </div>
                    {matter.aiSummary && (
                      <span className={styles.aiTag}>
                        <Sparkles size={12} />
                      </span>
                    )}
                  </Link>
                </td>
                <td>
                  <Link to={`/app/clients/${matter.clientId}`} className={styles.link}>
                    {getClientName(matter.clientId)}
                  </Link>
                </td>
                <td>
                  <span className={styles.typeTag}>
                    {matter.type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <span className={clsx(styles.statusBadge, styles[matter.status])}>
                    {matter.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <div className={styles.billingInfo}>
                    {matter.billingType === 'hourly' && (
                      <>${matter.billingRate}/hr</>
                    )}
                    {matter.billingType === 'flat' && (
                      <>${matter.flatFee?.toLocaleString()} flat</>
                    )}
                    {matter.billingType === 'contingency' && (
                      <>{matter.contingencyPercent}% contingency</>
                    )}
                    {matter.billingType === 'retainer' && (
                      <>${matter.retainerAmount?.toLocaleString()} retainer</>
                    )}
                  </div>
                </td>
                <td className={styles.dateCell}>
                  {format(parseISO(matter.openDate), 'MMM d, yyyy')}
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

        {filteredMatters.length === 0 && (
          <div className={styles.emptyState}>
            <Briefcase size={48} />
            <h3>No matters found</h3>
            <p>Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* New Matter Modal */}
      {showNewModal && (
        <NewMatterModal 
          onClose={() => setShowNewModal(false)}
          onSave={(data) => {
            addMatter(data)
            setShowNewModal(false)
          }}
          clients={clients}
        />
      )}
    </div>
  )
}

interface NewMatterModalProps {
  onClose: () => void
  onSave: (data: any) => void
  clients: any[]
}

function NewMatterModal({ onClose, onSave, clients }: NewMatterModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    clientId: clients[0]?.id || '',
    type: 'litigation',
    status: 'intake',
    priority: 'medium',
    billingType: 'hourly',
    billingRate: 450,
    assignedTo: [],
    responsibleAttorney: 'user-1',
    openDate: new Date().toISOString(),
    tags: []
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>New Matter</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Matter Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="Enter matter name"
              required
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Client</label>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({...formData, clientId: e.target.value})}
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
              >
                {typeOptions.slice(1).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Billing Type</label>
              <select
                value={formData.billingType}
                onChange={(e) => setFormData({...formData, billingType: e.target.value})}
              >
                <option value="hourly">Hourly</option>
                <option value="flat">Flat Fee</option>
                <option value="contingency">Contingency</option>
                <option value="retainer">Retainer</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Rate/Amount</label>
              <input
                type="number"
                value={formData.billingRate}
                onChange={(e) => setFormData({...formData, billingRate: Number(e.target.value)})}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Brief description of the matter"
              rows={3}
            />
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn}>
              Create Matter
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
