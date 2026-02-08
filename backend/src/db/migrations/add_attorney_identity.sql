-- Attorney Identity Dimensions
-- Stores learned identity traits for each attorney
-- This is the core persistence layer for the "become the attorney" system.
-- Each dimension is a named trait with a JSON value and confidence score.
-- As the attorney uses the system more, dimensions accumulate and the
-- agent becomes more and more like them.

CREATE TABLE IF NOT EXISTS attorney_identity_dimensions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  dimension_name VARCHAR(100) NOT NULL,  -- e.g. 'correction_principle', 'preference_rank', 'writing_tone'
  dimension_value JSONB NOT NULL,        -- The actual trait value (structured)
  confidence DECIMAL(3,2) DEFAULT 0.50,  -- 0.00-1.00 confidence in this dimension
  evidence_count INTEGER DEFAULT 1,       -- How many observations support this
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups per attorney
CREATE INDEX IF NOT EXISTS idx_attorney_identity_user_firm 
  ON attorney_identity_dimensions(user_id, firm_id);
CREATE INDEX IF NOT EXISTS idx_attorney_identity_dimension 
  ON attorney_identity_dimensions(user_id, firm_id, dimension_name);

-- Index for pruning old/low-confidence dimensions
CREATE INDEX IF NOT EXISTS idx_attorney_identity_confidence
  ON attorney_identity_dimensions(confidence, updated_at);
