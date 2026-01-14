-- AI Learning Patterns Table
-- Stores learned patterns from user interactions to improve the background agent

CREATE TABLE IF NOT EXISTS ai_learning_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL means firm-wide pattern
  
  -- Pattern classification
  pattern_type VARCHAR(100) NOT NULL, -- 'workflow', 'naming', 'timing', 'preference', 'shortcut'
  pattern_category VARCHAR(100), -- 'billing', 'documents', 'scheduling', 'communication'
  
  -- Pattern data (flexible JSON)
  pattern_data JSONB NOT NULL,
  
  -- Learning metadata
  confidence DECIMAL(3,2) DEFAULT 0.50, -- 0.00 to 1.00
  occurrences INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_learning_patterns_firm ON ai_learning_patterns(firm_id);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_user ON ai_learning_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_type ON ai_learning_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_confidence ON ai_learning_patterns(confidence DESC);

-- AI Task History Table
-- Stores completed background agent tasks for learning and auditing

CREATE TABLE IF NOT EXISTS ai_task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Task details
  task_id VARCHAR(100) NOT NULL,
  goal TEXT NOT NULL,
  status VARCHAR(50) NOT NULL, -- 'completed', 'failed', 'cancelled'
  
  -- Execution details
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  iterations INTEGER DEFAULT 0,
  
  -- Results
  summary TEXT,
  actions_taken JSONB, -- Array of actions
  result JSONB, -- Final result data
  error TEXT, -- Error message if failed
  
  -- Learning extraction
  learnings JSONB, -- Extracted patterns for learning
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for task history
CREATE INDEX IF NOT EXISTS idx_task_history_firm ON ai_task_history(firm_id);
CREATE INDEX IF NOT EXISTS idx_task_history_user ON ai_task_history(user_id);
CREATE INDEX IF NOT EXISTS idx_task_history_status ON ai_task_history(status);
CREATE INDEX IF NOT EXISTS idx_task_history_date ON ai_task_history(created_at DESC);

-- AI Workflow Templates Table
-- Stores common workflows learned from user behavior

CREATE TABLE IF NOT EXISTS ai_workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  
  -- Workflow identification
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_phrases TEXT[], -- Phrases that trigger this workflow
  
  -- Workflow steps
  steps JSONB NOT NULL, -- Array of step definitions
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(3,2) DEFAULT 1.00,
  avg_duration_seconds INTEGER,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for workflow templates
CREATE INDEX IF NOT EXISTS idx_workflow_templates_firm ON ai_workflow_templates(firm_id);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_active ON ai_workflow_templates(is_active) WHERE is_active = true;

-- Function to update pattern confidence based on usage
CREATE OR REPLACE FUNCTION update_pattern_confidence()
RETURNS TRIGGER AS $$
BEGIN
  -- Increase confidence with more occurrences (diminishing returns)
  NEW.confidence := LEAST(0.99, 0.50 + (0.49 * (1 - EXP(-NEW.occurrences::float / 10))));
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for confidence updates
DROP TRIGGER IF EXISTS trigger_update_pattern_confidence ON ai_learning_patterns;
CREATE TRIGGER trigger_update_pattern_confidence
  BEFORE UPDATE OF occurrences ON ai_learning_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_confidence();

-- Sample workflow templates for legal practices
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'New Client Intake',
  'Complete workflow for onboarding a new client',
  ARRAY['new client', 'onboard client', 'intake', 'sign up client'],
  '[
    {"action": "create_client", "description": "Create client record"},
    {"action": "create_matter", "description": "Create initial matter"},
    {"action": "create_document", "description": "Generate engagement letter"},
    {"action": "create_task", "description": "Schedule intake meeting"},
    {"action": "create_calendar_event", "description": "Add meeting to calendar"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'New Client Intake'
);

INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Monthly Billing',
  'Generate and send monthly invoices',
  ARRAY['monthly billing', 'send invoices', 'bill clients', 'invoice all'],
  '[
    {"action": "list_invoices", "description": "Check draft invoices"},
    {"action": "create_invoice", "description": "Create invoices from unbilled time"},
    {"action": "send_invoice", "description": "Send invoices to clients"},
    {"action": "create_task", "description": "Set follow-up reminders"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Monthly Billing'
);

INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Close Matter',
  'Complete workflow for closing a matter',
  ARRAY['close matter', 'close case', 'finish matter', 'matter complete'],
  '[
    {"action": "get_matter", "description": "Review matter status"},
    {"action": "list_invoices", "description": "Check outstanding invoices"},
    {"action": "close_matter", "description": "Set matter to closed"},
    {"action": "create_document", "description": "Generate closing letter"},
    {"action": "create_task", "description": "Archive file reminder"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Close Matter'
);
