import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { AIChatProvider } from './contexts/AIChatContext'
import { TimerProvider } from './contexts/TimerContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { Layout } from './components/Layout'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { FirmSetupPage } from './pages/FirmSetupPage'
import { DashboardPage } from './pages/DashboardPage'
import { MattersPage } from './pages/MattersPage'
import { MatterDetailPage } from './pages/MatterDetailPage'
import { ClientsPage } from './pages/ClientsPage'
import { ClientDetailPage } from './pages/ClientDetailPage'
import { CalendarPage } from './pages/CalendarPage'
import { BillingPage } from './pages/BillingPage'
import { TimeTrackingPage } from './pages/TimeTrackingPage'
import { ReportsPage } from './pages/ReportsPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { AIAssistantPage } from './pages/AIAssistantPage'
import { BackgroundAgentPage } from './pages/BackgroundAgentPage'
import { AgentConsolePage } from './pages/AgentConsolePage'
import { SettingsPage } from './pages/SettingsPage'
import { SettingsHubPage } from './pages/SettingsHubPage'
import { FirmSettingsPage } from './pages/FirmSettingsPage'
import { FirmAdminPage } from './pages/FirmAdminPage'
import { TeamPage } from './pages/TeamPage'
import { APIKeysPage } from './pages/APIKeysPage'
import { IntegrationsPage } from './pages/IntegrationsPage'
import { OutlookIntegrationPage } from './pages/OutlookIntegrationPage'
import { FileStorageIntegrationPage } from './pages/FileStorageIntegrationPage'
import { QuickBooksIntegrationPage } from './pages/QuickBooksIntegrationPage'
import { CloudStorageIntegrationPage } from './pages/CloudStorageIntegrationPage'
import { SlackIntegrationPage } from './pages/SlackIntegrationPage'
import { SecuritySettingsPage } from './pages/SecuritySettingsPage'
import { FirmAnalyticsPage } from './pages/FirmAnalyticsPage'
import { TrustAccountingPage } from './pages/TrustAccountingPage'
import { RecoveryBinPage } from './pages/RecoveryBinPage'
import { CustomFieldsPage } from './pages/CustomFieldsPage'
import { CourtRulesPage } from './pages/CourtRulesPage'
import { TextSnippetsPage } from './pages/TextSnippetsPage'
import { DocumentAutomationPage } from './pages/DocumentAutomationPage'
import { DocumentTemplatesPage } from './pages/DocumentTemplatesPage'
import { WorkflowsPage } from './pages/WorkflowsPage'
import { BulkPermissionsPage } from './pages/BulkPermissionsPage'
import { AdminPortalPage } from './pages/AdminPortalPage'
import SecureAdminLogin from './pages/SecureAdminLogin'
import SecureAdminDashboard from './pages/SecureAdminDashboard'
// New Settings Pages
import { AccountSettingsPage } from './pages/AccountSettingsPage'
import { AppearanceSettingsPage } from './pages/AppearanceSettingsPage'
import { MobileSettingsPage } from './pages/MobileSettingsPage'
import { AppsSettingsPage } from './pages/AppsSettingsPage'
import { NotificationsSettingsPage } from './pages/NotificationsSettingsPage'
import { ReferralsPage } from './pages/ReferralsPage'
import { BillingSettingsPage } from './pages/BillingSettingsPage'
import { PaymentsSettingsPage } from './pages/PaymentsSettingsPage'
import { DataEscrowPage } from './pages/DataEscrowPage'
import { SharingSettingsPage } from './pages/SharingSettingsPage'
import { TextMessagingPage } from './pages/TextMessagingPage'
import { AIConfigPage } from './pages/AIConfigPage'
import { ReportingSettingsPage } from './pages/ReportingSettingsPage'
import { RedlineAIPage } from './pages/RedlineAIPage'
import { ApexPayPage } from './pages/ApexPayPage'
import { ApexPaySettingsPage } from './pages/ApexPaySettingsPage'
// Drive Integration Pages
import { ApexDrivePage } from './pages/ApexDrivePage'
import { DriveBrowsePage } from './pages/DriveBrowsePage'
import { DriveSetupPage } from './pages/DriveSetupPage'
import { DocumentVersionsPage } from './pages/DocumentVersionsPage'
import { DocumentComparePage } from './pages/DocumentComparePage'
import { FolderPermissionsPage } from './pages/FolderPermissionsPage'
// Public Pages
import { AboutPage } from './pages/AboutPage'
import { SecurityPage } from './pages/SecurityPage'
import { IntegrationsPublicPage } from './pages/IntegrationsPublicPage'
import { BlogPage } from './pages/BlogPage'
import { ContactPage } from './pages/ContactPage'
import { DocsPage } from './pages/DocsPage'
import { APIReferencePage } from './pages/APIReferencePage'
import { SupportPage } from './pages/SupportPage'
import { StatusPage } from './pages/StatusPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { TermsPage } from './pages/TermsPage'
import { EULAPage } from './pages/EULAPage'
import { CompliancePage } from './pages/CompliancePage'

// Scroll to top on route changes
function ScrollToTop() {
  const { pathname } = useLocation()
  
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  
  return null
}

// Loading screen component
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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
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
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
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
        
        {/* Platform Admin Portal */}
        <Route path="platform-admin" element={<AdminPortalPage />} />
      </Route>
      
      {/* Secure Admin Portal - Hidden URL */}
      <Route path="/rx760819" element={<SecureAdminLogin />} />
      <Route path="/rx760819/dashboard" element={<SecureAdminDashboard />} />
      
      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
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
