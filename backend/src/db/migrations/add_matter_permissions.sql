-- Migration: Add Matter Permissions System (Clio-like visibility)
-- Run this migration on your Azure PostgreSQL database

-- 1. Add visibility column to matters table
-- 'firm_wide' = everyone can see (default for new matters)
-- 'restricted' = only selected users/groups can see
ALTER TABLE matters ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'firm_wide';

-- Add constraint to ensure valid visibility values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_visibility'
    ) THEN
        ALTER TABLE matters ADD CONSTRAINT valid_visibility 
            CHECK (visibility IN ('firm_wide', 'restricted'));
    END IF;
END $$;

-- Create index for faster visibility filtering
CREATE INDEX IF NOT EXISTS idx_matters_visibility ON matters(visibility);

-- 2. Create matter_permissions table
-- This tracks which users and groups have access to restricted matters
CREATE TABLE IF NOT EXISTS matter_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    permission_level VARCHAR(20) DEFAULT 'view',
    can_view_documents BOOLEAN DEFAULT true,
    can_view_notes BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Either user_id OR group_id must be set, but not both
    CONSTRAINT user_or_group CHECK (
        (user_id IS NOT NULL AND group_id IS NULL) OR
        (user_id IS NULL AND group_id IS NOT NULL)
    ),
    
    -- Unique constraint to prevent duplicate permissions
    CONSTRAINT unique_user_matter UNIQUE (matter_id, user_id),
    CONSTRAINT unique_group_matter UNIQUE (matter_id, group_id),
    
    -- Valid permission levels
    CONSTRAINT valid_permission_level CHECK (permission_level IN ('view', 'edit', 'admin'))
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_matter_permissions_matter_id ON matter_permissions(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_permissions_user_id ON matter_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_matter_permissions_group_id ON matter_permissions(group_id);

-- 3. Create audit log entries for permission changes
-- Uses existing audit_logs table structure

COMMENT ON COLUMN matters.visibility IS 'Matter visibility: firm_wide (all users) or restricted (selected users/groups only)';
COMMENT ON TABLE matter_permissions IS 'Tracks user and group access permissions for restricted matters (max 20 per matter)';
