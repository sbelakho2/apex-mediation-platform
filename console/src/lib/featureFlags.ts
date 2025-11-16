const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes'])

const FALSE_VALUES = new Set(['0', 'false', 'off', 'no'])

const DEFAULTS = {
  transparencyRefresh: true,
  billingMigration: false,
  requireAdminGuard: true,
} as const

export type FeatureFlagName = keyof typeof DEFAULTS

function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined' || typeof process.env === 'undefined') {
    return undefined
  }
  return process.env[key]
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (TRUE_VALUES.has(normalized)) {
    return true
  }
  if (FALSE_VALUES.has(normalized)) {
    return false
  }
  return fallback
}

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  switch (flag) {
    case 'transparencyRefresh':
      return parseBoolean(readEnv('NEXT_PUBLIC_ENABLE_TRANSPARENCY_REFRESH'), DEFAULTS.transparencyRefresh)
    case 'billingMigration':
      return parseBoolean(readEnv('NEXT_PUBLIC_ENABLE_BILLING_MIGRATION'), DEFAULTS.billingMigration)
    case 'requireAdminGuard':
      return parseBoolean(readEnv('NEXT_PUBLIC_REQUIRE_ADMIN_GUARD'), DEFAULTS.requireAdminGuard)
    default:
      return false
  }
}

export const featureFlags = {
  transparencyRefresh: isFeatureEnabled('transparencyRefresh'),
  billingMigration: isFeatureEnabled('billingMigration'),
  requireAdminGuard: isFeatureEnabled('requireAdminGuard'),
}
