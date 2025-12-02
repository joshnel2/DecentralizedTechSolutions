-- Apex Legal Practice Management Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES
-- ============================================

-- Firms (Multi-tenant support)
CREATE TABLE firms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    phone VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(255),
    logo_url TEXT,
    billing_defaults JSONB DEFAULT '{
        "hourlyRate": 350,
        "incrementMinutes": 6,
        "paymentTerms": 30,
        "currency": "USD"
    }',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'staff',
    phone VARCHAR(50),
    avatar_url TEXT,
    hourly_rate DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(255),
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'attorney', 'paralegal', 'staff', 'billing', 'readonly'))
);

-- User Sessions (for refresh tokens)
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_info TEXT,
    ip_address VARCHAR(45),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Groups (Practice groups, teams)
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#3B82F6',
    permissions TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Group Memberships
CREATE TABLE user_groups (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, group_id)
);

-- ============================================
-- CLIENT & MATTER TABLES
-- ============================================

-- Clients
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL DEFAULT 'person',
    display_name VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address_street TEXT,
    address_city VARCHAR(100),
    address_state VARCHAR(50),
    address_zip VARCHAR(20),
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    contact_type VARCHAR(50) DEFAULT 'client',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_type CHECK (type IN ('person', 'company'))
);

-- Matters
CREATE TABLE matters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    number VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    priority VARCHAR(20) DEFAULT 'medium',
    responsible_attorney UUID REFERENCES users(id),
    originating_attorney UUID REFERENCES users(id),
    open_date DATE,
    close_date DATE,
    statute_of_limitations DATE,
    court_name VARCHAR(255),
    case_number VARCHAR(100),
    judge VARCHAR(100),
    jurisdiction VARCHAR(100),
    billing_type VARCHAR(50) DEFAULT 'hourly',
    billing_rate DECIMAL(10,2),
    flat_fee DECIMAL(12,2),
    contingency_percent DECIMAL(5,2),
    retainer_amount DECIMAL(12,2),
    budget DECIMAL(12,2),
    tags TEXT[] DEFAULT '{}',
    ai_summary TEXT,
    conflict_cleared BOOLEAN DEFAULT false,
    custom_fields JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('active', 'pending', 'closed', 'on_hold', 'archived')),
    CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    CONSTRAINT valid_billing_type CHECK (billing_type IN ('hourly', 'flat', 'contingency', 'retainer', 'pro_bono'))
);

-- Matter Assigned Users
CREATE TABLE matter_assignments (
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'team_member',
    billing_rate DECIMAL(10,2),  -- Attorney's rate for this specific matter
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (matter_id, user_id)
);

-- ============================================
-- TIME & BILLING TABLES
-- ============================================

-- Time Entries
CREATE TABLE time_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    hours DECIMAL(6,2) NOT NULL,
    description TEXT NOT NULL,
    billable BOOLEAN DEFAULT true,
    billed BOOLEAN DEFAULT false,
    rate DECIMAL(10,2) NOT NULL,
    amount DECIMAL(12,2) GENERATED ALWAYS AS (hours * rate) STORED,
    activity_code VARCHAR(20),
    status VARCHAR(20) DEFAULT 'pending',
    entry_type VARCHAR(20) DEFAULT 'manual',
    ai_generated BOOLEAN DEFAULT false,
    invoice_id UUID,
    timer_start TIMESTAMP WITH TIME ZONE,
    timer_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'billed')),
    CONSTRAINT valid_entry_type CHECK (entry_type IN ('manual', 'timer', 'ai_suggested'))
);

-- Expenses
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    category VARCHAR(100),
    expense_type VARCHAR(50) DEFAULT 'other',
    billable BOOLEAN DEFAULT true,
    billed BOOLEAN DEFAULT false,
    has_receipt BOOLEAN DEFAULT false,
    receipt_url TEXT,
    reimbursable BOOLEAN DEFAULT false,
    reimbursed BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'pending',
    invoice_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'billed'))
);

-- Invoices
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'draft',
    issue_date DATE,
    due_date DATE,
    subtotal_fees DECIMAL(12,2) DEFAULT 0,
    subtotal_expenses DECIMAL(12,2) DEFAULT 0,
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    amount_paid DECIMAL(12,2) DEFAULT 0,
    amount_due DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    payment_instructions TEXT,
    line_items JSONB DEFAULT '[]',
    sent_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'void'))
);

-- Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(50),
    reference VARCHAR(100),
    payment_date DATE NOT NULL,
    notes TEXT,
    processor_id VARCHAR(100),
    processor_response JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trust Accounts
CREATE TABLE trust_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    bank_name VARCHAR(255) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_number_last4 VARCHAR(4),
    routing_number_last4 VARCHAR(4),
    account_type VARCHAR(20) DEFAULT 'iolta',
    balance DECIMAL(14,2) DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    last_reconciled TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_account_type CHECK (account_type IN ('iolta', 'operating'))
);

-- Trust Transactions
CREATE TABLE trust_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trust_account_id UUID REFERENCES trust_accounts(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description TEXT NOT NULL,
    reference VARCHAR(100),
    payment_method VARCHAR(50),
    check_number VARCHAR(50),
    cleared_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_type CHECK (type IN ('deposit', 'withdrawal', 'transfer', 'interest', 'fee'))
);

-- ============================================
-- CALENDAR & DOCUMENTS
-- ============================================

-- Calendar Events
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'meeting',
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    all_day BOOLEAN DEFAULT false,
    location TEXT,
    attendees JSONB DEFAULT '[]',
    reminders JSONB DEFAULT '[]',
    color VARCHAR(20) DEFAULT '#3B82F6',
    is_private BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'confirmed',
    recurrence_rule TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_type CHECK (type IN ('meeting', 'court_date', 'deadline', 'reminder', 'task', 'closing', 'deposition', 'other')),
    CONSTRAINT valid_status CHECK (status IN ('confirmed', 'tentative', 'cancelled'))
);

-- Documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    type VARCHAR(100),
    size BIGINT,
    path TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    is_latest_version BOOLEAN DEFAULT true,
    parent_document_id UUID REFERENCES documents(id),
    status VARCHAR(20) DEFAULT 'draft',
    is_confidential BOOLEAN DEFAULT false,
    ai_summary TEXT,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'review', 'final', 'archived'))
);

-- ============================================
-- SYSTEM TABLES
-- ============================================

-- API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    permissions TEXT[] DEFAULT '{}',
    last_used TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    action_url TEXT,
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invitations
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'staff',
    token_hash VARCHAR(255) NOT NULL,
    invited_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_users_firm_id ON users(firm_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_clients_firm_id ON clients(firm_id);
CREATE INDEX idx_clients_display_name ON clients(display_name);
CREATE INDEX idx_matters_firm_id ON matters(firm_id);
CREATE INDEX idx_matters_client_id ON matters(client_id);
CREATE INDEX idx_matters_status ON matters(status);
CREATE INDEX idx_matters_responsible_attorney ON matters(responsible_attorney);
CREATE INDEX idx_matters_originating_attorney ON matters(originating_attorney);
CREATE INDEX idx_time_entries_matter_id ON time_entries(matter_id);
CREATE INDEX idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX idx_time_entries_date ON time_entries(date);
CREATE INDEX idx_invoices_firm_id ON invoices(firm_id);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_calendar_events_firm_id ON calendar_events(firm_id);
CREATE INDEX idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX idx_documents_firm_id ON documents(firm_id);
CREATE INDEX idx_documents_matter_id ON documents(matter_id);
CREATE INDEX idx_audit_logs_firm_id ON audit_logs(firm_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_firms_updated_at BEFORE UPDATE ON firms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_matters_updated_at BEFORE UPDATE ON matters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trust_accounts_updated_at BEFORE UPDATE ON trust_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Invoice amount calculation trigger
CREATE OR REPLACE FUNCTION calculate_invoice_amounts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.subtotal = COALESCE(NEW.subtotal_fees, 0) + COALESCE(NEW.subtotal_expenses, 0);
    NEW.tax_amount = NEW.subtotal * COALESCE(NEW.tax_rate, 0) / 100;
    NEW.total = NEW.subtotal + NEW.tax_amount - COALESCE(NEW.discount_amount, 0);
    NEW.amount_due = NEW.total - COALESCE(NEW.amount_paid, 0);
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER calculate_invoice_amounts_trigger 
BEFORE INSERT OR UPDATE ON invoices 
FOR EACH ROW EXECUTE FUNCTION calculate_invoice_amounts();
