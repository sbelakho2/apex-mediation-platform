import { vraService } from '../vraService';

// Capture queries passed to executeQuery
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async (query: string, _params?: Record<string, unknown>) => {
    // Return count on first call, one row on second to exercise flow
    if (String(query).toLowerCase().includes('select count()')) return [{ total: '1' }];
    return [
      {
        kind: 'underpay',
        amount: '1.000000',
        currency: 'USD',
        reason_code: 'ok',
        window_start: '2025-11-01 00:00:00',
        window_end: '2025-11-02 00:00:00',
        evidence_id: 'ev-k',
        confidence: '0.90',
      },
    ];
  }),
}));

const { executeQuery } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Service — deltas filters in WHERE clause', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes kind and min_conf filters in generated SQL', async () => {
    const out = await vraService.getDeltas({ kind: 'underpay', minConf: 0.8, page: 1, pageSize: 10 });
    expect(out.total).toBeGreaterThanOrEqual(0);
    const calls = (executeQuery as jest.Mock).mock.calls.map((c: any[]) => String(c[0]));
    const whereCount = calls[0];
    const whereList = calls[1];
    // Both the count and list queries should include our filters
    expect(whereCount).toContain('WHERE');
    expect(whereCount).toContain('kind =');
    expect(whereCount.toLowerCase()).toContain('confidence >=');
    expect(whereList).toContain('WHERE');
    expect(whereList).toContain('kind =');
    expect(whereList.toLowerCase()).toContain('confidence >=');
  });
});
