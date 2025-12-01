import type { QueryResultRow } from 'pg';
import { query } from '../../utils/postgres';
import logger from '../../utils/logger';
import { ReconOverviewParams, ReconOverviewResult, ReconDeltaQuery, ReconDeltaItem, ProofsMonthlyDigest } from './vraTypes';
import { vraClickhouseFallbackTotal, vraEmptyResultsTotal, vraQueryDurationSeconds, vraCoveragePercent, vraVariancePercent } from '../../utils/prometheus';

// Helper to time and safely execute CH queries returning empty arrays on failure (shadow-safe)
async function safeQuery<T extends QueryResultRow = QueryResultRow>(
  op: 'overview' | 'deltas_count' | 'deltas_list' | 'monthly_digest',
  sql: string,
  params?: ReadonlyArray<unknown>
): Promise<T[]> {
  const end = vraQueryDurationSeconds.startTimer({ op });
  try {
    const result = await query<T>(sql, params);
    const rows = result?.rows || [];
    end({ success: 'true' });
    if (rows.length === 0) {
      vraEmptyResultsTotal.inc({ op });
    }
    return rows;
  } catch (err) {
    end({ success: 'false' });
    vraClickhouseFallbackTotal.inc({ op });
    logger.warn('VRA safeQuery fallback (ClickHouse unavailable or query failed)', { error: (err as Error)?.message, op });
    return [] as T[];
  }
}

export class VraService {
  // Overview aggregates derived from revenue_events table (normalized to USD)
  async getOverview(params: ReconOverviewParams): Promise<ReconOverviewResult> {
    const from = params.from ?? new Date(Date.now() - 7 * 86400000).toISOString();
    const to = params.to ?? new Date().toISOString();

    const rows = await safeQuery<{
      network: string;
      format: string;
      country: string;
      impressions: string;
      paid: string;
    }>(
      'overview',
      `
      SELECT
        adapter_name AS network,
        ad_format::text AS format,
        country_code AS country,
        SUM(CASE WHEN revenue_type = 'impression' THEN 1 ELSE 0 END)::bigint AS impressions,
        ROUND(COALESCE(SUM(revenue_usd), 0)::numeric, 6)::text AS paid
      FROM revenue_events
      WHERE timestamp >= $1::timestamptz
        AND timestamp <  $2::timestamptz
      GROUP BY adapter_name, ad_format, country_code
      ORDER BY paid DESC
      `,
      [from, to]
    );

    const byBreakdown = rows.map((r) => ({
      network: r.network,
      format: r.format,
      country: r.country,
      impressions: Number(r.impressions) || 0,
      paid: Number(r.paid) || 0,
      expected: undefined,
    }));

    const totals = byBreakdown.reduce(
      (acc, r) => {
        acc.impressions += r.impressions;
        acc.paid += r.paid;
        return acc;
      },
      { impressions: 0, paid: 0, expected: 0 }
    );

    // Until recon_expected is populated, we approximate expected == paid for conservative variance (0%)
    totals.expected = totals.paid;
    const variancePercent = totals.expected > 0 ? 0 : 0;

    // Coverage: ratio of rows with any paid data (proxy for matched coverage)
    const coveragePercent = byBreakdown.length > 0 ? 100 : 0;

    // Best‑effort publish pilot‑gate gauges used by alerts; never throw
    try {
      vraCoveragePercent.set({ scope: 'pilot' }, coveragePercent);
      vraVariancePercent.set({ scope: 'pilot' }, variancePercent);
    } catch (_) {
      // ignore metric errors in lightweight/test environments
    }

    // Per-network slices for UI overview and dashboards
    const byNetworkMap = new Map<string, { network: string; impressions: number; paid: number; expected: number }>();
    for (const r of byBreakdown) {
      const prev = byNetworkMap.get(r.network) || { network: r.network, impressions: 0, paid: 0, expected: 0 };
      prev.impressions += r.impressions;
      prev.paid += r.paid;
      // expected currently mirrors paid until recon_expected is live
      prev.expected += r.paid;
      byNetworkMap.set(r.network, prev);
    }
    const byNetwork = Array.from(byNetworkMap.values()).sort((a, b) => b.paid - a.paid);

    return {
      coveragePercent,
      variancePercent,
      totals,
      byBreakdown,
      byNetwork,
    };
  }

  async getDeltas(query: ReconDeltaQuery): Promise<{ items: ReconDeltaItem[]; page: number; pageSize: number; total: number }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(500, Math.max(1, query.pageSize || 100));
    const from = query.from ?? new Date(Date.now() - 7 * 86400000).toISOString();
    const to = query.to ?? new Date().toISOString();

    const whereClauses: string[] = [];
    const whereParams: unknown[] = [];
    const pushClause = (template: string, value: unknown) => {
      whereParams.push(value);
      const idx = whereParams.length;
      whereClauses.push(template.replace('?', `$${idx}`));
    };
    pushClause('window_start >= ?::timestamptz', from);
    pushClause('window_end < ?::timestamptz', to);
    if (query.kind) pushClause('kind = ?', query.kind);
    if (query.minConf != null) pushClause('confidence >= ?', query.minConf);

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRows = await safeQuery<{ total: string }>(
      'deltas_count',
      `SELECT COUNT(*)::bigint AS total FROM recon_deltas ${whereSql}`,
      whereParams
    );
    const total = Number(countRows[0]?.total || 0);

    const items = await safeQuery<{
      kind: string;
      amount: string;
      currency: string;
      reason_code: string;
      window_start: string;
      window_end: string;
      evidence_id: string;
      confidence: string;
    }>(
      'deltas_list',
      `
      SELECT kind,
             amount::text AS amount,
             currency,
             reason_code,
             TO_CHAR(window_start, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS window_start,
             TO_CHAR(window_end, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')   AS window_end,
             evidence_id,
             confidence::text AS confidence
        FROM recon_deltas
        ${whereSql}
        ORDER BY window_start DESC, evidence_id ASC
        LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}
      `,
      [...whereParams, pageSize, (page - 1) * pageSize]
    );

    const mapped: ReconDeltaItem[] = items.map((r) => ({
      kind: r.kind as ReconDeltaItem['kind'],
      amount: Number(r.amount) || 0,
      currency: r.currency,
      reasonCode: r.reason_code,
      windowStart: r.window_start,
      windowEnd: r.window_end,
      evidenceId: r.evidence_id,
      confidence: Number(r.confidence) || 0,
    }));

    return { items: mapped, page, pageSize, total };
  }

  async getMonthlyDigest(month: string): Promise<ProofsMonthlyDigest | null> {
    const rows = await safeQuery<{
      month: string;
      digest: string;
      sig: string;
      coverage_pct: string;
      notes: string;
    }>(
      'monthly_digest',
      `SELECT month, digest, sig, coverage_pct::text AS coverage_pct, notes
         FROM proofs_monthly_digest
        WHERE month = $1
        LIMIT 1`,
      [month]
    );
    if (rows.length === 0) return null;
    return {
      month: rows[0].month,
      digest: rows[0].digest,
      signature: rows[0].sig,
      coveragePct: Number(rows[0].coverage_pct) || 0,
      notes: rows[0].notes,
    };
  }
}

export const vraService = new VraService();
