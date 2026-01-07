-- Migration: Add matter_contacts table for related parties
-- This table stores opposing parties, witnesses, co-counsel, and other related contacts

CREATE TABLE IF NOT EXISTS matter_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100), -- e.g., 'Opposing Party', 'Opposing Counsel', 'Witness', 'Expert', 'Co-Counsel'
    firm VARCHAR(255), -- Their law firm if applicable
    email VARCHAR(255),
    phone VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_matter_contacts_matter_id ON matter_contacts(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_contacts_firm_id ON matter_contacts(firm_id);
CREATE INDEX IF NOT EXISTS idx_matter_contacts_name ON matter_contacts(LOWER(name));

-- Comments
COMMENT ON TABLE matter_contacts IS 'Related parties and contacts for matters - used for conflict checking';
COMMENT ON COLUMN matter_contacts.role IS 'Role of the contact: Opposing Party, Opposing Counsel, Witness, Expert, Co-Counsel, etc.';
