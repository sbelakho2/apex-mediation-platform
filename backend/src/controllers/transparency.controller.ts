import { Request, Response, NextFunction } from 'express';
import { executeQuery } from '../utils/clickhouse';
import { AppError } from '../middleware/errorHandler';

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
    let candidatesByAuction: Record<string, any[]> = {};
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

    const groupBy = (req.query.group_by as string) || 'placement';
    const allowed = new Set(['publisher', 'placement', 'geo', 'surface']);
    if (!allowed.has(groupBy)) {
      throw new AppError(`Invalid group_by. Allowed: ${Array.from(allowed).join(', ')}`, 400);
    }

    const from = parseDate(req.query.from as string);
    const to = parseDate(req.query.to as string);

    const where: string[] = ['publisher_id = {publisher_id: String}'];
    if (from) where.push('timestamp >= toDateTime({from: String})');
    if (to) where.push('timestamp <= toDateTime({to: String})');

    const dim = groupBy === 'publisher' ? 'publisher_id'
      : groupBy === 'placement' ? 'placement_id'
      : groupBy === 'geo' ? 'device_geo'
      : 'surface_type';

    const query = `
      SELECT 
        ${dim} as group_key,
        count() as auctions,
        avg(winner_bid_ecpm) as avg_ecpm,
        sum(winner_gross_price) as total_gross_price,
        avg(effective_publisher_share) as avg_pub_share
      FROM auctions
      WHERE ${where.join(' AND ')}
      GROUP BY group_key
      ORDER BY auctions DESC
      LIMIT 500
    `;

    const rows = await executeQuery<any>(query, {
      publisher_id: requestedPublisher,
      from: from || undefined,
      to: to || undefined,
    });

    res.json({ group_by: groupBy, rows });
  } catch (err) {
    next(err);
  }
};
