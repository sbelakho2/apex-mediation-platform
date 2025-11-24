import { reconcileWindow } from '../reconcile';

// Mock ClickHouse helpers — we will control the sequence of results
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async () => []),
  insertBatch: jest.fn(async () => {}),
}));

const { executeQuery } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Reconcile — boundary conditions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VRA_UNDERPAY_TOL;
  });

  it('suppresses underpay when residual gap equals tolerance exactly', async () => {
    // Set tolerance to 5%
    process.env.VRA_UNDERPAY_TOL = '0.05';
    // expected = 100, paid = 95, unmatched = 0 => gap 5 equals tol 5 => no underpay
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }])
      .mockResolvedValueOnce([{ paid_usd: '95' }])
      .mockResolvedValueOnce([{ unmatched_usd: '0' }])
      // IVT baseline/current — return zeros to avoid adding an ivt row
      .mockResolvedValueOnce([{ p95: '0.00' }])
      .mockResolvedValueOnce([{ rate: '0.00' }])
      // FX baseline empty
      .mockResolvedValueOnce([])
      // Viewability empty
      .mockResolvedValueOnce([]);

    const out = await reconcileWindow({ from: '2025-11-15T00:00:00Z', to: '2025-11-16T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(0);
  });

  it('emits underpay when residual gap exceeds tolerance', async () => {
    process.env.VRA_UNDERPAY_TOL = '0.05';
    // expected=100, paid=94.9, unmatched=0 => gap=5.1 > tol 5 => underpay
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }])
      .mockResolvedValueOnce([{ paid_usd: '94.9' }])
      .mockResolvedValueOnce([{ unmatched_usd: '0' }])
      .mockResolvedValueOnce([{ p95: '0.00' }])
      .mockResolvedValueOnce([{ rate: '0.00' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const out = await reconcileWindow({ from: '2025-11-17T00:00:00Z', to: '2025-11-18T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(1);
  });
});
