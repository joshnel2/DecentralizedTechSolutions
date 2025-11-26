import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import {
  // System
  CreditCard, Users, UserCog, Shield, Tag, Trash2, Lock, FileText, 
  RefreshCw, BarChart3,
  // Personal
  User, Palette, Smartphone, Calendar, AppWindow, TextSelect, Bell, 
  Scale, Gift,
  // Firm Settings
  Building2, DollarSign, Wallet, Database, Share2, MessageSquare, 
  Workflow, ChevronRight, Settings, Sparkles
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
    id: 'account-payment',
    name: 'Account and Payment Info',
    description: 'Manage your account subscription and payment methods.',
    icon: CreditCard,
    path: '/app/settings/account',
    adminOnly: true
  },
  {
    id: 'manage-users',
    name: 'Manage Users',
    description: 'Manage users associated with this account.',
    icon: Users,
    path: '/app/admin',
    adminOnly: true
  },
  {
    id: 'groups-titles',
    name: 'Groups and Job Titles',
    description: 'Manage your groups and job titles.',
    icon: UserCog,
    path: '/app/settings/team',
    adminOnly: true
  },
  {
    id: 'roles-permissions',
    name: 'Roles and Permissions',
    description: 'Manage roles for the account.',
    icon: Shield,
    path: '/app/admin',
    badge: 'New',
    adminOnly: true
  },
  {
    id: 'custom-fields',
    name: 'Custom Fields',
    description: 'Create individual custom fields or custom field sets.',
    icon: Tag,
    path: '/app/settings/custom-fields',
    adminOnly: true
  },
  {
    id: 'recovery-bin',
    name: 'Recovery Bin',
    description: 'Recover recently deleted time entries, persons, companies, tasks, and calendar entries.',
    icon: Trash2,
    path: '/app/settings/recovery-bin'
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
    description: 'View your automation merge fields. Link your account to external document sources. Edit document preview settings.',
    icon: FileText,
    path: '/app/settings/documents',
    adminOnly: true
  },
  {
    id: 'bill-syncing',
    name: 'Bill Syncing',
    description: 'Sync your contacts and bills with accounting software.',
    icon: RefreshCw,
    path: '/app/settings/integrations',
    adminOnly: true
  },
  {
    id: 'aggregate-reporting',
    name: 'Aggregate Reporting Participation',
    description: 'Firm participation in industry-wide statistics.',
    icon: BarChart3,
    path: '/app/settings/reporting',
    adminOnly: true
  }
]

const personalSettings: SettingItem[] = [
  {
    id: 'profile',
    name: 'Profile',
    description: 'Update your profile information, personal performance settings, and maildrop email aliases.',
    icon: User,
    path: '/app/settings/profile'
  },
  {
    id: 'appearance',
    name: 'Appearance',
    description: 'Customize how Apex looks on your device.',
    icon: Palette,
    path: '/app/settings/appearance'
  },
  {
    id: 'mobile-app',
    name: 'Apex Mobile App',
    description: 'Download Apex Mobile. Manage your device authorization and notifications.',
    icon: Smartphone,
    path: '/app/settings/mobile'
  },
  {
    id: 'calendar-sync',
    name: 'Contact and Calendar Sync',
    description: 'Connect your account to Google, Zoom or Microsoft 365.',
    icon: Calendar,
    path: '/app/settings/integrations'
  },
  {
    id: 'apps',
    name: 'Apps',
    description: 'Authorize 3rd party client applications.',
    icon: AppWindow,
    path: '/app/settings/apps'
  },
  {
    id: 'text-snippets',
    name: 'Text Snippets',
    description: 'Manage your text snippets library.',
    icon: TextSelect,
    path: '/app/settings/snippets'
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Manage pop-up reminders, email, and in-app notification settings.',
    icon: Bell,
    path: '/app/settings/notifications'
  },
  {
    id: 'court-rules',
    name: 'Court Rules',
    description: 'Manage your Court Rules settings.',
    icon: Scale,
    path: '/app/settings/court-rules'
  },
  {
    id: 'referral-rewards',
    name: 'My Referral Rewards Center',
    description: 'Earn rewards for every friend who joins Apex!',
    icon: Gift,
    path: '/app/settings/referrals',
    badge: '$500'
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
    id: 'billing',
    name: 'Billing',
    description: 'Edit your bill settings, themes, payment profiles, and UTBMS options, enable hard and soft cost recording.',
    icon: DollarSign,
    path: '/app/settings/billing',
    adminOnly: true
  },
  {
    id: 'online-payments',
    name: 'Online Payments',
    description: 'Manage your online payment options.',
    icon: Wallet,
    path: '/app/settings/payments',
    adminOnly: true
  },
  {
    id: 'data-escrow',
    name: 'Data Escrow',
    description: 'Manage back-ups using cloud storage.',
    icon: Database,
    path: '/app/settings/data-escrow',
    adminOnly: true
  },
  {
    id: 'co-counsel-sharing',
    name: 'Apex for Co-Counsel & Sharing',
    description: 'Edit branding options and email notifications. Manage resources and bill preview settings.',
    icon: Share2,
    path: '/app/settings/sharing',
    adminOnly: true
  },
  {
    id: 'text-messaging',
    name: 'Text Messaging',
    description: 'Manage text messaging from Apex, including text notifications for calendar events.',
    icon: MessageSquare,
    path: '/app/settings/text-messaging',
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
    id: 'ai-configuration',
    name: 'AI Configuration',
    description: 'Configure AI services for intelligent features like document analysis and suggestions.',
    icon: Sparkles,
    path: '/app/settings/ai',
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

          {/* Referral Banner */}
          <div className={styles.referralBanner}>
            <div className={styles.referralContent}>
              <Gift size={32} />
              <div>
                <h3>Love Apex? Share it!</h3>
                <p>Earn $500 when someone you refer signs up. Plus, every referral is an entry to win a VIP trip! Join Apex's Referral Program today! 🎉</p>
              </div>
            </div>
            <button 
              className={styles.referralBtn}
              onClick={() => navigate('/app/settings/referrals')}
            >
              Learn More
            </button>
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
