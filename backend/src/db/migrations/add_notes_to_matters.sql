-- Migration to add notes column to matters table
-- This allows storing internal notes about matters

ALTER TABLE matters ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add an index for full-text search on notes (optional, for future search capabilities)
-- CREATE INDEX IF NOT EXISTS idx_matters_notes_search ON matters USING gin(to_tsvector('english', notes));
