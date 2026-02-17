-- ============================================================
-- Retrieval & Learning Architecture Tables
-- 
-- This migration adds tables for:
-- 1. RAPTOR hierarchical summary trees
-- 2. Matter-specific context (Layer 3 learning)
-- 3. Preference promotion audit log
-- 4. Enhanced indexes for retrieval pipeline
--
-- All tables include firm_id for tenant isolation.
-- RLS policies ensure database-level protection.
-- ============================================================

-- ============================================================
-- 1. RAPTOR Summary Tree
-- Hierarchical summaries for long documents.
-- Level 0 = chunk reference, Level 1 = section summary, Level 2 = document summary
-- ============================================================

CREATE TABLE IF NOT EXISTS document_summary_tree (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 0 CHECK (level >= 0 AND level <= 3),
    parent_id UUID REFERENCES document_summary_tree(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    embedding VECTOR(1536),
    child_chunk_ids UUID[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for summary tree
CREATE INDEX IF NOT EXISTS idx_summary_tree_firm_doc
ON document_summary_tree(firm_id, document_id, level);

CREATE INDEX IF NOT EXISTS idx_summary_tree_embedding
ON document_summary_tree USING ivfflat (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_summary_tree_parent
ON document_summary_tree(parent_id)
WHERE parent_id IS NOT NULL;

-- RLS for summary tree
ALTER TABLE document_summary_tree ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'document_summary_tree' 
        AND policyname = 'summary_tree_firm_isolation'
    ) THEN
        CREATE POLICY summary_tree_firm_isolation ON document_summary_tree
            USING (firm_id = current_setting('app.current_firm_id', true)::UUID);
    END IF;
END
$$;

-- ============================================================
-- 2. Matter-Specific Context (Layer 3 Learning)
-- Stores observations scoped to individual matters.
-- These are candidates for promotion to Layer 2/1.
-- ============================================================

CREATE TABLE IF NOT EXISTS matter_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    context_type VARCHAR(50) NOT NULL,
    context_key VARCHAR(200) NOT NULL,
    context_value JSONB NOT NULL DEFAULT '{}',
    confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
    source VARCHAR(50) DEFAULT 'inferred' CHECK (
        source IN ('explicit', 'inferred', 'system', 'imported')
    ),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(firm_id, matter_id, lawyer_id, context_type, context_key)
);

-- Indexes for matter context
CREATE INDEX IF NOT EXISTS idx_matter_context_lookup
ON matter_context(firm_id, lawyer_id, context_type);

CREATE INDEX IF NOT EXISTS idx_matter_context_matter
ON matter_context(firm_id, matter_id);

-- RLS for matter context
ALTER TABLE matter_context ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'matter_context' 
        AND policyname = 'matter_context_firm_isolation'
    ) THEN
        CREATE POLICY matter_context_firm_isolation ON matter_context
            USING (firm_id = current_setting('app.current_firm_id', true)::UUID);
    END IF;
END
$$;

-- ============================================================
-- 3. Preference Promotion Audit Log
-- Tracks when preferences are promoted between layers.
-- Important for explainability and debugging.
-- ============================================================

CREATE TABLE IF NOT EXISTS preference_promotion_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_id UUID NOT NULL,
    from_layer INTEGER NOT NULL CHECK (from_layer >= 1 AND from_layer <= 3),
    to_layer INTEGER NOT NULL CHECK (to_layer >= 1 AND to_layer <= 3),
    evidence_count INTEGER NOT NULL,
    distinct_matters INTEGER NOT NULL,
    promoted_at TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK (to_layer < from_layer)  -- Can only promote upward (3->2->1)
);

-- Index for promotion log
CREATE INDEX IF NOT EXISTS idx_promotion_log_lawyer
ON preference_promotion_log(firm_id, lawyer_id, promoted_at DESC);

-- ============================================================
-- 4. Enhanced Indexes for Retrieval Pipeline
-- These optimize the parallel retrieval sources.
-- ============================================================

-- Full-text search index on chunk text (for keyword search source)
CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_fulltext
ON document_embeddings USING gin(to_tsvector('english', chunk_text));

-- Composite index for filtered vector search
CREATE INDEX IF NOT EXISTS idx_embeddings_firm_matter
ON document_embeddings(firm_id, document_id);

-- Index for document relationships graph traversal
CREATE INDEX IF NOT EXISTS idx_doc_relationships_traversal
ON document_relationships(firm_id, source_document_id, relationship_type, confidence DESC);

-- Index for retrieval feedback analysis
CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_analysis
ON retrieval_feedback(firm_id, lawyer_id, created_at DESC);

-- Index for edit patterns by lawyer and context
CREATE INDEX IF NOT EXISTS idx_edit_patterns_analysis
ON edit_patterns(firm_id, lawyer_id, context, occurrences DESC);

-- Index for lawyer preferences by type and confidence
CREATE INDEX IF NOT EXISTS idx_lawyer_prefs_ranked
ON lawyer_preferences(firm_id, lawyer_id, preference_type, confidence DESC);

-- ============================================================
-- 5. Add missing columns to existing tables if needed
-- ============================================================

-- Add occurrences column to lawyer_preferences if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lawyer_preferences'
        AND column_name = 'occurrences'
    ) THEN
        ALTER TABLE lawyer_preferences ADD COLUMN occurrences INTEGER DEFAULT 1;
    END IF;
END
$$;

-- Add context column to lawyer_preferences if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lawyer_preferences'
        AND column_name = 'context'
    ) THEN
        ALTER TABLE lawyer_preferences ADD COLUMN context VARCHAR(100);
    END IF;
END
$$;

-- Add original_text_prefix and edited_text_prefix to edit_patterns if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'edit_patterns'
        AND column_name = 'original_text_prefix'
    ) THEN
        ALTER TABLE edit_patterns ADD COLUMN original_text_prefix TEXT;
        ALTER TABLE edit_patterns ADD COLUMN edited_text_prefix TEXT;
    END IF;
END
$$;

-- Add query_text to retrieval_feedback if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'retrieval_feedback'
        AND column_name = 'query_text'
    ) THEN
        ALTER TABLE retrieval_feedback ADD COLUMN query_text TEXT NOT NULL DEFAULT '';
    END IF;
END
$$;

-- Add selected_chunk_index to retrieval_feedback if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'retrieval_feedback'
        AND column_name = 'selected_chunk_index'
    ) THEN
        ALTER TABLE retrieval_feedback ADD COLUMN selected_chunk_index INTEGER;
    END IF;
END
$$;
