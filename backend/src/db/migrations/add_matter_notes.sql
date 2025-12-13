-- Migration: Add notes column to matters table
-- This enables the Notes tab functionality in the matter detail page

ALTER TABLE matters ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN matters.notes IS 'Internal notes about the matter (not shown on invoices or client-facing documents)';
