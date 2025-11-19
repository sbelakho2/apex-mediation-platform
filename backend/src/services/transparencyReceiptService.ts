import { Pool } from 'pg';
import logger from '../utils/logger';
import * as crypto from 'crypto';

export interface AuctionDecisionReceipt {
  receiptId: string;
  reqId: string;
  timestamp: Date;
  placementId: string;
  floorCpm: number;
  currency: string;
  bids: BidEntry[];
  winner: WinnerEntry | null;
  prevHash: string | null;
  hash: string;
  signature: string;
}

export interface BidEntry {
  network: string;
  bidCpm: number;
  currency: string;
  latencyMs: number;
  status: 'win' | 'lose' | 'timeout' | 'error';
}

export interface WinnerEntry {
  network: string;
  bidCpm: number;
  currency: string;
  normalizedCpm: number;
  creativeUrl?: string;
}

export interface VerificationResult {
  isValid: boolean;
  errors: string[];
  receiptId: string;
  hashValid: boolean;
  signatureValid: boolean;
  chainValid: boolean;
}

/**
 * Transparency Receipt Service
 * 
 * Implements cryptographically signed, append-only receipts for every auction decision.
 * This is a core BYO differentiator that provides tamper-proof transparency to publishers.
 * 
 * Features:
 * - Signed receipts with Ed25519 signatures
 * - Hash chain linking all receipts (prev_hash -> hash)
 * - Immutable append-only storage
 * - Publisher-verifiable transparency
 * 
 * Receipt Structure:
 * - req_id: Unique auction request identifier
 * - timestamp: When auction occurred
 * - placement_id: Which placement (bound to publisher's ad unit)
 * - floor_cpm: Publisher's floor price
 * - bids: All network responses (network, bid, latency, status)
 * - winner: Winning bid details with normalized CPM
 * - prev_hash: SHA-256 of previous receipt (chain integrity)
 * - hash: SHA-256 of this receipt's canonical data
 * - signature: Ed25519 signature over hash (verifiable with public key)
 */
export class TransparencyReceiptService {
  private signingKeyId: string;
  private privateKey: crypto.KeyObject | null = null;
  private publicKey: crypto.KeyObject | null = null;

  constructor(
    private pool: Pool,
    signingKeyId: string = 'default'
  ) {
    this.signingKeyId = signingKeyId;
  }

  /**
   * Initialize service with Ed25519 key pair
   */
  async initialize(): Promise<void> {
    const keyPair = await this.loadKeyPair(this.signingKeyId);
    this.privateKey = keyPair.privateKey;
    this.publicKey = keyPair.publicKey;
    logger.info('Transparency receipt service initialized', { signingKeyId: this.signingKeyId });
  }

  /**
   * Create and store a signed receipt for an auction decision
   */
  async createReceipt(params: {
    reqId: string;
    placementId: string;
    floorCpm: number;
    currency: string;
    bids: BidEntry[];
    winner: WinnerEntry | null;
  }): Promise<AuctionDecisionReceipt> {
    if (!this.privateKey) {
      throw new Error('Service not initialized - call initialize() first');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get previous receipt hash for chain
      const prevHashResult = await client.query(
        `SELECT hash FROM transparency_receipts
         WHERE placement_id = $1
         ORDER BY timestamp DESC
         LIMIT 1`,
        [params.placementId]
      );

      const prevHash = prevHashResult.rows.length > 0 ? prevHashResult.rows[0].hash : null;
      const timestamp = new Date();

      // Compute hash of canonical receipt data
      const canonicalData = this.getCanonicalData({
        reqId: params.reqId,
        timestamp,
        placementId: params.placementId,
        floorCpm: params.floorCpm,
        currency: params.currency,
        bids: params.bids,
        winner: params.winner,
        prevHash,
      });

      const hash = crypto.createHash('sha256').update(canonicalData).digest('hex');

      // Sign the hash with Ed25519
      const signature = crypto.sign(null, Buffer.from(hash, 'hex'), this.privateKey).toString('hex');

      // Store receipt
      const result = await client.query(
        `INSERT INTO transparency_receipts (
          id, req_id, timestamp, placement_id, floor_cpm, currency,
          bids, winner, prev_hash, hash, signature, signing_key_id, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
        ) RETURNING id`,
        [
          params.reqId,
          timestamp,
          params.placementId,
          params.floorCpm,
          params.currency,
          JSON.stringify(params.bids),
          params.winner ? JSON.stringify(params.winner) : null,
          prevHash,
          hash,
          signature,
          this.signingKeyId,
        ]
      );

      await client.query('COMMIT');

      const receiptId = result.rows[0].id;

      logger.info('Created transparency receipt', {
        receiptId,
        reqId: params.reqId,
        placementId: params.placementId,
        bidCount: params.bids.length,
        hasWinner: !!params.winner,
      });

      return {
        receiptId,
        reqId: params.reqId,
        timestamp,
        placementId: params.placementId,
        floorCpm: params.floorCpm,
        currency: params.currency,
        bids: params.bids,
        winner: params.winner,
        prevHash,
        hash,
        signature,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create transparency receipt', { error, params });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieve a receipt by ID
   */
  async getReceipt(receiptId: string): Promise<AuctionDecisionReceipt | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          id, req_id, timestamp, placement_id, floor_cpm, currency,
          bids, winner, prev_hash, hash, signature
         FROM transparency_receipts
         WHERE id = $1`,
        [receiptId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        receiptId: row.id,
        reqId: row.req_id,
        timestamp: row.timestamp,
        placementId: row.placement_id,
        floorCpm: parseFloat(row.floor_cpm),
        currency: row.currency,
        bids: JSON.parse(row.bids),
        winner: row.winner ? JSON.parse(row.winner) : null,
        prevHash: row.prev_hash,
        hash: row.hash,
        signature: row.signature,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get receipts for a placement (with pagination)
   */
  async getReceiptsForPlacement(
    placementId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<AuctionDecisionReceipt[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          id, req_id, timestamp, placement_id, floor_cpm, currency,
          bids, winner, prev_hash, hash, signature
         FROM transparency_receipts
         WHERE placement_id = $1
         ORDER BY timestamp DESC
         LIMIT $2 OFFSET $3`,
        [placementId, limit, offset]
      );

      return result.rows.map((row) => ({
        receiptId: row.id,
        reqId: row.req_id,
        timestamp: row.timestamp,
        placementId: row.placement_id,
        floorCpm: parseFloat(row.floor_cpm),
        currency: row.currency,
        bids: JSON.parse(row.bids),
        winner: row.winner ? JSON.parse(row.winner) : null,
        prevHash: row.prev_hash,
        hash: row.hash,
        signature: row.signature,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get receipts by request ID (can have multiple if placement changed)
   */
  async getReceiptsByReqId(reqId: string): Promise<AuctionDecisionReceipt[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          id, req_id, timestamp, placement_id, floor_cpm, currency,
          bids, winner, prev_hash, hash, signature
         FROM transparency_receipts
         WHERE req_id = $1
         ORDER BY timestamp DESC`,
        [reqId]
      );

      return result.rows.map((row) => ({
        receiptId: row.id,
        reqId: row.req_id,
        timestamp: row.timestamp,
        placementId: row.placement_id,
        floorCpm: parseFloat(row.floor_cpm),
        currency: row.currency,
        bids: JSON.parse(row.bids),
        winner: row.winner ? JSON.parse(row.winner) : null,
        prevHash: row.prev_hash,
        hash: row.hash,
        signature: row.signature,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Verify a single receipt's integrity
   */
  async verifyReceipt(receiptId: string): Promise<VerificationResult> {
    const receipt = await this.getReceipt(receiptId);
    if (!receipt) {
      return {
        isValid: false,
        errors: ['Receipt not found'],
        receiptId,
        hashValid: false,
        signatureValid: false,
        chainValid: false,
      };
    }

    const errors: string[] = [];

    // Verify hash
    const canonicalData = this.getCanonicalData(receipt);
    const expectedHash = crypto.createHash('sha256').update(canonicalData).digest('hex');
    const hashValid = expectedHash === receipt.hash;
    if (!hashValid) {
      errors.push('Hash mismatch - receipt data may have been tampered with');
    }

    // Verify signature
    let signatureValid = false;
    if (this.publicKey) {
      try {
        signatureValid = crypto.verify(
          null,
          Buffer.from(receipt.hash, 'hex'),
          this.publicKey,
          Buffer.from(receipt.signature, 'hex')
        );
        if (!signatureValid) {
          errors.push('Invalid signature - receipt not signed by authorized key');
        }
      } catch (error) {
        errors.push(`Signature verification failed: ${error}`);
      }
    } else {
      errors.push('Cannot verify signature - public key not loaded');
    }

    // Verify chain linkage (if not first receipt)
    let chainValid = true;
    if (receipt.prevHash) {
      const client = await this.pool.connect();
      try {
        const prevResult = await client.query(
          `SELECT hash FROM transparency_receipts
           WHERE placement_id = $1 AND timestamp < $2
           ORDER BY timestamp DESC
           LIMIT 1`,
          [receipt.placementId, receipt.timestamp]
        );

        if (prevResult.rows.length > 0) {
          const actualPrevHash = prevResult.rows[0].hash;
          chainValid = actualPrevHash === receipt.prevHash;
          if (!chainValid) {
            errors.push('Chain broken - prev_hash does not match previous receipt');
          }
        }
      } finally {
        client.release();
      }
    }

    return {
      isValid: hashValid && signatureValid && chainValid,
      errors,
      receiptId,
      hashValid,
      signatureValid,
      chainValid,
    };
  }

  /**
   * Verify entire chain for a placement
   */
  async verifyChain(placementId: string): Promise<{
    isValid: boolean;
    totalReceipts: number;
    validReceipts: number;
    errors: Array<{ receiptId: string; errors: string[] }>;
  }> {
    const receipts = await this.getReceiptsForPlacement(placementId, 10000, 0);
    let validCount = 0;
    const allErrors: Array<{ receiptId: string; errors: string[] }> = [];

    for (const receipt of receipts.reverse()) {
      const verification = await this.verifyReceipt(receipt.receiptId);
      if (verification.isValid) {
        validCount++;
      } else {
        allErrors.push({
          receiptId: receipt.receiptId,
          errors: verification.errors,
        });
      }
    }

    return {
      isValid: validCount === receipts.length,
      totalReceipts: receipts.length,
      validReceipts: validCount,
      errors: allErrors,
    };
  }

  /**
   * Get canonical data representation for hashing
   */
  private getCanonicalData(receipt: {
    reqId: string;
    timestamp: Date;
    placementId: string;
    floorCpm: number;
    currency: string;
    bids: BidEntry[];
    winner: WinnerEntry | null;
    prevHash: string | null;
  }): string {
    // Create deterministic JSON representation
    const canonical = {
      req_id: receipt.reqId,
      timestamp: receipt.timestamp.toISOString(),
      placement_id: receipt.placementId,
      floor_cpm: receipt.floorCpm,
      currency: receipt.currency,
      bids: receipt.bids.sort((a, b) => a.network.localeCompare(b.network)),
      winner: receipt.winner,
      prev_hash: receipt.prevHash,
    };

    return JSON.stringify(canonical);
  }

  /**
   * Load Ed25519 key pair from database
   */
  private async loadKeyPair(keyId: string): Promise<{
    privateKey: crypto.KeyObject;
    publicKey: crypto.KeyObject;
  }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT private_key_pem, public_key_pem FROM ed25519_keys
         WHERE key_id = $1 AND deleted_at IS NULL`,
        [keyId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Ed25519 key pair not found: ${keyId}`);
      }

      const row = result.rows[0];
      const privateKey = crypto.createPrivateKey({
        key: row.private_key_pem,
        format: 'pem',
      });

      const publicKey = crypto.createPublicKey({
        key: row.public_key_pem,
        format: 'pem',
      });

      return { privateKey, publicKey };
    } finally {
      client.release();
    }
  }

  /**
   * Get receipt statistics for a placement
   */
  async getPlacementStatistics(placementId: string, startDate?: Date, endDate?: Date): Promise<{
    totalReceipts: number;
    totalAuctions: number;
    totalWins: number;
    winRate: number;
    averageFloorCpm: number;
    averageWinCpm: number;
    networkStats: Record<string, {
      bids: number;
      wins: number;
      timeouts: number;
      errors: number;
      avgBidCpm: number;
    }>;
  }> {
    const client = await this.pool.connect();
    try {
      const conditions = ['placement_id = $1'];
      const params: any[] = [placementId];

      if (startDate) {
        conditions.push(`timestamp >= $${params.length + 1}`);
        params.push(startDate);
      }

      if (endDate) {
        conditions.push(`timestamp <= $${params.length + 1}`);
        params.push(endDate);
      }

      const whereClause = conditions.join(' AND ');

      // Get aggregate stats
      const aggResult = await client.query(
        `SELECT 
          COUNT(*) as total_receipts,
          COUNT(DISTINCT req_id) as total_auctions,
          COUNT(winner) as total_wins,
          AVG(floor_cpm) as avg_floor_cpm,
          AVG(CASE WHEN winner IS NOT NULL 
              THEN (winner->>'bidCpm')::numeric 
              ELSE NULL END) as avg_win_cpm
         FROM transparency_receipts
         WHERE ${whereClause}`,
        params
      );

      const aggRow = aggResult.rows[0];
      const totalReceipts = parseInt(aggRow.total_receipts) || 0;
      const totalAuctions = parseInt(aggRow.total_auctions) || 0;
      const totalWins = parseInt(aggRow.total_wins) || 0;
      const winRate = totalAuctions > 0 ? totalWins / totalAuctions : 0;

      // Get per-network stats from bids JSON
      const receipts = await this.getReceiptsForPlacement(placementId, 10000, 0);
      const networkStats: Record<string, any> = {};

      for (const receipt of receipts) {
        for (const bid of receipt.bids) {
          if (!networkStats[bid.network]) {
            networkStats[bid.network] = {
              bids: 0,
              wins: 0,
              timeouts: 0,
              errors: 0,
              totalBidCpm: 0,
            };
          }

          const stats = networkStats[bid.network];
          stats.bids++;
          if (bid.status === 'win') stats.wins++;
          if (bid.status === 'timeout') stats.timeouts++;
          if (bid.status === 'error') stats.errors++;
          stats.totalBidCpm += bid.bidCpm;
        }
      }

      // Calculate averages
      for (const network in networkStats) {
        const stats = networkStats[network];
        stats.avgBidCpm = stats.bids > 0 ? stats.totalBidCpm / stats.bids : 0;
        delete stats.totalBidCpm;
      }

      return {
        totalReceipts,
        totalAuctions,
        totalWins,
        winRate,
        averageFloorCpm: parseFloat(aggRow.avg_floor_cpm) || 0,
        averageWinCpm: parseFloat(aggRow.avg_win_cpm) || 0,
        networkStats,
      };
    } finally {
      client.release();
    }
  }
}
