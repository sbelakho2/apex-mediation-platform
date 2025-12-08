import { createPublicKey, generateKeyPairSync, sign, verify } from 'crypto';
import { z } from 'zod';

// Placement schema with bounds that mirror the mobile SDKs
const placementSchema = z.object({
  placementId: z.string().min(1, 'placementId is required'),
  adType: z.string().min(1, 'adType is required'),
  enabledNetworks: z.array(z.string()).default([]),
  timeoutMs: z.number().int().positive().max(30_000, 'timeoutMs must be <= 30000'),
  maxWaitMs: z.number().int().positive().max(60_000, 'maxWaitMs must be <= 60000'),
  floorPrice: z.number().min(0).default(0),
  refreshInterval: z.number().int().positive().max(3_600_000).nullable().optional(),
  targeting: z.record(z.any()).default({}),
});

const featureFlagsSchema = z.object({
  telemetryEnabled: z.boolean().optional(),
  crashReportingEnabled: z.boolean().optional(),
  debugLoggingEnabled: z.boolean().optional(),
  experimentalFeaturesEnabled: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
});

export const configSchema = z
  .object({
    configId: z.string().min(1, 'configId is required'),
    version: z.number().int().positive('version must be > 0'),
    placements: z.record(placementSchema),
    adapters: z.record(z.any()),
    features: featureFlagsSchema.default({}),
    signature: z.string().min(1, 'signature is required'),
    timestamp: z.number().int().positive('timestamp must be > 0'),
  })
  .superRefine((cfg, ctx) => {
    Object.entries(cfg.placements).forEach(([key, pl]) => {
      if (key.trim().length === 0) {
        ctx.addIssue({ code: 'custom', message: 'placement key must be non-empty' });
      }
      if (pl.placementId !== key) {
        ctx.addIssue({
          code: 'custom',
          message: `placementId mismatch for key ${key}`,
        });
      }
      if (pl.timeoutMs > pl.maxWaitMs) {
        ctx.addIssue({ code: 'custom', message: `timeoutMs must be <= maxWaitMs for ${key}` });
      }
    });
  });

export type RemoteConfig = z.infer<typeof configSchema>;

export type ValidationResult = {
  ok: boolean;
  errors?: string[];
};

export type VerificationResult = ValidationResult;

function signingMessage(cfg: RemoteConfig): Buffer {
  const payload = {
    config_id: cfg.configId,
    version: cfg.version,
    timestamp: cfg.timestamp,
  };
  return Buffer.from(JSON.stringify(payload));
}

function decodeBase64(input: string, label: string): Buffer {
  try {
    const buf = Buffer.from(input, 'base64');
    if (buf.length === 0 || Number.isNaN(buf[0])) {
      throw new Error('empty');
    }
    return buf;
  } catch (e) {
    const reason = (e as Error).message;
    throw new Error(`${label} is not valid base64: ${reason}`);
  }
}

export function validateConfigSchema(payload: unknown): { ok: boolean; config?: RemoteConfig; errors?: string[] } {
  const result = configSchema.safeParse(payload);
  if (!result.success) {
    return { ok: false, errors: result.error.errors.map((e) => e.message) };
  }
  return { ok: true, config: result.data };
}

export function verifyConfigSignature(cfg: RemoteConfig, publicKeyBase64: string): VerificationResult {
  try {
    const pubKeyBytes = decodeBase64(publicKeyBase64, 'publicKeyBase64');
    const signatureBytes = decodeBase64(cfg.signature, 'signature');
    const keyObject = createPublicKey({ key: pubKeyBytes, format: 'der', type: 'spki' });
    const message = signingMessage(cfg);
    const isValid = verify(null, message, keyObject, signatureBytes);
    if (!isValid) {
      return { ok: false, errors: ['signature verification failed'] };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
}

const ROLLOUT_STEPS = [1, 5, 25, 100];

export function nextRolloutStep(currentPercent: number, sloBreached: boolean): { next: number; rolledBack: boolean } {
  if (sloBreached) {
    return { next: 0, rolledBack: true };
  }
  const currentIndex = ROLLOUT_STEPS.findIndex((v) => v === currentPercent);
  if (currentIndex === -1) {
    // start or invalid current value; move to first step
    return { next: ROLLOUT_STEPS[0], rolledBack: false };
  }
  const next = ROLLOUT_STEPS[Math.min(currentIndex + 1, ROLLOUT_STEPS.length - 1)];
  return { next, rolledBack: false };
}

// Utility for tests: sign a config in-memory
export function signConfig(cfg: RemoteConfig, privateKey: Buffer): string {
  const message = signingMessage(cfg);
  return sign(null, message, { key: privateKey, format: 'der', type: 'pkcs8' }).toString('base64');
}

// Utility for tests: generate test keypair
export function generateTestKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyDer: publicKey.export({ format: 'der', type: 'spki' }) as Buffer,
    privateKeyDer: privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer,
  };
}
