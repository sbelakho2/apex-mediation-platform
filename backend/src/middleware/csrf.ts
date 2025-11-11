import { NextFunction, Request, Response } from 'express';
import csurf from 'csurf';

const bool = (v: string | undefined, dflt = false) => (v == null ? dflt : v === '1' || v.toLowerCase?.() === 'true');

// Double-submit cookie strategy: httpOnly auth cookies + readable XSRF-TOKEN cookie
const baseCsurf = csurf({
  cookie: {
    key: process.env.CSRF_COOKIE_NAME || 'XSRF-TOKEN',
    httpOnly: false, // must be readable by browser JS
    sameSite: (process.env.COOKIE_SAMESITE as any) || 'lax',
    secure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  },
  value: (req: Request) => req.headers['x-csrf-token'] as string || (req as any).body?._csrf || '',
});

// Wrapper that ignores CSRF for specific auth acquisition endpoints (login/register/refresh)
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const path = req.path || '';
  const method = req.method.toUpperCase();
  const apiVersion = process.env.API_VERSION || 'v1';
  const authAcquire = new RegExp(`^/api/${apiVersion}/auth/(login|register|refresh)$`);
  if (method === 'POST' && authAcquire.test(path)) {
    return next();
  }
  return (baseCsurf as any)(req, res, next);
}

// Helper route handler to set token cookie explicitly
export function issueCsrfToken(req: Request, res: Response, _next: NextFunction) {
  // When using csurf, req.csrfToken() will set the cookie via the configured cookie options
  const token = (req as any).csrfToken ? (req as any).csrfToken() : '';
  res.json({ success: true, token });
}

export default csrfProtection;
