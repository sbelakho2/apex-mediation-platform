import { jest } from '@jest/globals';

describe('configSnapshot', () => {
  const requiredEnv = {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
    COOKIE_SECRET: 'y'.repeat(32),
    PORT: '4000',
    API_VERSION: 'v1',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    LOG_LEVEL: 'info',
    TRANSPARENCY_ENABLED: 'false',
    BILLING_ENABLED: 'false',
    FRAUD_DETECTION_ENABLED: 'true',
    AB_TESTING_ENABLED: 'false',
    FEATURE_KILL_SWITCH: 'false',
    FEATURE_ENFORCE_2FA: 'true',
    FEATURE_DISABLE_NEW_ADAPTERS: 'false',
  };

  const setEnv = () => {
    for (const [k, v] of Object.entries(requiredEnv)) {
      process.env[k] = v;
    }
  };

  beforeEach(() => {
    jest.resetModules();
    setEnv();
  });

  it('returns hashes and excludes secrets from exported env snapshot', async () => {
    const { getConfigSnapshot } = await import('../configSnapshot');
    const snap = getConfigSnapshot();

    expect(typeof snap.envHash).toBe('string');
    expect(typeof snap.flagsHash).toBe('string');
    expect(typeof snap.combinedHash).toBe('string');

    // Ensure secrets are not present in exported env snapshot
    expect(snap.env).not.toHaveProperty('DATABASE_URL');
    expect(snap.env).not.toHaveProperty('JWT_SECRET');

    // Ensure flags originate from env
    expect(snap.flags.enforce2fa).toBe(true);
    expect(snap.flags.killSwitch).toBe(false);
  });

  it('changes hashes when flags change', async () => {
    const { getConfigSnapshot } = await import('../configSnapshot');
    const snap1 = getConfigSnapshot();

    // Flip a flag via env and re-import modules to pick up changes
    process.env.FEATURE_KILL_SWITCH = 'true';
    jest.resetModules();
    const { getConfigSnapshot: getConfigSnapshot2 } = await import('../configSnapshot');
    const snap2 = getConfigSnapshot2();

    expect(snap1.flagsHash).not.toEqual(snap2.flagsHash);
    expect(snap1.combinedHash).not.toEqual(snap2.combinedHash);
  });
});
