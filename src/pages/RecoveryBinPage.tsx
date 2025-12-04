import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Trash2, RotateCcw, Clock, User, Briefcase, FileText, Calendar,
  Search, Filter, CheckCircle2, AlertCircle, ChevronDown, ArrowLeft
} from 'lucide-react'
import { format, formatDistanceToNow, parseISO, subDays } from 'date-fns'
import { clsx } from 'clsx'
import styles from './RecoveryBinPage.module.css'

interface DeletedItem {
  id: string
  type: 'time_entry' | 'person' | 'company' | 'task' | 'calendar_entry' | 'document' | 'matter'
  name: string
  description?: string
  deletedAt: string
  deletedBy: string
  expiresAt: string
  relatedTo?: string
}

// Demo deleted items
const demoDeletedItems: DeletedItem[] = [
  {
    id: '1',
    type: 'time_entry',
    name: 'Research on patent filing requirements',
    description: '2.5 hours - Quantum Technologies vs. TechCorp',
    deletedAt: subDays(new Date(), 1).toISOString(),
    deletedBy: 'John Mitchell',
    expiresAt: subDays(new Date(), -29).toISOString(),
    relatedTo: 'MTR-2024-001'
  },
  {
    id: '2',
    type: 'document',
    name: 'Draft_Settlement_Agreement_v2.docx',
    description: 'Settlement negotiation draft',
    deletedAt: subDays(new Date(), 2).toISOString(),
    deletedBy: 'Sarah Chen',
    expiresAt: subDays(new Date(), -28).toISOString(),
    relatedTo: 'MTR-2024-003'
  },
  {
    id: '3',
    type: 'calendar_entry',
    name: 'Client Meeting - Anderson Family Trust',
    description: 'Estate planning discussion',
    deletedAt: subDays(new Date(), 3).toISOString(),
    deletedBy: 'Michael Roberts',
    expiresAt: subDays(new Date(), -27).toISOString()
  },
  {
    id: '4',
    type: 'task',
    name: 'Review discovery documents',
    description: 'High priority - Due 12/15/2024',
    deletedAt: subDays(new Date(), 5).toISOString(),
    deletedBy: 'Emily Davis',
    expiresAt: subDays(new Date(), -25).toISOString(),
    relatedTo: 'MTR-2024-002'
  },
  {
    id: '5',
    type: 'person',
    name: 'David Thompson',
    description: 'Former opposing counsel',
    deletedAt: subDays(new Date(), 7).toISOString(),
    deletedBy: 'John Mitchell',
    expiresAt: subDays(new Date(), -23).toISOString()
  },
  {
    id: '6',
    type: 'company',
    name: 'Inactive Corp LLC',
    description: 'Dissolved company - no active matters',
    deletedAt: subDays(new Date(), 10).toISOString(),
    deletedBy: 'Sarah Chen',
    expiresAt: subDays(new Date(), -20).toISOString()
  }
]

const typeConfig = {
  time_entry: { label: 'Time Entry', icon: Clock, color: '#3B82F6' },
  person: { label: 'Person', icon: User, color: '#10B981' },
  company: { label: 'Company', icon: Briefcase, color: '#8B5CF6' },
  task: { label: 'Task', icon: CheckCircle2, color: '#F59E0B' },
  calendar_entry: { label: 'Calendar Entry', icon: Calendar, color: '#EC4899' },
  document: { label: 'Document', icon: FileText, color: '#06B6D4' },
  matter: { label: 'Matter', icon: Briefcase, color: '#EF4444' }
}

export function RecoveryBinPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState(demoDeletedItems)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [recovering, setRecovering] = useState<string | null>(null)

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = typeFilter === 'all' || item.type === typeFilter
      return matchesSearch && matchesType
    })
  }, [items, searchQuery, typeFilter])

  const handleRecover = async (itemId: string) => {
    setRecovering(itemId)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setItems(prev => prev.filter(i => i.id !== itemId))
    setRecovering(null)
  }

  const handleRecoverSelected = async () => {
    for (const id of selectedItems) {
      await handleRecover(id)
    }
    setSelectedItems([])
  }

  const handlePermanentDelete = (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId))
  }

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredItems.length) {
      setSelectedItems([])
    } else {
      setSelectedItems(filteredItems.map(i => i.id))
    }
  }

  return (
    <div className={styles.recoveryBinPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <Trash2 size={28} />
        </div>
        <div>
          <h1>Recovery Bin</h1>
          <p>Recover recently deleted items. Items are automatically purged after 30 days.</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className={styles.infoBanner}>
        <AlertCircle size={18} />
        <p>
          Deleted items are kept for 30 days before permanent deletion. 
          You can restore any item within this period.
        </p>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search deleted items..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={styles.filters}>
          <div className={styles.filterSelect}>
            <Filter size={16} />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="time_entry">Time Entries</option>
              <option value="person">Persons</option>
              <option value="company">Companies</option>
              <option value="task">Tasks</option>
              <option value="calendar_entry">Calendar Entries</option>
              <option value="document">Documents</option>
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
        {selectedItems.length > 0 && (
          <button className={styles.recoverSelectedBtn} onClick={handleRecoverSelected}>
            <RotateCcw size={16} />
            Recover Selected ({selectedItems.length})
          </button>
        )}
      </div>

      {/* Items List */}
      <div className={styles.itemsList}>
        {filteredItems.length > 0 ? (
          <>
            <div className={styles.listHeader}>
              <label className={styles.selectAll}>
                <input
                  type="checkbox"
                  checked={selectedItems.length === filteredItems.length && filteredItems.length > 0}
                  onChange={toggleSelectAll}
                />
                <span>Select All</span>
              </label>
              <span className={styles.itemCount}>{filteredItems.length} items</span>
            </div>
            {filteredItems.map(item => {
              const config = typeConfig[item.type]
              const Icon = config.icon
              
              return (
                <div key={item.id} className={styles.item}>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedItems([...selectedItems, item.id])
                        } else {
                          setSelectedItems(selectedItems.filter(id => id !== item.id))
                        }
                      }}
                    />
                  </label>
                  <div className={styles.itemIcon} style={{ background: `${config.color}20`, color: config.color }}>
                    <Icon size={18} />
                  </div>
                  <div className={styles.itemContent}>
                    <div className={styles.itemName}>
                      {item.name}
                      <span className={styles.typeBadge} style={{ background: `${config.color}20`, color: config.color }}>
                        {config.label}
                      </span>
                    </div>
                    {item.description && (
                      <p className={styles.itemDescription}>{item.description}</p>
                    )}
                    <div className={styles.itemMeta}>
                      <span>Deleted by {item.deletedBy}</span>
                      <span>•</span>
                      <span>{formatDistanceToNow(parseISO(item.deletedAt), { addSuffix: true })}</span>
                      <span>•</span>
                      <span>Expires {format(parseISO(item.expiresAt), 'MMM d, yyyy')}</span>
                      {item.relatedTo && (
                        <>
                          <span>•</span>
                          <span className={styles.relatedTo}>Matter: {item.relatedTo}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={styles.itemActions}>
                    <button
                      className={styles.recoverBtn}
                      onClick={() => handleRecover(item.id)}
                      disabled={recovering === item.id}
                    >
                      {recovering === item.id ? (
                        <>Recovering...</>
                      ) : (
                        <>
                          <RotateCcw size={16} />
                          Recover
                        </>
                      )}
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handlePermanentDelete(item.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        ) : (
          <div className={styles.emptyState}>
            <Trash2 size={48} />
            <h3>Recovery Bin is Empty</h3>
            <p>Deleted items will appear here for 30 days before being permanently removed.</p>
          </div>
        )}
      </div>
    </div>
  )
}
