-- Migration: Add document templates and generated documents tables
-- For document automation feature

-- ============================================
-- DOCUMENT TEMPLATES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS document_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'custom',
    practice_area VARCHAR(100),
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    ai_enabled BOOLEAN DEFAULT false,
    ai_prompts JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_category CHECK (category IN ('contract', 'letter', 'pleading', 'discovery', 'estate', 'corporate', 'custom'))
);

-- ============================================
-- GENERATED DOCUMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS generated_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'draft',
    ai_review_notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'review', 'approved', 'sent'))
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_document_templates_firm_id ON document_templates(firm_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_category ON document_templates(category);
CREATE INDEX IF NOT EXISTS idx_document_templates_is_active ON document_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_generated_documents_firm_id ON generated_documents(firm_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_template_id ON generated_documents(template_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_matter_id ON generated_documents(matter_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_client_id ON generated_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_status ON generated_documents(status);

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================

-- Apply updated_at trigger for document_templates
DROP TRIGGER IF EXISTS update_document_templates_updated_at ON document_templates;
CREATE TRIGGER update_document_templates_updated_at 
    BEFORE UPDATE ON document_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply updated_at trigger for generated_documents
DROP TRIGGER IF EXISTS update_generated_documents_updated_at ON generated_documents;
CREATE TRIGGER update_generated_documents_updated_at 
    BEFORE UPDATE ON generated_documents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ADD COMMENT FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE document_templates IS 'Stores reusable document templates for document automation';
COMMENT ON TABLE generated_documents IS 'Stores documents generated from templates';
COMMENT ON COLUMN document_templates.variables IS 'JSON array of template variables with properties: id, name, label, type, defaultValue, options, required, aiAutoFill';
COMMENT ON COLUMN document_templates.ai_prompts IS 'JSON array of AI prompts with properties: id, name, prompt, targetVariable, action';
