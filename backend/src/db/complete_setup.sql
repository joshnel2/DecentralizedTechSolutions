-- ============================================
-- APEX LEGAL PRACTICE MANAGEMENT - COMPLETE DATABASE SETUP
-- PostgreSQL 14+ (uses gen_random_uuid(), no uuid-ossp extension needed)
-- Run with: psql -d your_database -f complete_setup.sql
-- All statements use IF NOT EXISTS / IF EXISTS for idempotent execution
-- ============================================

-- ============================================
-- CORE TABLES
-- ============================================

-- Firms (Multi-tenant support)
CREATE TABLE IF NOT EXISTS firms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    azure_folder VARCHAR(255),
    drive_settings JSONB DEFAULT '{}',
    sharing_settings JSONB DEFAULT '{
        "allowSharingGroups": true,
        "allowUserToUserSharing": true,
        "allowExternalSharing": false,
        "requireApprovalForExternalShare": true,
        "defaultDocumentPrivacy": "team",
        "defaultMatterVisibility": "restricted",
        "maxSharingGroupSize": 50,
        "allowTimeEntrySharing": false,
        "enforceMatterPermissions": true
    }',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    last_login_at TIMESTAMPTZ,
    email_signature TEXT,
    settings JSONB DEFAULT '{}',
    notification_preferences JSONB DEFAULT '{}',
    ai_custom_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add role constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_role') THEN
        ALTER TABLE users ADD CONSTRAINT valid_role 
            CHECK (role IN ('owner', 'admin', 'attorney', 'paralegal', 'staff', 'billing', 'readonly'));
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_info TEXT,
    ip_address VARCHAR(45),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Groups
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#3B82F6',
    permissions TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Group Memberships
CREATE TABLE IF NOT EXISTS user_groups (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, group_id)
);

-- ============================================
-- CLIENT & MATTER TABLES
-- ============================================

-- Clients
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    external_id VARCHAR(255),
    external_source VARCHAR(50),
    quickbooks_id VARCHAR(100),
    quickbooks_synced_at TIMESTAMPTZ,
    visibility VARCHAR(20) DEFAULT 'firm_wide',
    assigned_attorney UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add type constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_type' AND conrelid = 'clients'::regclass) THEN
        ALTER TABLE clients ADD CONSTRAINT valid_type CHECK (type IN ('person', 'company'));
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Matters
CREATE TABLE IF NOT EXISTS matters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    closed_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    resolution VARCHAR(100),
    closing_notes TEXT,
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
    visibility VARCHAR(20) DEFAULT 'firm_wide',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add matter constraints if not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_status' AND conrelid = 'matters'::regclass) THEN
        ALTER TABLE matters ADD CONSTRAINT valid_status CHECK (status IN ('active', 'pending', 'closed', 'on_hold', 'archived'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_priority' AND conrelid = 'matters'::regclass) THEN
        ALTER TABLE matters ADD CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_billing_type' AND conrelid = 'matters'::regclass) THEN
        ALTER TABLE matters ADD CONSTRAINT valid_billing_type CHECK (billing_type IN ('hourly', 'flat', 'contingency', 'retainer', 'pro_bono'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_visibility' AND conrelid = 'matters'::regclass) THEN
        ALTER TABLE matters ADD CONSTRAINT valid_visibility CHECK (visibility IN ('firm_wide', 'restricted'));
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Matter Assignments
CREATE TABLE IF NOT EXISTS matter_assignments (
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'team_member',
    billing_rate DECIMAL(10,2),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (matter_id, user_id)
);

-- Matter Permissions
CREATE TABLE IF NOT EXISTS matter_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    permission_level VARCHAR(20) DEFAULT 'view',
    can_view_documents BOOLEAN DEFAULT true,
    can_view_notes BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add matter_permissions constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_or_group' AND conrelid = 'matter_permissions'::regclass) THEN
        ALTER TABLE matter_permissions ADD CONSTRAINT user_or_group CHECK (
            (user_id IS NOT NULL AND group_id IS NULL) OR
            (user_id IS NULL AND group_id IS NOT NULL)
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_permission_level' AND conrelid = 'matter_permissions'::regclass) THEN
        ALTER TABLE matter_permissions ADD CONSTRAINT valid_permission_level CHECK (permission_level IN ('view', 'edit', 'admin'));
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Matter Contacts (opposing parties, witnesses, etc.)
CREATE TABLE IF NOT EXISTS matter_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100),
    firm VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matter Notes
CREATE TABLE IF NOT EXISTS matter_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    note_type VARCHAR(50) DEFAULT 'general',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matter Tasks
CREATE TABLE IF NOT EXISTS matter_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    due_date DATE,
    assignee UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matter Updates
CREATE TABLE IF NOT EXISTS matter_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TIME & BILLING TABLES
-- ============================================

-- Time Entries
CREATE TABLE IF NOT EXISTS time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    timer_start TIMESTAMPTZ,
    timer_end TIMESTAMPTZ,
    clio_id BIGINT,
    clio_created_at TIMESTAMPTZ,
    clio_updated_at TIMESTAMPTZ,
    migrated_at TIMESTAMPTZ,
    migration_source VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    clio_id BIGINT,
    clio_created_at TIMESTAMPTZ,
    clio_updated_at TIMESTAMPTZ,
    migrated_at TIMESTAMPTZ,
    migration_source VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    sent_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    external_id VARCHAR(255),
    external_source VARCHAR(50),
    quickbooks_id VARCHAR(100),
    quickbooks_sync_status VARCHAR(20) DEFAULT 'pending',
    quickbooks_synced_at TIMESTAMPTZ,
    quickbooks_sync_error TEXT,
    quickbooks_customer_id VARCHAR(100),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    quickbooks_id VARCHAR(100),
    quickbooks_sync_status VARCHAR(20) DEFAULT 'pending',
    quickbooks_synced_at TIMESTAMPTZ,
    quickbooks_sync_error TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trust Accounts
CREATE TABLE IF NOT EXISTS trust_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    bank_name VARCHAR(255) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_number_last4 VARCHAR(4),
    routing_number_last4 VARCHAR(4),
    account_type VARCHAR(20) DEFAULT 'iolta',
    balance DECIMAL(14,2) DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    last_reconciled TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trust Transactions
CREATE TABLE IF NOT EXISTS trust_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trust_account_id UUID REFERENCES trust_accounts(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description TEXT NOT NULL,
    reference VARCHAR(100),
    payment_method VARCHAR(50),
    check_number VARCHAR(50),
    cleared_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stripe Connections
CREATE TABLE IF NOT EXISTS stripe_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    stripe_account_id VARCHAR(255) NOT NULL,
    stripe_account_type VARCHAR(50) DEFAULT 'standard',
    business_name VARCHAR(255),
    email VARCHAR(255),
    country VARCHAR(10) DEFAULT 'US',
    is_connected BOOLEAN DEFAULT true,
    charges_enabled BOOLEAN DEFAULT false,
    payouts_enabled BOOLEAN DEFAULT false,
    details_submitted BOOLEAN DEFAULT false,
    default_to_trust BOOLEAN DEFAULT false,
    trust_account_label VARCHAR(255) DEFAULT 'Client Trust Account (IOLTA)',
    operating_account_label VARCHAR(255) DEFAULT 'Operating Account',
    accept_cards BOOLEAN DEFAULT true,
    accept_ach BOOLEAN DEFAULT true,
    accept_apple_pay BOOLEAN DEFAULT false,
    accept_google_pay BOOLEAN DEFAULT false,
    compliance_accepted_at TIMESTAMPTZ,
    compliance_accepted_by UUID REFERENCES users(id),
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_id)
);

-- Stripe Transactions
CREATE TABLE IF NOT EXISTS stripe_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    stripe_connection_id UUID REFERENCES stripe_connections(id) ON DELETE SET NULL,
    stripe_payment_intent_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    stripe_transfer_id VARCHAR(255),
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL,
    fee_cents INTEGER DEFAULT 0,
    net_amount_cents INTEGER,
    currency VARCHAR(10) DEFAULT 'usd',
    payment_method VARCHAR(50),
    card_brand VARCHAR(50),
    card_last4 VARCHAR(4),
    account_type VARCHAR(20) DEFAULT 'operating',
    status VARCHAR(50) DEFAULT 'pending',
    failure_reason TEXT,
    description TEXT,
    receipt_email VARCHAR(255),
    receipt_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CALENDAR & DOCUMENTS
-- ============================================

-- Calendar Events
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'meeting',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN DEFAULT false,
    location TEXT,
    attendees JSONB DEFAULT '[]',
    reminders JSONB DEFAULT '[]',
    color VARCHAR(20) DEFAULT '#3B82F6',
    is_private BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'confirmed',
    recurrence_rule TEXT,
    priority VARCHAR(20) DEFAULT 'medium',
    assigned_to UUID REFERENCES users(id),
    external_id VARCHAR(255),
    external_source VARCHAR(50),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    type VARCHAR(100),
    size BIGINT,
    path TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    version_count INTEGER DEFAULT 1,
    is_latest_version BOOLEAN DEFAULT true,
    parent_document_id UUID REFERENCES documents(id),
    status VARCHAR(20) DEFAULT 'draft',
    is_confidential BOOLEAN DEFAULT false,
    is_private BOOLEAN DEFAULT false,
    privacy_level VARCHAR(20) DEFAULT 'private',
    ai_summary TEXT,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    -- Sync and storage
    storage_location VARCHAR(50) DEFAULT 'local',
    external_id VARCHAR(500),
    external_source VARCHAR(50),
    external_url TEXT,
    external_path TEXT,
    external_type VARCHAR(50),
    external_modified_at TIMESTAMPTZ,
    azure_path TEXT,
    sync_status VARCHAR(20) DEFAULT 'pending',
    last_synced_at TIMESTAMPTZ,
    checksum VARCHAR(64),
    content_hash VARCHAR(64),
    content_text TEXT,
    content_extracted_at TIMESTAMPTZ,
    -- Drive integration
    drive_id UUID,
    folder_path TEXT DEFAULT '/',
    is_folder BOOLEAN DEFAULT false,
    -- Lock info
    current_editor_id UUID REFERENCES users(id),
    current_editor_name VARCHAR(255),
    lock_expires_at TIMESTAMPTZ,
    -- Word Online
    word_online_url TEXT,
    graph_item_id VARCHAR(255),
    last_online_edit TIMESTAMPTZ,
    active_editors JSONB DEFAULT '[]',
    -- Ownership
    owner_id UUID REFERENCES users(id),
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drive Configurations
CREATE TABLE IF NOT EXISTS drive_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    drive_type VARCHAR(50) NOT NULL DEFAULT 'local',
    root_path TEXT NOT NULL,
    sync_enabled BOOLEAN DEFAULT true,
    sync_interval_minutes INTEGER DEFAULT 5,
    sync_direction VARCHAR(20) DEFAULT 'bidirectional',
    auto_version_on_save BOOLEAN DEFAULT true,
    conflict_resolution VARCHAR(30) DEFAULT 'ask_user',
    is_default BOOLEAN DEFAULT false,
    allow_personal_folders BOOLEAN DEFAULT true,
    status VARCHAR(30) DEFAULT 'active',
    last_sync_at TIMESTAMPTZ,
    last_sync_status VARCHAR(50),
    last_error TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Document Versions
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    version_label VARCHAR(100),
    content_text TEXT,
    content_hash VARCHAR(64),
    file_path TEXT,
    file_size BIGINT,
    content_url TEXT,
    storage_type VARCHAR(30) DEFAULT 'database',
    change_summary TEXT,
    change_type VARCHAR(30) DEFAULT 'edit',
    word_count INTEGER DEFAULT 0,
    character_count INTEGER DEFAULT 0,
    words_added INTEGER DEFAULT 0,
    words_removed INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_by_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'apex',
    external_modified_at TIMESTAMPTZ,
    CONSTRAINT unique_doc_version UNIQUE (document_id, version_number)
);

-- Document Locks
CREATE TABLE IF NOT EXISTS document_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    locked_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    locked_by_name VARCHAR(255),
    lock_type VARCHAR(20) DEFAULT 'edit',
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    client_info TEXT,
    session_id VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    released_at TIMESTAMPTZ,
    release_reason VARCHAR(50)
);

-- Document Activities
CREATE TABLE IF NOT EXISTS document_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id),
    user_name VARCHAR(255),
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document Permissions
CREATE TABLE IF NOT EXISTS document_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID,
    permission_level VARCHAR(20) NOT NULL DEFAULT 'view',
    can_view BOOLEAN DEFAULT true,
    can_download BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_share BOOLEAN DEFAULT false,
    can_manage_permissions BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ
);

-- Folder Permissions
CREATE TABLE IF NOT EXISTS folder_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    folder_path TEXT NOT NULL,
    drive_id UUID REFERENCES drive_configurations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    permission_level VARCHAR(20) NOT NULL DEFAULT 'view',
    is_inherited BOOLEAN DEFAULT false,
    inherited_from TEXT,
    can_view BOOLEAN DEFAULT true,
    can_download BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_create BOOLEAN DEFAULT false,
    can_share BOOLEAN DEFAULT false,
    can_manage_permissions BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document Sync Queue
CREATE TABLE IF NOT EXISTS document_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_id UUID NOT NULL REFERENCES drive_configurations(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    external_path TEXT NOT NULL,
    sync_direction VARCHAR(20) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    last_error TEXT,
    conflict_type VARCHAR(30),
    conflict_resolved_at TIMESTAMPTZ,
    conflict_resolved_by UUID REFERENCES users(id),
    conflict_resolution VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Drive Sync Logs
CREATE TABLE IF NOT EXISTS drive_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    job_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    total_documents INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Word Online Sessions
CREATE TABLE IF NOT EXISTS word_online_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(255),
    session_id VARCHAR(255),
    graph_item_id VARCHAR(255),
    graph_subscription_id VARCHAR(255),
    edit_url TEXT,
    status VARCHAR(20) DEFAULT 'active',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    changes_count INTEGER DEFAULT 0,
    polling_mode BOOLEAN DEFAULT false,
    polling_interval INTEGER DEFAULT 30000,
    last_poll TIMESTAMPTZ
);

-- User Document Preferences
CREATE TABLE IF NOT EXISTS user_document_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    default_privacy VARCHAR(20) DEFAULT 'inherited',
    private_folder_patterns TEXT[],
    notify_on_access BOOLEAN DEFAULT false,
    notify_on_edit BOOLEAN DEFAULT true,
    prefer_word_online BOOLEAN DEFAULT true,
    auto_save_interval INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_prefs UNIQUE (user_id)
);

-- Document AI Insights
CREATE TABLE IF NOT EXISTS document_ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    summary TEXT,
    key_dates JSONB DEFAULT '[]',
    suggested_tags TEXT[] DEFAULT '{}',
    document_type VARCHAR(100),
    importance_score INTEGER DEFAULT 5,
    key_entities JSONB DEFAULT '[]',
    related_documents UUID[] DEFAULT '{}',
    action_items JSONB DEFAULT '[]',
    content_embedding BYTEA,
    content_hash VARCHAR(64),
    analyzed_at TIMESTAMPTZ DEFAULT NOW(),
    analysis_version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id)
);

-- ============================================
-- SYSTEM TABLES
-- ============================================

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    key_value VARCHAR(255),
    permissions TEXT[] DEFAULT '{}',
    last_used TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    action_url TEXT,
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    priority VARCHAR(20) DEFAULT 'normal',
    delivery_status JSONB DEFAULT '{}',
    scheduled_for TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    entity_type VARCHAR(50),
    entity_id UUID,
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    document_changes BOOLEAN DEFAULT true,
    document_shares BOOLEAN DEFAULT true,
    co_editing BOOLEAN DEFAULT true,
    matter_updates BOOLEAN DEFAULT true,
    billing_updates BOOLEAN DEFAULT true,
    in_app BOOLEAN DEFAULT true,
    email_immediate BOOLEAN DEFAULT false,
    email_digest BOOLEAN DEFAULT true,
    digest_frequency VARCHAR(20) DEFAULT 'daily',
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    sms_enabled BOOLEAN DEFAULT false,
    sms_phone VARCHAR(20),
    sms_deadlines BOOLEAN DEFAULT true,
    sms_urgent_matters BOOLEAN DEFAULT true,
    sms_payments BOOLEAN DEFAULT false,
    sms_calendar BOOLEAN DEFAULT false,
    ai_notifications BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Notification Deliveries
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    email_to VARCHAR(255),
    email_subject VARCHAR(500),
    email_message_id VARCHAR(255),
    sms_to VARCHAR(20),
    sms_provider_id VARCHAR(255),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification Templates
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    subject VARCHAR(500),
    body TEXT NOT NULL,
    available_variables JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_id, type, channel)
);

-- Invitations
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'staff',
    token_hash VARCHAR(255) NOT NULL,
    invited_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- Platform Settings
CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    is_secret BOOLEAN DEFAULT false,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Integrations
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    is_connected BOOLEAN DEFAULT false,
    account_email VARCHAR(255),
    account_name VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}',
    sync_enabled BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    connected_by UUID REFERENCES users(id),
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_id, provider)
);

-- Email Links
CREATE TABLE IF NOT EXISTS email_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    email_id VARCHAR(500) NOT NULL,
    email_provider VARCHAR(50) DEFAULT 'outlook',
    subject TEXT,
    from_address VARCHAR(255),
    to_addresses TEXT[],
    received_at TIMESTAMPTZ,
    linked_by UUID REFERENCES users(id),
    linked_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SHARING GROUPS
-- ============================================

CREATE TABLE IF NOT EXISTS sharing_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3b82f6',
    icon VARCHAR(50) DEFAULT 'users',
    share_documents BOOLEAN DEFAULT true,
    share_matters BOOLEAN DEFAULT true,
    share_clients BOOLEAN DEFAULT true,
    share_calendar BOOLEAN DEFAULT true,
    share_tasks BOOLEAN DEFAULT true,
    share_time_entries BOOLEAN DEFAULT false,
    share_notes BOOLEAN DEFAULT true,
    default_permission_level VARCHAR(20) DEFAULT 'view',
    allow_external_sharing BOOLEAN DEFAULT true,
    require_approval_to_join BOOLEAN DEFAULT false,
    allow_member_invite BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sharing_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sharing_group_id UUID NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    permission_override VARCHAR(20),
    can_hide_items BOOLEAN DEFAULT true,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    invited_by UUID REFERENCES users(id),
    CONSTRAINT unique_group_member UNIQUE (sharing_group_id, user_id)
);

CREATE TABLE IF NOT EXISTS sharing_group_hidden_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sharing_group_id UUID NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL,
    item_id UUID NOT NULL,
    reason VARCHAR(255),
    hidden_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_hidden_item UNIQUE (sharing_group_id, user_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS user_sharing_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    auto_share_documents BOOLEAN DEFAULT true,
    auto_share_matters BOOLEAN DEFAULT false,
    auto_share_calendar BOOLEAN DEFAULT true,
    auto_share_tasks BOOLEAN DEFAULT true,
    auto_share_notes BOOLEAN DEFAULT true,
    default_document_privacy VARCHAR(20) DEFAULT 'team',
    default_matter_visibility VARCHAR(20) DEFAULT 'restricted',
    notify_on_share_access BOOLEAN DEFAULT false,
    notify_on_group_activity BOOLEAN DEFAULT true,
    quick_share_users UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_sharing_prefs UNIQUE (user_id)
);

-- ============================================
-- AI TABLES
-- ============================================

-- AI Tasks
CREATE TABLE IF NOT EXISTS ai_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    context JSONB DEFAULT '{}',
    plan JSONB DEFAULT '[]',
    progress JSONB DEFAULT '[]',
    result TEXT,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    iterations INTEGER DEFAULT 0,
    max_iterations INTEGER DEFAULT 50,
    checkpoint JSONB,
    checkpoint_at TIMESTAMPTZ,
    current_step TEXT,
    step_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Background Tasks
CREATE TABLE IF NOT EXISTS ai_background_tasks (
    id VARCHAR(100) PRIMARY KEY,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    progress JSONB DEFAULT '{}',
    result JSONB,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    iterations INTEGER DEFAULT 0,
    max_iterations INTEGER DEFAULT 120,
    options JSONB DEFAULT '{}',
    checkpoint JSONB,
    checkpoint_at TIMESTAMPTZ,
    feedback_rating INTEGER,
    feedback_text TEXT,
    feedback_correction TEXT,
    feedback_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Learning Patterns
CREATE TABLE IF NOT EXISTS ai_learning_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    pattern_type VARCHAR(100) NOT NULL,
    pattern_category VARCHAR(100),
    pattern_data JSONB NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.50,
    occurrences INTEGER DEFAULT 1,
    level VARCHAR(20) DEFAULT 'user',
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Learnings
CREATE TABLE IF NOT EXISTS ai_learnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    learning_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    content_hash VARCHAR(64) GENERATED ALWAYS AS (md5(content::text)) STORED,
    confidence DECIMAL(3,2) DEFAULT 0.5,
    source VARCHAR(50),
    occurrence_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Document Insights
CREATE TABLE IF NOT EXISTS ai_document_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    document_type VARCHAR(50),
    content_hash VARCHAR(64) GENERATED ALWAYS AS (md5(content::text)) STORED,
    occurrence_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Task History
CREATE TABLE IF NOT EXISTS ai_task_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id VARCHAR(100) NOT NULL,
    goal TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    iterations INTEGER DEFAULT 0,
    summary TEXT,
    actions_taken JSONB,
    result JSONB,
    error TEXT,
    learnings JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Workflow Templates
CREATE TABLE IF NOT EXISTS ai_workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_phrases TEXT[],
    steps JSONB NOT NULL DEFAULT '[]',
    category VARCHAR(50),
    estimated_minutes INTEGER DEFAULT 5,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(3,2) DEFAULT 1.00,
    avg_duration_seconds INTEGER,
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Document Queue
CREATE TABLE IF NOT EXISTS ai_document_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    firm_id UUID NOT NULL,
    user_id UUID NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    queued_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Matter AI Insights
CREATE TABLE IF NOT EXISTS matter_ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL,
    case_summary TEXT,
    key_issues TEXT[],
    critical_dates JSONB DEFAULT '[]',
    risk_factors JSONB DEFAULT '[]',
    missing_documents TEXT[],
    case_timeline JSONB DEFAULT '[]',
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drive Activity Log
CREATE TABLE IF NOT EXISTS drive_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL,
    user_id UUID NOT NULL,
    document_id UUID,
    matter_id UUID,
    action VARCHAR(50) NOT NULL,
    source VARCHAR(50) DEFAULT 'desktop',
    file_name VARCHAR(500),
    file_type VARCHAR(100),
    folder_path TEXT,
    duration_seconds INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MIGRATION & SYNC TABLES
-- ============================================

-- Migration Jobs
CREATE TABLE IF NOT EXISTS migration_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'running',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    users_status TEXT DEFAULT 'pending',
    users_count INTEGER DEFAULT 0,
    contacts_status TEXT DEFAULT 'pending',
    contacts_count INTEGER DEFAULT 0,
    matters_status TEXT DEFAULT 'pending',
    matters_count INTEGER DEFAULT 0,
    activities_status TEXT DEFAULT 'pending',
    activities_count INTEGER DEFAULT 0,
    bills_status TEXT DEFAULT 'pending',
    bills_count INTEGER DEFAULT 0,
    calendar_status TEXT DEFAULT 'pending',
    calendar_count INTEGER DEFAULT 0,
    result_data JSONB,
    summary JSONB,
    import_options JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clio Document Manifest
CREATE TABLE IF NOT EXISTS clio_document_manifest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    clio_id BIGINT NOT NULL,
    clio_matter_id BIGINT,
    clio_client_id BIGINT,
    clio_folder_id BIGINT,
    clio_created_by_id BIGINT,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(500) NOT NULL,
    clio_path TEXT,
    content_type VARCHAR(255),
    size BIGINT,
    version_number INTEGER DEFAULT 1,
    is_latest_version BOOLEAN DEFAULT true,
    parent_version_clio_id BIGINT,
    clio_created_at TIMESTAMPTZ,
    clio_updated_at TIMESTAMPTZ,
    match_status VARCHAR(50) DEFAULT 'pending',
    matched_azure_path TEXT,
    matched_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    match_confidence DECIMAL(5,2),
    match_method VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_clio_doc UNIQUE (firm_id, clio_id)
);

-- Clio Folder Manifest
CREATE TABLE IF NOT EXISTS clio_folder_manifest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    clio_id BIGINT NOT NULL,
    clio_parent_id BIGINT,
    clio_matter_id BIGINT,
    name VARCHAR(500) NOT NULL,
    full_path TEXT,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_clio_folder UNIQUE (firm_id, clio_id)
);

-- Scan History
CREATE TABLE IF NOT EXISTS scan_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'running',
    scan_mode VARCHAR(50) DEFAULT 'auto',
    files_processed INTEGER DEFAULT 0,
    files_matched INTEGER DEFAULT 0,
    files_created INTEGER DEFAULT 0,
    files_skipped INTEGER DEFAULT 0,
    total_files INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    error_message TEXT,
    scan_results JSONB,
    triggered_by VARCHAR(100) DEFAULT 'manual',
    triggered_by_user VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Scan Settings
CREATE TABLE IF NOT EXISTS scan_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL UNIQUE REFERENCES firms(id) ON DELETE CASCADE,
    auto_sync_enabled BOOLEAN DEFAULT false,
    sync_interval_minutes INTEGER DEFAULT 10,
    last_auto_sync_at TIMESTAMPTZ,
    permission_mode VARCHAR(50) DEFAULT 'matter',
    default_privacy_level VARCHAR(50) DEFAULT 'team',
    auto_assign_to_responsible_attorney BOOLEAN DEFAULT true,
    notify_on_completion BOOLEAN DEFAULT true,
    notify_on_error BOOLEAN DEFAULT true,
    notification_emails TEXT[],
    dry_run_first BOOLEAN DEFAULT false,
    skip_existing BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- DESKTOP CLIENT TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS desktop_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) DEFAULT 'windows',
    app_version VARCHAR(50),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, device_name)
);

CREATE TABLE IF NOT EXISTS desktop_connection_codes (
    code VARCHAR(8) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drive_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    last_sync_at TIMESTAMPTZ,
    sync_status VARCHAR(50) DEFAULT 'idle',
    pending_uploads INTEGER DEFAULT 0,
    pending_downloads INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- ============================================
-- ADVANCED PERMISSIONS TABLES
-- ============================================

-- Permission Definitions
CREATE TABLE IF NOT EXISTS permission_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_sensitive BOOLEAN DEFAULT false,
    min_role_level INTEGER DEFAULT 0,
    requires TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0
);

-- Custom Roles
CREATE TABLE IF NOT EXISTS custom_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    slug VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#64748B',
    icon VARCHAR(50) DEFAULT 'user',
    is_system BOOLEAN DEFAULT false,
    inherits_from VARCHAR(50),
    priority INTEGER DEFAULT 50,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    CONSTRAINT unique_role_slug UNIQUE (firm_id, slug)
);

-- Role Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    role_slug VARCHAR(50) NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    permission_value VARCHAR(20) NOT NULL DEFAULT 'granted',
    conditions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES users(id),
    CONSTRAINT unique_role_permission UNIQUE (firm_id, role_slug, permission_key)
);

-- Client Permissions
CREATE TABLE IF NOT EXISTS client_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    role_slug VARCHAR(50),
    permission_level VARCHAR(20) NOT NULL DEFAULT 'view',
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    can_view_matters BOOLEAN DEFAULT true,
    can_create_matters BOOLEAN DEFAULT false,
    can_view_billing BOOLEAN DEFAULT false,
    can_edit_billing BOOLEAN DEFAULT false,
    can_view_documents BOOLEAN DEFAULT true,
    can_share BOOLEAN DEFAULT false,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ,
    notes TEXT
);

-- Permission Templates
CREATE TABLE IF NOT EXISTS permission_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'shield',
    color VARCHAR(20) DEFAULT '#3B82F6',
    template_type VARCHAR(20) NOT NULL DEFAULT 'matter',
    permissions JSONB NOT NULL DEFAULT '[]',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Permission Inheritance Rules
CREATE TABLE IF NOT EXISTS permission_inheritance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    source_type VARCHAR(30) NOT NULL,
    target_type VARCHAR(30) NOT NULL,
    inheritance_mode VARCHAR(20) NOT NULL DEFAULT 'inherit',
    cascade_denials BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 50,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_inheritance_rule UNIQUE (firm_id, source_type, target_type)
);

-- User Permission Overrides
CREATE TABLE IF NOT EXISTS user_permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    permission_key VARCHAR(100) NOT NULL,
    permission_value VARCHAR(20) NOT NULL,
    reason TEXT,
    set_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_override UNIQUE (user_id, permission_key)
);

-- ============================================
-- INDEXES
-- ============================================

-- Core indexes
CREATE INDEX IF NOT EXISTS idx_users_firm_id ON users(firm_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_clients_firm_id ON clients(firm_id);
CREATE INDEX IF NOT EXISTS idx_clients_display_name ON clients(display_name);
CREATE INDEX IF NOT EXISTS idx_clients_external_id ON clients(external_id);
CREATE INDEX IF NOT EXISTS idx_clients_quickbooks_id ON clients(quickbooks_id) WHERE quickbooks_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_firm_name ON clients(firm_id, display_name);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);

-- Matter indexes
CREATE INDEX IF NOT EXISTS idx_matters_firm_id ON matters(firm_id);
CREATE INDEX IF NOT EXISTS idx_matters_client_id ON matters(client_id);
CREATE INDEX IF NOT EXISTS idx_matters_status ON matters(status);
CREATE INDEX IF NOT EXISTS idx_matters_responsible_attorney ON matters(responsible_attorney);
CREATE INDEX IF NOT EXISTS idx_matters_originating_attorney ON matters(originating_attorney);
CREATE INDEX IF NOT EXISTS idx_matters_created_by ON matters(created_by);
CREATE INDEX IF NOT EXISTS idx_matters_visibility ON matters(visibility);
CREATE INDEX IF NOT EXISTS idx_matters_firm_created ON matters(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matters_firm_status ON matters(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_matters_my_matters ON matters(firm_id, responsible_attorney, originating_attorney, created_by);

-- Matter-related indexes
CREATE INDEX IF NOT EXISTS idx_matter_assignments_user_id ON matter_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_matter_assignments_matter_id ON matter_assignments(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_assignments_matter_user ON matter_assignments(matter_id, user_id);
CREATE INDEX IF NOT EXISTS idx_matter_permissions_matter_id ON matter_permissions(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_permissions_user_id ON matter_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_matter_permissions_group_id ON matter_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_matter_contacts_matter_id ON matter_contacts(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_contacts_firm_id ON matter_contacts(firm_id);
CREATE INDEX IF NOT EXISTS idx_matter_notes_matter_id ON matter_notes(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_notes_created_at ON matter_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matter_notes_created_by ON matter_notes(created_by);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_firm_id ON matter_tasks(firm_id);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_matter_id ON matter_tasks(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_assignee ON matter_tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_status ON matter_tasks(status);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_due_date ON matter_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_matter_status ON matter_tasks(matter_id, status);
CREATE INDEX IF NOT EXISTS idx_matter_updates_firm_id ON matter_updates(firm_id);
CREATE INDEX IF NOT EXISTS idx_matter_updates_matter_id ON matter_updates(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_updates_date ON matter_updates(date);

-- Time & Billing indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_matter_id ON time_entries(matter_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_firm_user ON time_entries(firm_id, user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clio_id ON time_entries(clio_id) WHERE clio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_migration_source ON time_entries(migration_source) WHERE migration_source IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_clio_unique ON time_entries(firm_id, clio_id) WHERE clio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_clio_id ON expenses(clio_id) WHERE clio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_migration_source ON expenses(migration_source) WHERE migration_source IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_clio_unique ON expenses(firm_id, clio_id) WHERE clio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_firm_id ON invoices(firm_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_external_id ON invoices(external_id);
CREATE INDEX IF NOT EXISTS idx_invoices_quickbooks_id ON invoices(quickbooks_id) WHERE quickbooks_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_quickbooks_sync_status ON invoices(quickbooks_sync_status) WHERE quickbooks_sync_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_payments_quickbooks_id ON payments(quickbooks_id) WHERE quickbooks_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_quickbooks_sync_status ON payments(quickbooks_sync_status) WHERE quickbooks_sync_status = 'pending';

-- Calendar indexes
CREATE INDEX IF NOT EXISTS idx_calendar_events_firm_id ON calendar_events(firm_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_matter_id ON calendar_events(matter_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_external_id ON calendar_events(external_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_firm_date ON calendar_events(firm_id, start_time);

-- Document indexes
CREATE INDEX IF NOT EXISTS idx_documents_firm_id ON documents(firm_id);
CREATE INDEX IF NOT EXISTS idx_documents_matter_id ON documents(matter_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_storage_location ON documents(storage_location);
CREATE INDEX IF NOT EXISTS idx_documents_external_id ON documents(external_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder_path ON documents(folder_path);
CREATE INDEX IF NOT EXISTS idx_documents_drive_id ON documents(drive_id);
CREATE INDEX IF NOT EXISTS idx_documents_is_private ON documents(is_private) WHERE is_private = true;
CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_privacy_level ON documents(privacy_level);
CREATE INDEX IF NOT EXISTS idx_documents_sync_status ON documents(firm_id, sync_status) WHERE sync_status = 'pending' OR sync_status IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_firm_path ON documents(firm_id, path);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_firm_path_unique ON documents(firm_id, path);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_firm_external_path ON documents(firm_id, external_path) WHERE external_path IS NOT NULL;

-- Document versions and activities
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_firm ON document_versions(firm_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_created_at ON document_versions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_versions_created_by ON document_versions(created_by);
CREATE INDEX IF NOT EXISTS idx_document_versions_source ON document_versions(source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_locks_active ON document_locks(document_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_document_locks_user ON document_locks(locked_by);
CREATE INDEX IF NOT EXISTS idx_document_locks_expires ON document_locks(expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_document_activities_doc ON document_activities(document_id);
CREATE INDEX IF NOT EXISTS idx_document_activities_action ON document_activities(action);
CREATE INDEX IF NOT EXISTS idx_document_activities_user_id ON document_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_document_activities_created_at ON document_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_permissions_document ON document_permissions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_permissions_user ON document_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_folder_permissions_folder ON folder_permissions(folder_path);
CREATE INDEX IF NOT EXISTS idx_folder_permissions_user ON folder_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_folder_permissions_group ON folder_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_folder_permissions_firm ON folder_permissions(firm_id);

-- Drive/sync indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_config_default_firm ON drive_configurations(firm_id) WHERE is_default = true AND user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_drive_config_firm_id ON drive_configurations(firm_id);
CREATE INDEX IF NOT EXISTS idx_drive_config_user_id ON drive_configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON document_sync_queue(status) WHERE status IN ('pending', 'processing', 'conflict');
CREATE INDEX IF NOT EXISTS idx_sync_queue_drive_id ON document_sync_queue(drive_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_logs_firm ON drive_sync_logs(firm_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_logs_started ON drive_sync_logs(firm_id, started_at DESC);

-- Word Online indexes
CREATE INDEX IF NOT EXISTS idx_word_sessions_document ON word_online_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_word_sessions_user ON word_online_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_word_sessions_active ON word_online_sessions(status) WHERE status = 'active';

-- Document AI indexes
CREATE INDEX IF NOT EXISTS idx_doc_ai_insights_firm ON document_ai_insights(firm_id);
CREATE INDEX IF NOT EXISTS idx_doc_ai_insights_type ON document_ai_insights(document_type);
CREATE INDEX IF NOT EXISTS idx_doc_ai_insights_importance ON document_ai_insights(importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_doc_ai_insights_tags ON document_ai_insights USING GIN(suggested_tags);

-- Audit and notification indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_firm_id ON audit_logs(firm_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_firm ON notifications(firm_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification ON notification_deliveries(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user ON notification_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pending ON notification_deliveries(status, next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);

-- Integration indexes
CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(key);
CREATE INDEX IF NOT EXISTS idx_integrations_firm_id ON integrations(firm_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
CREATE INDEX IF NOT EXISTS idx_email_links_firm_id ON email_links(firm_id);
CREATE INDEX IF NOT EXISTS idx_email_links_matter_id ON email_links(matter_id);
CREATE INDEX IF NOT EXISTS idx_email_links_client_id ON email_links(client_id);
CREATE INDEX IF NOT EXISTS idx_email_links_email_id ON email_links(email_id);

-- Sharing indexes
CREATE INDEX IF NOT EXISTS idx_sharing_groups_firm ON sharing_groups(firm_id);
CREATE INDEX IF NOT EXISTS idx_sharing_groups_active ON sharing_groups(firm_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sharing_group_members_user ON sharing_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sharing_group_members_group ON sharing_group_members(sharing_group_id);
CREATE INDEX IF NOT EXISTS idx_hidden_items_user ON sharing_group_hidden_items(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_items_item ON sharing_group_hidden_items(item_type, item_id);

-- AI indexes
CREATE INDEX IF NOT EXISTS idx_ai_tasks_firm_id ON ai_tasks(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_id ON ai_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_resumable ON ai_tasks(status, checkpoint_at) WHERE status = 'running' AND checkpoint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_firm_id ON ai_background_tasks(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_id ON ai_background_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_status ON ai_background_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_status ON ai_background_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_started ON ai_background_tasks(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_checkpoint ON ai_background_tasks(status, checkpoint_at) WHERE status IN ('running', 'pending');
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_firm ON ai_learning_patterns(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_user ON ai_learning_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_level ON ai_learning_patterns(level);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_category ON ai_learning_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_confidence ON ai_learning_patterns(confidence);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_firm_level ON ai_learning_patterns(firm_id, level, confidence);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_user_level ON ai_learning_patterns(user_id, level, confidence);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_global ON ai_learning_patterns(pattern_type, confidence DESC) WHERE level = 'global';
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_hierarchical ON ai_learning_patterns(level, firm_id, user_id, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_ai_learnings_firm_type ON ai_learnings(firm_id, learning_type);
CREATE INDEX IF NOT EXISTS idx_ai_learnings_confidence ON ai_learnings(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_ai_learnings_user ON ai_learnings(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_learnings_firm_user ON ai_learnings(firm_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ai_learnings_type ON ai_learnings(learning_type);
CREATE INDEX IF NOT EXISTS idx_document_insights_user ON ai_document_insights(user_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_document_insights_firm ON ai_document_insights(firm_id);
CREATE INDEX IF NOT EXISTS idx_document_insights_doc_type ON ai_document_insights(document_type);
CREATE INDEX IF NOT EXISTS idx_task_history_firm ON ai_task_history(firm_id);
CREATE INDEX IF NOT EXISTS idx_task_history_user ON ai_task_history(user_id);
CREATE INDEX IF NOT EXISTS idx_task_history_status ON ai_task_history(status);
CREATE INDEX IF NOT EXISTS idx_task_history_date ON ai_task_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_templates_firm ON ai_workflow_templates(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_templates_firm_active ON ai_workflow_templates(firm_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_templates_active ON ai_workflow_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ai_doc_queue_status ON ai_document_queue(status, priority, queued_at);
CREATE INDEX IF NOT EXISTS idx_matter_ai_insights_matter ON matter_ai_insights(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_ai_insights_firm ON matter_ai_insights(firm_id);
CREATE INDEX IF NOT EXISTS idx_drive_activity_firm ON drive_activity_log(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_activity_user ON drive_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_activity_matter ON drive_activity_log(matter_id, created_at DESC);

-- Migration indexes
CREATE INDEX IF NOT EXISTS idx_migration_jobs_connection_id ON migration_jobs(connection_id);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_status ON migration_jobs(status);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_firm ON clio_document_manifest(firm_id);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_clio_id ON clio_document_manifest(clio_id);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_matter ON clio_document_manifest(clio_matter_id);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_client ON clio_document_manifest(clio_client_id);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_status ON clio_document_manifest(match_status);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_name ON clio_document_manifest(name);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_path ON clio_document_manifest(clio_path);
CREATE INDEX IF NOT EXISTS idx_clio_folder_manifest_firm ON clio_folder_manifest(firm_id);
CREATE INDEX IF NOT EXISTS idx_clio_folder_manifest_parent ON clio_folder_manifest(clio_parent_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_firm ON scan_history(firm_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_status ON scan_history(status);
CREATE INDEX IF NOT EXISTS idx_scan_history_started ON scan_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_settings_firm ON scan_settings(firm_id);

-- Desktop client indexes
CREATE INDEX IF NOT EXISTS idx_desktop_clients_user_id ON desktop_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_desktop_clients_firm_id ON desktop_clients(firm_id);
CREATE INDEX IF NOT EXISTS idx_desktop_clients_last_seen ON desktop_clients(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_desktop_connection_codes_expires ON desktop_connection_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_drive_sync_status_user_id ON drive_sync_status(user_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_status_firm_id ON drive_sync_status(firm_id);

-- Permissions indexes
CREATE INDEX IF NOT EXISTS idx_custom_roles_firm ON custom_roles(firm_id);
CREATE INDEX IF NOT EXISTS idx_custom_roles_slug ON custom_roles(slug);
CREATE INDEX IF NOT EXISTS idx_role_permissions_firm ON role_permissions(firm_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_slug);
CREATE INDEX IF NOT EXISTS idx_client_permissions_client ON client_permissions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_permissions_user ON client_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_client_permissions_group ON client_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_client_permissions_role ON client_permissions(role_slug);
CREATE INDEX IF NOT EXISTS idx_permission_templates_firm ON permission_templates(firm_id);
CREATE INDEX IF NOT EXISTS idx_permission_templates_type ON permission_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user ON user_permission_overrides(user_id);

-- Stripe indexes
CREATE INDEX IF NOT EXISTS idx_stripe_connections_firm ON stripe_connections(firm_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_firm ON stripe_transactions(firm_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_invoice ON stripe_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_status ON stripe_transactions(status);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_created ON stripe_transactions(created_at DESC);

-- Azure index
CREATE INDEX IF NOT EXISTS idx_firms_azure_folder ON firms(azure_folder) WHERE azure_folder IS NOT NULL;

-- ============================================
-- TRIGGERS AND FUNCTIONS
-- ============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

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

-- Pattern confidence update function
CREATE OR REPLACE FUNCTION update_pattern_confidence()
RETURNS TRIGGER AS $$
BEGIN
    NEW.confidence := LEAST(0.99, 0.50 + (0.49 * (1 - EXP(-NEW.occurrences::float / 10))));
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired connection codes function
CREATE OR REPLACE FUNCTION cleanup_expired_connection_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM desktop_connection_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create triggers (with IF NOT EXISTS check via DO block)
DO $$
BEGIN
    -- updated_at triggers
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_firms_updated_at') THEN
        CREATE TRIGGER update_firms_updated_at BEFORE UPDATE ON firms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_clients_updated_at') THEN
        CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_matters_updated_at') THEN
        CREATE TRIGGER update_matters_updated_at BEFORE UPDATE ON matters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_time_entries_updated_at') THEN
        CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_expenses_updated_at') THEN
        CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_invoices_updated_at') THEN
        CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_calendar_events_updated_at') THEN
        CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_documents_updated_at') THEN
        CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_groups_updated_at') THEN
        CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_trust_accounts_updated_at') THEN
        CREATE TRIGGER update_trust_accounts_updated_at BEFORE UPDATE ON trust_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_integrations_updated_at') THEN
        CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_platform_settings_updated_at') THEN
        CREATE TRIGGER update_platform_settings_updated_at BEFORE UPDATE ON platform_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Invoice calculation trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'calculate_invoice_amounts_trigger') THEN
        CREATE TRIGGER calculate_invoice_amounts_trigger BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION calculate_invoice_amounts();
    END IF;
    
    -- Pattern confidence trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_pattern_confidence') THEN
        CREATE TRIGGER trigger_update_pattern_confidence BEFORE UPDATE OF occurrences ON ai_learning_patterns FOR EACH ROW EXECUTE FUNCTION update_pattern_confidence();
    END IF;
END $$;

-- ============================================
-- SEED DATA
-- ============================================

-- Platform settings (OAuth credentials placeholders)
INSERT INTO platform_settings (key, value, is_secret, description) VALUES
    ('microsoft_client_id', '', false, 'Microsoft Azure App Client ID'),
    ('microsoft_client_secret', '', true, 'Microsoft Azure App Client Secret'),
    ('microsoft_redirect_uri', '', false, 'Microsoft OAuth Redirect URI'),
    ('microsoft_tenant', 'common', false, 'Microsoft Tenant ID'),
    ('quickbooks_client_id', '', false, 'QuickBooks App Client ID'),
    ('quickbooks_client_secret', '', true, 'QuickBooks App Client Secret'),
    ('quickbooks_redirect_uri', '', false, 'QuickBooks OAuth Redirect URI'),
    ('quickbooks_environment', 'sandbox', false, 'QuickBooks environment (sandbox or production)'),
    ('google_client_id', '', false, 'Google Cloud App Client ID'),
    ('google_client_secret', '', true, 'Google Cloud App Client Secret'),
    ('google_redirect_uri', '', false, 'Google OAuth Redirect URI'),
    ('dropbox_client_id', '', false, 'Dropbox App Key'),
    ('dropbox_client_secret', '', true, 'Dropbox App Secret'),
    ('dropbox_redirect_uri', '', false, 'Dropbox OAuth Redirect URI'),
    ('docusign_client_id', '', false, 'DocuSign Integration Key'),
    ('docusign_client_secret', '', true, 'DocuSign Secret Key'),
    ('docusign_redirect_uri', '', false, 'DocuSign OAuth Redirect URI'),
    ('docusign_environment', 'demo', false, 'DocuSign environment (demo or production)'),
    ('slack_client_id', '', false, 'Slack App Client ID'),
    ('slack_client_secret', '', true, 'Slack App Client Secret'),
    ('slack_redirect_uri', '', false, 'Slack OAuth Redirect URI'),
    ('zoom_client_id', '', false, 'Zoom App Client ID'),
    ('zoom_client_secret', '', true, 'Zoom App Client Secret'),
    ('zoom_redirect_uri', '', false, 'Zoom OAuth Redirect URI')
ON CONFLICT (key) DO NOTHING;

-- Permission definitions
INSERT INTO permission_definitions (permission_key, category, name, description, is_sensitive, sort_order) VALUES
    ('firm:manage', 'admin', 'Manage Firm Settings', 'Access and modify firm-wide settings', true, 10),
    ('firm:billing', 'admin', 'Manage Firm Billing', 'Manage firm subscription and billing', true, 20),
    ('firm:delete', 'admin', 'Delete Firm', 'Permanently delete the firm account', true, 30),
    ('users:invite', 'admin', 'Invite Users', 'Send invitations to new team members', false, 10),
    ('users:manage', 'admin', 'Manage Users', 'Edit user profiles and settings', true, 20),
    ('users:delete', 'admin', 'Delete Users', 'Remove users from the firm', true, 30),
    ('users:view_rates', 'admin', 'View Billing Rates', 'See hourly rates for all users', false, 40),
    ('users:edit_rates', 'admin', 'Edit Billing Rates', 'Modify hourly rates for users', true, 50),
    ('groups:manage', 'admin', 'Manage Groups', 'Create and manage team groups', false, 10),
    ('groups:assign', 'admin', 'Assign Group Members', 'Add/remove users from groups', false, 20),
    ('matters:create', 'matters', 'Create Matters', 'Create new matters', false, 10),
    ('matters:view', 'matters', 'View Matters', 'View matter details', false, 20),
    ('matters:view_restricted', 'matters', 'View Restricted Matters', 'View matters marked as restricted', false, 25),
    ('matters:edit', 'matters', 'Edit Matters', 'Modify matter information', false, 30),
    ('matters:delete', 'matters', 'Delete Matters', 'Delete or archive matters', true, 40),
    ('matters:assign', 'matters', 'Assign Team Members', 'Add team members to matters', false, 50),
    ('matters:manage_permissions', 'matters', 'Manage Matter Permissions', 'Control who can access matters', false, 60),
    ('matters:close', 'matters', 'Close Matters', 'Close/reopen matters', false, 70),
    ('matters:transfer', 'matters', 'Transfer Matters', 'Transfer matters between clients', true, 80),
    ('clients:create', 'clients', 'Create Clients', 'Create new client records', false, 10),
    ('clients:view', 'clients', 'View Clients', 'View client information', false, 20),
    ('clients:view_restricted', 'clients', 'View Restricted Clients', 'View clients marked as restricted', false, 25),
    ('clients:edit', 'clients', 'Edit Clients', 'Modify client information', false, 30),
    ('clients:delete', 'clients', 'Delete Clients', 'Delete client records', true, 40),
    ('clients:merge', 'clients', 'Merge Clients', 'Merge duplicate client records', true, 50),
    ('clients:view_confidential', 'clients', 'View Confidential Info', 'View SSN, financial details', true, 60),
    ('billing:create', 'billing', 'Create Time Entries', 'Record time and expenses', false, 10),
    ('billing:view', 'billing', 'View Billing', 'View time entries and invoices', false, 20),
    ('billing:view_all', 'billing', 'View All Billing', 'View billing for all users', false, 25),
    ('billing:edit', 'billing', 'Edit Billing', 'Modify time entries and expenses', false, 30),
    ('billing:edit_others', 'billing', 'Edit Others Billing', 'Edit other users time entries', true, 35),
    ('billing:delete', 'billing', 'Delete Billing', 'Delete time entries and expenses', true, 40),
    ('billing:approve', 'billing', 'Approve Time', 'Approve time entries for billing', false, 50),
    ('billing:create_invoices', 'billing', 'Create Invoices', 'Generate and send invoices', false, 60),
    ('billing:void_invoices', 'billing', 'Void Invoices', 'Void sent invoices', true, 70),
    ('billing:apply_discounts', 'billing', 'Apply Discounts', 'Add discounts to invoices', false, 80),
    ('billing:view_trust', 'billing', 'View Trust Accounts', 'View IOLTA trust balances', false, 90),
    ('billing:manage_trust', 'billing', 'Manage Trust', 'Deposit/withdraw from trust', true, 100),
    ('documents:upload', 'documents', 'Upload Documents', 'Upload new documents', false, 10),
    ('documents:view', 'documents', 'View Documents', 'View and download documents', false, 20),
    ('documents:view_confidential', 'documents', 'View Confidential', 'Access confidential documents', false, 25),
    ('documents:edit', 'documents', 'Edit Documents', 'Edit and version documents', false, 30),
    ('documents:delete', 'documents', 'Delete Documents', 'Delete documents', true, 40),
    ('documents:share_external', 'documents', 'Share External', 'Share documents outside firm', false, 50),
    ('documents:manage_folders', 'documents', 'Manage Folders', 'Create/delete folders', false, 60),
    ('documents:manage_permissions', 'documents', 'Manage Doc Permissions', 'Set document access rights', false, 70),
    ('calendar:create', 'calendar', 'Create Events', 'Create calendar events', false, 10),
    ('calendar:view', 'calendar', 'View Calendar', 'View calendar and events', false, 20),
    ('calendar:view_all', 'calendar', 'View All Calendars', 'See all users calendars', false, 25),
    ('calendar:edit', 'calendar', 'Edit Events', 'Modify calendar events', false, 30),
    ('calendar:delete', 'calendar', 'Delete Events', 'Remove calendar events', false, 40),
    ('calendar:manage_deadlines', 'calendar', 'Manage Deadlines', 'Set and modify legal deadlines', false, 50),
    ('reports:view', 'reports', 'View Reports', 'Access reporting dashboard', false, 10),
    ('reports:view_financial', 'reports', 'View Financial Reports', 'Access financial/revenue reports', false, 20),
    ('reports:view_productivity', 'reports', 'View Productivity', 'View user productivity metrics', false, 30),
    ('reports:create', 'reports', 'Create Reports', 'Generate custom reports', false, 40),
    ('reports:export', 'reports', 'Export Reports', 'Export report data', false, 50),
    ('reports:schedule', 'reports', 'Schedule Reports', 'Set up automated reports', false, 60),
    ('integrations:view', 'integrations', 'View Integrations', 'See connected integrations', false, 10),
    ('integrations:manage', 'integrations', 'Manage Integrations', 'Connect/disconnect integrations', true, 20),
    ('integrations:sync', 'integrations', 'Trigger Sync', 'Manually sync integrated data', false, 30),
    ('ai:use_assistant', 'ai', 'Use AI Assistant', 'Chat with AI assistant', false, 10),
    ('ai:use_drafting', 'ai', 'AI Document Drafting', 'Generate documents with AI', false, 20),
    ('ai:use_analysis', 'ai', 'AI Analysis', 'Use AI for analysis tasks', false, 30),
    ('ai:view_suggestions', 'ai', 'View AI Suggestions', 'See AI-generated suggestions', false, 40),
    ('ai:train_model', 'ai', 'Train AI', 'Provide feedback to improve AI', false, 50),
    ('audit:view', 'security', 'View Audit Logs', 'Access activity audit logs', true, 10),
    ('audit:export', 'security', 'Export Audit Logs', 'Export audit log data', true, 20),
    ('security:manage_sessions', 'security', 'Manage Sessions', 'Force logout sessions', true, 30),
    ('security:manage_2fa', 'security', 'Manage 2FA', 'Configure 2FA requirements', true, 40),
    ('security:manage_api_keys', 'security', 'Manage API Keys', 'Create/revoke API keys', true, 50)
ON CONFLICT (permission_key) DO NOTHING;

-- Default notification templates
INSERT INTO notification_templates (firm_id, type, channel, name, subject, body, available_variables, is_default) VALUES
    (NULL, 'deadline_reminder', 'email', 'Deadline Reminder', 
     'Reminder: {{matter_name}} deadline in {{time_until}}',
     'Hello {{user_name}},\n\nThis is a reminder that you have an upcoming deadline:\n\nMatter: {{matter_name}}\nDeadline: {{deadline_date}}\nTime remaining: {{time_until}}\n\nDescription: {{deadline_description}}\n\nPlease ensure this is addressed promptly.\n\nBest regards,\nApex Legal',
     '["user_name", "matter_name", "deadline_date", "time_until", "deadline_description"]', true),
    (NULL, 'matter_update', 'email', 'Matter Update',
     'Update on {{matter_name}}',
     'Hello {{user_name}},\n\nThere has been an update on matter {{matter_name}}:\n\n{{update_message}}\n\nUpdated by: {{updated_by}}\nTime: {{update_time}}\n\nView matter: {{matter_link}}\n\nBest regards,\nApex Legal',
     '["user_name", "matter_name", "update_message", "updated_by", "update_time", "matter_link"]', true),
    (NULL, 'payment_received', 'email', 'Payment Received',
     'Payment received for {{invoice_number}}',
     'Hello {{user_name}},\n\nA payment has been received:\n\nClient: {{client_name}}\nInvoice: {{invoice_number}}\nAmount: {{payment_amount}}\nPayment method: {{payment_method}}\n\nThank you,\nApex Legal',
     '["user_name", "client_name", "invoice_number", "payment_amount", "payment_method"]', true),
    (NULL, 'deadline_reminder', 'sms', 'Deadline Reminder SMS',
     NULL,
     'APEX: Deadline reminder - {{matter_name}} due {{time_until}}. Check app for details.',
     '["matter_name", "time_until"]', true),
    (NULL, 'urgent_matter', 'sms', 'Urgent Matter SMS',
     NULL,
     'APEX URGENT: {{matter_name}} - {{message}}. Reply STOP to unsubscribe.',
     '["matter_name", "message"]', true),
    (NULL, 'payment_received', 'sms', 'Payment Received SMS',
     NULL,
     'APEX: Payment of {{payment_amount}} received for {{client_name}}.',
     '["payment_amount", "client_name"]', true),
    (NULL, 'calendar_reminder', 'sms', 'Calendar Reminder SMS',
     NULL,
     'APEX: Reminder - {{event_title}} at {{event_time}}.',
     '["event_title", "event_time"]', true)
ON CONFLICT (firm_id, type, channel) DO NOTHING;

-- ============================================
-- COMPLETE
-- ============================================

SELECT 'Apex Legal database setup completed successfully!' as status;
