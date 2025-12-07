-- Migration: Add notes field to matters table
-- This allows storing free-form notes on matters similar to clients

ALTER TABLE matters ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN matters.notes IS 'Free-form notes for the matter';
