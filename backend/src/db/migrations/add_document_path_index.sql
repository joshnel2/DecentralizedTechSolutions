-- Add index for fast document path lookup (used in scan to check duplicates)
-- This index makes the scan O(1) for duplicate checking instead of O(n)

CREATE INDEX IF NOT EXISTS idx_documents_firm_path ON documents(firm_id, path);

-- Also add unique constraint to prevent duplicate paths per firm
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_firm_path_unique ON documents(firm_id, path);
