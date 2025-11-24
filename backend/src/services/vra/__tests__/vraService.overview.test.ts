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
});
