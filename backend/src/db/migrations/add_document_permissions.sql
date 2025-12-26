-- Migration: Document Permissions & Privacy System
-- Features:
-- - Per-folder permissions
-- - Per-document permissions  
-- - Private files (only owner can see)
-- - Word Online integration tracking

-- ============================================
-- FOLDER PERMISSIONS
-- ============================================
-- Control who can access folders and what they can do

CREATE TABLE IF NOT EXISTS folder_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- What folder this applies to
    folder_path TEXT NOT NULL,
    drive_id UUID REFERENCES drive_configurations(id) ON DELETE CASCADE,
    
    -- Who has access (one of these)
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    
    -- Permission level
    permission_level VARCHAR(20) NOT NULL DEFAULT 'view',
    -- 'view' - Can see files, download
    -- 'edit' - Can edit files, create new files
    -- 'manage' - Can set permissions on this folder
    -- 'full' - Full control including delete
    
    -- Inherited or explicit
    is_inherited BOOLEAN DEFAULT false,
    inherited_from TEXT, -- Path of parent folder this was inherited from
    
    -- Specific permissions (granular control)
    can_view BOOLEAN DEFAULT true,
    can_download BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_create BOOLEAN DEFAULT false,
    can_share BOOLEAN DEFAULT false,
    can_manage_permissions BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_permission_level CHECK (permission_level IN ('view', 'edit', 'manage', 'full', 'none')),
    CONSTRAINT has_grantee CHECK (user_id IS NOT NULL OR group_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_folder_permissions_folder ON folder_permissions(folder_path);
CREATE INDEX IF NOT EXISTS idx_folder_permissions_user ON folder_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_folder_permissions_group ON folder_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_folder_permissions_firm ON folder_permissions(firm_id);

-- ============================================
-- DOCUMENT PERMISSIONS
-- ============================================
-- Override folder permissions at document level

CREATE TABLE IF NOT EXISTS document_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Who has access (one of these)
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    
    -- Permission level
    permission_level VARCHAR(20) NOT NULL DEFAULT 'view',
    
    -- Specific permissions
    can_view BOOLEAN DEFAULT true,
    can_download BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_share BOOLEAN DEFAULT false,
    can_manage_permissions BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration
    
    CONSTRAINT valid_permission_level CHECK (permission_level IN ('view', 'edit', 'manage', 'full', 'none')),
    CONSTRAINT has_grantee CHECK (user_id IS NOT NULL OR group_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_document_permissions_document ON document_permissions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_permissions_user ON document_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_document_permissions_group ON document_permissions(group_id);

-- ============================================
-- ADD PRIVACY COLUMNS TO DOCUMENTS
-- ============================================

DO $$
BEGIN
    -- Is this a private document (only owner can see)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'is_private') THEN
        ALTER TABLE documents ADD COLUMN is_private BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_private column to documents';
    END IF;

    -- Privacy level (more granular than just private)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'privacy_level') THEN
        ALTER TABLE documents ADD COLUMN privacy_level VARCHAR(20) DEFAULT 'private';
        -- 'private' - Only owner + admins can see (DEFAULT - most secure)
        -- 'shared' - Owner + admins + explicitly shared users
        -- 'team' - Owner + admins + assigned matter team
        -- 'firm' - Everyone in firm can see
        RAISE NOTICE 'Added privacy_level column to documents';
    END IF;

    -- Owner of the document (for private files)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'owner_id') THEN
        ALTER TABLE documents ADD COLUMN owner_id UUID REFERENCES users(id);
        RAISE NOTICE 'Added owner_id column to documents';
    END IF;

    -- Word Online editing URL
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'word_online_url') THEN
        ALTER TABLE documents ADD COLUMN word_online_url TEXT;
        RAISE NOTICE 'Added word_online_url column to documents';
    END IF;

    -- OneDrive/SharePoint item ID for Word Online
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'graph_item_id') THEN
        ALTER TABLE documents ADD COLUMN graph_item_id VARCHAR(255);
        RAISE NOTICE 'Added graph_item_id column to documents';
    END IF;

    -- Last edited in Word Online
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'last_online_edit') THEN
        ALTER TABLE documents ADD COLUMN last_online_edit TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added last_online_edit column to documents';
    END IF;

    -- Currently editing users (for co-authoring indicator)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'active_editors') THEN
        ALTER TABLE documents ADD COLUMN active_editors JSONB DEFAULT '[]';
        RAISE NOTICE 'Added active_editors column to documents';
    END IF;

END $$;

CREATE INDEX IF NOT EXISTS idx_documents_is_private ON documents(is_private) WHERE is_private = true;
CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_privacy_level ON documents(privacy_level);

-- ============================================
-- WORD ONLINE SESSIONS
-- ============================================
-- Track active Word Online editing sessions

CREATE TABLE IF NOT EXISTS word_online_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(255),
    
    -- Session info
    session_id VARCHAR(255),
    graph_item_id VARCHAR(255),
    edit_url TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    
    -- Changes made
    changes_count INTEGER DEFAULT 0,
    
    CONSTRAINT valid_status CHECK (status IN ('active', 'idle', 'ended', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_word_sessions_document ON word_online_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_word_sessions_user ON word_online_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_word_sessions_active ON word_online_sessions(status) WHERE status = 'active';

-- ============================================
-- USER DOCUMENT PREFERENCES
-- ============================================
-- Personal settings for document privacy defaults

CREATE TABLE IF NOT EXISTS user_document_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Default privacy for new documents
    default_privacy VARCHAR(20) DEFAULT 'inherited',
    
    -- Auto-private certain folders
    private_folder_patterns TEXT[], -- e.g., ['Personal/*', 'Private/*']
    
    -- Notification preferences
    notify_on_access BOOLEAN DEFAULT false, -- Notify when someone accesses your private files
    notify_on_edit BOOLEAN DEFAULT true,    -- Notify when someone edits a shared file
    
    -- Word Online preferences
    prefer_word_online BOOLEAN DEFAULT true,
    auto_save_interval INTEGER DEFAULT 30, -- seconds
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_prefs UNIQUE (user_id)
);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE folder_permissions IS 'Per-folder access control with inheritance';
COMMENT ON TABLE document_permissions IS 'Per-document access control overrides';
COMMENT ON TABLE word_online_sessions IS 'Track active Word Online co-editing sessions';
COMMENT ON TABLE user_document_preferences IS 'User personal document privacy settings';

COMMENT ON COLUMN documents.is_private IS 'If true, only the owner can see this document';
COMMENT ON COLUMN documents.privacy_level IS 'inherited=use folder, private=owner only, restricted=explicit only, firm=everyone';
COMMENT ON COLUMN documents.active_editors IS 'JSON array of users currently editing in Word Online';

SELECT 'Document permissions migration completed successfully!' as status;
