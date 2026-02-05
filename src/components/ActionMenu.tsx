import { useState, useRef, useEffect, ReactNode } from 'react'
import { MoreVertical, MoreHorizontal, ChevronDown } from 'lucide-react'
import styles from './ActionMenu.module.css'

export interface ActionMenuItem {
  id: string
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  divider?: boolean
}

interface ActionMenuProps {
  items: ActionMenuItem[]
  trigger?: 'dots-vertical' | 'dots-horizontal' | 'chevron' | 'custom'
  customTrigger?: ReactNode
  label?: string
  disabled?: boolean
  position?: 'left' | 'right'
  size?: 'sm' | 'md'
  className?: string
}

export function ActionMenu({
  items,
  trigger = 'dots-vertical',
  customTrigger,
  label,
  disabled = false,
  position = 'right',
  size = 'md',
  className = ''
}: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const handleItemClick = (item: ActionMenuItem) => {
    if (item.disabled) return
    item.onClick()
    setIsOpen(false)
  }

  const getTriggerIcon = () => {
    switch (trigger) {
      case 'dots-horizontal':
        return <MoreHorizontal size={size === 'sm' ? 16 : 18} />
      case 'chevron':
        return <ChevronDown size={size === 'sm' ? 14 : 16} />
      case 'custom':
        return customTrigger
      default:
        return <MoreVertical size={size === 'sm' ? 16 : 18} />
    }
  }

  return (
    <div ref={menuRef} className={`${styles.wrapper} ${className}`}>
      <button
        ref={triggerRef}
        className={`${styles.trigger} ${styles[size]} ${isOpen ? styles.active : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {label && <span className={styles.triggerLabel}>{label}</span>}
        {getTriggerIcon()}
      </button>

      {isOpen && (
        <div className={`${styles.menu} ${styles[position]}`} role="menu">
          {items.map((item, index) => (
            <div key={item.id}>
              {item.divider && index > 0 && <div className={styles.divider} />}
              <button
                className={`${styles.menuItem} ${item.danger ? styles.danger : ''} ${item.disabled ? styles.disabled : ''}`}
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                role="menuitem"
              >
                {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                <span className={styles.itemLabel}>{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Inline action buttons for tables
interface InlineActionsProps {
  children: ReactNode
  className?: string
}

export function InlineActions({ children, className = '' }: InlineActionsProps) {
  return (
    <div className={`${styles.inlineActions} ${className}`}>
      {children}
    </div>
  )
}

interface InlineActionButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

export function InlineActionButton({ 
  icon, 
  label, 
  onClick, 
  disabled = false,
  danger = false 
}: InlineActionButtonProps) {
  return (
    <button
      className={`${styles.inlineBtn} ${danger ? styles.danger : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  )
}

export default ActionMenu
