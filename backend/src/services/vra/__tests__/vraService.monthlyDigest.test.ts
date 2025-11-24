import { vraService } from '../vraService';

// Mock ClickHouse helper
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async (_query: string, _params?: Record<string, unknown>) => []),
}));

const { executeQuery } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Service — getMonthlyDigest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no digest row present', async () => {
    (executeQuery as jest.Mock).mockResolvedValueOnce([]);
    const out = await vraService.getMonthlyDigest('2025-11');
    expect(out).toBeNull();
  });

  it('maps digest row fields correctly', async () => {
    (executeQuery as jest.Mock).mockResolvedValueOnce([
      { month: '2025-11', digest: 'deadbeef', sig: 'cafebabe', coverage_pct: '95.0', notes: 'ok' },
    ]);
    const out = await vraService.getMonthlyDigest('2025-11');
    expect(out).not.toBeNull();
    expect(out!.month).toBe('2025-11');
    expect(out!.digest).toBe('deadbeef');
    expect(out!.signature).toBe('cafebabe');
    expect(out!.coveragePct).toBe(95);
    expect(out!.notes).toBe('ok');
  });
});
