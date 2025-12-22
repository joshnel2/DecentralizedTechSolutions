-- Migration: Add checkpoint support for resumable AI tasks
-- This allows long-running background tasks to resume after server restarts

-- Add checkpoint column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'checkpoint') THEN
        ALTER TABLE ai_tasks ADD COLUMN checkpoint JSONB;
    END IF;
END $$;

-- Add checkpoint_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'checkpoint_at') THEN
        ALTER TABLE ai_tasks ADD COLUMN checkpoint_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Add current_step column for better progress tracking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'current_step') THEN
        ALTER TABLE ai_tasks ADD COLUMN current_step TEXT;
    END IF;
END $$;

-- Add step_count column for total steps
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'step_count') THEN
        ALTER TABLE ai_tasks ADD COLUMN step_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Index for finding incomplete tasks to resume
CREATE INDEX IF NOT EXISTS idx_ai_tasks_resumable 
    ON ai_tasks(status, checkpoint_at) 
    WHERE status = 'running' AND checkpoint IS NOT NULL;

SELECT 'AI task checkpoint migration completed!' as status;
