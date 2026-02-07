-- =============================================================================
-- FIX: Background Agent Schema - Run this on Azure PostgreSQL
-- =============================================================================
-- This migration fixes column name mismatches and ensures all tables/indexes
-- the background agent needs are present and correct.
--
-- SAFE TO RUN MULTIPLE TIMES (all statements are idempotent).
-- =============================================================================

-- =============================================
-- 1. REQUIRED TABLES
-- =============================================

-- Matter Notes (used by add_matter_note tool)
CREATE TABLE IF NOT EXISTS matter_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    note_type VARCHAR(50) DEFAULT 'general',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Matter Tasks (used by create_task tool)
CREATE TABLE IF NOT EXISTS matter_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    due_date DATE,
    assignee UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_task_status CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT valid_task_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

-- AI Background Tasks (stores running/completed agent tasks)
CREATE TABLE IF NOT EXISTS ai_background_tasks (
    id VARCHAR(100) PRIMARY KEY,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    progress JSONB DEFAULT '{}',
    result JSONB,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    iterations INTEGER DEFAULT 0,
    max_iterations INTEGER DEFAULT 120,
    options JSONB DEFAULT '{}',
    checkpoint JSONB,
    checkpoint_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Task History (stores completed tasks for learning)
CREATE TABLE IF NOT EXISTS ai_task_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id VARCHAR(100) NOT NULL,
    goal TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    iterations INTEGER DEFAULT 0,
    summary TEXT,
    actions_taken JSONB,
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Learning Patterns
CREATE TABLE IF NOT EXISTS ai_learning_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pattern_type VARCHAR(50) NOT NULL,
    pattern_key VARCHAR(255) NOT NULL,
    pattern_value JSONB NOT NULL DEFAULT '{}',
    level VARCHAR(20) DEFAULT 'task',
    confidence DECIMAL(3,2) DEFAULT 0.50,
    occurrences INTEGER DEFAULT 1,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Workflow Templates
CREATE TABLE IF NOT EXISTS ai_workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_phrases TEXT[],
    steps JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 2. REQUIRED COLUMNS ON DOCUMENTS TABLE
-- =============================================
-- The documents table uses uploaded_at (not created_at) and size (not file_size).
-- Add content_text for AI document reading if missing.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'content_text') THEN
        ALTER TABLE documents ADD COLUMN content_text TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'content_extracted_at') THEN
        ALTER TABLE documents ADD COLUMN content_extracted_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- =============================================
-- 3. REVIEW QUEUE COLUMNS
-- =============================================

ALTER TABLE ai_background_tasks ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE ai_background_tasks ADD COLUMN IF NOT EXISTS review_feedback TEXT;
ALTER TABLE ai_background_tasks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE ai_background_tasks ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);

-- =============================================
-- 4. INDEXES FOR AGENT QUERIES
-- =============================================
-- These make 30-minute agent tasks fast instead of doing full table scans.

-- Documents: agent queries filter by (firm_id, uploaded_by, uploaded_at)
-- NOTE: The column is uploaded_at, NOT created_at
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_firm_uploaded ON documents(firm_id, uploaded_by, uploaded_at DESC);

-- Drop the broken index that referenced non-existent created_at on documents
DROP INDEX IF EXISTS idx_documents_created_at;

-- Matter Notes: agent queries filter by (matter_id, created_by, created_at)
CREATE INDEX IF NOT EXISTS idx_matter_notes_matter_id ON matter_notes(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_notes_created_at ON matter_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matter_notes_created_by ON matter_notes(created_by);

-- Matter Tasks: agent queries filter by (firm_id, created_by, created_at)
CREATE INDEX IF NOT EXISTS idx_matter_tasks_firm_id ON matter_tasks(firm_id);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_matter_id ON matter_tasks(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_status ON matter_tasks(status);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_due_date ON matter_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_created_by ON matter_tasks(created_by);

-- Background Tasks: agent queries filter by (user_id, status)
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_id ON ai_background_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_firm_id ON ai_background_tasks(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_status ON ai_background_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_status ON ai_background_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_review ON ai_background_tasks(firm_id, status, review_status) WHERE status = 'completed';

-- Calendar Events
CREATE INDEX IF NOT EXISTS idx_calendar_events_matter_id ON calendar_events(matter_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_firm_date ON calendar_events(firm_id, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by);

-- Task History
CREATE INDEX IF NOT EXISTS idx_ai_task_history_firm ON ai_task_history(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_task_history_user ON ai_task_history(user_id);

-- Learning Patterns
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_firm_id ON ai_learning_patterns(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_user_id ON ai_learning_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_firm_level ON ai_learning_patterns(firm_id, level, confidence);

-- Workflow Templates
CREATE INDEX IF NOT EXISTS idx_ai_workflow_templates_firm_active ON ai_workflow_templates(firm_id, is_active);

-- =============================================
-- 5. VERIFY
-- =============================================
-- Quick sanity check that the key columns exist

DO $$
DECLARE
    missing TEXT := '';
BEGIN
    -- Check documents.uploaded_at exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'uploaded_at') THEN
        missing := missing || 'documents.uploaded_at, ';
    END IF;
    -- Check documents.size exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'size') THEN
        missing := missing || 'documents.size, ';
    END IF;
    -- Check documents.uploaded_by exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'uploaded_by') THEN
        missing := missing || 'documents.uploaded_by, ';
    END IF;
    -- Check matter_tasks.name exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matter_tasks' AND column_name = 'name') THEN
        missing := missing || 'matter_tasks.name, ';
    END IF;
    -- Check matter_notes.created_at exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matter_notes' AND column_name = 'created_at') THEN
        missing := missing || 'matter_notes.created_at, ';
    END IF;
    
    IF missing != '' THEN
        RAISE WARNING 'MISSING COLUMNS: %', missing;
    ELSE
        RAISE NOTICE 'All required columns verified OK';
    END IF;
END $$;

SELECT 'Agent schema migration complete' AS status;
