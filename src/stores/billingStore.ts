import { create } from 'zustand'
import { billingDataApi } from '../services/api'

// Trust Account Types (IOLTA Compliance)
export interface TrustAccount {
  id: string
  firmId: string
  bankName: string
  accountName: string
  accountNumber: string
  routingNumber: string
  accountType: 'iolta' | 'operating'
  balance: number
  isVerified: boolean
  lastReconciled?: string
  createdAt: string
}

export interface TrustTransaction {
  id: string
  trustAccountId: string
  clientId: string
  matterId?: string
  type: 'deposit' | 'withdrawal' | 'transfer' | 'interest' | 'fee'
  amount: number
  description: string
  reference?: string
  paymentMethod?: 'check' | 'wire' | 'ach' | 'credit_card'
  checkNumber?: string
  clearedAt?: string
  createdBy: string
  createdAt: string
}

export interface ClientLedger {
  clientId: string
  trustBalance: number
  operatingBalance: number
  transactions: TrustTransaction[]
}

// Payment Processing Types
export interface PaymentProcessor {
  id: string
  name: string
  type: 'stripe' | 'lawpay' | 'paypal' | 'ach_direct'
  isActive: boolean
  isDefault: boolean
  credentials: {
    publicKey?: string
    merchantId?: string
    isConnected: boolean
  }
  fees: {
    creditCardPercent: number
    creditCardFixed: number
    achPercent: number
    achFixed: number
  }
  supportedMethods: ('credit_card' | 'ach' | 'echeck')[]
  createdAt: string
}

export interface PaymentLink {
  id: string
  invoiceId: string
  clientId: string
  amount: number
  expiresAt: string
  url: string
  status: 'active' | 'paid' | 'expired' | 'cancelled'
  createdAt: string
}

export interface RecurringPayment {
  id: string
  clientId: string
  matterId?: string
  amount: number
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
  paymentMethod: string
  nextPaymentDate: string
  lastPaymentDate?: string
  status: 'active' | 'paused' | 'cancelled'
  createdAt: string
}

// Invoice Settings
export interface InvoiceTemplate {
  id: string
  name: string
  isDefault: boolean
  header: {
    showLogo: boolean
    showFirmAddress: boolean
    customMessage?: string
  }
  lineItems: {
    showActivityCodes: boolean
    showTimekeeper: boolean
    groupByTask: boolean
    showHourlyRate: boolean
  }
  footer: {
    showPaymentInstructions: boolean
    paymentInstructions?: string
    showLatePolicy: boolean
    lateFeePolicy?: string
    customNotes?: string
  }
  styling: {
    primaryColor: string
    fontFamily: string
  }
  createdAt: string
}

// Billing Store State
interface BillingStoreState {
  // Loading state
  isLoading: boolean
  isInitialized: boolean
  
  // Trust Accounts
  trustAccounts: TrustAccount[]
  trustTransactions: TrustTransaction[]
  clientLedgers: Record<string, ClientLedger>
  
  // Payment Processing
  paymentProcessors: PaymentProcessor[]
  paymentLinks: PaymentLink[]
  recurringPayments: RecurringPayment[]
  
  // Invoice Templates
  invoiceTemplates: InvoiceTemplate[]
  
  // Settings
  billingSettings: {
    defaultPaymentTerms: number
    lateFeeEnabled: boolean
    lateFeePercent: number
    lateFeeGraceDays: number
    autoSendReminders: boolean
    reminderDays: number[]
    defaultBillingIncrement: number
    roundingMethod: string
    minimumEntryMinutes: number
    defaultHourlyRate: number | null
    requireTimeEntryApproval: boolean
    requireExpenseApproval: boolean
    acceptCreditCards: boolean
    acceptACH: boolean
    surchargeEnabled: boolean
    surchargePercent: number
    utbmsEnabled: boolean
    requireActivityCode: boolean
  }
  
  // Fetch all data
  fetchAll: () => Promise<void>
  
  // Trust Account Actions
  addTrustAccount: (account: Omit<TrustAccount, 'id' | 'createdAt'>) => Promise<TrustAccount>
  updateTrustAccount: (id: string, data: Partial<TrustAccount>) => Promise<void>
  deleteTrustAccount: (id: string) => Promise<void>
  reconcileTrustAccount: (id: string) => Promise<void>
  
  // Trust Transaction Actions
  addTrustTransaction: (transaction: Omit<TrustTransaction, 'id' | 'createdAt'>) => Promise<TrustTransaction>
  clearTransaction: (id: string) => Promise<void>
  getClientLedger: (clientId: string) => ClientLedger
  
  // Payment Processor Actions
  addPaymentProcessor: (processor: Omit<PaymentProcessor, 'id' | 'createdAt'>) => Promise<PaymentProcessor>
  updatePaymentProcessor: (id: string, data: Partial<PaymentProcessor>) => Promise<void>
  setDefaultProcessor: (id: string) => Promise<void>
  disconnectProcessor: (id: string) => Promise<void>
  
  // Payment Link Actions
  createPaymentLink: (invoiceId: string, clientId: string, amount: number) => Promise<PaymentLink>
  expirePaymentLink: (id: string) => Promise<void>
  markPaymentLinkPaid: (id: string) => Promise<void>
  
  // Recurring Payment Actions
  addRecurringPayment: (payment: Omit<RecurringPayment, 'id' | 'createdAt'>) => Promise<RecurringPayment>
  updateRecurringPayment: (id: string, data: Partial<RecurringPayment>) => Promise<void>
  cancelRecurringPayment: (id: string) => Promise<void>
  
  // Template Actions
  addInvoiceTemplate: (template: Omit<InvoiceTemplate, 'id' | 'createdAt'>) => Promise<InvoiceTemplate>
  updateInvoiceTemplate: (id: string, data: Partial<InvoiceTemplate>) => Promise<void>
  deleteInvoiceTemplate: (id: string) => Promise<void>
  setDefaultTemplate: (id: string) => Promise<void>
  
  // Settings Actions
  updateBillingSettings: (settings: Partial<BillingStoreState['billingSettings']>) => Promise<void>
  
  // Reports
  getTrustAccountReport: (accountId: string, startDate: string, endDate: string) => any
  getThreeWayReconciliation: (accountId: string) => any
}

const defaultBillingSettings = {
  defaultPaymentTerms: 30,
  lateFeeEnabled: false,
  lateFeePercent: 1.5,
  lateFeeGraceDays: 5,
  autoSendReminders: true,
  reminderDays: [7, 3, 1, 0],
  defaultBillingIncrement: 6,
  roundingMethod: 'up',
  minimumEntryMinutes: 6,
  defaultHourlyRate: null,
  requireTimeEntryApproval: false,
  requireExpenseApproval: false,
  acceptCreditCards: true,
  acceptACH: true,
  surchargeEnabled: false,
  surchargePercent: 3,
  utbmsEnabled: false,
  requireActivityCode: false,
}

export const useBillingStore = create<BillingStoreState>()(
  (set, get) => ({
    isLoading: false,
    isInitialized: false,
    trustAccounts: [],
    trustTransactions: [],
    clientLedgers: {},
    paymentProcessors: [],
    paymentLinks: [],
    recurringPayments: [],
    invoiceTemplates: [],
    billingSettings: defaultBillingSettings,

    // Fetch all billing data from database
    fetchAll: async () => {
      if (get().isLoading) return
      set({ isLoading: true })
      try {
        const data = await billingDataApi.getAll()
        set({
          trustAccounts: data.trustAccounts || [],
          trustTransactions: data.trustTransactions || [],
          paymentProcessors: data.paymentProcessors || [],
          paymentLinks: data.paymentLinks || [],
          recurringPayments: data.recurringPayments || [],
          invoiceTemplates: data.invoiceTemplates || [],
          billingSettings: data.billingSettings || defaultBillingSettings,
          isInitialized: true,
          isLoading: false,
        })
      } catch (error) {
        console.error('Failed to fetch billing data:', error)
        set({ isLoading: false, isInitialized: true })
      }
    },

    // Trust Account Actions
    addTrustAccount: async (data) => {
      const account = await billingDataApi.createTrustAccount(data)
      set(state => ({ trustAccounts: [...state.trustAccounts, account] }))
      return account
    },

    updateTrustAccount: async (id, data) => {
      await billingDataApi.updateTrustAccount(id, data)
      set(state => ({
        trustAccounts: state.trustAccounts.map(a => 
          a.id === id ? { ...a, ...data } : a
        )
      }))
    },

    deleteTrustAccount: async (id) => {
      await billingDataApi.deleteTrustAccount(id)
      set(state => ({ trustAccounts: state.trustAccounts.filter(a => a.id !== id) }))
    },

    reconcileTrustAccount: async (id) => {
      const lastReconciled = new Date().toISOString()
      await billingDataApi.updateTrustAccount(id, { lastReconciled })
      set(state => ({
        trustAccounts: state.trustAccounts.map(a =>
          a.id === id ? { ...a, lastReconciled } : a
        )
      }))
    },

    // Trust Transaction Actions
    addTrustTransaction: async (data) => {
      const transaction = await billingDataApi.createTrustTransaction(data)
      
      // Update local account balance
      const account = get().trustAccounts.find(a => a.id === data.trustAccountId)
      if (account) {
        const balanceChange = data.type === 'deposit' || data.type === 'interest' 
          ? data.amount 
          : -data.amount
        set(state => ({
          trustAccounts: state.trustAccounts.map(a =>
            a.id === data.trustAccountId ? { ...a, balance: a.balance + balanceChange } : a
          )
        }))
      }
      
      set(state => ({ 
        trustTransactions: [...state.trustTransactions, transaction] 
      }))
      return transaction
    },

    clearTransaction: async (id) => {
      await billingDataApi.updateTrustTransaction(id, { clearedAt: new Date().toISOString() })
      set(state => ({
        trustTransactions: state.trustTransactions.map(t =>
          t.id === id ? { ...t, clearedAt: new Date().toISOString() } : t
        )
      }))
    },

    getClientLedger: (clientId) => {
      const transactions = get().trustTransactions.filter(t => t.clientId === clientId)
      const trustBalance = transactions.reduce((sum, t) => {
        if (t.type === 'deposit' || t.type === 'interest') return sum + t.amount
        if (t.type === 'withdrawal' || t.type === 'fee') return sum - t.amount
        return sum
      }, 0)
      
      return {
        clientId,
        trustBalance,
        operatingBalance: 0,
        transactions
      }
    },

    // Payment Processor Actions
    addPaymentProcessor: async (data) => {
      const processor = await billingDataApi.createPaymentProcessor(data)
      set(state => ({ paymentProcessors: [...state.paymentProcessors, processor] }))
      return processor
    },

    updatePaymentProcessor: async (id, data) => {
      await billingDataApi.updatePaymentProcessor(id, data)
      set(state => ({
        paymentProcessors: state.paymentProcessors.map(p =>
          p.id === id ? { ...p, ...data } : p
        )
      }))
    },

    setDefaultProcessor: async (id) => {
      await billingDataApi.updatePaymentProcessor(id, { isDefault: true })
      set(state => ({
        paymentProcessors: state.paymentProcessors.map(p => ({
          ...p,
          isDefault: p.id === id
        }))
      }))
    },

    disconnectProcessor: async (id) => {
      await billingDataApi.updatePaymentProcessor(id, { 
        isActive: false,
        credentials: { isConnected: false }
      })
      set(state => ({
        paymentProcessors: state.paymentProcessors.map(p =>
          p.id === id ? { 
            ...p, 
            isActive: false,
            credentials: { ...p.credentials, isConnected: false }
          } : p
        )
      }))
    },

    // Payment Link Actions
    createPaymentLink: async (invoiceId, clientId, amount) => {
      const link = await billingDataApi.createPaymentLink({ invoiceId, clientId, amount })
      set(state => ({ paymentLinks: [...state.paymentLinks, link] }))
      return link
    },

    expirePaymentLink: async (id) => {
      await billingDataApi.updatePaymentLink(id, { status: 'expired' })
      set(state => ({
        paymentLinks: state.paymentLinks.map(l =>
          l.id === id ? { ...l, status: 'expired' as const } : l
        )
      }))
    },

    markPaymentLinkPaid: async (id) => {
      await billingDataApi.updatePaymentLink(id, { status: 'paid' })
      set(state => ({
        paymentLinks: state.paymentLinks.map(l =>
          l.id === id ? { ...l, status: 'paid' as const } : l
        )
      }))
    },

    // Recurring Payment Actions
    addRecurringPayment: async (data) => {
      const payment = await billingDataApi.createRecurringPayment(data)
      set(state => ({ recurringPayments: [...state.recurringPayments, payment] }))
      return payment
    },

    updateRecurringPayment: async (id, data) => {
      await billingDataApi.updateRecurringPayment(id, data)
      set(state => ({
        recurringPayments: state.recurringPayments.map(p =>
          p.id === id ? { ...p, ...data } : p
        )
      }))
    },

    cancelRecurringPayment: async (id) => {
      await billingDataApi.updateRecurringPayment(id, { status: 'cancelled' })
      set(state => ({
        recurringPayments: state.recurringPayments.map(p =>
          p.id === id ? { ...p, status: 'cancelled' as const } : p
        )
      }))
    },

    // Template Actions
    addInvoiceTemplate: async (data) => {
      const template = await billingDataApi.createInvoiceTemplate(data)
      set(state => ({ invoiceTemplates: [...state.invoiceTemplates, template] }))
      return template
    },

    updateInvoiceTemplate: async (id, data) => {
      await billingDataApi.updateInvoiceTemplate(id, data)
      set(state => ({
        invoiceTemplates: state.invoiceTemplates.map(t =>
          t.id === id ? { ...t, ...data } : t
        )
      }))
    },

    deleteInvoiceTemplate: async (id) => {
      await billingDataApi.deleteInvoiceTemplate(id)
      set(state => ({ 
        invoiceTemplates: state.invoiceTemplates.filter(t => t.id !== id) 
      }))
    },

    setDefaultTemplate: async (id) => {
      await billingDataApi.updateInvoiceTemplate(id, { isDefault: true })
      set(state => ({
        invoiceTemplates: state.invoiceTemplates.map(t => ({
          ...t,
          isDefault: t.id === id
        }))
      }))
    },

    // Settings Actions
    updateBillingSettings: async (settings) => {
      await billingDataApi.updateSettings(settings)
      set(state => ({
        billingSettings: { ...state.billingSettings, ...settings }
      }))
    },

    // Reports (computed locally from fetched data)
    getTrustAccountReport: (accountId, startDate, endDate) => {
      const transactions = get().trustTransactions.filter(t => 
        t.trustAccountId === accountId &&
        t.createdAt >= startDate &&
        t.createdAt <= endDate
      )
      
      const deposits = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0)
      const withdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0)
      
      return {
        transactions,
        summary: {
          totalDeposits: deposits,
          totalWithdrawals: withdrawals,
          netChange: deposits - withdrawals,
          transactionCount: transactions.length
        }
      }
    },

    getThreeWayReconciliation: (accountId) => {
      const account = get().trustAccounts.find(a => a.id === accountId)
      const transactions = get().trustTransactions.filter(t => t.trustAccountId === accountId)
      
      // Group by client
      const clientBalances: Record<string, number> = {}
      transactions.forEach(t => {
        if (!clientBalances[t.clientId]) clientBalances[t.clientId] = 0
        if (t.type === 'deposit' || t.type === 'interest') {
          clientBalances[t.clientId] += t.amount
        } else {
          clientBalances[t.clientId] -= t.amount
        }
      })
      
      const totalClientBalances = Object.values(clientBalances).reduce((s, b) => s + b, 0)
      
      return {
        bankBalance: account?.balance || 0,
        bookBalance: totalClientBalances,
        clientLedgerTotal: totalClientBalances,
        isReconciled: account?.balance === totalClientBalances,
        clientBalances,
        discrepancy: (account?.balance || 0) - totalClientBalances
      }
    }
  })
)
