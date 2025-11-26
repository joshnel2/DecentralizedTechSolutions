import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import {
  Tag, Plus, Edit2, Trash2, Search, ChevronDown, X,
  AlertTriangle, CheckCircle2, User, Briefcase, FileText,
  GripVertical, Copy, Settings
} from 'lucide-react'
import { clsx } from 'clsx'
import styles from './CustomFieldsPage.module.css'

interface CustomField {
  id: string
  name: string
  entity: 'client' | 'matter' | 'document' | 'contact'
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'currency' | 'email' | 'phone' | 'url' | 'textarea'
  required: boolean
  placeholder?: string
  options?: string[]
  defaultValue?: string
  description?: string
  createdAt: string
}

const demoFields: CustomField[] = [
  { id: '1', name: 'SSN/Tax ID', entity: 'client', type: 'text', required: true, description: 'Social Security Number or Tax ID', createdAt: '2024-01-15' },
  { id: '2', name: 'Date of Birth', entity: 'client', type: 'date', required: false, createdAt: '2024-01-15' },
  { id: '3', name: 'Referral Source', entity: 'client', type: 'select', required: true, options: ['Website', 'Referral', 'Advertisement', 'Bar Association', 'Other'], createdAt: '2024-01-20' },
  { id: '4', name: 'Case Value', entity: 'matter', type: 'currency', required: false, description: 'Estimated value of the case', createdAt: '2024-02-01' },
  { id: '5', name: 'Court Deadline', entity: 'matter', type: 'date', required: false, createdAt: '2024-02-01' },
  { id: '6', name: 'Document Category', entity: 'document', type: 'select', required: true, options: ['Pleading', 'Discovery', 'Correspondence', 'Contract', 'Evidence', 'Other'], createdAt: '2024-02-10' },
  { id: '7', name: 'Opposing Counsel', entity: 'matter', type: 'text', required: false, placeholder: 'Name and firm', createdAt: '2024-02-15' },
  { id: '8', name: 'Statute of Limitations', entity: 'matter', type: 'date', required: true, description: 'Critical date for filing', createdAt: '2024-03-01' }
]

const entityConfig = {
  client: { label: 'Client', icon: User, color: '#10B981' },
  matter: { label: 'Matter', icon: Briefcase, color: '#3B82F6' },
  document: { label: 'Document', icon: FileText, color: '#8B5CF6' },
  contact: { label: 'Contact', icon: User, color: '#F59E0B' }
}

const fieldTypes = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL' }
]

export function CustomFieldsPage() {
  const { user } = useAuthStore()
  const [fields, setFields] = useState(demoFields)
  const [searchQuery, setSearchQuery] = useState('')
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingField, setEditingField] = useState<CustomField | null>(null)

  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  const filteredFields = fields.filter(field => {
    const matchesSearch = field.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesEntity = entityFilter === 'all' || field.entity === entityFilter
    return matchesSearch && matchesEntity
  })

  const handleSaveField = (fieldData: Partial<CustomField>) => {
    if (editingField) {
      setFields(prev => prev.map(f => f.id === editingField.id ? { ...f, ...fieldData } : f))
    } else {
      const newField: CustomField = {
        id: Date.now().toString(),
        name: fieldData.name || '',
        entity: fieldData.entity || 'client',
        type: fieldData.type || 'text',
        required: fieldData.required || false,
        placeholder: fieldData.placeholder,
        options: fieldData.options,
        defaultValue: fieldData.defaultValue,
        description: fieldData.description,
        createdAt: new Date().toISOString().split('T')[0]
      }
      setFields(prev => [...prev, newField])
    }
    setShowModal(false)
    setEditingField(null)
  }

  const handleDeleteField = (fieldId: string) => {
    setFields(prev => prev.filter(f => f.id !== fieldId))
  }

  const handleDuplicateField = (field: CustomField) => {
    const newField: CustomField = {
      ...field,
      id: Date.now().toString(),
      name: `${field.name} (Copy)`,
      createdAt: new Date().toISOString().split('T')[0]
    }
    setFields(prev => [...prev, newField])
  }

  if (!isAdmin) {
    return (
      <div className={styles.noAccess}>
        <AlertTriangle size={48} />
        <h2>Access Denied</h2>
        <p>Only administrators can manage custom fields.</p>
      </div>
    )
  }

  return (
    <div className={styles.customFieldsPage}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <Tag size={28} />
        </div>
        <div className={styles.headerContent}>
          <h1>Custom Fields</h1>
          <p>Create and manage custom fields for clients, matters, documents, and contacts.</p>
        </div>
        <button className={styles.primaryBtn} onClick={() => setShowModal(true)}>
          <Plus size={18} />
          Add Custom Field
        </button>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search fields..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={styles.entityTabs}>
          <button
            className={clsx(styles.entityTab, entityFilter === 'all' && styles.active)}
            onClick={() => setEntityFilter('all')}
          >
            All
          </button>
          {Object.entries(entityConfig).map(([key, config]) => (
            <button
              key={key}
              className={clsx(styles.entityTab, entityFilter === key && styles.active)}
              onClick={() => setEntityFilter(key)}
            >
              <config.icon size={16} />
              {config.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fields List */}
      <div className={styles.fieldsList}>
        {filteredFields.length > 0 ? (
          <table className={styles.fieldsTable}>
            <thead>
              <tr>
                <th></th>
                <th>Field Name</th>
                <th>Entity</th>
                <th>Type</th>
                <th>Required</th>
                <th>Options</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredFields.map(field => {
                const config = entityConfig[field.entity]
                const Icon = config.icon
                
                return (
                  <tr key={field.id}>
                    <td className={styles.dragHandle}>
                      <GripVertical size={16} />
                    </td>
                    <td>
                      <div className={styles.fieldName}>
                        <span>{field.name}</span>
                        {field.description && (
                          <span className={styles.fieldDesc}>{field.description}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={styles.entityBadge} style={{ background: `${config.color}20`, color: config.color }}>
                        <Icon size={14} />
                        {config.label}
                      </span>
                    </td>
                    <td className={styles.typeCell}>
                      {fieldTypes.find(t => t.value === field.type)?.label || field.type}
                    </td>
                    <td>
                      {field.required ? (
                        <CheckCircle2 size={18} className={styles.required} />
                      ) : (
                        <span className={styles.optional}>—</span>
                      )}
                    </td>
                    <td>
                      {field.options ? (
                        <span className={styles.optionsPreview}>
                          {field.options.slice(0, 2).join(', ')}
                          {field.options.length > 2 && `, +${field.options.length - 2}`}
                        </span>
                      ) : (
                        <span className={styles.optional}>—</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          className={styles.iconBtn}
                          title="Edit"
                          onClick={() => {
                            setEditingField(field)
                            setShowModal(true)
                          }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className={styles.iconBtn}
                          title="Duplicate"
                          onClick={() => handleDuplicateField(field)}
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          className={styles.iconBtnDanger}
                          title="Delete"
                          onClick={() => handleDeleteField(field.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className={styles.emptyState}>
            <Tag size={48} />
            <h3>No Custom Fields Found</h3>
            <p>Create custom fields to capture additional information for your clients, matters, and documents.</p>
            <button className={styles.primaryBtn} onClick={() => setShowModal(true)}>
              <Plus size={18} />
              Create Your First Field
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <FieldModal
          field={editingField}
          onClose={() => {
            setShowModal(false)
            setEditingField(null)
          }}
          onSave={handleSaveField}
        />
      )}
    </div>
  )
}

// Field Modal Component
function FieldModal({
  field,
  onClose,
  onSave
}: {
  field: CustomField | null
  onClose: () => void
  onSave: (data: Partial<CustomField>) => void
}) {
  const [formData, setFormData] = useState({
    name: field?.name || '',
    entity: field?.entity || 'client' as const,
    type: field?.type || 'text' as const,
    required: field?.required || false,
    placeholder: field?.placeholder || '',
    description: field?.description || '',
    options: field?.options?.join('\n') || ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name: formData.name,
      entity: formData.entity,
      type: formData.type,
      required: formData.required,
      placeholder: formData.placeholder || undefined,
      description: formData.description || undefined,
      options: formData.type === 'select' ? formData.options.split('\n').filter(o => o.trim()) : undefined
    })
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{field ? 'Edit Custom Field' : 'Add Custom Field'}</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Field Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., SSN/Tax ID"
              required
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Entity *</label>
              <select
                value={formData.entity}
                onChange={e => setFormData({ ...formData, entity: e.target.value as any })}
              >
                <option value="client">Client</option>
                <option value="matter">Matter</option>
                <option value="document">Document</option>
                <option value="contact">Contact</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Field Type *</label>
              <select
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as any })}
              >
                {fieldTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this field"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Placeholder Text</label>
            <input
              type="text"
              value={formData.placeholder}
              onChange={e => setFormData({ ...formData, placeholder: e.target.value })}
              placeholder="Hint text shown in empty field"
            />
          </div>

          {formData.type === 'select' && (
            <div className={styles.formGroup}>
              <label>Options (one per line) *</label>
              <textarea
                value={formData.options}
                onChange={e => setFormData({ ...formData, options: e.target.value })}
                placeholder="Option 1&#10;Option 2&#10;Option 3"
                rows={4}
              />
            </div>
          )}

          <div className={styles.toggle}>
            <div>
              <span className={styles.toggleLabel}>Required Field</span>
              <span className={styles.toggleDesc}>Users must fill in this field</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={formData.required}
                onChange={e => setFormData({ ...formData, required: e.target.checked })}
              />
              <span className={styles.slider}></span>
            </label>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.primaryBtn}>
              {field ? 'Save Changes' : 'Create Field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
