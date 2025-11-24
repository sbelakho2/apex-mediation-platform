import type { PlatformTierId } from '../../config/platformTiers';
export type { PlatformTierId } from '../../config/platformTiers';

export interface PlatformTier {
  id: PlatformTierId;
  name: string;
  description: string;
  min_revenue_cents: number;
  max_revenue_cents: number | null;
  rate: number | null; // decimal form (0.025 = 2.5%)
  min_rate?: number; // for enterprise custom band
  max_rate?: number;
  example_fee_note?: string;
}

export interface PlatformFeeCalculation {
  gross_revenue_cents: number;
  tier: PlatformTier;
  applied_rate: number;
  fee_cents: number;
  net_revenue_cents: number;
  rate_source: 'standard' | 'custom-enterprise';
}

const USD_CENTS = 100;

const usd = (amount: number) => amount * USD_CENTS;

export const PLATFORM_FEE_TIERS: PlatformTier[] = [
  {
    id: 'starter',
    name: 'Tier 0 — Starter',
    description: '0% platform fee up to $10k mediated revenue per app per month while you validate BYO flows.',
    min_revenue_cents: 0,
    max_revenue_cents: usd(10_000),
    rate: 0,
    example_fee_note: '$25k/mo example → still free until revenue exceeds $10k',
  },
  {
    id: 'growth',
    name: 'Tier 1 — Growth',
    description: '2.5% platform fee for $10k–$100k per app per month with advanced observability and migration tooling.',
    min_revenue_cents: usd(10_000) + 1,
    max_revenue_cents: usd(100_000),
    rate: 0.025,
    example_fee_note: '$50k/mo example → $1,250 platform fee',
  },
  {
    id: 'scale',
    name: 'Tier 2 — Scale',
    description: '2.0% platform fee for $100k–$500k per app per month with named revenue engineers and custom exports.',
    min_revenue_cents: usd(100_000) + 1,
    max_revenue_cents: usd(500_000),
    rate: 0.02,
    example_fee_note: '$250k/mo example → $5,000 platform fee',
  },
  {
    id: 'enterprise',
    name: 'Tier 3 — Enterprise',
    description: 'Custom 1.0–1.5% platform fee for $500k+ per app per month plus contractual SLAs and bespoke compliance.',
    min_revenue_cents: usd(500_000) + 1,
    max_revenue_cents: null,
    rate: null,
    min_rate: 0.01,
    max_rate: 0.015,
    example_fee_note: '$750k/mo example → $7,500–$11,250 depending on negotiated rate',
  },
];

export class PlatformFeeService {
  constructor(private readonly tiers: PlatformTier[] = PLATFORM_FEE_TIERS) {}

  calculatePlatformFee(
    grossRevenueCents: number,
    options: { customEnterpriseRatePercent?: number } = {}
  ): PlatformFeeCalculation {
    if (!Number.isFinite(grossRevenueCents) || grossRevenueCents < 0) {
      throw new Error('grossRevenueCents must be a non-negative number');
    }

    const tier = this.resolveTier(grossRevenueCents);
    const appliedRate = this.resolveRate(tier, options.customEnterpriseRatePercent);
    const feeCents = Math.floor(grossRevenueCents * appliedRate);

    return {
      gross_revenue_cents: grossRevenueCents,
      tier,
      applied_rate: appliedRate,
      fee_cents: feeCents,
      net_revenue_cents: grossRevenueCents - feeCents,
      rate_source: tier.id === 'enterprise' && options.customEnterpriseRatePercent ? 'custom-enterprise' : 'standard',
    };
  }

  getTiers(): PlatformTier[] {
    return this.tiers;
  }

  private resolveTier(grossRevenueCents: number): PlatformTier {
    const tier = this.tiers.find((candidate) => {
      const aboveMin = grossRevenueCents >= candidate.min_revenue_cents;
      const withinMax = candidate.max_revenue_cents == null || grossRevenueCents <= candidate.max_revenue_cents;
      return aboveMin && withinMax;
    });

    // If revenue is 0 (e.g., pre-launch) we still default to Starter tier
    return tier ?? this.tiers[0];
  }

  private resolveRate(tier: PlatformTier, customEnterpriseRatePercent?: number): number {
    if (tier.id !== 'enterprise') {
      return tier.rate ?? 0;
    }

    if (typeof customEnterpriseRatePercent === 'number') {
      const decimal = customEnterpriseRatePercent / 100;
      const min = tier.min_rate ?? 0.01;
      const max = tier.max_rate ?? 0.015;
      if (decimal < min || decimal > max) {
        throw new Error(`Enterprise rate must be between ${(min * 100).toFixed(1)}% and ${(max * 100).toFixed(1)}%`);
      }
      return decimal;
    }

    // Default to highest published rate until custom contract signed
    return tier.max_rate ?? 0.015;
  }
}

export const platformFeeService = new PlatformFeeService();
