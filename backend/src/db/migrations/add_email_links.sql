-- Add email_links table for tracking emails linked to matters
-- Run this migration to enable email-matter linking functionality

-- ============================================
-- EMAIL LINKS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS email_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    email_id VARCHAR(500) NOT NULL,
    email_provider VARCHAR(50) DEFAULT 'outlook',
    subject TEXT,
    from_address VARCHAR(255),
    to_addresses TEXT[], -- Array of recipient addresses
    received_at TIMESTAMP WITH TIME ZONE,
    linked_by UUID REFERENCES users(id),
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_links_firm_id ON email_links(firm_id);
CREATE INDEX IF NOT EXISTS idx_email_links_matter_id ON email_links(matter_id);
CREATE INDEX IF NOT EXISTS idx_email_links_client_id ON email_links(client_id);
CREATE INDEX IF NOT EXISTS idx_email_links_email_id ON email_links(email_id);

-- Add external_id and external_source to clients table for QuickBooks sync
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'external_id') THEN
        ALTER TABLE clients ADD COLUMN external_id VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'external_source') THEN
        ALTER TABLE clients ADD COLUMN external_source VARCHAR(50);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_external_id ON clients(external_id);
