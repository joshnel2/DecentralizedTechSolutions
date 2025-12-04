import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Scale, Plus, Search, ChevronDown, Edit2, Trash2, X,
  Calendar, AlertCircle, CheckCircle2, Clock, MapPin, BookOpen, ArrowLeft
} from 'lucide-react'
import { format, addDays } from 'date-fns'
import { clsx } from 'clsx'
import styles from './CourtRulesPage.module.css'

interface CourtRule {
  id: string
  name: string
  jurisdiction: string
  court: string
  ruleType: 'filing' | 'service' | 'discovery' | 'motion' | 'trial' | 'appeal'
  triggerEvent: string
  daysBeforeAfter: number
  direction: 'before' | 'after'
  countType: 'calendar' | 'business'
  excludeHolidays: boolean
  description?: string
  isActive: boolean
}

const demoRules: CourtRule[] = [
  {
    id: '1',
    name: 'Response to Complaint',
    jurisdiction: 'Federal',
    court: 'U.S. District Court',
    ruleType: 'filing',
    triggerEvent: 'Service of Complaint',
    daysBeforeAfter: 21,
    direction: 'after',
    countType: 'calendar',
    excludeHolidays: true,
    description: 'FRCP 12(a)(1)(A)(i) - 21 days after service',
    isActive: true
  },
  {
    id: '2',
    name: 'Motion to Dismiss',
    jurisdiction: 'Federal',
    court: 'U.S. District Court',
    ruleType: 'motion',
    triggerEvent: 'Service of Complaint',
    daysBeforeAfter: 21,
    direction: 'after',
    countType: 'calendar',
    excludeHolidays: true,
    description: 'FRCP 12(b) - Must be filed before or with Answer',
    isActive: true
  },
  {
    id: '3',
    name: 'Discovery Requests',
    jurisdiction: 'California',
    court: 'Superior Court',
    ruleType: 'discovery',
    triggerEvent: 'Service Date',
    daysBeforeAfter: 30,
    direction: 'after',
    countType: 'calendar',
    excludeHolidays: false,
    description: 'CCP 2030.260 - 30 days to respond',
    isActive: true
  },
  {
    id: '4',
    name: 'Motion Hearing Notice',
    jurisdiction: 'New York',
    court: 'Supreme Court',
    ruleType: 'motion',
    triggerEvent: 'Hearing Date',
    daysBeforeAfter: 8,
    direction: 'before',
    countType: 'business',
    excludeHolidays: true,
    description: 'CPLR 2214 - Minimum notice requirement',
    isActive: true
  },
  {
    id: '5',
    name: 'Appeal Filing',
    jurisdiction: 'Federal',
    court: 'Circuit Court of Appeals',
    ruleType: 'appeal',
    triggerEvent: 'Entry of Judgment',
    daysBeforeAfter: 30,
    direction: 'after',
    countType: 'calendar',
    excludeHolidays: true,
    description: 'FRAP 4(a)(1) - Notice of appeal deadline',
    isActive: true
  }
]

const ruleTypeConfig = {
  filing: { label: 'Filing', color: '#3B82F6' },
  service: { label: 'Service', color: '#10B981' },
  discovery: { label: 'Discovery', color: '#8B5CF6' },
  motion: { label: 'Motion', color: '#F59E0B' },
  trial: { label: 'Trial', color: '#EC4899' },
  appeal: { label: 'Appeal', color: '#EF4444' }
}

export function CourtRulesPage() {
  const navigate = useNavigate()
  const [rules, setRules] = useState(demoRules)
  const [searchQuery, setSearchQuery] = useState('')
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState<CourtRule | null>(null)

  const jurisdictions = [...new Set(rules.map(r => r.jurisdiction))]

  const filteredRules = rules.filter(rule => {
    const matchesSearch = rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         rule.court.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesJurisdiction = jurisdictionFilter === 'all' || rule.jurisdiction === jurisdictionFilter
    return matchesSearch && matchesJurisdiction
  })

  const handleToggleActive = (ruleId: string) => {
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, isActive: !r.isActive } : r))
  }

  const handleDeleteRule = (ruleId: string) => {
    setRules(prev => prev.filter(r => r.id !== ruleId))
  }

  return (
    <div className={styles.courtRulesPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <Scale size={28} />
        </div>
        <div className={styles.headerContent}>
          <h1>Court Rules</h1>
          <p>Manage deadline rules for different courts and jurisdictions. Rules are automatically applied to matters.</p>
        </div>
        <button className={styles.primaryBtn} onClick={() => setShowModal(true)}>
          <Plus size={18} />
          Add Rule
        </button>
      </div>

      {/* Info Banner */}
      <div className={styles.infoBanner}>
        <BookOpen size={20} />
        <div>
          <h4>How Court Rules Work</h4>
          <p>Court rules automatically calculate deadlines based on trigger events. When you set a trigger event on a matter (like "Service of Complaint"), Apex will calculate and add all related deadlines to your calendar.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={styles.filterSelect}>
          <MapPin size={16} />
          <select
            value={jurisdictionFilter}
            onChange={e => setJurisdictionFilter(e.target.value)}
          >
            <option value="all">All Jurisdictions</option>
            {jurisdictions.map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          <ChevronDown size={16} />
        </div>
      </div>

      {/* Rules List */}
      <div className={styles.rulesList}>
        {filteredRules.map(rule => {
          const typeConfig = ruleTypeConfig[rule.ruleType]
          const exampleDate = format(addDays(new Date(), rule.direction === 'after' ? rule.daysBeforeAfter : -rule.daysBeforeAfter), 'MMM d, yyyy')
          
          return (
            <div key={rule.id} className={clsx(styles.ruleCard, !rule.isActive && styles.inactive)}>
              <div className={styles.ruleHeader}>
                <div className={styles.ruleTitle}>
                  <h3>{rule.name}</h3>
                  <span className={styles.typeBadge} style={{ background: `${typeConfig.color}20`, color: typeConfig.color }}>
                    {typeConfig.label}
                  </span>
                </div>
                <div className={styles.ruleActions}>
                  <button
                    className={styles.toggleBtn}
                    onClick={() => handleToggleActive(rule.id)}
                  >
                    {rule.isActive ? (
                      <><CheckCircle2 size={16} /> Active</>
                    ) : (
                      <><AlertCircle size={16} /> Inactive</>
                    )}
                  </button>
                  <button
                    className={styles.iconBtn}
                    onClick={() => {
                      setEditingRule(rule)
                      setShowModal(true)
                    }}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    className={styles.iconBtnDanger}
                    onClick={() => handleDeleteRule(rule.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className={styles.ruleDetails}>
                <div className={styles.ruleInfo}>
                  <span className={styles.infoLabel}>Jurisdiction</span>
                  <span className={styles.infoValue}>{rule.jurisdiction} - {rule.court}</span>
                </div>
                <div className={styles.ruleInfo}>
                  <span className={styles.infoLabel}>Trigger Event</span>
                  <span className={styles.infoValue}>{rule.triggerEvent}</span>
                </div>
                <div className={styles.ruleInfo}>
                  <span className={styles.infoLabel}>Deadline</span>
                  <span className={styles.infoValue}>
                    {rule.daysBeforeAfter} {rule.countType} days {rule.direction} trigger
                    {rule.excludeHolidays && ' (excl. holidays)'}
                  </span>
                </div>
              </div>

              {rule.description && (
                <p className={styles.ruleDescription}>{rule.description}</p>
              )}

              <div className={styles.ruleExample}>
                <Calendar size={14} />
                <span>
                  Example: If trigger is today, deadline is <strong>{exampleDate}</strong>
                </span>
              </div>
            </div>
          )
        })}

        {filteredRules.length === 0 && (
          <div className={styles.emptyState}>
            <Scale size={48} />
            <h3>No Court Rules Found</h3>
            <p>Add court rules to automatically calculate deadlines based on trigger events.</p>
            <button className={styles.primaryBtn} onClick={() => setShowModal(true)}>
              <Plus size={18} />
              Add Your First Rule
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <RuleModal
          rule={editingRule}
          onClose={() => {
            setShowModal(false)
            setEditingRule(null)
          }}
          onSave={(data) => {
            if (editingRule) {
              setRules(prev => prev.map(r => r.id === editingRule.id ? { ...r, ...data } : r))
            } else {
              setRules(prev => [...prev, { ...data, id: Date.now().toString(), isActive: true } as CourtRule])
            }
            setShowModal(false)
            setEditingRule(null)
          }}
        />
      )}
    </div>
  )
}

function RuleModal({
  rule,
  onClose,
  onSave
}: {
  rule: CourtRule | null
  onClose: () => void
  onSave: (data: Partial<CourtRule>) => void
}) {
  const [formData, setFormData] = useState({
    name: rule?.name || '',
    jurisdiction: rule?.jurisdiction || '',
    court: rule?.court || '',
    ruleType: rule?.ruleType || 'filing' as const,
    triggerEvent: rule?.triggerEvent || '',
    daysBeforeAfter: rule?.daysBeforeAfter || 21,
    direction: rule?.direction || 'after' as const,
    countType: rule?.countType || 'calendar' as const,
    excludeHolidays: rule?.excludeHolidays ?? true,
    description: rule?.description || ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{rule ? 'Edit Court Rule' : 'Add Court Rule'}</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Rule Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Response to Complaint"
              required
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Jurisdiction *</label>
              <input
                type="text"
                value={formData.jurisdiction}
                onChange={e => setFormData({ ...formData, jurisdiction: e.target.value })}
                placeholder="e.g., Federal, California"
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Court *</label>
              <input
                type="text"
                value={formData.court}
                onChange={e => setFormData({ ...formData, court: e.target.value })}
                placeholder="e.g., U.S. District Court"
                required
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Rule Type *</label>
              <select
                value={formData.ruleType}
                onChange={e => setFormData({ ...formData, ruleType: e.target.value as any })}
              >
                <option value="filing">Filing</option>
                <option value="service">Service</option>
                <option value="discovery">Discovery</option>
                <option value="motion">Motion</option>
                <option value="trial">Trial</option>
                <option value="appeal">Appeal</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Trigger Event *</label>
              <input
                type="text"
                value={formData.triggerEvent}
                onChange={e => setFormData({ ...formData, triggerEvent: e.target.value })}
                placeholder="e.g., Service of Complaint"
                required
              />
            </div>
          </div>

          <div className={styles.deadlineSection}>
            <label>Deadline Calculation</label>
            <div className={styles.deadlineInputs}>
              <input
                type="number"
                value={formData.daysBeforeAfter}
                onChange={e => setFormData({ ...formData, daysBeforeAfter: parseInt(e.target.value) })}
                min={1}
              />
              <select
                value={formData.countType}
                onChange={e => setFormData({ ...formData, countType: e.target.value as any })}
              >
                <option value="calendar">calendar days</option>
                <option value="business">business days</option>
              </select>
              <select
                value={formData.direction}
                onChange={e => setFormData({ ...formData, direction: e.target.value as any })}
              >
                <option value="after">after</option>
                <option value="before">before</option>
              </select>
              <span>trigger event</span>
            </div>
          </div>

          <div className={styles.toggle}>
            <div>
              <span className={styles.toggleLabel}>Exclude Holidays</span>
              <span className={styles.toggleDesc}>Skip court holidays when calculating deadline</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={formData.excludeHolidays}
                onChange={e => setFormData({ ...formData, excludeHolidays: e.target.checked })}
              />
              <span className={styles.slider}></span>
            </label>
          </div>

          <div className={styles.formGroup}>
            <label>Description / Citation</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., FRCP 12(a)(1)(A)(i) - 21 days after service"
              rows={2}
            />
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.primaryBtn}>
              {rule ? 'Save Changes' : 'Add Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
