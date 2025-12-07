import { useState } from 'react'
import { useDataStore, MatterTypeConfig } from '../stores/dataStore'
import { Plus, Edit2, Trash2, X, Check, ToggleLeft, ToggleRight, Settings } from 'lucide-react'
import styles from './MatterTypesManager.module.css'
import { clsx } from 'clsx'

interface MatterTypesManagerProps {
  isOpen: boolean
  onClose: () => void
}

export function MatterTypesManager({ isOpen, onClose }: MatterTypesManagerProps) {
  const { matterTypes, addMatterType, updateMatterType, deleteMatterType, toggleMatterTypeActive } = useDataStore()
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  if (!isOpen) return null

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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Settings size={20} />
            <h2>Manage Matter Types</h2>
          </div>
          <button onClick={onClose} className={styles.closeBtn}>
            <X size={20} />
          </button>
        </div>

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
        </div>

        <div className={styles.footer}>
          <span className={styles.stats}>
            {matterTypes.filter(t => t.active).length} active / {matterTypes.length} total types
          </span>
          <button onClick={onClose} className={styles.doneBtn}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
