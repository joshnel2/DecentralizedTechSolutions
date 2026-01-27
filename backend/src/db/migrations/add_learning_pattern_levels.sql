-- Migration: Add hierarchical learning levels to ai_learning_patterns
-- 
-- This enables privacy-preserving collective learning:
-- - 'user': Private patterns for a specific user
-- - 'firm': Shared patterns within a firm
-- - 'global': Anonymized patterns shared across all users (no identifying info)
--
-- The agent learns from all three levels while respecting privacy:
-- 1. Personal patterns (private)
-- 2. Firm best practices (shared within firm)
-- 3. Global patterns (continuously improving from anonymized data)

-- Add level column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_learning_patterns' AND column_name = 'level'
    ) THEN
        ALTER TABLE ai_learning_patterns 
        ADD COLUMN level VARCHAR(20) DEFAULT 'user';
        
        -- Add check constraint for valid levels
        ALTER TABLE ai_learning_patterns
        ADD CONSTRAINT valid_learning_level 
        CHECK (level IN ('user', 'firm', 'global'));
        
        -- Update existing patterns to 'user' level
        UPDATE ai_learning_patterns SET level = 'user' WHERE level IS NULL;
    END IF;
END $$;

-- Create index for level-based queries
CREATE INDEX IF NOT EXISTS idx_learning_patterns_level ON ai_learning_patterns(level);

-- Create composite index for efficient hierarchical lookups
CREATE INDEX IF NOT EXISTS idx_learning_patterns_hierarchical 
ON ai_learning_patterns(level, firm_id, user_id, confidence DESC);

-- For global patterns, we allow NULL firm_id and user_id
-- Update the table to allow this (if not already)
ALTER TABLE ai_learning_patterns 
ALTER COLUMN firm_id DROP NOT NULL;

-- Create a partial index for global patterns (faster global queries)
CREATE INDEX IF NOT EXISTS idx_learning_patterns_global 
ON ai_learning_patterns(pattern_type, confidence DESC) 
WHERE level = 'global';

-- Add comment explaining the privacy model
COMMENT ON COLUMN ai_learning_patterns.level IS 
'Privacy level: user (private), firm (shared in firm), global (anonymized, no identifying info)';

SELECT 'Learning pattern levels migration completed!' as status;
