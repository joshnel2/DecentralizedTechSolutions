-- Review Queue columns for ai_background_tasks
-- Enables attorney review workflow: approve/reject completed agent work
-- gen_random_uuid() is built into PostgreSQL 13+ (no extension needed)

ALTER TABLE ai_background_tasks ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE ai_background_tasks ADD COLUMN IF NOT EXISTS review_feedback TEXT;
ALTER TABLE ai_background_tasks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE ai_background_tasks ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);

-- Index for efficient review queue queries (partial index on completed tasks only)
CREATE INDEX IF NOT EXISTS idx_background_tasks_review 
  ON ai_background_tasks (firm_id, status, review_status) 
  WHERE status = 'completed';
