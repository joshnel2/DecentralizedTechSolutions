-- Migration: Clio Document Manifest for Perfect Document Migration
-- Stores document metadata from Clio API to enable perfect file matching
-- when files are copied from Clio Drive to Azure File Share

-- ============================================
-- CLIO DOCUMENT MANIFEST
-- ============================================
-- Stores metadata for each document in Clio
-- Used to match files copied to Azure back to matters/clients

CREATE TABLE IF NOT EXISTS clio_document_manifest (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Clio identifiers
    clio_id BIGINT NOT NULL,                    -- Clio document ID
    clio_matter_id BIGINT,                      -- Clio matter ID (if attached)
    clio_client_id BIGINT,                      -- Clio client/contact ID (if attached)
    clio_folder_id BIGINT,                      -- Clio parent folder ID
    clio_created_by_id BIGINT,                  -- Clio user ID who created it
    
    -- Our mapped IDs (filled in after migration)
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Document info from Clio
    name VARCHAR(500) NOT NULL,                 -- Original filename
    clio_path TEXT,                             -- Full path in Clio Drive
    content_type VARCHAR(255),                  -- MIME type
    size BIGINT,                                -- File size in bytes
    
    -- Version info
    version_number INTEGER DEFAULT 1,
    is_latest_version BOOLEAN DEFAULT true,
    parent_version_clio_id BIGINT,              -- Previous version's Clio ID
    
    -- Timestamps from Clio
    clio_created_at TIMESTAMP WITH TIME ZONE,
    clio_updated_at TIMESTAMP WITH TIME ZONE,
    
    -- Matching status
    match_status VARCHAR(50) DEFAULT 'pending',
    -- 'pending' = not yet matched to Azure file
    -- 'matched' = found corresponding file in Azure
    -- 'imported' = document record created in documents table
    -- 'missing' = file not found in Azure (not copied yet)
    -- 'error' = error during matching/import
    
    matched_azure_path TEXT,                    -- Path in Azure where file was found
    matched_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    match_confidence DECIMAL(5,2),              -- 0-100 confidence score
    match_method VARCHAR(50),                   -- How it was matched: 'exact_path', 'filename', 'fuzzy', 'manual'
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicates
    CONSTRAINT unique_clio_doc UNIQUE (firm_id, clio_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_firm ON clio_document_manifest(firm_id);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_clio_id ON clio_document_manifest(clio_id);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_matter ON clio_document_manifest(clio_matter_id);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_client ON clio_document_manifest(clio_client_id);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_status ON clio_document_manifest(match_status);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_name ON clio_document_manifest(name);
CREATE INDEX IF NOT EXISTS idx_clio_doc_manifest_path ON clio_document_manifest(clio_path);

-- ============================================
-- CLIO FOLDER MANIFEST
-- ============================================
-- Stores folder structure from Clio for path reconstruction

CREATE TABLE IF NOT EXISTS clio_folder_manifest (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    
    -- Clio identifiers
    clio_id BIGINT NOT NULL,
    clio_parent_id BIGINT,                      -- Parent folder's Clio ID
    clio_matter_id BIGINT,                      -- If this is a matter folder
    
    -- Folder info
    name VARCHAR(500) NOT NULL,
    full_path TEXT,                             -- Computed full path
    
    -- Our mapped IDs
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_clio_folder UNIQUE (firm_id, clio_id)
);

CREATE INDEX IF NOT EXISTS idx_clio_folder_manifest_firm ON clio_folder_manifest(firm_id);
CREATE INDEX IF NOT EXISTS idx_clio_folder_manifest_parent ON clio_folder_manifest(clio_parent_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE clio_document_manifest IS 'Stores Clio document metadata for matching files during migration';
COMMENT ON TABLE clio_folder_manifest IS 'Stores Clio folder structure for path reconstruction';
COMMENT ON COLUMN clio_document_manifest.match_status IS 'pending=awaiting file copy, matched=file found, imported=document created, missing=file not in Azure';
COMMENT ON COLUMN clio_document_manifest.match_confidence IS 'How confident we are in the match (0-100)';

SELECT 'Clio document manifest migration completed!' as status;
