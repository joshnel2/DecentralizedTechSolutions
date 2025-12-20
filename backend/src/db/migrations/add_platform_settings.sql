-- Platform settings table for storing integration credentials
-- These are platform-level settings, not per-firm

CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    encrypted BOOLEAN DEFAULT false,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(key);

-- Insert default settings placeholders
INSERT INTO platform_settings (key, description) VALUES
    ('microsoft_client_id', 'Microsoft/Outlook OAuth Client ID'),
    ('microsoft_client_secret', 'Microsoft/Outlook OAuth Client Secret'),
    ('microsoft_redirect_uri', 'Microsoft/Outlook OAuth Redirect URI'),
    ('microsoft_tenant', 'Microsoft Tenant ID (use "common" for multi-tenant)'),
    ('quickbooks_client_id', 'QuickBooks OAuth Client ID'),
    ('quickbooks_client_secret', 'QuickBooks OAuth Client Secret'),
    ('quickbooks_redirect_uri', 'QuickBooks OAuth Redirect URI'),
    ('quickbooks_environment', 'QuickBooks Environment (sandbox or production)'),
    ('google_client_id', 'Google OAuth Client ID'),
    ('google_client_secret', 'Google OAuth Client Secret'),
    ('google_redirect_uri', 'Google OAuth Redirect URI')
ON CONFLICT (key) DO NOTHING;
