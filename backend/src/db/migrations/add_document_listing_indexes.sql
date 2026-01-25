-- ============================================
-- Document Listing Performance Indexes
-- ============================================
-- These indexes optimize the document listing queries used in the
-- /api/documents endpoint for fast filtering and pagination.
--
-- Key query patterns optimized:
-- 1. Filter by firm_id + uploaded_by/owner_id (personal documents)
-- 2. Filter by firm_id + matter_id (matter documents)
-- 3. Filter by firm_id + privacy_level (firm-wide documents)
-- 4. Search by name with ILIKE (trigram index)
-- 5. Sort by folder_path + name (hierarchical listing)
-- 6. Sort by uploaded_at DESC (recent documents)

-- Index for user's own documents (uploaded_by or owner_id lookup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_firm_uploaded_by 
ON documents(firm_id, uploaded_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_firm_owner_id 
ON documents(firm_id, owner_id);

-- Index for matter-based document filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_firm_matter_id 
ON documents(firm_id, matter_id) 
WHERE matter_id IS NOT NULL;

-- Index for privacy level filtering (firm-wide documents)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_firm_privacy 
ON documents(firm_id, privacy_level);

-- Index for folder path filtering and sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_firm_folder_name 
ON documents(firm_id, folder_path, name);

-- Index for recent documents sorting (most common sort order)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_firm_uploaded_at 
ON documents(firm_id, uploaded_at DESC);

-- Index for name search optimization (requires pg_trgm extension)
-- This enables fast ILIKE searches on document names
DO $$
BEGIN
    -- First check if pg_trgm extension exists
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        -- Create trigram index for fast name searches
        EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_name_trgm 
                 ON documents USING gin (name gin_trgm_ops)';
    ELSE
        -- Try to create the extension (requires superuser privileges)
        BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
            EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_name_trgm 
                     ON documents USING gin (name gin_trgm_ops)';
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'pg_trgm extension not available - name search will use B-tree index';
            -- Fallback: Create a B-tree index on name (less efficient for ILIKE but still helps)
            EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_name_btree 
                     ON documents(name varchar_pattern_ops)';
        END;
    END IF;
END $$;

-- Composite index for the common "my documents" query pattern
-- This covers: uploaded_by OR owner_id filtering with firm_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_my_docs 
ON documents(firm_id, uploaded_by, owner_id, privacy_level);

-- Index for storage location filtering (Azure vs local)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_storage 
ON documents(firm_id, storage_location) 
WHERE storage_location IS NOT NULL;

-- Index for Clio document matching (clio_id lookup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_clio_id 
ON documents(firm_id, clio_id) 
WHERE clio_id IS NOT NULL;

-- ============================================
-- Clio Document Manifest Indexes
-- ============================================
-- Optimize the Clio migration tracking queries

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clio_manifest_firm_status 
ON clio_document_manifest(firm_id, match_status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clio_manifest_firm_pending 
ON clio_document_manifest(firm_id, clio_id) 
WHERE match_status = 'pending';

-- ============================================
-- Matter Permission Indexes
-- ============================================
-- Optimize the matter access checks used in document filtering

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matter_permissions_user_id 
ON matter_permissions(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matter_permissions_matter_user 
ON matter_permissions(matter_id, user_id);

-- ============================================
-- Document Permissions Indexes
-- ============================================
-- Optimize document-level permission checks

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_permissions_user 
ON document_permissions(user_id, can_view) 
WHERE can_view = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_permissions_doc_user 
ON document_permissions(document_id, user_id);

-- ANALYZE tables to update statistics for query planner
ANALYZE documents;
ANALYZE clio_document_manifest;
ANALYZE matter_permissions;
ANALYZE document_permissions;
