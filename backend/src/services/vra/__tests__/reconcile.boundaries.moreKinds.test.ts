import { reconcileWindow } from '../reconcile';

// Mock ClickHouse helpers — control sequence for each test
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async () => []),
  insertBatch: jest.fn(async () => {}),
}));

const { executeQuery } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Reconcile — additional boundary kinds (ivt_outlier, timing_lag grace)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VRA_IVT_P95_BAND_PP;
  });

  describe('ivt_outlier thresholds', () => {
    it('suppresses when current equals p95 + band exactly (==)', async () => {
      process.env.VRA_IVT_P95_BAND_PP = '2'; // 2 percentage points
      // Ensure expected>0 and gap 0 so only IVT rule would apply
      (executeQuery as jest.Mock)
        // expected
        .mockResolvedValueOnce([{ expected_usd: '100' }])
        // paid
        .mockResolvedValueOnce([{ paid_usd: '100' }])
        // unmatched
        .mockResolvedValueOnce([{ unmatched_usd: '0' }])
        // IVT baseline p95
        .mockResolvedValueOnce([{ p95: '0.0500' }]) // 5%
        // IVT current equals p95 + band (0.05 + 0.02)
        .mockResolvedValueOnce([{ rate: '0.0700' }])
        // FX baseline empty → skip
        .mockResolvedValueOnce([])
        // Viewability empty/unused
        .mockResolvedValueOnce([]);

      const out = await reconcileWindow({ from: '2025-11-10T00:00:00Z', to: '2025-11-11T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(0);
    });

    it('emits when current exceeds p95 + band (>)', async () => {
      process.env.VRA_IVT_P95_BAND_PP = '2';
      (executeQuery as jest.Mock)
        .mockResolvedValueOnce([{ expected_usd: '120' }])
        .mockResolvedValueOnce([{ paid_usd: '120' }])
        .mockResolvedValueOnce([{ unmatched_usd: '0' }])
        .mockResolvedValueOnce([{ p95: '0.0500' }])
        // Slightly above threshold → 0.071 (7.1% > 7%)
        .mockResolvedValueOnce([{ rate: '0.0710' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const out = await reconcileWindow({ from: '2025-11-12T00:00:00Z', to: '2025-11-13T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(1);
    });

    it('skips when baseline is unavailable (no rows)', async () => {
      process.env.VRA_IVT_P95_BAND_PP = '2';
      (executeQuery as jest.Mock)
        .mockResolvedValueOnce([{ expected_usd: '80' }])
        .mockResolvedValueOnce([{ paid_usd: '80' }])
        .mockResolvedValueOnce([{ unmatched_usd: '0' }])
        // No baseline rows
        .mockResolvedValueOnce([])
        // current row (should be ignored since baseline missing)
        .mockResolvedValueOnce([{ rate: '0.50' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const out = await reconcileWindow({ from: '2025-11-14T00:00:00Z', to: '2025-11-15T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(0);
    });
  });

  describe('timing_lag classification (grace via unmatched only)', () => {
    it('emits timing_lag up to the total gap, with no underpay when gap fully explained by unmatched', async () => {
      // expected=100, paid=80, unmatched=20 -> gap=20, timingLag=20, residual=0 -> only 1 delta (timing_lag)
      (executeQuery as jest.Mock)
        .mockResolvedValueOnce([{ expected_usd: '100' }])
        .mockResolvedValueOnce([{ paid_usd: '80' }])
        .mockResolvedValueOnce([{ unmatched_usd: '20' }])
        // IVT baseline/current below threshold
        .mockResolvedValueOnce([{ p95: '0.00' }])
        .mockResolvedValueOnce([{ rate: '0.00' }])
        // FX baseline empty
        .mockResolvedValueOnce([])
        // Viewability empty
        .mockResolvedValueOnce([]);

      const out = await reconcileWindow({ from: '2025-11-16T00:00:00Z', to: '2025-11-17T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(1);
    });
  });
});
