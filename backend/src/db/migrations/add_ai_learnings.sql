-- Migration: Add AI Learning Tables for Self-Reinforcement System
-- This enables the background agent to learn from successful tasks and user feedback

-- AI Learnings table - stores patterns learned from task execution
CREATE TABLE IF NOT EXISTS ai_learnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Learning type: tool_pattern, error_recovery, task_template, domain_knowledge, user_preference, quality_standard
    learning_type VARCHAR(50) NOT NULL,
    
    -- The actual learning content (JSON)
    content JSONB NOT NULL,
    
    -- Hash of content for deduplication
    content_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(content::text::bytea), 'hex')) STORED,
    
    -- How confident we are in this learning (0.0 to 1.0)
    confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5,
    
    -- How many times this pattern has been observed
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    
    -- Where this learning came from
    source VARCHAR(50) NOT NULL,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate learnings
    CONSTRAINT unique_learning_per_firm UNIQUE (firm_id, learning_type, content_hash)
);

-- Index for fast learning retrieval
CREATE INDEX IF NOT EXISTS idx_ai_learnings_firm_type ON ai_learnings(firm_id, learning_type);
CREATE INDEX IF NOT EXISTS idx_ai_learnings_confidence ON ai_learnings(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_ai_learnings_user ON ai_learnings(user_id) WHERE user_id IS NOT NULL;

-- Add feedback columns to background tasks table if not exist
DO $$
BEGIN
    -- Add feedback_rating column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_background_tasks' AND column_name = 'feedback_rating') THEN
        ALTER TABLE ai_background_tasks ADD COLUMN feedback_rating INTEGER;
    END IF;
    
    -- Add feedback_text column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_background_tasks' AND column_name = 'feedback_text') THEN
        ALTER TABLE ai_background_tasks ADD COLUMN feedback_text TEXT;
    END IF;
    
    -- Add feedback_correction column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_background_tasks' AND column_name = 'feedback_correction') THEN
        ALTER TABLE ai_background_tasks ADD COLUMN feedback_correction TEXT;
    END IF;
    
    -- Add feedback_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_background_tasks' AND column_name = 'feedback_at') THEN
        ALTER TABLE ai_background_tasks ADD COLUMN feedback_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Workflow templates table for firm-specific automation
CREATE TABLE IF NOT EXISTS ai_workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Keywords that trigger this workflow
    trigger_phrases TEXT[] DEFAULT '{}',
    
    -- The workflow steps (JSON array)
    steps JSONB NOT NULL DEFAULT '[]',
    
    -- Category for organization
    category VARCHAR(50),
    
    -- Estimated completion time in minutes
    estimated_minutes INTEGER DEFAULT 5,
    
    -- Whether this workflow is active
    is_active BOOLEAN DEFAULT true,
    
    -- Usage stats
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for workflow templates
CREATE INDEX IF NOT EXISTS idx_ai_workflow_templates_firm ON ai_workflow_templates(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_templates_active ON ai_workflow_templates(firm_id, is_active) WHERE is_active = true;

-- Insert default workflow templates
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps, category, estimated_minutes)
SELECT 
    f.id as firm_id,
    'New Matter Intake' as name,
    'Complete setup for a new legal matter' as description,
    ARRAY['new matter', 'new case', 'intake', 'open matter'] as trigger_phrases,
    '["Gather information", "Create initial assessment", "Identify deadlines", "Create task checklist", "Prepare overview document"]'::jsonb as steps,
    'matters' as category,
    8 as estimated_minutes
FROM firms f
WHERE NOT EXISTS (
    SELECT 1 FROM ai_workflow_templates wt 
    WHERE wt.firm_id = f.id AND wt.name = 'New Matter Intake'
);

INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps, category, estimated_minutes)
SELECT 
    f.id as firm_id,
    'Monthly Billing Review' as name,
    'Analyze time entries and prepare for invoicing' as description,
    ARRAY['billing review', 'invoice', 'unbilled time'] as trigger_phrases,
    '["Gather time entries", "Analyze descriptions", "Check budgets", "Identify issues", "Create billing summary"]'::jsonb as steps,
    'billing' as category,
    10 as estimated_minutes
FROM firms f
WHERE NOT EXISTS (
    SELECT 1 FROM ai_workflow_templates wt 
    WHERE wt.firm_id = f.id AND wt.name = 'Monthly Billing Review'
);

INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps, category, estimated_minutes)
SELECT 
    f.id as firm_id,
    'Deadline Audit' as name,
    'Check all matters for upcoming deadlines and SOL' as description,
    ARRAY['deadline', 'sol', 'statute of limitation', 'calendar audit'] as trigger_phrases,
    '["Review calendar", "Check active matters", "Identify missing deadlines", "Create report", "Set reminders"]'::jsonb as steps,
    'calendar' as category,
    6 as estimated_minutes
FROM firms f
WHERE NOT EXISTS (
    SELECT 1 FROM ai_workflow_templates wt 
    WHERE wt.firm_id = f.id AND wt.name = 'Deadline Audit'
);

-- Function to update workflow usage stats
CREATE OR REPLACE FUNCTION update_workflow_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- Update usage count and last used timestamp
    UPDATE ai_workflow_templates 
    SET usage_count = usage_count + 1,
        last_used_at = NOW()
    WHERE id = NEW.workflow_template_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE ai_learnings IS 'Stores patterns learned by the AI background agent for self-improvement';
COMMENT ON TABLE ai_workflow_templates IS 'Firm-specific workflow templates for the background agent';
COMMENT ON COLUMN ai_learnings.confidence IS 'Confidence score from 0.0 to 1.0 based on feedback and success rate';
COMMENT ON COLUMN ai_learnings.occurrence_count IS 'Number of times this pattern has been observed successfully';
