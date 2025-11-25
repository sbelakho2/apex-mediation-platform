-- Require publishers to provide settlement banking details for auto-collections
CREATE TABLE IF NOT EXISTS publisher_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    scheme TEXT NOT NULL CHECK (scheme IN ('sepa', 'ach')),
    account_holder_name TEXT NOT NULL,
    iban TEXT,
    bic TEXT,
    account_number TEXT,
    routing_number TEXT,
    account_type TEXT CHECK (account_type IS NULL OR account_type IN ('CHECKING', 'SAVINGS')),
    mandate_reference TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (publisher_id),
    CHECK (
        (scheme = 'sepa' AND iban IS NOT NULL AND bic IS NOT NULL AND account_number IS NULL AND routing_number IS NULL)
        OR
        (scheme = 'ach' AND account_number IS NOT NULL AND routing_number IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_publisher_bank_accounts_publisher ON publisher_bank_accounts (publisher_id);
