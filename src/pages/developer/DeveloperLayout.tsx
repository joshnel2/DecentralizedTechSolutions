import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { 
  Book, Code, Key, Rocket, Shield, Zap, Menu, X,
  ChevronRight, ExternalLink, LogIn, User
} from 'lucide-react'
import styles from './DeveloperPortal.module.css'

const navItems = [
  { path: '/developer', label: 'Overview', icon: Book, exact: true },
  { path: '/developer/getting-started', label: 'Getting Started', icon: Rocket },
  { path: '/developer/authentication', label: 'Authentication', icon: Shield },
  { path: '/developer/api-reference', label: 'API Reference', icon: Code },
  { path: '/developer/rate-limits', label: 'Rate Limits', icon: Zap },
  { path: '/developer/apps', label: 'My Apps', icon: Key, requiresAuth: true },
]

export function DeveloperLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path
    return location.pathname.startsWith(path)
  }

  const canAccessItem = (item: typeof navItems[0]) => {
    if (!item.requiresAuth) return true
    return isAuthenticated && ['owner', 'admin'].includes(user?.role || '')
  }

  return (
    <div className={styles.developerPortal}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Link to="/developer" className={styles.logo}>
              <div className={styles.logoIcon}>
                <Code size={24} />
              </div>
              <span>Apex Developers</span>
            </Link>
          </div>

          <nav className={styles.headerNav}>
            <Link to="/developer/getting-started">Docs</Link>
            <Link to="/developer/api-reference">API Reference</Link>
            <Link to="/developer/apps">My Apps</Link>
          </nav>

          <div className={styles.headerRight}>
            {isAuthenticated ? (
              <div className={styles.userMenu}>
                <Link to="/app" className={styles.backToApp}>
                  <ExternalLink size={16} />
                  Back to Apex
                </Link>
                <div className={styles.userAvatar}>
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
              </div>
            ) : (
              <Link to="/login" className={styles.signInBtn}>
                <LogIn size={16} />
                Sign In
              </Link>
            )}

            <button 
              className={styles.mobileMenuBtn}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      <div className={styles.mainContainer}>
        {/* Sidebar */}
        <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.open : ''}`}>
          <nav className={styles.sidebarNav}>
            {navItems.map(item => {
              const accessible = canAccessItem(item)
              return (
                <Link
                  key={item.path}
                  to={accessible ? item.path : '/developer/apps'}
                  className={`${styles.navItem} ${isActive(item.path, item.exact) ? styles.active : ''} ${!accessible ? styles.locked : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  {item.requiresAuth && !accessible && (
                    <span className={styles.authBadge}>Admin</span>
                  )}
                  <ChevronRight size={16} className={styles.chevron} />
                </Link>
              )
            })}
          </nav>

          <div className={styles.sidebarFooter}>
            <div className={styles.versionBadge}>API v1.0</div>
            <a href="mailto:support@apexlegal.app" className={styles.supportLink}>
              Need help? Contact Support
            </a>
          </div>
        </aside>

        {/* Main Content */}
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
