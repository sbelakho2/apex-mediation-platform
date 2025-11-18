import { Request, Response, NextFunction } from 'express';
import { apiKeyAuth } from './apiKeyAuth';
import { authenticate } from './auth';

/**
 * authenticateOrApiKey
 *
 * Allows either session/JWT auth (authenticate) or API key auth on a route.
 * Routing rules:
 * - If an API key header is present (Authorization: Bearer sk_* or X-Api-Key), attempt API key auth.
 * - Otherwise, fall back to the standard authenticate middleware.
 * - This avoids double 401s and keeps existing cookie/JWT flows intact while enabling programmatic access.
 */
export async function authenticateOrApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const authz = (req.header('authorization') || '').trim();
    const xKey = (req.header('x-api-key') || req.header('X-Api-Key') || '').trim();

    const hasApiKeyHeader = Boolean(xKey) || authz.toLowerCase().startsWith('bearer sk_');

    if (hasApiKeyHeader) {
      return apiKeyAuth(req, res, next);
    }
    // Default to session/JWT auth
    return authenticate(req, res, next);
  } catch (e) {
    return next(e);
  }
}

export default authenticateOrApiKey;
