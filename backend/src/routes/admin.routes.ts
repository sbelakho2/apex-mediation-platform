import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { query } from '../utils/postgres';
import { AppDataSource } from '../database';
import { AdapterConfig } from '../database/entities/adapterConfig.entity';
import adapterConfigService from '../services/adapterConfigService';
import { z } from 'zod';
import logger from '../utils/logger';
import { redis } from '../utils/redis';

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
  } catch (e) {
    // best-effort audit write
    void e;
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
  } catch (e) { void e; }
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
      // @ts-expect-error Node 18+ provides global fetch at runtime; type may be missing depending on tsconfig lib targets
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

/**
 * Adapter Registry Admin (619)
 *
 * Manage RTB adapter configurations stored in DB with TTL cache in adapterConfigService.
 * All routes below are admin‑only (router is already auth+authorize(['admin'])).
 */

// GET /api/v1/admin/rtb/adapters — list adapter configs (masked)
router.get('/rtb/adapters', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(AdapterConfig);
    const rows = await repo.find();
    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      timeoutMs: r.timeoutMs,
      weights: r.weights ?? null,
      // never return credentialsCiphertext
      hasCredentials: Boolean(r.credentialsCiphertext),
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
    }));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// GET /api/v1/admin/rtb/adapters/:name — get single adapter config (masked)
router.get('/rtb/adapters/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(AdapterConfig);
    const name = String(req.params.name);
    const row = await repo.findOne({ where: { name } });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    const data = {
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      timeoutMs: row.timeoutMs,
      weights: row.weights ?? null,
      hasCredentials: Boolean(row.credentialsCiphertext),
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

const upsertSchema = z.object({
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().min(100).max(10_000).optional(),
  weights: z.record(z.unknown()).optional(),
  // Provide credentials object or string to (re)encrypt; omit to keep existing
  credentials: z.union([z.string(), z.record(z.unknown())]).optional(),
});

// PUT /api/v1/admin/rtb/adapters/:name — upsert config; refresh cache immediately
router.put('/rtb/adapters/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = String(req.params.name);
    const body = upsertSchema.parse(req.body ?? {});
    const repo = AppDataSource.getRepository(AdapterConfig);
    let row = await repo.findOne({ where: { name } });

    if (!row) {
      row = repo.create({
        name,
        enabled: body.enabled ?? true,
        timeoutMs: body.timeoutMs ?? 800,
        weights: body.weights ?? null,
      });
    } else {
      if (typeof body.enabled === 'boolean') row.enabled = body.enabled;
      if (typeof body.timeoutMs === 'number') row.timeoutMs = body.timeoutMs;
      if (body.weights !== undefined) row.weights = body.weights as any;
    }

    if (body.credentials !== undefined) {
      try {
        // Store AES‑GCM ciphertext as base64 JSON (do not log plaintext)
        const { aesGcmEncrypt } = await import('../utils/crypto');
        const plaintext = typeof body.credentials === 'string' ? body.credentials : JSON.stringify(body.credentials);
        row.credentialsCiphertext = JSON.stringify(aesGcmEncrypt(plaintext));
      } catch (e) {
        logger.warn('[Admin] Failed to encrypt adapter credentials; leaving unchanged', { name, error: (e as Error).message });
        // If encrypt fails during create and no prior creds, keep null; otherwise leave existing
        if (!row.id) row.credentialsCiphertext = null;
      }
    }

    await repo.save(row);
    // Trigger immediate cache refresh (in addition to periodic watcher)
    await adapterConfigService.refreshCache().catch(() => undefined);
    // Publish invalidation so other nodes refresh
    try { if ((redis as any).publish) { await (redis as any).publish('adapter-configs:invalidate', 'upsert'); } } catch { /* noop */ }

    const data = {
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      timeoutMs: row.timeoutMs,
      weights: row.weights ?? null,
      hasCredentials: Boolean(row.credentialsCiphertext),
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
    res.json({ success: true, data });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid payload', details: e.errors });
    }
    next(e);
  }
});

// POST /api/v1/admin/rtb/adapters/invalidate — force cache refresh now
router.post('/rtb/adapters/invalidate', async (_req: Request, res: Response) => {
  try {
    await adapterConfigService.refreshCache();
    try { if ((redis as any).publish) { await (redis as any).publish('adapter-configs:invalidate', 'manual'); } } catch { /* noop */ }
    res.json({ success: true, message: 'Adapter config cache refreshed' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to refresh cache' });
  }
});

export default router;
