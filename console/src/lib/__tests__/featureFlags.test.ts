import { featureFlags, isFeatureEnabled } from '../featureFlags'

describe('featureFlags', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_ENABLE_TRANSPARENCY_REFRESH
    delete process.env.NEXT_PUBLIC_ENABLE_BILLING_MIGRATION
    delete process.env.NEXT_PUBLIC_REQUIRE_ADMIN_GUARD
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('uses defaults when env vars are missing', () => {
    expect(isFeatureEnabled('transparencyRefresh')).toBe(true)
    expect(isFeatureEnabled('billingMigration')).toBe(false)
    expect(isFeatureEnabled('requireAdminGuard')).toBe(true)
  })

  it('treats truthy string values as enabled', () => {
    process.env.NEXT_PUBLIC_ENABLE_TRANSPARENCY_REFRESH = 'TRUE'
    process.env.NEXT_PUBLIC_ENABLE_BILLING_MIGRATION = '1'

    expect(isFeatureEnabled('transparencyRefresh')).toBe(true)
    expect(isFeatureEnabled('billingMigration')).toBe(true)
  })

  it('treats falsy strings as disabled', () => {
    process.env.NEXT_PUBLIC_REQUIRE_ADMIN_GUARD = 'false'
    expect(isFeatureEnabled('requireAdminGuard')).toBe(false)
  })

  it('exposes a memoized snapshot export', () => {
    expect(featureFlags).toMatchObject({
      transparencyRefresh: true,
      billingMigration: false,
      requireAdminGuard: true,
    })
  })
})
