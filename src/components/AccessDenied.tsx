/**
 * AccessDenied component - shown when a user tries to access a resource
 * they don't have permission to view (403 from API).
 */
import { ShieldOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface AccessDeniedProps {
  /** The type of resource (e.g., "matter", "document", "client") */
  resourceType?: string
  /** Optional message from the server */
  message?: string
  /** Where to navigate back to */
  backTo?: string
  /** Label for the back button */
  backLabel?: string
}

export function AccessDenied({ 
  resourceType = 'resource', 
  message,
  backTo,
  backLabel = 'Go Back'
}: AccessDeniedProps) {
  const navigate = useNavigate()

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1.5rem',
      }}>
        <ShieldOff size={32} color="#EF4444" />
      </div>
      
      <h2 style={{ 
        fontSize: '1.5rem', 
        fontWeight: 600, 
        color: '#111827',
        marginBottom: '0.5rem',
      }}>
        Access Denied
      </h2>
      
      <p style={{ 
        color: '#6B7280', 
        fontSize: '0.95rem',
        maxWidth: 400,
        marginBottom: '1.5rem',
        lineHeight: 1.6,
      }}>
        {message || `You don't have permission to view this ${resourceType}. Contact your firm administrator if you believe this is an error.`}
      </p>

      <button
        onClick={() => backTo ? navigate(backTo) : navigate(-1)}
        style={{
          padding: '0.6rem 1.5rem',
          backgroundColor: '#3B82F6',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {backLabel}
      </button>
    </div>
  )
}

export default AccessDenied
