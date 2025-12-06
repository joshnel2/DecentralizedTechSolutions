import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import {
  // System
  Users, Lock, FileText,
  // Personal
  User, Calendar, Bell,
  // Firm Settings
  Building2, Workflow, ChevronRight, Settings
} from 'lucide-react'
import styles from './SettingsHubPage.module.css'

interface SettingItem {
  id: string
  name: string
  description: string
  icon: any
  path: string
  badge?: string
  adminOnly?: boolean
}

const systemSettings: SettingItem[] = [
  {
    id: 'manage-users',
    name: 'Manage Users',
    description: 'Manage users associated with this account.',
    icon: Users,
    path: '/app/admin',
    adminOnly: true
  },
  {
    id: 'security-compliance',
    name: 'Security & Compliance',
    description: 'Manage passwords, set up two-factor authentication, and monitor account sessions.',
    icon: Lock,
    path: '/app/settings/security'
  },
  {
    id: 'documents',
    name: 'Documents',
    description: 'View your automation merge fields. Link your account to external document sources.',
    icon: FileText,
    path: '/app/settings/documents',
    adminOnly: true
  }
]

const personalSettings: SettingItem[] = [
  {
    id: 'profile',
    name: 'Profile',
    description: 'Update your profile information and personal settings.',
    icon: User,
    path: '/app/settings/profile'
  },
  {
    id: 'calendar-sync',
    name: 'Calendar Sync',
    description: 'Connect your account to Google, Zoom or Microsoft 365.',
    icon: Calendar,
    path: '/app/settings/integrations'
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Manage email and in-app notification settings.',
    icon: Bell,
    path: '/app/settings/notifications'
  }
]

const firmSettings: SettingItem[] = [
  {
    id: 'firm-preferences',
    name: 'Firm Preferences',
    description: 'Matter numbering and practice areas.',
    icon: Building2,
    path: '/app/settings/firm',
    adminOnly: true
  },
  {
    id: 'automated-workflows',
    name: 'Automated Workflows',
    description: "Speed up your firm's processes using automated workflows.",
    icon: Workflow,
    path: '/app/admin',
    adminOnly: true
  },
  {
    id: 'api-keys',
    name: 'API Keys',
    description: 'Manage API keys for third-party integrations and developer access.',
    icon: Settings,
    path: '/app/settings/api-keys',
    adminOnly: true
  }
]

export function SettingsHubPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  const renderSettingItem = (item: SettingItem) => {
    // Skip admin-only items for non-admin users
    if (item.adminOnly && !isAdmin) return null

    return (
      <button
        key={item.id}
        className={styles.settingItem}
        onClick={() => navigate(item.path)}
      >
        <div className={styles.itemIcon}>
          <item.icon size={22} />
        </div>
        <div className={styles.itemContent}>
          <div className={styles.itemHeader}>
            <h3>{item.name}</h3>
            {item.badge && (
              <span className={styles.badge}>{item.badge}</span>
            )}
          </div>
          <p>{item.description}</p>
        </div>
        <ChevronRight size={20} className={styles.chevron} />
      </button>
    )
  }

  return (
    <div className={styles.settingsHub}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <Settings size={32} />
        </div>
        <div>
          <h1>Settings</h1>
          <p>Manage your account, preferences, and firm configuration</p>
        </div>
      </div>

      <div className={styles.settingsGrid}>
        {/* SYSTEM Settings */}
        {isAdmin && (
          <section className={styles.settingsSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>SYSTEM</span>
            </div>
            <div className={styles.settingsList}>
              {systemSettings.map(renderSettingItem)}
            </div>
          </section>
        )}

        {/* PERSONAL Settings */}
        <section className={styles.settingsSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>PERSONAL</span>
          </div>
          <div className={styles.settingsList}>
            {personalSettings.map(renderSettingItem)}
          </div>
        </section>

        {/* FIRM SETTINGS */}
        {isAdmin && (
          <section className={styles.settingsSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>FIRM SETTINGS</span>
            </div>
            <div className={styles.settingsList}>
              {firmSettings.map(renderSettingItem)}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
