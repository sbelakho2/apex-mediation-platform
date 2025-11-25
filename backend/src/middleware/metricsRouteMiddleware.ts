import type { Request, Response, NextFunction } from 'express';
import { httpRequestDurationSeconds, httpRequestsTotal } from '../utils/prometheus';
import { getRouteId } from '../utils/metricsRoute';

/**
 * Metrics route labeling middleware
 *
 * Records HTTP RED metrics with low‑cardinality `route_id` instead of raw paths.
 * Safe to register once near the top of the middleware chain.
 */
export function metricsRouteMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const route = getRouteId(req);
      const method = (req.method || 'GET').toUpperCase();
      const status_code = String(res.statusCode);
      // Duration in seconds
      const end = process.hrtime.bigint();
      const durSec = Number(end - start) / 1e9;
      try { httpRequestsTotal.inc({ method, route, status_code }); } catch { /* noop */ }
      try { httpRequestDurationSeconds.observe({ method, route, status_code }, durSec); } catch { /* noop */ }
    } catch { /* noop */ }
  });
  next();
}

export default metricsRouteMiddleware;
