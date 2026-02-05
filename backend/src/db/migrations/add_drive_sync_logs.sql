-- Migration: Add Drive Sync Logs Table
-- Tracks sync job history for auditing and troubleshooting

CREATE TABLE IF NOT EXISTS drive_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Job identification
    job_id UUID NOT NULL,
    
    -- Status: pending, in_progress, completed, failed
    status VARCHAR(20) NOT NULL,
    
    -- Statistics
    total_documents INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error details if failed
    error TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying sync history
CREATE INDEX IF NOT EXISTS idx_drive_sync_logs_firm ON drive_sync_logs(firm_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_logs_started ON drive_sync_logs(firm_id, started_at DESC);

-- Add sync columns to documents if not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'documents' AND column_name = 'sync_status') THEN
        ALTER TABLE documents ADD COLUMN sync_status VARCHAR(20) DEFAULT 'pending';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'documents' AND column_name = 'last_synced_at') THEN
        ALTER TABLE documents ADD COLUMN last_synced_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'documents' AND column_name = 'checksum') THEN
        ALTER TABLE documents ADD COLUMN checksum VARCHAR(64);
    END IF;
END $$;

-- Index for finding documents that need sync
CREATE INDEX IF NOT EXISTS idx_documents_sync_status ON documents(firm_id, sync_status) WHERE sync_status = 'pending' OR sync_status IS NULL;

-- Comments
COMMENT ON TABLE drive_sync_logs IS 'History of document sync jobs between local storage and Azure';
COMMENT ON COLUMN documents.sync_status IS 'Sync status: pending, synced, conflict, error';
COMMENT ON COLUMN documents.checksum IS 'MD5 hash of file content for conflict detection';
