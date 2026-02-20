-- Add Clio-compatible matter fields
-- These fields align with Clio's matter definition for full feature parity

-- Practice area (separate from matter type)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS practice_area VARCHAR(100);

-- Matter stage (custom workflow stage)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS matter_stage VARCHAR(100);

-- Pending date (when matter went to pending status)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS pending_date DATE;

-- Location (office/branch location for the matter)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- Client reference number (client's own internal reference)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS client_reference_number VARCHAR(100);

-- Responsible staff (non-attorney staff member)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS responsible_staff UUID REFERENCES users(id);

-- Maildrop address (Clio maildrop email for filing documents)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS maildrop_address VARCHAR(255);

-- Billable flag (Yes/No override, separate from billing_type)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS billable BOOLEAN DEFAULT true;

-- Matter notifications (array of user IDs who receive notifications)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS notification_user_ids UUID[] DEFAULT '{}';

-- Blocked users (array of user IDs explicitly blocked from this matter)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS blocked_user_ids UUID[] DEFAULT '{}';

-- Permission group IDs (groups that have access in Clio style)
ALTER TABLE matters ADD COLUMN IF NOT EXISTS permission_group_ids UUID[] DEFAULT '{}';

-- Indexes for new lookup fields
CREATE INDEX IF NOT EXISTS idx_matters_practice_area ON matters(practice_area);
CREATE INDEX IF NOT EXISTS idx_matters_matter_stage ON matters(matter_stage);
CREATE INDEX IF NOT EXISTS idx_matters_responsible_staff ON matters(responsible_staff);
CREATE INDEX IF NOT EXISTS idx_matters_location ON matters(location);
CREATE INDEX IF NOT EXISTS idx_matters_billable ON matters(billable);
