-- ============================================================
-- Apex Privacy-First Retrieval & Learning Tables
-- Safe to run on a live database. All IF NOT EXISTS.
-- Paste this entire block into Azure PostgreSQL Query Editor.
-- ============================================================

-- Make sure pgvector is enabled (should already be from previous migration)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. RAPTOR Summary Tree
-- Long documents get hierarchical summaries so lawyers can
-- search at section/document level, not just tiny chunks.
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

CREATE INDEX IF NOT EXISTS idx_summary_tree_firm_doc
ON document_summary_tree(firm_id, document_id, level);

CREATE INDEX IF NOT EXISTS idx_summary_tree_parent
ON document_summary_tree(parent_id)
WHERE parent_id IS NOT NULL;

-- RLS so one firm can never see another firm's summaries
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
-- 2. Matter-Specific Context
-- Tracks lawyer preferences per matter. When the same pattern
-- appears across 3+ matters, it promotes to a general preference.
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

CREATE INDEX IF NOT EXISTS idx_matter_context_lookup
ON matter_context(firm_id, lawyer_id, context_type);

CREATE INDEX IF NOT EXISTS idx_matter_context_matter
ON matter_context(firm_id, matter_id);

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
-- 3. Preference Promotion Log
-- Audit trail: when did a preference get promoted from
-- "matter-specific" to "this lawyer always does this"
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
    
    CHECK (to_layer < from_layer)
);

CREATE INDEX IF NOT EXISTS idx_promotion_log_lawyer
ON preference_promotion_log(firm_id, lawyer_id, promoted_at DESC);

-- ============================================================
-- 4. Better indexes on existing tables
-- Makes search faster. Safe to add on live database.
-- ============================================================

-- Full-text search on chunk text (keyword search)
CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_fulltext
ON document_embeddings USING gin(to_tsvector('english', chunk_text));

-- Faster filtered vector search
CREATE INDEX IF NOT EXISTS idx_embeddings_firm_matter
ON document_embeddings(firm_id, document_id);

-- Faster graph traversal for citation networks
CREATE INDEX IF NOT EXISTS idx_doc_relationships_traversal
ON document_relationships(firm_id, source_document_id, relationship_type, confidence DESC);

-- Faster retrieval feedback analysis
CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_analysis
ON retrieval_feedback(firm_id, lawyer_id, created_at DESC);

-- Faster edit pattern analysis
CREATE INDEX IF NOT EXISTS idx_edit_patterns_analysis
ON edit_patterns(firm_id, lawyer_id, context, occurrences DESC);

-- Faster lawyer preference lookups
CREATE INDEX IF NOT EXISTS idx_lawyer_prefs_ranked
ON lawyer_preferences(firm_id, lawyer_id, preference_type, confidence DESC);

-- ============================================================
-- 5. Add columns to existing tables (safe, checks first)
-- ============================================================

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

-- ============================================================
-- Done. You should see no errors.
-- New tables: document_summary_tree, matter_context, preference_promotion_log
-- New indexes: 6 indexes on existing tables for faster search
-- New columns: 5 columns added to existing tables
-- ============================================================
