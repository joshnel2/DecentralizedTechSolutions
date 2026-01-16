-- Migration: Add persistent background agent tasks
-- Stores resumable Amplifier background tasks and checkpoints

CREATE TABLE IF NOT EXISTS ai_background_tasks (
  id VARCHAR(100) PRIMARY KEY,
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  progress JSONB DEFAULT '{}',
  result JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  iterations INTEGER DEFAULT 0,
  max_iterations INTEGER DEFAULT 120,
  options JSONB DEFAULT '{}',
  checkpoint JSONB,
  checkpoint_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_firm_id ON ai_background_tasks(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_id ON ai_background_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_status ON ai_background_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_checkpoint ON ai_background_tasks(status, checkpoint_at) 
  WHERE status IN ('running', 'pending');

SELECT 'AI background task migration completed!' as status;
