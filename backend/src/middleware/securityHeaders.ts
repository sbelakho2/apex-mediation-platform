import { Request, Response, NextFunction } from 'express';

/**
 * Sets a strong baseline of security headers. Configure CSP via env if needed.
 * Note: Wire this middleware in your Express app before route handlers.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // HSTS (only in production over HTTPS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'no-referrer');

  // Permissions-Policy (restrict powerful features by default)
  res.setHeader(
    'Permissions-Policy',
    [
      'geolocation=()',
      'microphone=()',
      'camera=()',
      'fullscreen=(self)',
      'payment=()',
    ].join(', ')
  );

  // Basic CSP; allow override via env
  const csp = process.env.CSP_HEADER ||
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // replace with nonce-based in production UI server
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
  res.setHeader('Content-Security-Policy', csp);

  next();
}

export default securityHeaders;
