import { useEffect, useState, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { AIChatProvider } from './contexts/AIChatContext'
import { TimerProvider } from './contexts/TimerContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { Layout } from './components/Layout'

// Lazy load all pages for code splitting
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
const FirmSetupPage = lazy(() => import('./pages/FirmSetupPage').then(m => ({ default: m.FirmSetupPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const MattersPage = lazy(() => import('./pages/MattersPage').then(m => ({ default: m.MattersPage })))
const MatterDetailPage = lazy(() => import('./pages/MatterDetailPage').then(m => ({ default: m.MatterDetailPage })))
const ClientsPage = lazy(() => import('./pages/ClientsPage').then(m => ({ default: m.ClientsPage })))
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage').then(m => ({ default: m.ClientDetailPage })))
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })))
const BillingPage = lazy(() => import('./pages/BillingPage').then(m => ({ default: m.BillingPage })))
const TimeTrackingPage = lazy(() => import('./pages/TimeTrackingPage').then(m => ({ default: m.TimeTrackingPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage').then(m => ({ default: m.DocumentsPage })))
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage').then(m => ({ default: m.AIAssistantPage })))
const BackgroundAgentPage = lazy(() => import('./pages/BackgroundAgentPage').then(m => ({ default: m.BackgroundAgentPage })))
const AgentConsolePage = lazy(() => import('./pages/AgentConsolePage').then(m => ({ default: m.AgentConsolePage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const SettingsHubPage = lazy(() => import('./pages/SettingsHubPage').then(m => ({ default: m.SettingsHubPage })))
const FirmSettingsPage = lazy(() => import('./pages/FirmSettingsPage').then(m => ({ default: m.FirmSettingsPage })))
const FirmAdminPage = lazy(() => import('./pages/FirmAdminPage').then(m => ({ default: m.FirmAdminPage })))
const PermissionsSettingsPage = lazy(() => import('./pages/PermissionsSettingsPage').then(m => ({ default: m.PermissionsSettingsPage })))
const PermissionsAdminPage = lazy(() => import('./pages/PermissionsAdminPage'))
const TeamPage = lazy(() => import('./pages/TeamPage').then(m => ({ default: m.TeamPage })))
const APIKeysPage = lazy(() => import('./pages/APIKeysPage').then(m => ({ default: m.APIKeysPage })))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage').then(m => ({ default: m.IntegrationsPage })))
const OutlookIntegrationPage = lazy(() => import('./pages/OutlookIntegrationPage').then(m => ({ default: m.OutlookIntegrationPage })))
const FileStorageIntegrationPage = lazy(() => import('./pages/FileStorageIntegrationPage').then(m => ({ default: m.FileStorageIntegrationPage })))
const QuickBooksIntegrationPage = lazy(() => import('./pages/QuickBooksIntegrationPage').then(m => ({ default: m.QuickBooksIntegrationPage })))
const CloudStorageIntegrationPage = lazy(() => import('./pages/CloudStorageIntegrationPage').then(m => ({ default: m.CloudStorageIntegrationPage })))
const SlackIntegrationPage = lazy(() => import('./pages/SlackIntegrationPage').then(m => ({ default: m.SlackIntegrationPage })))
const SecuritySettingsPage = lazy(() => import('./pages/SecuritySettingsPage').then(m => ({ default: m.SecuritySettingsPage })))
const FirmAnalyticsPage = lazy(() => import('./pages/FirmAnalyticsPage').then(m => ({ default: m.FirmAnalyticsPage })))
const TrustAccountingPage = lazy(() => import('./pages/TrustAccountingPage').then(m => ({ default: m.TrustAccountingPage })))
const RecoveryBinPage = lazy(() => import('./pages/RecoveryBinPage').then(m => ({ default: m.RecoveryBinPage })))
const CustomFieldsPage = lazy(() => import('./pages/CustomFieldsPage').then(m => ({ default: m.CustomFieldsPage })))
const CourtRulesPage = lazy(() => import('./pages/CourtRulesPage').then(m => ({ default: m.CourtRulesPage })))
const TextSnippetsPage = lazy(() => import('./pages/TextSnippetsPage').then(m => ({ default: m.TextSnippetsPage })))
const DocumentAutomationPage = lazy(() => import('./pages/DocumentAutomationPage').then(m => ({ default: m.DocumentAutomationPage })))
const DocumentTemplatesPage = lazy(() => import('./pages/DocumentTemplatesPage').then(m => ({ default: m.DocumentTemplatesPage })))
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage').then(m => ({ default: m.WorkflowsPage })))
const BulkPermissionsPage = lazy(() => import('./pages/BulkPermissionsPage').then(m => ({ default: m.BulkPermissionsPage })))
const AdminPortalPage = lazy(() => import('./pages/AdminPortalPage').then(m => ({ default: m.AdminPortalPage })))
const SecureAdminLogin = lazy(() => import('./pages/SecureAdminLogin'))
const SecureAdminDashboard = lazy(() => import('./pages/SecureAdminDashboard'))

// New Settings Pages
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage').then(m => ({ default: m.AccountSettingsPage })))
const AppearanceSettingsPage = lazy(() => import('./pages/AppearanceSettingsPage').then(m => ({ default: m.AppearanceSettingsPage })))
const MobileSettingsPage = lazy(() => import('./pages/MobileSettingsPage').then(m => ({ default: m.MobileSettingsPage })))
const AppsSettingsPage = lazy(() => import('./pages/AppsSettingsPage').then(m => ({ default: m.AppsSettingsPage })))
const NotificationsSettingsPage = lazy(() => import('./pages/NotificationsSettingsPage').then(m => ({ default: m.NotificationsSettingsPage })))
const ReferralsPage = lazy(() => import('./pages/ReferralsPage').then(m => ({ default: m.ReferralsPage })))
const BillingSettingsPage = lazy(() => import('./pages/BillingSettingsPage').then(m => ({ default: m.BillingSettingsPage })))
const PaymentsSettingsPage = lazy(() => import('./pages/PaymentsSettingsPage').then(m => ({ default: m.PaymentsSettingsPage })))
const DataEscrowPage = lazy(() => import('./pages/DataEscrowPage').then(m => ({ default: m.DataEscrowPage })))
const SharingSettingsPage = lazy(() => import('./pages/SharingSettingsPage').then(m => ({ default: m.SharingSettingsPage })))
const TextMessagingPage = lazy(() => import('./pages/TextMessagingPage').then(m => ({ default: m.TextMessagingPage })))
const AIConfigPage = lazy(() => import('./pages/AIConfigPage').then(m => ({ default: m.AIConfigPage })))
const ReportingSettingsPage = lazy(() => import('./pages/ReportingSettingsPage').then(m => ({ default: m.ReportingSettingsPage })))
const RedlineAIPage = lazy(() => import('./pages/RedlineAIPage').then(m => ({ default: m.RedlineAIPage })))
const ApexPayPage = lazy(() => import('./pages/ApexPayPage').then(m => ({ default: m.ApexPayPage })))
const ApexPaySettingsPage = lazy(() => import('./pages/ApexPaySettingsPage').then(m => ({ default: m.ApexPaySettingsPage })))

// Drive Integration Pages
const ApexDrivePage = lazy(() => import('./pages/ApexDrivePage').then(m => ({ default: m.ApexDrivePage })))
const DriveBrowsePage = lazy(() => import('./pages/DriveBrowsePage').then(m => ({ default: m.DriveBrowsePage })))
const DriveSetupPage = lazy(() => import('./pages/DriveSetupPage').then(m => ({ default: m.DriveSetupPage })))
const DocumentVersionsPage = lazy(() => import('./pages/DocumentVersionsPage').then(m => ({ default: m.DocumentVersionsPage })))
const DocumentComparePage = lazy(() => import('./pages/DocumentComparePage').then(m => ({ default: m.DocumentComparePage })))
const FolderPermissionsPage = lazy(() => import('./pages/FolderPermissionsPage').then(m => ({ default: m.FolderPermissionsPage })))

// Public Pages
const AboutPage = lazy(() => import('./pages/AboutPage').then(m => ({ default: m.AboutPage })))
const SecurityPage = lazy(() => import('./pages/SecurityPage').then(m => ({ default: m.SecurityPage })))
const IntegrationsPublicPage = lazy(() => import('./pages/IntegrationsPublicPage').then(m => ({ default: m.IntegrationsPublicPage })))
const BlogPage = lazy(() => import('./pages/BlogPage').then(m => ({ default: m.BlogPage })))
const ContactPage = lazy(() => import('./pages/ContactPage').then(m => ({ default: m.ContactPage })))
const DocsPage = lazy(() => import('./pages/DocsPage').then(m => ({ default: m.DocsPage })))
const APIReferencePage = lazy(() => import('./pages/APIReferencePage').then(m => ({ default: m.APIReferencePage })))
const SupportPage = lazy(() => import('./pages/SupportPage').then(m => ({ default: m.SupportPage })))
const StatusPage = lazy(() => import('./pages/StatusPage').then(m => ({ default: m.StatusPage })))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })))
const TermsPage = lazy(() => import('./pages/TermsPage').then(m => ({ default: m.TermsPage })))
const EULAPage = lazy(() => import('./pages/EULAPage').then(m => ({ default: m.EULAPage })))
const CompliancePage = lazy(() => import('./pages/CompliancePage').then(m => ({ default: m.CompliancePage })))

// Scroll to top on route changes
function ScrollToTop() {
  const { pathname } = useLocation()
  
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  
  return null
}

// Loading screen component for lazy-loaded pages
function PageLoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)',
      color: '#fff'
    }}>
      <div style={{ textAlign: 'center' }}>
        <svg width="48" height="48" viewBox="0 0 32 32" fill="none" style={{ marginBottom: '1rem' }}>
          <path d="M16 4L28 28H4L16 4Z" fill="url(#loadGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
          <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
          <defs>
            <linearGradient id="loadGrad" x1="16" y1="4" x2="16" y2="28">
              <stop stopColor="#FBBF24"/>
              <stop offset="1" stopColor="#F59E0B"/>
            </linearGradient>
          </defs>
        </svg>
        <div style={{ 
          width: '40px', 
          height: '40px', 
          border: '3px solid rgba(245, 158, 11, 0.2)', 
          borderTopColor: '#F59E0B', 
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto'
        }} />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}

// Loading screen component for initial auth check
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)',
      color: '#fff'
    }}>
      <div style={{ textAlign: 'center' }}>
        <svg width="48" height="48" viewBox="0 0 32 32" fill="none" style={{ marginBottom: '1rem' }}>
          <path d="M16 4L28 28H4L16 4Z" fill="url(#loadGrad2)" stroke="#F59E0B" strokeWidth="1.5"/>
          <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
          <defs>
            <linearGradient id="loadGrad2" x1="16" y1="4" x2="16" y2="28">
              <stop stopColor="#FBBF24"/>
              <stop offset="1" stopColor="#F59E0B"/>
            </linearGradient>
          </defs>
        </svg>
        <div style={{ 
          width: '40px', 
          height: '40px', 
          border: '3px solid rgba(245, 158, 11, 0.2)', 
          borderTopColor: '#F59E0B', 
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto'
        }} />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore()
  if (isAuthenticated) {
    return <Navigate to={user?.firmId ? '/app/dashboard' : '/setup'} />
  }
  return <>{children}</>
}

// App wrapper to handle auth initialization
function AppContent() {
  const { checkAuth } = useAuthStore()
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      // Try to restore session from server
      try {
        await checkAuth()
      } catch (error) {
        console.log('No active session found')
      } finally {
        setIsInitializing(false)
      }
    }

    initAuth()
  }, [checkAuth])

  // Show loading screen while checking auth
  if (isInitializing) {
    return <LoadingScreen />
  }

  return (
    <Suspense fallback={<PageLoadingScreen />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
        <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
        <Route path="/reset-password" element={<PublicOnlyRoute><ResetPasswordPage /></PublicOnlyRoute>} />
        {/* Public Footer Pages */}
        <Route path="/about" element={<AboutPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/integrations" element={<IntegrationsPublicPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/api" element={<APIReferencePage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/eula" element={<EULAPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        
        {/* Firm Setup */}
        <Route path="/setup" element={
          <PrivateRoute><FirmSetupPage /></PrivateRoute>
        } />
        
        {/* Protected Routes */}
        <Route path="/app" element={
          <PrivateRoute><Layout /></PrivateRoute>
        }>
          <Route index element={<Navigate to="/app/dashboard" />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="matters" element={<MattersPage />} />
          <Route path="matters/:id" element={<MatterDetailPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientDetailPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="apex-pay" element={<ApexPayPage />} />
          <Route path="time" element={<TimeTrackingPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="documents/:documentId/versions" element={<DocumentVersionsPage />} />
          <Route path="documents/:documentId/compare" element={<DocumentComparePage />} />
          <Route path="documents/permissions" element={<FolderPermissionsPage />} />
          <Route path="documents/templates" element={<DocumentTemplatesPage />} />
          <Route path="document-automation" element={<DocumentAutomationPage />} />
          <Route path="ai" element={<AIAssistantPage />} />
          <Route path="background-agent" element={<BackgroundAgentPage />} />
          <Route path="agent-console/:taskId" element={<AgentConsolePage />} />
          <Route path="ai/redline" element={<RedlineAIPage />} />
          
          {/* Analytics */}
          <Route path="analytics" element={<FirmAnalyticsPage />} />
          
          {/* Settings Hub */}
          <Route path="settings" element={<SettingsHubPage />} />
          <Route path="settings/profile" element={<SettingsPage />} />
          <Route path="settings/security" element={<SecuritySettingsPage />} />
          <Route path="settings/firm" element={<FirmSettingsPage />} />
          <Route path="settings/team" element={<TeamPage />} />
          <Route path="settings/integrations" element={<IntegrationsPage />} />
          <Route path="settings/permissions" element={<PermissionsSettingsPage />} />
          
          {/* Integration Data Pages */}
          <Route path="integrations/outlook" element={<OutlookIntegrationPage />} />
          <Route path="integrations/file-storage" element={<FileStorageIntegrationPage />} />
          <Route path="integrations/quickbooks" element={<QuickBooksIntegrationPage />} />
          <Route path="integrations/onedrive" element={<CloudStorageIntegrationPage />} />
          <Route path="integrations/google-drive" element={<CloudStorageIntegrationPage />} />
          <Route path="integrations/dropbox" element={<CloudStorageIntegrationPage />} />
          <Route path="integrations/google-calendar" element={<CalendarPage />} />
          <Route path="integrations/docusign" element={<DocumentsPage />} />
          <Route path="integrations/slack" element={<SlackIntegrationPage />} />
          <Route path="integrations/zoom" element={<CalendarPage />} />
          <Route path="integrations/quicken" element={<QuickBooksIntegrationPage />} />
          
          <Route path="settings/api-keys" element={<APIKeysPage />} />
          <Route path="settings/custom-fields" element={<CustomFieldsPage />} />
          <Route path="settings/recovery-bin" element={<RecoveryBinPage />} />
          <Route path="settings/court-rules" element={<CourtRulesPage />} />
          <Route path="settings/snippets" element={<TextSnippetsPage />} />
          <Route path="settings/documents" element={<DocumentAutomationPage />} />
          <Route path="settings/workflows" element={<WorkflowsPage />} />
          <Route path="settings/bulk-permissions" element={<BulkPermissionsPage />} />
          {/* Additional Settings Routes */}
          <Route path="settings/account" element={<AccountSettingsPage />} />
          <Route path="settings/appearance" element={<AppearanceSettingsPage />} />
          <Route path="settings/mobile" element={<MobileSettingsPage />} />
          <Route path="settings/apps" element={<AppsSettingsPage />} />
          <Route path="settings/notifications" element={<NotificationsSettingsPage />} />
          <Route path="settings/referrals" element={<ReferralsPage />} />
          <Route path="settings/billing" element={<BillingSettingsPage />} />
          <Route path="settings/payments" element={<PaymentsSettingsPage />} />
          <Route path="settings/apex-pay" element={<ApexPaySettingsPage />} />
          <Route path="settings/apex-pay/callback" element={<ApexPaySettingsPage />} />
          <Route path="settings/data-escrow" element={<DataEscrowPage />} />
          <Route path="settings/sharing" element={<SharingSettingsPage />} />
          <Route path="settings/text-messaging" element={<TextMessagingPage />} />
          <Route path="settings/ai" element={<AIConfigPage />} />
          <Route path="settings/reporting" element={<ReportingSettingsPage />} />
          <Route path="settings/drives" element={<ApexDrivePage />} />
          <Route path="settings/drive-setup" element={<DriveSetupPage />} />
          <Route path="documents/connect" element={<DriveSetupPage />} />
          <Route path="drive/browse" element={<DriveBrowsePage />} />
          
          {/* Trust Accounting */}
          <Route path="trust" element={<TrustAccountingPage />} />
          
          {/* Firm Administration */}
          <Route path="admin" element={<FirmAdminPage />} />
          <Route path="admin/permissions" element={<PermissionsAdminPage />} />
          
          {/* Platform Admin Portal */}
          <Route path="platform-admin" element={<AdminPortalPage />} />
        </Route>
        
        {/* Secure Admin Portal - Hidden URL */}
        <Route path="/rx760819" element={<SecureAdminLogin />} />
        <Route path="/rx760819/dashboard" element={<SecureAdminDashboard />} />
        
        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <TimerProvider>
          <AIChatProvider>
            <BrowserRouter>
              <ScrollToTop />
              <AppContent />
            </BrowserRouter>
          </AIChatProvider>
        </TimerProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
