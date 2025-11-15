import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

type ReqWithUser = Request & { user?: { publisherId?: string } };

/**
 * Read-only rate limiter for Transparency API.
 * Defaults can be overridden per publisher via env variables.
 *
 * Env vars:
 * - TRANSPARENCY_RATE_LIMIT_RPM_DEFAULT: default requests per minute per key (IP+publisher) [default: 120]
 * - TRANSPARENCY_RATE_LIMIT_RPM_KEYS: requests per minute specifically for /keys endpoint [default: 300]
 * - TRANSPARENCY_RATE_LIMIT_RPM_PUBLISHER_<PUBLISHER_ID>: per-publisher override in RPM (e.g., 3000)
 */
function getPublisherOverride(publisherId?: string): number | undefined {
  if (!publisherId) return undefined;
  const key = `TRANSPARENCY_RATE_LIMIT_RPM_PUBLISHER_${publisherId}`;
  const val = process.env[key];
  if (!val) return undefined;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function keyGenerator(req: Request): string {
  // Combine publisher and IP to spread load fairly while still scoping by tenant
  // Fallbacks ensure deterministic key even if user missing in some tests
  const pub = (req as ReqWithUser).user?.publisherId || 'anon';
  const xfwd = req.headers['x-forwarded-for'];
  const firstXfwd = Array.isArray(xfwd) ? xfwd[0] : xfwd;
  const ip = (req.ip || (firstXfwd ? firstXfwd.split(',')[0] : '') || req.socket.remoteAddress || 'unknown');
  return `${pub}:${ip}`;
}

export const readOnlyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: (req: Request) => {
    const pub = (req as ReqWithUser).user?.publisherId;
    const override = getPublisherOverride(pub);
    const def = Number(process.env.TRANSPARENCY_RATE_LIMIT_RPM_DEFAULT || 120);
    return override ?? def;
  },
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
});

export const keysRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: (req: Request) => {
    const pub = (req as ReqWithUser).user?.publisherId;
    const override = getPublisherOverride(pub);
    const def = Number(process.env.TRANSPARENCY_RATE_LIMIT_RPM_KEYS || 300);
    // Use the higher of per-publisher override and keys default to not punish large clients
    return Math.max(override ?? 0, def || 300);
  },
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
});
