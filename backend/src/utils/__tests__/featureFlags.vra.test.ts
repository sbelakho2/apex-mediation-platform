import { getFeatureFlags } from '../../utils/featureFlags';

describe('VRA feature flags defaults (safe-by-default)', () => {
  const env = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
    delete process.env.VRA_ENABLED;
    delete process.env.VRA_SHADOW_ONLY;
    delete process.env.VRA_ALLOWED_NETWORKS;
  });

  afterAll(() => {
    process.env = env;
  });

  it('defaults to VRA disabled and shadow-only true', () => {
    const f = getFeatureFlags();
    expect(f.vraEnabled).toBe(false);
    expect(f.vraShadowOnly).toBe(true);
    expect(typeof f.vraAllowedNetworks).toBe('string');
  });

  it('respects env overrides', () => {
    process.env.VRA_ENABLED = 'true';
    process.env.VRA_SHADOW_ONLY = 'false';
    process.env.VRA_ALLOWED_NETWORKS = 'unity, admob';
    const f = getFeatureFlags();
    expect(f.vraEnabled).toBe(true);
    expect(f.vraShadowOnly).toBe(false);
    expect(f.vraAllowedNetworks).toContain('unity');
  });
});
