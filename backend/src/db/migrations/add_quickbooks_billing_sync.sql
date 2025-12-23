-- QuickBooks Billing Sync Tables
-- Migration: add_quickbooks_billing_sync.sql
-- This creates the tables needed for Clio-style QuickBooks billing sync

-- ============================================
-- QUICKBOOKS CLIENT MAPPING
-- Maps our clients to QuickBooks customers
-- ============================================
CREATE TABLE IF NOT EXISTS quickbooks_client_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    qb_customer_id VARCHAR(255) NOT NULL,
    qb_customer_name VARCHAR(500),
    qb_customer_email VARCHAR(255),
    sync_direction VARCHAR(20) DEFAULT 'both' CHECK (sync_direction IN ('to_qb', 'from_qb', 'both')),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, client_id),
    UNIQUE(firm_id, qb_customer_id)
);

-- ============================================
-- QUICKBOOKS INVOICE SYNC
-- Tracks which invoices are synced to QuickBooks
-- ============================================
CREATE TABLE IF NOT EXISTS quickbooks_invoice_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    qb_invoice_id VARCHAR(255) NOT NULL,
    qb_doc_number VARCHAR(100),
    qb_txn_date DATE,
    qb_due_date DATE,
    qb_total DECIMAL(12, 2),
    qb_balance DECIMAL(12, 2),
    qb_status VARCHAR(50),
    sync_status VARCHAR(20) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error', 'outdated')),
    sync_direction VARCHAR(20) DEFAULT 'to_qb' CHECK (sync_direction IN ('to_qb', 'from_qb')),
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sync_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, invoice_id),
    UNIQUE(firm_id, qb_invoice_id)
);

-- ============================================
-- QUICKBOOKS PAYMENT SYNC
-- Tracks payments synced from QuickBooks
-- ============================================
CREATE TABLE IF NOT EXISTS quickbooks_payment_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    qb_payment_id VARCHAR(255) NOT NULL,
    qb_invoice_id VARCHAR(255),
    qb_customer_id VARCHAR(255),
    amount DECIMAL(12, 2) NOT NULL,
    payment_date DATE,
    payment_method VARCHAR(100),
    reference_number VARCHAR(100),
    memo TEXT,
    synced_to_billing BOOLEAN DEFAULT FALSE,
    sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'error', 'skipped')),
    sync_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, qb_payment_id)
);

-- ============================================
-- QUICKBOOKS SYNC LOG
-- Audit trail of all sync operations
-- ============================================
CREATE TABLE IF NOT EXISTS quickbooks_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL, -- 'full', 'invoices', 'payments', 'customers', 'manual'
    direction VARCHAR(20) NOT NULL, -- 'push', 'pull', 'both'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'error')),
    items_synced INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    details JSONB,
    error_message TEXT,
    initiated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- QUICKBOOKS SYNC SETTINGS (per firm)
-- ============================================
CREATE TABLE IF NOT EXISTS quickbooks_sync_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL UNIQUE REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Auto sync settings
    auto_sync_enabled BOOLEAN DEFAULT FALSE,
    auto_sync_interval INTEGER DEFAULT 60, -- minutes
    last_auto_sync_at TIMESTAMP WITH TIME ZONE,
    
    -- Sync direction preferences
    sync_invoices_to_qb BOOLEAN DEFAULT TRUE,
    sync_invoices_from_qb BOOLEAN DEFAULT TRUE,
    sync_payments_from_qb BOOLEAN DEFAULT TRUE,
    sync_customers_to_qb BOOLEAN DEFAULT TRUE,
    sync_customers_from_qb BOOLEAN DEFAULT TRUE,
    
    -- Invoice settings
    auto_push_sent_invoices BOOLEAN DEFAULT TRUE, -- Push invoices when marked as sent
    auto_sync_paid_status BOOLEAN DEFAULT TRUE,   -- Sync payment status automatically
    
    -- Customer/Client settings
    auto_create_customers BOOLEAN DEFAULT TRUE,   -- Create QB customers for unmapped clients
    auto_create_clients BOOLEAN DEFAULT FALSE,    -- Create clients for unmapped QB customers
    
    -- Expense/Bill sync settings
    sync_expenses_to_qb BOOLEAN DEFAULT TRUE,     -- Push expenses to QuickBooks as Bills
    sync_bills_from_qb BOOLEAN DEFAULT TRUE,      -- Pull Bills from QuickBooks as expenses
    auto_push_approved_expenses BOOLEAN DEFAULT TRUE, -- Push expenses when approved
    auto_create_vendors BOOLEAN DEFAULT TRUE,     -- Create QB vendors for new expense vendors
    default_expense_sync_type VARCHAR(20) DEFAULT 'bill' CHECK (default_expense_sync_type IN ('bill', 'expense')),
    
    -- Conflict resolution
    conflict_resolution VARCHAR(20) DEFAULT 'apex_wins' CHECK (conflict_resolution IN ('apex_wins', 'qb_wins', 'newest_wins', 'manual')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- QUICKBOOKS VENDOR MAPPING
-- Maps our vendors to QuickBooks vendors
-- ============================================
CREATE TABLE IF NOT EXISTS quickbooks_vendor_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    vendor_name VARCHAR(500) NOT NULL,
    vendor_email VARCHAR(255),
    qb_vendor_id VARCHAR(255) NOT NULL,
    qb_vendor_name VARCHAR(500),
    qb_vendor_email VARCHAR(255),
    sync_direction VARCHAR(20) DEFAULT 'both' CHECK (sync_direction IN ('to_qb', 'from_qb', 'both')),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, vendor_name),
    UNIQUE(firm_id, qb_vendor_id)
);

-- ============================================
-- QUICKBOOKS EXPENSE/BILL SYNC
-- Tracks which expenses are synced to/from QuickBooks as Bills
-- ============================================
CREATE TABLE IF NOT EXISTS quickbooks_expense_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    qb_bill_id VARCHAR(255),           -- QuickBooks Bill ID (if synced as Bill)
    qb_expense_id VARCHAR(255),        -- QuickBooks Purchase/Expense ID (if synced as Expense)
    qb_vendor_id VARCHAR(255),
    qb_doc_number VARCHAR(100),
    qb_txn_date DATE,
    qb_due_date DATE,
    qb_total DECIMAL(12, 2),
    qb_balance DECIMAL(12, 2),
    sync_type VARCHAR(20) DEFAULT 'bill' CHECK (sync_type IN ('bill', 'expense', 'purchase')),
    sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'error', 'skipped')),
    sync_direction VARCHAR(20) DEFAULT 'to_qb' CHECK (sync_direction IN ('to_qb', 'from_qb')),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    sync_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, expense_id)
);

-- ============================================
-- QUICKBOOKS BILLS IMPORTED
-- Bills imported from QuickBooks that may need to be created as expenses
-- ============================================
CREATE TABLE IF NOT EXISTS quickbooks_bills_imported (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    qb_bill_id VARCHAR(255) NOT NULL,
    qb_vendor_id VARCHAR(255),
    qb_vendor_name VARCHAR(500),
    doc_number VARCHAR(100),
    txn_date DATE,
    due_date DATE,
    total_amount DECIMAL(12, 2) NOT NULL,
    balance DECIMAL(12, 2),
    memo TEXT,
    line_items JSONB,
    is_paid BOOLEAN DEFAULT FALSE,
    imported_to_expenses BOOLEAN DEFAULT FALSE,
    sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('imported', 'pending', 'applied', 'skipped', 'error')),
    sync_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, qb_bill_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_qb_client_mappings_firm ON quickbooks_client_mappings(firm_id);
CREATE INDEX IF NOT EXISTS idx_qb_client_mappings_client ON quickbooks_client_mappings(client_id);
CREATE INDEX IF NOT EXISTS idx_qb_client_mappings_qb_id ON quickbooks_client_mappings(qb_customer_id);

CREATE INDEX IF NOT EXISTS idx_qb_invoice_sync_firm ON quickbooks_invoice_sync(firm_id);
CREATE INDEX IF NOT EXISTS idx_qb_invoice_sync_invoice ON quickbooks_invoice_sync(invoice_id);
CREATE INDEX IF NOT EXISTS idx_qb_invoice_sync_qb_id ON quickbooks_invoice_sync(qb_invoice_id);
CREATE INDEX IF NOT EXISTS idx_qb_invoice_sync_status ON quickbooks_invoice_sync(sync_status);

CREATE INDEX IF NOT EXISTS idx_qb_payment_sync_firm ON quickbooks_payment_sync(firm_id);
CREATE INDEX IF NOT EXISTS idx_qb_payment_sync_invoice ON quickbooks_payment_sync(invoice_id);
CREATE INDEX IF NOT EXISTS idx_qb_payment_sync_qb_id ON quickbooks_payment_sync(qb_payment_id);

CREATE INDEX IF NOT EXISTS idx_qb_sync_log_firm ON quickbooks_sync_log(firm_id);
CREATE INDEX IF NOT EXISTS idx_qb_sync_log_started ON quickbooks_sync_log(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_qb_vendor_mappings_firm ON quickbooks_vendor_mappings(firm_id);
CREATE INDEX IF NOT EXISTS idx_qb_vendor_mappings_qb_id ON quickbooks_vendor_mappings(qb_vendor_id);

CREATE INDEX IF NOT EXISTS idx_qb_expense_sync_firm ON quickbooks_expense_sync(firm_id);
CREATE INDEX IF NOT EXISTS idx_qb_expense_sync_expense ON quickbooks_expense_sync(expense_id);
CREATE INDEX IF NOT EXISTS idx_qb_expense_sync_status ON quickbooks_expense_sync(sync_status);

CREATE INDEX IF NOT EXISTS idx_qb_bills_imported_firm ON quickbooks_bills_imported(firm_id);
CREATE INDEX IF NOT EXISTS idx_qb_bills_imported_qb_id ON quickbooks_bills_imported(qb_bill_id);
CREATE INDEX IF NOT EXISTS idx_qb_bills_imported_status ON quickbooks_bills_imported(sync_status);
