-- Migration: Move localStorage data to database
-- This migration adds tables for:
-- 1. Matter Types (apex-data-store)
-- 2. AI Chat Conversations (apex-ai)
-- 3. Billing/Trust Data (apex-billing)
-- 4. Document Templates (apex-templates)
-- 5. Timer State (global-timer)

-- ============================================
-- 1. MATTER TYPES
-- ============================================

CREATE TABLE IF NOT EXISTS matter_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    value VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firm_id, value)
);

CREATE INDEX IF NOT EXISTS idx_matter_types_firm_id ON matter_types(firm_id);

-- Trigger for updated_at
CREATE TRIGGER update_matter_types_updated_at 
    BEFORE UPDATE ON matter_types 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. AI CONVERSATIONS & MESSAGES
-- ============================================

CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
    mode VARCHAR(50) DEFAULT 'standard',
    model VARCHAR(50) DEFAULT 'gpt-4',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_mode CHECK (mode IN ('standard', 'document', 'redline'))
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_role CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_firm_id ON ai_conversations(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON ai_messages(conversation_id);

CREATE TRIGGER update_ai_conversations_updated_at 
    BEFORE UPDATE ON ai_conversations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. BILLING SETTINGS & INVOICE TEMPLATES
-- ============================================

-- Billing settings per firm
CREATE TABLE IF NOT EXISTS billing_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID UNIQUE REFERENCES firms(id) ON DELETE CASCADE,
    default_payment_terms INTEGER DEFAULT 30,
    late_fee_enabled BOOLEAN DEFAULT true,
    late_fee_percent DECIMAL(5,2) DEFAULT 1.5,
    late_fee_grace_days INTEGER DEFAULT 5,
    auto_send_reminders BOOLEAN DEFAULT true,
    reminder_days INTEGER[] DEFAULT '{7, 3, 1, 0}',
    accept_credit_cards BOOLEAN DEFAULT true,
    accept_ach BOOLEAN DEFAULT true,
    surcharge_enabled BOOLEAN DEFAULT false,
    surcharge_percent DECIMAL(5,2) DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_billing_settings_updated_at 
    BEFORE UPDATE ON billing_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Invoice templates
CREATE TABLE IF NOT EXISTS invoice_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    header_config JSONB DEFAULT '{
        "showLogo": true,
        "showFirmAddress": true,
        "customMessage": ""
    }',
    line_items_config JSONB DEFAULT '{
        "showActivityCodes": true,
        "showTimekeeper": true,
        "groupByTask": false,
        "showHourlyRate": true
    }',
    footer_config JSONB DEFAULT '{
        "showPaymentInstructions": true,
        "paymentInstructions": "",
        "showLatePolicy": true,
        "lateFeePolicy": "",
        "customNotes": ""
    }',
    styling JSONB DEFAULT '{
        "primaryColor": "#F59E0B",
        "fontFamily": "Inter"
    }',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_templates_firm_id ON invoice_templates(firm_id);

CREATE TRIGGER update_invoice_templates_updated_at 
    BEFORE UPDATE ON invoice_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Payment processors
CREATE TABLE IF NOT EXISTS payment_processors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,
    credentials JSONB DEFAULT '{}',
    fees JSONB DEFAULT '{
        "creditCardPercent": 2.9,
        "creditCardFixed": 0.30,
        "achPercent": 0.5,
        "achFixed": 0
    }',
    supported_methods TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_processor_type CHECK (type IN ('stripe', 'lawpay', 'paypal', 'ach_direct'))
);

CREATE INDEX IF NOT EXISTS idx_payment_processors_firm_id ON payment_processors(firm_id);

CREATE TRIGGER update_payment_processors_updated_at 
    BEFORE UPDATE ON payment_processors 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Payment links
CREATE TABLE IF NOT EXISTS payment_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    url TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('active', 'paid', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_payment_links_firm_id ON payment_links(firm_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_invoice_id ON payment_links(invoice_id);

-- Recurring payments
CREATE TABLE IF NOT EXISTS recurring_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    payment_method VARCHAR(100),
    next_payment_date DATE NOT NULL,
    last_payment_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_frequency CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_recurring_payments_firm_id ON recurring_payments(firm_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_client_id ON recurring_payments(client_id);

CREATE TRIGGER update_recurring_payments_updated_at 
    BEFORE UPDATE ON recurring_payments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. DOCUMENT TEMPLATES
-- ============================================

CREATE TABLE IF NOT EXISTS document_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'custom',
    practice_area VARCHAR(100),
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    ai_enabled BOOLEAN DEFAULT false,
    ai_prompts JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_category CHECK (category IN ('contract', 'letter', 'pleading', 'discovery', 'estate', 'corporate', 'custom'))
);

CREATE INDEX IF NOT EXISTS idx_document_templates_firm_id ON document_templates(firm_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_category ON document_templates(category);

CREATE TRIGGER update_document_templates_updated_at 
    BEFORE UPDATE ON document_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Generated documents from templates
CREATE TABLE IF NOT EXISTS generated_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'draft',
    ai_review_notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'review', 'approved', 'sent'))
);

CREATE INDEX IF NOT EXISTS idx_generated_documents_firm_id ON generated_documents(firm_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_template_id ON generated_documents(template_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_matter_id ON generated_documents(matter_id);

CREATE TRIGGER update_generated_documents_updated_at 
    BEFORE UPDATE ON generated_documents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. TIMER STATE (per user)
-- ============================================

CREATE TABLE IF NOT EXISTS user_timer_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
    is_running BOOLEAN DEFAULT false,
    is_paused BOOLEAN DEFAULT false,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    matter_name VARCHAR(255),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    client_name VARCHAR(255),
    start_time TIMESTAMP WITH TIME ZONE,
    paused_at TIMESTAMP WITH TIME ZONE,
    accumulated_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_timer_state_user_id ON user_timer_state(user_id);

CREATE TRIGGER update_user_timer_state_updated_at 
    BEFORE UPDATE ON user_timer_state 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. AI USER SETTINGS (selected mode, etc.)
-- ============================================

CREATE TABLE IF NOT EXISTS user_ai_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    selected_mode VARCHAR(50) DEFAULT 'standard',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_mode CHECK (selected_mode IN ('standard', 'document', 'redline'))
);

CREATE TRIGGER update_user_ai_settings_updated_at 
    BEFORE UPDATE ON user_ai_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
