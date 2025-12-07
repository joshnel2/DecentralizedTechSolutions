-- Migration: Add notes column to matters table
-- Run this in Azure Cloud Shell with:
-- psql -h strapped_ai.postgres.database.azure.com -U josh -d apexdb -W

ALTER TABLE matters ADD COLUMN IF NOT EXISTS notes TEXT;
