-- Add originating_attorney field to matters table
ALTER TABLE matters ADD COLUMN IF NOT EXISTS originating_attorney UUID REFERENCES users(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_matters_originating_attorney ON matters(originating_attorney);
