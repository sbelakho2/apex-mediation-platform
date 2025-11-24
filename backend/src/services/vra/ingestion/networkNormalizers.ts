import {
  insertNormalizedRows,
  NormalizedStatementRow,
  parseCanonicalNormalizedCsv,
  hasRawLoad,
  recordRawLoad,
} from './statementIngestionService';
import logger from '../../../utils/logger';

export type HeaderMap = Record<string, string>; // network header (lowercased) -> canonical header name

// Synonym helper
const m = (canonical: string, ...synonyms: string[]): [string, string[]] => [canonical, synonyms];

function headerMapFromPairs(pairs: Array<[string, string[]]>): HeaderMap {
  const map: HeaderMap = {};
  for (const [canonical, syns] of pairs) {
    for (const s of syns) map[s.toLowerCase()] = canonical;
    // also map canonical to itself to pass-through if present
    map[canonical.toLowerCase()] = canonical;
  }
  return map;
}

export const NETWORK_HEADER_MAPS: Record<string, HeaderMap> = {
  admob: headerMapFromPairs([
    m('event_date', 'date', 'day'),
    m('app_id', 'app id', 'app', 'bundle id', 'package name'),
    m('ad_unit_id', 'ad unit id', 'ad unit', 'ad_unit', 'unit id'),
    m('country', 'country', 'country code', 'country/region', 'country code (iso-3166-1 alpha-2)'),
    m('format', 'ad format', 'ad type', 'format'),
    m('currency', 'currency', 'reporting currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'estimated earnings', 'earnings', 'revenue', 'total revenue'),
    m('ivt_adjustments', 'invalid traffic', 'ivt', 'ivt adjustments'),
  ]),
  unity: headerMapFromPairs([
    m('event_date', 'date', 'day'),
    m('app_id', 'project id', 'app id', 'bundle id'),
    m('ad_unit_id', 'placement id', 'ad unit id', 'ad unit'),
    m('country', 'country', 'country code', 'country/region'),
    m('format', 'ad type', 'format'),
    m('currency', 'currency', 'reporting currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'estimated revenue', 'earnings'),
  ]),
  applovin: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'app id', 'package name', 'bundle id'),
    m('ad_unit_id', 'ad unit id', 'ad unit', 'zone id'),
    m('country', 'country code', 'country'),
    m('format', 'format', 'ad format', 'ad type'),
    m('currency', 'currency', 'reporting currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'estimated revenue', 'earnings'),
  ]),
  ironsource: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'app id', 'bundle id'),
    m('ad_unit_id', 'ad unit id', 'ad unit', 'placement id', 'instance id'),
    m('country', 'country', 'country code'),
    m('format', 'ad unit type', 'ad type', 'format'),
    m('currency', 'currency', 'reporting currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'estimated revenue', 'earnings'),
  ]),
  adcolony: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'bundle id', 'app id'),
    m('ad_unit_id', 'zone id', 'ad unit id', 'placement id'),
    m('country', 'country', 'country code'),
    m('format', 'ad format', 'ad type', 'format'),
    m('currency', 'currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'earnings'),
  ]),
  chartboost: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'app', 'bundle id', 'app id'),
    m('ad_unit_id', 'location id', 'placement id', 'ad unit id'),
    m('country', 'country', 'country code'),
    m('format', 'ad type', 'format'),
    m('currency', 'currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'earnings'),
  ]),
  vungle: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'app id', 'bundle id'),
    m('ad_unit_id', 'placement id', 'ad unit id'),
    m('country', 'country', 'country code'),
    m('format', 'ad type', 'format'),
    m('currency', 'currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'earnings', 'revenue (usd)'),
  ]),
  mintegral: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'app id', 'bundle id'),
    m('ad_unit_id', 'unit id', 'ad unit id'),
    m('country', 'country', 'country code'),
    m('format', 'ad format', 'ad type', 'format'),
    m('currency', 'currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'earnings'),
  ]),
  pangle: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'app id', 'bundle id'),
    m('ad_unit_id', 'ad placement id', 'placement id', 'ad unit id'),
    m('country', 'country', 'country/region', 'country code'),
    m('format', 'ad type', 'format'),
    m('currency', 'currency', 'reporting currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'earnings'),
  ]),
  meta: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'app id', 'bundle id'),
    m('ad_unit_id', 'placement id', 'ad unit id'),
    m('country', 'country', 'country code'),
    m('format', 'ad type', 'format'),
    m('currency', 'currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'earnings'),
  ]),
  inmobi: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'bundle id', 'app id', 'package name'),
    m('ad_unit_id', 'placement id', 'ad unit id', 'ad unit'),
    m('country', 'country', 'country code'),
    m('format', 'ad type', 'format'),
    m('currency', 'currency', 'reporting currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'estimated revenue', 'earnings'),
  ]),
  fyber: headerMapFromPairs([
    m('event_date', 'date', 'day'),
    m('app_id', 'app id', 'bundle id', 'package name'),
    m('ad_unit_id', 'placement id', 'ad space id', 'ad unit id'),
    m('country', 'country', 'country code'),
    m('format', 'ad format', 'ad type', 'format'),
    m('currency', 'currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'earnings', 'payout'),
  ]),
  smaato: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'app id', 'bundle id'),
    m('ad_unit_id', 'ad space id', 'placement id', 'ad unit id'),
    m('country', 'country', 'country code'),
    m('format', 'ad format', 'ad type', 'format'),
    m('currency', 'currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'earnings', 'publisher revenue'),
  ]),
  tapjoy: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'app id', 'bundle id'),
    m('ad_unit_id', 'placement id', 'ad unit id'),
    m('country', 'country', 'country code'),
    m('format', 'ad type', 'format'),
    m('currency', 'currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'earnings'),
  ]),
  moloco: headerMapFromPairs([
    m('event_date', 'date'),
    m('app_id', 'app id', 'bundle id'),
    m('ad_unit_id', 'placement id', 'ad unit id'),
    m('country', 'country', 'country code'),
    m('format', 'ad format', 'ad type', 'format'),
    m('currency', 'currency'),
    m('impressions', 'impressions'),
    m('clicks', 'clicks'),
    m('paid', 'revenue', 'earnings'),
  ]),
};

function parseHeaderLine(csv: string): { headerFields: string[]; newlineIndex: number; newline: string } {
  // Extract the first line with a minimal CSV parser supporting quotes
  let i = 0;
  let inQuotes = false;
  let field = '';
  const out: string[] = [];
  let newlineIndex = -1;
  let newline = '\n';
  while (i < csv.length) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        const peek = csv[i + 1];
        if (peek === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { out.push(field); field = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        out.push(field); field = '';
        newlineIndex = i;
        // detect CRLF
        if (ch === '\r' && csv[i + 1] === '\n') { newline = '\r\n'; newlineIndex = i + 1; }
        break;
      }
      field += ch; i++; continue;
    }
  }
  if (newlineIndex < 0) { out.push(field); newlineIndex = i; }
  return { headerFields: out, newlineIndex, newline };
}

function rewriteCsvHeader(csv: string, headerMap: HeaderMap): string {
  const { headerFields, newlineIndex, newline } = parseHeaderLine(csv);
  const mapped = headerFields.map((h) => {
    const key = (h || '').trim().toLowerCase();
    return headerMap[key] || h; // keep original if not recognized
  });
  const head = mapped.join(',');
  const rest = csv.slice(newlineIndex + 1);
  return `${head}${newline}${rest}`;
}

export function normalizeNetworkCsvReport(params: {
  network: string;
  schemaVer: number;
  reportId: string;
  csv: string;
}): { rows: NormalizedStatementRow[]; errors: Array<{ line: number; message: string }> } {
  const netKey = params.network.toLowerCase();
  const headerMap = NETWORK_HEADER_MAPS[netKey];
  if (!headerMap) {
    // Fall back to canonical parser if no mapping is defined
    const parsed = parseCanonicalNormalizedCsv(params.network, params.schemaVer, params.reportId, params.csv);
    return { rows: parsed.rows, errors: parsed.errors };
  }
  const rewritten = rewriteCsvHeader(params.csv, headerMap);
  const parsed = parseCanonicalNormalizedCsv(params.network, params.schemaVer, params.reportId, rewritten);
  return { rows: parsed.rows, errors: parsed.errors };
}

export async function ingestNetworkCsvReport(params: {
  network: string;
  schemaVer: number;
  loadId: string;
  reportId: string;
  csv: string;
}): Promise<{ normalizedRows: number; skipped: boolean; reason?: string; errors?: Array<{ line: number; message: string }> }> {
  const { network, schemaVer, loadId, reportId, csv } = params;
  if (await hasRawLoad(network, loadId)) {
    return { normalizedRows: 0, skipped: true, reason: 'already_loaded' };
  }

  const { rows, errors } = normalizeNetworkCsvReport({ network, schemaVer, reportId, csv });
  if (rows.length === 0) {
    return { normalizedRows: 0, skipped: true, reason: 'parse_no_rows', errors };
  }

  // Record raw and write normalized
  try {
    await recordRawLoad({ network, schemaVer, loadId, rawBlob: csv });
  } catch (e) {
    logger.warn('VRA network ingest: raw record failed (continuing)', { network, loadId, error: (e as Error).message });
  }

  const ok = await insertNormalizedRows(rows);
  if (!ok) {
    return { normalizedRows: 0, skipped: true, reason: 'norm_insert_failed', errors };
  }
  return { normalizedRows: rows.length, skipped: false, errors };
}
