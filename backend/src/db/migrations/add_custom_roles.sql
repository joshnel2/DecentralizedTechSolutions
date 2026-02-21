-- ============================================
-- CUSTOM ROLES & FLEXIBLE PERMISSIONS
-- ============================================
-- Allows firms to customize role permissions and create custom roles.
-- Default roles are seeded per-firm and can be modified.
-- Per-user overrides allow granting/revoking individual permissions.

-- Firm-specific roles (seeded with defaults, fully customizable)
CREATE TABLE IF NOT EXISTS firm_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,              -- slug: 'attorney', 'senior_associate'
    display_name VARCHAR(100) NOT NULL,     -- 'Attorney', 'Senior Associate'
    description TEXT,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    is_system BOOLEAN DEFAULT false,        -- true = can't be deleted (owner, admin)
    is_editable BOOLEAN DEFAULT true,       -- false = owner role can't be edited
    is_default BOOLEAN DEFAULT false,       -- default role for new invited users
    color VARCHAR(20) DEFAULT '#6B7280',
    sort_order INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, name)
);

-- Per-user permission overrides (grant or revoke on top of role)
CREATE TABLE IF NOT EXISTS user_permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(100) NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('grant', 'revoke')),
    granted_by UUID REFERENCES users(id),
    reason TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,    -- NULL = permanent
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, user_id, permission)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_firm_roles_firm_id ON firm_roles(firm_id);
CREATE INDEX IF NOT EXISTS idx_firm_roles_lookup ON firm_roles(firm_id, name);
CREATE INDEX IF NOT EXISTS idx_user_perm_overrides_user ON user_permission_overrides(firm_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_perm_overrides_expiry ON user_permission_overrides(expires_at) WHERE expires_at IS NOT NULL;

-- Trigger for updated_at (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_firm_roles_updated_at'
    ) THEN
        CREATE TRIGGER update_firm_roles_updated_at 
            BEFORE UPDATE ON firm_roles 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Update users table to allow custom role values (remove the CHECK constraint)
-- The old constraint only allowed: owner, admin, attorney, paralegal, staff, billing, readonly
-- We need to allow any role name since firms can create custom roles
DO $$
BEGIN
    -- Drop the old constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'valid_role' AND table_name = 'users'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT valid_role;
    END IF;
    
    -- Add a new constraint that's more flexible:
    -- role must match either a built-in role OR a custom role in the firm_roles table
    -- For simplicity, we just enforce non-empty string (the application layer validates against firm_roles)
    ALTER TABLE users ADD CONSTRAINT valid_role CHECK (role IS NOT NULL AND LENGTH(role) > 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
