import { buildReconExpected } from '../expectedBuilder';

describe('VRA RBAC/RO spot-check — Expected Builder uses read-only PG', () => {
  it('issues SELECT from Postgres (no writes) during expected build', async () => {
    const queries: string[] = [];
    const pg = {
      query: jest.fn(async (text: string, _params?: unknown[]) => {
        queries.push(String(text).toUpperCase());
        // Return two minimal receipts to exercise flow
        return {
          rows: [
            { request_id: 'r1', placement_id: 'pl1', ts: '2025-11-01T01:00:00Z', floor_cpm: 1.2, currency: 'USD', receipt_hash: 'aa' },
            { request_id: 'r2', placement_id: 'pl2', ts: '2025-11-01T02:00:00Z', floor_cpm: 0.5, currency: 'EUR', receipt_hash: 'bb' },
          ],
        } as any;
      }),
    } as any;

    // Mock ClickHouse helpers to avoid writes; return r2 existing to force skip
    jest.resetModules();
    jest.doMock('../../../utils/clickhouse', () => ({
      executeQuery: jest.fn(async (q: string, _p?: Record<string, unknown>) => {
        const qq = String(q).toLowerCase();
        if (qq.includes('from recon_expected')) return [{ request_id: 'r2' }];
        if (qq.includes('from revenue_events')) return [{ request_id: 'r1', ts: '2025-11-01T01:00:01Z', revenue_usd: '0.123456', revenue_original: '0.123456', revenue_currency: 'USD' }];
        return [];
      }),
      insertBatch: jest.fn(async () => {}),
    }));

    const mod = await import('../expectedBuilder');
    const res = await (mod.buildReconExpected as typeof buildReconExpected)(pg, {
      from: '2025-11-01T00:00:00Z',
      to: '2025-11-02T00:00:00Z',
      limit: 100,
    });
    expect(res.seen).toBe(2);

    // Ensure all PG queries captured are SELECT-only (no INSERT/UPDATE/DELETE)
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.startsWith('SELECT')).toBe(true);
      expect(q.includes('INSERT')).toBe(false);
      expect(q.includes('UPDATE')).toBe(false);
      expect(q.includes('DELETE')).toBe(false);
    }
  });
});
