import { Request, Response } from 'express';
import { verifyToken } from '../utils/signing';
import { TrackingTokenSchema } from '../schemas/rtb';
import { redis } from '../utils/redis';
import logger from '../utils/logger';
import { getClickHouseClient } from '../utils/clickhouse';
import { queueManager, QueueName } from '../queues/queueManager';
import { analyticsEventsEnqueuedTotal } from '../utils/prometheus';
import crypto from 'crypto';

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
    if (decoded.purpose !== 'delivery' || typeof decoded.url !== 'string') {
      return res.status(400).send('invalid token');
    }
    // Optionally: log delivery view for diagnostics (not an impression)
    return res.redirect(302, decoded.url);
  } catch (e) {
    return res.status(400).send('invalid token');
  }
}

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
          try { analyticsEventsEnqueuedTotal.inc({ kind }); } catch {}
          return; // enqueued successfully
        }
      } catch (e) {
        // fall through to direct insert
      }
    }

    // Fallback: direct insert
    const ch = getClickHouseClient();
    await ch.insert({
      table: kind === 'imp' ? 'impressions' : 'clicks',
      values: [payload],
      format: 'JSONEachRow',
    });
  } catch (e) {
    // best effort only
    logger.warn('Failed to write tracking to ClickHouse', { error: (e as Error).message });
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
    } catch {}

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
    } catch {}

    await recordEvent('click', claims, req);
    // Redirect to advertiser landing if available in token (optional)
    return res.redirect(302, '/');
  } catch (e) {
    return res.status(400).send('invalid token');
  }
}
