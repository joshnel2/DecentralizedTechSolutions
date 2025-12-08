// ============================================================================
// APEX LEGAL - COMPREHENSIVE DATA TYPES
// Production-ready data models for legal practice management
// ============================================================================

// ============================================================================
// CORE IDENTITY & AUTHENTICATION
// ============================================================================

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  middleName?: string
  title?: string // e.g., "Partner", "Associate", "Paralegal"
  initials?: string
  role: UserRole
  avatar?: string
  phone?: string
  mobilePhone?: string
  extension?: string
  
  // Professional Details
  barNumber?: string
  barAdmissionDate?: string
  jurisdictions?: string[]
  practiceAreas?: string[]
  
  // Billing Defaults
  defaultBillingRate?: number
  costRate?: number // Internal cost for profitability tracking
  
  // Permissions & Access
  firmId?: string
  groupIds: string[]
  permissions: string[]
  isActive: boolean
  
  // Settings
  timezone?: string
  dateFormat?: string
  timeFormat?: '12h' | '24h'
  defaultCalendarView?: 'day' | 'week' | 'month'
  
  // Tracking
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export type UserRole = 'owner' | 'admin' | 'attorney' | 'paralegal' | 'staff' | 'billing' | 'readonly'

export interface Firm {
  id: string
  name: string
  legalName?: string // Full legal entity name
  logo?: string
  
  // Address
  address: string
  addressLine2?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  
  // Contact
  phone?: string
  fax?: string
  email?: string
  website?: string
  
  // Legal/Tax Info
  taxId?: string // EIN
  entityType?: 'llc' | 'llp' | 'pc' | 'pllc' | 'sole_proprietor' | 'corporation'
  
  // Timezone & Locale
  timezone?: string
  currency?: string
  dateFormat?: string
  
  // Branding
  primaryColor?: string
  secondaryColor?: string
  
  // Feature Flags
  features?: FirmFeatures
  
  // Settings
  settings?: FirmSettings
  billingDefaults?: BillingDefaults
  azureOpenAI?: AzureOpenAIConfig
  
  // Bank Accounts
  operatingAccount?: BankAccount
  trustAccount?: BankAccount // IOLTA
  
  // Tracking
  createdAt: string
  updatedAt: string
  subscriptionTier?: 'starter' | 'professional' | 'enterprise'
  subscriptionStatus?: 'active' | 'trial' | 'past_due' | 'cancelled'
}

export interface FirmFeatures {
  timeTracking: boolean
  billing: boolean
  trustAccounting: boolean
  documentManagement: boolean
  calendar: boolean
  tasks: boolean
  clientPortal: boolean
  aiAssistant: boolean
  customFields: boolean
  workflows: boolean
  eSignature: boolean
  textMessaging: boolean
  clientIntake: boolean
}

export interface FirmSettings {
  // Matter Settings
  matterNumberPrefix?: string
  matterNumberFormat?: string // e.g., "MTR-{YYYY}-{0000}"
  autoGenerateMatterNumbers: boolean
  requireMatterBudget: boolean
  requireConflictCheck: boolean
  
  // Invoice Settings  
  invoiceNumberPrefix?: string
  invoiceNumberFormat?: string
  defaultPaymentTerms: number // days
  lateFeeEnabled: boolean
  lateFeePercent?: number
  lateFeeGracePeriod?: number // days
  invoiceFooter?: string
  invoiceNotes?: string
  
  // Time Entry Settings
  defaultBillingIncrement: 1 | 6 | 10 | 12 | 15 | 30 // minutes
  roundingMethod: 'up' | 'down' | 'nearest' | 'none'
  requireTimeDescription: boolean
  requireActivityCode: boolean
  allowFutureTimeEntries: boolean
  
  // Trust Accounting
  requireTrustReplenishment: boolean
  trustReplenishmentThreshold?: number
  
  // Security
  sessionTimeoutMinutes: number
  requireMfa: boolean
  passwordMinLength: number
  passwordRequireSpecial: boolean
  
  // AI Settings
  aiEnabled: boolean
  aiAutoSummarize: boolean
  aiConflictCheck: boolean
}

export interface BillingDefaults {
  hourlyRate: number
  incrementMinutes: number
  paymentTerms?: number
  lateFeePercent?: number
  currency?: string
  taxRate?: number
  requireRetainer?: boolean
  minimumRetainer?: number
}

export interface AzureOpenAIConfig {
  endpoint: string
  apiKey: string
  deploymentName: string
  embeddingDeployment?: string
}

export interface BankAccount {
  id?: string
  bankName: string
  accountName: string
  accountNumber: string
  routingNumber: string
  accountType: 'checking' | 'savings' | 'trust'
  isVerified: boolean
  verifiedAt?: string
  lastFourDigits?: string // For display
}

export interface Group {
  id: string
  name: string
  description: string
  memberIds: string[]
  permissions: string[]
  color: string
  createdAt: string
  updatedAt: string
  createdBy?: string
}

// ============================================================================
// CONTACTS & CLIENTS
// ============================================================================

export interface Contact {
  id: string
  type: 'person' | 'company'
  
  // For Person
  prefix?: string // Mr., Mrs., Dr., etc.
  firstName?: string
  middleName?: string
  lastName?: string
  suffix?: string // Jr., III, Esq., etc.
  nickname?: string
  
  // For Company
  companyName?: string
  companyType?: string // LLC, Corp, etc.
  
  // Computed/Display
  displayName: string // Full formatted name
  sortName?: string // Last, First for sorting
  
  // Contact Info
  email?: string
  emailSecondary?: string
  phone?: string
  phoneHome?: string
  phoneMobile?: string
  phoneWork?: string
  phoneFax?: string
  
  // Address - Primary
  addressStreet?: string
  addressStreet2?: string
  addressCity?: string
  addressState?: string
  addressZip?: string
  addressCountry?: string
  
  // Address - Secondary
  address2Street?: string
  address2Street2?: string
  address2City?: string
  address2State?: string
  address2Zip?: string
  address2Country?: string
  
  // Professional Info
  title?: string // Job title
  company?: string // Company they work for
  department?: string
  website?: string
  
  // Social
  linkedIn?: string
  twitter?: string
  
  // Relationships
  referredBy?: string // Contact ID who referred them
  assistantId?: string // Their assistant's contact ID
  spouseId?: string
  
  // Categorization
  contactType: ContactType // Client, Opposing Counsel, etc.
  tags: string[]
  
  // Notes & Description
  notes?: string
  
  // Custom Fields
  customFields?: Record<string, CustomFieldValue>
  
  // Status
  isActive: boolean
  doNotContact?: boolean
  
  // For Clients specifically
  clientInfo?: ClientInfo
  
  // Tracking
  createdAt: string
  updatedAt: string
  createdBy: string
  lastContactedAt?: string
}

export type ContactType = 
  | 'client'
  | 'prospective_client'
  | 'former_client'
  | 'opposing_party'
  | 'opposing_counsel'
  | 'witness'
  | 'expert_witness'
  | 'court'
  | 'judge'
  | 'vendor'
  | 'referral_source'
  | 'insurance_company'
  | 'co_counsel'
  | 'other'

export interface ClientInfo {
  clientNumber?: string // Unique client number
  clientSince?: string
  
  // Billing
  billingContact?: string // Contact ID for billing
  billingMethod?: 'email' | 'mail' | 'both'
  billingEmail?: string
  paymentTerms?: number // Override firm default
  creditLimit?: number
  
  // Trust Account
  trustBalance?: number
  requireTrustRetainer?: boolean
  minimumTrustBalance?: number
  
  // Status
  status: ClientStatus
  statusReason?: string
  
  // Source
  referralSource?: string
  referralSourceOther?: string
  howHeard?: string
  
  // Conflicts
  conflictCheckDate?: string
  conflictCheckBy?: string
  conflictCheckNotes?: string
  conflictCleared: boolean
  
  // Portal Access
  portalEnabled?: boolean
  portalEmail?: string
  portalLastLogin?: string
}

export type ClientStatus = 
  | 'active'
  | 'inactive'
  | 'prospective'
  | 'former'
  | 'declined'
  | 'suspended'

// Legacy Client interface for backward compatibility
export interface Client extends Contact {
  type: 'person' | 'company'
  name: string
  matterIds: string[]
}

// ============================================================================
// MATTERS (CASES)
// ============================================================================

export interface Matter {
  id: string
  
  // Identification
  number: string // Auto-generated matter number
  clientMatterNumber?: string // Client's internal reference
  name: string
  description?: string
  
  // Relationships
  clientId: string
  
  // Classification
  type: MatterType
  practiceArea?: string
  subPracticeArea?: string
  status: MatterStatus
  stage?: string // Custom workflow stage
  priority: 'low' | 'medium' | 'high' | 'urgent'
  
  // Visibility & Permissions
  visibility?: 'firm_wide' | 'restricted'
  canManagePermissions?: boolean
  accessLevel?: string
  
  // Dates
  openDate: string
  closeDate?: string
  pendingDate?: string // When it went to pending status
  statuteOfLimitations?: string
  
  // Responsible Parties
  responsibleAttorney: string // Primary attorney user ID
  responsibleAttorneyName?: string // Joined from users table
  originatingAttorney?: string // Who brought in the matter
  originatingAttorneyName?: string // Joined from users table
  assignedTo: string[] // All assigned user IDs
  supervisingAttorney?: string
  
  // Court/Litigation Info
  courtInfo?: CourtInfo
  
  // Billing Configuration
  billingType: BillingType
  billingRate?: number // Override rate for this matter
  flatFee?: number
  contingencyPercent?: number
  retainerAmount?: number
  budget?: number
  budgetAlertThreshold?: number // Percentage to alert at
  
  // Financial Tracking (computed/cached)
  totalBilled?: number
  totalPaid?: number
  totalOutstanding?: number
  totalUnbilled?: number
  trustBalance?: number
  
  // Related Matters
  relatedMatterIds?: string[]
  parentMatterId?: string // For sub-matters
  
  // Categorization
  tags: string[]
  
  // Custom Fields
  customFields?: Record<string, CustomFieldValue>
  
  // AI Features
  aiSummary?: string
  aiLastUpdated?: string
  
  // Notes
  notes?: string
  
  // Conflict Check
  conflictCheckDate?: string
  conflictCheckBy?: string
  conflictCleared: boolean
  
  // Close Info
  closeReason?: MatterCloseReason
  closeNotes?: string
  closedBy?: string
  
  // Tracking
  createdAt: string
  updatedAt: string
  createdBy: string
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
  | 'tax'
  | 'environmental'
  | 'healthcare'
  | 'securities'
  | 'insurance'
  | 'construction'
  | 'government'
  | 'nonprofit'
  | 'other'

export type MatterStatus = 
  | 'intake'
  | 'pending_conflict'
  | 'active'
  | 'pending'
  | 'on_hold'
  | 'closed_won'
  | 'closed_lost'
  | 'closed_settled'
  | 'closed_dismissed'
  | 'closed_transferred'
  | 'closed_abandoned'
  | 'closed_other'

export type MatterCloseReason =
  | 'won'
  | 'lost'
  | 'settled'
  | 'dismissed'
  | 'withdrawn'
  | 'transferred'
  | 'abandoned'
  | 'completed'
  | 'other'

export type BillingType = 'hourly' | 'flat' | 'contingency' | 'retainer' | 'mixed' | 'pro_bono'

export interface CourtInfo {
  courtName: string
  courtType?: 'federal' | 'state' | 'appellate' | 'supreme' | 'administrative' | 'arbitration' | 'other'
  caseNumber: string
  judge?: string
  magistrate?: string
  courtroom?: string
  jurisdiction: string
  venue?: string
  filingDate?: string
  
  // Opposing Parties
  opposingParties?: OpposingParty[]
  
  // Important Dates
  trialDate?: string
  hearingDates?: string[]
}

export interface OpposingParty {
  name: string
  type: 'individual' | 'organization'
  role: 'plaintiff' | 'defendant' | 'respondent' | 'petitioner' | 'other'
  counselName?: string
  counselFirm?: string
  counselPhone?: string
  counselEmail?: string
  counselAddress?: string
}

// ============================================================================
// TASKS & ACTIVITIES
// ============================================================================

export interface Task {
  id: string
  
  // Core Info
  name: string
  description?: string
  
  // Relationships
  matterId?: string
  clientId?: string
  assignedTo: string // User ID
  assignedBy?: string
  
  // Status & Priority
  status: TaskStatus
  priority: 'low' | 'medium' | 'high' | 'urgent'
  
  // Dates
  dueDate?: string
  dueTime?: string
  reminderDate?: string
  startDate?: string
  completedDate?: string
  
  // Time Tracking
  estimatedMinutes?: number
  actualMinutes?: number
  isTimerRunning?: boolean
  timerStartedAt?: string
  
  // Billing
  isBillable: boolean
  
  // Categorization
  category?: string
  tags: string[]
  
  // Recurrence
  isRecurring: boolean
  recurrenceRule?: RecurrenceRule
  parentTaskId?: string // For recurring instances
  
  // Completion
  completedBy?: string
  completionNotes?: string
  
  // Checklist (subtasks)
  checklist?: TaskChecklistItem[]
  
  // Tracking
  createdAt: string
  updatedAt: string
  createdBy: string
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'deferred'

export interface TaskChecklistItem {
  id: string
  text: string
  isCompleted: boolean
  completedAt?: string
  completedBy?: string
}

// ============================================================================
// TIME ENTRIES
// ============================================================================

export interface TimeEntry {
  id: string
  
  // Core Data
  matterId: string
  userId: string
  date: string // Date of the work
  
  // Time
  hours: number // Decimal hours (e.g., 1.5)
  durationMinutes?: number // Alternative: store in minutes
  
  // Start/End (for timer-based entries)
  startTime?: string
  endTime?: string
  
  // Description
  description: string
  
  // Activity Classification
  activityCode?: string
  activityType?: ActivityType
  taskId?: string // Link to task if time was for a task
  
  // Billing
  billable: boolean
  billed: boolean
  billedOn?: string
  invoiceId?: string
  
  // Rates & Amounts
  rate: number
  amount: number // hours * rate
  
  // Status
  status: TimeEntryStatus
  
  // Write-offs/Adjustments
  originalHours?: number
  originalAmount?: number
  adjustmentReason?: string
  adjustedBy?: string
  adjustedAt?: string
  
  // Timer
  isTimerRunning?: boolean
  timerStartedAt?: string
  
  // Source
  entryType: 'manual' | 'timer' | 'calendar' | 'ai_suggested'
  aiGenerated: boolean
  aiConfidence?: number
  
  // Approval (for firms that require it)
  approved?: boolean
  approvedBy?: string
  approvedAt?: string
  
  // Tracking
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export type TimeEntryStatus = 'draft' | 'pending' | 'approved' | 'billed' | 'written_off'

export type ActivityType = 
  | 'research'
  | 'drafting'
  | 'review'
  | 'court_appearance'
  | 'deposition'
  | 'client_meeting'
  | 'client_call'
  | 'negotiation'
  | 'travel'
  | 'administrative'
  | 'other'

export interface ActivityCode {
  id: string
  code: string // e.g., "L110"
  name: string
  description?: string
  category: string
  isBillable: boolean
  isActive: boolean
  createdAt: string
}

// ============================================================================
// EXPENSES / DISBURSEMENTS
// ============================================================================

export interface Expense {
  id: string
  
  // Core Data
  matterId: string
  userId: string // Who incurred the expense
  date: string
  
  // Description
  description: string
  vendor?: string
  
  // Amount
  amount: number
  quantity?: number
  unitPrice?: number
  
  // Classification
  category: string
  expenseType: ExpenseType
  
  // Tax
  taxAmount?: number
  taxRate?: number
  
  // Billing
  billable: boolean
  billed: boolean
  billedOn?: string
  invoiceId?: string
  
  // Markup (for firms that mark up expenses)
  markupPercent?: number
  markupAmount?: number
  billedAmount?: number // amount + markup
  
  // Receipt/Documentation
  receiptUrl?: string
  receiptFileName?: string
  hasReceipt: boolean
  
  // Reimbursement (if user paid personally)
  reimbursable: boolean
  reimbursed: boolean
  reimbursedDate?: string
  reimbursementMethod?: string
  
  // Payment
  paymentMethod?: 'firm_card' | 'personal' | 'check' | 'wire' | 'petty_cash'
  checkNumber?: string
  
  // Status
  status: ExpenseStatus
  
  // Approval
  approved?: boolean
  approvedBy?: string
  approvedAt?: string
  
  // Tracking
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export type ExpenseType = 
  | 'filing_fee'
  | 'court_costs'
  | 'service_fees'
  | 'copying'
  | 'printing'
  | 'postage'
  | 'courier'
  | 'travel'
  | 'mileage'
  | 'meals'
  | 'lodging'
  | 'expert_fees'
  | 'witness_fees'
  | 'deposition_costs'
  | 'transcripts'
  | 'research'
  | 'phone'
  | 'fax'
  | 'supplies'
  | 'other'

export type ExpenseStatus = 'draft' | 'pending' | 'approved' | 'billed' | 'reimbursed' | 'rejected'

// ============================================================================
// BILLING & INVOICES
// ============================================================================

export interface Invoice {
  id: string
  
  // Identification
  number: string
  
  // Relationships
  matterId: string
  clientId: string
  
  // Status
  status: InvoiceStatus
  
  // Dates
  issueDate: string
  dueDate: string
  sentDate?: string
  paidDate?: string
  
  // Period Covered
  periodStart?: string
  periodEnd?: string
  
  // Amounts
  subtotalFees: number
  subtotalExpenses: number
  subtotal: number
  
  // Adjustments
  discountPercent?: number
  discountAmount?: number
  discountReason?: string
  
  writeOffAmount?: number
  writeOffReason?: string
  
  // Tax
  taxRate?: number
  taxAmount?: number
  
  // Trust Application
  trustApplied?: number
  
  // Totals
  total: number
  amountDue: number
  amountPaid: number
  
  // Balance (computed)
  balance?: number
  
  // Interest/Late Fees
  interestAmount?: number
  lateFeeAmount?: number
  
  // Line Items
  lineItems: InvoiceLineItem[]
  
  // Payments
  payments?: PaymentApplication[]
  
  // Notes
  notes?: string
  internalNotes?: string
  
  // Terms
  paymentTerms?: string
  
  // Tracking
  createdAt: string
  updatedAt: string
  createdBy: string
  lastSentAt?: string
  viewedAt?: string // When client viewed it
}

export type InvoiceStatus = 
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'viewed'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'void'
  | 'written_off'
  | 'disputed'

export interface InvoiceLineItem {
  id: string
  
  // Type
  type: 'fee' | 'expense' | 'flat_fee' | 'retainer_credit' | 'trust_credit' | 'discount' | 'interest' | 'late_fee' | 'other'
  
  // Source Reference
  timeEntryId?: string
  expenseId?: string
  
  // Description
  description: string
  
  // Amount Calculation
  quantity: number // Hours for time, 1 for expenses/flat
  rate: number
  amount: number
  
  // Date (for sorting)
  date?: string
  
  // User (for time entries)
  userId?: string
  
  // Tax
  taxable?: boolean
}

// ============================================================================
// PAYMENTS & TRUST ACCOUNTING
// ============================================================================

export interface Payment {
  id: string
  
  // Relationship
  clientId: string
  invoiceId?: string // If payment is for a specific invoice
  
  // Amount
  amount: number
  
  // Method
  method: PaymentMethod
  checkNumber?: string
  referenceNumber?: string
  transactionId?: string
  lastFour?: string // Last 4 digits of card
  
  // Source Account
  accountType: 'operating' | 'trust'
  
  // Dates
  date: string
  depositDate?: string
  
  // Status
  status: PaymentStatus
  
  // For refunds
  isRefund: boolean
  refundReason?: string
  originalPaymentId?: string
  
  // Notes
  notes?: string
  memo?: string
  
  // Application to invoices
  applications?: PaymentApplication[]
  
  // Tracking
  createdAt: string
  createdBy: string
}

export type PaymentMethod = 
  | 'check'
  | 'cash'
  | 'wire'
  | 'ach'
  | 'credit_card'
  | 'debit_card'
  | 'trust_transfer'
  | 'other'

export type PaymentStatus = 
  | 'pending'
  | 'completed'
  | 'failed'
  | 'returned'
  | 'refunded'
  | 'void'

export interface PaymentApplication {
  paymentId: string
  invoiceId: string
  amount: number
  appliedAt: string
  appliedBy: string
}

// Trust Accounting
export interface TrustTransaction {
  id: string
  
  // Relationships
  clientId: string
  matterId?: string
  
  // Transaction Type
  type: TrustTransactionType
  
  // Amount (positive for deposits, negative for disbursements)
  amount: number
  
  // Balance After
  balanceAfter: number
  
  // Description
  description: string
  
  // Payment Reference
  paymentId?: string
  invoiceId?: string
  checkNumber?: string
  referenceNumber?: string
  
  // Payee (for disbursements)
  payeeName?: string
  payeeType?: 'client' | 'vendor' | 'court' | 'firm' | 'other'
  
  // Method
  method: PaymentMethod
  
  // Date
  date: string
  
  // Status
  status: 'pending' | 'cleared' | 'void'
  clearedDate?: string
  
  // Notes
  notes?: string
  
  // Approval (required for disbursements in many jurisdictions)
  approvedBy?: string
  approvedAt?: string
  
  // Tracking
  createdAt: string
  createdBy: string
}

export type TrustTransactionType = 
  | 'deposit'
  | 'retainer'
  | 'disbursement'
  | 'transfer_to_operating'
  | 'refund'
  | 'interest'
  | 'bank_fee'
  | 'adjustment'

export interface TrustLedger {
  clientId: string
  matterId?: string
  currentBalance: number
  lastTransactionDate: string
  lastReconciliationDate?: string
}

// ============================================================================
// CALENDAR & EVENTS
// ============================================================================

export interface CalendarEvent {
  id: string
  
  // Core Info
  title: string
  description?: string
  
  // Type
  type: CalendarEventType
  
  // Relationships
  matterId?: string
  clientId?: string
  taskId?: string
  
  // Timing
  startTime: string
  endTime: string
  allDay: boolean
  
  // Timezone
  timezone?: string
  
  // Location
  location?: string
  locationUrl?: string // For video conference links
  isVirtual?: boolean
  videoConferenceType?: 'zoom' | 'teams' | 'google_meet' | 'webex' | 'other'
  videoConferenceUrl?: string
  
  // Participants
  attendees: EventAttendee[]
  createdBy: string
  
  // Recurrence
  recurring?: boolean
  recurrenceRule?: RecurrenceRule
  recurrenceExceptions?: string[] // Dates to skip
  parentEventId?: string // For recurring instances
  
  // Reminders
  reminders: EventReminder[]
  
  // Status
  status: 'tentative' | 'confirmed' | 'cancelled'
  
  // Display
  color?: string
  
  // Private/Visibility
  isPrivate: boolean
  
  // Notes
  notes?: string
  
  // Sync
  externalId?: string // For calendar sync (Google, Outlook)
  externalSource?: 'google' | 'outlook' | 'ical'
  
  // Tracking
  createdAt: string
  updatedAt: string
}

export type CalendarEventType = 
  | 'meeting'
  | 'deadline'
  | 'court_date'
  | 'hearing'
  | 'deposition'
  | 'mediation'
  | 'arbitration'
  | 'trial'
  | 'reminder'
  | 'task'
  | 'appointment'
  | 'conference_call'
  | 'closing'
  | 'filing_deadline'
  | 'statute_deadline'
  | 'other'

export interface EventAttendee {
  userId?: string
  contactId?: string
  email: string
  name: string
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
  isOrganizer: boolean
  isOptional: boolean
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number // Every X days/weeks/etc
  daysOfWeek?: number[] // 0=Sunday, 1=Monday, etc
  dayOfMonth?: number
  monthOfYear?: number
  endDate?: string
  count?: number
}

export interface EventReminder {
  type: 'email' | 'notification' | 'sms'
  minutes: number // Minutes before event
}

// ============================================================================
// DOCUMENTS
// ============================================================================

export interface Document {
  id: string
  
  // File Info
  name: string
  originalName?: string
  type: string // MIME type
  extension?: string
  size: number // bytes
  
  // Relationships
  matterId?: string
  clientId?: string
  folderId?: string
  
  // Version Control
  version: number
  parentVersionId?: string
  isLatestVersion: boolean
  versionNotes?: string
  
  // Storage
  storageUrl?: string
  storagePath?: string
  storageProvider?: 'azure' | 's3' | 'local'
  checksum?: string // For integrity verification
  
  // Classification
  category?: DocumentCategory
  tags: string[]
  
  // Status
  status: 'draft' | 'final' | 'signed' | 'filed' | 'archived'
  
  // Dates
  documentDate?: string // Date on the document itself
  receivedDate?: string
  filedDate?: string
  expirationDate?: string
  
  // Access
  isConfidential: boolean
  accessLevel?: 'public' | 'internal' | 'confidential' | 'privileged'
  
  // E-Signature
  signatureRequired?: boolean
  signatureStatus?: 'none' | 'pending' | 'partial' | 'completed'
  signedAt?: string
  signedBy?: string[]
  
  // AI
  aiSummary?: string
  aiKeyTerms?: string[]
  aiClassification?: string
  ocrText?: string // Extracted text from scanned docs
  
  // Tracking
  uploadedBy: string
  uploadedAt: string
  updatedAt: string
  lastViewedAt?: string
  lastViewedBy?: string
  downloadCount?: number
}

export type DocumentCategory = 
  | 'correspondence'
  | 'pleading'
  | 'motion'
  | 'brief'
  | 'contract'
  | 'agreement'
  | 'discovery'
  | 'evidence'
  | 'deposition'
  | 'transcript'
  | 'court_order'
  | 'judgment'
  | 'corporate'
  | 'financial'
  | 'medical'
  | 'police_report'
  | 'expert_report'
  | 'memo'
  | 'research'
  | 'invoice'
  | 'receipt'
  | 'id_document'
  | 'photo'
  | 'other'

export interface DocumentFolder {
  id: string
  name: string
  parentId?: string
  matterId?: string
  color?: string
  isSystem?: boolean // System folders can't be deleted
  order?: number
  createdAt: string
  createdBy: string
}

export interface DocumentTemplate {
  id: string
  name: string
  description?: string
  category: string
  documentType: string
  content?: string // For text-based templates
  fileUrl?: string // For file-based templates
  variables?: TemplateVariable[]
  isActive: boolean
  createdAt: string
  createdBy: string
  updatedAt: string
}

export interface TemplateVariable {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'boolean' | 'select'
  options?: string[]
  defaultValue?: string
  required: boolean
}

// ============================================================================
// COMMUNICATIONS
// ============================================================================

export interface Communication {
  id: string
  
  // Type
  type: CommunicationType
  direction: 'inbound' | 'outbound'
  
  // Relationships
  matterId?: string
  clientId?: string
  contactId?: string
  
  // Participants
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  
  // Content
  subject?: string
  body?: string
  bodyHtml?: string
  
  // For Calls/Texts
  phoneNumber?: string
  duration?: number // seconds
  
  // Attachments
  attachmentIds?: string[]
  
  // Email Specifics
  emailMessageId?: string
  emailThreadId?: string
  inReplyTo?: string
  
  // Status
  status: 'draft' | 'sent' | 'received' | 'failed' | 'read'
  readAt?: string
  deliveredAt?: string
  
  // Billing
  isBillable: boolean
  timeEntryId?: string
  
  // Date
  date: string
  
  // Sync
  externalId?: string
  externalSource?: 'gmail' | 'outlook' | 'twilio'
  
  // Tracking
  createdAt: string
  createdBy?: string
}

export type CommunicationType = 
  | 'email'
  | 'phone_call'
  | 'text_message'
  | 'letter'
  | 'fax'
  | 'voicemail'
  | 'meeting_notes'
  | 'other'

// ============================================================================
// NOTES
// ============================================================================

export interface Note {
  id: string
  
  // Relationships
  matterId?: string
  clientId?: string
  contactId?: string
  taskId?: string
  
  // Content
  title?: string
  content: string
  contentHtml?: string
  
  // Type
  type: NoteType
  
  // Visibility
  isPrivate: boolean
  
  // Pinned
  isPinned: boolean
  
  // Tracking
  createdAt: string
  createdBy: string
  updatedAt: string
}

export type NoteType = 
  | 'general'
  | 'meeting_notes'
  | 'phone_call'
  | 'research'
  | 'strategy'
  | 'client_communication'
  | 'deadline_reminder'
  | 'other'

// ============================================================================
// CUSTOM FIELDS
// ============================================================================

export interface CustomField {
  id: string
  
  // Definition
  name: string
  fieldKey: string // Unique key for API/storage
  description?: string
  
  // Type
  fieldType: CustomFieldType
  
  // For which entity
  entityType: 'contact' | 'matter' | 'task' | 'document'
  
  // Options (for select/multi-select)
  options?: CustomFieldOption[]
  
  // Validation
  isRequired: boolean
  defaultValue?: CustomFieldValue
  minValue?: number
  maxValue?: number
  regex?: string
  
  // Display
  displayOrder: number
  isVisible: boolean
  showInList: boolean
  
  // Tracking
  createdAt: string
  createdBy: string
  updatedAt: string
}

export type CustomFieldType = 
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'select'
  | 'multi_select'
  | 'contact'
  | 'matter'
  | 'user'
  | 'url'
  | 'email'
  | 'phone'

export interface CustomFieldOption {
  value: string
  label: string
  color?: string
  order: number
}

export type CustomFieldValue = string | number | boolean | string[] | null

// ============================================================================
// ACTIVITY LOG / AUDIT TRAIL
// ============================================================================

export interface ActivityLog {
  id: string
  
  // What was done
  action: ActivityAction
  actionLabel: string // Human readable
  
  // Entity affected
  entityType: 'contact' | 'matter' | 'task' | 'document' | 'time_entry' | 'expense' | 'invoice' | 'payment' | 'event' | 'user' | 'note' | 'communication'
  entityId: string
  entityName?: string // For display
  
  // Related entities
  matterId?: string
  clientId?: string
  
  // Change details
  changes?: ActivityChange[]
  
  // Context
  ipAddress?: string
  userAgent?: string
  
  // Tracking
  userId: string
  userName?: string
  timestamp: string
}

export type ActivityAction = 
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'download'
  | 'upload'
  | 'email'
  | 'assign'
  | 'unassign'
  | 'approve'
  | 'reject'
  | 'submit'
  | 'bill'
  | 'pay'
  | 'void'
  | 'restore'
  | 'share'
  | 'export'
  | 'import'
  | 'login'
  | 'logout'

export interface ActivityChange {
  field: string
  fieldLabel: string
  oldValue?: string
  newValue?: string
}

// ============================================================================
// REPORTS
// ============================================================================

export interface Report {
  id: string
  name: string
  description?: string
  
  // Type
  type: ReportType
  category: ReportCategory
  
  // Configuration
  filters: ReportFilter[]
  columns: ReportColumn[]
  groupBy?: string[]
  sortBy?: ReportSort[]
  
  // Schedule
  schedule?: ReportSchedule
  
  // Permissions
  isShared: boolean
  sharedWith?: string[] // User IDs
  
  // Tracking
  createdBy: string
  createdAt: string
  updatedAt: string
  lastRunAt?: string
}

export type ReportType = 
  | 'productivity'
  | 'billing'
  | 'collections'
  | 'aging'
  | 'matter_status'
  | 'client_summary'
  | 'user_activity'
  | 'trust_ledger'
  | 'expense'
  | 'custom'

export type ReportCategory = 
  | 'billing'
  | 'productivity'
  | 'matters'
  | 'clients'
  | 'financial'
  | 'trust'
  | 'admin'
  | 'custom'

export interface ReportFilter {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'between' | 'in' | 'not_in' | 'is_empty' | 'is_not_empty'
  value: string | number | string[] | number[]
}

export interface ReportColumn {
  field: string
  label: string
  width?: number
  format?: 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'percent' | 'duration'
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count'
}

export interface ReportSort {
  field: string
  direction: 'asc' | 'desc'
}

export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  dayOfWeek?: number // For weekly
  dayOfMonth?: number // For monthly
  time: string
  recipients: string[]
  format: 'pdf' | 'csv' | 'excel'
  nextRun: string
}

// ============================================================================
// API KEYS & INTEGRATIONS
// ============================================================================

export interface APIKey {
  id: string
  name: string
  key: string // Hashed, only shown once on creation
  keyPrefix: string // First 8 chars for identification
  
  // Permissions
  permissions: string[]
  
  // Rate Limiting
  rateLimit?: number // Requests per hour
  
  // Usage
  lastUsed?: string
  usageCount?: number
  
  // Expiration
  expiresAt?: string
  isActive: boolean
  
  // Tracking
  createdBy: string
  createdAt: string
}

export interface Integration {
  id: string
  type: IntegrationType
  name: string
  
  // Configuration
  config: Record<string, unknown>
  
  // Status
  status: 'connected' | 'disconnected' | 'error'
  lastSyncAt?: string
  lastError?: string
  
  // OAuth
  accessToken?: string
  refreshToken?: string
  tokenExpiresAt?: string
  
  // Settings
  syncEnabled: boolean
  syncDirection: 'one_way' | 'two_way'
  
  // Tracking
  connectedAt: string
  connectedBy: string
}

export type IntegrationType = 
  | 'google_calendar'
  | 'outlook_calendar'
  | 'gmail'
  | 'outlook_mail'
  | 'dropbox'
  | 'google_drive'
  | 'onedrive'
  | 'box'
  | 'slack'
  | 'teams'
  | 'zoom'
  | 'quickbooks'
  | 'xero'
  | 'stripe'
  | 'lawpay'
  | 'docusign'
  | 'zapier'

// ============================================================================
// AI FEATURES
// ============================================================================

export interface AIConversation {
  id: string
  title: string
  messages: AIMessage[]
  
  // Context
  matterId?: string
  clientId?: string
  documentIds?: string[]
  
  // Model
  model: string
  
  // Tracking
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  
  // For assistant messages
  citations?: AICitation[]
  confidence?: number
  processingTime?: number
}

export interface AICitation {
  type: 'document' | 'matter' | 'client' | 'law' | 'case'
  id?: string
  title: string
  excerpt?: string
  url?: string
  page?: number
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export interface Notification {
  id: string
  
  // Type
  type: NotificationType
  category: 'deadline' | 'billing' | 'matter' | 'task' | 'system' | 'ai'
  
  // Content
  title: string
  message: string
  
  // Status
  read: boolean
  readAt?: string
  
  // Action
  actionUrl?: string
  actionLabel?: string
  
  // Reference
  entityType?: string
  entityId?: string
  matterId?: string
  
  // Tracking
  createdAt: string
  userId: string
}

export type NotificationType = 
  | 'deadline_reminder'
  | 'task_assigned'
  | 'task_completed'
  | 'invoice_overdue'
  | 'payment_received'
  | 'matter_updated'
  | 'document_shared'
  | 'mention'
  | 'system_alert'
  | 'ai_insight'

// ============================================================================
// DASHBOARD
// ============================================================================

export interface DashboardStats {
  // Matters
  totalMatters: number
  activeMatters: number
  newMattersThisMonth: number
  closedMattersThisMonth: number
  
  // Clients
  totalClients: number
  activeClients: number
  newClientsThisMonth: number
  
  // Time
  billableHoursToday: number
  billableHoursThisWeek: number
  billableHoursThisMonth: number
  nonBillableHoursThisMonth: number
  utilizationRate: number
  realizationRate: number
  
  // Financial
  revenueThisMonth: number
  revenueThisYear: number
  outstandingAR: number
  overdueAR: number
  trustBalance: number
  
  // Collections
  collectedThisMonth: number
  collectionsRate: number
  averageDaysToPay: number
  
  // Productivity
  upcomingDeadlines: number
  tasksCompleted: number
  tasksPending: number
  overdueTasks: number
}

// ============================================================================
// WEBHOOKS
// ============================================================================

export interface Webhook {
  id: string
  name: string
  url: string
  
  // Events to trigger on
  events: WebhookEvent[]
  
  // Security
  secret: string
  
  // Status
  isActive: boolean
  lastTriggeredAt?: string
  lastResponseCode?: number
  consecutiveFailures?: number
  
  // Headers
  headers?: Record<string, string>
  
  // Tracking
  createdAt: string
  createdBy: string
}

export type WebhookEvent = 
  | 'matter.created'
  | 'matter.updated'
  | 'matter.closed'
  | 'client.created'
  | 'client.updated'
  | 'invoice.created'
  | 'invoice.sent'
  | 'invoice.paid'
  | 'payment.received'
  | 'task.created'
  | 'task.completed'
  | 'document.uploaded'
  | 'time_entry.created'

// ============================================================================
// LEDES BILLING FORMAT (Industry Standard)
// ============================================================================

export interface LedesBillingEntry {
  invoiceDate: string
  invoiceNumber: string
  clientId: string
  clientName: string
  lawFirmMatterId: string
  lawFirmId: string
  invoiceTotal: number
  billingStartDate: string
  billingEndDate: string
  lineItems: LedesLineItem[]
}

export interface LedesLineItem {
  lineItemNumber: number
  expFeeCode: string // UTBMS code
  invoiceDate: string
  timekeeperName?: string
  timekeeperClassification?: string
  description: string
  lineItemNumberOfUnits: number
  lineItemUnitCost: number
  lineItemTotal: number
  lineItemTax?: number
}

// ============================================================================
// EXPORT TYPES FOR CSV/REPORTS
// ============================================================================

export interface MatterExportRow {
  matterNumber: string
  matterName: string
  matterDescription: string
  clientName: string
  clientNumber: string
  practiceArea: string
  matterType: string
  status: string
  priority: string
  openDate: string
  closeDate: string
  responsibleAttorney: string
  originatingAttorney: string
  billingType: string
  billingRate: number
  budget: number
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
  trustBalance: number
  courtName: string
  caseNumber: string
  judge: string
}

export interface TimeEntryExportRow {
  entryDate: string
  matterNumber: string
  matterName: string
  clientName: string
  timekeeperName: string
  timekeeperTitle: string
  hours: number
  rate: number
  amount: number
  description: string
  activityCode: string
  billable: boolean
  billed: boolean
  invoiceNumber: string
  invoiceDate: string
}

export interface ClientExportRow {
  clientNumber: string
  clientName: string
  clientType: string
  contactName: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zipCode: string
  status: string
  clientSince: string
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
  trustBalance: number
  matterCount: number
}

export interface InvoiceExportRow {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  matterNumber: string
  matterName: string
  clientName: string
  clientNumber: string
  feesAmount: number
  expensesAmount: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  balanceDue: number
  status: string
  daysPastDue: number
}

export interface ARAgingExportRow {
  clientName: string
  clientNumber: string
  matterNumber: string
  matterName: string
  invoiceNumber: string
  invoiceDate: string
  invoiceAmount: number
  paidAmount: number
  balanceDue: number
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  days91to120: number
  over120Days: number
}
