import { buildReconExpected } from '../expectedBuilder';

describe('VRA Expected Builder', () => {
  const makePg = () => ({
    query: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns zeros when no receipts are found', async () => {
    const pg = makePg();
    (pg.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const out = await buildReconExpected(pg as any, {
      from: '2025-11-01T00:00:00Z',
      to: '2025-11-02T00:00:00Z',
    });
    expect(out).toEqual({ seen: 0, written: 0, skipped: 0 });
    expect(pg.query).toHaveBeenCalledTimes(1);
  });

  it('writes recon_expected for receipts with matching paid events and skips existing ids', async () => {
    const receipts = [
      { request_id: 'r1', placement_id: 'pl1', ts: '2025-11-01T01:00:00Z', floor_cpm: 1.23, currency: 'USD', receipt_hash: 'h1' },
      { request_id: 'r2', placement_id: 'pl2', ts: '2025-11-01T02:00:00Z', floor_cpm: 0.5, currency: 'EUR', receipt_hash: 'h2' },
    ];
    const pg = makePg();
    (pg.query as jest.Mock)
      // Receipts
      .mockResolvedValueOnce({ rows: receipts })
      // Existing recon_expected rows (r2 only)
      .mockResolvedValueOnce({ rows: [{ request_id: 'r2' }] })
      // Paid events (r1 only)
      .mockResolvedValueOnce({ rows: [{ request_id: 'r1', ts: '2025-11-01T01:00:01Z', revenue_usd: '0.123456', revenue_original: '0.123456', revenue_currency: 'USD' }] })
      // Insert results
      .mockResolvedValueOnce({ rowCount: 1 });

    const out = await buildReconExpected(pg as any, {
      from: '2025-11-01T00:00:00Z',
      to: '2025-11-02T00:00:00Z',
      limit: 1000,
    });

    expect(out.seen).toBe(2);
    expect(out.written).toBe(1);
    expect(out.skipped).toBe(1);

    expect(pg.query).toHaveBeenCalledTimes(4);
    const insertCall = (pg.query as jest.Mock).mock.calls[3];
    expect(insertCall[0]).toContain('INSERT INTO recon_expected');
    expect(insertCall[1]).toContain('r1');
  });

  it('skips receipts without matching paid events', async () => {
    const pg = makePg();
    (pg.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ request_id: 'rx', placement_id: 'plx', ts: '2025-11-01T03:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const out = await buildReconExpected(pg as any, { from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z' });
    expect(out.seen).toBe(1);
    expect(out.written).toBe(0);
    expect(out.skipped).toBe(1);
    expect((pg.query as jest.Mock).mock.calls.length).toBe(3);
  });
});
