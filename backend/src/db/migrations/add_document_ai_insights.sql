-- Document AI Insights
-- Stores AI-generated analysis for documents
-- This makes Apex Drive smarter than Clio - your documents become searchable and summarized

CREATE TABLE IF NOT EXISTS document_ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- AI-generated content
    summary TEXT,                           -- 2-3 sentence summary
    key_dates JSONB DEFAULT '[]',           -- [{date, description, type}]
    suggested_tags TEXT[] DEFAULT '{}',      -- ['contract', 'nda', 'employment']
    document_type VARCHAR(100),             -- 'contract', 'pleading', 'correspondence', etc.
    importance_score INTEGER DEFAULT 5,     -- 1-10 how important is this doc
    key_entities JSONB DEFAULT '[]',        -- [{name, type}] people, companies, etc.
    related_documents UUID[] DEFAULT '{}',  -- IDs of similar documents
    action_items JSONB DEFAULT '[]',        -- [{task, due_date, assignee}]
    
    -- Search optimization
    content_embedding BYTEA,                -- Vector embedding for semantic search
    content_hash VARCHAR(64),               -- To detect if re-analysis needed
    
    -- Metadata
    analyzed_at TIMESTAMPTZ DEFAULT NOW(),
    analysis_version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(document_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_doc_ai_insights_firm ON document_ai_insights(firm_id);
CREATE INDEX IF NOT EXISTS idx_doc_ai_insights_type ON document_ai_insights(document_type);
CREATE INDEX IF NOT EXISTS idx_doc_ai_insights_importance ON document_ai_insights(importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_doc_ai_insights_tags ON document_ai_insights USING GIN(suggested_tags);

-- Desktop Drive Activity Log
-- Track what's happening on desktop clients for AI learning
CREATE TABLE IF NOT EXISTS drive_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL,
    user_id UUID NOT NULL,
    document_id UUID,
    matter_id UUID,
    
    action VARCHAR(50) NOT NULL,            -- 'open', 'save', 'create', 'delete', 'move'
    source VARCHAR(50) DEFAULT 'desktop',   -- 'desktop', 'web', 'mobile'
    
    -- Context for AI
    file_name VARCHAR(500),
    file_type VARCHAR(100),
    folder_path TEXT,
    duration_seconds INTEGER,               -- How long was file open (for open/save)
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drive_activity_firm ON drive_activity_log(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_activity_user ON drive_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_activity_matter ON drive_activity_log(matter_id, created_at DESC);

-- AI Document Processing Queue
-- When documents are uploaded, queue them for AI analysis
CREATE TABLE IF NOT EXISTS ai_document_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    firm_id UUID NOT NULL,
    user_id UUID NOT NULL,
    
    status VARCHAR(50) DEFAULT 'pending',   -- 'pending', 'processing', 'completed', 'failed'
    priority INTEGER DEFAULT 5,             -- 1 = highest, 10 = lowest
    
    -- For retry logic
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    
    queued_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_doc_queue_status ON ai_document_queue(status, priority, queued_at);

-- Matter AI Insights
-- Aggregate insights for entire matters
CREATE TABLE IF NOT EXISTS matter_ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL,
    
    -- Case summary
    case_summary TEXT,                      -- AI-generated case overview
    key_issues TEXT[],                      -- Main legal issues identified
    critical_dates JSONB DEFAULT '[]',      -- Combined from all documents
    
    -- Risk analysis
    risk_factors JSONB DEFAULT '[]',        -- [{factor, severity, source_doc}]
    missing_documents TEXT[],               -- Suggested documents that should exist
    
    -- Timeline
    case_timeline JSONB DEFAULT '[]',       -- [{date, event, source}]
    
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matter_ai_insights_matter ON matter_ai_insights(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_ai_insights_firm ON matter_ai_insights(firm_id);
