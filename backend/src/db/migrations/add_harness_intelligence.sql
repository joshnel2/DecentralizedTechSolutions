-- Migration: Harness Intelligence Layer
-- Adds per-matter memory and rejection learning tables for the cutting-edge agent harness

-- ===== PER-MATTER PERSISTENT MEMORY =====
-- Stores what the agent learned about each matter across tasks.
-- Every time a task runs on a matter, findings are stored here and
-- injected into the next task on the same matter automatically.
CREATE TABLE IF NOT EXISTS matter_agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  
  -- What the agent found/did
  memory_type VARCHAR(50) NOT NULL,  -- 'finding', 'risk', 'deadline', 'gap', 'recommendation', 'completed_work'
  content TEXT NOT NULL,              -- The actual finding/memory
  
  -- Source tracking
  source_task_id VARCHAR(100),        -- Which background task produced this
  source_tool VARCHAR(100),           -- Which tool call produced this (e.g., 'get_matter', 'read_document_content')
  
  -- Relevance scoring
  confidence DECIMAL(3,2) DEFAULT 0.70,
  importance VARCHAR(20) DEFAULT 'medium',  -- 'critical', 'high', 'medium', 'low'
  
  -- Lifecycle
  is_resolved BOOLEAN DEFAULT false,   -- Mark as resolved when follow-up is done
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(100),            -- task_id or user_id that resolved it
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '180 days'  -- Auto-expire after 6 months
);

CREATE INDEX IF NOT EXISTS idx_matter_memory_lookup 
  ON matter_agent_memory(firm_id, matter_id, is_resolved) 
  WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_matter_memory_type 
  ON matter_agent_memory(matter_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_matter_memory_expiry 
  ON matter_agent_memory(expires_at) WHERE is_resolved = false;

-- ===== REJECTION LEARNING =====
-- Stores specific quality gate adjustments learned from attorney rejections.
-- When an attorney rejects work, this table records WHY so the harness
-- can automatically tighten quality gates for that lawyer + work type.
CREATE TABLE IF NOT EXISTS harness_quality_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = firm-wide
  
  -- What work type this override applies to
  work_type VARCHAR(50) NOT NULL,  -- 'matter_review', 'document_drafting', etc. or 'all'
  
  -- The override rule
  rule_type VARCHAR(50) NOT NULL,  -- 'min_document_length', 'required_tool', 'prompt_modifier', 'min_actions', 'phase_budget'
  rule_value JSONB NOT NULL,       -- The override value (depends on rule_type)
  
  -- Why this override exists
  reason TEXT NOT NULL,             -- The rejection feedback that triggered this
  source_task_id VARCHAR(100),     -- Which rejected task caused this
  
  -- Effectiveness tracking
  applied_count INTEGER DEFAULT 0,  -- How many times this override was applied
  success_after INTEGER DEFAULT 0,  -- How many tasks passed after applying this override
  
  -- Active/inactive
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_overrides_lookup
  ON harness_quality_overrides(firm_id, user_id, work_type)
  WHERE is_active = true;

-- ===== PROVEN TOOL CHAINS =====
-- Stores tool call sequences that have been proven to work for specific work types.
-- When the harness has high confidence in a sequence, it can execute deterministically
-- without asking the model for each step.
CREATE TABLE IF NOT EXISTS proven_tool_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  
  -- What this chain is for
  work_type VARCHAR(50) NOT NULL,
  
  -- The proven sequence
  tool_sequence TEXT[] NOT NULL,     -- e.g., {'get_matter', 'list_documents', 'read_document_content', ...}
  
  -- Effectiveness metrics
  success_count INTEGER DEFAULT 1,
  total_count INTEGER DEFAULT 1,
  avg_quality_score DECIMAL(5,2),    -- Average evaluateTask() score when this chain was used
  avg_duration_seconds INTEGER,
  
  -- Confidence (auto-calculated from success rate + count)
  confidence DECIMAL(3,2) DEFAULT 0.50,
  
  -- Whether to use deterministic execution (vs just as guidance)
  deterministic BOOLEAN DEFAULT false,  -- Only true when confidence > 0.85 AND total_count > 5
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proven_chains_lookup
  ON proven_tool_chains(firm_id, work_type, confidence DESC);

SELECT 'Harness intelligence migration completed!' as status;
