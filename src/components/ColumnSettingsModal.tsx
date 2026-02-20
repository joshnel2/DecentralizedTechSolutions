import { useState, useEffect } from 'react'
import { Settings, X, GripVertical, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import styles from './ColumnSettingsModal.module.css'

export interface ColumnConfig {
  id: string
  label: string
  visible: boolean
  order: number
}

interface ColumnSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  columns: ColumnConfig[]
  onSave: (columns: ColumnConfig[]) => void
  storageKey: string
}

const DEFAULT_MATTER_COLUMNS: ColumnConfig[] = [
  { id: 'matter', label: 'Matter', visible: true, order: 0 },
  { id: 'client', label: 'Client', visible: true, order: 1 },
  { id: 'responsibleAttorney', label: 'Responsible Attorney', visible: true, order: 2 },
  { id: 'type', label: 'Type', visible: true, order: 3 },
  { id: 'practiceArea', label: 'Practice Area', visible: true, order: 4 },
  { id: 'status', label: 'Status', visible: true, order: 5 },
  { id: 'billing', label: 'Billing', visible: true, order: 6 },
  { id: 'opened', label: 'Opened', visible: true, order: 7 },
  { id: 'matterStage', label: 'Stage', visible: false, order: 8 },
  { id: 'location', label: 'Location', visible: false, order: 9 },
  { id: 'originatingAttorney', label: 'Originating Attorney', visible: false, order: 10 },
]

export function getDefaultColumns(): ColumnConfig[] {
  return DEFAULT_MATTER_COLUMNS.map(col => ({ ...col }))
}

export function loadColumnSettings(storageKey: string): ColumnConfig[] {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Merge with defaults to handle any new columns
      const defaults = getDefaultColumns()
      const mergedColumns = defaults.map(defaultCol => {
        const storedCol = parsed.find((c: ColumnConfig) => c.id === defaultCol.id)
        return storedCol ? { ...defaultCol, visible: storedCol.visible, order: storedCol.order } : defaultCol
      })
      return mergedColumns.sort((a, b) => a.order - b.order)
    }
  } catch (e) {
    console.error('Failed to load column settings:', e)
  }
  return getDefaultColumns()
}

export function saveColumnSettings(storageKey: string, columns: ColumnConfig[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(columns))
  } catch (e) {
    console.error('Failed to save column settings:', e)
  }
}

export function ColumnSettingsModal({ isOpen, onClose, columns, onSave, storageKey }: ColumnSettingsModalProps) {
  const [localColumns, setLocalColumns] = useState<ColumnConfig[]>(columns)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    setLocalColumns(columns)
  }, [columns])

  if (!isOpen) return null

  const handleToggleVisibility = (columnId: string) => {
    setLocalColumns(prev => 
      prev.map(col => 
        col.id === columnId ? { ...col, visible: !col.visible } : col
      )
    )
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newColumns = [...localColumns]
      const [draggedItem] = newColumns.splice(draggedIndex, 1)
      newColumns.splice(dragOverIndex, 0, draggedItem)
      
      // Update order values
      const reorderedColumns = newColumns.map((col, idx) => ({ ...col, order: idx }))
      setLocalColumns(reorderedColumns)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const newColumns = [...localColumns]
    const temp = newColumns[index]
    newColumns[index] = newColumns[index - 1]
    newColumns[index - 1] = temp
    const reorderedColumns = newColumns.map((col, idx) => ({ ...col, order: idx }))
    setLocalColumns(reorderedColumns)
  }

  const handleMoveDown = (index: number) => {
    if (index === localColumns.length - 1) return
    const newColumns = [...localColumns]
    const temp = newColumns[index]
    newColumns[index] = newColumns[index + 1]
    newColumns[index + 1] = temp
    const reorderedColumns = newColumns.map((col, idx) => ({ ...col, order: idx }))
    setLocalColumns(reorderedColumns)
  }

  const handleReset = () => {
    const defaults = getDefaultColumns()
    setLocalColumns(defaults)
  }

  const handleSave = () => {
    saveColumnSettings(storageKey, localColumns)
    onSave(localColumns)
    onClose()
  }

  const visibleCount = localColumns.filter(c => c.visible).length

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Settings size={20} />
            <h2>Column Settings</h2>
          </div>
          <button onClick={onClose} className={styles.closeBtn}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <p className={styles.description}>
            Toggle columns on/off and drag to reorder. Changes will be saved for your account.
          </p>

          <div className={styles.columnsList}>
            {localColumns.map((column, index) => (
              <div
                key={column.id}
                className={clsx(
                  styles.columnItem,
                  !column.visible && styles.hidden,
                  draggedIndex === index && styles.dragging,
                  dragOverIndex === index && styles.dragOver
                )}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
              >
                <div className={styles.dragHandle}>
                  <GripVertical size={16} />
                </div>
                
                <span className={styles.columnLabel}>{column.label}</span>
                
                <div className={styles.columnActions}>
                  <button
                    className={styles.moveBtn}
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className={styles.moveBtn}
                    onClick={() => handleMoveDown(index)}
                    disabled={index === localColumns.length - 1}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    className={clsx(styles.visibilityBtn, column.visible && styles.visible)}
                    onClick={() => handleToggleVisibility(column.id)}
                    title={column.visible ? 'Hide column' : 'Show column'}
                  >
                    {column.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={handleReset} className={styles.resetBtn}>
            <RotateCcw size={14} />
            Reset to Defaults
          </button>
        </div>

        <div className={styles.footer}>
          <span className={styles.stats}>
            {visibleCount} of {localColumns.length} columns visible
          </span>
          <div className={styles.footerActions}>
            <button onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button onClick={handleSave} className={styles.saveBtn}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
