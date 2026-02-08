-- Migration: Add created_at column to documents table
-- 
-- The documents table schema uses 'uploaded_at' as its timestamp column,
-- but several code paths (integrations, background agent review queue,
-- activity learning, etc.) reference 'created_at' instead.
-- 
-- This migration adds 'created_at' as an alias that defaults to the same
-- value as uploaded_at, ensuring both column names work. This prevents
-- "column created_at does not exist" errors without requiring a full
-- codebase rename of every reference.

DO $$
BEGIN
    -- Add created_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE documents ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to documents table';
        
        -- Backfill created_at from uploaded_at for existing rows
        UPDATE documents SET created_at = uploaded_at WHERE created_at IS NULL AND uploaded_at IS NOT NULL;
        RAISE NOTICE 'Backfilled created_at from uploaded_at for existing documents';
    END IF;
    
    -- Add file_name column if it doesn't exist (used by integrations)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'file_name'
    ) THEN
        ALTER TABLE documents ADD COLUMN file_name VARCHAR(500);
        RAISE NOTICE 'Added file_name column to documents table';
    END IF;
    
    -- Add file_type column if it doesn't exist (used by integrations)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'file_type'
    ) THEN
        ALTER TABLE documents ADD COLUMN file_type VARCHAR(100);
        RAISE NOTICE 'Added file_type column to documents table';
    END IF;
    
    -- Add file_size column if it doesn't exist (used by integrations)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'file_size'
    ) THEN
        ALTER TABLE documents ADD COLUMN file_size BIGINT;
        RAISE NOTICE 'Added file_size column to documents table';
    END IF;
    
    -- Add file_path column if it doesn't exist (used by Dropbox integration)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'file_path'
    ) THEN
        ALTER TABLE documents ADD COLUMN file_path TEXT;
        RAISE NOTICE 'Added file_path column to documents table';
    END IF;
END $$;

-- Create index on created_at for efficient time-range queries
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- Create a trigger to keep created_at in sync with uploaded_at for new inserts
-- This ensures both columns always have the same value
CREATE OR REPLACE FUNCTION sync_documents_created_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_at IS NULL THEN
        NEW.created_at := COALESCE(NEW.uploaded_at, NOW());
    END IF;
    IF NEW.uploaded_at IS NULL THEN
        NEW.uploaded_at := COALESCE(NEW.created_at, NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_sync_created_at ON documents;
CREATE TRIGGER trg_documents_sync_created_at
    BEFORE INSERT ON documents
    FOR EACH ROW
    EXECUTE FUNCTION sync_documents_created_at();
