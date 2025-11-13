import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { query } from '../utils/postgres';

const router = Router();

// All admin routes require auth + admin role
router.use(authenticate, authorize(['admin']));

/**
 * GET /api/v1/admin/billing/audit
 * List recent billing audit entries (paginated with optional filters)
 * Query params: page (default 1), limit (default 20), org_id, action, from, to
 */
router.get('/billing/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const limitRaw = parseInt(String(req.query.limit || '20'), 10) || 20;
    const limit = Math.min(Math.max(limitRaw, 1), 100);
    const offset = (page - 1) * limit;

    const orgId = req.query.org_id as string | undefined;
    const action = req.query.action as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const filters: string[] = [];
    const params: any[] = [];

    if (orgId) {
      params.push(orgId);
      filters.push(`organization_id = $${params.length}`);
    }
    if (action) {
      params.push(action);
      filters.push(`event_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      filters.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      filters.push(`created_at <= $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const sql = `
      SELECT id, organization_id, event_type, metadata, created_at
      FROM billing_audit
      ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const countSql = `SELECT COUNT(1) AS count FROM billing_audit ${where}`;

    const [rowsResult, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params),
    ]);

    const total = parseInt(String((countResult.rows[0] as any)?.count || 0), 10) || 0;

    res.json({
      success: true,
      data: rowsResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/impersonate/start
 * Read-only impersonation scaffold (feature-flagged via ADMIN_IMPERSONATION_ENABLED)
 */
router.post('/impersonate/start', async (req: Request, res: Response, next: NextFunction) => {
  const enabled = process.env.ADMIN_IMPERSONATION_ENABLED === 'true';
  if (!enabled) {
    return res.status(404).json({ success: false, error: 'Impersonation disabled' });
  }
  try {
    const actor = (req.user as any)?.userId || null;
    const orgId = (req.user as any)?.organizationId || (req.user as any)?.orgId || null;
    await query(
      `INSERT INTO billing_audit (organization_id, actor_user_id, event_type, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [orgId, actor, 'admin_impersonation_start', JSON.stringify({})]
    );
  } catch {
    // best-effort audit write
  }
  // In a real implementation, set a signed cookie/header to indicate read-only impersonation context
  return res.json({ success: true, message: 'Impersonation started (read-only scaffold)' });
});

/**
 * POST /api/v1/admin/impersonate/stop
 */
router.post('/impersonate/stop', async (req: Request, res: Response) => {
  const enabled = process.env.ADMIN_IMPERSONATION_ENABLED === 'true';
  if (!enabled) {
    return res.status(404).json({ success: false, error: 'Impersonation disabled' });
  }
  try {
    const actor = (req.user as any)?.userId || null;
    const orgId = (req.user as any)?.organizationId || (req.user as any)?.orgId || null;
    await query(
      `INSERT INTO billing_audit (organization_id, actor_user_id, event_type, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [orgId, actor, 'admin_impersonation_stop', JSON.stringify({})]
    );
  } catch {}
  return res.json({ success: true, message: 'Impersonation stopped' });
});

/**
 * GET /api/v1/admin/health/red
 * Returns RED metrics summary using Prometheus HTTP API instant queries over 5m window.
 */
router.get('/health/red', async (_req: Request, res: Response) => {
  const base = process.env.PROMETHEUS_URL;
  if (!base) {
    return res.status(501).json({ success: false, error: 'PROMETHEUS_URL not configured' });
  }

  // Use global fetch (Node 18+). If types are missing, rely on runtime presence.
  const authHeader = process.env.PROMETHEUS_BEARER ? { Authorization: `Bearer ${process.env.PROMETHEUS_BEARER}` } : {};

  async function q(expr: string): Promise<number | null> {
    try {
      const url = new URL('/api/v1/query', base);
      url.searchParams.set('query', expr);
      // @ts-ignore
      const r = await fetch(url.toString(), { headers: { ...authHeader } });
      if (!r.ok) return null;
  const json: any = await r.json();
      const v = json?.data?.result?.[0]?.value?.[1];
      const num = v != null ? Number(v) : null;
      return Number.isFinite(num) ? (num as number) : null;
    } catch {
      return null;
    }
  }

  // Queries (5m rate window)
  const apiRps = await q('sum(rate(http_request_duration_seconds_count{job="backend-api"}[5m]))');
  const apiErr = await q('sum(rate(http_request_duration_seconds_count{status_code=~"5..",job="backend-api"}[5m]))');
  const apiTot = await q('sum(rate(http_request_duration_seconds_count{job="backend-api"}[5m]))');
  const apiErrRate = apiTot && apiTot > 0 ? (apiErr ?? 0) / apiTot : (apiErr ?? 0);
  const apiP95 = await q('histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{job="backend-api"}[5m])))');
  const rtbP95 = await q('histogram_quantile(0.95, sum by (le) (rate(auction_latency_seconds_bucket{job="backend-api"}[5m])))');
  const timeouts = await q('sum(rate(rtb_adapter_timeouts_total{job="backend-api"}[5m]))');

  return res.json({
    success: true,
    data: {
      api_rps_5m: apiRps ?? 0,
      api_error_rate_5m: apiErrRate ?? 0,
      api_p95_latency_5m: apiP95 ?? null,
      rtb_p95_latency_5m: rtbP95 ?? null,
      rtb_adapter_timeouts_rps_5m: timeouts ?? 0,
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
