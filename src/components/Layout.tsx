import { useState, useMemo } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useDataStore } from '../stores/dataStore'
import { 
  LayoutDashboard, Briefcase, Users, Calendar, DollarSign, 
  Clock, BarChart3, Settings, LogOut, ChevronDown,
  Bell, Sparkles, Menu, X, FolderOpen, Shield, Key, UserCircle,
  Building2, UsersRound, Link2, TrendingUp, Lock, Wallet, Landmark, PiggyBank
} from 'lucide-react'
import { clsx } from 'clsx'
import styles from './Layout.module.css'

const navItems = [
  { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/app/matters', label: 'Matters', icon: Briefcase },
  { path: '/app/clients', label: 'Clients', icon: Users },
  { path: '/app/calendar', label: 'Calendar', icon: Calendar },
  { path: '/app/billing', label: 'Billing', icon: DollarSign },
  { path: '/app/trust', label: 'Trust/IOLTA', icon: Landmark },
  { path: '/app/time', label: 'Time Tracking', icon: Clock },
  { path: '/app/documents', label: 'Documents', icon: FolderOpen },
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
  const { notifications, clients, invoices } = useDataStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const unreadCount = notifications.filter(n => !n.read).length
  
  // Check if user is admin or owner
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  
  // Calculate account balances (demo data)
  const accountBalances = useMemo(() => {
    // Sum up trust/retainer balances from clients
    const totalRetainers = clients.reduce((sum, c) => sum + (c.clientInfo?.trustBalance || 0), 0)
    // Calculate outstanding AR from invoices
    const outstandingAR = invoices
      .filter(i => i.status !== 'paid' && i.status !== 'void')
      .reduce((sum, i) => sum + i.amountDue, 0)
    // Demo operating account balance
    const operatingBalance = 284750.00
    
    return {
      operating: operatingBalance,
      trust: totalRetainers || 127500.00, // Demo fallback
      outstanding: outstandingAR || 49750.00 // Demo fallback
    }
  }, [clients, invoices])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={clsx(styles.sidebar, !sidebarOpen && styles.collapsed)}>
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
            {sidebarOpen && <span className={styles.logoText}>Apex</span>}
          </div>
          <button 
            className={styles.toggleBtn}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => clsx(styles.navItem, isActive && styles.active)}
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}

          <NavLink
            to="/app/ai"
            className={({ isActive }) => clsx(styles.navItem, styles.aiNav, isActive && styles.active)}
          >
            <Sparkles size={20} />
            {sidebarOpen && <span>AI Assistant</span>}
          </NavLink>

          <div className={styles.navDivider} />

          <div className={styles.settingsSection}>
            <button 
              className={clsx(styles.navItem, settingsOpen && styles.expanded)}
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <Settings size={20} />
              {sidebarOpen && (
                <>
                  <span>Settings</span>
                  <ChevronDown 
                    size={16} 
                    className={clsx(styles.chevron, settingsOpen && styles.rotated)} 
                  />
                </>
              )}
            </button>
            {settingsOpen && sidebarOpen && (
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
        </nav>

        {/* Accounts Section - Admin Only */}
        {isAdmin && sidebarOpen && (
          <div className={styles.accountsSection}>
            <div className={styles.accountsHeader}>
              <Wallet size={14} />
              <span>Accounts</span>
            </div>
            <div className={styles.accountsList}>
              <div className={styles.accountItem}>
                <div className={styles.accountIcon}>
                  <Landmark size={14} />
                </div>
                <div className={styles.accountInfo}>
                  <span className={styles.accountLabel}>Operating</span>
                  <span className={styles.accountBalance}>
                    ${accountBalances.operating.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className={styles.accountItem}>
                <div className={styles.accountIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
                  <PiggyBank size={14} />
                </div>
                <div className={styles.accountInfo}>
                  <span className={styles.accountLabel}>Trust/IOLTA</span>
                  <span className={styles.accountBalance} style={{ color: '#10B981' }}>
                    ${accountBalances.trust.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className={styles.accountItem}>
                <div className={styles.accountIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }}>
                  <DollarSign size={14} />
                </div>
                <div className={styles.accountInfo}>
                  <span className={styles.accountLabel}>Outstanding AR</span>
                  <span className={styles.accountBalance} style={{ color: '#F59E0B' }}>
                    ${accountBalances.outstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {sidebarOpen && (
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
            <h1 className={styles.pageTitle}>
              {navItems.find(i => location.pathname.startsWith(i.path))?.label || 
               settingsItems.find(i => location.pathname === i.path)?.label ||
               (location.pathname === '/app/ai' ? 'AI Assistant' : 'Dashboard')}
            </h1>
          </div>

          <div className={styles.headerRight}>
            {/* Notifications */}
            <div className={styles.headerDropdown}>
              <button 
                className={styles.iconBtn}
                onClick={() => setNotificationsOpen(!notificationsOpen)}
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
                onClick={() => setUserMenuOpen(!userMenuOpen)}
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
    </div>
  )
}
