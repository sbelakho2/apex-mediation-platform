/**
 * Verification & Revenue Auditor (VRA) Service
 * 
 * Provides cryptographic transparency for ad impressions through:
 * 1. Per-impression signed entries with hash chain
 * 2. Publisher-verifiable proofs for reconciliation
 * 3. Tamper-evident ledger for revenue audit trails
 * 
 * This enables publishers to reconcile net revenue with their network dashboards
 * using cryptographic proofs that cannot be manipulated.
 */

import crypto from 'crypto';
import { Pool } from 'pg';
import pool from '../utils/postgres';
import redis from '../utils/redis';
import logger from '../utils/logger';

// Types for VRA entries

export interface ImpressionEntry {
  impressionId: string;
  requestId: string;
  placementId: string;
  publisherId: string;
  networkId: string;
  adUnitId?: string;
  
  // Revenue details
  grossRevenueMicros: number;
  netRevenueMicros: number;
  currency: string;
  
  // Timing
  timestamp: Date;
  
  // Context
  country?: string;
  deviceType?: string;
  adFormat?: string;
  
  // Fraud signals
  fraudScore?: number;
  ivtFlag?: boolean;
}

export interface SignedLedgerEntry {
  entryId: string;
  impressionId: string;
  publisherId: string;
  
  // Hash chain
  previousHash: string;
  entryHash: string;
  signature: string;
  
  // Entry details
  data: ImpressionEntry;
  
  // Metadata
  sequenceNumber: number;
  timestamp: Date;
  version: number;
}

export interface PublisherProof {
  publisherId: string;
  periodStart: Date;
  periodEnd: Date;
  
  // Aggregates
  totalImpressions: number;
  totalGrossRevenueMicros: number;
  totalNetRevenueMicros: number;
  
  // Hash chain verification
  firstEntryHash: string;
  lastEntryHash: string;
  entryCount: number;
  
  // Proof signature
  proofHash: string;
  signature: string;
  
  // Breakdown
  byNetwork: Array<{
    networkId: string;
    impressions: number;
    netRevenueMicros: number;
  }>;
}

export interface ReconciliationResult {
  publisherId: string;
  periodStart: Date;
  periodEnd: Date;
  
  // Match status
  matched: boolean;
  variancePercent: number;
  varianceAmount: number;
  
  // Details
  ourTotal: number;
  networkTotal: number;
  
  // Discrepancies
  discrepancies: Array<{
    type: 'underpay' | 'overpay' | 'missing' | 'extra';
    networkId: string;
    ourAmount: number;
    theirAmount: number;
    difference: number;
  }>;
}

// Database row types for type safety
interface ProofQueryRow {
  total_impressions: string;
  total_gross: string;
  total_net: string;
  first_hash: string;
  last_hash: string;
  network_id: string | null;
  network_impressions: string;
  network_revenue: string;
}

interface LedgerEntryRow {
  entry_id: string;
  impression_id: string;
  publisher_id: string;
  network_id: string;
  previous_hash: string;
  entry_hash: string;
  signature: string;
  gross_revenue_micros: string;
  net_revenue_micros: string;
  currency: string;
  sequence_number: number;
  entry_data: string;
  created_at: Date;
}

// VRA Configuration
const VRA_CONFIG = {
  // Signing key (in production, use HSM or KMS)
  SIGNING_KEY: process.env.VRA_SIGNING_KEY || 'vra-default-signing-key-do-not-use-in-prod',
  
  // Hash algorithm
  HASH_ALGORITHM: 'sha256',
  
  // Signature algorithm
  SIGNATURE_ALGORITHM: 'sha256',
  
  // Batch size for bulk operations
  BATCH_SIZE: 1000,
  
  // Cache TTL for publisher proofs
  PROOF_CACHE_TTL: 3600, // 1 hour
  
  // Maximum variance before flagging reconciliation issue
  MAX_VARIANCE_PERCENT: 5.0,
};

/**
 * Compute SHA-256 hash of data
 */
function computeHash(data: string): string {
  return crypto
    .createHash(VRA_CONFIG.HASH_ALGORITHM)
    .update(data)
    .digest('hex');
}

/**
 * Sign data using HMAC-SHA256
 */
function signData(data: string): string {
  return crypto
    .createHmac(VRA_CONFIG.SIGNATURE_ALGORITHM, VRA_CONFIG.SIGNING_KEY)
    .update(data)
    .digest('hex');
}

/**
 * Verify signature
 */
function verifySignature(data: string, signature: string): boolean {
  const expectedSignature = signData(data);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

/**
 * Get the last entry hash for a publisher (hash chain continuation)
 */
async function getLastEntryHash(pool: Pool, publisherId: string): Promise<{ hash: string; sequence: number }> {
  const result = await pool.query(
    `SELECT entry_hash, sequence_number 
     FROM vra_ledger 
     WHERE publisher_id = $1 
     ORDER BY sequence_number DESC 
     LIMIT 1`,
    [publisherId]
  );
  
  if (result.rows.length === 0) {
    // Genesis entry - use publisher ID as seed
    return { hash: computeHash(`genesis:${publisherId}`), sequence: 0 };
  }
  
  return {
    hash: result.rows[0].entry_hash,
    sequence: result.rows[0].sequence_number,
  };
}

/**
 * Create a signed ledger entry for an impression
 */
export async function createLedgerEntry(impression: ImpressionEntry): Promise<SignedLedgerEntry> {
  // pool imported at top of file
  
  // Get previous hash for chain continuity
  const { hash: previousHash, sequence } = await getLastEntryHash(pool, impression.publisherId);
  
  // Create entry ID
  const entryId = crypto.randomUUID();
  const sequenceNumber = sequence + 1;
  const timestamp = new Date();
  
  // Compute entry hash (includes previous hash for chain)
  const entryData = JSON.stringify({
    entryId,
    previousHash,
    sequenceNumber,
    impressionId: impression.impressionId,
    publisherId: impression.publisherId,
    networkId: impression.networkId,
    grossRevenueMicros: impression.grossRevenueMicros,
    netRevenueMicros: impression.netRevenueMicros,
    currency: impression.currency,
    timestamp: impression.timestamp.toISOString(),
  });
  
  const entryHash = computeHash(entryData);
  const signature = signData(entryHash);
  
  const signedEntry: SignedLedgerEntry = {
    entryId,
    impressionId: impression.impressionId,
    publisherId: impression.publisherId,
    previousHash,
    entryHash,
    signature,
    data: impression,
    sequenceNumber,
    timestamp,
    version: 1,
  };
  
  // Store in database
  await pool.query(
    `INSERT INTO vra_ledger (
      entry_id, impression_id, publisher_id, network_id,
      previous_hash, entry_hash, signature,
      gross_revenue_micros, net_revenue_micros, currency,
      sequence_number, entry_data, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      entryId,
      impression.impressionId,
      impression.publisherId,
      impression.networkId,
      previousHash,
      entryHash,
      signature,
      impression.grossRevenueMicros,
      impression.netRevenueMicros,
      impression.currency,
      sequenceNumber,
      JSON.stringify(impression),
      timestamp,
    ]
  );
  
  logger.debug('VRA ledger entry created', {
    entryId,
    impressionId: impression.impressionId,
    publisherId: impression.publisherId,
    sequenceNumber,
  });
  
  return signedEntry;
}

/**
 * Create ledger entries in batch (more efficient for high volume)
 */
export async function createLedgerEntriesBatch(impressions: ImpressionEntry[]): Promise<number> {
  if (impressions.length === 0) return 0;
  
  // pool imported at top of file
  let created = 0;
  
  // Group by publisher to maintain hash chain per publisher
  const byPublisher = new Map<string, ImpressionEntry[]>();
  for (const impression of impressions) {
    const existing = byPublisher.get(impression.publisherId) || [];
    existing.push(impression);
    byPublisher.set(impression.publisherId, existing);
  }
  
  for (const [publisherId, publisherImpressions] of byPublisher) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get starting hash for this publisher
      let { hash: previousHash, sequence } = await getLastEntryHash(pool, publisherId);
      
      for (const impression of publisherImpressions) {
        const entryId = crypto.randomUUID();
        const sequenceNumber = ++sequence;
        const timestamp = new Date();
        
        const entryData = JSON.stringify({
          entryId,
          previousHash,
          sequenceNumber,
          impressionId: impression.impressionId,
          publisherId: impression.publisherId,
          networkId: impression.networkId,
          grossRevenueMicros: impression.grossRevenueMicros,
          netRevenueMicros: impression.netRevenueMicros,
          currency: impression.currency,
          timestamp: impression.timestamp.toISOString(),
        });
        
        const entryHash = computeHash(entryData);
        const signature = signData(entryHash);
        
        await client.query(
          `INSERT INTO vra_ledger (
            entry_id, impression_id, publisher_id, network_id,
            previous_hash, entry_hash, signature,
            gross_revenue_micros, net_revenue_micros, currency,
            sequence_number, entry_data, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            entryId,
            impression.impressionId,
            impression.publisherId,
            impression.networkId,
            previousHash,
            entryHash,
            signature,
            impression.grossRevenueMicros,
            impression.netRevenueMicros,
            impression.currency,
            sequenceNumber,
            JSON.stringify(impression),
            timestamp,
          ]
        );
        
        // Update previous hash for next entry
        previousHash = entryHash;
        created++;
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  logger.info('VRA batch ledger entries created', { count: created });
  return created;
}

/**
 * Verify the integrity of the hash chain for a publisher
 */
export async function verifyHashChain(
  publisherId: string,
  startSequence?: number,
  endSequence?: number
): Promise<{ valid: boolean; brokenAt?: number; error?: string }> {
  // pool imported at top of file
  
  const query = `
    SELECT entry_id, previous_hash, entry_hash, signature, sequence_number,
           impression_id, network_id, gross_revenue_micros, net_revenue_micros, 
           currency, created_at
    FROM vra_ledger
    WHERE publisher_id = $1
      ${startSequence !== undefined ? 'AND sequence_number >= $2' : ''}
      ${endSequence !== undefined ? `AND sequence_number <= $${startSequence !== undefined ? 3 : 2}` : ''}
    ORDER BY sequence_number ASC
  `;
  
  const params: (string | number)[] = [publisherId];
  if (startSequence !== undefined) params.push(startSequence);
  if (endSequence !== undefined) params.push(endSequence);
  
  const result = await pool.query(query, params);
  
  if (result.rows.length === 0) {
    return { valid: true }; // No entries to verify
  }
  
  let expectedPreviousHash = result.rows[0].sequence_number === 1
    ? computeHash(`genesis:${publisherId}`)
    : null;
  
  for (const row of result.rows) {
    // Verify previous hash link (skip first if we're starting mid-chain)
    if (expectedPreviousHash !== null && row.previous_hash !== expectedPreviousHash) {
      return {
        valid: false,
        brokenAt: row.sequence_number,
        error: `Previous hash mismatch at sequence ${row.sequence_number}`,
      };
    }
    
    // Verify signature
    if (!verifySignature(row.entry_hash, row.signature)) {
      return {
        valid: false,
        brokenAt: row.sequence_number,
        error: `Invalid signature at sequence ${row.sequence_number}`,
      };
    }
    
    // Set expected previous hash for next iteration
    expectedPreviousHash = row.entry_hash;
  }
  
  return { valid: true };
}

/**
 * Generate a publisher proof for a time period
 */
export async function generatePublisherProof(
  publisherId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<PublisherProof> {
  // pool imported at top of file
  
  // Check cache first
  const cacheKey = `vra:proof:${publisherId}:${periodStart.toISOString()}:${periodEnd.toISOString()}`;
  try {
    const cached = await redis.get<string>(cacheKey);
    if (cached && typeof cached === 'string') {
      return JSON.parse(cached);
    }
  } catch {
    // Cache miss, continue
  }
  
  // Query ledger entries for the period
  const result = await pool.query<ProofQueryRow>(
    `SELECT 
      COUNT(*) as total_impressions,
      SUM(gross_revenue_micros) as total_gross,
      SUM(net_revenue_micros) as total_net,
      MIN(entry_hash) as first_hash,
      MAX(entry_hash) as last_hash,
      network_id,
      COUNT(*) as network_impressions,
      SUM(net_revenue_micros) as network_revenue
    FROM vra_ledger
    WHERE publisher_id = $1
      AND created_at >= $2
      AND created_at < $3
    GROUP BY GROUPING SETS ((), (network_id))
    ORDER BY network_id NULLS FIRST`,
    [publisherId, periodStart, periodEnd]
  );
  
  if (result.rows.length === 0) {
    throw new Error('No entries found for the specified period');
  }
  
  // First row is the total (network_id is null due to GROUPING SETS)
  const totals = result.rows[0];
  const byNetwork = result.rows.slice(1)
    .filter(row => row.network_id !== null)
    .map(row => ({
      networkId: row.network_id as string,
      impressions: parseInt(row.network_impressions, 10),
      netRevenueMicros: parseInt(row.network_revenue, 10),
    }));
  
  // Compute proof hash
  const proofData = JSON.stringify({
    publisherId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalImpressions: parseInt(totals.total_impressions, 10),
    totalGrossRevenueMicros: parseInt(totals.total_gross, 10),
    totalNetRevenueMicros: parseInt(totals.total_net, 10),
    firstEntryHash: totals.first_hash,
    lastEntryHash: totals.last_hash,
  });
  
  const proofHash = computeHash(proofData);
  const signature = signData(proofHash);
  
  const proof: PublisherProof = {
    publisherId,
    periodStart,
    periodEnd,
    totalImpressions: parseInt(totals.total_impressions, 10),
    totalGrossRevenueMicros: parseInt(totals.total_gross, 10),
    totalNetRevenueMicros: parseInt(totals.total_net, 10),
    firstEntryHash: totals.first_hash,
    lastEntryHash: totals.last_hash,
    entryCount: parseInt(totals.total_impressions, 10),
    proofHash,
    signature,
    byNetwork,
  };
  
  // Cache the proof
  try {
    await redis.setEx(cacheKey, VRA_CONFIG.PROOF_CACHE_TTL, JSON.stringify(proof));
  } catch {
    // Cache write failed, continue
  }
  
  logger.info('VRA publisher proof generated', {
    publisherId,
    periodStart,
    periodEnd,
    entryCount: proof.entryCount,
  });
  
  return proof;
}

/**
 * Verify a publisher proof
 */
export function verifyPublisherProof(proof: PublisherProof): boolean {
  const proofData = JSON.stringify({
    publisherId: proof.publisherId,
    periodStart: proof.periodStart.toISOString ? proof.periodStart.toISOString() : proof.periodStart,
    periodEnd: proof.periodEnd.toISOString ? proof.periodEnd.toISOString() : proof.periodEnd,
    totalImpressions: proof.totalImpressions,
    totalGrossRevenueMicros: proof.totalGrossRevenueMicros,
    totalNetRevenueMicros: proof.totalNetRevenueMicros,
    firstEntryHash: proof.firstEntryHash,
    lastEntryHash: proof.lastEntryHash,
  });
  
  const expectedHash = computeHash(proofData);
  
  if (expectedHash !== proof.proofHash) {
    return false;
  }
  
  return verifySignature(proof.proofHash, proof.signature);
}

/**
 * Reconcile our ledger with network-reported data
 */
export async function reconcileWithNetwork(
  publisherId: string,
  periodStart: Date,
  periodEnd: Date,
  networkData: Array<{
    networkId: string;
    reportedRevenueMicros: number;
    reportedImpressions: number;
  }>
): Promise<ReconciliationResult> {
  const proof = await generatePublisherProof(publisherId, periodStart, periodEnd);
  
  const discrepancies: ReconciliationResult['discrepancies'] = [];
  let networkTotalMicros = 0;
  
  for (const networkReport of networkData) {
    networkTotalMicros += networkReport.reportedRevenueMicros;
    
    const ourNetwork = proof.byNetwork.find(n => n.networkId === networkReport.networkId);
    const ourRevenue = ourNetwork?.netRevenueMicros || 0;
    const difference = ourRevenue - networkReport.reportedRevenueMicros;
    
    if (Math.abs(difference) > 100) { // More than $0.0001 difference
      discrepancies.push({
        type: difference > 0 ? 'overpay' : 'underpay',
        networkId: networkReport.networkId,
        ourAmount: ourRevenue,
        theirAmount: networkReport.reportedRevenueMicros,
        difference,
      });
    }
  }
  
  // Check for networks we have that they didn't report
  for (const ourNetwork of proof.byNetwork) {
    const theirNetwork = networkData.find(n => n.networkId === ourNetwork.networkId);
    if (!theirNetwork) {
      discrepancies.push({
        type: 'extra',
        networkId: ourNetwork.networkId,
        ourAmount: ourNetwork.netRevenueMicros,
        theirAmount: 0,
        difference: ourNetwork.netRevenueMicros,
      });
    }
  }
  
  const varianceAmount = proof.totalNetRevenueMicros - networkTotalMicros;
  const variancePercent = networkTotalMicros > 0
    ? (varianceAmount / networkTotalMicros) * 100
    : 0;
  
  const matched = Math.abs(variancePercent) <= VRA_CONFIG.MAX_VARIANCE_PERCENT;
  
  const result: ReconciliationResult = {
    publisherId,
    periodStart,
    periodEnd,
    matched,
    variancePercent,
    varianceAmount,
    ourTotal: proof.totalNetRevenueMicros,
    networkTotal: networkTotalMicros,
    discrepancies,
  };
  
  logger.info('VRA reconciliation completed', {
    publisherId,
    matched,
    variancePercent: variancePercent.toFixed(2),
    discrepancyCount: discrepancies.length,
  });
  
  return result;
}

/**
 * Export ledger entries for publisher download
 */
export async function exportLedgerEntries(
  publisherId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<SignedLedgerEntry[]> {
  // pool imported at top of file
  
  const result = await pool.query<LedgerEntryRow>(
    `SELECT 
      entry_id, impression_id, publisher_id, network_id,
      previous_hash, entry_hash, signature,
      gross_revenue_micros, net_revenue_micros, currency,
      sequence_number, entry_data, created_at
    FROM vra_ledger
    WHERE publisher_id = $1
      AND created_at >= $2
      AND created_at < $3
    ORDER BY sequence_number ASC`,
    [publisherId, periodStart, periodEnd]
  );
  
  return result.rows.map(row => ({
    entryId: row.entry_id,
    impressionId: row.impression_id,
    publisherId: row.publisher_id,
    previousHash: row.previous_hash,
    entryHash: row.entry_hash,
    signature: row.signature,
    data: JSON.parse(row.entry_data),
    sequenceNumber: row.sequence_number,
    timestamp: row.created_at,
    version: 1,
  }));
}

export const vraService = {
  createLedgerEntry,
  createLedgerEntriesBatch,
  verifyHashChain,
  generatePublisherProof,
  verifyPublisherProof,
  reconcileWithNetwork,
  exportLedgerEntries,
};
