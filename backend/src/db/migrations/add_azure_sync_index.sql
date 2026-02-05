-- Add unique index for Azure file sync (prevents duplicates)
-- This allows ON CONFLICT to work for syncing files from Azure

-- Create unique index on firm_id + external_path for Azure files
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_firm_external_path 
ON documents (firm_id, external_path) 
WHERE external_path IS NOT NULL;

-- Add index for faster folder_path queries
CREATE INDEX IF NOT EXISTS idx_documents_folder_path 
ON documents (firm_id, folder_path) 
WHERE folder_path IS NOT NULL;
