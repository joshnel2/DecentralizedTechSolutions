-- Attorney Exemplars: approved work samples + correction pairs
-- The "show don't tell" style matching system.
-- 
-- Approved exemplars: excerpts from work the attorney approved
-- Correction pairs: what the agent wrote + what the attorney wanted
-- Both embedded as vectors for semantic similarity matching.

CREATE TABLE IF NOT EXISTS attorney_exemplars (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  exemplar_type VARCHAR(20) NOT NULL CHECK (exemplar_type IN ('approved', 'correction')),
  work_type VARCHAR(50),              -- e.g. 'document_drafting', 'matter_review'
  excerpt TEXT NOT NULL,              -- The approved excerpt or the attorney's correction
  agent_wrote TEXT,                   -- For corrections: what the agent produced
  attorney_wanted TEXT,               -- For corrections: what the attorney said
  task_id UUID,                       -- Source task for provenance
  goal_text VARCHAR(300),             -- Original task goal for context
  embedding VECTOR(1536),             -- For semantic similarity retrieval
  confidence DECIMAL(3,2) DEFAULT 0.70,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups per attorney
CREATE INDEX IF NOT EXISTS idx_attorney_exemplars_user 
  ON attorney_exemplars(user_id, firm_id, exemplar_type);

-- Index for work-type fallback matching
CREATE INDEX IF NOT EXISTS idx_attorney_exemplars_worktype 
  ON attorney_exemplars(user_id, firm_id, work_type);
