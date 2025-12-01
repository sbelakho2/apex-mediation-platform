import { buildReconExpected } from '../expectedBuilder';

describe('VRA RBAC/RO spot-check — Expected Builder uses read-only PG', () => {
  it('issues SELECT statements only when executed in dry-run mode', async () => {
    const queries: string[] = [];
    const responses = [
      // Receipts
      {
        rows: [
          { request_id: 'r1', placement_id: 'pl1', ts: '2025-11-01T01:00:00Z', floor_cpm: 1.2, currency: 'USD', receipt_hash: 'aa' },
          { request_id: 'r2', placement_id: 'pl2', ts: '2025-11-01T02:00:00Z', floor_cpm: 0.5, currency: 'EUR', receipt_hash: 'bb' },
        ],
      },
      // Existing recon_expected rows (skip r2)
      { rows: [{ request_id: 'r2' }] },
      // Paid events for r1
      {
        rows: [
          { request_id: 'r1', ts: '2025-11-01T01:00:01Z', revenue_usd: '0.123456', revenue_original: '0.123456', revenue_currency: 'USD' },
        ],
      },
    ];

    const pg = {
      query: jest.fn(async (text: string) => {
        queries.push(String(text).toUpperCase());
        return responses.shift() ?? { rows: [] };
      }),
    } as any;

    const res = await buildReconExpected(pg, {
      from: '2025-11-01T00:00:00Z',
      to: '2025-11-02T00:00:00Z',
      limit: 100,
    }, { dryRun: true });
    expect(res.seen).toBe(2);
    expect(res.written).toBe(1);

    // Dry-run posture must not attempt INSERT/UPDATE/DELETE
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.startsWith('SELECT')).toBe(true);
      expect(q.includes('INSERT')).toBe(false);
      expect(q.includes('UPDATE')).toBe(false);
      expect(q.includes('DELETE')).toBe(false);
    }
  });
});
