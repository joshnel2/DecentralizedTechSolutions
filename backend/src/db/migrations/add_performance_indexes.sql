-- Performance indexes for faster matter and client queries
-- These indexes speed up the common list queries significantly

-- Matters table indexes
CREATE INDEX IF NOT EXISTS idx_matters_firm_id ON matters(firm_id);
CREATE INDEX IF NOT EXISTS idx_matters_firm_created ON matters(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matters_responsible_attorney ON matters(responsible_attorney);
CREATE INDEX IF NOT EXISTS idx_matters_originating_attorney ON matters(originating_attorney);
CREATE INDEX IF NOT EXISTS idx_matters_created_by ON matters(created_by);
CREATE INDEX IF NOT EXISTS idx_matters_client_id ON matters(client_id);
CREATE INDEX IF NOT EXISTS idx_matters_status ON matters(status);
CREATE INDEX IF NOT EXISTS idx_matters_firm_status ON matters(firm_id, status);

-- Clients table indexes  
CREATE INDEX IF NOT EXISTS idx_clients_firm_id ON clients(firm_id);
CREATE INDEX IF NOT EXISTS idx_clients_firm_name ON clients(firm_id, display_name);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);

-- Matter assignments indexes (used heavily in "my matters" filter)
CREATE INDEX IF NOT EXISTS idx_matter_assignments_user_id ON matter_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_matter_assignments_matter_id ON matter_assignments(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_assignments_matter_user ON matter_assignments(matter_id, user_id);

-- Composite index for the "my matters" query pattern
CREATE INDEX IF NOT EXISTS idx_matters_my_matters ON matters(firm_id, responsible_attorney, originating_attorney, created_by);
