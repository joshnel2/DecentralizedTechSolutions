-- Document Learning System Tables
-- These tables store per-user learning insights from their documents
-- PRIVACY: All data is scoped to user_id and never shared between users

-- AI Document Insights - learned from user's documents
CREATE TABLE IF NOT EXISTS ai_document_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    document_type VARCHAR(50),
    content_hash VARCHAR(64) GENERATED ALWAYS AS (md5(content::text)) STORED,
    occurrence_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure uniqueness per user/type/document_type/content
    CONSTRAINT unique_user_insight UNIQUE (user_id, insight_type, document_type, content_hash)
);

-- AI Learnings - general learnings from task execution
CREATE TABLE IF NOT EXISTS ai_learnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    learning_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    content_hash VARCHAR(64) GENERATED ALWAYS AS (md5(content::text)) STORED,
    confidence DECIMAL(3,2) DEFAULT 0.5,
    source VARCHAR(50),
    occurrence_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure uniqueness per firm/type/content
    CONSTRAINT unique_firm_learning UNIQUE (firm_id, learning_type, content_hash)
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_document_insights_user ON ai_document_insights(user_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_document_insights_firm ON ai_document_insights(firm_id);
CREATE INDEX IF NOT EXISTS idx_document_insights_doc_type ON ai_document_insights(document_type);

CREATE INDEX IF NOT EXISTS idx_learnings_firm_user ON ai_learnings(firm_id, user_id);
CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON ai_learnings(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_learnings_type ON ai_learnings(learning_type);

-- Add feedback columns to background tasks if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_background_tasks' AND column_name = 'feedback_rating') THEN
        ALTER TABLE ai_background_tasks ADD COLUMN feedback_rating INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_background_tasks' AND column_name = 'feedback_text') THEN
        ALTER TABLE ai_background_tasks ADD COLUMN feedback_text TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_background_tasks' AND column_name = 'feedback_correction') THEN
        ALTER TABLE ai_background_tasks ADD COLUMN feedback_correction TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_background_tasks' AND column_name = 'feedback_at') THEN
        ALTER TABLE ai_background_tasks ADD COLUMN feedback_at TIMESTAMP;
    END IF;
END $$;

-- Comment on tables for documentation
COMMENT ON TABLE ai_document_insights IS 'Per-user learning from documents. PRIVACY: Scoped to user_id, never shared.';
COMMENT ON TABLE ai_learnings IS 'General learnings from task execution and feedback.';
