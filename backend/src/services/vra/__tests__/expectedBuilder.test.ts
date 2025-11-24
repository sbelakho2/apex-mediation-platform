import { buildReconExpected } from '../expectedBuilder';

// Mock ClickHouse helpers used by Expected Builder
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async (_q: string, _p?: Record<string, unknown>) => []),
  insertBatch: jest.fn(async (_table: string, _rows: unknown[]) => {}),
}));

const { executeQuery, insertBatch } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Expected Builder', () => {
  const makePg = (rows: any[]) => ({
    query: jest.fn(async () => ({ rows })),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns zeros when no receipts are found', async () => {
    const pg = makePg([]);
    const out = await buildReconExpected(pg as any, {
      from: '2025-11-01T00:00:00Z',
      to: '2025-11-02T00:00:00Z',
    });
    expect(out).toEqual({ seen: 0, written: 0, skipped: 0 });
    expect(executeQuery).not.toHaveBeenCalled();
    expect(insertBatch).not.toHaveBeenCalled();
  });

  it('writes recon_expected for receipts with matching paid events and skips existing ids', async () => {
    // PG returns two receipts
    const pg = makePg([
      { request_id: 'r1', placement_id: 'pl1', ts: '2025-11-01T01:00:00Z', floor_cpm: 1.23, currency: 'USD', receipt_hash: 'h1' },
      { request_id: 'r2', placement_id: 'pl2', ts: '2025-11-01T02:00:00Z', floor_cpm: 0.5, currency: 'EUR', receipt_hash: 'h2' },
    ]);

    // First CH call: existing recon_expected check — r2 already exists
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ request_id: 'r2' }])
      // Second CH call: revenue_events — paid for r1 only
      .mockResolvedValueOnce([{ request_id: 'r1', ts: '2025-11-01T01:00:01Z', revenue_usd: '0.123456', revenue_original: '0.123456', revenue_currency: 'USD' }]);

    const out = await buildReconExpected(pg as any, {
      from: '2025-11-01T00:00:00Z',
      to: '2025-11-02T00:00:00Z',
      limit: 1000,
    });

    expect(out.seen).toBe(2);
    expect(out.written).toBe(1);
    expect(out.skipped).toBe(1);

    // insertBatch called once for recon_expected with one row
    expect((insertBatch as jest.Mock).mock.calls[0][0]).toBe('recon_expected');
    const rows = (insertBatch as jest.Mock).mock.calls[0][1];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ request_id: 'r1', expected_value: 0.123456, currency: 'USD', placement_id: 'pl1' });
  });

  it('skips receipts without matching paid events', async () => {
    const pg = makePg([{ request_id: 'rx', placement_id: 'plx', ts: '2025-11-01T03:00:00Z' }]);
    // existing: none
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([])
      // revenue_events: none for rx
      .mockResolvedValueOnce([]);

    const out = await buildReconExpected(pg as any, { from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z' });
    expect(out.seen).toBe(1);
    expect(out.written).toBe(0);
    expect(out.skipped).toBe(1);
    expect(insertBatch).not.toHaveBeenCalled();
  });
});
