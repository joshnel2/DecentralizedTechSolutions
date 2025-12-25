-- Migration: Drive Integration System
-- Provides Clio-like drive integration but 10x better:
-- - Automatic versioning with user attribution
-- - Smart document locking (no stuck locks)
-- - Built-in version comparison/redlining
-- - Firm-wide and personal drive support

-- ============================================
-- DRIVE CONFIGURATIONS
-- ============================================
-- Stores firm-level and user-level drive configurations
-- Admins configure firm drive, users can optionally add personal drives

CREATE TABLE IF NOT EXISTS drive_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = firm-wide drive
    
    -- Drive Settings
    name VARCHAR(255) NOT NULL, -- e.g., "Firm Documents", "My Personal Drive"
    drive_type VARCHAR(50) NOT NULL DEFAULT 'local', -- 'local', 'onedrive', 'google_drive', 'dropbox', 'sharepoint', 'network'
    root_path TEXT NOT NULL, -- Root path/URL for the drive
    
    -- Sync Settings
    sync_enabled BOOLEAN DEFAULT true,
    sync_interval_minutes INTEGER DEFAULT 5, -- How often to check for changes
    sync_direction VARCHAR(20) DEFAULT 'bidirectional', -- 'bidirectional', 'to_apex', 'from_apex'
    auto_version_on_save BOOLEAN DEFAULT true, -- Create version on every save
    
    -- Conflict Resolution
    conflict_resolution VARCHAR(30) DEFAULT 'ask_user', -- 'ask_user', 'keep_both', 'newest_wins', 'apex_wins', 'external_wins'
    
    -- Access Control
    is_default BOOLEAN DEFAULT false, -- Default drive for new documents
    allow_personal_folders BOOLEAN DEFAULT true, -- Allow users to create personal folders
    
    -- Status
    status VARCHAR(30) DEFAULT 'active', -- 'active', 'disconnected', 'error', 'syncing'
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_sync_status VARCHAR(50),
    last_error TEXT,
    
    -- OAuth tokens for cloud drives
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    settings JSONB DEFAULT '{}', -- Additional provider-specific settings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    CONSTRAINT valid_drive_type CHECK (drive_type IN ('local', 'network', 'onedrive', 'google_drive', 'dropbox', 'sharepoint', 'box', 's3')),
    CONSTRAINT valid_sync_direction CHECK (sync_direction IN ('bidirectional', 'to_apex', 'from_apex')),
    CONSTRAINT valid_conflict_resolution CHECK (conflict_resolution IN ('ask_user', 'keep_both', 'newest_wins', 'apex_wins', 'external_wins')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'disconnected', 'error', 'syncing', 'pending_auth'))
);

-- Unique constraint: only one default drive per firm
CREATE UNIQUE INDEX idx_drive_config_default_firm ON drive_configurations (firm_id) WHERE is_default = true AND user_id IS NULL;

-- Index for efficient lookups
CREATE INDEX idx_drive_config_firm_id ON drive_configurations(firm_id);
CREATE INDEX idx_drive_config_user_id ON drive_configurations(user_id);

-- ============================================
-- DOCUMENT VERSIONS
-- ============================================
-- Full version history for every document
-- Automatic versioning on every save with user attribution

CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Version Info
    version_number INTEGER NOT NULL,
    version_label VARCHAR(100), -- Optional: "Draft", "Final", "Client Review", etc.
    
    -- Content
    content_text TEXT, -- Extracted text for comparison
    content_hash VARCHAR(64), -- SHA-256 hash for change detection
    file_path TEXT, -- Path to version file (if stored)
    file_size BIGINT,
    
    -- Change Info
    change_summary TEXT, -- AI-generated or user-provided summary of changes
    change_type VARCHAR(30) DEFAULT 'edit', -- 'create', 'edit', 'restore', 'merge', 'auto_save'
    
    -- Word/character counts for diff stats
    word_count INTEGER,
    character_count INTEGER,
    words_added INTEGER DEFAULT 0,
    words_removed INTEGER DEFAULT 0,
    
    -- Attribution
    created_by UUID REFERENCES users(id),
    created_by_name VARCHAR(255), -- Denormalized for quick display
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Source info
    source VARCHAR(30) DEFAULT 'apex', -- 'apex', 'external_sync', 'upload', 'ai_generated'
    external_modified_at TIMESTAMP WITH TIME ZONE, -- When modified externally (for sync)
    
    CONSTRAINT valid_change_type CHECK (change_type IN ('create', 'edit', 'restore', 'merge', 'auto_save', 'rename', 'sync')),
    CONSTRAINT valid_source CHECK (source IN ('apex', 'external_sync', 'upload', 'ai_generated', 'template'))
);

-- Index for efficient version lookups
CREATE INDEX idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX idx_document_versions_created_at ON document_versions(created_at DESC);
CREATE INDEX idx_document_versions_created_by ON document_versions(created_by);
CREATE UNIQUE INDEX idx_document_versions_unique ON document_versions(document_id, version_number);

-- ============================================
-- DOCUMENT LOCKS
-- ============================================
-- Prevents editing conflicts - auto-expires to avoid stuck locks (unlike Clio!)

CREATE TABLE IF NOT EXISTS document_locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Lock holder
    locked_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    locked_by_name VARCHAR(255), -- Denormalized for quick display
    
    -- Lock type
    lock_type VARCHAR(20) DEFAULT 'edit', -- 'edit', 'view', 'exclusive'
    
    -- Timing - KEY FEATURE: Auto-expiring locks!
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Auto-release after this time
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- Client sends heartbeat to keep lock
    
    -- Context
    client_info TEXT, -- Browser/device info
    session_id VARCHAR(100), -- For multi-tab handling
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    released_at TIMESTAMP WITH TIME ZONE,
    release_reason VARCHAR(50), -- 'user_released', 'expired', 'admin_released', 'save_completed'
    
    CONSTRAINT valid_lock_type CHECK (lock_type IN ('edit', 'view', 'exclusive')),
    CONSTRAINT valid_release_reason CHECK (release_reason IS NULL OR release_reason IN ('user_released', 'expired', 'admin_released', 'save_completed', 'connection_lost'))
);

-- Only one active lock per document
CREATE UNIQUE INDEX idx_document_locks_active ON document_locks(document_id) WHERE is_active = true;
CREATE INDEX idx_document_locks_user ON document_locks(locked_by);
CREATE INDEX idx_document_locks_expires ON document_locks(expires_at) WHERE is_active = true;

-- ============================================
-- DOCUMENT ACTIVITIES
-- ============================================
-- Detailed activity log for documents (who viewed, edited, downloaded, etc.)

CREATE TABLE IF NOT EXISTS document_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Activity
    action VARCHAR(50) NOT NULL, -- 'view', 'edit', 'download', 'share', 'version_create', 'lock', 'unlock', 'compare', 'restore'
    
    -- Attribution
    user_id UUID REFERENCES users(id),
    user_name VARCHAR(255),
    
    -- Details
    details JSONB DEFAULT '{}', -- Action-specific details (e.g., version numbers for compare)
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_document_activities_document_id ON document_activities(document_id);
CREATE INDEX idx_document_activities_user_id ON document_activities(user_id);
CREATE INDEX idx_document_activities_created_at ON document_activities(created_at DESC);

-- ============================================
-- SYNC QUEUE
-- ============================================
-- Queue for background sync operations

CREATE TABLE IF NOT EXISTS document_sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drive_id UUID NOT NULL REFERENCES drive_configurations(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Sync details
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    external_path TEXT NOT NULL,
    sync_direction VARCHAR(20) NOT NULL, -- 'to_apex', 'from_apex'
    
    -- Status
    status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'conflict'
    priority INTEGER DEFAULT 5, -- 1 = highest, 10 = lowest
    
    -- Attempt tracking
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    
    -- Conflict info
    conflict_type VARCHAR(30), -- 'both_modified', 'deleted_locally', 'deleted_externally'
    conflict_resolved_at TIMESTAMP WITH TIME ZONE,
    conflict_resolved_by UUID REFERENCES users(id),
    conflict_resolution VARCHAR(30),
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT valid_sync_direction CHECK (sync_direction IN ('to_apex', 'from_apex')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'conflict', 'cancelled'))
);

CREATE INDEX idx_sync_queue_status ON document_sync_queue(status) WHERE status IN ('pending', 'processing', 'conflict');
CREATE INDEX idx_sync_queue_drive_id ON document_sync_queue(drive_id);

-- ============================================
-- ADD NEW COLUMNS TO DOCUMENTS TABLE
-- ============================================

DO $$
BEGIN
    -- Add version count column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'version_count') THEN
        ALTER TABLE documents ADD COLUMN version_count INTEGER DEFAULT 1;
        RAISE NOTICE 'Added version_count column to documents';
    END IF;

    -- Add current editor info (who's currently editing)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'current_editor_id') THEN
        ALTER TABLE documents ADD COLUMN current_editor_id UUID REFERENCES users(id);
        RAISE NOTICE 'Added current_editor_id column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'current_editor_name') THEN
        ALTER TABLE documents ADD COLUMN current_editor_name VARCHAR(255);
        RAISE NOTICE 'Added current_editor_name column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'lock_expires_at') THEN
        ALTER TABLE documents ADD COLUMN lock_expires_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added lock_expires_at column to documents';
    END IF;

    -- Add drive reference
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'drive_id') THEN
        ALTER TABLE documents ADD COLUMN drive_id UUID REFERENCES drive_configurations(id);
        RAISE NOTICE 'Added drive_id column to documents';
    END IF;

    -- Add external sync info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'external_id') THEN
        ALTER TABLE documents ADD COLUMN external_id VARCHAR(500);
        RAISE NOTICE 'Added external_id column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'external_modified_at') THEN
        ALTER TABLE documents ADD COLUMN external_modified_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added external_modified_at column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'content_hash') THEN
        ALTER TABLE documents ADD COLUMN content_hash VARCHAR(64);
        RAISE NOTICE 'Added content_hash column to documents';
    END IF;

    -- Add folder support for organizing documents
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'folder_path') THEN
        ALTER TABLE documents ADD COLUMN folder_path TEXT DEFAULT '/';
        RAISE NOTICE 'Added folder_path column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'is_folder') THEN
        ALTER TABLE documents ADD COLUMN is_folder BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_folder column to documents';
    END IF;

END $$;

-- Add index for folder browsing
CREATE INDEX IF NOT EXISTS idx_documents_folder_path ON documents(folder_path);
CREATE INDEX IF NOT EXISTS idx_documents_drive_id ON documents(drive_id);
CREATE INDEX IF NOT EXISTS idx_documents_external_id ON documents(external_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE drive_configurations IS 'Firm and user drive configurations for document sync (like Clio Drive but better)';
COMMENT ON TABLE document_versions IS 'Full version history with automatic versioning on every save';
COMMENT ON TABLE document_locks IS 'Smart document locks that auto-expire (fixing Clio''s stuck lock problem)';
COMMENT ON TABLE document_activities IS 'Detailed audit log of all document activities';
COMMENT ON TABLE document_sync_queue IS 'Background queue for sync operations with conflict handling';

COMMENT ON COLUMN document_locks.expires_at IS 'Lock auto-expires - no more stuck locks like Clio!';
COMMENT ON COLUMN document_locks.last_heartbeat IS 'Client sends heartbeat every 30s - lock released if no heartbeat for 2 minutes';
COMMENT ON COLUMN document_versions.change_summary IS 'AI-generated or user-provided summary of what changed';
COMMENT ON COLUMN drive_configurations.conflict_resolution IS 'How to handle conflicts - user choice, keep both, or automatic resolution';
