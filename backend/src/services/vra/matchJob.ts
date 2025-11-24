import crypto from 'node:crypto';
import logger from '../../utils/logger';
import { executeQuery, insertBatch } from '../../utils/clickhouse';
import { ExpectedRowLite, StatementRowLite, matchStatementsToExpected, MatchingOptions } from './matchingEngine';
import { vraMatchReviewPersistedTotal } from '../../utils/prometheus';

type CHStatementRow = {
  event_date: string;
  app_id: string;
  ad_unit_id: string;
  country: string;
  format: string;
  paid?: string; // Decimal string
  currency?: string;
  report_id?: string;
  network?: string;
};

type CHExpectedRow = {
  request_id: string;
  ts: string;
  expected_value: string; // Decimal string
};

export interface MatchBatchParams {
  from: string; // ISO
  to: string;   // ISO
  limitStatements?: number; // default 100k
  limitExpected?: number;   // default 100k
  dryRun?: boolean;
  options?: MatchingOptions;
  persistReview?: boolean; // when true, persist review-band matches into recon_match_review
}

function makeStatementId(r: CHStatementRow): string {
  const base = [
    r.event_date,
    r.app_id,
    r.ad_unit_id,
    r.country,
    r.format,
    r.currency || '',
    r.report_id || '',
    r.network || '',
  ].join('|');
  return crypto.createHash('sha256').update(base).digest('hex');
}

export async function runMatchingBatch(params: MatchBatchParams): Promise<{ auto: number; review: number; unmatched: number; inserted: number; reviewPersisted: number }> {
  const from = params.from;
  const to = params.to;
  const limitStatements = Math.min(Math.max(params.limitStatements ?? 100_000, 1), 1_000_000);
  const limitExpected = Math.min(Math.max(params.limitExpected ?? 100_000, 1), 1_000_000);
  const dryRun = params.dryRun === true;
  const matchOpts: MatchingOptions = {
    // Favor time in absence of amount/unit hints in this scaffold; keep auto threshold high
    wTime: 1.0,
    wAmount: 0.0,
    wUnit: 0.0,
    autoAcceptThreshold: 0.95,
    reviewMinThreshold: 0.3,
    ...(params.options || {}),
  };

  // Fetch statements (day-granular) and expected (timestamped) in the window
  const stmtRows = await executeQuery<CHStatementRow>(
    `
      SELECT 
        toString(event_date) AS event_date, app_id, ad_unit_id, country, toString(format) AS format,
        toString(paid) AS paid, currency, report_id, network
      FROM recon_statements_norm
      WHERE event_date >= toDate(parseDateTimeBestEffortOrZero({from:String}))
        AND event_date <  toDate(parseDateTimeBestEffortOrZero({to:String}))
      LIMIT {lim:UInt32}
    `,
    { from, to, lim: limitStatements }
  );

  const expRows = await executeQuery<CHExpectedRow>(
    `
      SELECT request_id, toString(ts) AS ts, toString(expected_value) AS expected_value
      FROM recon_expected
      WHERE ts >= parseDateTimeBestEffortOrZero({from:String})
        AND ts <  parseDateTimeBestEffortOrZero({to:String})
      LIMIT {lim:UInt32}
    `,
    { from, to, lim: limitExpected }
  );

  if (stmtRows.length === 0 || expRows.length === 0) {
    return { auto: 0, review: 0, unmatched: stmtRows.length, inserted: 0 };
  }

  const stmts: StatementRowLite[] = stmtRows.map((r) => ({
    statementId: makeStatementId(r),
    eventDate: r.event_date,
    appId: r.app_id,
    adUnitId: r.ad_unit_id,
    country: r.country,
    format: r.format,
    // paidUsd: undefined in scaffold; could integrate FX normalization later
  }));

  const exps: ExpectedRowLite[] = expRows.map((r) => ({
    requestId: r.request_id,
    ts: r.ts,
    expectedUsd: Number(r.expected_value) || 0,
  }));

  const { auto, review, unmatched } = matchStatementsToExpected(stmts, exps, matchOpts);

  // Persist only auto-accepted matches for now
  let inserted = 0;
  let reviewPersisted = 0;
  if (!dryRun && auto.length > 0) {
    try {
      await insertBatch(
        'recon_match',
        auto.map((m) => ({
          statement_id: m.statementId,
          request_id: m.requestId,
          link_confidence: Number(m.confidence.toFixed(2)),
          keys_used: m.keysUsed,
        }))
      );
      inserted = auto.length;
    } catch (e) {
      logger.warn('VRA MatchingBatch: failed to insert recon_match', { error: (e as Error)?.message, rows: auto.length });
      inserted = 0;
    }
  }

  // Optionally persist review-band matches for analyst review
  if (!dryRun && params.persistReview && review.length > 0) {
    try {
      await insertBatch(
        'recon_match_review',
        review.map((m) => ({
          statement_id: m.statementId,
          request_id: m.requestId,
          link_confidence: Number(m.confidence.toFixed(2)),
          keys_used: m.keysUsed,
          reasons: JSON.stringify(m.reasons || {}),
        }))
      );
      reviewPersisted = review.length;
      try { vraMatchReviewPersistedTotal.inc(review.length); } catch {}
    } catch (e) {
      logger.warn('VRA MatchingBatch: failed to insert recon_match_review', { error: (e as Error)?.message, rows: review.length });
      reviewPersisted = 0;
    }
  }

  return { auto: auto.length, review: review.length, unmatched: unmatched.length, inserted, reviewPersisted };
}

export default { runMatchingBatch };
