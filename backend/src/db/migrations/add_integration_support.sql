-- ============================================
-- INTEGRATION SUPPORT MIGRATION
-- Run this on your Azure PostgreSQL database
-- ============================================

-- 1. Platform Settings Table (for OAuth credentials)
CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    is_secret BOOLEAN DEFAULT false,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(key);

-- Insert default settings (empty - to be configured via admin UI)
INSERT INTO platform_settings (key, value, is_secret, description) VALUES
    ('microsoft_client_id', '', false, 'Microsoft Azure App Client ID for Outlook integration'),
    ('microsoft_client_secret', '', true, 'Microsoft Azure App Client Secret'),
    ('microsoft_redirect_uri', '', false, 'Microsoft OAuth Redirect URI'),
    ('microsoft_tenant', 'common', false, 'Microsoft Tenant ID (common for multi-tenant)'),
    ('quickbooks_client_id', '', false, 'QuickBooks/Intuit App Client ID'),
    ('quickbooks_client_secret', '', true, 'QuickBooks App Client Secret'),
    ('quickbooks_redirect_uri', '', false, 'QuickBooks OAuth Redirect URI'),
    ('quickbooks_environment', 'sandbox', false, 'QuickBooks environment (sandbox or production)'),
    ('google_client_id', '', false, 'Google Cloud App Client ID for Calendar integration'),
    ('google_client_secret', '', true, 'Google Cloud App Client Secret'),
    ('google_redirect_uri', '', false, 'Google OAuth Redirect URI')
ON CONFLICT (key) DO NOTHING;

-- 2. Email Links Table (for linking emails to matters)
CREATE TABLE IF NOT EXISTS email_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    email_id VARCHAR(500) NOT NULL,
    email_provider VARCHAR(50) DEFAULT 'outlook',
    subject TEXT,
    from_address VARCHAR(255),
    to_addresses TEXT[],
    received_at TIMESTAMP WITH TIME ZONE,
    linked_by UUID REFERENCES users(id),
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_links_firm_id ON email_links(firm_id);
CREATE INDEX IF NOT EXISTS idx_email_links_matter_id ON email_links(matter_id);
CREATE INDEX IF NOT EXISTS idx_email_links_email_id ON email_links(email_id);

-- 3. Add external sync columns to clients (for QuickBooks sync)
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

-- 4. Ensure integrations table exists (if not already)
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

CREATE INDEX IF NOT EXISTS idx_integrations_firm_id ON integrations(firm_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);

-- 5. Add external sync columns to calendar_events and invoices (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calendar_events' AND column_name = 'external_id') THEN
        ALTER TABLE calendar_events ADD COLUMN external_id VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calendar_events' AND column_name = 'external_source') THEN
        ALTER TABLE calendar_events ADD COLUMN external_source VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'external_id') THEN
        ALTER TABLE invoices ADD COLUMN external_id VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'external_source') THEN
        ALTER TABLE invoices ADD COLUMN external_source VARCHAR(50);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_calendar_events_external_id ON calendar_events(external_id);
CREATE INDEX IF NOT EXISTS idx_invoices_external_id ON invoices(external_id);

-- Done!
SELECT 'Integration support migration completed successfully!' as status;
