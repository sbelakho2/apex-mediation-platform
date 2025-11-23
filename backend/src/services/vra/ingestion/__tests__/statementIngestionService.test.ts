import { parseCanonicalNormalizedCsv, ingestCanonicalCsvReport } from '../statementIngestionService';

// Mock ClickHouse utils used by ingestion
jest.mock('../../../../utils/clickhouse', () => {
  return {
    executeQuery: jest.fn(async (_q: string, _p?: Record<string, unknown>) => {
      return [];
    }),
    insertBatch: jest.fn(async (_table: string, _rows: unknown[]) => {}),
  };
});

const { executeQuery, insertBatch } = jest.requireMock('../../../../utils/clickhouse');

describe('VRA Statement Ingestion - canonical CSV parser and ingest flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VRA_ALLOWED_NETWORKS; // allow all by default
  });

  it('parseCanonicalNormalizedCsv parses valid canonical CSV with optional fields', () => {
    const csv = [
      'event_date,app_id,ad_unit_id,country,format,currency,impressions,clicks,paid,ivt_adjustments',
      '2025-11-01,com.app,unit1,US,interstitial,USD,100,5,12.3456,0',
      '2025-11-01,com.app,unit2,GB,banner,GBP,50,,5.0000,',
    ].join('\n');

    const res = parseCanonicalNormalizedCsv('unity', 1, 'rep-1', csv);
    expect(res.errors).toEqual([]);
    expect(res.rows.length).toBe(2);
    expect(res.rows[0]).toMatchObject({
      event_date: '2025-11-01',
      app_id: 'com.app',
      ad_unit_id: 'unit1',
      country: 'US',
      format: 'interstitial',
      currency: 'USD',
      impressions: 100,
      clicks: 5,
      paid: 12.3456,
      ivt_adjustments: 0,
      report_id: 'rep-1',
      network: 'unity',
      schema_ver: 1,
    });
    // empty clicks/ivt become 0 per current parser behavior
    expect(res.rows[1]).toMatchObject({ clicks: 0, ivt_adjustments: 0 });
  });

  it('parseCanonicalNormalizedCsv reports missing required headers', () => {
    const csv = [
      'event_date,app_id,ad_unit_id,country,format,currency,impressions', // missing paid
      '2025-11-01,com.app,unit1,US,interstitial,USD,100',
    ].join('\n');

    const res = parseCanonicalNormalizedCsv('unity', 1, 'rep-2', csv);
    expect(res.rows.length).toBe(0);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0].message).toContain('Missing required headers');
  });

  it('ingestCanonicalCsvReport inserts raw+norm when not already loaded', async () => {
    // hasRawLoad -> 0
    (executeQuery as jest.Mock).mockResolvedValueOnce([{ cnt: '0' }]);
    const csv = [
      'event_date,app_id,ad_unit_id,country,format,currency,impressions,paid',
      '2025-11-01,com.app,unit1,US,interstitial,USD,100,12.3456',
      '2025-11-01,com.app,unit2,GB,banner,GBP,50,5.0000',
    ].join('\n');

    const out = await ingestCanonicalCsvReport({
      network: 'unity',
      schemaVer: 1,
      loadId: 'load-1',
      reportId: 'rep-1',
      csv,
    });

    expect(out.skipped).toBe(false);
    expect(out.normalizedRows).toBe(2);
    // Expect two inserts: one for raw, one for norm
    const calls = (insertBatch as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain('recon_statements_raw');
    expect(calls).toContain('recon_statements_norm');
  });

  it('ingestCanonicalCsvReport skips when already_loaded', async () => {
    (executeQuery as jest.Mock).mockResolvedValueOnce([{ cnt: '1' }]);
    const csv = 'event_date,app_id,ad_unit_id,country,format,currency,impressions,paid\n2025-11-01,com.app,unit1,US,interstitial,USD,100,12.34';

    const out = await ingestCanonicalCsvReport({
      network: 'unity',
      schemaVer: 1,
      loadId: 'load-1',
      reportId: 'rep-1',
      csv,
    });

    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('already_loaded');
    expect(insertBatch).not.toHaveBeenCalled();
  });
});
