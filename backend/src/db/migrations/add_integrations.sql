-- Add integrations table for OAuth connections
-- Run this migration to enable Google Calendar, QuickBooks, and Outlook integrations

-- ============================================
-- INTEGRATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    is_connected BOOLEAN DEFAULT false,
    account_email VARCHAR(255),
    account_name VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    settings JSONB DEFAULT '{}',
    sync_enabled BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    connected_by UUID REFERENCES users(id),
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, provider)
);

-- Add external sync columns to calendar_events if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calendar_events' AND column_name = 'external_id') THEN
        ALTER TABLE calendar_events ADD COLUMN external_id VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calendar_events' AND column_name = 'external_source') THEN
        ALTER TABLE calendar_events ADD COLUMN external_source VARCHAR(50);
    END IF;
END $$;

-- Add external sync columns to invoices if they don't exist (for QuickBooks sync)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'external_id') THEN
        ALTER TABLE invoices ADD COLUMN external_id VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'external_source') THEN
        ALTER TABLE invoices ADD COLUMN external_source VARCHAR(50);
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_integrations_firm_id ON integrations(firm_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
CREATE INDEX IF NOT EXISTS idx_calendar_events_external_id ON calendar_events(external_id);
CREATE INDEX IF NOT EXISTS idx_invoices_external_id ON invoices(external_id);

-- Add trigger for updated_at
CREATE TRIGGER update_integrations_updated_at 
    BEFORE UPDATE ON integrations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
