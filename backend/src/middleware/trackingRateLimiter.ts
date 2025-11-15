import { Request, Response, NextFunction } from 'express';
import { redis } from '../utils/redis';
import { trackingBlockedTotal, trackingHeadTotal, trackingRateLimitedTotal } from '../utils/prometheus';
import { safeInc } from '../utils/metrics';

const num = (v: string | undefined, d: number) => {
  const n = parseInt(v || '', 10); return Number.isFinite(n) ? n : d;
};

const WINDOW_MS = num(process.env.TRACK_WINDOW_MS, 60_000);
const MAX_REQ = num(process.env.TRACK_MAX, 300);

function matches(re: string | undefined, s: string): boolean {
  if (!re) return false; 
  try { return new RegExp(re, 'i').test(s); } catch { return false; }
}

export async function trackingRateLimiter(req: Request, res: Response, next: NextFunction) {
  try {
    // Count HEADs (allowed, quick return 204 for /t/imp)
    if (req.method === 'HEAD') {
      safeInc(trackingHeadTotal);
      return res.status(204).send();
    }

    const ua = req.get('user-agent') || '';

    // UA block/allow lists
    const blockRe = process.env.TRACK_UA_BLOCK_RE;
    const allowRe = process.env.TRACK_UA_ALLOW_RE;
    if (blockRe && matches(blockRe, ua) && !(allowRe && matches(allowRe, ua))) {
      safeInc(trackingBlockedTotal, { reason: 'ua_block' });
      return res.status(400).send('blocked');
    }

    // Rate limit per IP + path
    if (!redis.isReady()) return next();
    const ip = req.ip || 'unknown';
    const path = req.baseUrl + req.path;
    const key = `rl:track:${path}:${ip}`;
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, Math.ceil(WINDOW_MS / 1000));
    }
    if (current > MAX_REQ) {
      safeInc(trackingRateLimitedTotal);
      const ttl = await redis.ttl(key);
      const retryAfter = Math.max(
        1,
        typeof ttl === 'number' && ttl > 0 ? ttl : Math.ceil(WINDOW_MS / 1000)
      );
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).send('rate_limited');
    }
    return next();
  } catch {
    // Fail open
    return next();
  }
}

export default trackingRateLimiter;
