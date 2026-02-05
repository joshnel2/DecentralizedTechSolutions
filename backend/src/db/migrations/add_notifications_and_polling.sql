-- Migration: Notifications and Polling Support for Word Online
-- Uses gen_random_uuid() for PostgreSQL 13+

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'version_created', 'document_shared', 'co_editor_joined', etc.
    title VARCHAR(200) NOT NULL,
    message TEXT,
    entity_type VARCHAR(50), -- 'document', 'matter', 'client', etc.
    entity_id UUID, -- Reference to the entity
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_firm ON notifications(firm_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ============================================
-- ADD POLLING COLUMNS TO WORD_ONLINE_SESSIONS
-- ============================================

DO $$
BEGIN
    -- Add polling_mode column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'word_online_sessions' AND column_name = 'polling_mode'
    ) THEN
        ALTER TABLE word_online_sessions ADD COLUMN polling_mode BOOLEAN DEFAULT false;
    END IF;

    -- Add polling_interval column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'word_online_sessions' AND column_name = 'polling_interval'
    ) THEN
        ALTER TABLE word_online_sessions ADD COLUMN polling_interval INTEGER DEFAULT 30000;
    END IF;

    -- Add last_poll column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'word_online_sessions' AND column_name = 'last_poll'
    ) THEN
        ALTER TABLE word_online_sessions ADD COLUMN last_poll TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add graph_subscription_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'word_online_sessions' AND column_name = 'graph_subscription_id'
    ) THEN
        ALTER TABLE word_online_sessions ADD COLUMN graph_subscription_id VARCHAR(255);
    END IF;

    -- Add changes_count column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'word_online_sessions' AND column_name = 'changes_count'
    ) THEN
        ALTER TABLE word_online_sessions ADD COLUMN changes_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================
-- ADD AZURE_PATH TO DOCUMENTS (for download fallback)
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'azure_path'
    ) THEN
        ALTER TABLE documents ADD COLUMN azure_path TEXT;
    END IF;
END $$;

-- ============================================
-- NOTIFICATION PREFERENCES (optional)
-- ============================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    -- Notification types
    document_changes BOOLEAN DEFAULT true,
    document_shares BOOLEAN DEFAULT true,
    co_editing BOOLEAN DEFAULT true,
    matter_updates BOOLEAN DEFAULT true,
    billing_updates BOOLEAN DEFAULT true,
    -- Delivery methods
    in_app BOOLEAN DEFAULT true,
    email_immediate BOOLEAN DEFAULT false,
    email_digest BOOLEAN DEFAULT true,
    -- Schedule
    digest_frequency VARCHAR(20) DEFAULT 'daily', -- 'daily', 'weekly'
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

SELECT 'Notifications and polling migration completed!' as status;
