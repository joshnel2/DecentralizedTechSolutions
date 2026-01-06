import { useState, useEffect, useRef } from 'react'
import { useDataStore, MatterTypeConfig } from '../stores/dataStore'
import { 
  Plus, Edit2, Trash2, X, Check, ToggleLeft, ToggleRight, 
  Settings, GripVertical, Eye, EyeOff, Columns, FileText, RotateCcw
} from 'lucide-react'
import styles from './MattersSettingsModal.module.css'
import { clsx } from 'clsx'

// Column configuration type
export interface ColumnConfig {
  id: string
  label: string
  visible: boolean
  required?: boolean // If true, cannot be hidden
}

// Default columns for matters table
export const DEFAULT_MATTER_COLUMNS: ColumnConfig[] = [
  { id: 'matter', label: 'Matter', visible: true, required: true },
  { id: 'client', label: 'Client', visible: true },
  { id: 'responsibleAttorney', label: 'Responsible Attorney', visible: true },
  { id: 'type', label: 'Type', visible: true },
  { id: 'status', label: 'Status', visible: true },
  { id: 'billing', label: 'Billing', visible: true },
  { id: 'opened', label: 'Opened', visible: true },
]

const STORAGE_KEY = 'apex_matters_columns'

// Helper to load columns from localStorage
export function loadColumnSettings(): ColumnConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Merge with defaults to handle any new columns added
      const defaultIds = DEFAULT_MATTER_COLUMNS.map(c => c.id)
      const storedIds = parsed.map((c: ColumnConfig) => c.id)
      
      // Add any missing columns from defaults
      const merged = [...parsed]
      DEFAULT_MATTER_COLUMNS.forEach(defaultCol => {
        if (!storedIds.includes(defaultCol.id)) {
          merged.push(defaultCol)
        }
      })
      
      // Remove any columns that no longer exist in defaults
      return merged.filter((col: ColumnConfig) => defaultIds.includes(col.id))
    }
  } catch (e) {
    console.error('Failed to load column settings:', e)
  }
  return DEFAULT_MATTER_COLUMNS
}

// Helper to save columns to localStorage
export function saveColumnSettings(columns: ColumnConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columns))
  } catch (e) {
    console.error('Failed to save column settings:', e)
  }
}

interface MattersSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  columns: ColumnConfig[]
  onColumnsChange: (columns: ColumnConfig[]) => void
}

type TabType = 'columns' | 'types'

export function MattersSettingsModal({ isOpen, onClose, columns, onColumnsChange }: MattersSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('columns')
  
  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Settings size={20} />
            <h2>Matters Settings</h2>
          </div>
          <button onClick={onClose} className={styles.closeBtn}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabs}>
          <button
            className={clsx(styles.tab, activeTab === 'columns' && styles.activeTab)}
            onClick={() => setActiveTab('columns')}
          >
            <Columns size={16} />
            Columns
          </button>
          <button
            className={clsx(styles.tab, activeTab === 'types' && styles.activeTab)}
            onClick={() => setActiveTab('types')}
          >
            <FileText size={16} />
            Matter Types
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'columns' ? (
          <ColumnSettingsTab columns={columns} onColumnsChange={onColumnsChange} />
        ) : (
          <MatterTypesTab />
        )}

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.doneBtn}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// Column Settings Tab Component
interface ColumnSettingsTabProps {
  columns: ColumnConfig[]
  onColumnsChange: (columns: ColumnConfig[]) => void
}

function ColumnSettingsTab({ columns, onColumnsChange }: ColumnSettingsTabProps) {
  const [localColumns, setLocalColumns] = useState<ColumnConfig[]>(columns)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)

  // Sync local state with props
  useEffect(() => {
    setLocalColumns(columns)
  }, [columns])

  const handleToggleVisibility = (columnId: string) => {
    const updated = localColumns.map(col => 
      col.id === columnId && !col.required
        ? { ...col, visible: !col.visible }
        : col
    )
    setLocalColumns(updated)
    onColumnsChange(updated)
    saveColumnSettings(updated)
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
    
    // Add dragging class after a short delay
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.classList.add(styles.dragging)
      }
    }, 0)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault()
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDragOverIndex(null)
      return
    }

    const newColumns = [...localColumns]
    const [draggedItem] = newColumns.splice(draggedIndex, 1)
    newColumns.splice(dropIndex, 0, draggedItem)
    
    setLocalColumns(newColumns)
    onColumnsChange(newColumns)
    saveColumnSettings(newColumns)
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleReset = () => {
    setLocalColumns(DEFAULT_MATTER_COLUMNS)
    onColumnsChange(DEFAULT_MATTER_COLUMNS)
    saveColumnSettings(DEFAULT_MATTER_COLUMNS)
  }

  const visibleCount = localColumns.filter(c => c.visible).length

  return (
    <div className={styles.content}>
      <div className={styles.description}>
        <p>Customize which columns appear in your matters table and their order. Drag to reorder columns.</p>
      </div>

      <div className={styles.columnsList}>
        {localColumns.map((column, index) => (
          <div
            key={column.id}
            ref={draggedIndex === index ? dragNodeRef : null}
            className={clsx(
              styles.columnItem,
              !column.visible && styles.hidden,
              draggedIndex === index && styles.dragging,
              dragOverIndex === index && styles.dragOver
            )}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className={styles.dragHandle}>
              <GripVertical size={16} />
            </div>
            
            <div className={styles.columnInfo}>
              <span className={styles.columnLabel}>{column.label}</span>
              {column.required && (
                <span className={styles.requiredBadge}>Required</span>
              )}
            </div>

            <button
              className={clsx(
                styles.visibilityBtn,
                column.visible && styles.visible,
                column.required && styles.locked
              )}
              onClick={() => handleToggleVisibility(column.id)}
              disabled={column.required}
              title={column.required ? 'This column cannot be hidden' : column.visible ? 'Hide column' : 'Show column'}
            >
              {column.visible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
        ))}
      </div>

      <div className={styles.columnsFooter}>
        <span className={styles.stats}>
          {visibleCount} of {localColumns.length} columns visible
        </span>
        <button 
          onClick={handleReset}
          className={styles.resetBtn}
          title="Reset to default columns"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
    </div>
  )
}

// Matter Types Tab Component (moved from MatterTypesManager)
function MatterTypesTab() {
  const { matterTypes, addMatterType, updateMatterType, deleteMatterType, toggleMatterTypeActive } = useDataStore()
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleAddType = () => {
    if (!newTypeLabel.trim()) return
    addMatterType({ 
      value: newTypeLabel.trim().toLowerCase().replace(/\s+/g, '_'),
      label: newTypeLabel.trim()
    })
    setNewTypeLabel('')
    setIsAdding(false)
  }

  const handleEditType = (typeId: string) => {
    if (!editLabel.trim()) return
    updateMatterType(typeId, { 
      label: editLabel.trim(),
      value: editLabel.trim().toLowerCase().replace(/\s+/g, '_')
    })
    setEditingId(null)
    setEditLabel('')
  }

  const handleDeleteType = (typeId: string) => {
    deleteMatterType(typeId)
    setConfirmDelete(null)
  }

  const startEdit = (type: MatterTypeConfig) => {
    setEditingId(type.id)
    setEditLabel(type.label)
  }

  return (
    <div className={styles.content}>
      <p className={styles.description}>
        Add, edit, or toggle matter types for your firm. Inactive types won't appear in dropdowns but existing matters won't be affected.
      </p>

      <div className={styles.typesList}>
        {matterTypes.map(type => (
          <div 
            key={type.id} 
            className={clsx(styles.typeItem, !type.active && styles.inactive)}
          >
            {editingId === type.id ? (
              <div className={styles.editRow}>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleEditType(type.id)}
                  autoFocus
                  className={styles.editInput}
                />
                <button 
                  onClick={() => handleEditType(type.id)}
                  className={styles.actionBtn}
                  title="Save"
                >
                  <Check size={16} />
                </button>
                <button 
                  onClick={() => { setEditingId(null); setEditLabel(''); }}
                  className={clsx(styles.actionBtn, styles.cancel)}
                  title="Cancel"
                >
                  <X size={16} />
                </button>
              </div>
            ) : confirmDelete === type.id ? (
              <div className={styles.confirmRow}>
                <span className={styles.confirmText}>Delete "{type.label}"?</span>
                <button 
                  onClick={() => handleDeleteType(type.id)}
                  className={clsx(styles.actionBtn, styles.danger)}
                >
                  Yes
                </button>
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className={styles.actionBtn}
                >
                  No
                </button>
              </div>
            ) : (
              <>
                <div className={styles.typeInfo}>
                  <span className={styles.typeLabel}>{type.label}</span>
                  <span className={styles.typeValue}>{type.value}</span>
                </div>
                <div className={styles.typeActions}>
                  <button
                    onClick={() => toggleMatterTypeActive(type.id)}
                    className={clsx(styles.toggleBtn, type.active && styles.active)}
                    title={type.active ? 'Deactivate' : 'Activate'}
                  >
                    {type.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button
                    onClick={() => startEdit(type)}
                    className={styles.actionBtn}
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(type.id)}
                    className={clsx(styles.actionBtn, styles.danger)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {isAdding ? (
        <div className={styles.addForm}>
          <input
            type="text"
            value={newTypeLabel}
            onChange={(e) => setNewTypeLabel(e.target.value)}
            placeholder="Enter new type name..."
            onKeyPress={(e) => e.key === 'Enter' && handleAddType()}
            autoFocus
            className={styles.addInput}
          />
          <button 
            onClick={handleAddType}
            className={styles.saveBtn}
            disabled={!newTypeLabel.trim()}
          >
            Add Type
          </button>
          <button 
            onClick={() => { setIsAdding(false); setNewTypeLabel(''); }}
            className={styles.cancelBtn}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button 
          onClick={() => setIsAdding(true)}
          className={styles.addTypeBtn}
        >
          <Plus size={16} />
          Add New Type
        </button>
      )}

      <div className={styles.typesFooter}>
        <span className={styles.stats}>
          {matterTypes.filter(t => t.active).length} active / {matterTypes.length} total types
        </span>
      </div>
    </div>
  )
}
