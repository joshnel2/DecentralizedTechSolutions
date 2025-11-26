import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { 
  Client, Matter, TimeEntry, Invoice, CalendarEvent, 
  Document, APIKey, Group, Notification, Expense,
  EventAttendee, InvoiceLineItem
} from '../types'

interface DataState {
  // Data
  clients: Client[]
  matters: Matter[]
  timeEntries: TimeEntry[]
  expenses: Expense[]
  invoices: Invoice[]
  events: CalendarEvent[]
  documents: Document[]
  apiKeys: APIKey[]
  groups: Group[]
  notifications: Notification[]
  
  // Client actions
  addClient: (client: Omit<Client, 'id' | 'createdAt' | 'matterIds'>) => Client
  updateClient: (id: string, data: Partial<Client>) => void
  deleteClient: (id: string) => void
  
  // Matter actions
  addMatter: (matter: Omit<Matter, 'id' | 'number' | 'createdAt'>) => Matter
  updateMatter: (id: string, data: Partial<Matter>) => void
  deleteMatter: (id: string) => void
  
  // Time Entry actions
  addTimeEntry: (entry: Omit<TimeEntry, 'id' | 'createdAt' | 'amount'>) => TimeEntry
  updateTimeEntry: (id: string, data: Partial<TimeEntry>) => void
  deleteTimeEntry: (id: string) => void
  
  // Expense actions
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Expense
  updateExpense: (id: string, data: Partial<Expense>) => void
  deleteExpense: (id: string) => void
  
  // Invoice actions
  addInvoice: (invoice: Omit<Invoice, 'id' | 'number' | 'createdAt'>) => Invoice
  updateInvoice: (id: string, data: Partial<Invoice>) => void
  deleteInvoice: (id: string) => void
  
  // Event actions
  addEvent: (event: Omit<CalendarEvent, 'id' | 'createdAt'>) => CalendarEvent
  updateEvent: (id: string, data: Partial<CalendarEvent>) => void
  deleteEvent: (id: string) => void
  
  // Document actions
  addDocument: (doc: Omit<Document, 'id'>) => Document
  deleteDocument: (id: string) => void
  
  // API Key actions
  addAPIKey: (key: Omit<APIKey, 'id' | 'key' | 'createdAt'>) => APIKey
  deleteAPIKey: (id: string) => void
  
  // Group actions
  addGroup: (group: Omit<Group, 'id' | 'createdAt'>) => Group
  updateGroup: (id: string, data: Partial<Group>) => void
  deleteGroup: (id: string) => void
  
  // Notification actions
  markNotificationRead: (id: string) => void
  clearNotifications: () => void
}

// Helper to create an EventAttendee
const createAttendee = (userId: string, name: string): EventAttendee => ({
  userId,
  email: `${name.toLowerCase().replace(' ', '.')}@apexlaw.com`,
  name,
  status: 'accepted',
  isOrganizer: false,
  isOptional: false
})

// Generate demo data - typed inline to avoid issues
const generateDemoData = () => {
  // Use 'as any' casting for demo data that doesn't need all type fields
  // This is a common pattern for mock/demo data in TypeScript applications
  
  const clients = [
    {
      id: 'client-1',
      type: 'company' as const,
      displayName: 'Quantum Technologies Inc.',
      name: 'Quantum Technologies Inc.',
      companyName: 'Quantum Technologies Inc.',
      email: 'legal@quantumtech.com',
      phone: '(415) 555-0200',
      addressStreet: '500 Innovation Drive',
      addressCity: 'San Francisco',
      addressState: 'CA',
      addressZip: '94105',
      notes: 'Major tech client, very responsive',
      tags: ['tech', 'enterprise', 'priority'],
      contactType: 'client' as const,
      isActive: true,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z',
      createdBy: 'user-1',
      matterIds: ['matter-1', 'matter-4']
    },
    {
      id: 'client-2',
      type: 'person' as const,
      displayName: 'Michael Robertson',
      name: 'Michael Robertson',
      firstName: 'Michael',
      lastName: 'Robertson',
      email: 'michael.r@email.com',
      phone: '(212) 555-0301',
      addressStreet: '250 Park Avenue, Apt 12B',
      addressCity: 'New York',
      addressState: 'NY',
      addressZip: '10017',
      notes: 'Personal injury case, referred by Dr. Williams',
      tags: ['personal-injury', 'individual'],
      contactType: 'client' as const,
      isActive: true,
      createdAt: '2024-02-20T00:00:00Z',
      updatedAt: '2024-02-20T00:00:00Z',
      createdBy: 'user-1',
      matterIds: ['matter-2']
    },
    {
      id: 'client-3',
      type: 'company' as const,
      displayName: 'Meridian Real Estate Group',
      name: 'Meridian Real Estate Group',
      companyName: 'Meridian Real Estate Group',
      email: 'counsel@meridianre.com',
      phone: '(305) 555-0400',
      addressStreet: '1200 Brickell Avenue',
      addressCity: 'Miami',
      addressState: 'FL',
      addressZip: '33131',
      tags: ['real-estate', 'commercial'],
      contactType: 'client' as const,
      isActive: true,
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
      createdBy: 'user-1',
      matterIds: ['matter-3']
    },
    {
      id: 'client-4',
      type: 'company' as const,
      displayName: 'Atlas Manufacturing Co.',
      name: 'Atlas Manufacturing Co.',
      companyName: 'Atlas Manufacturing Co.',
      email: 'legal@atlasmfg.com',
      phone: '(312) 555-0500',
      addressStreet: '800 Industrial Blvd',
      addressCity: 'Chicago',
      addressState: 'IL',
      addressZip: '60601',
      tags: ['manufacturing', 'employment'],
      contactType: 'client' as const,
      isActive: true,
      createdAt: '2024-03-15T00:00:00Z',
      updatedAt: '2024-03-15T00:00:00Z',
      createdBy: 'user-1',
      matterIds: ['matter-5']
    },
    {
      id: 'client-5',
      type: 'person' as const,
      displayName: 'Elena Vasquez',
      name: 'Elena Vasquez',
      firstName: 'Elena',
      lastName: 'Vasquez',
      email: 'elena.v@email.com',
      phone: '(617) 555-0600',
      addressStreet: '45 Beacon Street',
      addressCity: 'Boston',
      addressState: 'MA',
      addressZip: '02108',
      tags: ['estate-planning', 'individual'],
      contactType: 'client' as const,
      isActive: true,
      createdAt: '2024-04-01T00:00:00Z',
      updatedAt: '2024-04-01T00:00:00Z',
      createdBy: 'user-1',
      matterIds: ['matter-6']
    }
  ] as Client[]

  const matters: Matter[] = [
    {
      id: 'matter-1',
      number: 'MTR-2024-001',
      name: 'Quantum v. TechStart - Patent Infringement',
      description: 'Patent infringement lawsuit regarding quantum computing algorithms',
      clientId: 'client-1',
      type: 'intellectual_property',
      status: 'active',
      priority: 'high',
      assignedTo: ['user-1', 'user-2'],
      responsibleAttorney: 'user-1',
      openDate: '2024-01-20T00:00:00Z',
      courtInfo: {
        courtName: 'U.S. District Court, Northern District of California',
        caseNumber: '3:24-cv-00123',
        judge: 'Hon. Sarah Mitchell',
        jurisdiction: 'Federal'
      },
      billingType: 'hourly',
      billingRate: 550,
      budget: 250000,
      tags: ['patent', 'litigation', 'tech'],
      aiSummary: 'Active patent dispute involving quantum computing technology. Strong evidence of infringement based on prior art analysis.',
      conflictCleared: true,
      createdAt: '2024-01-20T00:00:00Z',
      updatedAt: '2024-01-20T00:00:00Z',
      createdBy: 'user-1'
    },
    {
      id: 'matter-2',
      number: 'MTR-2024-002',
      name: 'Robertson v. NYC Transit Authority',
      description: 'Personal injury case - slip and fall at subway station',
      clientId: 'client-2',
      type: 'personal_injury',
      status: 'active',
      priority: 'medium',
      assignedTo: ['user-1'],
      responsibleAttorney: 'user-1',
      openDate: '2024-02-25T00:00:00Z',
      statuteOfLimitations: '2027-02-25T00:00:00Z',
      courtInfo: {
        courtName: 'New York Supreme Court',
        caseNumber: '2024-NY-45678',
        judge: 'Hon. David Park',
        jurisdiction: 'State'
      },
      billingType: 'contingency',
      contingencyPercent: 33,
      tags: ['personal-injury', 'transit', 'premises-liability'],
      aiSummary: 'Premises liability case with documented injuries. Surveillance footage obtained showing hazardous conditions.',
      conflictCleared: true,
      createdAt: '2024-02-25T00:00:00Z',
      updatedAt: '2024-02-25T00:00:00Z',
      createdBy: 'user-1'
    },
    {
      id: 'matter-3',
      number: 'MTR-2024-003',
      name: 'Meridian Plaza Development',
      description: 'Commercial real estate acquisition and development agreement',
      clientId: 'client-3',
      type: 'real_estate',
      status: 'active',
      priority: 'high',
      assignedTo: ['user-1', 'user-3'],
      responsibleAttorney: 'user-1',
      openDate: '2024-03-05T00:00:00Z',
      billingType: 'flat',
      flatFee: 75000,
      tags: ['commercial', 'acquisition', 'development'],
      aiSummary: 'Complex multi-phase development project. Due diligence phase complete, moving to closing.',
      conflictCleared: true,
      createdAt: '2024-03-05T00:00:00Z',
      updatedAt: '2024-03-05T00:00:00Z',
      createdBy: 'user-1'
    },
    {
      id: 'matter-4',
      number: 'MTR-2024-004',
      name: 'Quantum Technologies - Series C Funding',
      description: 'Corporate counsel for Series C funding round',
      clientId: 'client-1',
      type: 'corporate',
      status: 'active',
      priority: 'urgent',
      assignedTo: ['user-1'],
      responsibleAttorney: 'user-1',
      openDate: '2024-04-01T00:00:00Z',
      billingType: 'hourly',
      billingRate: 500,
      budget: 100000,
      tags: ['funding', 'corporate', 'venture-capital'],
      aiSummary: 'Series C funding round targeting $150M. Lead investor terms under negotiation.',
      conflictCleared: true,
      createdAt: '2024-04-01T00:00:00Z',
      updatedAt: '2024-04-01T00:00:00Z',
      createdBy: 'user-1'
    },
    {
      id: 'matter-5',
      number: 'MTR-2024-005',
      name: 'Atlas Employment Dispute',
      description: 'Defense against wrongful termination claim',
      clientId: 'client-4',
      type: 'employment',
      status: 'pending',
      priority: 'medium',
      assignedTo: ['user-1'],
      responsibleAttorney: 'user-1',
      openDate: '2024-03-20T00:00:00Z',
      billingType: 'retainer',
      retainerAmount: 25000,
      billingRate: 400,
      tags: ['employment', 'defense', 'wrongful-termination'],
      aiSummary: 'Defending against claims of wrongful termination. Documentation supports proper procedure was followed.',
      conflictCleared: true,
      createdAt: '2024-03-20T00:00:00Z',
      updatedAt: '2024-03-20T00:00:00Z',
      createdBy: 'user-1'
    },
    {
      id: 'matter-6',
      number: 'MTR-2024-006',
      name: 'Vasquez Estate Plan',
      description: 'Comprehensive estate planning including trust creation',
      clientId: 'client-5',
      type: 'estate_planning',
      status: 'active',
      priority: 'low',
      assignedTo: ['user-1'],
      responsibleAttorney: 'user-1',
      openDate: '2024-04-05T00:00:00Z',
      billingType: 'flat',
      flatFee: 15000,
      tags: ['estate', 'trust', 'planning'],
      aiSummary: 'Creating revocable living trust with pour-over will. Asset inventory complete.',
      conflictCleared: true,
      createdAt: '2024-04-05T00:00:00Z',
      updatedAt: '2024-04-05T00:00:00Z',
      createdBy: 'user-1'
    }
  ]

  const timeEntries: TimeEntry[] = [
    {
      id: 'time-1',
      matterId: 'matter-1',
      userId: 'user-1',
      date: '2024-11-25T00:00:00Z',
      hours: 3.5,
      description: 'Research prior art and prepare claim construction analysis',
      billable: true,
      billed: false,
      rate: 550,
      amount: 1925,
      activityCode: 'L120',
      aiGenerated: false,
      status: 'pending',
      entryType: 'manual',
      createdAt: '2024-11-25T17:00:00Z',
      updatedAt: '2024-11-25T17:00:00Z'
    },
    {
      id: 'time-2',
      matterId: 'matter-1',
      userId: 'user-1',
      date: '2024-11-25T00:00:00Z',
      hours: 2.0,
      description: 'Draft motion for preliminary injunction',
      billable: true,
      billed: false,
      rate: 550,
      amount: 1100,
      activityCode: 'L130',
      aiGenerated: false,
      status: 'pending',
      entryType: 'manual',
      createdAt: '2024-11-25T15:00:00Z',
      updatedAt: '2024-11-25T15:00:00Z'
    },
    {
      id: 'time-3',
      matterId: 'matter-4',
      userId: 'user-1',
      date: '2024-11-24T00:00:00Z',
      hours: 4.0,
      description: 'Review and markup term sheet with investor comments',
      billable: true,
      billed: false,
      rate: 500,
      amount: 2000,
      activityCode: 'L110',
      aiGenerated: false,
      status: 'pending',
      entryType: 'manual',
      createdAt: '2024-11-24T18:00:00Z',
      updatedAt: '2024-11-24T18:00:00Z'
    },
    {
      id: 'time-4',
      matterId: 'matter-2',
      userId: 'user-1',
      date: '2024-11-23T00:00:00Z',
      hours: 1.5,
      description: 'Client call to discuss settlement offer',
      billable: true,
      billed: false,
      rate: 450,
      amount: 675,
      activityCode: 'C100',
      aiGenerated: false,
      status: 'pending',
      entryType: 'manual',
      createdAt: '2024-11-23T14:00:00Z',
      updatedAt: '2024-11-23T14:00:00Z'
    },
    {
      id: 'time-5',
      matterId: 'matter-3',
      userId: 'user-1',
      date: '2024-11-22T00:00:00Z',
      hours: 5.0,
      description: 'Due diligence review of property documents',
      billable: true,
      billed: false,
      rate: 450,
      amount: 2250,
      activityCode: 'L100',
      aiGenerated: false,
      status: 'pending',
      entryType: 'manual',
      createdAt: '2024-11-22T16:00:00Z',
      updatedAt: '2024-11-22T16:00:00Z'
    }
  ]

  const expenses: Expense[] = [
    {
      id: 'exp-1',
      matterId: 'matter-1',
      userId: 'user-1',
      date: '2024-11-20T00:00:00Z',
      description: 'Court filing fees - Motion for Preliminary Injunction',
      amount: 450,
      category: 'Filing Fees',
      expenseType: 'filing_fee',
      billable: true,
      billed: false,
      hasReceipt: true,
      reimbursable: false,
      reimbursed: false,
      status: 'approved',
      createdAt: '2024-11-20T00:00:00Z',
      updatedAt: '2024-11-20T00:00:00Z'
    },
    {
      id: 'exp-2',
      matterId: 'matter-2',
      userId: 'user-1',
      date: '2024-11-18T00:00:00Z',
      description: 'Expert witness consultation - Orthopedic specialist',
      amount: 2500,
      category: 'Expert Fees',
      expenseType: 'expert_fees',
      billable: true,
      billed: false,
      hasReceipt: true,
      reimbursable: false,
      reimbursed: false,
      status: 'approved',
      createdAt: '2024-11-18T00:00:00Z',
      updatedAt: '2024-11-18T00:00:00Z'
    }
  ]

  const lineItem1: InvoiceLineItem = { id: 'li-1', type: 'fee', description: 'Legal services - October 2024', quantity: 45, rate: 550, amount: 24750 }
  const lineItem2: InvoiceLineItem = { id: 'li-2', type: 'fee', description: 'Legal services - September 2024', quantity: 37, rate: 500, amount: 18500 }
  const lineItem3: InvoiceLineItem = { id: 'li-3', type: 'flat_fee', description: 'Phase 1 - Due Diligence (33% of flat fee)', quantity: 1, rate: 25000, amount: 25000 }

  const invoices: Invoice[] = [
    {
      id: 'inv-1',
      number: 'INV-2024-0042',
      matterId: 'matter-1',
      clientId: 'client-1',
      status: 'sent',
      issueDate: '2024-11-01T00:00:00Z',
      dueDate: '2024-12-01T00:00:00Z',
      subtotalFees: 24750,
      subtotalExpenses: 0,
      subtotal: 24750,
      total: 24750,
      amountDue: 24750,
      amountPaid: 0,
      lineItems: [lineItem1],
      createdAt: '2024-11-01T00:00:00Z',
      updatedAt: '2024-11-01T00:00:00Z',
      createdBy: 'user-1'
    },
    {
      id: 'inv-2',
      number: 'INV-2024-0041',
      matterId: 'matter-4',
      clientId: 'client-1',
      status: 'paid',
      issueDate: '2024-10-01T00:00:00Z',
      dueDate: '2024-11-01T00:00:00Z',
      subtotalFees: 18500,
      subtotalExpenses: 0,
      subtotal: 18500,
      total: 18500,
      amountDue: 0,
      amountPaid: 18500,
      lineItems: [lineItem2],
      createdAt: '2024-10-01T00:00:00Z',
      updatedAt: '2024-10-01T00:00:00Z',
      createdBy: 'user-1'
    },
    {
      id: 'inv-3',
      number: 'INV-2024-0040',
      matterId: 'matter-3',
      clientId: 'client-3',
      status: 'overdue',
      issueDate: '2024-10-15T00:00:00Z',
      dueDate: '2024-11-15T00:00:00Z',
      subtotalFees: 25000,
      subtotalExpenses: 0,
      subtotal: 25000,
      total: 25000,
      amountDue: 25000,
      amountPaid: 0,
      lineItems: [lineItem3],
      notes: 'First installment of flat fee arrangement',
      createdAt: '2024-10-15T00:00:00Z',
      updatedAt: '2024-10-15T00:00:00Z',
      createdBy: 'user-1'
    }
  ]

  const today = new Date()
  const events: CalendarEvent[] = [
    {
      id: 'event-1',
      title: 'Quantum v. TechStart - Claim Construction Hearing',
      description: 'Present claim construction arguments before Judge Mitchell',
      type: 'court_date',
      matterId: 'matter-1',
      startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5, 9, 0).toISOString(),
      endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5, 12, 0).toISOString(),
      allDay: false,
      location: 'U.S. District Court, NDCA, Courtroom 4',
      attendees: [createAttendee('user-1', 'John Mitchell'), createAttendee('user-2', 'Sarah Chen')],
      reminders: [{ type: 'email', minutes: 1440 }, { type: 'notification', minutes: 60 }],
      color: '#EF4444',
      isPrivate: false,
      status: 'confirmed',
      createdBy: 'user-1',
      createdAt: '2024-11-01T00:00:00Z',
      updatedAt: '2024-11-01T00:00:00Z'
    },
    {
      id: 'event-2',
      title: 'Quantum Series C - Investor Call',
      description: 'Weekly sync with lead investor on term sheet negotiations',
      type: 'meeting',
      matterId: 'matter-4',
      startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 14, 0).toISOString(),
      endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 15, 0).toISOString(),
      allDay: false,
      location: 'Video Conference',
      attendees: [createAttendee('user-1', 'John Mitchell')],
      reminders: [{ type: 'notification', minutes: 15 }],
      color: '#3B82F6',
      isPrivate: false,
      status: 'confirmed',
      createdBy: 'user-1',
      createdAt: '2024-11-15T00:00:00Z',
      updatedAt: '2024-11-15T00:00:00Z'
    },
    {
      id: 'event-3',
      title: 'Discovery Deadline - Robertson Matter',
      description: 'Deadline to respond to discovery requests',
      type: 'deadline',
      matterId: 'matter-2',
      startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 17, 0).toISOString(),
      endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 17, 0).toISOString(),
      allDay: false,
      attendees: [createAttendee('user-1', 'John Mitchell')],
      reminders: [{ type: 'email', minutes: 4320 }, { type: 'notification', minutes: 1440 }],
      color: '#F59E0B',
      isPrivate: false,
      status: 'confirmed',
      createdBy: 'user-1',
      createdAt: '2024-11-10T00:00:00Z',
      updatedAt: '2024-11-10T00:00:00Z'
    },
    {
      id: 'event-4',
      title: 'Elena Vasquez - Trust Review Meeting',
      description: 'Review draft trust documents with client',
      type: 'meeting',
      matterId: 'matter-6',
      clientId: 'client-5',
      startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 10, 0).toISOString(),
      endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 11, 30).toISOString(),
      allDay: false,
      location: 'Office - Conference Room A',
      attendees: [createAttendee('user-1', 'John Mitchell')],
      reminders: [{ type: 'email', minutes: 1440 }],
      color: '#10B981',
      isPrivate: false,
      status: 'confirmed',
      createdBy: 'user-1',
      createdAt: '2024-11-20T00:00:00Z',
      updatedAt: '2024-11-20T00:00:00Z'
    },
    {
      id: 'event-5',
      title: 'Meridian Closing',
      description: 'Property closing for Phase 1',
      type: 'closing',
      matterId: 'matter-3',
      startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14, 10, 0).toISOString(),
      endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14, 14, 0).toISOString(),
      allDay: false,
      location: 'First National Title - Miami',
      attendees: [createAttendee('user-1', 'John Mitchell')],
      reminders: [{ type: 'email', minutes: 10080 }],
      color: '#8B5CF6',
      isPrivate: false,
      status: 'confirmed',
      createdBy: 'user-1',
      createdAt: '2024-11-01T00:00:00Z',
      updatedAt: '2024-11-01T00:00:00Z'
    }
  ]

  const documents: Document[] = [
    {
      id: 'doc-1',
      name: 'Patent_Claims_Analysis.pdf',
      type: 'application/pdf',
      size: 2456789,
      matterId: 'matter-1',
      version: 1,
      isLatestVersion: true,
      status: 'final',
      isConfidential: false,
      uploadedBy: 'user-1',
      uploadedAt: '2024-11-20T00:00:00Z',
      updatedAt: '2024-11-20T00:00:00Z',
      aiSummary: 'Detailed analysis of patent claims 1-15 with prior art references and infringement mapping.',
      tags: ['patent', 'analysis', 'claims']
    },
    {
      id: 'doc-2',
      name: 'Series_C_Term_Sheet_v3.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 156234,
      matterId: 'matter-4',
      version: 3,
      isLatestVersion: true,
      status: 'draft',
      isConfidential: false,
      uploadedBy: 'user-1',
      uploadedAt: '2024-11-22T00:00:00Z',
      updatedAt: '2024-11-22T00:00:00Z',
      aiSummary: 'Latest term sheet iteration with $150M valuation, 2x liquidation preference, and board composition terms.',
      tags: ['term-sheet', 'funding', 'draft']
    },
    {
      id: 'doc-3',
      name: 'Robertson_Medical_Records.pdf',
      type: 'application/pdf',
      size: 8945123,
      matterId: 'matter-2',
      version: 1,
      isLatestVersion: true,
      status: 'final',
      isConfidential: true,
      uploadedBy: 'user-1',
      uploadedAt: '2024-11-15T00:00:00Z',
      updatedAt: '2024-11-15T00:00:00Z',
      aiSummary: 'Medical records documenting injuries sustained, treatment plan, and prognosis from treating physician.',
      tags: ['medical', 'evidence', 'confidential']
    }
  ]

  const apiKeys: APIKey[] = [
    {
      id: 'key-1',
      name: 'Document Management Integration',
      key: 'apx_live_a1b2c3d4e5f6g7h8i9j0...',
      keyPrefix: 'apx_live',
      permissions: ['documents:read', 'documents:write'],
      lastUsed: '2024-11-25T14:30:00Z',
      isActive: true,
      createdBy: 'user-1',
      createdAt: '2024-06-01T00:00:00Z'
    },
    {
      id: 'key-2',
      name: 'Calendar Sync',
      key: 'apx_live_k1l2m3n4o5p6q7r8s9t0...',
      keyPrefix: 'apx_live',
      permissions: ['calendar:read', 'calendar:write'],
      lastUsed: '2024-11-25T09:00:00Z',
      isActive: true,
      createdBy: 'user-1',
      createdAt: '2024-08-15T00:00:00Z'
    }
  ]

  const groups: Group[] = [
    {
      id: 'group-1',
      name: 'Litigation Team',
      description: 'Attorneys and paralegals handling litigation matters',
      memberIds: ['user-1', 'user-2'],
      permissions: ['matters:all', 'documents:all', 'billing:view'],
      color: '#EF4444',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    },
    {
      id: 'group-2',
      name: 'Corporate Team',
      description: 'Corporate and transactional practice group',
      memberIds: ['user-1', 'user-3'],
      permissions: ['matters:all', 'documents:all', 'billing:all'],
      color: '#3B82F6',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    },
    {
      id: 'group-3',
      name: 'Administrative Staff',
      description: 'Office administrators and support staff',
      memberIds: ['user-4'],
      permissions: ['matters:view', 'documents:view', 'calendar:all'],
      color: '#10B981',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    }
  ]

  const notifications: Notification[] = [
    {
      id: 'notif-1',
      type: 'deadline_reminder',
      category: 'deadline',
      title: 'Upcoming Deadline',
      message: 'Discovery response due in 7 days for Robertson v. NYC Transit Authority',
      read: false,
      actionUrl: '/matters/matter-2',
      userId: 'user-1',
      createdAt: new Date().toISOString()
    },
    {
      id: 'notif-2',
      type: 'invoice_overdue',
      category: 'billing',
      title: 'Invoice Overdue',
      message: 'Invoice INV-2024-0040 is 10 days overdue',
      read: false,
      actionUrl: '/billing',
      userId: 'user-1',
      createdAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'notif-3',
      type: 'ai_insight',
      category: 'ai',
      title: 'AI Insight',
      message: 'New case law relevant to Quantum v. TechStart identified',
      read: true,
      actionUrl: '/ai',
      userId: 'user-1',
      createdAt: new Date(Date.now() - 172800000).toISOString()
    }
  ]

  return { clients, matters, timeEntries, expenses, invoices, events, documents, apiKeys, groups, notifications }
}

const initialData = generateDemoData()

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      ...initialData,

      // Client actions
      addClient: (data) => {
        const client: Client = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString(),
          matterIds: []
        }
        set(state => ({ clients: [...state.clients, client] }))
        return client
      },
      updateClient: (id, data) => {
        set(state => ({
          clients: state.clients.map(c => c.id === id ? { ...c, ...data } : c)
        }))
      },
      deleteClient: (id) => {
        set(state => ({ clients: state.clients.filter(c => c.id !== id) }))
      },

      // Matter actions
      addMatter: (data) => {
        const { matters } = get()
        const now = new Date().toISOString()
        const number = `MTR-${new Date().getFullYear()}-${String(matters.length + 1).padStart(3, '0')}`
        const matter: Matter = {
          ...data,
          id: generateId(),
          number,
          conflictCleared: data.conflictCleared ?? false,
          createdAt: now,
          updatedAt: now,
          createdBy: data.createdBy ?? 'user-1'
        }
        set(state => ({ matters: [...state.matters, matter] }))
        return matter
      },
      updateMatter: (id, data) => {
        set(state => ({
          matters: state.matters.map(m => m.id === id ? { ...m, ...data } : m)
        }))
      },
      deleteMatter: (id) => {
        set(state => ({ matters: state.matters.filter(m => m.id !== id) }))
      },

      // Time Entry actions
      addTimeEntry: (data) => {
        const now = new Date().toISOString()
        const entry: TimeEntry = {
          ...data,
          id: generateId(),
          amount: data.hours * data.rate,
          status: data.status ?? 'pending',
          entryType: data.entryType ?? 'manual',
          createdAt: now,
          updatedAt: now
        }
        set(state => ({ timeEntries: [...state.timeEntries, entry] }))
        return entry
      },
      updateTimeEntry: (id, data) => {
        set(state => ({
          timeEntries: state.timeEntries.map(t => {
            if (t.id === id) {
              const updated = { ...t, ...data }
              updated.amount = updated.hours * updated.rate
              return updated
            }
            return t
          })
        }))
      },
      deleteTimeEntry: (id) => {
        set(state => ({ timeEntries: state.timeEntries.filter(t => t.id !== id) }))
      },

      // Expense actions
      addExpense: (data) => {
        const now = new Date().toISOString()
        const expense: Expense = {
          ...data,
          id: generateId(),
          expenseType: data.expenseType ?? 'other',
          hasReceipt: data.hasReceipt ?? false,
          reimbursable: data.reimbursable ?? false,
          reimbursed: data.reimbursed ?? false,
          status: data.status ?? 'pending',
          createdAt: now,
          updatedAt: now
        }
        set(state => ({ expenses: [...state.expenses, expense] }))
        return expense
      },
      updateExpense: (id, data) => {
        set(state => ({
          expenses: state.expenses.map(e => e.id === id ? { ...e, ...data } : e)
        }))
      },
      deleteExpense: (id) => {
        set(state => ({ expenses: state.expenses.filter(e => e.id !== id) }))
      },

      // Invoice actions
      addInvoice: (data) => {
        const { invoices } = get()
        const now = new Date().toISOString()
        const number = `INV-${new Date().getFullYear()}-${String(invoices.length + 43).padStart(4, '0')}`
        const invoice: Invoice = {
          ...data,
          id: generateId(),
          number,
          createdAt: now,
          updatedAt: now,
          createdBy: data.createdBy ?? 'user-1'
        }
        set(state => ({ invoices: [...state.invoices, invoice] }))
        return invoice
      },
      updateInvoice: (id, data) => {
        set(state => ({
          invoices: state.invoices.map(i => i.id === id ? { ...i, ...data } : i)
        }))
      },
      deleteInvoice: (id) => {
        set(state => ({ invoices: state.invoices.filter(i => i.id !== id) }))
      },

      // Event actions
      addEvent: (data) => {
        const now = new Date().toISOString()
        const event: CalendarEvent = {
          ...data,
          id: generateId(),
          isPrivate: data.isPrivate ?? false,
          status: data.status ?? 'confirmed',
          createdAt: now,
          updatedAt: now
        }
        set(state => ({ events: [...state.events, event] }))
        return event
      },
      updateEvent: (id, data) => {
        set(state => ({
          events: state.events.map(e => e.id === id ? { ...e, ...data } : e)
        }))
      },
      deleteEvent: (id) => {
        set(state => ({ events: state.events.filter(e => e.id !== id) }))
      },

      // Document actions
      addDocument: (data) => {
        const now = new Date().toISOString()
        const doc: Document = { 
          ...data, 
          id: generateId(),
          version: data.version ?? 1,
          isLatestVersion: data.isLatestVersion ?? true,
          status: data.status ?? 'draft',
          isConfidential: data.isConfidential ?? false,
          uploadedAt: data.uploadedAt ?? now,
          updatedAt: now,
          tags: data.tags ?? []
        }
        set(state => ({ documents: [...state.documents, doc] }))
        return doc
      },
      deleteDocument: (id) => {
        set(state => ({ documents: state.documents.filter(d => d.id !== id) }))
      },

      // API Key actions
      addAPIKey: (data) => {
        const generatedKey = `apx_live_${Array.from({ length: 32 }, () => 
          'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
        ).join('')}`
        const key: APIKey = {
          ...data,
          id: generateId(),
          key: generatedKey,
          keyPrefix: 'apx_live',
          isActive: true,
          createdAt: new Date().toISOString()
        }
        set(state => ({ apiKeys: [...state.apiKeys, key] }))
        return key
      },
      deleteAPIKey: (id) => {
        set(state => ({ apiKeys: state.apiKeys.filter(k => k.id !== id) }))
      },

      // Group actions
      addGroup: (data) => {
        const now = new Date().toISOString()
        const group: Group = {
          ...data,
          id: generateId(),
          createdAt: now,
          updatedAt: now
        }
        set(state => ({ groups: [...state.groups, group] }))
        return group
      },
      updateGroup: (id, data) => {
        set(state => ({
          groups: state.groups.map(g => g.id === id ? { ...g, ...data } : g)
        }))
      },
      deleteGroup: (id) => {
        set(state => ({ groups: state.groups.filter(g => g.id !== id) }))
      },

      // Notification actions
      markNotificationRead: (id) => {
        set(state => ({
          notifications: state.notifications.map(n => 
            n.id === id ? { ...n, read: true } : n
          )
        }))
      },
      clearNotifications: () => {
        set({ notifications: [] })
      }
    }),
    {
      name: 'apex-data'
    }
  )
)
