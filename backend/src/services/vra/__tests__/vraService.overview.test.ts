import { vraService } from '../vraService';

// Mock ClickHouse helper
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async (_query: string, _params?: Record<string, unknown>) => {
    // Return one synthetic row for overview
    return [
      {
        network: 'unity',
        format: 'interstitial',
        country: 'US',
        impressions: '100',
        paid: '12.34',
      },
    ];
  }),
}));

const { executeQuery } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Service — getOverview basics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls ClickHouse with between timestamps and maps totals', async () => {
    const from = '2025-11-01T00:00:00Z';
    const to = '2025-11-02T00:00:00Z';
    const out = await vraService.getOverview({ from, to });
    expect(out).toHaveProperty('totals');
    expect(out.totals.paid).toBeGreaterThan(0);
    // Conservative defaults until recon_expected is populated
    expect(out.variancePercent).toBe(0);
    expect(out.coveragePercent).toBeGreaterThanOrEqual(0);
    // Verify query received params and contains parseDateTime usage
    const call = (executeQuery as jest.Mock).mock.calls[0];
    const q: string = call[0];
    const params: Record<string, unknown> = call[1] || {};
    expect(q).toContain('parseDateTimeBestEffortOrZero');
    expect(params.from).toBe(from);
    expect(params.to).toBe(to);
  });

  it('includes per-network slices sorted by paid desc', async () => {
    // Adjust mock to return two networks
    const { executeQuery } = jest.requireMock('../../../utils/clickhouse');
    (executeQuery as jest.Mock).mockResolvedValueOnce([
      { network: 'unity', format: 'video', country: 'US', impressions: '50', paid: '20.00' },
      { network: 'admob', format: 'banner', country: 'US', impressions: '100', paid: '10.00' },
    ]);
    const out = await vraService.getOverview({ from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z' });
    expect(Array.isArray(out.byNetwork)).toBe(true);
    expect(out.byNetwork!.length).toBe(2);
    // Sorted by paid desc: unity first
    expect(out.byNetwork![0].network).toBe('unity');
    expect(out.byNetwork![0].paid).toBeCloseTo(20.0, 5);
    expect(out.byNetwork![1].network).toBe('admob');
  });
});
