import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { Layout } from './components/Layout'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
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
import { SettingsPage } from './pages/SettingsPage'
import { SettingsHubPage } from './pages/SettingsHubPage'
import { FirmSettingsPage } from './pages/FirmSettingsPage'
import { FirmAdminPage } from './pages/FirmAdminPage'
import { TeamPage } from './pages/TeamPage'
import { APIKeysPage } from './pages/APIKeysPage'
import { IntegrationsPage } from './pages/IntegrationsPage'
import { SecuritySettingsPage } from './pages/SecuritySettingsPage'
import { FirmAnalyticsPage } from './pages/FirmAnalyticsPage'
import { TrustAccountingPage } from './pages/TrustAccountingPage'
import { RecoveryBinPage } from './pages/RecoveryBinPage'
import { CustomFieldsPage } from './pages/CustomFieldsPage'
import { CourtRulesPage } from './pages/CourtRulesPage'
import { TextSnippetsPage } from './pages/TextSnippetsPage'
import { DocumentAutomationPage } from './pages/DocumentAutomationPage'
import { WorkflowsPage } from './pages/WorkflowsPage'

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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={
          <PublicRoute><LoginPage /></PublicRoute>
        } />
        <Route path="/register" element={
          <PublicRoute><RegisterPage /></PublicRoute>
        } />
        
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
          <Route path="time" element={<TimeTrackingPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="ai" element={<AIAssistantPage />} />
          
          {/* Analytics */}
          <Route path="analytics" element={<FirmAnalyticsPage />} />
          
          {/* Settings Hub */}
          <Route path="settings" element={<SettingsHubPage />} />
          <Route path="settings/profile" element={<SettingsPage />} />
          <Route path="settings/security" element={<SecuritySettingsPage />} />
          <Route path="settings/firm" element={<FirmSettingsPage />} />
          <Route path="settings/team" element={<TeamPage />} />
          <Route path="settings/integrations" element={<IntegrationsPage />} />
          <Route path="settings/api-keys" element={<APIKeysPage />} />
          <Route path="settings/custom-fields" element={<CustomFieldsPage />} />
          <Route path="settings/recovery-bin" element={<RecoveryBinPage />} />
          <Route path="settings/court-rules" element={<CourtRulesPage />} />
          <Route path="settings/snippets" element={<TextSnippetsPage />} />
          <Route path="settings/documents" element={<DocumentAutomationPage />} />
          <Route path="settings/workflows" element={<WorkflowsPage />} />
          
          {/* Trust Accounting */}
          <Route path="trust" element={<TrustAccountingPage />} />
          
          {/* Firm Administration */}
          <Route path="admin" element={<FirmAdminPage />} />
        </Route>
        
        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
