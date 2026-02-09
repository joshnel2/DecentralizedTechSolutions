-- ============================================
-- BILLING SYSTEM ENHANCEMENTS MIGRATION
-- Modeled after Clio Manage billing architecture
-- ============================================

-- 1. Billing Settings table (firm-level billing configuration)
CREATE TABLE IF NOT EXISTS billing_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,

    -- Payment terms
    default_payment_terms INTEGER DEFAULT 30,
    
    -- Late fees
    late_fee_enabled BOOLEAN DEFAULT false,
    late_fee_percent DECIMAL(5,2) DEFAULT 0,
    late_fee_grace_days INTEGER DEFAULT 5,
    late_fee_type VARCHAR(20) DEFAULT 'simple', -- simple, compound
    late_fee_cap DECIMAL(12,2), -- max late fee amount (null = no cap)
    
    -- Invoice numbering
    invoice_prefix VARCHAR(20) DEFAULT 'INV',
    next_invoice_number INTEGER DEFAULT 1001,
    
    -- Reminders
    auto_send_reminders BOOLEAN DEFAULT false,
    reminder_days INTEGER[] DEFAULT '{7,3,1,0}',
    
    -- Time entry defaults
    default_billing_increment INTEGER DEFAULT 6, -- minutes (Clio default: 6-minute increments)
    rounding_method VARCHAR(20) DEFAULT 'up', -- up, down, nearest, none
    minimum_entry_minutes INTEGER DEFAULT 6,
    default_hourly_rate DECIMAL(10,2) DEFAULT 350,
    require_matter_for_time BOOLEAN DEFAULT true,
    require_description_for_time BOOLEAN DEFAULT true,
    
    -- Approval workflow
    require_time_entry_approval BOOLEAN DEFAULT false,
    require_expense_approval BOOLEAN DEFAULT false,
    auto_approve_own_entries BOOLEAN DEFAULT false,
    
    -- Payment acceptance
    accept_credit_cards BOOLEAN DEFAULT true,
    accept_ach BOOLEAN DEFAULT true,
    surcharge_enabled BOOLEAN DEFAULT false,
    surcharge_percent DECIMAL(5,2) DEFAULT 0,
    
    -- UTBMS/LEDES
    utbms_enabled BOOLEAN DEFAULT false,
    ledes_format VARCHAR(20) DEFAULT '1998B',
    require_activity_code BOOLEAN DEFAULT false,
    require_task_code BOOLEAN DEFAULT false,
    
    -- Trust accounting
    require_trust_request_approval BOOLEAN DEFAULT true,
    minimum_trust_balance_alert DECIMAL(12,2) DEFAULT 500,
    auto_apply_trust_to_invoices BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(firm_id)
);

-- 2. Invoice Templates table
CREATE TABLE IF NOT EXISTS invoice_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    header_config JSONB DEFAULT '{"showLogo": true, "showFirmAddress": true}',
    line_items_config JSONB DEFAULT '{"showActivityCodes": false, "showTimekeeper": true, "groupByTask": false, "showHourlyRate": true}',
    footer_config JSONB DEFAULT '{"showPaymentInstructions": true, "showLatePolicy": false}',
    styling JSONB DEFAULT '{"primaryColor": "#1a1a2e", "fontFamily": "Georgia"}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Payment Processors table
CREATE TABLE IF NOT EXISTS payment_processors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- stripe, lawpay, paypal, ach_direct
    is_active BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,
    credentials JSONB DEFAULT '{}',
    fees JSONB DEFAULT '{}',
    supported_methods TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Payment Links table
CREATE TABLE IF NOT EXISTS payment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    url TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_payment_link_status CHECK (status IN ('active', 'paid', 'expired', 'cancelled'))
);

-- 5. Recurring Payments table
CREATE TABLE IF NOT EXISTS recurring_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    payment_method VARCHAR(50),
    next_payment_date DATE NOT NULL,
    last_payment_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_frequency CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'annually')),
    CONSTRAINT valid_recurring_status CHECK (status IN ('active', 'paused', 'cancelled'))
);

-- 6. Credit Notes / Write-offs table (Clio-style credits)
CREATE TABLE IF NOT EXISTS credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    number VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'credit', -- credit, write_off, courtesy_discount
    amount DECIMAL(12,2) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'draft', -- draft, approved, applied, void
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    applied_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_credit_type CHECK (type IN ('credit', 'write_off', 'courtesy_discount', 'error_correction')),
    CONSTRAINT valid_credit_status CHECK (status IN ('draft', 'approved', 'applied', 'void'))
);

-- 7. Time Entry Approvals table (Clio-style approval workflow)
CREATE TABLE IF NOT EXISTS time_entry_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES users(id),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewer_id UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, revision_requested
    reviewer_notes TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    original_hours DECIMAL(6,2),
    original_description TEXT,
    revised_hours DECIMAL(6,2),
    revised_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_approval_status CHECK (status IN ('pending', 'approved', 'rejected', 'revision_requested'))
);

-- 8. Billing Audit Log table (comprehensive audit trail for billing actions)
CREATE TABLE IF NOT EXISTS billing_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL, -- time_entry, invoice, payment, trust_transaction, credit_note, expense
    resource_id UUID NOT NULL,
    changes JSONB, -- before/after snapshot
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_firm ON billing_audit_log(firm_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_resource ON billing_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_user ON billing_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_created ON billing_audit_log(created_at DESC);

-- 9. Add approval workflow columns to time_entries
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS submitted_for_approval BOOLEAN DEFAULT false;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS task_code VARCHAR(20);

-- 10. Add approval workflow columns to expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS submitted_for_approval BOOLEAN DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor VARCHAR(255);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12,2) DEFAULT 0;

-- 11. Add finalization fields to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES users(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS credit_applied DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS trust_applied DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_type VARCHAR(30) DEFAULT 'hourly';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- 12. Add QuickBooks sync tracking to expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS quickbooks_id VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS quickbooks_sync_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS quickbooks_synced_at TIMESTAMP WITH TIME ZONE;

-- 13. Timer tracking table (for running timers like Clio)
CREATE TABLE IF NOT EXISTS active_timers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    description TEXT DEFAULT '',
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    paused_at TIMESTAMP WITH TIME ZONE,
    accumulated_seconds INTEGER DEFAULT 0, -- time accumulated before current start
    is_running BOOLEAN DEFAULT true,
    billable BOOLEAN DEFAULT true,
    activity_code VARCHAR(20),
    task_code VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Only one running timer per user
    CONSTRAINT one_running_timer_per_user UNIQUE (user_id, is_running) 
);

-- 14. Client trust ledger view (like Clio's client trust balance tracking)
CREATE TABLE IF NOT EXISTS client_trust_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    trust_account_id UUID NOT NULL REFERENCES trust_accounts(id) ON DELETE CASCADE,
    balance DECIMAL(14,2) DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, client_id, trust_account_id)
);

-- 15. Add matter billing configuration  
ALTER TABLE matters ADD COLUMN IF NOT EXISTS billing_type VARCHAR(30) DEFAULT 'hourly';
ALTER TABLE matters ADD COLUMN IF NOT EXISTS budget DECIMAL(12,2);
ALTER TABLE matters ADD COLUMN IF NOT EXISTS budget_alert_threshold INTEGER DEFAULT 80; -- percentage
ALTER TABLE matters ADD COLUMN IF NOT EXISTS flat_fee_amount DECIMAL(12,2);
ALTER TABLE matters ADD COLUMN IF NOT EXISTS contingency_percent DECIMAL(5,2);
ALTER TABLE matters ADD COLUMN IF NOT EXISTS billing_frequency VARCHAR(20) DEFAULT 'monthly';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_approval ON time_entries(firm_id, status) WHERE submitted_for_approval = true;
CREATE INDEX IF NOT EXISTS idx_time_entries_unbilled ON time_entries(firm_id, matter_id) WHERE billable = true AND billed = false;
CREATE INDEX IF NOT EXISTS idx_time_entries_date_user ON time_entries(firm_id, user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_unbilled ON expenses(firm_id, matter_id) WHERE billable = true AND billed = false;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(firm_id, client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_matter ON invoices(firm_id, matter_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(firm_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_credit_notes_client ON credit_notes(firm_id, client_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_active_timers_user ON active_timers(user_id) WHERE is_running = true;
CREATE INDEX IF NOT EXISTS idx_trust_balances_client ON client_trust_balances(firm_id, client_id);

-- Done
SELECT 'Billing enhancements migration completed!' as status;
