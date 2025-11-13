import { z } from 'zod';
import crypto from 'crypto';

const MigrationSignalSchema = z.object({
  experiment_id: z.string().min(1),
  arm: z.enum(['control', 'test']),
  assignment_ts: z.string().refine(
    (value) => {
      if (!value) return false;
      const time = Date.parse(value);
      return Number.isFinite(time);
    },
    'assignment_ts must be an ISO 8601 timestamp'
  ),
  mirror_percent: z.number().min(0).max(100).optional(),
  mode: z.enum(['shadow', 'mirroring']).optional(),
});

const AuctionSignalSchema = z.object({
  migration: MigrationSignalSchema.optional(),
}).catchall(z.any());

export const ConsentSchema = z.object({
  gdpr: z.number().int().min(0).max(1).optional(),
  gdpr_consent: z.string().min(1).max(2048).optional(),
  us_privacy: z.string().min(1).max(64).optional(),
  coppa: z.boolean().optional(),
}).partial();

export const DeviceSchema = z.object({
  platform: z.enum(['ios', 'android', 'web', 'unity']).optional(),
  osVersion: z.string().optional(),
  model: z.string().optional(),
  idfa: z.string().optional(),
  gaid: z.string().optional(),
}).partial();

export const AppSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  bundle: z.string().optional(),
  version: z.string().optional(),
}).partial();

export const UserSchema = z.object({
  country: z.string().optional(),
  language: z.string().optional(),
  age: z.number().int().min(0).max(120).optional(),
}).partial();

export const AuctionRequestSchema = z.object({
  body: z.object({
    requestId: z.string().uuid().optional().default(() => crypto.randomUUID?.() || '00000000-0000-0000-0000-000000000000'),
    placementId: z.string().min(1),
    adFormat: z.enum(['banner', 'interstitial', 'rewarded', 'native']),
    floorCpm: z.number().nonnegative().default(0),
    device: DeviceSchema.optional(),
    user: UserSchema.optional(),
    app: AppSchema.optional(),
    consent: ConsentSchema.optional(),
    signal: AuctionSignalSchema.optional(),
  })
});

export type AuctionRequestBody = z.infer<typeof AuctionRequestSchema>['body'];
export type MigrationSignal = z.infer<typeof MigrationSignalSchema>;

export const TrackingTokenSchema = z.object({
  bidId: z.string().min(8),
  placementId: z.string().min(1),
  adapter: z.string().min(1),
  cpm: z.number().nonnegative(),
  currency: z.literal('USD'),
  purpose: z.enum(['delivery', 'imp', 'click']),
  nonce: z.string().min(8),
  iat: z.number().optional(),
  exp: z.number().optional(),
});
