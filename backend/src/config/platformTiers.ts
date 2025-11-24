export type PlatformTierId = 'starter' | 'growth' | 'scale' | 'enterprise';

export const PLATFORM_TIER_ORDER: PlatformTierId[] = ['starter', 'growth', 'scale', 'enterprise'];

export const PLATFORM_TIER_ALIASES: Record<string, PlatformTierId> = {
  starter: 'starter',
  indie: 'starter',
  growth: 'growth',
  studio: 'growth',
  scale: 'scale',
  enterprise: 'enterprise',
};

export const PLATFORM_TIER_IDS = PLATFORM_TIER_ORDER;

export interface PlatformTierUsageLimits {
  included_impressions: number;
  included_api_calls: number;
  included_data_transfer_gb: number;
  overage_price_impressions_cents: number;
  overage_price_api_calls_cents: number;
  overage_price_data_transfer_cents: number;
}

export const PLATFORM_TIER_USAGE_LIMITS: Record<PlatformTierId, PlatformTierUsageLimits> = {
  starter: {
    included_impressions: 1_000_000,
    included_api_calls: 100_000,
    included_data_transfer_gb: 50,
    overage_price_impressions_cents: 10,
    overage_price_api_calls_cents: 5,
    overage_price_data_transfer_cents: 10,
  },
  growth: {
    included_impressions: 10_000_000,
    included_api_calls: 1_000_000,
    included_data_transfer_gb: 500,
    overage_price_impressions_cents: 8,
    overage_price_api_calls_cents: 4,
    overage_price_data_transfer_cents: 8,
  },
  scale: {
    included_impressions: 50_000_000,
    included_api_calls: 5_000_000,
    included_data_transfer_gb: 2_500,
    overage_price_impressions_cents: 6,
    overage_price_api_calls_cents: 3,
    overage_price_data_transfer_cents: 6,
  },
  enterprise: {
    included_impressions: 100_000_000,
    included_api_calls: 10_000_000,
    included_data_transfer_gb: 5_000,
    overage_price_impressions_cents: 5,
    overage_price_api_calls_cents: 2,
    overage_price_data_transfer_cents: 5,
  },
};

export const getTierOrder = (tier: PlatformTierId): number => PLATFORM_TIER_ORDER.indexOf(tier);

export const resolvePlatformTierId = (value?: string | null): PlatformTierId | null => {
  if (!value) return null;
  const normalized = PLATFORM_TIER_ALIASES[String(value).toLowerCase()];
  return normalized ?? null;
};

export const assertPlatformTierId = (value: string, errorMessage?: string): PlatformTierId => {
  const tier = resolvePlatformTierId(value);
  if (!tier) {
    throw new Error(errorMessage || `Unknown platform tier: ${value}`);
  }
  return tier;
};
