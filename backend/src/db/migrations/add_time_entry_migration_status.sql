-- Migration: Add fields to track Clio migration source for time entries and expenses
-- This enables deduplication, updates, and audit trail for migrated data

-- Add clio_id to time_entries for tracking source activity
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS clio_id BIGINT;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS clio_created_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS clio_updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS migration_source VARCHAR(50);

-- Add clio_id to expenses for tracking source activity
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS clio_id BIGINT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS clio_created_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS clio_updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS migration_source VARCHAR(50);

-- Create indexes for efficient lookups during migration
CREATE INDEX IF NOT EXISTS idx_time_entries_clio_id ON time_entries(clio_id) WHERE clio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_migration_source ON time_entries(migration_source) WHERE migration_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_clio_id ON expenses(clio_id) WHERE clio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_migration_source ON expenses(migration_source) WHERE migration_source IS NOT NULL;

-- Create unique constraint to prevent duplicate imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_clio_unique ON time_entries(firm_id, clio_id) WHERE clio_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_clio_unique ON expenses(firm_id, clio_id) WHERE clio_id IS NOT NULL;
