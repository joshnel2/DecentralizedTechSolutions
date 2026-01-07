-- Migration: Add QuickBooks sync tracking fields
-- This enables two-way sync between Apex and QuickBooks

-- Add QuickBooks tracking fields to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS quickbooks_id VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS quickbooks_sync_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS quickbooks_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS quickbooks_sync_error TEXT;

-- Add QuickBooks tracking fields to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quickbooks_id VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quickbooks_sync_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quickbooks_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quickbooks_sync_error TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quickbooks_customer_id VARCHAR(100);

-- Add QuickBooks customer ID to clients table for mapping
ALTER TABLE clients ADD COLUMN IF NOT EXISTS quickbooks_id VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS quickbooks_synced_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_quickbooks_id ON payments(quickbooks_id) WHERE quickbooks_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_quickbooks_sync_status ON payments(quickbooks_sync_status) WHERE quickbooks_sync_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invoices_quickbooks_id ON invoices(quickbooks_id) WHERE quickbooks_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_quickbooks_sync_status ON invoices(quickbooks_sync_status) WHERE quickbooks_sync_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_clients_quickbooks_id ON clients(quickbooks_id) WHERE quickbooks_id IS NOT NULL;

-- Add constraint for valid sync statuses
-- Valid values: pending, synced, failed, not_applicable
COMMENT ON COLUMN payments.quickbooks_sync_status IS 'Status of QuickBooks sync: pending, synced, failed, not_applicable';
COMMENT ON COLUMN invoices.quickbooks_sync_status IS 'Status of QuickBooks sync: pending, synced, failed, not_applicable';
