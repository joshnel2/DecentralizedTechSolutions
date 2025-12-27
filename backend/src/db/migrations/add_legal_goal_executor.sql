-- Migration: Add support for Legal Goal Executor (Autonomous Background Agent)
-- Adds enhanced status tracking for complex legal tasks using GPT-5-mini

-- ============================================
-- ENHANCED AI TASK STATUS TRACKING
-- ============================================

-- Add agent_status column for granular tracking
-- Statuses: Running, Thinking, Executing Tool, Completed, Failed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'agent_status') THEN
        ALTER TABLE ai_tasks ADD COLUMN agent_status VARCHAR(50) DEFAULT 'pending';
    END IF;
END $$;

-- Add reasoning_summary for storing AI's reasoning at each step
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'reasoning_summary') THEN
        ALTER TABLE ai_tasks ADD COLUMN reasoning_summary TEXT;
    END IF;
END $$;

-- Add token_usage for tracking token consumption (important for 400k context)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'token_usage') THEN
        ALTER TABLE ai_tasks ADD COLUMN token_usage JSONB DEFAULT '{"total_prompt": 0, "total_completion": 0}';
    END IF;
END $$;

-- Add model_used to track which model executed the task
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'model_used') THEN
        ALTER TABLE ai_tasks ADD COLUMN model_used VARCHAR(100);
    END IF;
END $$;

-- Add execution_plan for detailed step tracking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'execution_plan') THEN
        ALTER TABLE ai_tasks ADD COLUMN execution_plan JSONB DEFAULT '[]';
    END IF;
END $$;

-- Add current_phase for tracking Plan/Execute/Reflect phases
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'current_phase') THEN
        ALTER TABLE ai_tasks ADD COLUMN current_phase VARCHAR(50) DEFAULT 'planning';
    END IF;
END $$;

-- Add last_tool_called for UI progress display
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'last_tool_called') THEN
        ALTER TABLE ai_tasks ADD COLUMN last_tool_called VARCHAR(100);
    END IF;
END $$;

-- Add accumulated_context for managing conversation context efficiently
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_tasks' AND column_name = 'accumulated_context') THEN
        ALTER TABLE ai_tasks ADD COLUMN accumulated_context JSONB DEFAULT '{"summary": "", "key_findings": [], "actions_taken": []}';
    END IF;
END $$;

-- ============================================
-- CASE STATE TABLE - Track legal case progress
-- ============================================

CREATE TABLE IF NOT EXISTS case_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    ai_task_id UUID REFERENCES ai_tasks(id) ON DELETE SET NULL,
    state_type VARCHAR(100) NOT NULL,
    state_data JSONB DEFAULT '{}',
    summary TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_state_matter ON case_state(matter_id);
CREATE INDEX IF NOT EXISTS idx_case_state_task ON case_state(ai_task_id);
CREATE INDEX IF NOT EXISTS idx_case_state_type ON case_state(state_type);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Index for finding tasks by agent_status
CREATE INDEX IF NOT EXISTS idx_ai_tasks_agent_status ON ai_tasks(agent_status);

-- Index for finding tasks by current_phase
CREATE INDEX IF NOT EXISTS idx_ai_tasks_current_phase ON ai_tasks(current_phase);

-- Index for finding running tasks that need monitoring
CREATE INDEX IF NOT EXISTS idx_ai_tasks_running_monitor 
    ON ai_tasks(user_id, agent_status, updated_at) 
    WHERE agent_status IN ('running', 'thinking', 'executing_tool');

SELECT 'Legal Goal Executor migration completed!' as status;
