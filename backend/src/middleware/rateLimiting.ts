/**
 * Rate Limiting Middleware
 * 
 * Prevents DoS attacks and API abuse
 * Multiple tiers for different endpoint types
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Extend Express Request to include rateLimit info
declare module 'express-serve-static-core' {
  interface Request {
    rateLimit?: {
      limit: number;
      current: number;
      remaining: number;
      resetTime: number;
    };
  }
}

/**
 * Standard rate limit for general API endpoints
 * 100 requests per 15 minutes per IP
 */
export const standardRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: req.rateLimit ? Math.ceil(req.rateLimit.resetTime / 1000) : 900, // seconds until reset
    });
  },
});

/**
 * Strict rate limit for authentication endpoints
 * 5 requests per 15 minutes per IP (prevents brute force)
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful auth attempts
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Too many failed login attempts from this IP. Please try again later.',
      retryAfter: req.rateLimit ? Math.ceil(req.rateLimit.resetTime / 1000) : 900,
    });
  },
});

/**
 * Generous rate limit for read-only endpoints
 * 1000 requests per 15 minutes per IP
 */
export const readOnlyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many read requests from this IP, please try again later.',
      retryAfter: req.rateLimit ? Math.ceil(req.rateLimit.resetTime / 1000) : 900,
    });
  },
});

/**
 * Very strict rate limit for expensive operations
 * 10 requests per hour per IP (report generation, exports)
 */
export const expensiveOperationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Expensive operation rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many expensive operations from this IP. This operation is limited to 10 requests per hour.',
      retryAfter: req.rateLimit ? Math.ceil(req.rateLimit.resetTime / 1000) : 3600,
    });
  },
});

/**
 * Rate limit for file uploads
 * 20 uploads per hour per IP
 */
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Upload rate limit exceeded',
      message: 'Too many file uploads from this IP. Limit: 20 per hour.',
      retryAfter: req.rateLimit ? Math.ceil(req.rateLimit.resetTime / 1000) : 3600,
    });
  },
});

/**
 * Rate limit for webhook callbacks
 * 500 requests per minute (high throughput for legitimate webhooks)
 */
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // 500 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Skip rate limiting for known webhook IPs (e.g., Stripe)
    const trustedWebhookIPs = (process.env.TRUSTED_WEBHOOK_IPS || '').split(',');
    return trustedWebhookIPs.includes(req.ip || '');
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Webhook rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Webhook rate limit exceeded',
      message: 'Too many webhook requests from this IP.',
      retryAfter: req.rateLimit ? Math.ceil(req.rateLimit.resetTime / 1000) : 60,
    });
  },
});

/**
 * Global rate limit (catches all requests, very generous)
 * 10,000 requests per hour per IP
 */
export const globalRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10000, // 10,000 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.error(`[RateLimit] GLOBAL rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Global rate limit exceeded',
      message: 'Excessive API usage detected. Contact support if you need higher limits.',
      retryAfter: req.rateLimit ? Math.ceil(req.rateLimit.resetTime / 1000) : 3600,
    });
  },
});

/**
 * Per-user rate limit (requires authentication)
 * 5000 requests per hour per user
 */
export const createUserRateLimit = () => rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5000, // 5000 requests per hour per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, fallback to IP
    return req.user?.userId || req.ip || 'anonymous';
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] User rate limit exceeded for user: ${req.user?.userId || 'anonymous'}`);
    res.status(429).json({
      error: 'User rate limit exceeded',
      message: 'You have exceeded your hourly API quota. Upgrade your plan for higher limits.',
      retryAfter: req.rateLimit ? Math.ceil(req.rateLimit.resetTime / 1000) : 3600,
      upgradeUrl: 'https://apexmediation.com/pricing'
    });
  },
});

// Export rate limiters
export default {
  standard: standardRateLimit,
  auth: authRateLimit,
  readOnly: readOnlyRateLimit,
  expensive: expensiveOperationRateLimit,
  upload: uploadRateLimit,
  webhook: webhookRateLimit,
  global: globalRateLimit,
  user: createUserRateLimit(),
};
