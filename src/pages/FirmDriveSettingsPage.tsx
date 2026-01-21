import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

// This page is no longer needed - drive storage is managed by platform admin
// Redirect users to documents page
export function FirmDriveSettingsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  useEffect(() => {
    // Redirect to appropriate page
    if (isAdmin) {
      navigate('/app/apex-drive', { replace: true })
    } else {
      navigate('/app/documents', { replace: true })
    }
  }, [navigate, isAdmin])

  return null
}
