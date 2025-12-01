import { insertMany, query } from '../../../utils/postgres';
import logger from '../../../utils/logger';
import { getFeatureFlags } from '../../../utils/featureFlags';
import {
  vraStatementsLoadFailuresTotal,
  vraStatementsLoadsTotal,
  vraStatementsRowsParsedTotal,
} from '../../../utils/prometheus';

// Canonical normalized schema per VRA.md for recon_statements_norm
export interface NormalizedStatementRow {
  event_date: string; // YYYY-MM-DD
  app_id: string;
  ad_unit_id: string;
  country: string; // ISO-3166-1 alpha-2
  format: string; // interstitial|rewarded|banner|video|native|VAST
  currency: string; // ISO-4217
  impressions: number;
  clicks?: number | null;
  paid: number; // Decimal(18,6)
  ivt_adjustments?: number | null; // Decimal(18,6)
  report_id: string;
  network: string;
  schema_ver: number;
}

export interface ParseResult {
  rows: NormalizedStatementRow[];
  errors: Array<{ line: number; message: string }>; // non-fatal; rows may still be emitted
}

// Minimal CSV parser with quoted field support — intentionally simple, no external deps
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const peek = text[i + 1];
        if (peek === '"') { // escaped quote
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ',') {
        pushField();
        i++;
        continue;
      }
      if (ch === '\n') {
        pushField();
        pushRow();
        i++;
        continue;
      }
      if (ch === '\r') { // handle CRLF
        i++;
        continue;
      }
      field += ch;
      i++;
    }
  }
  // trailing field/row
  pushField();
  if (row.length > 1 || (row.length === 1 && row[0].length > 0)) {
    pushRow();
  }
  return rows;
}

function toHeaderIndex(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((name, idx) => {
    const key = name.trim().toLowerCase();
    if (key) map[key] = idx;
  });
  return map;
}

// For the initial scaffold, support a canonical CSV header exactly matching normalized schema names.
// Additional per-network mappers can be added in future iterations.
export function parseCanonicalNormalizedCsv(
  network: string,
  schemaVer: number,
  reportId: string,
  csv: string
): ParseResult {
  const rows = parseCsv(csv).filter((r) => r.length > 0 && !(r.length === 1 && r[0].trim() === ''));
  if (rows.length === 0) {
    return { rows: [], errors: [] };
  }
  const header = rows[0];
  const idx = toHeaderIndex(header);

  const required = [
    'event_date',
    'app_id',
    'ad_unit_id',
    'country',
    'format',
    'currency',
    'impressions',
    'paid',
  ];
  const missing = required.filter((k) => !(k in idx));
  if (missing.length > 0) {
    return { rows: [], errors: [{ line: 1, message: `Missing required headers: ${missing.join(', ')}` }] };
  }

  const out: NormalizedStatementRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let r = 1; r < rows.length; r++) {
    const line = rows[r];
    if (line.length === 0) continue;
    try {
      const get = (key: string) => line[idx[key]]?.trim() ?? '';
      const impressions = Number(get('impressions') || '0');
      const clicks = 'clicks' in idx ? Number(get('clicks') || '0') : null;
      const paid = Number(get('paid') || '0');
      const ivt = 'ivt_adjustments' in idx ? Number(get('ivt_adjustments') || '0') : null;

      const row: NormalizedStatementRow = {
        event_date: get('event_date'),
        app_id: get('app_id'),
        ad_unit_id: get('ad_unit_id'),
        country: get('country'),
        format: get('format'),
        currency: get('currency'),
        impressions: Number.isFinite(impressions) ? impressions : 0,
        clicks: Number.isFinite(clicks as number) ? (clicks as number) : null,
        paid: Number.isFinite(paid) ? paid : 0,
        ivt_adjustments: Number.isFinite(ivt as number) ? (ivt as number) : null,
        report_id: reportId,
        network,
        schema_ver: schemaVer,
      };
      out.push(row);
    } catch (e) {
      errors.push({ line: r + 1, message: (e as Error).message });
    }
  }

  try {
    vraStatementsRowsParsedTotal.inc({ network, schema_ver: String(schemaVer) }, out.length);
  } catch (_) {
    // metrics are best-effort
  }

  return { rows: out, errors };
}

export async function recordRawLoad(params: {
  network: string;
  schemaVer: number;
  loadId: string;
  rawBlob: string;
}): Promise<boolean> {
  const { network, schemaVer, loadId, rawBlob } = params;
  try {
    const result = await query(
      `INSERT INTO recon_statements_raw (network, schema_ver, load_id, raw_blob)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (network, load_id) DO NOTHING
       RETURNING 1`,
      [network, schemaVer, loadId, rawBlob]
    );
    try { vraStatementsLoadsTotal.inc({ network, phase: 'raw' }); } catch {}
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.warn('VRA ingest: failed to write raw load', { network, loadId, error: (error as Error).message });
    try { vraStatementsLoadFailuresTotal.inc({ network, phase: 'raw', reason: 'insert_failed' }); } catch {}
    return false;
  }
}

export async function hasRawLoad(network: string, loadId: string): Promise<boolean> {
  try {
    const res = await query<{ cnt: string }>(
      'SELECT count(*) AS cnt FROM recon_statements_raw WHERE network = $1 AND load_id = $2',
      [network, loadId]
    );
    const n = Number(res.rows[0]?.cnt || 0);
    return n > 0;
  } catch (error) {
    logger.warn('VRA ingest: failed to check existing raw load (treat as not found)', { network, loadId, error: (error as Error).message });
    return false;
  }
}

export async function insertNormalizedRows(rows: NormalizedStatementRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const network = rows[0]?.network || 'unknown';
  try {
    await insertMany(
      'recon_statements_norm',
      [
        'event_date',
        'app_id',
        'ad_unit_id',
        'country',
        'format',
        'currency',
        'impressions',
        'clicks',
        'paid',
        'ivt_adjustments',
        'report_id',
        'network',
        'schema_ver',
      ],
      rows.map((row) => [
        row.event_date,
        row.app_id,
        row.ad_unit_id,
        row.country,
        row.format,
        row.currency,
        row.impressions,
        row.clicks ?? null,
        row.paid,
        row.ivt_adjustments ?? null,
        row.report_id,
        row.network,
        row.schema_ver,
      ])
    );
    try { vraStatementsLoadsTotal.inc({ network, phase: 'norm' }); } catch {}
    return true;
  } catch (error) {
    logger.warn('VRA ingest: failed to write normalized rows', { network, rows: rows.length, error: (error as Error).message });
    try { vraStatementsLoadFailuresTotal.inc({ network, phase: 'norm', reason: 'insert_failed' }); } catch {}
    return false;
  }
}

function isNetworkAllowed(network: string): boolean {
  const { vraAllowedNetworks } = getFeatureFlags();
  const allowCsv = (vraAllowedNetworks || '').trim();
  if (!allowCsv) return true; // if not set, allow all (safe default for canary)
  const allow = new Set(allowCsv.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  return allow.has(network.toLowerCase());
}

// High-level convenience helper to ingest a canonical CSV report end-to-end.
// Safe defaults: skips if network not allowed or loadId already recorded.
export async function ingestCanonicalCsvReport(params: {
  network: string;
  schemaVer: number;
  loadId: string; // unique per file
  reportId: string; // semantic identifier (e.g., filename, provider report id)
  csv: string;
}): Promise<{ normalizedRows: number; skipped: boolean; reason?: string; errors?: ParseResult['errors'] }> {
  const { network, schemaVer, loadId, reportId, csv } = params;

  if (!isNetworkAllowed(network)) {
    return { normalizedRows: 0, skipped: true, reason: 'network_not_allowed' };
  }

  // Idempotency: if we already recorded this loadId, skip normalization to avoid duplicates
  if (await hasRawLoad(network, loadId)) {
    return { normalizedRows: 0, skipped: true, reason: 'already_loaded' };
  }

  // Record raw (best-effort; continue even if raw fails, but mark reason)
  const rawOk = await recordRawLoad({ network, schemaVer, loadId, rawBlob: csv });
  if (!rawOk) {
    // Continue but annotate
    logger.warn('VRA ingest: proceeding to normalize despite raw write failure', { network, loadId });
  }

  const parsed = parseCanonicalNormalizedCsv(network, schemaVer, reportId, csv);
  if (parsed.rows.length === 0) {
    return { normalizedRows: 0, skipped: true, reason: 'parse_no_rows', errors: parsed.errors };
  }

  const ok = await insertNormalizedRows(parsed.rows);
  if (!ok) {
    return { normalizedRows: 0, skipped: true, reason: 'norm_insert_failed', errors: parsed.errors };
  }

  return { normalizedRows: parsed.rows.length, skipped: false, errors: parsed.errors };
}
