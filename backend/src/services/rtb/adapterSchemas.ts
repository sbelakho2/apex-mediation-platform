import { z } from 'zod';
import { getNameById } from '../../repositories/adaptersRepository';

/**
 * Centralized per‑adapter schema registry.
 *
 * Philosophy:
 * - Keep schemas minimal and safe (required core creds only) and `.passthrough()`
 *   to avoid blocking vendor‑specific options.
 * - Validate only when we recognize the adapter; otherwise fall back to generic
 *   bounds in the controller.
 * - Prefer lookup by adapterId; fall back to name when ID→name isn't known.
 */

export const MAX_STRING_LEN = 2048; // aligned with adapter.controller caps

const safeString = (min = 1, max = MAX_STRING_LEN) => z.string().min(min).max(max);

// Minimal pragmatic schemas for common networks
const admobSchema = z
  .object({
    apiKey: safeString(8),
    accountId: safeString(3, 128),
    appId: safeString(3, 128).optional(),
    placements: z.record(z.string(), safeString(1, 256)).optional(),
  })
  .passthrough();

const applovinSchema = z
  .object({
    sdkKey: safeString(8),
    reportKey: safeString(8).optional(),
    accountId: safeString(3, 128).optional(),
  })
  .passthrough();

const unitySchema = z
  .object({
    organizationId: safeString(3, 128),
    projectId: safeString(3, 128),
    apiKey: safeString(8).optional(),
    gameId: safeString(3, 128).optional(),
  })
  .passthrough();

const facebookSchema = z
  .object({
    accessToken: safeString(8),
    accountId: safeString(3, 128),
    appId: safeString(3, 128).optional(),
    appSecret: safeString(8).optional(),
  })
  .passthrough();

const ironSourceSchema = z
  .object({
    appKey: safeString(8),
    secretKey: safeString(8),
    advertiserId: safeString(3, 128).optional(),
  })
  .passthrough();

const mintegralSchema = z
  .object({
    apiKey: safeString(8),
    appId: safeString(3, 128),
    placementId: safeString(3, 128).optional(),
  })
  .passthrough();

// Exported maps
export const schemasByName: Record<string, z.ZodTypeAny> = {
  admob: admobSchema,
  applovin: applovinSchema,
  unity: unitySchema, // accept both 'unity' and 'unityads' names if used inconsistently
  unityads: unitySchema,
  facebook: facebookSchema,
  meta: facebookSchema,
  ironsource: ironSourceSchema,
  mintegral: mintegralSchema,
};

// Optional: fill with canonical UUIDs when available in your environment
export const schemasById: Record<string, z.ZodTypeAny> = {
  // '00000000-0000-0000-0000-000000000001': admobSchema,
};

export type GetSchemaInput = { adapterId?: string; name?: string };

/**
 * Resolve schema by adapterId, falling back to adapter name.
 */
export async function getSchemaForAdapter(input: GetSchemaInput) {
  if (input.adapterId && schemasById[input.adapterId]) return schemasById[input.adapterId];
  if (input.name && schemasByName[input.name]) return schemasByName[input.name];
  if (input.adapterId) {
    try {
      const name = await getNameById(input.adapterId);
      if (name && schemasByName[name]) return schemasByName[name];
    } catch (_e) {
      // ignore DB lookup failures and fall back to unknown (no strict validation)
    }
  }
  return null;
}
