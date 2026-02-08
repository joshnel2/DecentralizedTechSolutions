-- Identity Replays: the attorney's recorded decision-making process
-- 
-- Every approved task becomes a "replay" — a recorded firing pattern of
-- how the attorney (via the agent) handled a specific type of problem.
-- When a similar problem arises, the agent replays the same process.
--
-- This is "today's Neuralink" — the gap between what the AI does and what
-- the attorney would do approaches zero as the replay library grows.

CREATE TABLE IF NOT EXISTS identity_replays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  task_id UUID NOT NULL,
  goal_text TEXT NOT NULL,
  work_type VARCHAR(50),
  
  -- The execution trace (the "recorded neuron firing")
  tool_sequence TEXT[] NOT NULL,
  tool_args_summary JSONB,
  phase_sequence TEXT[],
  
  -- The outcome shape (what "done" looked like)
  deliverable_shape JSONB NOT NULL,
  reading_before_writing TEXT[],
  first_write_tool VARCHAR(50),
  document_structure TEXT,
  
  -- Quality signal
  evaluation_score INTEGER,
  approval_strength VARCHAR(20) DEFAULT 'approved',
  
  -- Compressed reasoning skeleton
  reasoning_skeleton TEXT,
  
  -- For semantic matching
  goal_embedding VECTOR(1536),
  
  -- Metadata
  duration_seconds INTEGER,
  iteration_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_replays_user 
  ON identity_replays(user_id, firm_id);
CREATE INDEX IF NOT EXISTS idx_identity_replays_worktype 
  ON identity_replays(user_id, firm_id, work_type);
