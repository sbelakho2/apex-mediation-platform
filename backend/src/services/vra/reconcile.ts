import logger from '../../utils/logger';
import { executeQuery, insertBatch } from '../../utils/clickhouse';
import { vraReconcileDurationSeconds, vraReconcileRowsTotal } from '../../utils/prometheus';

export interface ReconcileParams {
  from: string; // ISO
  to: string;   // ISO
  dryRun?: boolean;
}

export interface ReconcileResult {
  inserted: number;
  deltas: number; // number of delta rows computed
  amounts: {
    expectedUsd: number;
    paidUsd: number;
    unmatchedUsd: number;
    underpayUsd: number;
    timingLagUsd: number;
  };
}

const envFloat = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// Read tunables per invocation so tests and operators can adjust without restarts
function readReconTunables() {
  return {
    UNDERPAY_TOL: envFloat(process.env.VRA_UNDERPAY_TOL, 0.02), // 2%
    IVT_P95_BAND_PP: envFloat(process.env.VRA_IVT_P95_BAND_PP, 2), // +2 pp over 30d p95
    FX_BAND_PCT: envFloat(process.env.VRA_FX_BAND_PCT, 0.5), // ±0.5% band
    VIEWABILITY_GAP_PP: envFloat(process.env.VRA_VIEWABILITY_GAP_PP, 15), // > 15 pp gap
  } as const;
}

export async function reconcileWindow(params: ReconcileParams): Promise<ReconcileResult> {
  const { from, to, dryRun } = params;
  const end = vraReconcileDurationSeconds.startTimer();

  try {
    const { UNDERPAY_TOL, IVT_P95_BAND_PP, FX_BAND_PCT, VIEWABILITY_GAP_PP } = readReconTunables();
    // 1) Aggregate expected USD in window
    const expectedRows = await executeQuery<{ expected_usd: string }>(
      `SELECT toFloat64(sum(expected_value)) AS expected_usd
       FROM recon_expected
       WHERE ts >= parseDateTimeBestEffortOrZero({from:String})
         AND ts <  parseDateTimeBestEffortOrZero({to:String})`,
      { from, to }
    );
    const expectedUsd = Number(expectedRows[0]?.expected_usd || 0);

    if (expectedUsd <= 0) {
      end();
      return { inserted: 0, deltas: 0, amounts: { expectedUsd: 0, paidUsd: 0, unmatchedUsd: 0, underpayUsd: 0, timingLagUsd: 0 } };
    }

    // 2) Aggregate paid USD from revenue_events for only those request_ids referenced by recon_expected within the window
    const paidRows = await executeQuery<{ paid_usd: string }>(
      `SELECT toFloat64(sum(revenue_usd)) AS paid_usd
       FROM revenue_events
       WHERE timestamp >= parseDateTimeBestEffortOrZero({from:String})
         AND timestamp <  parseDateTimeBestEffortOrZero({to:String})
         AND request_id IN (
           SELECT request_id FROM recon_expected
           WHERE ts >= parseDateTimeBestEffortOrZero({from:String})
             AND ts <  parseDateTimeBestEffortOrZero({to:String})
         )`,
      { from, to }
    );
    const paidUsd = Number(paidRows[0]?.paid_usd || 0);

    // 3) Unmatched expected (timing lag candidate): expected rows with no paid event in the window
    const unmatchedRows = await executeQuery<{ unmatched_usd: string }>(
      `SELECT toFloat64(sum(e.expected_value)) AS unmatched_usd
       FROM recon_expected e
       WHERE e.ts >= parseDateTimeBestEffortOrZero({from:String})
         AND e.ts <  parseDateTimeBestEffortOrZero({to:String})
         AND e.request_id NOT IN (
           SELECT DISTINCT request_id FROM revenue_events
           WHERE timestamp >= parseDateTimeBestEffortOrZero({from:String})
             AND timestamp <  parseDateTimeBestEffortOrZero({to:String})
         )`,
      { from, to }
    );
    const unmatchedUsd = Number(unmatchedRows[0]?.unmatched_usd || 0);

    // 4) Classify deltas (coarse aggregate pass)
    const gap = Math.max(0, expectedUsd - paidUsd);
    const timingLagUsd = Math.max(0, Math.min(unmatchedUsd, gap));
    const residualGap = Math.max(0, gap - timingLagUsd);
    const tolAmount = expectedUsd * UNDERPAY_TOL;
    const underpayUsd = residualGap > tolAmount ? residualGap : 0;

    const rows: Array<{
      kind: string;
      amount: number;
      currency: string;
      reason_code: string;
      window_start: string;
      window_end: string;
      evidence_id: string;
      confidence: number;
    }> = [];

    const evidenceBase = `win:${from}..${to}`;
    if (timingLagUsd > 0) {
      rows.push({
        kind: 'timing_lag',
        amount: Number(timingLagUsd.toFixed(6)),
        currency: 'USD',
        reason_code: 'timing_lag_unmatched',
        window_start: from,
        window_end: to,
        evidence_id: `${evidenceBase}:lag`,
        confidence: 0.6,
      });
    }
    if (underpayUsd > 0) {
      rows.push({
        kind: 'underpay',
        amount: Number(underpayUsd.toFixed(6)),
        currency: 'USD',
        reason_code: 'agg_underpay',
        window_start: from,
        window_end: to,
        evidence_id: `${evidenceBase}:underpay`,
        confidence: 0.7,
      });
    }

    // 5) IVT outlier rule (approximation): compare current window IVT% vs 30-day p95 + band
    try {
      const band = Math.max(0, IVT_P95_BAND_PP) / 100; // convert pp -> fraction
      // Baseline p95 over the 30 days before window start
      const baselineRows = await executeQuery<{ p95: string }>(
        `SELECT quantileExact(0.95)(rate) AS p95
         FROM (
           SELECT if(sum(paid)=0, 0, sum(ifNull(ivt_adjustments,0)) / sum(paid)) AS rate
           FROM recon_statements_norm
           WHERE event_date >= toDate(parseDateTimeBestEffortOrZero({from:String}) - INTERVAL 30 DAY)
             AND event_date <  toDate(parseDateTimeBestEffortOrZero({from:String}))
           GROUP BY event_date
         )`,
        { from }
      );
      const p95 = Number(baselineRows[0]?.p95 ?? 0);

      const currentRows = await executeQuery<{ rate: string }>(
        `SELECT if(sum(paid)=0, 0, sum(ifNull(ivt_adjustments,0)) / sum(paid)) AS rate
         FROM recon_statements_norm
         WHERE event_date >= toDate(parseDateTimeBestEffortOrZero({from:String}))
           AND event_date <  toDate(parseDateTimeBestEffortOrZero({to:String}))`,
        { from, to }
      );
      const currentRate = Number(currentRows[0]?.rate ?? 0);
      if (currentRate > p95 + band) {
        rows.push({
          kind: 'ivt_outlier',
          amount: 0.0, // classification without monetary assignment
          currency: 'USD',
          reason_code: 'ivt_p95_band_exceeded',
          window_start: from,
          window_end: to,
          evidence_id: `${evidenceBase}:ivt`,
          confidence: 0.6,
        });
      }
    } catch (e) {
      // if CH query fails, skip ivt rule silently (degrade to no insight)
    }

    // 6) FX mismatch rule (approximation): compare current avg exchange_rate vs 30d median per currency
    try {
      const band = Math.max(0, FX_BAND_PCT) / 100; // convert percent -> fraction
      // Baseline median exchange rates per currency over 30 days before window start
      const fxBaseline = await executeQuery<{ cur: string; med_rate: string }>(
        `SELECT revenue_currency AS cur, quantileExact(0.5)(exchange_rate) AS med_rate
         FROM revenue_events
         WHERE timestamp >= (parseDateTimeBestEffortOrZero({from:String}) - INTERVAL 30 DAY)
           AND timestamp <  parseDateTimeBestEffortOrZero({from:String})
           AND revenue_currency != 'USD'
         GROUP BY cur`,
        { from }
      );
      const baseMap = new Map<string, number>();
      for (const r of fxBaseline) baseMap.set(r.cur, Number(r.med_rate));

      if (baseMap.size > 0) {
        const fxCurrent = await executeQuery<{ cur: string; avg_rate: string }>(
          `SELECT revenue_currency AS cur, avg(exchange_rate) AS avg_rate
           FROM revenue_events
           WHERE timestamp >= parseDateTimeBestEffortOrZero({from:String})
             AND timestamp <  parseDateTimeBestEffortOrZero({to:String})
             AND revenue_currency != 'USD'
           GROUP BY cur`,
          { from, to }
        );
        for (const r of fxCurrent) {
          const cur = r.cur;
          const base = baseMap.get(cur);
          const avg = Number(r.avg_rate);
          if (!base || base <= 0) continue;
          const dev = Math.abs(avg - base) / base;
          // Use epsilon to avoid floating drift causing equality to trigger
          const EPS = 1e-9;
          if (dev - band > EPS) {
            rows.push({
              kind: 'fx_mismatch',
              amount: 0.0,
              currency: 'USD',
              reason_code: `fx_band_exceeded_${cur}`,
              window_start: from,
              window_end: to,
              evidence_id: `${evidenceBase}:fx:${cur}`,
              confidence: 0.6,
            });
          }
        }
      }
    } catch (e) {
      // Skip FX rule on errors (degrade to no insight)
    }

    // 7) Viewability gap rule (requires viewability payloads populated in recon_expected)
    try {
      const gap = Math.max(0, VIEWABILITY_GAP_PP) / 100; // convert pp -> fraction
      const rowsView = await executeQuery<{ om: string; stmt: string }>(
        `SELECT 
           toFloat64(avgOrNull(JSONExtractFloat(viewability, 'om_viewable_pct'))) AS om,
           toFloat64(avgOrNull(JSONExtractFloat(viewability, 'statement_viewable_pct'))) AS stmt
         FROM recon_expected
         WHERE ts >= parseDateTimeBestEffortOrZero({from:String})
           AND ts <  parseDateTimeBestEffortOrZero({to:String})`,
        { from, to }
      );
      const om = Number(rowsView[0]?.om ?? NaN);
      const stmt = Number(rowsView[0]?.stmt ?? NaN);
      if (Number.isFinite(om) && Number.isFinite(stmt)) {
        // Use epsilon to avoid emitting when exactly on threshold due to float drift
        const EPS = 1e-9;
        if (Math.abs(om - stmt) - gap > EPS) {
          rows.push({
            kind: 'viewability_gap',
            amount: 0.0,
            currency: 'USD',
            reason_code: 'viewability_gap_pp',
            window_start: from,
            window_end: to,
            evidence_id: `${evidenceBase}:viewability`,
            confidence: 0.6,
          });
        }
      }
    } catch (e) {
      // Skip viewability rule on errors or missing JSON fields
    }

    // Metrics
    for (const r of rows) {
      try { vraReconcileRowsTotal.inc({ kind: r.kind }, 1); } catch {}
    }

    if (!dryRun && rows.length > 0) {
      try {
        await insertBatch('recon_deltas', rows.map((r) => ({
          kind: r.kind,
          amount: r.amount,
          currency: r.currency,
          reason_code: r.reason_code,
          window_start: r.window_start,
          window_end: r.window_end,
          evidence_id: r.evidence_id,
          confidence: r.confidence,
        })));
      } catch (e) {
        logger.warn('VRA Reconcile: failed to insert recon_deltas', { error: (e as Error)?.message, rows: rows.length });
        end();
        return { inserted: 0, deltas: rows.length, amounts: { expectedUsd, paidUsd, unmatchedUsd, underpayUsd, timingLagUsd } };
      }
    }

    end();
    return { inserted: dryRun ? 0 : rows.length, deltas: rows.length, amounts: { expectedUsd, paidUsd, unmatchedUsd, underpayUsd, timingLagUsd } };
  } catch (e) {
    end();
    logger.warn('VRA Reconcile: error during reconciliation (degrade to no-op)', { error: (e as Error)?.message });
    return { inserted: 0, deltas: 0, amounts: { expectedUsd: 0, paidUsd: 0, unmatchedUsd: 0, underpayUsd: 0, timingLagUsd: 0 } };
  }
}

export default { reconcileWindow };
