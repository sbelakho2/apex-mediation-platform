-- Migration 011: Billing & Financial Compliance
-- Dunning management, invoice generation, VAT reporting, payment reconciliation, Estonian compliance

CREATE TABLE IF NOT EXISTS dunning_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_failure_id UUID NOT NULL REFERENCES payment_failures(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    attempted_at TIMESTAMP WITH TIME ZONE,
    success BOOLEAN,
    failure_reason TEXT,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    email_sent BOOLEAN DEFAULT false,
    next_attempt_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_dunning_customer (customer_id),
    INDEX idx_dunning_payment_failure (payment_failure_id),
    INDEX idx_dunning_scheduled (scheduled_for),
    INDEX idx_dunning_attempted (attempted_at)
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    amount_cents INTEGER NOT NULL,
    tax_amount_cents INTEGER DEFAULT 0,
    total_amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled', 'refunded')),
    paid_at TIMESTAMP WITH TIME ZONE,
    stripe_invoice_id VARCHAR(255),
    pdf_url TEXT,
    line_items JSONB NOT NULL, -- [{description, quantity, unit_price_cents, total_cents}]
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_invoices_customer (customer_id),
    INDEX idx_invoices_number (invoice_number),
    INDEX idx_invoices_status (status),
    INDEX idx_invoices_date (invoice_date),
    INDEX idx_invoices_stripe (stripe_invoice_id)
);

CREATE TABLE IF NOT EXISTS vat_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_quarter INTEGER NOT NULL CHECK (report_quarter BETWEEN 1 AND 4),
    report_year INTEGER NOT NULL,
    total_sales_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
    domestic_sales_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
    eu_sales_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
    international_sales_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
    vat_collected_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
    vat_owed_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected')),
    submitted_to_emta_at TIMESTAMP WITH TIME ZONE,
    emta_reference_number VARCHAR(100),
    report_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_vat_reports_quarter (report_quarter, report_year),
    INDEX idx_vat_reports_status (status),
    
    UNIQUE (report_quarter, report_year)
);

CREATE TABLE IF NOT EXISTS payment_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_provider VARCHAR(50) NOT NULL, -- 'stripe', 'wise', 'tipalti'
    expected_amount_cents INTEGER NOT NULL,
    received_amount_cents INTEGER NOT NULL,
    difference_cents INTEGER NOT NULL,
    transaction_count INTEGER NOT NULL,
    reconciled BOOLEAN DEFAULT false,
    discrepancy_reason TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    provider_transaction_ids TEXT[],
    internal_transaction_ids UUID[],
    reconciliation_details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_payment_reconciliations_date (reconciliation_date),
    INDEX idx_payment_reconciliations_provider (payment_provider),
    INDEX idx_payment_reconciliations_reconciled (reconciled)
);

CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    original_payment_id VARCHAR(255),
    refund_amount_cents INTEGER NOT NULL,
    refund_reason TEXT NOT NULL,
    refund_type VARCHAR(50) DEFAULT 'full' CHECK (refund_type IN ('full', 'partial')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    stripe_refund_id VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    requested_by VARCHAR(255),
    approved_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_refunds_customer (customer_id),
    INDEX idx_refunds_invoice (invoice_id),
    INDEX idx_refunds_status (status),
    INDEX idx_refunds_created (created_at)
);

CREATE TABLE IF NOT EXISTS credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credit_amount_cents INTEGER NOT NULL,
    credit_type VARCHAR(50) NOT NULL, -- 'referral_reward', 'churn_prevention', 'goodwill', 'promotional'
    description TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    applied_to_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    remaining_amount_cents INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'applied', 'expired', 'revoked')),
    applied_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoke_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_credits_customer (customer_id),
    INDEX idx_credits_type (credit_type),
    INDEX idx_credits_status (status),
    INDEX idx_credits_expires (expires_at)
);

CREATE TABLE IF NOT EXISTS double_entry_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    transaction_type VARCHAR(50) NOT NULL, -- 'revenue', 'refund', 'credit', 'payout', 'expense'
    account_debit VARCHAR(100) NOT NULL, -- 'accounts_receivable', 'cash', 'revenue', etc.
    account_credit VARCHAR(100) NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reference_type VARCHAR(50), -- 'invoice', 'payment', 'refund', 'payout'
    reference_id UUID,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_ledger_date (transaction_date),
    INDEX idx_ledger_type (transaction_type),
    INDEX idx_ledger_customer (customer_id),
    INDEX idx_ledger_reference (reference_type, reference_id)
);

CREATE TABLE IF NOT EXISTS estonian_annual_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_year INTEGER NOT NULL UNIQUE,
    total_revenue_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_expenses_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_profit_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
    corporate_tax_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected')),
    submitted_to_registry_at TIMESTAMP WITH TIME ZONE,
    registry_reference_number VARCHAR(100),
    report_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_annual_reports_year (report_year),
    INDEX idx_annual_reports_status (status)
);

CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name VARCHAR(100) UNIQUE NOT NULL,
    parent_category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
    tax_deductible BOOLEAN DEFAULT true,
    requires_receipt BOOLEAN DEFAULT true,
    estonian_tax_code VARCHAR(20),
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_expense_categories_parent (parent_category_id),
    INDEX idx_expense_categories_active (active)
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_date DATE NOT NULL,
    category_id UUID NOT NULL REFERENCES expense_categories(id),
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    vendor_name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    receipt_url TEXT,
    payment_method VARCHAR(50),
    tax_deductible BOOLEAN DEFAULT true,
    approved BOOLEAN DEFAULT false,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_expenses_date (expense_date),
    INDEX idx_expenses_category (category_id),
    INDEX idx_expenses_vendor (vendor_name),
    INDEX idx_expenses_approved (approved)
);

-- Financial dashboard view
CREATE OR REPLACE VIEW financial_dashboard AS
SELECT 
    (SELECT COUNT(*) FROM invoices WHERE status IN ('pending', 'overdue')) as outstanding_invoices,
    (SELECT SUM(total_amount_cents) FROM invoices WHERE status IN ('pending', 'overdue')) as outstanding_amount_cents,
    (SELECT COUNT(*) FROM dunning_attempts WHERE scheduled_for <= NOW() AND attempted_at IS NULL) as pending_dunning_attempts,
    (SELECT COUNT(*) FROM payment_reconciliations WHERE reconciled = false) as unreconciled_payments,
    (SELECT SUM(remaining_amount_cents) FROM credits WHERE status = 'active') as active_credits_cents,
    (SELECT COUNT(*) FROM vat_reports WHERE status = 'draft') as pending_vat_reports,
    (SELECT SUM(amount_cents) FROM invoices WHERE invoice_date >= DATE_TRUNC('month', CURRENT_DATE) AND status != 'cancelled') as monthly_revenue_cents,
    (SELECT SUM(amount_cents) FROM expenses WHERE expense_date >= DATE_TRUNC('month', CURRENT_DATE) AND approved = true) as monthly_expenses_cents,
    NOW() as last_updated;

-- Function to auto-generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
    year_prefix TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
    next_number INTEGER;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM '[0-9]+$')::INTEGER), 0) + 1
    INTO next_number
    FROM invoices
    WHERE invoice_number LIKE year_prefix || '-%';
    
    RETURN year_prefix || '-' || LPAD(next_number::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to calculate VAT for invoice
CREATE OR REPLACE FUNCTION calculate_vat(
    customer_country VARCHAR(2),
    amount_cents INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    vat_rate DECIMAL(4,2);
BEGIN
    -- Estonian VAT rate (20%)
    IF customer_country = 'EE' THEN
        vat_rate := 0.20;
    -- EU reverse charge (0% if business customer)
    ELSIF customer_country IN ('AT','BE','BG','HR','CY','CZ','DK','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE') THEN
        vat_rate := 0.00;  -- Reverse charge mechanism
    -- Non-EU (0%)
    ELSE
        vat_rate := 0.00;
    END IF;
    
    RETURN (amount_cents * vat_rate)::INTEGER;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE dunning_attempts IS 'Automatic payment retry attempts for failed payments';
COMMENT ON TABLE invoices IS 'Customer invoices with line items, VAT, and PDF URLs';
COMMENT ON TABLE vat_reports IS 'Quarterly VAT reports for Estonian e-MTA (tax board) submission';
COMMENT ON TABLE payment_reconciliations IS 'Daily reconciliation of payments across providers';
COMMENT ON TABLE refunds IS 'Customer refund tracking linked to invoices';
COMMENT ON TABLE credits IS 'Customer account credits (referral rewards, discounts, goodwill)';
COMMENT ON TABLE double_entry_ledger IS 'Immutable double-entry accounting ledger';
COMMENT ON TABLE estonian_annual_reports IS 'Annual reports for Estonian Business Register submission';
COMMENT ON TABLE expense_categories IS 'Expense categorization with Estonian tax codes';
COMMENT ON TABLE expenses IS 'Business expense tracking with receipt management';
