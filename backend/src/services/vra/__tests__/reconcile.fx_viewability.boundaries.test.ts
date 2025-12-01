import { reconcileWindow } from '../reconcile';

jest.mock('../../../utils/postgres');

const { query } = jest.requireMock('../../../utils/postgres');
const mockQuery = query as jest.Mock;
const asRows = (rows: unknown[]) => ({ rows });

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
      mockQuery
        // expected
        .mockResolvedValueOnce(asRows([{ expected_usd: '100' }]))
        // paid
        .mockResolvedValueOnce(asRows([{ paid_usd: '100' }]))
        // unmatched
        .mockResolvedValueOnce(asRows([{ unmatched_usd: '0' }]))
        // IVT baseline/current — keep below threshold
        .mockResolvedValueOnce(asRows([{ p95: '0.00', cnt: '10' }]))
        .mockResolvedValueOnce(asRows([{ rate: '0.00' }]))
        // FX baseline (EUR) median
        .mockResolvedValueOnce(asRows([{ cur: 'EUR', med_rate: '1.1000' }]))
        // FX current avg rate with exactly +1% deviation → 1.111 = (1.1 * 1.01)
        .mockResolvedValueOnce(asRows([{ cur: 'EUR', avg_rate: '1.1110' }]))
        // Viewability — not used in this test but keep after sequence safe
        .mockResolvedValueOnce(asRows([]));

      const out = await reconcileWindow({ from: '2025-11-19T00:00:00Z', to: '2025-11-20T00:00:00Z', dryRun: true });
      // Only fx_mismatch candidate would apply, but equality uses strict >, so expect 0 deltas
      expect(out.deltas).toBe(0);
    });

    it('emits when deviation exceeds band (>)', async () => {
      process.env.VRA_FX_BAND_PCT = '1.0'; // 1%
      mockQuery
        .mockResolvedValueOnce(asRows([{ expected_usd: '200' }]))
        .mockResolvedValueOnce(asRows([{ paid_usd: '200' }]))
        .mockResolvedValueOnce(asRows([{ unmatched_usd: '0' }]))
        .mockResolvedValueOnce(asRows([{ p95: '0.00', cnt: '10' }]))
        .mockResolvedValueOnce(asRows([{ rate: '0.00' }]))
        .mockResolvedValueOnce(asRows([{ cur: 'EUR', med_rate: '1.1000' }]))
        // 1.1121 is ~+1.1% deviation → should exceed 1%
        .mockResolvedValueOnce(asRows([{ cur: 'EUR', avg_rate: '1.1121' }]))
        .mockResolvedValueOnce(asRows([]));

      const out = await reconcileWindow({ from: '2025-11-21T00:00:00Z', to: '2025-11-22T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(1);
    });

    it('does not emit when deviation is below band (<)', async () => {
      process.env.VRA_FX_BAND_PCT = '1.0'; // 1%
      mockQuery
        .mockResolvedValueOnce(asRows([{ expected_usd: '150' }]))
        .mockResolvedValueOnce(asRows([{ paid_usd: '150' }]))
        .mockResolvedValueOnce(asRows([{ unmatched_usd: '0' }]))
        .mockResolvedValueOnce(asRows([{ p95: '0.00', cnt: '10' }]))
        .mockResolvedValueOnce(asRows([{ rate: '0.00' }]))
        .mockResolvedValueOnce(asRows([{ cur: 'EUR', med_rate: '1.1000' }]))
        // 1.1099 is < +1% deviation
        .mockResolvedValueOnce(asRows([{ cur: 'EUR', avg_rate: '1.1099' }]))
        .mockResolvedValueOnce(asRows([]));

      const out = await reconcileWindow({ from: '2025-11-23T00:00:00Z', to: '2025-11-24T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(0);
    });
  });

  describe('viewability_gap thresholds', () => {
    it('suppresses when absolute gap equals threshold exactly', async () => {
      // Threshold 5 pp
      process.env.VRA_VIEWABILITY_GAP_PP = '5';
      mockQuery
        // expected / paid / unmatched
        .mockResolvedValueOnce(asRows([{ expected_usd: '100' }]))
        .mockResolvedValueOnce(asRows([{ paid_usd: '100' }]))
        .mockResolvedValueOnce(asRows([{ unmatched_usd: '0' }]))
        // IVT below
        .mockResolvedValueOnce(asRows([{ p95: '0.00', cnt: '10' }]))
        .mockResolvedValueOnce(asRows([{ rate: '0.00' }]))
        // FX baseline empty → skip FX rule
        .mockResolvedValueOnce(asRows([]))
        // (no fx current needed if baseline empty)
        // Viewability: om=0.80, stmt=0.75 → 5 pp exactly
        .mockResolvedValueOnce(asRows([{ om: '0.80', stmt: '0.75' }]));

      const out = await reconcileWindow({ from: '2025-11-25T00:00:00Z', to: '2025-11-26T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(0);
    });

    it('emits when absolute gap is greater than threshold', async () => {
      process.env.VRA_VIEWABILITY_GAP_PP = '5';
      mockQuery
        .mockResolvedValueOnce(asRows([{ expected_usd: '100' }]))
        .mockResolvedValueOnce(asRows([{ paid_usd: '100' }]))
        .mockResolvedValueOnce(asRows([{ unmatched_usd: '0' }]))
        .mockResolvedValueOnce(asRows([{ p95: '0.00', cnt: '10' }]))
        .mockResolvedValueOnce(asRows([{ rate: '0.00' }]))
        .mockResolvedValueOnce(asRows([]))
        // om=0.81, stmt=0.75 → 6 pp → emit
        .mockResolvedValueOnce(asRows([{ om: '0.81', stmt: '0.75' }]));

      const out = await reconcileWindow({ from: '2025-11-27T00:00:00Z', to: '2025-11-28T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(1);
    });
  });
});
