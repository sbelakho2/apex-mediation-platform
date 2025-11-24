import { runMatchingBatch } from '../matchJob';

// Mock ClickHouse helpers
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async (query: string) => {
    const q = String(query).toLowerCase();
    if (q.includes('from recon_statements_norm')) {
      return [
        { event_date: '2025-11-01', app_id: 'app', ad_unit_id: 'unit', country: 'US', format: 'interstitial', paid: '1.00', currency: 'USD', report_id: 'rep', network: 'unity' },
      ];
    }
    if (q.includes('from recon_expected')) {
      return [
        { request_id: 'r1', ts: '2025-11-01T12:00:00Z', expected_value: '1.00' },
      ];
    }
    return [];
  }),
  insertBatch: jest.fn(async () => {}),
}));

const { insertBatch } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Matching Job — RO posture (dry-run vs write)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not write when dryRun=true', async () => {
    const res = await runMatchingBatch({ from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z', dryRun: true });
    expect(res.inserted).toBe(0);
    expect(insertBatch).not.toHaveBeenCalled();
  });

  it('writes to recon_match when dryRun=false and auto matches exist', async () => {
    const res = await runMatchingBatch({ from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z', dryRun: false });
    // Depending on scoring config, there should be at least an attempt to insert
    expect(insertBatch).toHaveBeenCalled();
  });
});
