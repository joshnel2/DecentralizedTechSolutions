import { useSessionTimeout } from '../hooks/useSessionTimeout'
import { Clock, LogOut, RefreshCw } from 'lucide-react'
import styles from './SessionTimeoutWarning.module.css'

/**
 * Session timeout warning modal
 * Shows when user session is about to expire
 * Critical for law firm security compliance
 */
export function SessionTimeoutWarning() {
  const { showWarning, remainingTimeFormatted, extendSession, dismissWarning } = useSessionTimeout({
    warningMinutes: 5,
    timeoutMinutes: 30,
  })
  
  if (!showWarning) return null
  
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>
          <Clock size={48} />
        </div>
        
        <h2 className={styles.title}>Session Expiring Soon</h2>
        
        <p className={styles.message}>
          Your session will expire in <strong>{remainingTimeFormatted}</strong> due to inactivity.
          Click "Stay Logged In" to continue working.
        </p>
        
        <div className={styles.countdown}>
          <div className={styles.timer}>{remainingTimeFormatted}</div>
        </div>
        
        <div className={styles.actions}>
          <button 
            className={styles.stayBtn}
            onClick={extendSession}
          >
            <RefreshCw size={16} />
            Stay Logged In
          </button>
          <button 
            className={styles.logoutBtn}
            onClick={dismissWarning}
          >
            <LogOut size={16} />
            Log Out Now
          </button>
        </div>
        
        <p className={styles.notice}>
          For security, inactive sessions are automatically logged out.
        </p>
      </div>
    </div>
  )
}
