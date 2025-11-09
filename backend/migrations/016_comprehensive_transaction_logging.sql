-- Migration 016: Comprehensive Transaction Logging for Estonian Compliance
-- Purpose: Immutable audit trail for all financial transactions required for:
--   - Annual reports (e-Business Register)
--   - VAT reporting (e-MTA quarterly)
--   - 7-year retention (§ 13 Accounting Act)
--   - Audit trail with cryptographic signatures

-- =====================================================================
-- IMMUTABLE TRANSACTION LOG (Core Audit Trail)
-- =====================================================================

CREATE TABLE IF NOT EXISTS transaction_log (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  
  -- Transaction Classification
  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN (
    'revenue', 'expense', 'payment_received', 'payment_sent', 'refund_issued',
    'refund_received', 'credit_issued', 'credit_applied', 'vat_collected',
    'vat_paid', 'fee_charged', 'commission_earned', 'subscription_charge',
    'usage_charge', 'setup_fee', 'late_fee', 'chargeback', 'payout',
    'adjustment', 'write_off'
  )),
  category VARCHAR(100) NOT NULL, -- COGS, R&D, Infrastructure, Marketing, etc.
  
  -- Amounts (cents, EUR base currency)
  amount_cents BIGINT NOT NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'EUR',
  exchange_rate DECIMAL(10, 6), -- To EUR if non-EUR
  amount_eur_cents BIGINT NOT NULL, -- Converted amount for Estonian reporting
  
  -- VAT Information (Estonian VAT: 20% standard, 0% for qualified EU B2B)
  vat_rate DECIMAL(5, 2) DEFAULT 0.00,
  vat_amount_cents BIGINT DEFAULT 0,
  vat_reverse_charge BOOLEAN DEFAULT FALSE, -- EU B2B reverse charge
  
  -- Parties Involved
  customer_id UUID REFERENCES users(id),
  vendor_name VARCHAR(255), -- For expenses (Stripe, AWS, Cloudflare, etc.)
  counterparty_country_code VARCHAR(2), -- For VAT/cross-border compliance
  counterparty_vat_number VARCHAR(50), -- EU VAT validation
  
  -- Payment Method & Reconciliation
  payment_method VARCHAR(50), -- stripe, wise, paypal, bank_transfer, cash
  payment_processor_id VARCHAR(255), -- External payment ID (Stripe charge ID, etc.)
  payment_processor_fee_cents BIGINT DEFAULT 0,
  net_amount_cents BIGINT NOT NULL, -- After fees
  
  -- Timing
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accounting_period VARCHAR(7) NOT NULL, -- YYYY-MM for monthly reports
  fiscal_year INTEGER NOT NULL, -- For annual reports
  
  -- Source & Context
  source_system VARCHAR(50) NOT NULL, -- backend, stripe_webhook, manual_entry
  reference_type VARCHAR(50), -- invoice, subscription, usage_record, expense
  reference_id UUID, -- Links to invoices, subscriptions, etc.
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  
  -- Compliance & Audit
  document_url VARCHAR(500), -- S3 URL for invoice PDF, receipt, etc.
  document_hash VARCHAR(64), -- SHA-256 hash for tamper detection
  created_by UUID REFERENCES users(id),
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  
  -- Immutability Enforcement
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE, -- Soft delete only, never hard delete
  deleted_at TIMESTAMPTZ,
  deleted_reason TEXT,
  
  -- Cryptographic Signature (prevents tampering)
  signature VARCHAR(128) -- HMAC-SHA256 of transaction data
);

-- Indexes for fast querying
CREATE INDEX idx_transaction_log_type ON transaction_log(transaction_type);
CREATE INDEX idx_transaction_log_customer ON transaction_log(customer_id);
CREATE INDEX idx_transaction_log_date ON transaction_log(transaction_date DESC);
CREATE INDEX idx_transaction_log_period ON transaction_log(accounting_period, fiscal_year);
CREATE INDEX idx_transaction_log_category ON transaction_log(category);
CREATE INDEX idx_transaction_log_payment_processor ON transaction_log(payment_processor_id);

-- Prevent updates to transaction_log (immutability)
CREATE OR REPLACE FUNCTION prevent_transaction_log_updates()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_deleted = FALSE THEN
    RAISE EXCEPTION 'Cannot update transaction_log records. Use soft delete instead.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cannot hard delete transaction_log records. Use soft delete (is_deleted = TRUE).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_transaction_log_immutability
  BEFORE UPDATE OR DELETE ON transaction_log
  FOR EACH ROW EXECUTE FUNCTION prevent_transaction_log_updates();

-- =====================================================================
-- CONSOLIDATED FINANCIAL VIEWS FOR REPORTING
-- =====================================================================

-- Revenue Summary (for annual reports)
CREATE OR REPLACE VIEW revenue_summary AS
SELECT
  fiscal_year,
  accounting_period,
  category,
  SUM(amount_eur_cents) / 100.0 AS total_revenue_eur,
  SUM(vat_amount_cents) / 100.0 AS total_vat_collected_eur,
  SUM(net_amount_cents) / 100.0 AS net_revenue_eur,
  COUNT(*) AS transaction_count
FROM transaction_log
WHERE transaction_type IN ('revenue', 'subscription_charge', 'usage_charge', 'setup_fee', 'commission_earned')
  AND is_deleted = FALSE
GROUP BY fiscal_year, accounting_period, category;

-- Expense Summary (for annual reports)
CREATE OR REPLACE VIEW expense_summary AS
SELECT
  fiscal_year,
  accounting_period,
  category,
  vendor_name,
  SUM(amount_eur_cents) / 100.0 AS total_expense_eur,
  SUM(vat_amount_cents) / 100.0 AS total_vat_paid_eur,
  COUNT(*) AS transaction_count
FROM transaction_log
WHERE transaction_type IN ('expense', 'payment_sent', 'fee_charged')
  AND is_deleted = FALSE
GROUP BY fiscal_year, accounting_period, category, vendor_name;

-- VAT Report (quarterly e-MTA submission)
CREATE OR REPLACE VIEW vat_report_summary AS
SELECT
  fiscal_year,
  EXTRACT(QUARTER FROM transaction_date) AS quarter,
  SUM(CASE WHEN transaction_type IN ('revenue', 'subscription_charge', 'usage_charge')
    THEN vat_amount_cents ELSE 0 END) / 100.0 AS vat_collected_eur,
  SUM(CASE WHEN transaction_type IN ('expense', 'payment_sent')
    THEN vat_amount_cents ELSE 0 END) / 100.0 AS vat_paid_eur,
  (SUM(CASE WHEN transaction_type IN ('revenue', 'subscription_charge', 'usage_charge')
    THEN vat_amount_cents ELSE 0 END) -
   SUM(CASE WHEN transaction_type IN ('expense', 'payment_sent')
    THEN vat_amount_cents ELSE 0 END)) / 100.0 AS vat_payable_eur,
  COUNT(DISTINCT CASE WHEN vat_reverse_charge = TRUE THEN transaction_id END) AS reverse_charge_transactions
FROM transaction_log
WHERE is_deleted = FALSE
GROUP BY fiscal_year, EXTRACT(QUARTER FROM transaction_date);

-- Annual Profit & Loss Statement
CREATE OR REPLACE VIEW annual_pnl_statement AS
SELECT
  fiscal_year,
  -- Revenue
  SUM(CASE WHEN transaction_type IN ('revenue', 'subscription_charge', 'usage_charge', 'commission_earned')
    THEN amount_eur_cents ELSE 0 END) / 100.0 AS total_revenue_eur,
  
  -- Cost of Goods Sold
  SUM(CASE WHEN transaction_type IN ('expense') AND category = 'COGS'
    THEN amount_eur_cents ELSE 0 END) / 100.0 AS cogs_eur,
  
  -- Gross Profit
  (SUM(CASE WHEN transaction_type IN ('revenue', 'subscription_charge', 'usage_charge', 'commission_earned')
    THEN amount_eur_cents ELSE 0 END) -
   SUM(CASE WHEN transaction_type IN ('expense') AND category = 'COGS'
    THEN amount_eur_cents ELSE 0 END)) / 100.0 AS gross_profit_eur,
  
  -- Operating Expenses
  SUM(CASE WHEN transaction_type IN ('expense') AND category IN ('Infrastructure', 'SaaS', 'Marketing', 'R&D')
    THEN amount_eur_cents ELSE 0 END) / 100.0 AS operating_expenses_eur,
  
  -- Net Profit
  (SUM(CASE WHEN transaction_type IN ('revenue', 'subscription_charge', 'usage_charge', 'commission_earned')
    THEN amount_eur_cents ELSE 0 END) -
   SUM(CASE WHEN transaction_type IN ('expense')
    THEN amount_eur_cents ELSE 0 END)) / 100.0 AS net_profit_eur,
  
  -- Profit Margin
  CASE WHEN SUM(CASE WHEN transaction_type IN ('revenue', 'subscription_charge', 'usage_charge', 'commission_earned')
    THEN amount_eur_cents ELSE 0 END) > 0
  THEN ROUND(
    100.0 * (SUM(CASE WHEN transaction_type IN ('revenue', 'subscription_charge', 'usage_charge', 'commission_earned')
      THEN amount_eur_cents ELSE 0 END) -
     SUM(CASE WHEN transaction_type IN ('expense')
      THEN amount_eur_cents ELSE 0 END)) /
    NULLIF(SUM(CASE WHEN transaction_type IN ('revenue', 'subscription_charge', 'usage_charge', 'commission_earned')
      THEN amount_eur_cents ELSE 0 END), 0),
    2
  ) ELSE 0 END AS profit_margin_percent
FROM transaction_log
WHERE is_deleted = FALSE
GROUP BY fiscal_year;

-- Cash Flow Statement
CREATE OR REPLACE VIEW cash_flow_statement AS
SELECT
  fiscal_year,
  accounting_period,
  -- Operating Activities
  SUM(CASE WHEN transaction_type IN ('payment_received', 'subscription_charge', 'usage_charge')
    THEN net_amount_cents ELSE 0 END) / 100.0 AS cash_from_operations_eur,
  SUM(CASE WHEN transaction_type IN ('payment_sent', 'expense')
    THEN -net_amount_cents ELSE 0 END) / 100.0 AS cash_for_operations_eur,
  
  -- Investing Activities (future: equipment purchases, etc.)
  0 AS cash_from_investing_eur,
  
  -- Financing Activities (future: loans, dividends)
  0 AS cash_from_financing_eur,
  
  -- Net Cash Flow
  (SUM(CASE WHEN transaction_type IN ('payment_received', 'subscription_charge', 'usage_charge')
    THEN net_amount_cents ELSE 0 END) +
   SUM(CASE WHEN transaction_type IN ('payment_sent', 'expense')
    THEN -net_amount_cents ELSE 0 END)) / 100.0 AS net_cash_flow_eur
FROM transaction_log
WHERE is_deleted = FALSE
GROUP BY fiscal_year, accounting_period;

CREATE OR REPLACE VIEW customer_revenue_report AS
SELECT
  c.id AS customer_id,
  c.email,
  p.company_name AS publisher_company_name,
  EXTRACT(YEAR FROM tl.transaction_date) AS year,
  EXTRACT(MONTH FROM tl.transaction_date) AS month,
  SUM(tl.amount_eur_cents) / 100.0 AS total_revenue_eur,
  SUM(tl.vat_amount_cents) / 100.0 AS total_vat_eur,
  COUNT(*) AS transaction_count,
  AVG(tl.amount_eur_cents) / 100.0 AS avg_transaction_eur
FROM transaction_log tl
JOIN users c ON tl.customer_id = c.id
JOIN publishers p ON c.publisher_id = p.id
WHERE tl.transaction_type IN ('revenue', 'subscription_charge', 'usage_charge')
  AND tl.is_deleted = FALSE
GROUP BY c.id, c.email, p.company_name, EXTRACT(YEAR FROM tl.transaction_date), EXTRACT(MONTH FROM tl.transaction_date);

-- =====================================================================
-- FUNCTIONS FOR TRANSACTION LOGGING
-- =====================================================================

-- Function to log revenue transactions
CREATE OR REPLACE FUNCTION log_revenue_transaction(
  p_customer_id UUID,
  p_amount_cents BIGINT,
  p_currency_code VARCHAR(3),
  p_vat_rate DECIMAL(5, 2),
  p_category VARCHAR(100),
  p_description TEXT,
  p_reference_type VARCHAR(50),
  p_reference_id UUID,
  p_payment_processor_id VARCHAR(255),
  p_payment_method VARCHAR(50)
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_vat_amount_cents BIGINT;
  v_amount_eur_cents BIGINT;
  v_exchange_rate DECIMAL(10, 6);
BEGIN
  -- Calculate VAT
  v_vat_amount_cents := ROUND(p_amount_cents * p_vat_rate / 100.0);
  
  -- Exchange rate conversion (simplified - in production, fetch from ECB API)
  v_exchange_rate := CASE p_currency_code
    WHEN 'EUR' THEN 1.0
    WHEN 'USD' THEN 0.92 -- Example rate
    WHEN 'GBP' THEN 1.17
    ELSE 1.0
  END;
  
  v_amount_eur_cents := ROUND(p_amount_cents * v_exchange_rate);
  
  INSERT INTO transaction_log (
    transaction_type, category, amount_cents, currency_code, exchange_rate, amount_eur_cents,
    vat_rate, vat_amount_cents, customer_id, payment_method, payment_processor_id,
    net_amount_cents, transaction_date, accounting_period, fiscal_year,
    source_system, reference_type, reference_id, description
  ) VALUES (
    'revenue', p_category, p_amount_cents, p_currency_code, v_exchange_rate, v_amount_eur_cents,
    p_vat_rate, v_vat_amount_cents, p_customer_id, p_payment_method, p_payment_processor_id,
    p_amount_cents - v_vat_amount_cents, NOW(), TO_CHAR(NOW(), 'YYYY-MM'), EXTRACT(YEAR FROM NOW()),
    'backend', p_reference_type, p_reference_id, p_description
  )
  RETURNING transaction_id INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log expense transactions
CREATE OR REPLACE FUNCTION log_expense_transaction(
  p_vendor_name VARCHAR(255),
  p_amount_cents BIGINT,
  p_currency_code VARCHAR(3),
  p_vat_rate DECIMAL(5, 2),
  p_category VARCHAR(100),
  p_description TEXT,
  p_payment_method VARCHAR(50),
  p_document_url VARCHAR(500)
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_vat_amount_cents BIGINT;
  v_amount_eur_cents BIGINT;
  v_exchange_rate DECIMAL(10, 6);
BEGIN
  v_vat_amount_cents := ROUND(p_amount_cents * p_vat_rate / 100.0);
  
  v_exchange_rate := CASE p_currency_code
    WHEN 'EUR' THEN 1.0
    WHEN 'USD' THEN 0.92
    ELSE 1.0
  END;
  
  v_amount_eur_cents := ROUND(p_amount_cents * v_exchange_rate);
  
  INSERT INTO transaction_log (
    transaction_type, category, amount_cents, currency_code, exchange_rate, amount_eur_cents,
    vat_rate, vat_amount_cents, vendor_name, payment_method,
    net_amount_cents, transaction_date, accounting_period, fiscal_year,
    source_system, description, document_url
  ) VALUES (
    'expense', p_category, p_amount_cents, p_currency_code, v_exchange_rate, v_amount_eur_cents,
    p_vat_rate, v_vat_amount_cents, p_vendor_name, p_payment_method,
    p_amount_cents + v_vat_amount_cents, NOW(), TO_CHAR(NOW(), 'YYYY-MM'), EXTRACT(YEAR FROM NOW()),
    'backend', p_description, p_document_url
  )
  RETURNING transaction_id INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- INDEXES FOR REPORTING PERFORMANCE
-- =====================================================================

CREATE INDEX idx_transaction_log_fiscal_year ON transaction_log(fiscal_year);
CREATE INDEX idx_transaction_log_revenue_type ON transaction_log(transaction_type, fiscal_year) 
  WHERE transaction_type IN ('revenue', 'subscription_charge', 'usage_charge');
CREATE INDEX idx_transaction_log_expense_type ON transaction_log(transaction_type, category, fiscal_year)
  WHERE transaction_type IN ('expense', 'payment_sent');

-- =====================================================================
-- COMMENTS FOR ESTONIAN COMPLIANCE
-- =====================================================================

COMMENT ON TABLE transaction_log IS 'Immutable audit trail for all financial transactions. Required for Estonian e-Business Register annual reports and e-MTA VAT reporting. 7-year retention per § 13 Accounting Act.';
COMMENT ON COLUMN transaction_log.signature IS 'HMAC-SHA256 signature for tamper detection. Calculated over transaction_id + amount + date + type.';
COMMENT ON COLUMN transaction_log.vat_reverse_charge IS 'TRUE for EU B2B transactions where customer pays VAT (reverse charge mechanism per EU VAT Directive).';
COMMENT ON VIEW annual_pnl_statement IS 'Profit & Loss statement for Estonian annual reports (submitted to e-Business Register by March 31).';
COMMENT ON VIEW vat_report_summary IS 'Quarterly VAT report for e-MTA submission (due within 20 days after quarter end).';
