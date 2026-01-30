import { ReactNode, forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react'
import { AlertCircle, CheckCircle, Info } from 'lucide-react'
import styles from './FormField.module.css'

interface BaseFieldProps {
  label?: string
  error?: string
  success?: string
  hint?: string
  required?: boolean
  className?: string
}

// Input Field
interface InputFieldProps extends BaseFieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(({
  label,
  error,
  success,
  hint,
  required,
  className = '',
  leftIcon,
  rightIcon,
  id,
  ...props
}, ref) => {
  const fieldId = id || `field-${Math.random().toString(36).substr(2, 9)}`
  const hasError = !!error
  const hasSuccess = !!success

  return (
    <div className={`${styles.field} ${className}`}>
      {label && (
        <label htmlFor={fieldId} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <div className={`${styles.inputWrapper} ${hasError ? styles.error : ''} ${hasSuccess ? styles.success : ''}`}>
        {leftIcon && <span className={styles.leftIcon}>{leftIcon}</span>}
        <input
          ref={ref}
          id={fieldId}
          className={`${styles.input} ${leftIcon ? styles.hasLeftIcon : ''} ${rightIcon ? styles.hasRightIcon : ''}`}
          aria-invalid={hasError}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...props}
        />
        {rightIcon && <span className={styles.rightIcon}>{rightIcon}</span>}
      </div>
      {error && (
        <div id={`${fieldId}-error`} className={styles.errorMessage} role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
      {success && !error && (
        <div className={styles.successMessage}>
          <CheckCircle size={14} />
          <span>{success}</span>
        </div>
      )}
      {hint && !error && !success && (
        <div id={`${fieldId}-hint`} className={styles.hint}>
          <Info size={14} />
          <span>{hint}</span>
        </div>
      )}
    </div>
  )
})

InputField.displayName = 'InputField'

// Textarea Field
interface TextareaFieldProps extends BaseFieldProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(({
  label,
  error,
  success,
  hint,
  required,
  className = '',
  id,
  ...props
}, ref) => {
  const fieldId = id || `field-${Math.random().toString(36).substr(2, 9)}`
  const hasError = !!error
  const hasSuccess = !!success

  return (
    <div className={`${styles.field} ${className}`}>
      {label && (
        <label htmlFor={fieldId} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <div className={`${styles.inputWrapper} ${hasError ? styles.error : ''} ${hasSuccess ? styles.success : ''}`}>
        <textarea
          ref={ref}
          id={fieldId}
          className={styles.textarea}
          aria-invalid={hasError}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...props}
        />
      </div>
      {error && (
        <div id={`${fieldId}-error`} className={styles.errorMessage} role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
      {success && !error && (
        <div className={styles.successMessage}>
          <CheckCircle size={14} />
          <span>{success}</span>
        </div>
      )}
      {hint && !error && !success && (
        <div id={`${fieldId}-hint`} className={styles.hint}>
          <Info size={14} />
          <span>{hint}</span>
        </div>
      )}
    </div>
  )
})

TextareaField.displayName = 'TextareaField'

// Select Field
interface SelectFieldProps extends BaseFieldProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  children: ReactNode
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(({
  label,
  error,
  success,
  hint,
  required,
  className = '',
  id,
  children,
  ...props
}, ref) => {
  const fieldId = id || `field-${Math.random().toString(36).substr(2, 9)}`
  const hasError = !!error
  const hasSuccess = !!success

  return (
    <div className={`${styles.field} ${className}`}>
      {label && (
        <label htmlFor={fieldId} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <div className={`${styles.inputWrapper} ${hasError ? styles.error : ''} ${hasSuccess ? styles.success : ''}`}>
        <select
          ref={ref}
          id={fieldId}
          className={styles.select}
          aria-invalid={hasError}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...props}
        >
          {children}
        </select>
      </div>
      {error && (
        <div id={`${fieldId}-error`} className={styles.errorMessage} role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
      {success && !error && (
        <div className={styles.successMessage}>
          <CheckCircle size={14} />
          <span>{success}</span>
        </div>
      )}
      {hint && !error && !success && (
        <div id={`${fieldId}-hint`} className={styles.hint}>
          <Info size={14} />
          <span>{hint}</span>
        </div>
      )}
    </div>
  )
})

SelectField.displayName = 'SelectField'

// Checkbox Field
interface CheckboxFieldProps extends BaseFieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> {
  children?: ReactNode
}

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(({
  label,
  error,
  hint,
  className = '',
  id,
  children,
  ...props
}, ref) => {
  const fieldId = id || `field-${Math.random().toString(36).substr(2, 9)}`

  return (
    <div className={`${styles.checkboxField} ${className}`}>
      <label className={styles.checkboxLabel}>
        <input
          ref={ref}
          type="checkbox"
          id={fieldId}
          className={styles.checkbox}
          {...props}
        />
        <span className={styles.checkboxBox} />
        <span className={styles.checkboxText}>{children || label}</span>
      </label>
      {error && (
        <div className={styles.errorMessage} role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
      {hint && !error && (
        <div className={styles.hint}>
          <Info size={14} />
          <span>{hint}</span>
        </div>
      )}
    </div>
  )
})

CheckboxField.displayName = 'CheckboxField'

// Form validation helper
export interface FormErrors {
  [key: string]: string | undefined
}

export function validateRequired(value: string | undefined | null, fieldName: string): string | undefined {
  if (!value || value.trim() === '') {
    return `${fieldName} is required`
  }
  return undefined
}

export function validateEmail(value: string): string | undefined {
  if (!value) return undefined
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(value)) {
    return 'Please enter a valid email address'
  }
  return undefined
}

export function validateMinLength(value: string, minLength: number, fieldName: string): string | undefined {
  if (!value) return undefined
  if (value.length < minLength) {
    return `${fieldName} must be at least ${minLength} characters`
  }
  return undefined
}

export function validateMaxLength(value: string, maxLength: number, fieldName: string): string | undefined {
  if (!value) return undefined
  if (value.length > maxLength) {
    return `${fieldName} must be no more than ${maxLength} characters`
  }
  return undefined
}

export default InputField
