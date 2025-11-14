import { Request, Response, NextFunction } from 'express';
import { getFeatureFlags } from '../config/featureFlags';

// Global kill-switch middleware. When enabled, most API routes return 503.
// We exempt health checks and feature flags endpoints to allow recovery.
export function killSwitchGuard(req: Request, res: Response, next: NextFunction) {
  const { killSwitch } = getFeatureFlags();
  if (!killSwitch) return next();

  const path = req.path || '';
  // Allowlist: health, metrics, flags (to turn off), and static assets
  if (
    path === '/health' ||
    path === '/metrics' ||
    path.startsWith('/api/v1/flags')
  ) {
    return next();
  }

  res.status(503).json({ success: false, error: 'Service temporarily unavailable (kill switch active)' });
}
