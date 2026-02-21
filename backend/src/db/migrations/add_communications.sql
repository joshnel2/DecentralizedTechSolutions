-- Communications log for tracking all client interactions
CREATE TABLE IF NOT EXISTS communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'note',
    direction VARCHAR(10) DEFAULT 'outbound',
    subject TEXT,
    body TEXT,
    from_address TEXT,
    to_address TEXT,
    phone_number TEXT,
    duration_seconds INTEGER,
    is_billable BOOLEAN DEFAULT false,
    time_entry_id UUID,
    external_id TEXT,
    external_source VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communications_firm ON communications(firm_id);
CREATE INDEX IF NOT EXISTS idx_communications_matter ON communications(matter_id);
CREATE INDEX IF NOT EXISTS idx_communications_client ON communications(client_id);
CREATE INDEX IF NOT EXISTS idx_communications_type ON communications(type);
CREATE INDEX IF NOT EXISTS idx_communications_created ON communications(created_at DESC);
