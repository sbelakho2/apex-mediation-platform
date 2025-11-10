/**
 * Bid Landscape Logging Service
 * 
 * Tracks all bids received during RTB auctions for transparency,
 * optimization, and publisher trust. Provides complete visibility
 * into adapter performance, bid pricing, and auction mechanics.
 */

import { getClickHouseClient } from '../utils/clickhouse';
import type { 
  OpenRTBBidRequest, 
  OpenRTBBidResponse,
  Bid 
} from '../types/openrtb.types';
import { logger } from '../utils/logger';

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

interface BidLandscapeEntry {
  auction_id: string;
  request_id: string;
  timestamp: string;
  publisher_id: string;
  app_id: string;
  placement_id: string;
  adapter_id: string;
  adapter_name: string;
  imp_id: string;
  bid_price: number;
  bid_currency: string;
  creative_id: string;
  advertiser_domain: string;
  won: 0 | 1;
  clearing_price: number;
  second_price: number;
  auction_duration_ms: number;
  total_bids: number;
}

export class BidLandscapeService {
  private warnedNoClient = false;

  private getClient() {
    try {
      return getClickHouseClient();
    } catch (error) {
      if (!this.warnedNoClient) {
        logger.warn('BidLandscapeService: ClickHouse client not available; bid landscape logging disabled', { error });
        this.warnedNoClient = true;
      }
      return null;
    }
  }

  /**
   * Log complete auction results including all bids received
   * Provides transparency into bid pricing and adapter performance
   */
  async logAuction(
    request: OpenRTBBidRequest,
    result: AuctionResult
  ): Promise<void> {
    const ch = this.getClient();
    if (!ch) {
      return;
    }

    try {
      // Extract IDs from request
      const publisherId = request.site?.publisher?.id || request.app?.publisher?.id || 'unknown';
      const appId = request.app?.id || request.site?.id || 'unknown';
      const placementId = request.imp[0]?.tagid || 'unknown';

      // Calculate clearing price (what winner pays in second-price auction)
      let clearingPrice = 0;
      let secondPrice = 0;
      let winningBidPrice = 0;

      if (result.success && result.response?.seatbid?.[0]?.bid?.[0]) {
        const winningBid = result.response.seatbid[0].bid[0];
        winningBidPrice = winningBid.price;

        // In second-price auction: winner pays (second highest + $0.01)
        if (result.allBids.length > 1) {
          const sortedBids = [...result.allBids].sort((a, b) => b.bid.price - a.bid.price);
          secondPrice = sortedBids[1].bid.price;
          clearingPrice = secondPrice + 0.01;
        } else {
          // Only one bid: clearing price = bid floor or bid price
          const bidFloor = request.imp[0]?.bidfloor || 0.01;
          clearingPrice = Math.max(bidFloor, winningBidPrice);
          secondPrice = clearingPrice;
        }
      }

      // Create entries for all bids received
      const entries: BidLandscapeEntry[] = result.allBids.map((bidData) => {
        const isWinner = result.success && 
                        result.response?.seatbid?.[0]?.bid?.[0]?.id === bidData.bid.id;

        // Get currency from impression bid floor currency or default to USD
        const currency = request.imp[0]?.bidfloorcur || 'USD';

        return {
          auction_id: request.id,
          request_id: request.id,
          timestamp: new Date().toISOString(),
          publisher_id: publisherId,
          app_id: appId,
          placement_id: placementId,
          adapter_id: bidData.adapter.id,
          adapter_name: bidData.adapter.name,
          imp_id: bidData.bid.impid,
          bid_price: bidData.bid.price,
          bid_currency: currency,
          creative_id: bidData.bid.crid || bidData.bid.cid || '',
          advertiser_domain: bidData.bid.adomain?.[0] || '',
          won: isWinner ? 1 : 0,
          clearing_price: isWinner ? clearingPrice : 0,
          second_price: isWinner ? secondPrice : 0,
          auction_duration_ms: result.metrics.auctionDuration,
          total_bids: result.metrics.totalBids,
        };
      });

      if (entries.length === 0) {
        // Log no-bid auctions as well
        const currency = request.imp[0]?.bidfloorcur || 'USD';
        
        entries.push({
          auction_id: request.id,
          request_id: request.id,
          timestamp: new Date().toISOString(),
          publisher_id: publisherId,
          app_id: appId,
          placement_id: placementId,
          adapter_id: 'none',
          adapter_name: 'no_bid',
          imp_id: request.imp[0]?.id || 'unknown',
          bid_price: 0,
          bid_currency: currency,
          creative_id: '',
          advertiser_domain: '',
          won: 0,
          clearing_price: 0,
          second_price: 0,
          auction_duration_ms: result.metrics.auctionDuration,
          total_bids: 0,
        });
      }

      // Batch insert all bids
      await ch.insert({
        table: 'bid_landscape',
        values: entries,
        format: 'JSONEachRow',
      });

      logger.debug('Bid landscape logged', {
        auction_id: request.id,
        total_bids: entries.length,
        winner: entries.find(e => e.won === 1)?.adapter_name || 'none',
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
    const ch = this.getClient();
    if (!ch) {
      throw new Error('BidLandscapeService not available');
    }

    const query = `
      SELECT
        adapter_name,
        count() as total_bids,
        sum(won) as wins,
        round(sum(won) * 100.0 / count(), 2) as win_rate_pct,
        round(avg(bid_price), 4) as avg_bid_price,
        round(avg(IF(won = 1, clearing_price, 0)), 4) as avg_clearing_price,
        round(quantile(0.5)(bid_price), 4) as median_bid_price,
        round(quantile(0.9)(bid_price), 4) as p90_bid_price,
        round(quantile(0.99)(bid_price), 4) as p99_bid_price
      FROM bid_landscape
      WHERE publisher_id = {publisherId:String}
        AND timestamp >= {startDate:DateTime}
        AND timestamp < {endDate:DateTime}
        AND adapter_id != 'none'
      GROUP BY adapter_name
      ORDER BY total_bids DESC
    `;

    const resultSet = await ch.query({
      query,
      query_params: {
        publisherId,
        startDate: startDate.toISOString().slice(0, 19).replace('T', ' '),
        endDate: endDate.toISOString().slice(0, 19).replace('T', ' '),
      },
      format: 'JSONEachRow',
    });

    const json = await resultSet.json();
    return json as Array<Record<string, unknown>>;
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
    const ch = this.getClient();
    if (!ch) {
      throw new Error('BidLandscapeService not available');
    }

    const query = `
      SELECT
        toStartOfInterval(timestamp, INTERVAL {interval:UInt32} MINUTE) as time_bucket,
        count(DISTINCT auction_id) as total_auctions,
        sum(IF(total_bids > 0, 1, 0)) as auctions_with_bids,
        sum(IF(won = 1, 1, 0)) as won_auctions,
        round(avg(total_bids), 2) as avg_bids_per_auction,
        round(avg(IF(won = 1, clearing_price, 0)), 4) as avg_clearing_price,
        round(avg(auction_duration_ms), 2) as avg_auction_duration_ms
      FROM bid_landscape
      WHERE publisher_id = {publisherId:String}
        AND timestamp >= {startDate:DateTime}
        AND timestamp < {endDate:DateTime}
      GROUP BY time_bucket
      ORDER BY time_bucket
    `;

    const resultSet = await ch.query({
      query,
      query_params: {
        publisherId,
        startDate: startDate.toISOString().slice(0, 19).replace('T', ' '),
        endDate: endDate.toISOString().slice(0, 19).replace('T', ' '),
        interval: intervalMinutes,
      },
      format: 'JSONEachRow',
    });

    const json = await resultSet.json();
    return json as Array<Record<string, unknown>>;
  }

  /**
   * Check service health
   */
  isEnabled(): boolean {
    return this.getClient() !== null;
  }

  /**
   * Close ClickHouse connection (no-op; lifecycle managed elsewhere)
   */
  async close(): Promise<void> {
    // Intentionally no-op. Connection lifecycle is managed by utils/clickhouse.
  }
}

// Singleton instance
export const bidLandscapeService = new BidLandscapeService();
