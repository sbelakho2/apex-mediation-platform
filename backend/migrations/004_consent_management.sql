-- GDPR/CCPA Consent Management

CREATE TABLE IF NOT EXISTS user_consents (
    user_id UUID PRIMARY KEY,
    consent_string TEXT,  -- TCF 2.2 consent string
    gpp_string TEXT,      -- GPP consent string
    gpp_sid JSONB,        -- GPP Section IDs array
    gdpr_applies BOOLEAN NOT NULL DEFAULT FALSE,
    ccpa_applies BOOLEAN NOT NULL DEFAULT FALSE,
    consent_given BOOLEAN NOT NULL DEFAULT TRUE,
    purposes JSONB NOT NULL DEFAULT '[]',  -- Array of consented purpose IDs
    vendors JSONB NOT NULL DEFAULT '[]',   -- Array of consented vendor IDs
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_consents_gdpr 
  ON user_consents(gdpr_applies) WHERE gdpr_applies = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_consents_ccpa 
  ON user_consents(ccpa_applies) WHERE ccpa_applies = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_consents_updated 
  ON user_consents(updated_at DESC);

-- Audit log for consent changes (GDPR compliance)
CREATE TABLE IF NOT EXISTS consent_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'accessed')),
    consent_string TEXT,
    gpp_string TEXT,
    gdpr_applies BOOLEAN,
    ccpa_applies BOOLEAN,
    consent_given BOOLEAN,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_audit_user_id 
  ON consent_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_created 
  ON consent_audit_log(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE user_consents IS 
  'User consent records for GDPR/CCPA compliance with TCF 2.2 and GPP support';
COMMENT ON COLUMN user_consents.consent_string IS 
  'TCF 2.2 encoded consent string from CMP';
COMMENT ON COLUMN user_consents.gpp_string IS 
  'Global Privacy Platform (GPP) consent string';
COMMENT ON COLUMN user_consents.gpp_sid IS 
  'GPP Section IDs indicating which privacy regulations apply';
COMMENT ON COLUMN user_consents.purposes IS 
  'Array of IAB TCF purpose IDs that user has consented to';
COMMENT ON COLUMN user_consents.vendors IS 
  'Array of IAB vendor IDs that user has consented to';

COMMENT ON TABLE consent_audit_log IS 
  'Audit trail of all consent-related actions for GDPR compliance';
