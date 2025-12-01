import { vraService } from '../vraService';

// Mock Postgres helper to capture queries/params
jest.mock('../../../utils/postgres', () => ({
  query: jest.fn(async (sql: string) => {
    if (typeof sql === 'string' && sql.toLowerCase().includes('count(')) {
      return { rows: [{ total: '2' }] };
    }
    return {
      rows: [
        {
          kind: 'underpay',
          amount: '1.230000',
          currency: 'USD',
          reason_code: 'test',
          window_start: '2025-11-01 00:00:00',
          window_end: '2025-11-02 00:00:00',
          evidence_id: 'ev-1',
          confidence: '0.90',
        },
      ],
    };
  }),
}));

const { query } = jest.requireMock('../../../utils/postgres');

describe('VRA Service — getDeltas pagination and ORDER BY stability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses deterministic ORDER BY and passes LIMIT/OFFSET for pagination', async () => {
    const page = 2;
    const pageSize = 1;
    const out = await vraService.getDeltas({ page, pageSize });
    expect(out.page).toBe(page);
    expect(out.pageSize).toBe(pageSize);
    expect(out.items.length).toBe(1);

    // Inspect second call (list query)
    const calls = (query as jest.Mock).mock.calls;
    // First call: count, Second call: list
    const listQuery: string = calls[1][0];
    const listParams: unknown[] = calls[1][1] || [];

    expect(listQuery).toContain('ORDER BY window_start DESC, evidence_id ASC');
    expect(listQuery).toContain('LIMIT $');
    expect(Array.isArray(listParams)).toBe(true);
    const limitParam = listParams[listParams.length - 2];
    const offsetParam = listParams[listParams.length - 1];
    expect(limitParam).toBe(pageSize);
    expect(offsetParam).toBe((page - 1) * pageSize);
  });
});
