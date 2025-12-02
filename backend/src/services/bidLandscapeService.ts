/**
 * Bid Landscape Logging Service
 * 
 * Tracks all bids received during RTB auctions for transparency,
 * optimization, and publisher trust. Provides complete visibility
 * into adapter performance, bid pricing, and auction mechanics.
 */

import { insertMany, query } from '../utils/postgres';
import type {
  OpenRTBBidRequest,
  OpenRTBBidResponse,
  Bid,
} from '../types/openrtb.types';
import logger from '../utils/logger';

const LANDSCAPE_STAGE_TABLE = 'analytics_bid_landscape_stage';
const LANDSCAPE_TARGET_TABLE = 'analytics_bid_landscape';
const LANDSCAPE_COLUMNS = [
  'observed_at',
  'auction_id',
  'request_id',
  'publisher_id',
  'app_id',
  'placement_id',
  'adapter_id',
  'adapter_name',
  'imp_id',
  'bid_id',
  'bid_price',
  'bid_currency',
  'creative_id',
  'advertiser_domain',
  'won',
  'clearing_price',
  'second_price',
  'auction_duration_ms',
  'total_bids',
] as const;

type BidLandscapeRow = {
  observed_at: Date;
  auction_id: string;
  request_id: string;
  publisher_id: string;
  app_id: string;
  placement_id: string;
  adapter_id: string;
  adapter_name: string;
  imp_id: string;
  bid_id: string;
  bid_price: number;
  bid_currency: string;
  creative_id: string;
  advertiser_domain: string;
  won: boolean;
  clearing_price: number;
  second_price: number;
  auction_duration_ms: number;
  total_bids: number;
};

const quoteIdentifier = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

const toRow = (entry: BidLandscapeRow): unknown[] => [
  entry.observed_at,
  entry.auction_id,
  entry.request_id,
  entry.publisher_id,
  entry.app_id,
  entry.placement_id,
  entry.adapter_id,
  entry.adapter_name,
  entry.imp_id,
  entry.bid_id,
  entry.bid_price,
  entry.bid_currency,
  entry.creative_id,
  entry.advertiser_domain,
  entry.won,
  entry.clearing_price,
  entry.second_price,
  entry.auction_duration_ms,
  entry.total_bids,
];

interface AuctionResult {
  success: boolean;
  response?: OpenRTBBidResponse;
  metrics: {
    totalBids: number;
    auctionDuration: number;
    adapterResponses: number;
    adapterTimeouts: number;
    adapterErrors: number;
  };
  allBids: Array<{
    adapter: {
      id: string;
      name: string;
    };
    bid: Bid;
  }>;
}

export class BidLandscapeService {
  /**
   * Log complete auction results including all bids received
   * Provides transparency into bid pricing and adapter performance
   */
  async logAuction(
    request: OpenRTBBidRequest,
    result: AuctionResult
  ): Promise<void> {
    try {
      const observedAt = new Date();
      // Extract IDs from request
      const publisherId = request.site?.publisher?.id || request.app?.publisher?.id || 'unknown';
      const appId = request.app?.id || request.site?.id || 'unknown';
      const placementId = request.imp[0]?.tagid || 'unknown';
      const requestId = request.id || 'unknown';
      const currency = (request.imp[0]?.bidfloorcur || 'USD').toUpperCase().slice(0, 3);

      // Calculate clearing price (what winner pays in second-price auction)
      let clearingPrice = 0;
      let secondPrice = 0;
      let winningBidPrice = 0;

      if (result.success && result.response?.seatbid?.[0]?.bid?.[0]) {
        const winningBid = result.response.seatbid[0].bid[0];
        winningBidPrice = Number(winningBid.price) || 0;

        // In second-price auction: winner pays (second highest + $0.01)
        if (result.allBids.length > 1) {
          const sortedBids = [...result.allBids].sort((a, b) => (Number(b.bid.price) || 0) - (Number(a.bid.price) || 0));
          secondPrice = Number(sortedBids[1].bid.price) || 0;
          clearingPrice = Math.max(0, secondPrice + 0.01);
        } else {
          // Only one bid: clearing price = bid floor or bid price
          const bidFloor = request.imp[0]?.bidfloor || 0.01;
          clearingPrice = Math.max(0, Math.max(bidFloor, winningBidPrice));
          secondPrice = Math.max(0, clearingPrice);
        }
      }

      const entries: BidLandscapeRow[] = result.allBids.map((bidData) => {
        const bidPrice = Number(bidData.bid.price) || 0;
        const isWinner =
          result.success &&
          result.response?.seatbid?.[0]?.bid?.[0]?.id === bidData.bid.id;
        const impId = bidData.bid.impid || request.imp[0]?.id || 'unknown';
        const bidId = this.buildBidId(bidData.bid, bidData.adapter.id, impId, bidPrice);

        return {
          observed_at: observedAt,
          auction_id: requestId,
          request_id: requestId,
          publisher_id: publisherId,
          app_id: appId,
          placement_id: placementId,
          adapter_id: bidData.adapter.id,
          adapter_name: bidData.adapter.name,
          imp_id: impId,
          bid_id: bidId,
          bid_price: bidPrice,
          bid_currency: currency,
          creative_id: bidData.bid.crid || bidData.bid.cid || '',
          advertiser_domain: bidData.bid.adomain?.[0] || '',
          won: isWinner,
          clearing_price: isWinner ? clearingPrice : 0,
          second_price: isWinner ? secondPrice : 0,
          auction_duration_ms: result.metrics.auctionDuration,
          total_bids: result.metrics.totalBids,
        };
      });

      if (entries.length === 0) {
        entries.push({
          observed_at: observedAt,
          auction_id: requestId,
          request_id: requestId,
          publisher_id: publisherId,
          app_id: appId,
          placement_id: placementId,
          adapter_id: 'none',
          adapter_name: 'no_bid',
          imp_id: request.imp[0]?.id || 'unknown',
          bid_id: `${requestId}-no-bid`,
          bid_price: 0,
          bid_currency: currency,
          creative_id: '',
          advertiser_domain: '',
          won: false,
          clearing_price: 0,
          second_price: 0,
          auction_duration_ms: result.metrics.auctionDuration,
          total_bids: 0,
        });
      }

      await this.persistEntries(entries);

      logger.debug('Bid landscape logged', {
        auction_id: request.id,
        total_bids: entries.length,
        winner: entries.find((e) => e.won)?.adapter_name || 'none',
        clearing_price: clearingPrice,
      });

    } catch (error) {
      // Don't fail the request if logging fails
      logger.error('Failed to log bid landscape', { 
        error,
        auction_id: request.id 
      });
    }
  }

  /**
   * Get bid landscape analytics for a publisher
   * Shows average bids, win rates, and pricing by adapter
   */
  async getPublisherBidLandscape(
    publisherId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<Record<string, unknown>>> {
    const sql = `
      SELECT
        adapter_name,
        COUNT(*) AS total_bids,
        SUM(CASE WHEN won THEN 1 ELSE 0 END) AS wins,
        ROUND(SUM(CASE WHEN won THEN 1 ELSE 0 END)::numeric * 100 / NULLIF(COUNT(*), 0), 2) AS win_rate_pct,
        ROUND(AVG(bid_price)::numeric, 4) AS avg_bid_price,
        ROUND(AVG(CASE WHEN won THEN clearing_price END)::numeric, 4) AS avg_clearing_price,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY bid_price)::numeric, 4) AS median_bid_price,
        ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY bid_price)::numeric, 4) AS p90_bid_price,
        ROUND(percentile_cont(0.99) WITHIN GROUP (ORDER BY bid_price)::numeric, 4) AS p99_bid_price
      FROM ${quoteIdentifier(LANDSCAPE_TARGET_TABLE)}
      WHERE publisher_id = $1
        AND observed_at >= $2
        AND observed_at < $3
        AND adapter_id <> 'none'
      GROUP BY adapter_name
      ORDER BY total_bids DESC
    `;

    const result = await query(sql, [publisherId, startDate, endDate], {
      replica: true,
      label: 'BID_LANDSCAPE_PUBLISHER',
    });
    return result.rows as Array<Record<string, unknown>>;
  }

  /**
   * Get auction timeline showing bid distribution over time
   */
  async getAuctionTimeline(
    publisherId: string,
    startDate: Date,
    endDate: Date,
    intervalMinutes: number = 60
  ): Promise<Array<Record<string, unknown>>> {
    const sql = `
      SELECT
        to_timestamp(floor(extract(epoch FROM observed_at) / ($4::int * 60)) * ($4::int * 60)) AS time_bucket,
        COUNT(DISTINCT auction_id) AS total_auctions,
        SUM(CASE WHEN total_bids > 0 THEN 1 ELSE 0 END) AS auctions_with_bids,
        SUM(CASE WHEN won THEN 1 ELSE 0 END) AS won_auctions,
        ROUND(AVG(total_bids)::numeric, 2) AS avg_bids_per_auction,
        ROUND(AVG(CASE WHEN won THEN clearing_price END)::numeric, 4) AS avg_clearing_price,
        ROUND(AVG(auction_duration_ms)::numeric, 2) AS avg_auction_duration_ms
      FROM ${quoteIdentifier(LANDSCAPE_TARGET_TABLE)}
      WHERE publisher_id = $1
        AND observed_at >= $2
        AND observed_at < $3
      GROUP BY time_bucket
      ORDER BY time_bucket
    `;

    const result = await query(sql, [publisherId, startDate, endDate, intervalMinutes], {
      replica: true,
      label: 'BID_LANDSCAPE_TIMELINE',
    });
    return result.rows as Array<Record<string, unknown>>;
  }

  /**
   * Check service health
   */
  isEnabled(): boolean {
    return true;
  }

  /**
   * Close service resources (pg pool lifecycle handled centrally)
   */
  async close(): Promise<void> {
    // Intentionally no-op. Connection lifecycle handled by pg Pool.
  }

  private async persistEntries(entries: BidLandscapeRow[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const rows = entries.map(toRow);
    await insertMany(LANDSCAPE_STAGE_TABLE, [...LANDSCAPE_COLUMNS], rows);
    await this.mergeStageIntoTarget();
  }

  private async mergeStageIntoTarget(): Promise<void> {
    const columnSql = LANDSCAPE_COLUMNS.map(quoteIdentifier).join(', ');
    const conflictSql = ['observed_at', 'auction_id', 'adapter_id', 'bid_id']
      .map(quoteIdentifier)
      .join(', ');

    await query(
      `INSERT INTO ${quoteIdentifier(LANDSCAPE_TARGET_TABLE)} (${columnSql})
       SELECT ${columnSql} FROM ${quoteIdentifier(LANDSCAPE_STAGE_TABLE)}
       ON CONFLICT (${conflictSql}) DO NOTHING`
    );
    await query(`TRUNCATE ${quoteIdentifier(LANDSCAPE_STAGE_TABLE)}`);
  }

  private buildBidId(bid: Bid, adapterId: string, impId: string, bidPrice: number): string {
    if (bid.id) {
      return bid.id;
    }
    return `${adapterId}-${impId}-${Math.round(bidPrice * 1_000_000)}`;
  }
}

// Singleton instance
export const bidLandscapeService = new BidLandscapeService();
