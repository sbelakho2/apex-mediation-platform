-- Migration 027: Add SEB ledger account for optional Estonian banking rail
-- Ensures the chart of accounts includes a dedicated ledger bucket for SEB payments

INSERT INTO chart_of_accounts (code, name, account_type, description)
SELECT '1130', 'Bank - SEB', 'asset', 'SEB Pank AS business account'
WHERE NOT EXISTS (
    SELECT 1 FROM chart_of_accounts WHERE code = '1130'
);
