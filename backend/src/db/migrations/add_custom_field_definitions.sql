-- Custom field definitions that admins configure
CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    entity_type VARCHAR(30) NOT NULL DEFAULT 'matter',
    field_key VARCHAR(100) NOT NULL,
    field_label VARCHAR(200) NOT NULL,
    field_type VARCHAR(30) NOT NULL DEFAULT 'text',
    options JSONB DEFAULT '[]',
    is_required BOOLEAN DEFAULT false,
    is_visible BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, entity_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_defs_firm ON custom_field_definitions(firm_id, entity_type);
