-- Add storage_location column to documents table
-- This column tracks where the document is stored (azure, local, etc.)

ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_location VARCHAR(50) DEFAULT 'local';

-- Add index for efficient queries filtering by storage location
CREATE INDEX IF NOT EXISTS idx_documents_storage_location ON documents(storage_location);

-- Update existing documents with external_path to be marked as azure storage
UPDATE documents SET storage_location = 'azure' WHERE external_path IS NOT NULL AND storage_location = 'local';
