import { ingestCanonicalCsvReport } from '../statementIngestionService';

// Mock Postgres helpers used by ingestion
jest.mock('../../../../utils/postgres', () => ({
  query: jest.fn(async () => ({ rows: [{ cnt: '0' }] })),
  insertMany: jest.fn(async () => {}),
}));

describe('VRA ingestion — network allowlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips ingest when network not allowed by VRA_ALLOWED_NETWORKS', async () => {
    process.env.VRA_ALLOWED_NETWORKS = 'admob,applovin';
    const csv = 'event_date,app_id,ad_unit_id,country,format,currency,impressions,paid\n2025-11-01,com.app,unit1,US,interstitial,USD,100,12.34';
    const out = await ingestCanonicalCsvReport({
      network: 'unity',
      schemaVer: 1,
      loadId: 'ld-1',
      reportId: 'rep-1',
      csv,
    });
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('network_not_allowed');
  });
});
