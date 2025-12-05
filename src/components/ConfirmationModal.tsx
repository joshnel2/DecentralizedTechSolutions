import { AlertTriangle, Trash2, Archive, XCircle, CheckCircle2 } from 'lucide-react'
import styles from './ConfirmationModal.module.css'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'success' | 'info'
  isLoading?: boolean
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  isLoading = false
}: ConfirmationModalProps) {
  if (!isOpen) return null

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <Trash2 size={24} />
      case 'warning':
        return <AlertTriangle size={24} />
      case 'success':
        return <CheckCircle2 size={24} />
      case 'info':
      default:
        return <Archive size={24} />
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={`${styles.iconWrapper} ${styles[type]}`}>
          {getIcon()}
        </div>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button 
            className={styles.cancelBtn} 
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button 
            className={`${styles.confirmBtn} ${styles[type]}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
