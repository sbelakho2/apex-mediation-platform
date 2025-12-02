import { Request, Response } from 'express';
import { verifyToken } from '../utils/signing';
import { TrackingTokenSchema } from '../schemas/rtb';
import { redis } from '../utils/redis';
import logger from '../utils/logger';
import { query } from '../utils/postgres';
import { queueManager, QueueName } from '../queues/queueManager';
import { analyticsEventsEnqueuedTotal } from '../utils/prometheus';
import crypto from 'crypto';
import { URL } from 'url';

const parseToken = (token: string) => {
  const decoded = verifyToken<any>(token);
  const parse = TrackingTokenSchema.safeParse(decoded);
  if (!parse.success) {
    throw new Error('Invalid tracking token');
  }
  return parse.data;
};

export async function getCreative(req: Request, res: Response) {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).send('missing token');
    const decoded: any = verifyToken<any>(token);
    if (decoded.purpose !== 'delivery') {
      return res.status(400).send('invalid token');
    }
    // Optionally: log delivery view for diagnostics (not an impression)
    const target = typeof decoded.url === 'string' ? decoded.url : '/';
    return res.redirect(302, sanitizeRedirect(target, req));
  } catch (e) {
    return res.status(400).send('invalid token');
  }
}

const INSERT_TRACKING_EVENT_SQL = `
  INSERT INTO rtb_tracking_events
  (event_type, observed_at, bid_id, placement_id, adapter, cpm, ua_hash, ip_hash, metadata)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

async function recordEvent(kind: 'imp' | 'click', claims: any, req: Request) {
  try {
    const ua = req.get('user-agent') || '';
    const ip = req.ip || '';
    const ts = new Date().toISOString();
    const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex').slice(0, 16);
    const payload = {
      ts,
      bid_id: claims.bidId,
      placement_id: claims.placementId,
      adapter: claims.adapter,
      cpm: claims.cpm,
      ua_hash: ua ? md5(ua) : '',
      ip_hash: ip ? md5(ip) : '',
    };

    // Prefer enqueue to analytics ingest queue if available
    if (queueManager && queueManager.isReady()) {
      try {
        const queue = (queueManager as any).getQueue ? (queueManager as any).getQueue(QueueName.ANALYTICS_INGEST) : null;
        if (queue) {
          await queue.add(kind, { kind, payload }, { removeOnComplete: true, removeOnFail: { age: 3600 } });
          try { analyticsEventsEnqueuedTotal.inc({ kind }); } catch (e) { void e; }
          return; // enqueued successfully
        }
      } catch (e) {
        // fall through to direct insert
      }
    }

    // Fallback: write directly to Postgres tracking table
    try {
      await query(INSERT_TRACKING_EVENT_SQL, [
        kind,
        new Date(payload.ts),
        claims.bidId,
        claims.placementId,
        claims.adapter,
        claims.cpm ?? 0,
        payload.ua_hash || null,
        payload.ip_hash || null,
        JSON.stringify({
          currency: claims.currency,
          nonce: claims.nonce,
        }),
      ]);
    } catch (dbError) {
      logger.warn('Failed to write tracking to Postgres', { error: (dbError as Error).message });
    }
  } catch (e) {
    // best effort only
    logger.warn('Failed to write tracking event', { error: (e as Error).message });
  }
}

export async function trackImpression(req: Request, res: Response) {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).send('missing token');
    const claims = parseToken(token);
    if (claims.purpose !== 'imp') return res.status(400).send('invalid token');

    // dedupe (best effort)
    try {
      if (redis.isReady()) {
        const key = `dedupe:imp:${claims.bidId}`;
        const exists = await redis.get(key);
        if (exists) return res.status(204).send();
        await redis.setEx(key, 600, '1');
      }
    } catch (e) { void e; }

    await recordEvent('imp', claims, req);
    return res.status(204).send();
  } catch (e) {
    return res.status(400).send('invalid token');
  }
}

export async function trackClick(req: Request, res: Response) {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).send('missing token');
    const claims = parseToken(token);
    if (claims.purpose !== 'click') return res.status(400).send('invalid token');

    // dedupe (best effort)
    try {
      if (redis.isReady()) {
        const key = `dedupe:click:${claims.bidId}`;
        const exists = await redis.get(key);
        if (exists) return res.redirect(302, '/');
        await redis.setEx(key, 600, '1');
      }
    } catch (e) { void e; }

    await recordEvent('click', claims, req);
    // Redirect to advertiser landing if available in token (optional)
    const target = typeof (claims as any).url === 'string' ? (claims as any).url : '/';
    return res.redirect(302, sanitizeRedirect(target, req));
  } catch (e) {
    return res.status(400).send('invalid token');
  }
}

// Enforce safe redirects: same-origin or allow-listed hosts; otherwise fallback '/'
function sanitizeRedirect(targetUrl: string, req: Request): string {
  try {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
    const base = `${proto}://${host}`;
    const url = new URL(targetUrl, base);
    const allowed = (process.env.ALLOWED_REDIRECT_HOSTS || '')
      .split(',')
      .map(h => h.trim())
      .filter(Boolean);
    const isSameHost = url.host === host;
    const isAllowed = allowed.includes(url.host);
    if (isSameHost || isAllowed) return url.toString();
    logger.warn('Blocked redirect to non-allowed host', { to: url.host, path: url.pathname });
    return '/';
  } catch (e) {
    logger.warn('Invalid redirect target, falling back to /', { error: (e as Error).message });
    return '/';
  }
}
