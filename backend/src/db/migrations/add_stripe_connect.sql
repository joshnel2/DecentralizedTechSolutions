-- Stripe Connect integration for Apex Pay
-- Stores connected Stripe accounts for each firm

CREATE TABLE IF NOT EXISTS stripe_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  
  -- Stripe Connect account info
  stripe_account_id VARCHAR(255) NOT NULL, -- acct_xxxxx
  stripe_account_type VARCHAR(50) DEFAULT 'standard', -- standard, express, custom
  
  -- Account details from Stripe
  business_name VARCHAR(255),
  email VARCHAR(255),
  country VARCHAR(10) DEFAULT 'US',
  
  -- Connection status
  is_connected BOOLEAN DEFAULT true,
  charges_enabled BOOLEAN DEFAULT false,
  payouts_enabled BOOLEAN DEFAULT false,
  details_submitted BOOLEAN DEFAULT false,
  
  -- Settings
  default_to_trust BOOLEAN DEFAULT false,
  trust_account_label VARCHAR(255) DEFAULT 'Client Trust Account (IOLTA)',
  operating_account_label VARCHAR(255) DEFAULT 'Operating Account',
  
  -- Accepted payment methods
  accept_cards BOOLEAN DEFAULT true,
  accept_ach BOOLEAN DEFAULT true,
  accept_apple_pay BOOLEAN DEFAULT false,
  accept_google_pay BOOLEAN DEFAULT false,
  
  -- Compliance
  compliance_accepted_at TIMESTAMPTZ,
  compliance_accepted_by UUID REFERENCES users(id),
  
  -- Metadata
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(firm_id)
);

-- Transactions table for tracking payments
CREATE TABLE IF NOT EXISTS stripe_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  stripe_connection_id UUID REFERENCES stripe_connections(id) ON DELETE SET NULL,
  
  -- Stripe identifiers
  stripe_payment_intent_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  stripe_transfer_id VARCHAR(255),
  
  -- Related records
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  
  -- Payment details
  amount_cents INTEGER NOT NULL, -- Amount in cents
  fee_cents INTEGER DEFAULT 0,
  net_amount_cents INTEGER,
  currency VARCHAR(10) DEFAULT 'usd',
  
  -- Payment method
  payment_method VARCHAR(50), -- card, ach_debit, apple_pay, google_pay
  card_brand VARCHAR(50), -- visa, mastercard, amex, etc.
  card_last4 VARCHAR(4),
  
  -- Account routing
  account_type VARCHAR(20) DEFAULT 'operating', -- operating, trust
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed, refunded, disputed
  failure_reason TEXT,
  
  -- Metadata
  description TEXT,
  receipt_email VARCHAR(255),
  receipt_sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_stripe_connections_firm ON stripe_connections(firm_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_firm ON stripe_transactions(firm_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_invoice ON stripe_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_status ON stripe_transactions(status);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_created ON stripe_transactions(created_at DESC);
