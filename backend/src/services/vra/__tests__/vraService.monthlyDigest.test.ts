import { vraService } from '../vraService';

// Mock Postgres helper
jest.mock('../../../utils/postgres', () => ({
  query: jest.fn(async () => ({ rows: [] })),
}));

const { query } = jest.requireMock('../../../utils/postgres');

describe('VRA Service — getMonthlyDigest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no digest row present', async () => {
    (query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const out = await vraService.getMonthlyDigest('2025-11');
    expect(out).toBeNull();
  });

  it('maps digest row fields correctly', async () => {
    (query as jest.Mock).mockResolvedValueOnce({ rows: [
      { month: '2025-11', digest: 'deadbeef', sig: 'cafebabe', coverage_pct: '95.0', notes: 'ok' },
    ] });
    const out = await vraService.getMonthlyDigest('2025-11');
    expect(out).not.toBeNull();
    expect(out!.month).toBe('2025-11');
    expect(out!.digest).toBe('deadbeef');
    expect(out!.signature).toBe('cafebabe');
    expect(out!.coveragePct).toBe(95);
    expect(out!.notes).toBe('ok');
  });
});
