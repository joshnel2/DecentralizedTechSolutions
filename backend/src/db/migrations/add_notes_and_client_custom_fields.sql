-- Migration: Add Notes table and Client custom fields for Clio import
-- Run this migration on your PostgreSQL database

-- ============================================
-- NOTES TABLE (Matter and Client notes from Clio)
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Note content
    subject VARCHAR(500),
    content TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'general',
    
    -- Clio import tracking
    clio_id BIGINT,
    clio_created_at TIMESTAMP WITH TIME ZONE,
    clio_updated_at TIMESTAMP WITH TIME ZONE,
    
    -- Privacy
    is_private BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Either matter_id OR client_id should be set (can be both for matter note with client context)
    CONSTRAINT valid_note_type CHECK (type IN ('general', 'phone_call', 'meeting', 'email', 'court', 'research', 'file_review', 'other'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_firm_id ON notes(firm_id);
CREATE INDEX IF NOT EXISTS idx_notes_matter_id ON notes(matter_id);
CREATE INDEX IF NOT EXISTS idx_notes_client_id ON notes(client_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_clio_id ON notes(clio_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_firm_clio_id ON notes(firm_id, clio_id) WHERE clio_id IS NOT NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TASKS TABLE (Standalone tasks from Clio)
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Task details
    name VARCHAR(500) NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'pending',
    
    -- Dates
    due_date DATE,
    due_time TIME,
    completed_at TIMESTAMP WITH TIME ZONE,
    reminder_at TIMESTAMP WITH TIME ZONE,
    
    -- Clio import tracking
    clio_id BIGINT,
    clio_created_at TIMESTAMP WITH TIME ZONE,
    clio_updated_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_task_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    CONSTRAINT valid_task_status CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_firm_id ON tasks(firm_id);
CREATE INDEX IF NOT EXISTS idx_tasks_matter_id ON tasks(matter_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_clio_id ON tasks(clio_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_firm_clio_id ON tasks(firm_id, clio_id) WHERE clio_id IS NOT NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ADD CUSTOM FIELDS TO CLIENTS
-- ============================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- ============================================
-- ACTIVITY CODES TABLE (UTBMS/LEDES codes)
-- ============================================
CREATE TABLE IF NOT EXISTS activity_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    rate_override DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    
    -- Clio import tracking
    clio_id BIGINT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_firm_code UNIQUE (firm_id, code)
);

CREATE INDEX IF NOT EXISTS idx_activity_codes_firm_id ON activity_codes(firm_id);
CREATE INDEX IF NOT EXISTS idx_activity_codes_code ON activity_codes(code);

-- Add activity_code_id reference to time_entries
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS activity_code_id UUID REFERENCES activity_codes(id);

-- ============================================
-- ADD RECURRENCE FIELDS TO CALENDAR_EVENTS (if not present)
-- ============================================
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence_count INTEGER;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS clio_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_firm_clio_id ON calendar_events(firm_id, clio_id) WHERE clio_id IS NOT NULL;

-- ============================================
-- ADD CLIO ID TRACKING TO VARIOUS TABLES
-- ============================================
ALTER TABLE matters ADD COLUMN IF NOT EXISTS clio_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_matters_firm_clio_id ON matters(firm_id, clio_id) WHERE clio_id IS NOT NULL;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS clio_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_firm_clio_id ON clients(firm_id, clio_id) WHERE clio_id IS NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS clio_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firm_clio_id ON users(firm_id, clio_id) WHERE clio_id IS NOT NULL;

-- Comments
COMMENT ON TABLE notes IS 'Notes attached to matters or clients, imported from Clio or created in Apex';
COMMENT ON TABLE tasks IS 'Tasks/to-dos for matters, imported from Clio or created in Apex';
COMMENT ON TABLE activity_codes IS 'UTBMS/LEDES activity codes for time entries';
COMMENT ON COLUMN clients.custom_fields IS 'Custom field data from Clio stored as JSON';

SELECT 'Migration complete: Added notes, tasks, activity_codes tables and custom_fields to clients' as status;
