-- Migration: Enhanced Word Desktop Support
-- Adds columns for improved Word desktop and versioning support

-- Add polling support columns to word_online_sessions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'word_online_sessions' AND column_name = 'polling_mode') THEN
        ALTER TABLE word_online_sessions ADD COLUMN polling_mode BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added polling_mode column to word_online_sessions';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'word_online_sessions' AND column_name = 'polling_interval') THEN
        ALTER TABLE word_online_sessions ADD COLUMN polling_interval INTEGER DEFAULT 30000;
        RAISE NOTICE 'Added polling_interval column to word_online_sessions';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'word_online_sessions' AND column_name = 'last_poll') THEN
        ALTER TABLE word_online_sessions ADD COLUMN last_poll TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added last_poll column to word_online_sessions';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'word_online_sessions' AND column_name = 'graph_subscription_id') THEN
        ALTER TABLE word_online_sessions ADD COLUMN graph_subscription_id VARCHAR(255);
        RAISE NOTICE 'Added graph_subscription_id column to word_online_sessions';
    END IF;
END $$;

-- Add content_url to document_versions for Azure Blob storage
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_versions' AND column_name = 'content_url') THEN
        ALTER TABLE document_versions ADD COLUMN content_url TEXT;
        RAISE NOTICE 'Added content_url column to document_versions';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_versions' AND column_name = 'storage_type') THEN
        ALTER TABLE document_versions ADD COLUMN storage_type VARCHAR(30) DEFAULT 'database';
        RAISE NOTICE 'Added storage_type column to document_versions';
    END IF;
END $$;

-- Add version_count to documents for quick access
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'version_count') THEN
        ALTER TABLE documents ADD COLUMN version_count INTEGER DEFAULT 1;
        RAISE NOTICE 'Added version_count column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'content_hash') THEN
        ALTER TABLE documents ADD COLUMN content_hash VARCHAR(64);
        RAISE NOTICE 'Added content_hash column to documents';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'folder_path') THEN
        ALTER TABLE documents ADD COLUMN folder_path TEXT;
        RAISE NOTICE 'Added folder_path column to documents';
    END IF;
END $$;

-- Create index for version lookups
CREATE INDEX IF NOT EXISTS idx_document_versions_source ON document_versions(source);

-- Add comments
COMMENT ON COLUMN word_online_sessions.polling_mode IS 'True if using polling instead of webhooks for change detection';
COMMENT ON COLUMN word_online_sessions.polling_interval IS 'Polling interval in milliseconds';
COMMENT ON COLUMN document_versions.content_url IS 'URL to version content in Azure Blob storage';
COMMENT ON COLUMN document_versions.storage_type IS 'Where content is stored: database, azure_blob, local';
COMMENT ON COLUMN documents.version_count IS 'Total number of versions for quick display';
COMMENT ON COLUMN documents.content_hash IS 'SHA-256 hash of current content for change detection';

SELECT 'Word desktop support migration completed!' as status;
