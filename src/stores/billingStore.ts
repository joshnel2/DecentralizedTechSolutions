import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
    acceptCreditCards: boolean
    acceptACH: boolean
    surchargeEnabled: boolean
    surchargePercent: number
  }
  
  // Trust Account Actions
  addTrustAccount: (account: Omit<TrustAccount, 'id' | 'createdAt'>) => TrustAccount
  updateTrustAccount: (id: string, data: Partial<TrustAccount>) => void
  deleteTrustAccount: (id: string) => void
  reconcileTrustAccount: (id: string) => void
  
  // Trust Transaction Actions
  addTrustTransaction: (transaction: Omit<TrustTransaction, 'id' | 'createdAt'>) => TrustTransaction
  clearTransaction: (id: string) => void
  getClientLedger: (clientId: string) => ClientLedger
  
  // Payment Processor Actions
  addPaymentProcessor: (processor: Omit<PaymentProcessor, 'id' | 'createdAt'>) => PaymentProcessor
  updatePaymentProcessor: (id: string, data: Partial<PaymentProcessor>) => void
  setDefaultProcessor: (id: string) => void
  disconnectProcessor: (id: string) => void
  
  // Payment Link Actions
  createPaymentLink: (invoiceId: string, clientId: string, amount: number) => PaymentLink
  expirePaymentLink: (id: string) => void
  markPaymentLinkPaid: (id: string) => void
  
  // Recurring Payment Actions
  addRecurringPayment: (payment: Omit<RecurringPayment, 'id' | 'createdAt'>) => RecurringPayment
  updateRecurringPayment: (id: string, data: Partial<RecurringPayment>) => void
  cancelRecurringPayment: (id: string) => void
  
  // Template Actions
  addInvoiceTemplate: (template: Omit<InvoiceTemplate, 'id' | 'createdAt'>) => InvoiceTemplate
  updateInvoiceTemplate: (id: string, data: Partial<InvoiceTemplate>) => void
  deleteInvoiceTemplate: (id: string) => void
  setDefaultTemplate: (id: string) => void
  
  // Settings Actions
  updateBillingSettings: (settings: Partial<BillingStoreState['billingSettings']>) => void
  
  // Reports
  getTrustAccountReport: (accountId: string, startDate: string, endDate: string) => any
  getThreeWayReconciliation: (accountId: string) => any
}

const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Demo data
const demoTrustAccounts: TrustAccount[] = [
  {
    id: 'trust-1',
    firmId: 'firm-1',
    bankName: 'First National Bank',
    accountName: 'Apex Legal IOLTA',
    accountNumber: '****4521',
    routingNumber: '****0892',
    accountType: 'iolta',
    balance: 125750.00,
    isVerified: true,
    lastReconciled: '2024-11-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'operating-1',
    firmId: 'firm-1',
    bankName: 'First National Bank',
    accountName: 'Apex Legal Operating',
    accountNumber: '****7834',
    routingNumber: '****0892',
    accountType: 'operating',
    balance: 89420.50,
    isVerified: true,
    lastReconciled: '2024-11-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z'
  }
]

const demoTrustTransactions: TrustTransaction[] = [
  {
    id: 'tt-1',
    trustAccountId: 'trust-1',
    clientId: 'client-1',
    matterId: 'matter-1',
    type: 'deposit',
    amount: 50000,
    description: 'Retainer deposit - Quantum v. TechStart',
    paymentMethod: 'wire',
    reference: 'WIRE-20241115-001',
    clearedAt: '2024-11-15T00:00:00Z',
    createdBy: 'user-1',
    createdAt: '2024-11-15T00:00:00Z'
  },
  {
    id: 'tt-2',
    trustAccountId: 'trust-1',
    clientId: 'client-1',
    matterId: 'matter-1',
    type: 'withdrawal',
    amount: 24750,
    description: 'Transfer to operating - Invoice INV-2024-0042',
    reference: 'INV-2024-0042',
    createdBy: 'user-1',
    createdAt: '2024-11-20T00:00:00Z'
  },
  {
    id: 'tt-3',
    trustAccountId: 'trust-1',
    clientId: 'client-3',
    matterId: 'matter-3',
    type: 'deposit',
    amount: 25000,
    description: 'Retainer deposit - Meridian Development',
    paymentMethod: 'check',
    checkNumber: '4521',
    clearedAt: '2024-11-10T00:00:00Z',
    createdBy: 'user-1',
    createdAt: '2024-11-08T00:00:00Z'
  }
]

const demoPaymentProcessors: PaymentProcessor[] = [
  {
    id: 'proc-1',
    name: 'LawPay',
    type: 'lawpay',
    isActive: true,
    isDefault: true,
    credentials: {
      merchantId: 'LP_****7892',
      isConnected: true
    },
    fees: {
      creditCardPercent: 2.95,
      creditCardFixed: 0.30,
      achPercent: 0.5,
      achFixed: 0
    },
    supportedMethods: ['credit_card', 'ach', 'echeck'],
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'proc-2',
    name: 'Stripe',
    type: 'stripe',
    isActive: false,
    isDefault: false,
    credentials: {
      publicKey: 'pk_live_****',
      isConnected: false
    },
    fees: {
      creditCardPercent: 2.9,
      creditCardFixed: 0.30,
      achPercent: 0.8,
      achFixed: 5
    },
    supportedMethods: ['credit_card', 'ach'],
    createdAt: '2024-01-01T00:00:00Z'
  }
]

const demoInvoiceTemplates: InvoiceTemplate[] = [
  {
    id: 'template-1',
    name: 'Standard Invoice',
    isDefault: true,
    header: {
      showLogo: true,
      showFirmAddress: true,
      customMessage: 'Thank you for your business'
    },
    lineItems: {
      showActivityCodes: true,
      showTimekeeper: true,
      groupByTask: false,
      showHourlyRate: true
    },
    footer: {
      showPaymentInstructions: true,
      paymentInstructions: 'Payment is due within 30 days. Please include invoice number with your payment.',
      showLatePolicy: true,
      lateFeePolicy: 'A late fee of 1.5% per month will be applied to overdue balances.',
      customNotes: ''
    },
    styling: {
      primaryColor: '#F59E0B',
      fontFamily: 'Inter'
    },
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'template-2',
    name: 'Detailed Litigation',
    isDefault: false,
    header: {
      showLogo: true,
      showFirmAddress: true
    },
    lineItems: {
      showActivityCodes: true,
      showTimekeeper: true,
      groupByTask: true,
      showHourlyRate: true
    },
    footer: {
      showPaymentInstructions: true,
      showLatePolicy: true
    },
    styling: {
      primaryColor: '#F59E0B',
      fontFamily: 'Inter'
    },
    createdAt: '2024-01-01T00:00:00Z'
  }
]

export const useBillingStore = create<BillingStoreState>()(
  persist(
    (set, get) => ({
      trustAccounts: demoTrustAccounts,
      trustTransactions: demoTrustTransactions,
      clientLedgers: {},
      paymentProcessors: demoPaymentProcessors,
      paymentLinks: [],
      recurringPayments: [],
      invoiceTemplates: demoInvoiceTemplates,
      billingSettings: {
        defaultPaymentTerms: 30,
        lateFeeEnabled: true,
        lateFeePercent: 1.5,
        lateFeeGraceDays: 5,
        autoSendReminders: true,
        reminderDays: [7, 3, 1, 0],
        acceptCreditCards: true,
        acceptACH: true,
        surchargeEnabled: false,
        surchargePercent: 3
      },

      // Trust Account Actions
      addTrustAccount: (data) => {
        const account: TrustAccount = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString()
        }
        set(state => ({ trustAccounts: [...state.trustAccounts, account] }))
        return account
      },

      updateTrustAccount: (id, data) => {
        set(state => ({
          trustAccounts: state.trustAccounts.map(a => 
            a.id === id ? { ...a, ...data } : a
          )
        }))
      },

      deleteTrustAccount: (id) => {
        set(state => ({ trustAccounts: state.trustAccounts.filter(a => a.id !== id) }))
      },

      reconcileTrustAccount: (id) => {
        set(state => ({
          trustAccounts: state.trustAccounts.map(a =>
            a.id === id ? { ...a, lastReconciled: new Date().toISOString() } : a
          )
        }))
      },

      // Trust Transaction Actions
      addTrustTransaction: (data) => {
        const transaction: TrustTransaction = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString()
        }
        
        // Update account balance
        const account = get().trustAccounts.find(a => a.id === data.trustAccountId)
        if (account) {
          const balanceChange = data.type === 'deposit' || data.type === 'interest' 
            ? data.amount 
            : -data.amount
          get().updateTrustAccount(account.id, { 
            balance: account.balance + balanceChange 
          })
        }
        
        set(state => ({ 
          trustTransactions: [...state.trustTransactions, transaction] 
        }))
        return transaction
      },

      clearTransaction: (id) => {
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
      addPaymentProcessor: (data) => {
        const processor: PaymentProcessor = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString()
        }
        set(state => ({ paymentProcessors: [...state.paymentProcessors, processor] }))
        return processor
      },

      updatePaymentProcessor: (id, data) => {
        set(state => ({
          paymentProcessors: state.paymentProcessors.map(p =>
            p.id === id ? { ...p, ...data } : p
          )
        }))
      },

      setDefaultProcessor: (id) => {
        set(state => ({
          paymentProcessors: state.paymentProcessors.map(p => ({
            ...p,
            isDefault: p.id === id
          }))
        }))
      },

      disconnectProcessor: (id) => {
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
      createPaymentLink: (invoiceId, clientId, amount) => {
        const link: PaymentLink = {
          id: generateId(),
          invoiceId,
          clientId,
          amount,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          url: `https://pay.apexlegal.com/${generateId()}`,
          status: 'active',
          createdAt: new Date().toISOString()
        }
        set(state => ({ paymentLinks: [...state.paymentLinks, link] }))
        return link
      },

      expirePaymentLink: (id) => {
        set(state => ({
          paymentLinks: state.paymentLinks.map(l =>
            l.id === id ? { ...l, status: 'expired' as const } : l
          )
        }))
      },

      markPaymentLinkPaid: (id) => {
        set(state => ({
          paymentLinks: state.paymentLinks.map(l =>
            l.id === id ? { ...l, status: 'paid' as const } : l
          )
        }))
      },

      // Recurring Payment Actions
      addRecurringPayment: (data) => {
        const payment: RecurringPayment = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString()
        }
        set(state => ({ recurringPayments: [...state.recurringPayments, payment] }))
        return payment
      },

      updateRecurringPayment: (id, data) => {
        set(state => ({
          recurringPayments: state.recurringPayments.map(p =>
            p.id === id ? { ...p, ...data } : p
          )
        }))
      },

      cancelRecurringPayment: (id) => {
        set(state => ({
          recurringPayments: state.recurringPayments.map(p =>
            p.id === id ? { ...p, status: 'cancelled' as const } : p
          )
        }))
      },

      // Template Actions
      addInvoiceTemplate: (data) => {
        const template: InvoiceTemplate = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString()
        }
        set(state => ({ invoiceTemplates: [...state.invoiceTemplates, template] }))
        return template
      },

      updateInvoiceTemplate: (id, data) => {
        set(state => ({
          invoiceTemplates: state.invoiceTemplates.map(t =>
            t.id === id ? { ...t, ...data } : t
          )
        }))
      },

      deleteInvoiceTemplate: (id) => {
        set(state => ({ 
          invoiceTemplates: state.invoiceTemplates.filter(t => t.id !== id) 
        }))
      },

      setDefaultTemplate: (id) => {
        set(state => ({
          invoiceTemplates: state.invoiceTemplates.map(t => ({
            ...t,
            isDefault: t.id === id
          }))
        }))
      },

      // Settings Actions
      updateBillingSettings: (settings) => {
        set(state => ({
          billingSettings: { ...state.billingSettings, ...settings }
        }))
      },

      // Reports
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
    }),
    {
      name: 'apex-billing'
    }
  )
)
