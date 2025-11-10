import { Request, Response, NextFunction } from 'express';
import { executeQuery } from '../utils/clickhouse';
import { AppError } from '../middleware/errorHandler';
import * as crypto from 'crypto';
import { canonicalizeForSignature } from '../services/transparency/canonicalizer';
import { transparencyWriter } from '../services/transparencyWriter';

// Helpers
const parseDate = (value?: string): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace('Z', ''); // ClickHouse DateTime64 expects no trailing Z when using toDateTime
};

const getPagination = (req: Request) => {
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10), 1), 500);
  const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
  const offset = (page - 1) * limit;
  return { limit, offset, page };
};

const ensureTransparencyEnabled = () => {
  if (process.env.TRANSPARENCY_API_ENABLED !== 'true') {
    throw new AppError('Transparency API is disabled', 503);
  }
};

/** GET /auctions */
export const getAuctions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureTransparencyEnabled();

    const userPublisherId = req.user?.publisherId;
    if (!userPublisherId) {
      throw new AppError('Unauthorized', 401);
    }

    const requestedPublisher = (req.query.publisher_id as string) || userPublisherId;
    if (requestedPublisher !== userPublisherId) {
      throw new AppError('Forbidden: cannot access other publishers', 403);
    }

    const { limit, offset, page } = getPagination(req);

    const from = parseDate(req.query.from as string);
    const to = parseDate(req.query.to as string);
    const placementId = (req.query.placement_id as string) || undefined;
    const surface = (req.query.surface as string) || undefined;
    const geo = (req.query.geo as string) || undefined;

    // Build WHERE conditions
    const where: string[] = ['publisher_id = {publisher_id: String}'];
    if (from) where.push('timestamp >= toDateTime({from: String})');
    if (to) where.push('timestamp <= toDateTime({to: String})');
    if (placementId) where.push('placement_id = {placement_id: String}');
    if (surface) where.push('surface_type = {surface: String}');
    if (geo) where.push('device_geo = {geo: String}');

    const baseQuery = `
      SELECT 
        auction_id,
        toString(timestamp) as timestamp,
        publisher_id,
        app_or_site_id,
        placement_id,
        surface_type,
        device_os,
        device_geo,
        att_status,
        tc_string_sha256,
        winner_source,
        winner_bid_ecpm,
        winner_gross_price,
        winner_currency,
        winner_reason,
        aletheia_fee_bp,
        sample_bps,
        effective_publisher_share,
        integrity_algo,
        integrity_key_id,
        integrity_signature
      FROM auctions
      WHERE ${where.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT {limit: UInt32} OFFSET {offset: UInt32}
    `;

    const rows = await executeQuery<any>(baseQuery, {
      publisher_id: requestedPublisher,
      from: from || undefined,
      to: to || undefined,
      placement_id: placementId,
      surface,
      geo,
      limit,
      offset,
    });

    // Fetch candidates for these auctions
    const auctionIds = rows.map(r => r.auction_id);
  const candidatesByAuction: Record<string, any[]> = {};
    if (auctionIds.length > 0) {
      const candRows = await executeQuery<any>(
        `SELECT auction_id, source, bid_ecpm, currency, response_time_ms, status, metadata_hash
         FROM auction_candidates
         WHERE auction_id IN {auction_ids: Array(UUID)}
        `,
        { auction_ids: auctionIds }
      );
      for (const c of candRows) {
        if (!candidatesByAuction[c.auction_id]) candidatesByAuction[c.auction_id] = [];
        candidatesByAuction[c.auction_id].push({
          source: c.source,
          bid_ecpm: Number(c.bid_ecpm),
          currency: c.currency,
          response_time_ms: c.response_time_ms,
          status: c.status,
          metadata_hash: c.metadata_hash,
        });
      }
    }

    const data = rows.map(r => ({
      auction_id: r.auction_id,
      timestamp: r.timestamp,
      publisher_id: r.publisher_id,
      app_or_site_id: r.app_or_site_id,
      placement_id: r.placement_id,
      surface_type: r.surface_type,
      device_context: {
        os: r.device_os,
        geo: r.device_geo,
        att: r.att_status,
        tc_string_sha256: r.tc_string_sha256,
      },
      candidates: candidatesByAuction[r.auction_id] || [],
      winner: {
        source: r.winner_source,
        bid_ecpm: Number(r.winner_bid_ecpm),
        gross_price: Number(r.winner_gross_price),
        currency: r.winner_currency,
        reason: r.winner_reason,
      },
      fees: {
        aletheia_fee_bp: r.aletheia_fee_bp,
        effective_publisher_share: Number(r.effective_publisher_share),
      },
      integrity: {
        signature: r.integrity_signature,
        algo: r.integrity_algo,
        key_id: r.integrity_key_id,
      },
    }));

    res.json({
      page,
      limit,
      count: data.length,
      data,
    });
  } catch (err) {
    next(err);
  }
};

/** GET /auctions/:auction_id */
export const getAuctionById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureTransparencyEnabled();

    const userPublisherId = req.user?.publisherId;
    if (!userPublisherId) {
      throw new AppError('Unauthorized', 401);
    }

    const auctionId = req.params.auction_id;

    const rows = await executeQuery<any>(
      `SELECT 
        auction_id,
        toString(timestamp) as timestamp,
        publisher_id,
        app_or_site_id,
        placement_id,
        surface_type,
        device_os,
        device_geo,
        att_status,
        tc_string_sha256,
        winner_source,
        winner_bid_ecpm,
        winner_gross_price,
        winner_currency,
        winner_reason,
        aletheia_fee_bp,
        sample_bps,
        effective_publisher_share,
        integrity_algo,
        integrity_key_id,
        integrity_signature
      FROM auctions
      WHERE auction_id = {auction_id: UUID}
      LIMIT 1
      `,
      { auction_id: auctionId }
    );

    if (rows.length === 0) {
      throw new AppError('Not found', 404);
    }

    if (rows[0].publisher_id !== userPublisherId) {
      throw new AppError('Forbidden: cannot access other publishers', 403);
    }

    const candRows = await executeQuery<any>(
      `SELECT source, bid_ecpm, currency, response_time_ms, status, metadata_hash
       FROM auction_candidates
       WHERE auction_id = {auction_id: UUID}
      `,
      { auction_id: auctionId }
    );

    const r = rows[0];
    const payload = {
      auction_id: r.auction_id,
      timestamp: r.timestamp,
      publisher_id: r.publisher_id,
      app_or_site_id: r.app_or_site_id,
      placement_id: r.placement_id,
      surface_type: r.surface_type,
      device_context: {
        os: r.device_os,
        geo: r.device_geo,
        att: r.att_status,
        tc_string_sha256: r.tc_string_sha256,
      },
      candidates: candRows.map(c => ({
        source: c.source,
        bid_ecpm: Number(c.bid_ecpm),
        currency: c.currency,
        response_time_ms: c.response_time_ms,
        status: c.status,
        metadata_hash: c.metadata_hash,
      })),
      winner: {
        source: r.winner_source,
        bid_ecpm: Number(r.winner_bid_ecpm),
        gross_price: Number(r.winner_gross_price),
        currency: r.winner_currency,
        reason: r.winner_reason,
      },
      fees: {
        aletheia_fee_bp: r.aletheia_fee_bp,
        effective_publisher_share: Number(r.effective_publisher_share),
      },
      integrity: {
        signature: r.integrity_signature,
        algo: r.integrity_algo,
        key_id: r.integrity_key_id,
      },
      sample_bps: Number(r.sample_bps || 0),
    };

    res.json(payload);
  } catch (err) {
    next(err);
  }
};

/** GET /summary/auctions */
export const getAuctionSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureTransparencyEnabled();

    const userPublisherId = req.user?.publisherId;
    if (!userPublisherId) throw new AppError('Unauthorized', 401);

    const requestedPublisher = (req.query.publisher_id as string) || userPublisherId;
    if (requestedPublisher !== userPublisherId) {
      throw new AppError('Forbidden: cannot access other publishers', 403);
    }

    const from = parseDate(req.query.from as string);
    const to = parseDate(req.query.to as string);

    const where: string[] = ['publisher_id = {publisher_id: String}'];
    if (from) where.push('timestamp >= toDateTime({from: String})');
    if (to) where.push('timestamp <= toDateTime({to: String})');

    // Total sampled (signed) auctions
    const totalRows = await executeQuery<any>(
      `SELECT count() as total_sampled
       FROM auctions
       WHERE ${where.join(' AND ')} AND length(integrity_signature) > 0`,
      {
        publisher_id: requestedPublisher,
        from: from || undefined,
        to: to || undefined,
      }
    );

    // Winners by source
    const winnersRows = await executeQuery<any>(
      `SELECT winner_source as source, count() as count
       FROM auctions
       WHERE ${where.join(' AND ')}
       GROUP BY winner_source
       ORDER BY count DESC
       LIMIT 20`,
      {
        publisher_id: requestedPublisher,
        from: from || undefined,
        to: to || undefined,
      }
    );

    // Averages
    const avgRows = await executeQuery<any>(
      `SELECT avg(aletheia_fee_bp) as avg_fee_bp, avg(effective_publisher_share) as publisher_share_avg
       FROM auctions
       WHERE ${where.join(' AND ')}`,
      {
        publisher_id: requestedPublisher,
        from: from || undefined,
        to: to || undefined,
      }
    );

    const summary = {
      total_sampled: Number(totalRows?.[0]?.total_sampled ?? 0),
      winners_by_source: winnersRows.map((r: any) => ({ source: r.source, count: Number(r.count) })),
      avg_fee_bp: Number(avgRows?.[0]?.avg_fee_bp ?? 0),
      publisher_share_avg: Number(avgRows?.[0]?.publisher_share_avg ?? 0),
    };

    res.json(summary);
  } catch (err) {
    next(err);
  }
};


// --- Transparency verification helpers & handlers ---

/** GET /metrics — transparency writer counters (attempted/succeeded/failed, sampled/unsampled) */
export const getTransparencyMetrics = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    ensureTransparencyEnabled();
    const m = transparencyWriter.getMetrics();
    res.json({ success: true, data: m });
  } catch (err) {
    next(err);
  }
};

const ensurePublisherScope = (req: Request, publisherId: string) => {
  const userPublisherId = req.user?.publisherId;
  if (!userPublisherId) {
    throw new AppError('Unauthorized', 401);
  }
  if (publisherId !== userPublisherId) {
    throw new AppError('Forbidden: cannot access other publishers', 403);
  }
};

const parsePublicKey = (source: string) => {
  try {
    const trimmed = source.trim();
    if (trimmed.includes('BEGIN')) {
      return crypto.createPublicKey(trimmed);
    }
    // Try SPKI DER base64
    const der = Buffer.from(trimmed, 'base64');
    try {
      return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    } catch (_) {
      // Last resort: treat as PEM after wrapping (best-effort, may fail)
      const pem = `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----\n`;
      return crypto.createPublicKey(pem);
    }
  } catch (err) {
    return null;
  }
};

/** GET /keys — return active transparency signer public keys */
export const getTransparencyKeys = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureTransparencyEnabled();
    const userPublisherId = req.user?.publisherId;
    if (!userPublisherId) {
      throw new AppError('Unauthorized', 401);
    }

    const rows = await executeQuery<any>(
      `SELECT key_id, algo, public_key_base64, active
       FROM transparency_signer_keys
       WHERE active = 1
       ORDER BY created_at DESC
       LIMIT 10`
    );

    const fallbackKey = process.env.TRANSPARENCY_PUBLIC_KEY_BASE64;
    const keyId = process.env.TRANSPARENCY_KEY_ID || 'env-default';

    const data = rows.length > 0
      ? rows
      : (fallbackKey
          ? [{ key_id: keyId, algo: 'ed25519', public_key_base64: fallbackKey, active: 1 }]
          : []);

    res.json({ count: data.length, data });
  } catch (err) {
    next(err);
  }
};

/** GET /auctions/:auction_id/verify — verify integrity signature */
export const verifyAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureTransparencyEnabled();

    const auctionId = req.params.auction_id;

    // Load auction row
    const aRows = await executeQuery<any>(
      `SELECT 
         auction_id,
         toString(timestamp) as timestamp,
         publisher_id,
         winner_source,
         winner_bid_ecpm,
         winner_currency,
         winner_reason,
         aletheia_fee_bp,
         sample_bps,
         integrity_algo,
         integrity_key_id,
         integrity_signature
       FROM auctions
       WHERE auction_id = {auction_id: UUID}
       LIMIT 1`,
      { auction_id: auctionId }
    );

    if (aRows.length === 0) {
      throw new AppError('Not found', 404);
    }

    // Publisher scoping
    ensurePublisherScope(req, aRows[0].publisher_id);

    // Load candidates
    const cRows = await executeQuery<any>(
      `SELECT source, bid_ecpm, status
       FROM auction_candidates
       WHERE auction_id = {auction_id: UUID}`,
      { auction_id: auctionId }
    );

    // Build canonical payload (must mirror writer)
    const payload = {
      auction: {
        auction_id: aRows[0].auction_id,
        publisher_id: aRows[0].publisher_id,
        timestamp: aRows[0].timestamp,
        winner_source: aRows[0].winner_source,
        winner_bid_ecpm: Number(aRows[0].winner_bid_ecpm || 0),
        winner_currency: aRows[0].winner_currency,
        winner_reason: aRows[0].winner_reason,
        sample_bps: Number(aRows[0].sample_bps || 0),
      },
      candidates: cRows.map((c: any) => ({
        source: c.source,
        bid_ecpm: Number(c.bid_ecpm || 0),
        status: c.status,
      })),
    };

    const canonical = canonicalizeForSignature(payload);
    const signatureB64 = aRows[0].integrity_signature as string | null;
    const algo = (aRows[0].integrity_algo as string | null) || 'ed25519';
    const keyId = aRows[0].integrity_key_id as string | null;

    if (!signatureB64 || !keyId || algo.toLowerCase() !== 'ed25519') {
      return res.json({
        status: 'not_applicable',
        reason: 'missing_signature_or_unsupported_algo',
        key_id: keyId,
        algo,
      });
    }

    // Fetch matching public key (active)
    const kRows = await executeQuery<any>(
      `SELECT key_id, algo, public_key_base64, active
       FROM transparency_signer_keys
       WHERE key_id = {key_id: String} AND active = 1
       LIMIT 1`,
      { key_id: keyId }
    );

    const fallbackKey = process.env.TRANSPARENCY_PUBLIC_KEY_BASE64;
    const keyBase64 = (kRows[0]?.public_key_base64 as string | undefined) || fallbackKey;

    if (!keyBase64) {
      return res.json({
        status: 'unknown_key',
        reason: 'public_key_not_found',
        key_id: keyId,
        algo,
      });
    }

    const pubKey = parsePublicKey(keyBase64);
    if (!pubKey) {
      return res.json({
        status: 'fail',
        reason: 'public_key_parse_failed',
        key_id: keyId,
        algo,
      });
    }

    let verified = false;
    try {
      verified = crypto.verify(
        null,
        Buffer.from(canonical, 'utf8'),
        pubKey,
        Buffer.from(signatureB64, 'base64')
      );
    } catch (e) {
      return res.json({ status: 'fail', reason: 'verification_threw', key_id: keyId, algo });
    }

    return res.json({
      status: verified ? 'pass' : 'fail',
      key_id: keyId,
      algo,
      canonical,
      sample_bps: Number(aRows[0].sample_bps || 0),
    });
  } catch (err) {
    next(err);
  }
};
