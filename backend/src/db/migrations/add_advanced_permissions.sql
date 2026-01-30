-- Migration: Advanced Permissions System
-- Features:
-- - Custom roles with configurable permissions
-- - Client-level permissions
-- - Permission templates
-- - Permission inheritance configuration
-- - Role permission overrides

-- ============================================
-- CUSTOM ROLES
-- ============================================
-- Allow admins to create custom roles beyond the defaults

CREATE TABLE IF NOT EXISTS custom_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Role identifier (lowercase, no spaces)
    slug VARCHAR(50) NOT NULL,
    
    -- Display info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#64748B',
    icon VARCHAR(50) DEFAULT 'user',
    
    -- Is this a system role (can't be deleted)
    is_system BOOLEAN DEFAULT false,
    
    -- Base role to inherit from (null for fully custom)
    inherits_from VARCHAR(50),
    
    -- Priority for permission resolution (higher = more priority)
    priority INTEGER DEFAULT 50,
    
    -- Active status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    -- Unique slug per firm
    CONSTRAINT unique_role_slug UNIQUE (firm_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_firm ON custom_roles(firm_id);
CREATE INDEX IF NOT EXISTS idx_custom_roles_slug ON custom_roles(slug);

-- ============================================
-- ROLE PERMISSIONS
-- ============================================
-- Configurable permissions per role (overrides defaults)

CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Role this applies to (slug like 'attorney', 'paralegal', or custom role slug)
    role_slug VARCHAR(50) NOT NULL,
    
    -- Permission key (e.g., 'matters:create', 'billing:view')
    permission_key VARCHAR(100) NOT NULL,
    
    -- Permission value
    -- 'granted' - Explicitly granted
    -- 'denied' - Explicitly denied (overrides inheritance)
    -- 'inherited' - Use default/inherited value
    permission_value VARCHAR(20) NOT NULL DEFAULT 'granted',
    
    -- Conditions for this permission (JSON)
    -- e.g., {"ownOnly": true, "maxAmount": 10000}
    conditions JSONB DEFAULT '{}',
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modified_by UUID REFERENCES users(id),
    
    CONSTRAINT unique_role_permission UNIQUE (firm_id, role_slug, permission_key),
    CONSTRAINT valid_permission_value CHECK (permission_value IN ('granted', 'denied', 'inherited'))
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_firm ON role_permissions(firm_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_slug);

-- ============================================
-- CLIENT PERMISSIONS
-- ============================================
-- Control who can access which clients

CREATE TABLE IF NOT EXISTS client_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Who has access (one of these must be set)
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    role_slug VARCHAR(50), -- Grant to entire role
    
    -- Permission level
    permission_level VARCHAR(20) NOT NULL DEFAULT 'view',
    -- 'view' - Can see client info
    -- 'edit' - Can edit client info
    -- 'manage' - Can manage client matters
    -- 'full' - Full control including delete
    -- 'billing' - Can view/edit billing only
    
    -- Granular permissions
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    can_view_matters BOOLEAN DEFAULT true,
    can_create_matters BOOLEAN DEFAULT false,
    can_view_billing BOOLEAN DEFAULT false,
    can_edit_billing BOOLEAN DEFAULT false,
    can_view_documents BOOLEAN DEFAULT true,
    can_share BOOLEAN DEFAULT false,
    
    -- Metadata
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    
    CONSTRAINT valid_permission_level CHECK (permission_level IN ('view', 'edit', 'manage', 'full', 'billing', 'none')),
    CONSTRAINT has_grantee CHECK (user_id IS NOT NULL OR group_id IS NOT NULL OR role_slug IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_client_permissions_client ON client_permissions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_permissions_user ON client_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_client_permissions_group ON client_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_client_permissions_role ON client_permissions(role_slug);

-- ============================================
-- ADD VISIBILITY TO CLIENTS
-- ============================================

DO $$
BEGIN
    -- Client visibility (like matter visibility)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'visibility') THEN
        ALTER TABLE clients ADD COLUMN visibility VARCHAR(20) DEFAULT 'firm_wide';
        RAISE NOTICE 'Added visibility column to clients';
    END IF;

    -- Primary contact user for the client
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'assigned_attorney') THEN
        ALTER TABLE clients ADD COLUMN assigned_attorney UUID REFERENCES users(id);
        RAISE NOTICE 'Added assigned_attorney column to clients';
    END IF;
END $$;

-- ============================================
-- PERMISSION TEMPLATES
-- ============================================
-- Pre-built permission sets for quick application

CREATE TABLE IF NOT EXISTS permission_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Template info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'shield',
    color VARCHAR(20) DEFAULT '#3B82F6',
    
    -- Template type
    template_type VARCHAR(20) NOT NULL DEFAULT 'matter',
    -- 'matter' - For matter permissions
    -- 'client' - For client permissions
    -- 'document' - For document/folder permissions
    -- 'role' - Full role permission set
    
    -- The permissions included in this template (JSON)
    permissions JSONB NOT NULL DEFAULT '[]',
    -- For matter: {"permissionLevel": "edit", "canViewDocuments": true, ...}
    -- For role: [{"key": "matters:create", "value": "granted"}, ...]
    
    -- Is this a system template (can't be deleted)
    is_system BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    CONSTRAINT valid_template_type CHECK (template_type IN ('matter', 'client', 'document', 'role', 'folder'))
);

CREATE INDEX IF NOT EXISTS idx_permission_templates_firm ON permission_templates(firm_id);
CREATE INDEX IF NOT EXISTS idx_permission_templates_type ON permission_templates(template_type);

-- ============================================
-- PERMISSION INHERITANCE RULES
-- ============================================
-- Configure how permissions cascade

CREATE TABLE IF NOT EXISTS permission_inheritance_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Source → Target inheritance
    source_type VARCHAR(30) NOT NULL,
    target_type VARCHAR(30) NOT NULL,
    -- Types: 'firm', 'client', 'matter', 'folder', 'document', 'role', 'group', 'user'
    
    -- Inheritance mode
    inheritance_mode VARCHAR(20) NOT NULL DEFAULT 'inherit',
    -- 'inherit' - Child inherits parent permissions
    -- 'additive' - Child gets parent permissions + its own
    -- 'override' - Child permissions override parent
    -- 'none' - No inheritance (explicit only)
    
    -- Should denials cascade down?
    cascade_denials BOOLEAN DEFAULT true,
    
    -- Priority (higher = evaluated first)
    priority INTEGER DEFAULT 50,
    
    -- Is this rule active?
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_inheritance_rule UNIQUE (firm_id, source_type, target_type),
    CONSTRAINT valid_inheritance_mode CHECK (inheritance_mode IN ('inherit', 'additive', 'override', 'none'))
);

-- ============================================
-- USER PERMISSION OVERRIDES
-- ============================================
-- Per-user overrides that take precedence over role permissions

CREATE TABLE IF NOT EXISTS user_permission_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Permission key (e.g., 'matters:create')
    permission_key VARCHAR(100) NOT NULL,
    
    -- Override value
    permission_value VARCHAR(20) NOT NULL,
    
    -- Reason for override
    reason TEXT,
    
    -- Who set this override
    set_by UUID REFERENCES users(id),
    
    -- Optional expiration
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_override UNIQUE (user_id, permission_key),
    CONSTRAINT valid_override_value CHECK (permission_value IN ('granted', 'denied'))
);

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user ON user_permission_overrides(user_id);

-- ============================================
-- PERMISSION DEFINITIONS
-- ============================================
-- Master list of all available permissions

CREATE TABLE IF NOT EXISTS permission_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Permission key (e.g., 'matters:create')
    permission_key VARCHAR(100) UNIQUE NOT NULL,
    
    -- Category for grouping (e.g., 'matters', 'billing', 'admin')
    category VARCHAR(50) NOT NULL,
    
    -- Display info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Is this a sensitive/dangerous permission?
    is_sensitive BOOLEAN DEFAULT false,
    
    -- Required role level (minimum role needed to even see this option)
    min_role_level INTEGER DEFAULT 0,
    
    -- Dependencies (other permissions this requires)
    requires TEXT[] DEFAULT '{}',
    
    -- Is this permission active?
    is_active BOOLEAN DEFAULT true,
    
    -- Sort order within category
    sort_order INTEGER DEFAULT 0
);

-- Insert default permission definitions
INSERT INTO permission_definitions (permission_key, category, name, description, is_sensitive, sort_order) VALUES
-- Firm permissions
('firm:manage', 'admin', 'Manage Firm Settings', 'Access and modify firm-wide settings', true, 10),
('firm:billing', 'admin', 'Manage Firm Billing', 'Manage firm subscription and billing', true, 20),
('firm:delete', 'admin', 'Delete Firm', 'Permanently delete the firm account', true, 30),

-- User management
('users:invite', 'admin', 'Invite Users', 'Send invitations to new team members', false, 10),
('users:manage', 'admin', 'Manage Users', 'Edit user profiles and settings', true, 20),
('users:delete', 'admin', 'Delete Users', 'Remove users from the firm', true, 30),
('users:view_rates', 'admin', 'View Billing Rates', 'See hourly rates for all users', false, 40),
('users:edit_rates', 'admin', 'Edit Billing Rates', 'Modify hourly rates for users', true, 50),

-- Groups
('groups:manage', 'admin', 'Manage Groups', 'Create and manage team groups', false, 10),
('groups:assign', 'admin', 'Assign Group Members', 'Add/remove users from groups', false, 20),

-- Matters
('matters:create', 'matters', 'Create Matters', 'Create new matters', false, 10),
('matters:view', 'matters', 'View Matters', 'View matter details', false, 20),
('matters:view_restricted', 'matters', 'View Restricted Matters', 'View matters marked as restricted', false, 25),
('matters:edit', 'matters', 'Edit Matters', 'Modify matter information', false, 30),
('matters:delete', 'matters', 'Delete Matters', 'Delete or archive matters', true, 40),
('matters:assign', 'matters', 'Assign Team Members', 'Add team members to matters', false, 50),
('matters:manage_permissions', 'matters', 'Manage Matter Permissions', 'Control who can access matters', false, 60),
('matters:close', 'matters', 'Close Matters', 'Close/reopen matters', false, 70),
('matters:transfer', 'matters', 'Transfer Matters', 'Transfer matters between clients', true, 80),

-- Clients
('clients:create', 'clients', 'Create Clients', 'Create new client records', false, 10),
('clients:view', 'clients', 'View Clients', 'View client information', false, 20),
('clients:view_restricted', 'clients', 'View Restricted Clients', 'View clients marked as restricted', false, 25),
('clients:edit', 'clients', 'Edit Clients', 'Modify client information', false, 30),
('clients:delete', 'clients', 'Delete Clients', 'Delete client records', true, 40),
('clients:merge', 'clients', 'Merge Clients', 'Merge duplicate client records', true, 50),
('clients:view_confidential', 'clients', 'View Confidential Info', 'View SSN, financial details', true, 60),

-- Billing
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

-- Documents
('documents:upload', 'documents', 'Upload Documents', 'Upload new documents', false, 10),
('documents:view', 'documents', 'View Documents', 'View and download documents', false, 20),
('documents:view_confidential', 'documents', 'View Confidential', 'Access confidential documents', false, 25),
('documents:edit', 'documents', 'Edit Documents', 'Edit and version documents', false, 30),
('documents:delete', 'documents', 'Delete Documents', 'Delete documents', true, 40),
('documents:share_external', 'documents', 'Share External', 'Share documents outside firm', false, 50),
('documents:manage_folders', 'documents', 'Manage Folders', 'Create/delete folders', false, 60),
('documents:manage_permissions', 'documents', 'Manage Doc Permissions', 'Set document access rights', false, 70),

-- Calendar
('calendar:create', 'calendar', 'Create Events', 'Create calendar events', false, 10),
('calendar:view', 'calendar', 'View Calendar', 'View calendar and events', false, 20),
('calendar:view_all', 'calendar', 'View All Calendars', 'See all users calendars', false, 25),
('calendar:edit', 'calendar', 'Edit Events', 'Modify calendar events', false, 30),
('calendar:delete', 'calendar', 'Delete Events', 'Remove calendar events', false, 40),
('calendar:manage_deadlines', 'calendar', 'Manage Deadlines', 'Set and modify legal deadlines', false, 50),

-- Reports
('reports:view', 'reports', 'View Reports', 'Access reporting dashboard', false, 10),
('reports:view_financial', 'reports', 'View Financial Reports', 'Access financial/revenue reports', false, 20),
('reports:view_productivity', 'reports', 'View Productivity', 'View user productivity metrics', false, 30),
('reports:create', 'reports', 'Create Reports', 'Generate custom reports', false, 40),
('reports:export', 'reports', 'Export Reports', 'Export report data', false, 50),
('reports:schedule', 'reports', 'Schedule Reports', 'Set up automated reports', false, 60),

-- Integrations
('integrations:view', 'integrations', 'View Integrations', 'See connected integrations', false, 10),
('integrations:manage', 'integrations', 'Manage Integrations', 'Connect/disconnect integrations', true, 20),
('integrations:sync', 'integrations', 'Trigger Sync', 'Manually sync integrated data', false, 30),

-- AI Features
('ai:use_assistant', 'ai', 'Use AI Assistant', 'Chat with AI assistant', false, 10),
('ai:use_drafting', 'ai', 'AI Document Drafting', 'Generate documents with AI', false, 20),
('ai:use_analysis', 'ai', 'AI Analysis', 'Use AI for analysis tasks', false, 30),
('ai:view_suggestions', 'ai', 'View AI Suggestions', 'See AI-generated suggestions', false, 40),
('ai:train_model', 'ai', 'Train AI', 'Provide feedback to improve AI', false, 50),

-- Audit & Security
('audit:view', 'security', 'View Audit Logs', 'Access activity audit logs', true, 10),
('audit:export', 'security', 'Export Audit Logs', 'Export audit log data', true, 20),
('security:manage_sessions', 'security', 'Manage Sessions', 'Force logout sessions', true, 30),
('security:manage_2fa', 'security', 'Manage 2FA', 'Configure 2FA requirements', true, 40),
('security:manage_api_keys', 'security', 'Manage API Keys', 'Create/revoke API keys', true, 50)

ON CONFLICT (permission_key) DO NOTHING;

-- ============================================
-- SEED DEFAULT CUSTOM ROLES
-- ============================================
-- Insert system roles for each firm (trigger on firm creation)

CREATE OR REPLACE FUNCTION seed_default_roles()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert default system roles for the new firm
    INSERT INTO custom_roles (firm_id, slug, name, description, color, icon, is_system, priority) VALUES
    (NEW.id, 'owner', 'Owner', 'Full access to all features and settings', '#F59E0B', 'crown', true, 100),
    (NEW.id, 'admin', 'Administrator', 'Administrative access to firm settings', '#8B5CF6', 'shield', true, 90),
    (NEW.id, 'attorney', 'Attorney', 'Standard attorney with case management', '#3B82F6', 'briefcase', true, 70),
    (NEW.id, 'paralegal', 'Paralegal', 'Paralegal with document and case support', '#10B981', 'file-text', true, 60),
    (NEW.id, 'staff', 'Staff', 'General staff with limited access', '#64748B', 'user', true, 40),
    (NEW.id, 'billing', 'Billing Specialist', 'Focus on billing and financial operations', '#EC4899', 'credit-card', true, 50),
    (NEW.id, 'readonly', 'Read Only', 'View-only access to permitted items', '#94A3B8', 'eye', true, 10);

    -- Insert default inheritance rules
    INSERT INTO permission_inheritance_rules (firm_id, source_type, target_type, inheritance_mode, priority) VALUES
    (NEW.id, 'client', 'matter', 'additive', 80),
    (NEW.id, 'matter', 'document', 'inherit', 70),
    (NEW.id, 'folder', 'document', 'inherit', 60),
    (NEW.id, 'group', 'user', 'additive', 90),
    (NEW.id, 'role', 'user', 'inherit', 50);

    -- Insert default permission templates
    INSERT INTO permission_templates (firm_id, name, description, template_type, permissions, icon, color, is_system) VALUES
    (NEW.id, 'Full Access', 'Complete access to all features', 'matter', 
     '{"permissionLevel": "admin", "canViewDocuments": true, "canViewNotes": true, "canEdit": true}'::jsonb,
     'shield-check', '#10B981', true),
    (NEW.id, 'Read Only', 'View-only access', 'matter',
     '{"permissionLevel": "view", "canViewDocuments": true, "canViewNotes": true, "canEdit": false}'::jsonb,
     'eye', '#64748B', true),
    (NEW.id, 'Collaborator', 'Can view and edit but not manage', 'matter',
     '{"permissionLevel": "edit", "canViewDocuments": true, "canViewNotes": true, "canEdit": true}'::jsonb,
     'users', '#3B82F6', true),
    (NEW.id, 'Billing Only', 'Access to billing information only', 'matter',
     '{"permissionLevel": "view", "canViewDocuments": false, "canViewNotes": false, "canEdit": false, "canViewBilling": true}'::jsonb,
     'credit-card', '#EC4899', true);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new firms (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_seed_default_roles') THEN
        CREATE TRIGGER trigger_seed_default_roles
            AFTER INSERT ON firms
            FOR EACH ROW
            EXECUTE FUNCTION seed_default_roles();
    END IF;
END $$;

-- ============================================
-- HELPER VIEWS
-- ============================================

-- View: Effective user permissions (combines role + overrides)
CREATE OR REPLACE VIEW effective_user_permissions AS
SELECT 
    u.id as user_id,
    u.firm_id,
    u.role,
    pd.permission_key,
    pd.category,
    pd.name as permission_name,
    COALESCE(
        upo.permission_value,
        rp.permission_value,
        CASE 
            WHEN u.role = 'owner' THEN 'granted'
            ELSE 'denied'
        END
    ) as effective_value,
    CASE 
        WHEN upo.permission_value IS NOT NULL THEN 'user_override'
        WHEN rp.permission_value IS NOT NULL THEN 'role_permission'
        ELSE 'default'
    END as source
FROM users u
CROSS JOIN permission_definitions pd
LEFT JOIN user_permission_overrides upo 
    ON u.id = upo.user_id 
    AND pd.permission_key = upo.permission_key
    AND (upo.expires_at IS NULL OR upo.expires_at > NOW())
LEFT JOIN role_permissions rp 
    ON u.firm_id = rp.firm_id 
    AND u.role = rp.role_slug 
    AND pd.permission_key = rp.permission_key
WHERE pd.is_active = true;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE custom_roles IS 'Firm-specific custom roles with configurable permissions';
COMMENT ON TABLE role_permissions IS 'Per-role permission settings, overriding defaults';
COMMENT ON TABLE client_permissions IS 'Per-client access control (like matter permissions)';
COMMENT ON TABLE permission_templates IS 'Pre-built permission sets for quick application';
COMMENT ON TABLE permission_inheritance_rules IS 'How permissions cascade between entities';
COMMENT ON TABLE user_permission_overrides IS 'Per-user permission exceptions';
COMMENT ON TABLE permission_definitions IS 'Master list of all available permissions';

SELECT 'Advanced permissions migration completed successfully!' as status;
