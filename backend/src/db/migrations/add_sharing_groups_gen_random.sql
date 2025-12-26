-- Migration: Flexible Sharing Groups
-- Uses gen_random_uuid() for UUID generation (PostgreSQL 13+)

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sharing_groups_firm ON sharing_groups(firm_id);
CREATE INDEX IF NOT EXISTS idx_sharing_groups_active ON sharing_groups(firm_id, is_active) WHERE is_active = true;

-- ============================================
-- SHARING GROUP MEMBERS
-- ============================================

CREATE TABLE IF NOT EXISTS sharing_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sharing_group_id UUID NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    role VARCHAR(20) DEFAULT 'member',
    permission_override VARCHAR(20),
    can_hide_items BOOLEAN DEFAULT true,
    
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    invited_by UUID REFERENCES users(id),
    
    CONSTRAINT unique_group_member UNIQUE (sharing_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sharing_group_members_user ON sharing_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sharing_group_members_group ON sharing_group_members(sharing_group_id);

-- ============================================
-- SHARING GROUP HIDDEN ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS sharing_group_hidden_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sharing_group_id UUID NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    item_type VARCHAR(50) NOT NULL,
    item_id UUID NOT NULL,
    reason VARCHAR(255),
    
    hidden_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_hidden_item UNIQUE (sharing_group_id, user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_hidden_items_user ON sharing_group_hidden_items(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_items_item ON sharing_group_hidden_items(item_type, item_id);

-- ============================================
-- USER SHARING PREFERENCES
-- ============================================

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
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_sharing_prefs UNIQUE (user_id)
);

-- ============================================
-- ADD SHARING SETTINGS TO FIRMS
-- ============================================

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
-- ADD MISSING COLUMNS TO DOCUMENTS TABLE
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'owner_id') THEN
        ALTER TABLE documents ADD COLUMN owner_id UUID REFERENCES users(id);
        RAISE NOTICE 'Added owner_id column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'privacy_level') THEN
        ALTER TABLE documents ADD COLUMN privacy_level VARCHAR(20) DEFAULT 'private';
        RAISE NOTICE 'Added privacy_level column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'content_hash') THEN
        ALTER TABLE documents ADD COLUMN content_hash VARCHAR(64);
        RAISE NOTICE 'Added content_hash column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'graph_item_id') THEN
        ALTER TABLE documents ADD COLUMN graph_item_id VARCHAR(255);
        RAISE NOTICE 'Added graph_item_id column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'word_online_url') THEN
        ALTER TABLE documents ADD COLUMN word_online_url TEXT;
        RAISE NOTICE 'Added word_online_url column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'last_online_edit') THEN
        ALTER TABLE documents ADD COLUMN last_online_edit TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added last_online_edit column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'active_editors') THEN
        ALTER TABLE documents ADD COLUMN active_editors JSONB DEFAULT '[]';
        RAISE NOTICE 'Added active_editors column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'version_count') THEN
        ALTER TABLE documents ADD COLUMN version_count INTEGER DEFAULT 1;
        RAISE NOTICE 'Added version_count column to documents';
    END IF;
END $$;

-- ============================================
-- DOCUMENT VERSIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    version_number INTEGER NOT NULL,
    version_label VARCHAR(100),
    
    content_text TEXT,
    content_hash VARCHAR(64),
    
    change_summary TEXT,
    change_type VARCHAR(20) DEFAULT 'edit',
    
    word_count INTEGER DEFAULT 0,
    character_count INTEGER DEFAULT 0,
    words_added INTEGER DEFAULT 0,
    words_removed INTEGER DEFAULT 0,
    file_size BIGINT,
    
    created_by UUID REFERENCES users(id),
    created_by_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    source VARCHAR(50) DEFAULT 'apex',
    
    CONSTRAINT unique_doc_version UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_firm ON document_versions(firm_id);

-- ============================================
-- WORD ONLINE SESSIONS TABLE
-- ============================================

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
    
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    
    changes_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_word_sessions_document ON word_online_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_word_sessions_user ON word_online_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_word_sessions_active ON word_online_sessions(status) WHERE status = 'active';

-- ============================================
-- DOCUMENT PERMISSIONS TABLE
-- ============================================

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
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_document_permissions_document ON document_permissions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_permissions_user ON document_permissions(user_id);

-- ============================================
-- DOCUMENT ACTIVITIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS document_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    action VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id),
    user_name VARCHAR(255),
    
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_activities_doc ON document_activities(document_id);
CREATE INDEX IF NOT EXISTS idx_document_activities_action ON document_activities(action);

-- ============================================
-- DONE
-- ============================================

SELECT 'All migrations completed successfully!' as status;
