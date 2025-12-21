import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useDataStore } from '../stores/dataStore'
import { useBillingStore } from '../stores/billingStore'
import { useTemplateStore } from '../stores/templateStore'
import { useAIChat } from '../contexts/AIChatContext'
import { useTimer, formatElapsedTime } from '../contexts/TimerContext'
import { AIChat } from './AIChat'
import { BackgroundTaskBar } from './BackgroundTaskBar'
import { integrationsApi } from '../services/api'
import { 
  LayoutDashboard, Briefcase, Users, Calendar, DollarSign, 
  Clock, BarChart3, Settings, LogOut, ChevronDown,
  Bell, Sparkles, Menu, X, FolderOpen, Shield, Key, UserCircle,
  Building2, UsersRound, Link2, TrendingUp, Lock, FileStack,
  Play, Pause, Square, Mail, Cloud, FileText, Video, MessageSquare, 
  Calculator, HardDrive
} from 'lucide-react'
import { clsx } from 'clsx'
import styles from './Layout.module.css'

// Integration icons and labels for sidebar
const integrationConfig: Record<string, { label: string; icon: any; path: string }> = {
  outlook: { label: 'Outlook', icon: Mail, path: '/app/integrations/outlook' },
  google: { label: 'Google Calendar', icon: Calendar, path: '/app/integrations/google-calendar' },
  quickbooks: { label: 'QuickBooks', icon: Calculator, path: '/app/integrations/quickbooks' },
  onedrive: { label: 'OneDrive', icon: Cloud, path: '/app/integrations/onedrive' },
  googledrive: { label: 'Google Drive', icon: HardDrive, path: '/app/integrations/google-drive' },
  dropbox: { label: 'Dropbox', icon: FolderOpen, path: '/app/integrations/dropbox' },
  docusign: { label: 'DocuSign', icon: FileText, path: '/app/integrations/docusign' },
  slack: { label: 'Slack', icon: MessageSquare, path: '/app/integrations/slack' },
  zoom: { label: 'Zoom', icon: Video, path: '/app/integrations/zoom' },
  quicken: { label: 'Quicken', icon: DollarSign, path: '/app/integrations/quicken' },
}

const navItems = [
  { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/app/matters', label: 'Matters', icon: Briefcase },
  { path: '/app/clients', label: 'Clients', icon: Users },
  { path: '/app/calendar', label: 'Calendar', icon: Calendar },
  { path: '/app/billing', label: 'Billing', icon: DollarSign },
  { path: '/app/time', label: 'Time Tracking', icon: Clock },
  { path: '/app/documents', label: 'Documents', icon: FolderOpen },
  { path: '/app/document-automation', label: 'Document Automation', icon: FileStack },
  { path: '/app/reports', label: 'Reports', icon: BarChart3 },
  { path: '/app/analytics', label: 'Analytics', icon: TrendingUp },
]

const settingsItems = [
  { path: '/app/settings', label: 'My Settings', icon: UserCircle },
  { path: '/app/settings/security', label: 'Security', icon: Lock },
  { path: '/app/settings/firm', label: 'Firm Settings', icon: Building2 },
  { path: '/app/settings/team', label: 'Team & Groups', icon: UsersRound },
  { path: '/app/settings/integrations', label: 'Integrations', icon: Link2 },
  { path: '/app/settings/api-keys', label: 'API Keys', icon: Key },
  { path: '/app/admin', label: 'Firm Admin', icon: Shield },
]

export function Layout() {
  const { user, firm, logout } = useAuthStore()
  const { notifications, fetchMatterTypes } = useDataStore()
  const { fetchAll: fetchBillingData, isInitialized: billingInitialized } = useBillingStore()
  const { fetchAll: fetchTemplateData, isInitialized: templateInitialized } = useTemplateStore()
  const { timer, isTimerActive, pauseTimer, resumeTimer, stopTimer } = useTimer()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [connectedIntegrations, setConnectedIntegrations] = useState<string[]>([])
  const { isOpen: aiChatOpen, openChat, closeChat } = useAIChat()

  const unreadCount = notifications.filter(n => !n.read).length

  // Fetch connected integrations
  useEffect(() => {
    const fetchIntegrations = async () => {
      try {
        const data = await integrationsApi.getAll()
        const connected = Object.entries(data.integrations || {})
          .filter(([_, status]: [string, any]) => status?.isConnected)
          .map(([provider]) => provider)
        // Remove duplicates just in case
        const uniqueConnected = [...new Set(connected)]
        setConnectedIntegrations(uniqueConnected)
      } catch (error) {
        // Silently fail - integrations might not be configured
      }
    }
    fetchIntegrations()
  }, [location.pathname]) // Refresh when navigating

  // Initialize stores with data from database
  useEffect(() => {
    fetchMatterTypes()
    if (!billingInitialized) {
      fetchBillingData()
    }
    if (!templateInitialized) {
      fetchTemplateData()
    }
  }, [fetchMatterTypes, fetchBillingData, fetchTemplateData, billingInitialized, templateInitialized])

  // Handle mobile detection and window resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
      if (window.innerWidth > 768) {
        setMobileSidebarOpen(false)
      }
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (isMobile) {
      setMobileSidebarOpen(false)
    }
  }, [location.pathname, isMobile])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setNotificationsOpen(false)
      setUserMenuOpen(false)
    }
    
    if (notificationsOpen || userMenuOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [notificationsOpen, userMenuOpen])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleStopTimerFromHeader = () => {
    stopTimer()
    navigate('/app/time', { state: { showSaveModal: true } })
  }

  const toggleMobileSidebar = () => {
    setMobileSidebarOpen(!mobileSidebarOpen)
  }

  const closeMobileSidebar = () => {
    setMobileSidebarOpen(false)
  }

  return (
    <div className={styles.layout}>
      {/* Mobile Overlay */}
      <div 
        className={clsx(styles.mobileOverlay, mobileSidebarOpen && styles.visible)}
        onClick={closeMobileSidebar}
      />

      {/* Sidebar */}
      <aside className={clsx(
        styles.sidebar, 
        !sidebarOpen && styles.collapsed,
        mobileSidebarOpen && styles.mobileOpen
      )}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L28 28H4L16 4Z" fill="url(#grad)" stroke="#F59E0B" strokeWidth="1.5"/>
                <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
                <defs>
                  <linearGradient id="grad" x1="16" y1="4" x2="16" y2="28">
                    <stop stopColor="#FBBF24"/>
                    <stop offset="1" stopColor="#F59E0B"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            {(sidebarOpen || isMobile) && <span className={styles.logoText}>Apex</span>}
          </div>
          {isMobile && (
            <button 
              className={styles.toggleBtn}
              onClick={closeMobileSidebar}
            >
              <X size={18} />
            </button>
          )}
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => clsx(styles.navItem, isActive && styles.active)}
            >
              <item.icon size={20} />
              {(sidebarOpen || isMobile) && <span>{item.label}</span>}
            </NavLink>
          ))}

          <NavLink
            to="/app/ai"
            className={({ isActive }) => clsx(styles.navItem, styles.aiNav, isActive && styles.active)}
          >
            <Sparkles size={20} />
            {(sidebarOpen || isMobile) && <span>AI Assistant</span>}
          </NavLink>

          <div className={styles.navDivider} />

          {/* Settings with dropdown */}
          <div className={styles.settingsSection}>
            <button 
              className={clsx(styles.navItem, settingsOpen && styles.expanded)}
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <Settings size={20} />
              {(sidebarOpen || isMobile) && (
                <>
                  <span>Settings</span>
                  <ChevronDown 
                    size={16} 
                    className={clsx(styles.chevron, settingsOpen && styles.rotated)} 
                  />
                </>
              )}
            </button>
            {settingsOpen && (sidebarOpen || isMobile) && (
              <div className={styles.settingsSubmenu}>
                {settingsItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => clsx(styles.subNavItem, isActive && styles.active)}
                  >
                    <item.icon size={16} />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* Connected Integrations - Always visible below Settings */}
          {connectedIntegrations.length > 0 && (
            <div className={styles.integrationsSection}>
              {(sidebarOpen || isMobile) && (
                <span className={styles.sectionLabel}>Connected</span>
              )}
              {connectedIntegrations.map(provider => {
                const config = integrationConfig[provider]
                if (!config) return null
                const Icon = config.icon
                return (
                  <NavLink
                    key={provider}
                    to={config.path}
                    className={({ isActive }) => clsx(styles.navItem, styles.integrationNav, isActive && styles.active)}
                  >
                    <Icon size={20} />
                    {(sidebarOpen || isMobile) && <span>{config.label}</span>}
                  </NavLink>
                )
              })}
            </div>
          )}
        </nav>

        {(sidebarOpen || isMobile) && (
          <div className={styles.sidebarFooter}>
            <div className={styles.firmInfo}>
              <Shield size={14} />
              <span>{firm?.name || 'Setup Required'}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button 
              className={styles.mobileMenuBtn}
              onClick={toggleMobileSidebar}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <h1 className={styles.pageTitle}>
              {navItems.find(i => location.pathname.startsWith(i.path))?.label || 
               settingsItems.find(i => location.pathname === i.path)?.label ||
               (location.pathname === '/app/ai' ? 'AI Assistant' : 'Dashboard')}
            </h1>
          </div>

          <div className={styles.headerRight}>
            {/* Running Timer */}
            {isTimerActive && (
              <div className={clsx(styles.headerTimer, timer.isPaused && styles.headerTimerPaused)}>
                <button 
                  className={styles.headerTimerDisplay}
                  onClick={() => navigate('/app/time')}
                  title="Go to Time Tracking"
                >
                  <div className={clsx(styles.headerTimerPulse, timer.isPaused && styles.paused)}>
                    <Clock size={16} />
                  </div>
                  <div className={styles.headerTimerInfo}>
                    <span className={styles.headerTimerMatter}>{timer.matterName || 'Timer'}</span>
                    <span className={clsx(styles.headerTimerElapsed, timer.isPaused && styles.paused)}>
                      {formatElapsedTime(timer.elapsed)}
                    </span>
                  </div>
                </button>
                <div className={styles.headerTimerActions}>
                  {timer.isPaused ? (
                    <button 
                      className={clsx(styles.headerTimerBtn, styles.playBtn)}
                      onClick={resumeTimer}
                      title="Resume Timer"
                    >
                      <Play size={14} />
                    </button>
                  ) : (
                    <button 
                      className={clsx(styles.headerTimerBtn, styles.pauseBtn)}
                      onClick={pauseTimer}
                      title="Pause Timer"
                    >
                      <Pause size={14} />
                    </button>
                  )}
                  <button 
                    className={clsx(styles.headerTimerBtn, styles.stopBtn)}
                    onClick={handleStopTimerFromHeader}
                    title="Stop Timer"
                  >
                    <Square size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Notifications */}
            <div className={styles.headerDropdown}>
              <button 
                className={styles.iconBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  setNotificationsOpen(!notificationsOpen)
                  setUserMenuOpen(false)
                }}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className={styles.badge}>{unreadCount}</span>
                )}
              </button>
              {notificationsOpen && (
                <div className={styles.dropdown}>
                  <div className={styles.dropdownHeader}>
                    <span>Notifications</span>
                    {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount} new</span>}
                  </div>
                  <div className={styles.dropdownContent}>
                    {notifications.slice(0, 5).map(notif => (
                      <div 
                        key={notif.id} 
                        className={clsx(styles.notifItem, !notif.read && styles.unread)}
                        onClick={() => {
                          if (notif.actionUrl) navigate(notif.actionUrl)
                          setNotificationsOpen(false)
                        }}
                      >
                        <div className={styles.notifIcon}>
                          {notif.type === 'ai_insight' && <Sparkles size={14} />}
                          {notif.type === 'deadline_reminder' && <Clock size={14} />}
                          {notif.type === 'invoice_overdue' && <DollarSign size={14} />}
                        </div>
                        <div className={styles.notifContent}>
                          <strong>{notif.title}</strong>
                          <p>{notif.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User Menu */}
            <div className={styles.headerDropdown}>
              <button 
                className={styles.userBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  setUserMenuOpen(!userMenuOpen)
                  setNotificationsOpen(false)
                }}
              >
                <div className={styles.avatar}>
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
                <span className={styles.userName}>{user?.firstName} {user?.lastName}</span>
                <ChevronDown size={16} />
              </button>
              {userMenuOpen && (
                <div className={styles.dropdown}>
                  <div className={styles.dropdownHeader}>
                    <div>
                      <strong>{user?.firstName} {user?.lastName}</strong>
                      <p>{user?.email}</p>
                    </div>
                  </div>
                  <div className={styles.dropdownContent}>
                    <button onClick={() => { navigate('/app/settings'); setUserMenuOpen(false) }}>
                      <UserCircle size={16} />
                      <span>My Settings</span>
                    </button>
                    <button onClick={() => { navigate('/app/settings/security'); setUserMenuOpen(false) }}>
                      <Lock size={16} />
                      <span>Security</span>
                    </button>
                    <button onClick={handleLogout} className={styles.logoutBtn}>
                      <LogOut size={16} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>

      {/* Floating AI Button - hidden on AI Assistant page to avoid blocking the chat send button */}
      {location.pathname !== '/app/ai' && (
        <button 
          className={styles.aiFloatingBtn}
          onClick={() => openChat()}
          title="Open AI Assistant"
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* AI Chat Panel */}
      <AIChat 
        isOpen={aiChatOpen} 
        onClose={closeChat} 
      />
      
      {/* Global background task progress bar */}
      <BackgroundTaskBar />
    </div>
  )
}
