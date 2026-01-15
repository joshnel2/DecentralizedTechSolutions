-- Enhanced AI Learning Patterns Migration
-- Adds additional fields for user-based learning from all interactions

-- Add new columns to ai_learning_patterns if they don't exist
DO $$ 
BEGIN
  -- Add source column to track where learning came from
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ai_learning_patterns' AND column_name = 'source') THEN
    ALTER TABLE ai_learning_patterns ADD COLUMN source VARCHAR(50) DEFAULT 'user_action';
    COMMENT ON COLUMN ai_learning_patterns.source IS 'Source of learning: ai_chat, document_edit, time_entry, calendar, site_interaction, background_agent';
  END IF;

  -- Add occurrence_count (if occurrences doesn't work with the trigger)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ai_learning_patterns' AND column_name = 'occurrence_count') THEN
    ALTER TABLE ai_learning_patterns ADD COLUMN occurrence_count INTEGER DEFAULT 1;
  END IF;

  -- Add context column for additional learning context
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ai_learning_patterns' AND column_name = 'context') THEN
    ALTER TABLE ai_learning_patterns ADD COLUMN context JSONB DEFAULT '{}'::jsonb;
    COMMENT ON COLUMN ai_learning_patterns.context IS 'Additional context about when/where the pattern was learned';
  END IF;
END $$;

-- Create index on source if not exists
CREATE INDEX IF NOT EXISTS idx_learning_patterns_source ON ai_learning_patterns(source);

-- Create index on pattern_data for JSON containment queries
CREATE INDEX IF NOT EXISTS idx_learning_patterns_data ON ai_learning_patterns USING GIN (pattern_data);

-- Create index for combined user+type lookups
CREATE INDEX IF NOT EXISTS idx_learning_patterns_user_type ON ai_learning_patterns(user_id, pattern_type);

-- Update the confidence function to work with occurrence_count
CREATE OR REPLACE FUNCTION update_pattern_confidence_v2()
RETURNS TRIGGER AS $$
BEGIN
  -- Increase confidence with more occurrences (diminishing returns)
  NEW.confidence := LEAST(0.95, 0.30 + (0.65 * (1 - EXP(-COALESCE(NEW.occurrence_count, NEW.occurrences, 1)::float / 10))));
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update trigger to work with occurrence_count
DROP TRIGGER IF EXISTS trigger_update_pattern_confidence_v2 ON ai_learning_patterns;
CREATE TRIGGER trigger_update_pattern_confidence_v2
  BEFORE UPDATE OF occurrence_count ON ai_learning_patterns
  FOR EACH ROW
  WHEN (NEW.occurrence_count IS DISTINCT FROM OLD.occurrence_count)
  EXECUTE FUNCTION update_pattern_confidence_v2();

-- Add lawyer-specific workflow templates
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Draft Legal Document',
  'Complete workflow for drafting a legal document',
  ARRAY['draft document', 'create letter', 'write contract', 'draft memo'],
  '[
    {"action": "get_matter", "description": "Review matter context"},
    {"action": "list_documents", "description": "Check existing documents"},
    {"action": "create_document", "description": "Draft the document"},
    {"action": "log_time", "description": "Log document drafting time"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Draft Legal Document'
);

INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Prepare for Hearing',
  'Complete workflow for hearing preparation',
  ARRAY['prepare hearing', 'court prep', 'trial prep', 'motion hearing'],
  '[
    {"action": "get_matter", "description": "Review case details"},
    {"action": "list_documents", "description": "Gather relevant documents"},
    {"action": "search_document_content", "description": "Find key facts"},
    {"action": "create_task", "description": "Create preparation checklist"},
    {"action": "create_calendar_event", "description": "Schedule prep meeting"},
    {"action": "log_time", "description": "Log preparation time"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Prepare for Hearing'
);

INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Status Update to Client',
  'Send case status update to client',
  ARRAY['update client', 'status update', 'client communication', 'case update'],
  '[
    {"action": "get_matter", "description": "Review matter status"},
    {"action": "get_my_time_entries", "description": "Review recent work"},
    {"action": "create_document", "description": "Draft status update"},
    {"action": "log_time", "description": "Log communication time"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Status Update to Client'
);

INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Daily Time Entry',
  'Log time entries for today',
  ARRAY['log time', 'enter time', 'time entries', 'bill time', 'record time'],
  '[
    {"action": "get_calendar_events", "description": "Review today calendar"},
    {"action": "list_my_matters", "description": "See active matters"},
    {"action": "log_time", "description": "Create time entries"},
    {"action": "evaluate_progress", "description": "Confirm all logged"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Daily Time Entry'
);

INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Discovery Response',
  'Prepare discovery response documents',
  ARRAY['discovery response', 'interrogatories', 'respond to discovery', 'document request'],
  '[
    {"action": "get_matter", "description": "Review matter details"},
    {"action": "search_document_content", "description": "Search for relevant docs"},
    {"action": "list_documents", "description": "Gather responsive documents"},
    {"action": "create_document", "description": "Draft responses"},
    {"action": "create_task", "description": "Set review deadline"},
    {"action": "log_time", "description": "Log discovery time"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Discovery Response'
);

-- Grant select on tables (if using role-based access)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ai_learning_patterns TO apex_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ai_task_history TO apex_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ai_workflow_templates TO apex_app;

-- Add comments for documentation
COMMENT ON TABLE ai_learning_patterns IS 'Stores learned patterns from user interactions including AI chat, document edits, time entries, calendar events, and site navigation';
COMMENT ON TABLE ai_task_history IS 'Stores history of completed background agent tasks for learning and auditing';
COMMENT ON TABLE ai_workflow_templates IS 'Stores common workflows learned from user behavior and predefined templates';
