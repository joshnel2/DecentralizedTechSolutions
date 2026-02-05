import { useEffect, useRef, ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './Modal.module.css'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
  size?: ModalSize
  showClose?: boolean
  closeOnOverlay?: boolean
  closeOnEscape?: boolean
  footer?: ReactNode
  className?: string
  contentClassName?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  showClose = true,
  closeOnOverlay = true,
  closeOnEscape = true,
  footer,
  className = '',
  contentClassName = ''
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, closeOnEscape, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Focus trap
  useEffect(() => {
    if (!isOpen || !modalRef.current) return

    const modal = modalRef.current
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    modal.addEventListener('keydown', handleTab)
    firstElement?.focus()

    return () => modal.removeEventListener('keydown', handleTab)
  }, [isOpen])

  if (!isOpen) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlay && e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className={`${styles.overlay} ${className}`} onClick={handleOverlayClick}>
      <div 
        ref={modalRef}
        className={`${styles.modal} ${styles[size]}`} 
        role="dialog" 
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {(title || showClose) && (
          <div className={styles.header}>
            <div className={styles.headerContent}>
              {title && <h2 id="modal-title" className={styles.title}>{title}</h2>}
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            {showClose && (
              <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
                <X size={20} />
              </button>
            )}
          </div>
        )}
        <div className={`${styles.content} ${contentClassName}`}>
          {children}
        </div>
        {footer && (
          <div className={styles.footer}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// Modal action buttons helper
interface ModalActionsProps {
  children: ReactNode
  className?: string
}

export function ModalActions({ children, className = '' }: ModalActionsProps) {
  return (
    <div className={`${styles.actions} ${className}`}>
      {children}
    </div>
  )
}

export default Modal
