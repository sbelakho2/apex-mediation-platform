/**
 * Revenue Share Service
 * Implements marginal (banded) tier pricing model
 * Updated: 2025-11-18 to reflect simplified pricing policy
 */

export interface RevenueTier {
  min: number; // in cents
  max: number | null; // in cents, null = infinity
  rate: number; // percentage as decimal (0.15 = 15%)
}

export interface RevenueShareCalculation {
  gross_revenue_cents: number;
  tier_breakdown: Array<{
    tier_index: number;
    min_cents: number;
    max_cents: number | null;
    rate: number;
    revenue_in_tier_cents: number;
    fee_cents: number;
  }>;
  total_fee_cents: number;
  net_payout_cents: number;
  effective_rate: number; // as decimal
  ctv_premium_cents?: number;
  ctv_premium_applied?: boolean;
}

/**
 * Standard revenue share tiers (marginal pricing)
 * Each euro is charged at its tier rate
 */
export const REVENUE_SHARE_TIERS: RevenueTier[] = [
  { min: 0, max: 1000000, rate: 0.15 }, // €0-€10k @ 15%
  { min: 1000000, max: 5000000, rate: 0.12 }, // €10k-€50k @ 12%
  { min: 5000000, max: 10000000, rate: 0.10 }, // €50k-€100k @ 10%
  { min: 10000000, max: null, rate: 0.08 }, // €100k+ @ 8%
];

/**
 * CTV/Web premium: +2 percentage points to each tier
 */
export const CTV_PREMIUM_POINTS = 2;

export class RevenueShareService {
  /**
   * Calculate revenue share using marginal tier pricing
   * 
   * @param grossRevenueCents - Total revenue in cents (IVT-adjusted, after network clawbacks)
   * @param isCTV - Whether this revenue includes CTV/web video (+2pp premium)
   * @returns Detailed breakdown of fee calculation
   */
  calculateRevenueShare(
    grossRevenueCents: number,
    isCTV: boolean = false
  ): RevenueShareCalculation {
    const tierBreakdown: RevenueShareCalculation['tier_breakdown'] = [];
    let totalFeeCents = 0;
    let remainingRevenueCents = grossRevenueCents;

    // Apply CTV/Web premium if applicable (+2pp to each tier)
    const ctvPremiumPoints = isCTV ? CTV_PREMIUM_POINTS : 0;

    // Calculate fee for each tier
    for (let i = 0; i < REVENUE_SHARE_TIERS.length; i++) {
      const tier = REVENUE_SHARE_TIERS[i];
      
      if (remainingRevenueCents <= 0) {
        break;
      }

      // Determine how much revenue falls in this tier
      const tierMin = tier.min;
      const tierMax = tier.max ?? Infinity;
      const revenueAtTierStart = grossRevenueCents - remainingRevenueCents;

      if (revenueAtTierStart >= tierMax) {
        // We've already passed this tier
        continue;
      }

      const revenueInTierStart = Math.max(0, tierMin - revenueAtTierStart);
      const revenueInTierCents = Math.min(
        remainingRevenueCents - revenueInTierStart,
        tierMax - tierMin
      );

      if (revenueInTierCents > 0) {
        // Apply tier rate + CTV premium
        const effectiveRate = tier.rate + (ctvPremiumPoints / 100);
        const feeCents = Math.floor(revenueInTierCents * effectiveRate);

        tierBreakdown.push({
          tier_index: i,
          min_cents: tierMin,
          max_cents: tier.max,
          rate: effectiveRate,
          revenue_in_tier_cents: revenueInTierCents,
          fee_cents: feeCents,
        });

        totalFeeCents += feeCents;
        remainingRevenueCents -= revenueInTierCents;
      }
    }

    const netPayoutCents = grossRevenueCents - totalFeeCents;
    const effectiveRate = grossRevenueCents > 0 ? totalFeeCents / grossRevenueCents : 0;

    const calculation: RevenueShareCalculation = {
      gross_revenue_cents: grossRevenueCents,
      tier_breakdown: tierBreakdown,
      total_fee_cents: totalFeeCents,
      net_payout_cents: netPayoutCents,
      effective_rate: effectiveRate,
    };

    if (isCTV && ctvPremiumPoints > 0) {
      calculation.ctv_premium_cents = totalFeeCents - this.calculateRevenueShare(grossRevenueCents, false).total_fee_cents;
      calculation.ctv_premium_applied = true;
    }

    return calculation;
  }

  /**
   * Get revenue share tiers configuration
   */
  getTiers(): RevenueTier[] {
    return REVENUE_SHARE_TIERS;
  }

  /**
   * Get CTV premium points
   */
  getCTVPremium(): number {
    return CTV_PREMIUM_POINTS;
  }

  /**
   * Format currency for display (cents to EUR with symbol)
   */
  formatCurrency(cents: number, currency: string = 'EUR'): string {
    const amount = cents / 100;
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  /**
   * Format percentage for display
   */
  formatPercentage(rate: number): string {
    return `${(rate * 100).toFixed(2)}%`;
  }
}

// Export singleton instance
export const revenueShareService = new RevenueShareService();
