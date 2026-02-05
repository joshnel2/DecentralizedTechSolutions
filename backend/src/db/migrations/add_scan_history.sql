-- Scan History Table - Track document sync operations
-- Created: 2026-01-30

CREATE TABLE IF NOT EXISTS scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'running',
  scan_mode VARCHAR(50) DEFAULT 'auto', -- 'auto', 'manifest', 'folder'
  
  -- Progress stats
  files_processed INTEGER DEFAULT 0,
  files_matched INTEGER DEFAULT 0,
  files_created INTEGER DEFAULT 0,
  files_skipped INTEGER DEFAULT 0,
  total_files INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  -- Details
  error_message TEXT,
  scan_results JSONB,
  triggered_by VARCHAR(100) DEFAULT 'manual', -- 'manual', 'scheduled', 'api'
  triggered_by_user VARCHAR(255),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scan_history_firm ON scan_history(firm_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_status ON scan_history(status);
CREATE INDEX IF NOT EXISTS idx_scan_history_started ON scan_history(started_at DESC);

-- Scan Settings Table - Per-firm scan configuration
CREATE TABLE IF NOT EXISTS scan_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL UNIQUE REFERENCES firms(id) ON DELETE CASCADE,
  
  -- Auto-sync settings
  auto_sync_enabled BOOLEAN DEFAULT false,
  sync_interval_minutes INTEGER DEFAULT 10,
  last_auto_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Permission settings
  permission_mode VARCHAR(50) DEFAULT 'matter', -- 'inherit', 'matter', 'strict'
  default_privacy_level VARCHAR(50) DEFAULT 'team', -- 'private', 'team', 'firm'
  auto_assign_to_responsible_attorney BOOLEAN DEFAULT true,
  
  -- Notification settings
  notify_on_completion BOOLEAN DEFAULT true,
  notify_on_error BOOLEAN DEFAULT true,
  notification_emails TEXT[],
  
  -- Other settings
  dry_run_first BOOLEAN DEFAULT false,
  skip_existing BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scan_settings_firm ON scan_settings(firm_id);

-- Comment
COMMENT ON TABLE scan_history IS 'Tracks document sync operations for audit and monitoring';
COMMENT ON TABLE scan_settings IS 'Per-firm configuration for automatic document scanning';
