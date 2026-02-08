-- Migration: Cognitive Imprinting Layer
-- 
-- Four interconnected systems that capture the silent exhaust of a lawyer's
-- daily work and transform it into a deep cognitive model:
--
-- 1. EDIT DIFF LEARNING: When lawyers silently edit agent-created documents,
--    those edits are the richest learning signal that exists.
-- 2. ASSOCIATIVE MEMORY NETWORK: Maps how each lawyer uniquely connects
--    legal concepts during their reasoning process.
-- 3. COGNITIVE STATE INFERENCE: Tracks working patterns to infer whether
--    the lawyer is in deep-work, triage, or urgent mode right now.
-- 4. COGNITIVE SIGNATURE: A model-agnostic mathematical representation
--    of the attorney's complete cognitive profile.

-- =====================================================================
-- 1. EDIT DIFF LEARNING
-- When a lawyer edits an agent-created document, the diff is decomposed
-- into learning signals: substitutions, deletions, additions, restructuring.
-- Each signal carries higher confidence than verbal feedback because
-- the lawyer SHOWED what they wanted instead of TELLING.
-- =====================================================================

CREATE TABLE IF NOT EXISTS edit_diff_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  
  -- Source tracking
  document_id UUID NOT NULL,            -- The document that was edited
  task_id VARCHAR(100),                 -- The agent task that created the original
  
  -- The edit signal
  signal_type VARCHAR(30) NOT NULL,     -- 'substitution', 'deletion', 'addition', 'restructure', 'no_change'
  signal_data JSONB NOT NULL,           -- Details of the edit (original text, new text, context, etc.)
  
  -- What dimension of the attorney's identity this informs
  identity_dimension VARCHAR(50),       -- 'writing_style', 'tone', 'structure', 'vocabulary', 'detail_level', 'content_preference'
  
  -- Extracted principle (the "why" behind the edit)
  extracted_principle TEXT,             -- e.g. "Prefers 'under' instead of 'pursuant to'"
  
  -- Confidence (edits are high-confidence because they're behavioral, not verbal)
  confidence DECIMAL(3,2) DEFAULT 0.90,
  
  -- Coverage: what fraction of the original document was left unchanged
  unchanged_ratio DECIMAL(3,2),        -- 0.80 = 80% of content was implicitly approved
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edit_diff_user 
  ON edit_diff_signals(user_id, firm_id);
CREATE INDEX IF NOT EXISTS idx_edit_diff_dimension 
  ON edit_diff_signals(user_id, firm_id, identity_dimension);
CREATE INDEX IF NOT EXISTS idx_edit_diff_document 
  ON edit_diff_signals(document_id);

-- Track which documents were created by the agent so we can detect edits later
CREATE TABLE IF NOT EXISTS agent_created_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  task_id VARCHAR(100),
  original_content_hash VARCHAR(64) NOT NULL,   -- SHA-256 of original content
  original_content_length INTEGER NOT NULL,
  original_content_snapshot TEXT,                -- First 5000 chars of original (for diffing)
  work_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_docs_lookup
  ON agent_created_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_agent_docs_user
  ON agent_created_documents(user_id, firm_id);


-- =====================================================================
-- 2. ASSOCIATIVE MEMORY NETWORK
-- During task execution, when reading content leads to a search or action,
-- that causal connection IS the lawyer's reasoning pattern.
-- Over hundreds of tasks, these edges form a unique cognitive graph.
-- =====================================================================

CREATE TABLE IF NOT EXISTS associative_memory_edges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  
  -- The association
  source_concept VARCHAR(200) NOT NULL,    -- What was encountered (extracted from read content)
  target_concept VARCHAR(200) NOT NULL,    -- What it led to (search query, tool call, etc.)
  association_type VARCHAR(30) NOT NULL,   -- 'content_to_search', 'content_to_action', 'concept_to_concept', 'finding_to_recommendation'
  
  -- Context
  context_work_type VARCHAR(50),           -- What type of work triggered this association
  context_matter_type VARCHAR(50),         -- What type of matter it was on
  
  -- Strength (reinforced by approval, weakened by rejection)
  strength DECIMAL(3,2) DEFAULT 0.50,
  observation_count INTEGER DEFAULT 1,
  
  -- Source tracking
  source_task_ids TEXT[],                  -- Which tasks demonstrated this association
  
  -- Timestamps
  first_observed TIMESTAMPTZ DEFAULT NOW(),
  last_observed TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one edge per concept pair per user
  UNIQUE(user_id, firm_id, source_concept, target_concept, association_type)
);

CREATE INDEX IF NOT EXISTS idx_assoc_memory_user 
  ON associative_memory_edges(user_id, firm_id);
CREATE INDEX IF NOT EXISTS idx_assoc_memory_source 
  ON associative_memory_edges(user_id, firm_id, source_concept);
CREATE INDEX IF NOT EXISTS idx_assoc_memory_strength 
  ON associative_memory_edges(user_id, firm_id, strength DESC);


-- =====================================================================
-- 3. COGNITIVE STATE INFERENCE
-- Aggregated working pattern snapshots that allow the system to infer
-- whether the lawyer is in deep-work, triage, or urgent mode.
-- =====================================================================

CREATE TABLE IF NOT EXISTS cognitive_state_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  
  -- The inferred state
  cognitive_state VARCHAR(30) NOT NULL,    -- 'deep_work', 'triage', 'urgent', 'review', 'exploration'
  
  -- Evidence signals
  signals JSONB NOT NULL,                  -- { task_frequency, matter_switch_rate, time_of_day, deadline_proximity, avg_goal_length, etc. }
  
  -- How the agent should adapt
  adaptations JSONB NOT NULL,              -- { detail_level, brevity_preference, action_bias, structure_preference }
  
  -- Confidence
  confidence DECIMAL(3,2) DEFAULT 0.60,
  
  -- Validity window
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ DEFAULT NOW() + INTERVAL '2 hours',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cog_state_user 
  ON cognitive_state_snapshots(user_id, firm_id, valid_until DESC);

-- Historical patterns for learning time-of-day and day-of-week preferences
CREATE TABLE IF NOT EXISTS cognitive_state_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  
  -- Temporal pattern
  day_of_week INTEGER,                     -- 0=Sunday, 6=Saturday (NULL = any day)
  hour_of_day INTEGER,                     -- 0-23 (NULL = any hour)
  
  -- What state is typical at this time
  typical_state VARCHAR(30) NOT NULL,
  typical_adaptations JSONB NOT NULL,
  
  -- Strength
  observation_count INTEGER DEFAULT 1,
  confidence DECIMAL(3,2) DEFAULT 0.40,
  
  last_observed TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, firm_id, day_of_week, hour_of_day)
);

CREATE INDEX IF NOT EXISTS idx_cog_patterns_user 
  ON cognitive_state_patterns(user_id, firm_id);


-- =====================================================================
-- 4. COGNITIVE SIGNATURE
-- A compact, model-agnostic mathematical representation of the attorney's
-- entire cognitive profile. Continuous values (0.0-1.0) instead of labels.
-- Portable across model changes and fine-tuning.
-- =====================================================================

CREATE TABLE IF NOT EXISTS cognitive_signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  
  -- The signature itself: a JSONB map of dimension -> continuous score
  -- e.g. { "sentence_length": 0.35, "formality": 0.72, "risk_tolerance": 0.81, ... }
  signature JSONB NOT NULL,
  
  -- Per-dimension metadata
  dimension_metadata JSONB NOT NULL,       -- { "sentence_length": { "confidence": 0.85, "evidence_count": 42, "last_updated": "..." }, ... }
  
  -- Aggregate metrics
  total_dimensions INTEGER DEFAULT 0,
  observed_dimensions INTEGER DEFAULT 0,   -- Dimensions with confidence > 0.5
  maturity_score DECIMAL(5,2) DEFAULT 0,   -- Computed from observed_dimensions / total_dimensions * confidence
  
  -- Version tracking (signatures evolve)
  version INTEGER DEFAULT 1,
  previous_signature JSONB,                -- The signature before this update (for drift detection)
  
  -- Drift detection
  drift_magnitude DECIMAL(5,4),            -- How much the signature changed from previous version
  drift_dimensions TEXT[],                 -- Which dimensions changed most
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One signature per user per firm
  UNIQUE(user_id, firm_id)
);

CREATE INDEX IF NOT EXISTS idx_cog_sig_user 
  ON cognitive_signatures(user_id, firm_id);


SELECT 'Cognitive imprinting migration completed!' as status;
