-- Migration: Accounting System for Estonian Compliance
-- Purpose: Automated financial record-keeping, invoicing, VAT tracking, and ledger
-- Compliance: Estonian Accounting Act, VAT Act (7-year retention)

-- ============================================================================
-- INVOICES TABLE
-- ============================================================================
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE, -- Sequential, no gaps (INV-000001)
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Dates
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL, -- Typically issue_date + 14 days
    paid_at TIMESTAMPTZ,
    
    -- Amounts (stored in cents to avoid floating point issues)
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    vat_rate DECIMAL(5, 4) NOT NULL CHECK (vat_rate >= 0 AND vat_rate <= 1), -- e.g., 0.2000 for 20%
    vat_cents INTEGER NOT NULL CHECK (vat_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR', 'USD', 'GBP')),
    
    -- For multi-currency invoices
    amount_eur_cents INTEGER NOT NULL, -- Converted to EUR for accounting
    exchange_rate DECIMAL(10, 6), -- Exchange rate used for conversion
    
    -- Invoice details
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {description, quantity, unit_price_cents, amount_cents}
    notes TEXT,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'sent', 'paid', 'overdue', 'cancelled')),
    
    -- Payment details
    payment_method TEXT, -- card, sepa_debit, wire_transfer
    payment_reference TEXT, -- Bank transfer reference or transaction ID
    
    -- External references
    stripe_invoice_id TEXT UNIQUE,
    paddle_invoice_id TEXT UNIQUE,
    
    -- Document storage
    pdf_url TEXT, -- S3 URL for PDF invoice
    xml_url TEXT, -- S3 URL for e-invoicing XML (UBL format)
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT invoice_total_check CHECK (total_cents = subtotal_cents + vat_cents)
);

CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_issue_date ON invoices(issue_date DESC);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_invoices_stripe_id ON invoices(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

-- Trigger to update updated_at
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    
    -- Payment details
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL CHECK (currency IN ('EUR', 'USD', 'GBP')),
    amount_eur_cents INTEGER NOT NULL, -- Converted to EUR
    exchange_rate DECIMAL(10, 6),
    
    -- Payment method
    payment_method TEXT NOT NULL, -- card, sepa_debit, wire_transfer, paypal
    payment_processor TEXT NOT NULL, -- stripe, paddle, bank, manual
    
    -- External references
    stripe_payment_id TEXT,
    stripe_charge_id TEXT,
    paddle_payment_id TEXT,
    bank_transaction_id TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'disputed')),
    
    -- Reconciliation
    reconciled_at TIMESTAMPTZ,
    reconciliation_notes TEXT,
    
    -- Failure details
    failure_code TEXT,
    failure_message TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_stripe_payment_id ON payments(stripe_payment_id) WHERE stripe_payment_id IS NOT NULL;
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- LEDGER ENTRIES (Double-Entry Bookkeeping)
-- ============================================================================
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Transaction grouping (multiple entries per transaction)
    transaction_id UUID NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Account information (Chart of Accounts)
    account_code TEXT NOT NULL, -- e.g., '1100' for Bank Account, '4000' for Revenue
    account_name TEXT NOT NULL, -- e.g., 'Bank - Stripe', 'Revenue - Subscriptions'
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    
    -- Double-entry amounts (one must be NULL)
    debit_cents INTEGER CHECK (debit_cents >= 0),
    credit_cents INTEGER CHECK (credit_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'EUR',
    
    -- Description and references
    description TEXT NOT NULL,
    reference_type TEXT, -- invoice, payment, expense, adjustment
    reference_id UUID,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT ledger_debit_or_credit CHECK (
        (debit_cents IS NOT NULL AND credit_cents IS NULL) OR
        (debit_cents IS NULL AND credit_cents IS NOT NULL)
    )
);

CREATE INDEX idx_ledger_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_account_code ON ledger_entries(account_code);
CREATE INDEX idx_ledger_entry_date ON ledger_entries(entry_date DESC);
CREATE INDEX idx_ledger_reference ON ledger_entries(reference_type, reference_id);

-- ============================================================================
-- CHART OF ACCOUNTS
-- ============================================================================
CREATE TABLE chart_of_accounts (
    code TEXT PRIMARY KEY, -- e.g., '1100', '2000', '4000'
    name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    parent_code TEXT REFERENCES chart_of_accounts(code),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Standard chart of accounts for Estonian business
INSERT INTO chart_of_accounts (code, name, account_type, description) VALUES
    -- Assets
    ('1000', 'Assets', 'asset', 'Total assets'),
    ('1100', 'Bank Accounts', 'asset', 'Cash in bank accounts'),
    ('1110', 'Bank - Stripe', 'asset', 'Stripe balance'),
    ('1120', 'Bank - Wise', 'asset', 'Wise business account'),
    ('1200', 'Accounts Receivable', 'asset', 'Money owed by customers'),
    ('1300', 'VAT Receivable', 'asset', 'VAT to be refunded'),
    
    -- Liabilities
    ('2000', 'Liabilities', 'liability', 'Total liabilities'),
    ('2100', 'Accounts Payable', 'liability', 'Money owed to suppliers'),
    ('2200', 'VAT Payable', 'liability', 'VAT to be paid to tax authority'),
    ('2300', 'Deferred Revenue', 'liability', 'Prepaid subscriptions'),
    
    -- Equity
    ('3000', 'Equity', 'equity', 'Owner equity'),
    ('3100', 'Share Capital', 'equity', 'Initial capital (€2,500 for OÜ)'),
    ('3200', 'Retained Earnings', 'equity', 'Accumulated profits'),
    ('3300', 'Current Year Earnings', 'equity', 'Current fiscal year profit/loss'),
    
    -- Revenue
    ('4000', 'Revenue', 'revenue', 'Total revenue'),
    ('4100', 'Subscription Revenue', 'revenue', 'Monthly subscription fees'),
    ('4200', 'Usage Revenue', 'revenue', 'Usage-based billing (overage)'),
    ('4300', 'Setup Fees', 'revenue', 'One-time setup fees'),
    
    -- Expenses
    ('5000', 'Expenses', 'expense', 'Total expenses'),
    ('5100', 'Cost of Goods Sold', 'expense', 'Direct costs'),
    ('5110', 'Infrastructure Costs', 'expense', 'AWS, servers'),
    ('5120', 'Payment Processing Fees', 'expense', 'Stripe/Paddle fees'),
    ('5200', 'Operating Expenses', 'expense', 'General operating costs'),
    ('5210', 'Software Subscriptions', 'expense', 'SaaS tools'),
    ('5220', 'Marketing', 'expense', 'Advertising, content'),
    ('5230', 'Professional Services', 'expense', 'Legal, accounting');

-- ============================================================================
-- VAT REPORTS TABLE
-- ============================================================================
CREATE TABLE vat_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Period
    year INTEGER NOT NULL CHECK (year >= 2024 AND year <= 2100),
    quarter INTEGER NOT NULL CHECK (quarter IN (1, 2, 3, 4)),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- VAT calculations (in cents)
    total_sales_cents INTEGER NOT NULL DEFAULT 0,
    vat_collected_cents INTEGER NOT NULL DEFAULT 0,
    total_purchases_cents INTEGER NOT NULL DEFAULT 0,
    vat_paid_cents INTEGER NOT NULL DEFAULT 0,
    net_vat_payable_cents INTEGER NOT NULL, -- Can be negative (refund)
    
    -- Breakdown by rate
    sales_20_percent_cents INTEGER NOT NULL DEFAULT 0,
    sales_0_percent_cents INTEGER NOT NULL DEFAULT 0, -- EU B2B reverse charge
    
    -- Filing details
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'paid', 'refunded')),
    due_date DATE NOT NULL,
    submitted_at TIMESTAMPTZ,
    submission_id TEXT, -- e-MTA submission reference
    
    -- Payment
    paid_at TIMESTAMPTZ,
    payment_reference TEXT,
    
    -- Report file
    report_url TEXT, -- S3 URL for generated report
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (year, quarter)
);

CREATE INDEX idx_vat_reports_period ON vat_reports(year DESC, quarter DESC);
CREATE INDEX idx_vat_reports_due_date ON vat_reports(due_date);

CREATE TRIGGER update_vat_reports_updated_at
    BEFORE UPDATE ON vat_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Expense details
    vendor_name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL, -- infrastructure, software, marketing, legal
    
    -- Amounts
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL DEFAULT 'EUR',
    amount_eur_cents INTEGER NOT NULL,
    exchange_rate DECIMAL(10, 6),
    
    -- VAT (if applicable)
    vat_cents INTEGER DEFAULT 0,
    vat_rate DECIMAL(5, 4),
    is_vat_deductible BOOLEAN NOT NULL DEFAULT false,
    
    -- Dates
    expense_date DATE NOT NULL,
    payment_date DATE,
    
    -- Payment method
    payment_method TEXT, -- card, wire_transfer, invoice
    payment_reference TEXT,
    
    -- Ledger account
    account_code TEXT NOT NULL REFERENCES chart_of_accounts(code),
    
    -- Receipt/invoice
    receipt_url TEXT, -- S3 URL for receipt/invoice
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'reimbursed')),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_expenses_expense_date ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_account_code ON expenses(account_code);
CREATE INDEX idx_expenses_status ON expenses(status);

CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SUBSCRIPTIONS TABLE (Enhanced for billing)
-- ============================================================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Plan details
    plan_type TEXT NOT NULL CHECK (plan_type IN ('indie', 'studio', 'enterprise')),
    plan_name TEXT NOT NULL,
    base_price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    
    -- Usage limits
    included_impressions INTEGER NOT NULL, -- Monthly impression limit
    overage_rate_cents INTEGER, -- Cost per 1,000 impressions over limit
    
    -- Billing cycle
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
    current_period_start DATE NOT NULL,
    current_period_end DATE NOT NULL,
    next_billing_date DATE NOT NULL,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'suspended')),
    trial_end_date DATE,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    
    -- Payment processor
    payment_processor TEXT NOT NULL DEFAULT 'stripe' CHECK (payment_processor IN ('stripe', 'paddle', 'manual')),
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    paddle_subscription_id TEXT UNIQUE,
    
    -- Failed payments
    failed_payment_count INTEGER NOT NULL DEFAULT 0,
    last_failed_payment_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_next_billing_date ON subscriptions(next_billing_date);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- USAGE RECORDS TABLE (For metering)
-- ============================================================================
CREATE TABLE usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    
    -- Usage details
    metric_type TEXT NOT NULL, -- impressions, api_calls, data_transfer_mb
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    
    -- Timestamp
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Aggregation period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Billing status
    billed BOOLEAN NOT NULL DEFAULT false,
    invoice_id UUID REFERENCES invoices(id),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_usage_records_customer_id ON usage_records(customer_id);
CREATE INDEX idx_usage_records_subscription_id ON usage_records(subscription_id);
CREATE INDEX idx_usage_records_usage_date ON usage_records(usage_date DESC);
CREATE INDEX idx_usage_records_billed ON usage_records(billed) WHERE NOT billed;

-- ============================================================================
-- FINANCIAL DOCUMENTS TABLE (For 7-year retention)
-- ============================================================================
CREATE TABLE financial_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Document details
    document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'receipt', 'vat_report', 'annual_report', 'expense_receipt', 'bank_statement')),
    document_number TEXT,
    title TEXT NOT NULL,
    
    -- Storage
    s3_bucket TEXT NOT NULL,
    s3_key TEXT NOT NULL,
    s3_version_id TEXT,
    file_size_bytes INTEGER,
    content_type TEXT,
    
    -- Hash for integrity verification
    sha256_hash TEXT NOT NULL,
    
    -- Retention
    retention_until DATE NOT NULL, -- 7 years from document date
    is_locked BOOLEAN NOT NULL DEFAULT true, -- S3 Object Lock
    
    -- References
    related_entity_type TEXT, -- invoice, payment, expense
    related_entity_id UUID,
    
    -- Metadata
    fiscal_year INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_financial_documents_type ON financial_documents(document_type);
CREATE INDEX idx_financial_documents_retention ON financial_documents(retention_until);
CREATE INDEX idx_financial_documents_related ON financial_documents(related_entity_type, related_entity_id);

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

-- Monthly Revenue Report
CREATE VIEW monthly_revenue AS
SELECT
    DATE_TRUNC('month', i.issue_date) AS month,
    COUNT(*) AS invoice_count,
    SUM(i.subtotal_cents) AS subtotal_cents,
    SUM(i.vat_cents) AS vat_cents,
    SUM(i.total_cents) AS total_cents,
    COUNT(DISTINCT i.customer_id) AS unique_customers
FROM invoices i
WHERE i.status = 'paid'
GROUP BY DATE_TRUNC('month', i.issue_date)
ORDER BY month DESC;

-- VAT Summary (for quarterly reports)
CREATE VIEW vat_summary AS
SELECT
    DATE_TRUNC('quarter', i.issue_date) AS quarter,
    SUM(i.subtotal_cents) AS total_sales_cents,
    SUM(i.vat_cents) AS vat_collected_cents,
    COUNT(*) AS invoice_count
FROM invoices i
WHERE i.status = 'paid'
GROUP BY DATE_TRUNC('quarter', i.issue_date)
ORDER BY quarter DESC;

-- Account Balances (from ledger)
CREATE VIEW account_balances AS
SELECT
    l.account_code,
    l.account_name,
    l.account_type,
    SUM(COALESCE(l.debit_cents, 0)) AS total_debits_cents,
    SUM(COALESCE(l.credit_cents, 0)) AS total_credits_cents,
    CASE
        WHEN l.account_type IN ('asset', 'expense') THEN
            SUM(COALESCE(l.debit_cents, 0)) - SUM(COALESCE(l.credit_cents, 0))
        ELSE
            SUM(COALESCE(l.credit_cents, 0)) - SUM(COALESCE(l.debit_cents, 0))
    END AS balance_cents
FROM ledger_entries l
GROUP BY l.account_code, l.account_name, l.account_type
ORDER BY l.account_code;

-- Customer Lifetime Value
CREATE VIEW customer_lifetime_value AS
SELECT
    i.customer_id,
    u.email,
    u.company_name,
    COUNT(i.id) AS total_invoices,
    SUM(i.total_cents) AS total_paid_cents,
    MIN(i.issue_date) AS first_invoice_date,
    MAX(i.issue_date) AS last_invoice_date,
    EXTRACT(EPOCH FROM (MAX(i.issue_date) - MIN(i.issue_date))) / 86400 AS customer_age_days
FROM invoices i
JOIN users u ON i.customer_id = u.id
WHERE i.status = 'paid'
GROUP BY i.customer_id, u.email, u.company_name
ORDER BY total_paid_cents DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE invoices IS 'Customer invoices with e-invoicing support (7-year retention)';
COMMENT ON TABLE payments IS 'Payment records from Stripe, Paddle, and bank transfers';
COMMENT ON TABLE ledger_entries IS 'Double-entry bookkeeping ledger (compliant with Estonian Accounting Act)';
COMMENT ON TABLE chart_of_accounts IS 'Standard chart of accounts for Estonian OÜ';
COMMENT ON TABLE vat_reports IS 'Quarterly VAT reports for e-MTA submission';
COMMENT ON TABLE expenses IS 'Business expenses for tax deduction';
COMMENT ON TABLE subscriptions IS 'Customer subscription plans with usage tracking';
COMMENT ON TABLE usage_records IS 'Usage metering for billing (impressions, API calls)';
COMMENT ON TABLE financial_documents IS 'S3-stored documents with 7-year retention (compliance)';
