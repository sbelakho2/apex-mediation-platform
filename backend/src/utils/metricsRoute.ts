import type { Request } from 'express';

/**
 * Derive a low‑cardinality route identifier.
 * Prefers Express route path templates (e.g., /invoices/:id) over raw paths.
 * Falls back to baseUrl or a static string.
 */
export function getRouteId(req: Request): string {
  try {
    // Express attaches `route` on matched handlers
    const routePath = (req as any).route?.path as string | undefined;
    if (routePath && typeof routePath === 'string') {
      const base = req.baseUrl || '';
      return `${base}${routePath}`.replace(/\/$/, '') || '/';
    }
    // If router stack hasn’t attached yet, use baseUrl
    if (req.baseUrl) return req.baseUrl.replace(/\/$/, '') || '/';
    // Last resort: method only
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
