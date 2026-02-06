-- Vector Embedding Support for Semantic Search
-- Enables pgvector extension and updates document_ai_insights table for vector search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document_embeddings table for chunk-level embeddings
CREATE TABLE IF NOT EXISTS document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    chunk_text TEXT NOT NULL,
    chunk_hash VARCHAR(64) NOT NULL, -- SHA-256 of chunk_text for deduplication
    embedding VECTOR(1536),            -- OpenAI text-embedding-3-small dimension
    encrypted_embedding BYTEA,        -- AES-256-GCM encrypted embedding for additional security
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure tenant isolation
    UNIQUE(firm_id, document_id, chunk_index),
    CONSTRAINT chunk_index_nonnegative CHECK (chunk_index >= 0)
);

-- Index for fast similarity search per firm
CREATE INDEX IF NOT EXISTS idx_document_embeddings_firm_embedding 
ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
WHERE firm_id IS NOT NULL;

-- Index for chunk hash lookups
CREATE INDEX IF NOT EXISTS idx_document_embeddings_chunk_hash 
ON document_embeddings(firm_id, chunk_hash);

-- Enable Row-Level Security for extra isolation
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

-- Create RLS policy (if not already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'document_embeddings' 
        AND policyname = 'firm_isolation_policy'
    ) THEN
        CREATE POLICY firm_isolation_policy ON document_embeddings
            USING (firm_id = current_setting('app.current_firm_id')::UUID);
    END IF;
END
$$;

-- Create document_relationships table for citation and dependency graphs
CREATE TABLE IF NOT EXISTS document_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL CHECK (
        relationship_type IN ('cites', 'references', 'amends', 'depends_on', 'similar_to', 'contradicts', 'supersedes')
    ),
    confidence FLOAT DEFAULT 1.0,
    context TEXT, -- Optional context about the relationship
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure no self-relationships
    CHECK (source_document_id != target_document_id),
    
    -- Unique constraint per relationship type
    UNIQUE(firm_id, source_document_id, target_document_id, relationship_type)
);

-- Index for fast relationship lookups
CREATE INDEX IF NOT EXISTS idx_document_relationships_source 
ON document_relationships(firm_id, source_document_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_document_relationships_target 
ON document_relationships(firm_id, target_document_id, relationship_type);

-- Create lawyer_preferences table for learning system
CREATE TABLE IF NOT EXISTS lawyer_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_type VARCHAR(50) NOT NULL,
    preference_key VARCHAR(100) NOT NULL,
    preference_value JSONB NOT NULL,
    confidence FLOAT DEFAULT 0.5,
    source VARCHAR(50) NOT NULL DEFAULT 'explicit' CHECK (
        source IN ('explicit', 'inferred', 'imported', 'default')
    ),
    occurrences INTEGER DEFAULT 1,
    context VARCHAR(100), -- Document type, matter type, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint per lawyer-preference combination
    UNIQUE(firm_id, lawyer_id, preference_type, preference_key)
);

-- Index for fast preference lookups
CREATE INDEX IF NOT EXISTS idx_lawyer_preferences_lookup 
ON lawyer_preferences(firm_id, lawyer_id, preference_type);

-- Create retrieval_feedback table for implicit learning
CREATE TABLE IF NOT EXISTS retrieval_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query_hash VARCHAR(64) NOT NULL, -- SHA-256 of original query
    query_text TEXT NOT NULL,
    retrieved_document_ids UUID[] NOT NULL,
    selected_document_id UUID, -- Which document was selected/used
    selected_chunk_index INTEGER,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    session_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for feedback analysis
CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_lookup 
ON retrieval_feedback(firm_id, lawyer_id, query_hash);

-- Create edit_patterns table for detecting lawyer style preferences
CREATE TABLE IF NOT EXISTS edit_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_text_hash VARCHAR(64) NOT NULL,
    edited_text_hash VARCHAR(64) NOT NULL,
    original_text_prefix TEXT, -- First 100 chars for context
    edited_text_prefix TEXT,  -- First 100 chars for context
    context VARCHAR(100) NOT NULL, -- 'contract_clause', 'motion_intro', 'email_signature', etc.
    occurrences INTEGER DEFAULT 1,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint per pattern
    UNIQUE(firm_id, lawyer_id, original_text_hash, edited_text_hash, context)
);

-- Update document_ai_insights table: change content_embedding from BYTEA to VECTOR(1536)
-- Note: We'll create a new column and migrate data gradually
-- First add vector column (nullable)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_ai_insights' 
        AND column_name = 'embedding_vector'
    ) THEN
        ALTER TABLE document_ai_insights ADD COLUMN embedding_vector VECTOR(1536);
    END IF;
END
$$;

-- Add index for vector column
CREATE INDEX IF NOT EXISTS idx_document_ai_insights_embedding 
ON document_ai_insights USING ivfflat (embedding_vector vector_cosine_ops)
WHERE embedding_vector IS NOT NULL;

-- Add encrypted embedding column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_ai_insights' 
        AND column_name = 'encrypted_embedding'
    ) THEN
        ALTER TABLE document_ai_insights ADD COLUMN encrypted_embedding BYTEA;
    END IF;
END
$$;

-- Add index for firm isolation
CREATE INDEX IF NOT EXISTS idx_document_ai_insights_firm_embedding 
ON document_ai_insights(firm_id) 
WHERE embedding_vector IS NOT NULL;

-- Create function to migrate existing BYTEA embeddings to vector format
-- This will be called manually after Azure OpenAI embedding generation
CREATE OR REPLACE FUNCTION migrate_bytea_to_vector(
    p_firm_id UUID,
    p_document_id UUID,
    p_embedding_vector VECTOR(1536),
    p_encrypted_embedding BYTEA DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE document_ai_insights
    SET 
        embedding_vector = p_embedding_vector,
        encrypted_embedding = COALESCE(p_encrypted_embedding, encrypted_embedding),
        updated_at = NOW()
    WHERE firm_id = p_firm_id
      AND document_id = p_document_id;
END;
$$ LANGUAGE plpgsql;