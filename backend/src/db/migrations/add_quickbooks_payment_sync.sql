-- Add QuickBooks payment sync tracking
-- This migration adds columns to track which payments have been synced to QuickBooks

-- Add external sync columns to payments table for QuickBooks sync
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'external_id') THEN
        ALTER TABLE payments ADD COLUMN external_id VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'external_source') THEN
        ALTER TABLE payments ADD COLUMN external_source VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'sync_status') THEN
        ALTER TABLE payments ADD COLUMN sync_status VARCHAR(50) DEFAULT 'pending';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'sync_error') THEN
        ALTER TABLE payments ADD COLUMN sync_error TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'synced_at') THEN
        ALTER TABLE payments ADD COLUMN synced_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'retry_count') THEN
        ALTER TABLE payments ADD COLUMN retry_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add index for finding unsynced payments
CREATE INDEX IF NOT EXISTS idx_payments_sync_status ON payments(sync_status) WHERE external_source IS NOT NULL OR sync_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_payments_external_id ON payments(external_id) WHERE external_id IS NOT NULL;

-- Add QuickBooks customer ID tracking to clients for proper invoice/payment linking
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'quickbooks_customer_id') THEN
        ALTER TABLE clients ADD COLUMN quickbooks_customer_id VARCHAR(255);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_quickbooks_customer_id ON clients(quickbooks_customer_id) WHERE quickbooks_customer_id IS NOT NULL;

-- Add QuickBooks invoice ID tracking to invoices for payment linking
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'quickbooks_invoice_id') THEN
        ALTER TABLE invoices ADD COLUMN quickbooks_invoice_id VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'quickbooks_sync_status') THEN
        ALTER TABLE invoices ADD COLUMN quickbooks_sync_status VARCHAR(50) DEFAULT 'pending';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_quickbooks_invoice_id ON invoices(quickbooks_invoice_id) WHERE quickbooks_invoice_id IS NOT NULL;

-- Track failed sync attempts for retry logic (better than Clio!)
CREATE TABLE IF NOT EXISTS quickbooks_sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL, -- 'payment', 'invoice', 'customer'
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete'
    payload JSONB,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_qb_sync_queue_status ON quickbooks_sync_queue(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_qb_sync_queue_firm ON quickbooks_sync_queue(firm_id);

-- Add unique constraint on stripe_payment_intent_id to prevent duplicates
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stripe_transactions_payment_intent_unique'
    ) THEN
        ALTER TABLE stripe_transactions ADD CONSTRAINT stripe_transactions_payment_intent_unique 
        UNIQUE (stripe_payment_intent_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Ignore if column doesn't exist or constraint can't be added
    NULL;
END $$;

-- Add error_message column to stripe_transactions if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stripe_transactions' AND column_name = 'error_message') THEN
        ALTER TABLE stripe_transactions ADD COLUMN error_message TEXT;
    END IF;
END $$;
