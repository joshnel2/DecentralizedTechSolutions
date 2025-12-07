-- Migration: Add notes field to matters table
-- This allows users to add separate notes to matters (distinct from description)

ALTER TABLE matters ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add an index for searching notes (optional, but useful for large datasets)
CREATE INDEX IF NOT EXISTS idx_matters_notes ON matters USING gin(to_tsvector('english', COALESCE(notes, '')));
