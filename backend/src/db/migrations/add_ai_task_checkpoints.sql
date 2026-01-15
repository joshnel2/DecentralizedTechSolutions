-- AI Task Checkpoints Table
-- Stores checkpoints for background agent tasks to enable recovery
-- This allows tasks to potentially resume after server restarts

CREATE TABLE IF NOT EXISTS ai_task_checkpoints (
  task_id VARCHAR(100) PRIMARY KEY,
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Checkpoint data
  checkpoint_data JSONB NOT NULL,
  iteration INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_task_checkpoints_firm ON ai_task_checkpoints(firm_id);
CREATE INDEX IF NOT EXISTS idx_task_checkpoints_user ON ai_task_checkpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_task_checkpoints_updated ON ai_task_checkpoints(updated_at DESC);

-- Clean up old checkpoints (older than 24 hours)
-- This can be run periodically to prevent table bloat
-- DELETE FROM ai_task_checkpoints WHERE updated_at < NOW() - INTERVAL '24 hours';
