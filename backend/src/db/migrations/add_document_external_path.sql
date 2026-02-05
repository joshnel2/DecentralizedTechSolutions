-- Migration: Add external path support for documents
-- This allows linking documents to external files (Google Drive, OneDrive, local paths, etc.)

DO $$
BEGIN
    -- Add external_path column for linking to external file locations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'external_path') THEN
        ALTER TABLE documents ADD COLUMN external_path TEXT;
        RAISE NOTICE 'Added external_path column to documents';
    END IF;

    -- Add external_type column to specify the type of external link
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'external_type') THEN
        ALTER TABLE documents ADD COLUMN external_type VARCHAR(50);
        RAISE NOTICE 'Added external_type column to documents';
    END IF;

    -- Add content_extracted_at if not exists (for tracking when content was last extracted)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'content_extracted_at') THEN
        ALTER TABLE documents ADD COLUMN content_extracted_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added content_extracted_at column to documents';
    END IF;

    -- Add last_synced_at for external documents
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'last_synced_at') THEN
        ALTER TABLE documents ADD COLUMN last_synced_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added last_synced_at column to documents';
    END IF;

END $$;

-- Add comment explaining external_type values
COMMENT ON COLUMN documents.external_type IS 'Type of external link: google_drive, onedrive, dropbox, sharepoint, local_path, url';
COMMENT ON COLUMN documents.external_path IS 'Full path or URL to the external file location';
