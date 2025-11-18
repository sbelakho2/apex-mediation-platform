-- Migration: Add marginal tier pricing support
-- Created: 2025-11-18
-- Updated: 2025-11-18 - Simplified to remove plan complexity
-- Purpose: Implement new revenue share calculation with marginal tiers + CTV premium

-- =====================================================
-- 1. Revenue Share Calculations Table
-- =====================================================
-- Store historical revenue share calculations for audit trail

CREATE TABLE IF NOT EXISTS revenue_share_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  billing_period_start TIMESTAMP NOT NULL,
  billing_period_end TIMESTAMP NOT NULL,
  
  -- Revenue breakdown
  gross_revenue_cents BIGINT NOT NULL DEFAULT 0,
  ivt_adjustment_cents BIGINT NOT NULL DEFAULT 0, -- Invalid traffic adjustment (negative)
  network_clawback_cents BIGINT NOT NULL DEFAULT 0, -- Network adjustments (can be negative)
  adjusted_revenue_cents BIGINT NOT NULL DEFAULT 0, -- After IVT and clawbacks
  
  -- CTV/Web video tracking
  is_ctv BOOLEAN NOT NULL DEFAULT false,
  ctv_premium_points SMALLINT DEFAULT 0, -- e.g., 2 = +2pp
  
  -- Tier breakdown (JSONB for flexibility)
  tier_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  /* Example structure:
  [
    {
      "tier_index": 0,
      "min_cents": 0,
      "max_cents": 1000000,
      "rate": 0.15,
      "revenue_in_tier_cents": 1000000,
      "fee_cents": 150000
    },
    ...
  ]
  */
  
  -- Fee calculation
  total_fee_cents BIGINT NOT NULL DEFAULT 0,
  
  -- Payout
  net_payout_cents BIGINT NOT NULL DEFAULT 0,
  effective_rate DECIMAL(5, 4) NOT NULL DEFAULT 0, -- e.g., 0.1075 = 10.75%
  
  -- Metadata
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'system',
  
  -- Invoice reference
  invoice_id UUID DEFAULT NULL REFERENCES invoices(id) ON DELETE SET NULL
);

CREATE INDEX idx_revenue_share_customer ON revenue_share_calculations(customer_id);
CREATE INDEX idx_revenue_share_period ON revenue_share_calculations(billing_period_start, billing_period_end);
CREATE INDEX idx_revenue_share_created ON revenue_share_calculations(created_at DESC);
CREATE INDEX idx_revenue_share_invoice ON revenue_share_calculations(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_revenue_share_ctv ON revenue_share_calculations(is_ctv) WHERE is_ctv = true;

COMMENT ON TABLE revenue_share_calculations IS 'Historical revenue share calculations with marginal tier breakdown';
COMMENT ON COLUMN revenue_share_calculations.tier_breakdown IS 'JSONB array of tier calculations for transparency';
COMMENT ON COLUMN revenue_share_calculations.effective_rate IS 'Final fee as percentage of adjusted revenue (for reporting)';
COMMENT ON COLUMN revenue_share_calculations.is_ctv IS 'Whether CTV/web video premium (+2pp) was applied';

-- =====================================================
-- 2. Function: Calculate Marginal Tier Fee
-- =====================================================
-- Helper function to calculate fee using marginal tiers

CREATE OR REPLACE FUNCTION calculate_marginal_tier_fee(
  p_gross_revenue_cents BIGINT,
  p_is_ctv BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_tiers JSONB;
  v_tier JSONB;
  v_tier_breakdown JSONB := '[]'::jsonb;
  v_total_fee_cents BIGINT := 0;
  v_remaining_cents BIGINT := p_gross_revenue_cents;
  v_ctv_premium_points SMALLINT := CASE WHEN p_is_ctv THEN 2 ELSE 0 END;
  v_result JSONB;
BEGIN
  -- Define tiers (same for all customers)
  v_tiers := '[
    {"min": 0, "max": 1000000, "rate": 0.15},
    {"min": 1000000, "max": 5000000, "rate": 0.12},
    {"min": 5000000, "max": 10000000, "rate": 0.10},
    {"min": 10000000, "max": null, "rate": 0.08}
  ]'::jsonb;
  
  -- Calculate fee for each tier
  FOR v_tier IN SELECT * FROM jsonb_array_elements(v_tiers)
  LOOP
    DECLARE
      v_tier_min BIGINT := (v_tier->>'min')::bigint;
      v_tier_max BIGINT := COALESCE((v_tier->>'max')::bigint, 9223372036854775807); -- Max BIGINT
      v_tier_rate DECIMAL := (v_tier->>'rate')::decimal;
      v_effective_rate DECIMAL := v_tier_rate + (v_ctv_premium_points::decimal / 100.0);
      v_revenue_in_tier BIGINT := 0;
      v_fee_in_tier BIGINT := 0;
    BEGIN
      IF v_remaining_cents > 0 AND p_gross_revenue_cents > v_tier_min THEN
        -- Calculate how much revenue falls in this tier
        v_revenue_in_tier := LEAST(v_remaining_cents, v_tier_max - v_tier_min);
        
        -- Calculate fee for this tier
        v_fee_in_tier := FLOOR(v_revenue_in_tier * v_effective_rate);
        
        -- Add to tier breakdown
        v_tier_breakdown := v_tier_breakdown || jsonb_build_object(
          'min_cents', v_tier_min,
          'max_cents', CASE WHEN (v_tier->>'max') IS NULL THEN null ELSE (v_tier->>'max')::bigint END,
          'rate', v_effective_rate,
          'revenue_in_tier_cents', v_revenue_in_tier,
          'fee_cents', v_fee_in_tier
        );
        
        v_total_fee_cents := v_total_fee_cents + v_fee_in_tier;
        v_remaining_cents := v_remaining_cents - v_revenue_in_tier;
      END IF;
    END;
  END LOOP;
  
  -- Build result
  DECLARE
    v_net_payout_cents BIGINT := p_gross_revenue_cents - v_total_fee_cents;
    v_effective_rate DECIMAL := CASE 
      WHEN p_gross_revenue_cents > 0 THEN v_total_fee_cents::decimal / p_gross_revenue_cents::decimal
      ELSE 0
    END;
  BEGIN
    v_result := jsonb_build_object(
      'gross_revenue_cents', p_gross_revenue_cents,
      'tier_breakdown', v_tier_breakdown,
      'total_fee_cents', v_total_fee_cents,
      'net_payout_cents', v_net_payout_cents,
      'effective_rate', v_effective_rate,
      'is_ctv', p_is_ctv,
      'ctv_premium_points', v_ctv_premium_points
    );
  END;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION calculate_marginal_tier_fee IS 'Calculate revenue share using marginal (banded) pricing tiers with optional +2pp CTV/web premium';

-- =====================================================
-- 3. Sample usage queries
-- =====================================================

-- Example: Calculate fee for €25,000 revenue (standard)
-- SELECT calculate_marginal_tier_fee(2500000, false);

-- Example: Calculate fee for €120,000 revenue (CTV/web)
-- SELECT calculate_marginal_tier_fee(12000000, true);
