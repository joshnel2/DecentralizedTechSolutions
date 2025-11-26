// User & Auth Types
export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'owner' | 'admin' | 'attorney' | 'paralegal' | 'staff'
  avatar?: string
  firmId?: string
  groupIds: string[]
  createdAt: string
}

export interface Firm {
  id: string
  name: string
  logo?: string
  address: string
  city?: string
  state?: string
  zipCode?: string
  phone?: string
  email?: string
  website?: string
  timezone?: string
  billingRate?: number
  currency?: string
  createdAt?: string
  settings?: FirmSettings
  billingDefaults?: BillingDefaults
  azureOpenAI?: AzureOpenAIConfig
  bankAccount?: BankAccount
}

export interface BillingDefaults {
  hourlyRate: number
  incrementMinutes: number
  paymentTerms?: number
  lateFeePercent?: number
  currency?: string
  taxRate?: number
}

export interface AzureOpenAIConfig {
  endpoint: string
  apiKey: string
  deploymentName: string
}

export interface BankAccount {
  bankName: string
  accountName: string
  accountNumber: string
  routingNumber: string
  accountType: 'checking' | 'savings'
  isVerified: boolean
}

export interface FirmSettings {
  azureOpenAIEndpoint?: string
  azureOpenAIKey?: string
  azureOpenAIDeployment?: string
  aiEnabled: boolean
  defaultBillingIncrement: number
  invoicePrefix: string
  matterPrefix: string
}

export interface Group {
  id: string
  name: string
  description: string
  memberIds: string[]
  permissions: string[]
  color: string
  createdAt: string
}

// Client Types
export interface Client {
  id: string
  type: 'individual' | 'organization'
  name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zipCode: string
  notes?: string
  tags: string[]
  status: 'active' | 'inactive' | 'prospective'
  billingContact?: string
  createdAt: string
  matterIds: string[]
}

// Matter Types
export interface Matter {
  id: string
  number: string
  name: string
  description: string
  clientId: string
  type: MatterType
  status: MatterStatus
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignedTo: string[]
  responsibleAttorney: string
  openDate: string
  closeDate?: string
  statuteOfLimitations?: string
  courtInfo?: CourtInfo
  billingType: 'hourly' | 'flat' | 'contingency' | 'retainer'
  billingRate?: number
  flatFee?: number
  contingencyPercent?: number
  retainerAmount?: number
  budget?: number
  tags: string[]
  aiSummary?: string
  createdAt: string
}

export type MatterType = 
  | 'litigation'
  | 'corporate'
  | 'real_estate'
  | 'family'
  | 'criminal'
  | 'immigration'
  | 'intellectual_property'
  | 'employment'
  | 'bankruptcy'
  | 'estate_planning'
  | 'personal_injury'
  | 'other'

export type MatterStatus = 
  | 'intake'
  | 'active'
  | 'pending'
  | 'on_hold'
  | 'closed_won'
  | 'closed_lost'
  | 'closed_settled'

export interface CourtInfo {
  courtName: string
  caseNumber: string
  judge: string
  jurisdiction: string
}

// Time & Billing Types
export interface TimeEntry {
  id: string
  matterId: string
  userId: string
  date: string
  hours: number
  description: string
  billable: boolean
  billed: boolean
  rate: number
  amount: number
  activityCode?: string
  aiGenerated: boolean
  createdAt: string
}

export interface Expense {
  id: string
  matterId: string
  userId: string
  date: string
  description: string
  amount: number
  category: string
  billable: boolean
  billed: boolean
  receipt?: string
  createdAt: string
}

export interface Invoice {
  id: string
  number: string
  matterId: string
  clientId: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void'
  issueDate: string
  dueDate: string
  subtotal: number
  tax: number
  total: number
  amountPaid: number
  lineItems: InvoiceLineItem[]
  notes?: string
  createdAt: string
}

export interface InvoiceLineItem {
  id: string
  type: 'time' | 'expense' | 'flat_fee'
  description: string
  quantity: number
  rate: number
  amount: number
  timeEntryId?: string
  expenseId?: string
}

// Payment Types
export interface Payment {
  id: string
  invoiceId: string
  amount: number
  method: 'check' | 'wire' | 'ach' | 'credit_card' | 'cash'
  reference?: string
  date: string
  createdAt: string
}

// Calendar Types
export interface CalendarEvent {
  id: string
  title: string
  description?: string
  type: 'meeting' | 'deadline' | 'court_date' | 'reminder' | 'task'
  matterId?: string
  clientId?: string
  startTime: string
  endTime: string
  allDay: boolean
  location?: string
  attendees: string[]
  recurring?: RecurrenceRule
  reminders: EventReminder[]
  color?: string
  createdBy: string
  createdAt: string
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  endDate?: string
  count?: number
}

export interface EventReminder {
  type: 'email' | 'notification'
  minutes: number
}

// Document Types
export interface Document {
  id: string
  name: string
  type: string
  size: number
  matterId?: string
  clientId?: string
  folderId?: string
  uploadedBy: string
  uploadedAt: string
  version: number
  aiSummary?: string
  tags: string[]
}

export interface DocumentFolder {
  id: string
  name: string
  parentId?: string
  matterId?: string
  createdAt: string
}

// API Key Types
export interface APIKey {
  id: string
  name: string
  key: string
  permissions: string[]
  lastUsed?: string
  expiresAt?: string
  createdBy: string
  createdAt: string
}

// AI Types
export interface AIConversation {
  id: string
  title: string
  messages: AIMessage[]
  matterId?: string
  clientId?: string
  createdAt: string
  updatedAt: string
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  citations?: AICitation[]
}

export interface AICitation {
  type: 'document' | 'matter' | 'client' | 'law'
  id?: string
  title: string
  excerpt?: string
}

// Report Types
export interface Report {
  id: string
  name: string
  type: 'billing' | 'productivity' | 'matters' | 'clients' | 'custom'
  filters: Record<string, unknown>
  createdBy: string
  createdAt: string
  schedule?: ReportSchedule
}

export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly'
  recipients: string[]
  nextRun: string
}

// Dashboard Types
export interface DashboardStats {
  totalMatters: number
  activeMatters: number
  totalClients: number
  billableHoursThisMonth: number
  revenueThisMonth: number
  outstandingInvoices: number
  upcomingDeadlines: number
  tasksCompleted: number
}

// Notification Types
export interface Notification {
  id: string
  type: 'deadline' | 'invoice' | 'matter' | 'system' | 'ai'
  title: string
  message: string
  read: boolean
  actionUrl?: string
  createdAt: string
}
