-- Migration: Flexible Sharing Groups
-- Allows users to create groups where all members automatically share everything
-- Similar to Clio's practice groups feature

-- ============================================
-- SHARING GROUPS
-- ============================================
-- Groups where members share all their work with each other

CREATE TABLE IF NOT EXISTS sharing_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Group info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3b82f6', -- Hex color for UI
    icon VARCHAR(50) DEFAULT 'users', -- Icon name
    
    -- Sharing settings
    share_documents BOOLEAN DEFAULT true,    -- Auto-share documents
    share_matters BOOLEAN DEFAULT true,      -- Auto-share matters
    share_clients BOOLEAN DEFAULT true,      -- Auto-share clients
    share_calendar BOOLEAN DEFAULT true,     -- Auto-share calendar events
    share_tasks BOOLEAN DEFAULT true,        -- Auto-share tasks
    share_time_entries BOOLEAN DEFAULT false, -- Auto-share time entries (sensitive)
    share_notes BOOLEAN DEFAULT true,        -- Auto-share notes
    
    -- Default permission level for shared items
    default_permission_level VARCHAR(20) DEFAULT 'view',
    -- 'view' - Can see/read items
    -- 'edit' - Can modify items
    -- 'full' - Full access including delete
    
    -- Allow members to share outside the group
    allow_external_sharing BOOLEAN DEFAULT true,
    
    -- Admin settings
    require_approval_to_join BOOLEAN DEFAULT false,
    allow_member_invite BOOLEAN DEFAULT true,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sharing_groups_firm ON sharing_groups(firm_id);
CREATE INDEX IF NOT EXISTS idx_sharing_groups_active ON sharing_groups(firm_id, is_active) WHERE is_active = true;

-- ============================================
-- SHARING GROUP MEMBERS
-- ============================================

CREATE TABLE IF NOT EXISTS sharing_group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sharing_group_id UUID NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role in the group
    role VARCHAR(20) DEFAULT 'member',
    -- 'owner' - Created the group, full control
    -- 'admin' - Can manage members and settings
    -- 'member' - Regular member
    
    -- Override default permissions for this member
    permission_override VARCHAR(20), -- NULL means use group default
    
    -- Member can hide items from group (opt-out per item)
    can_hide_items BOOLEAN DEFAULT true,
    
    -- Metadata
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    invited_by UUID REFERENCES users(id),
    
    CONSTRAINT unique_group_member UNIQUE (sharing_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sharing_group_members_user ON sharing_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sharing_group_members_group ON sharing_group_members(sharing_group_id);

-- ============================================
-- SHARING GROUP HIDDEN ITEMS
-- ============================================
-- Items that a user has explicitly hidden from their sharing group

CREATE TABLE IF NOT EXISTS sharing_group_hidden_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sharing_group_id UUID NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- What is being hidden
    item_type VARCHAR(50) NOT NULL, -- 'document', 'matter', 'client', 'calendar_event', 'task', 'note'
    item_id UUID NOT NULL,
    
    -- Reason (optional)
    reason VARCHAR(255),
    
    hidden_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_hidden_item UNIQUE (sharing_group_id, user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_hidden_items_user ON sharing_group_hidden_items(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_items_item ON sharing_group_hidden_items(item_type, item_id);

-- ============================================
-- USER SHARING PREFERENCES
-- ============================================
-- User-level settings for how they want to share

CREATE TABLE IF NOT EXISTS user_sharing_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Default sharing behavior for new items
    auto_share_documents BOOLEAN DEFAULT true,
    auto_share_matters BOOLEAN DEFAULT false, -- Matters are more sensitive
    auto_share_calendar BOOLEAN DEFAULT true,
    auto_share_tasks BOOLEAN DEFAULT true,
    auto_share_notes BOOLEAN DEFAULT true,
    
    -- Privacy defaults
    default_document_privacy VARCHAR(20) DEFAULT 'team', -- 'private', 'team', 'firm'
    default_matter_visibility VARCHAR(20) DEFAULT 'restricted', -- 'firm_wide', 'restricted'
    
    -- Notification settings
    notify_on_share_access BOOLEAN DEFAULT false, -- Notify when someone accesses shared items
    notify_on_group_activity BOOLEAN DEFAULT true, -- Notify on sharing group activity
    
    -- Quick share favorites (user IDs they frequently share with)
    quick_share_users UUID[] DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_sharing_prefs UNIQUE (user_id)
);

-- ============================================
-- FIRM SHARING SETTINGS
-- ============================================
-- Firm-wide sharing policies set by admins

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'firms' AND column_name = 'sharing_settings') THEN
        ALTER TABLE firms ADD COLUMN sharing_settings JSONB DEFAULT '{
            "allowSharingGroups": true,
            "allowUserToUserSharing": true,
            "allowExternalSharing": false,
            "requireApprovalForExternalShare": true,
            "defaultDocumentPrivacy": "team",
            "defaultMatterVisibility": "restricted",
            "maxSharingGroupSize": 50,
            "allowTimeEntrySharing": false,
            "enforceMatterPermissions": true
        }';
        RAISE NOTICE 'Added sharing_settings column to firms';
    END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE sharing_groups IS 'Flexible groups where members auto-share work with each other';
COMMENT ON TABLE sharing_group_members IS 'Members of sharing groups with their roles';
COMMENT ON TABLE sharing_group_hidden_items IS 'Items users have opted out of sharing with their group';
COMMENT ON TABLE user_sharing_preferences IS 'Individual user preferences for sharing behavior';

COMMENT ON COLUMN sharing_groups.share_time_entries IS 'Time entries are sensitive - disabled by default';
COMMENT ON COLUMN sharing_groups.default_permission_level IS 'What access group members get: view, edit, or full';
COMMENT ON COLUMN user_sharing_preferences.quick_share_users IS 'Users this person frequently shares with for quick access';

SELECT 'Sharing groups migration completed successfully!' as status;
