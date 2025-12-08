import { createHash } from 'crypto';
import { env } from './env';
import { FeatureFlags, getFeatureFlags } from './featureFlags';

// Whitelist of non-sensitive env fields for hashing/parity checks.
const EXPORTED_ENV_KEYS: Array<keyof typeof env> = [
  'NODE_ENV',
  'API_VERSION',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX_REQUESTS',
  'TRANSPARENCY_ENABLED',
  'BILLING_ENABLED',
  'FRAUD_DETECTION_ENABLED',
  'AB_TESTING_ENABLED',
  'PROMETHEUS_ENABLED',
  'LOG_LEVEL',
  'ENABLE_CSP',
  'TRUST_PROXY',
  'FEATURE_KILL_SWITCH',
  'FEATURE_ENFORCE_2FA',
  'FEATURE_DISABLE_NEW_ADAPTERS',
];

export type ConfigSnapshot = {
  env: Record<string, unknown>;
  flags: FeatureFlags;
  envHash: string;
  flagsHash: string;
  combinedHash: string;
  generatedAt: string;
};

function sha256Hex(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function collectEnvSnapshot(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const key of EXPORTED_ENV_KEYS) {
    snapshot[key] = (env as any)[key];
  }
  return snapshot;
}

export function getConfigSnapshot(): ConfigSnapshot {
  const envSnapshot = collectEnvSnapshot();
  const flags = getFeatureFlags();
  const envHash = sha256Hex(envSnapshot);
  const flagsHash = sha256Hex(flags);
  const combinedHash = sha256Hex({ envHash, flagsHash });

  return {
    env: envSnapshot,
    flags,
    envHash,
    flagsHash,
    combinedHash,
    generatedAt: new Date().toISOString(),
  };
}
