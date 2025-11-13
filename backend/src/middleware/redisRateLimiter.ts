import { Request, Response, NextFunction } from 'express';
import { redis } from '../utils/redis';

// Simple Redis-backed sliding window limiter for sensitive routes (e.g., auth)
// Keys on IP + route. Configure via env: RATE_LIMIT_AUTH_WINDOW_MS, RATE_LIMIT_AUTH_MAX
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // default 15m
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_AUTH_MAX || '50', 10);

export const authRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // If Redis is not ready, skip (fallback to global in-memory limiter already attached)
    if (!redis.isReady()) {
      return next();
    }

    const ip = req.ip || 'unknown';
    const route = req.baseUrl || req.path || 'auth';
    const key = `rl:auth:${route}:${ip}`;

    // Increment and set ttl only on first hit
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, Math.ceil(WINDOW_MS / 1000));
    }

    if (current > MAX_REQUESTS) {
      const ttl = await redis.ttl(key);
      const retryAfter = Math.max(
        1,
        typeof ttl === 'number' && ttl > 0 ? ttl : Math.ceil(WINDOW_MS / 1000)
      );
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
      });
    }

    return next();
  } catch (_e) {
    // Fail open on limiter errors to avoid disrupting auth
    return next();
  }
};

export default authRateLimiter;
