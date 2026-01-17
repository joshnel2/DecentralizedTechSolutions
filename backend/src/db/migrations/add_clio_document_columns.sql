-- Migration: Add missing columns for Clio document streaming
-- These columns are needed for the document streaming from Clio to Azure

DO $$
BEGIN
    -- Add clio_id column to documents table for tracking source document
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'clio_id') THEN
        ALTER TABLE documents ADD COLUMN clio_id BIGINT;
        RAISE NOTICE 'Added clio_id column to documents';
    END IF;

    -- Add storage_location column to track where document is stored (local, azure, etc.)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'storage_location') THEN
        ALTER TABLE documents ADD COLUMN storage_location VARCHAR(50) DEFAULT 'local';
        RAISE NOTICE 'Added storage_location column to documents';
    END IF;

    -- Add created_at column if it doesn't exist (alias for uploaded_at)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'created_at') THEN
        ALTER TABLE documents ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to documents';
    END IF;

END $$;

-- Create index on clio_id for faster lookups during migration
CREATE INDEX IF NOT EXISTS idx_documents_clio_id ON documents(clio_id) WHERE clio_id IS NOT NULL;

-- Create index for storage location filtering
CREATE INDEX IF NOT EXISTS idx_documents_storage_location ON documents(storage_location);

-- Create unique constraint on (firm_id, path) for upsert operations
-- This allows ON CONFLICT to work properly in document streaming
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_firm_path_unique ON documents(firm_id, path) WHERE path IS NOT NULL;

-- Add comments
COMMENT ON COLUMN documents.clio_id IS 'Original Clio document ID for documents migrated from Clio';
COMMENT ON COLUMN documents.storage_location IS 'Where document is stored: local, azure, google_drive, onedrive, dropbox';

SELECT 'Clio document columns migration completed successfully!' as status;
