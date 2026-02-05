-- Migration jobs table to persist import progress across server restarts
CREATE TABLE IF NOT EXISTS migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Progress for each step
  users_status TEXT DEFAULT 'pending',
  users_count INTEGER DEFAULT 0,
  contacts_status TEXT DEFAULT 'pending',
  contacts_count INTEGER DEFAULT 0,
  matters_status TEXT DEFAULT 'pending',
  matters_count INTEGER DEFAULT 0,
  activities_status TEXT DEFAULT 'pending',
  activities_count INTEGER DEFAULT 0,
  bills_status TEXT DEFAULT 'pending',
  bills_count INTEGER DEFAULT 0,
  calendar_status TEXT DEFAULT 'pending',
  calendar_count INTEGER DEFAULT 0,
  
  -- Store the result data as JSONB
  result_data JSONB,
  summary JSONB,
  
  -- Import options
  import_options JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_migration_jobs_connection_id ON migration_jobs(connection_id);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_status ON migration_jobs(status);
