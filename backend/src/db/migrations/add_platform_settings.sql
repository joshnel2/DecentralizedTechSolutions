-- Platform-wide settings for OAuth credentials and other configurations
-- These are admin-only settings that apply to the entire platform

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

-- Create indexes
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

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_platform_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_platform_settings_updated_at ON platform_settings;
CREATE TRIGGER update_platform_settings_updated_at 
    BEFORE UPDATE ON platform_settings 
    FOR EACH ROW EXECUTE FUNCTION update_platform_settings_updated_at();
