import { reconcileWindow } from '../reconcile';

// Mock ClickHouse helpers — control return sequences per test
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async () => []),
  insertBatch: jest.fn(async () => {}),
}));

const { executeQuery } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Reconcile — fx_mismatch and viewability_gap boundary conditions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VRA_FX_BAND_PCT;
    delete process.env.VRA_VIEWABILITY_GAP_PP;
  });

  describe('fx_mismatch band thresholds', () => {
    it('does not emit when deviation equals band (==)', async () => {
      process.env.VRA_FX_BAND_PCT = '1.0'; // 1%
      // expected > 0 to avoid early return; gap 0 to avoid underpay/timing_lag
      (executeQuery as jest.Mock)
        // expected
        .mockResolvedValueOnce([{ expected_usd: '100' }])
        // paid
        .mockResolvedValueOnce([{ paid_usd: '100' }])
        // unmatched
        .mockResolvedValueOnce([{ unmatched_usd: '0' }])
        // IVT baseline/current — keep below threshold
        .mockResolvedValueOnce([{ p95: '0.00' }])
        .mockResolvedValueOnce([{ rate: '0.00' }])
        // FX baseline (EUR) median
        .mockResolvedValueOnce([{ cur: 'EUR', med_rate: '1.1000' }])
        // FX current avg rate with exactly +1% deviation → 1.111 = (1.1 * 1.01)
        .mockResolvedValueOnce([{ cur: 'EUR', avg_rate: '1.1110' }])
        // Viewability — not used in this test but keep after sequence safe
        .mockResolvedValueOnce([]);

      const out = await reconcileWindow({ from: '2025-11-19T00:00:00Z', to: '2025-11-20T00:00:00Z', dryRun: true });
      // Only fx_mismatch candidate would apply, but equality uses strict >, so expect 0 deltas
      expect(out.deltas).toBe(0);
    });

    it('emits when deviation exceeds band (>)', async () => {
      process.env.VRA_FX_BAND_PCT = '1.0'; // 1%
      (executeQuery as jest.Mock)
        .mockResolvedValueOnce([{ expected_usd: '200' }])
        .mockResolvedValueOnce([{ paid_usd: '200' }])
        .mockResolvedValueOnce([{ unmatched_usd: '0' }])
        .mockResolvedValueOnce([{ p95: '0.00' }])
        .mockResolvedValueOnce([{ rate: '0.00' }])
        .mockResolvedValueOnce([{ cur: 'EUR', med_rate: '1.1000' }])
        // 1.1121 is ~+1.1% deviation → should exceed 1%
        .mockResolvedValueOnce([{ cur: 'EUR', avg_rate: '1.1121' }])
        .mockResolvedValueOnce([]);

      const out = await reconcileWindow({ from: '2025-11-21T00:00:00Z', to: '2025-11-22T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(1);
    });

    it('does not emit when deviation is below band (<)', async () => {
      process.env.VRA_FX_BAND_PCT = '1.0'; // 1%
      (executeQuery as jest.Mock)
        .mockResolvedValueOnce([{ expected_usd: '150' }])
        .mockResolvedValueOnce([{ paid_usd: '150' }])
        .mockResolvedValueOnce([{ unmatched_usd: '0' }])
        .mockResolvedValueOnce([{ p95: '0.00' }])
        .mockResolvedValueOnce([{ rate: '0.00' }])
        .mockResolvedValueOnce([{ cur: 'EUR', med_rate: '1.1000' }])
        // 1.1099 is < +1% deviation
        .mockResolvedValueOnce([{ cur: 'EUR', avg_rate: '1.1099' }])
        .mockResolvedValueOnce([]);

      const out = await reconcileWindow({ from: '2025-11-23T00:00:00Z', to: '2025-11-24T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(0);
    });
  });

  describe('viewability_gap thresholds', () => {
    it('suppresses when absolute gap equals threshold exactly', async () => {
      // Threshold 5 pp
      process.env.VRA_VIEWABILITY_GAP_PP = '5';
      (executeQuery as jest.Mock)
        // expected / paid / unmatched
        .mockResolvedValueOnce([{ expected_usd: '100' }])
        .mockResolvedValueOnce([{ paid_usd: '100' }])
        .mockResolvedValueOnce([{ unmatched_usd: '0' }])
        // IVT below
        .mockResolvedValueOnce([{ p95: '0.00' }])
        .mockResolvedValueOnce([{ rate: '0.00' }])
        // FX baseline empty → skip FX rule
        .mockResolvedValueOnce([])
        // (no fx current needed if baseline empty)
        // Viewability: om=0.80, stmt=0.75 → 5 pp exactly
        .mockResolvedValueOnce([{ om: '0.80', stmt: '0.75' }]);

      const out = await reconcileWindow({ from: '2025-11-25T00:00:00Z', to: '2025-11-26T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(0);
    });

    it('emits when absolute gap is greater than threshold', async () => {
      process.env.VRA_VIEWABILITY_GAP_PP = '5';
      (executeQuery as jest.Mock)
        .mockResolvedValueOnce([{ expected_usd: '100' }])
        .mockResolvedValueOnce([{ paid_usd: '100' }])
        .mockResolvedValueOnce([{ unmatched_usd: '0' }])
        .mockResolvedValueOnce([{ p95: '0.00' }])
        .mockResolvedValueOnce([{ rate: '0.00' }])
        .mockResolvedValueOnce([])
        // om=0.81, stmt=0.75 → 6 pp → emit
        .mockResolvedValueOnce([{ om: '0.81', stmt: '0.75' }]);

      const out = await reconcileWindow({ from: '2025-11-27T00:00:00Z', to: '2025-11-28T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(1);
    });
  });
});
