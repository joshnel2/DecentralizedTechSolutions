-- Desktop Client Tables for Apex Drive
-- Tracks registered desktop clients and connection codes

-- Table for registered desktop clients
CREATE TABLE IF NOT EXISTS desktop_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) DEFAULT 'windows',
    app_version VARCHAR(50),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_name)
);

-- Indexes for desktop_clients
CREATE INDEX IF NOT EXISTS idx_desktop_clients_user_id ON desktop_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_desktop_clients_firm_id ON desktop_clients(firm_id);
CREATE INDEX IF NOT EXISTS idx_desktop_clients_last_seen ON desktop_clients(last_seen_at);

-- Table for temporary connection codes (expire after 10 minutes)
CREATE TABLE IF NOT EXISTS desktop_connection_codes (
    code VARCHAR(8) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_desktop_connection_codes_expires ON desktop_connection_codes(expires_at);

-- Function to clean up expired connection codes
CREATE OR REPLACE FUNCTION cleanup_expired_connection_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM desktop_connection_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Table for drive sync status (per user)
CREATE TABLE IF NOT EXISTS drive_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(50) DEFAULT 'idle',
    pending_uploads INTEGER DEFAULT 0,
    pending_downloads INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index for drive_sync_status
CREATE INDEX IF NOT EXISTS idx_drive_sync_status_user_id ON drive_sync_status(user_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_status_firm_id ON drive_sync_status(firm_id);

-- Comments
COMMENT ON TABLE desktop_clients IS 'Registered Apex Drive desktop client installations';
COMMENT ON TABLE desktop_connection_codes IS 'Temporary codes for connecting desktop clients from web app';
COMMENT ON TABLE drive_sync_status IS 'Sync status tracking for desktop drive clients';
