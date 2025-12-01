import { reconcileWindow } from '../reconcile';

jest.mock('../../../utils/postgres');

const { query } = jest.requireMock('../../../utils/postgres');
const mockQuery = query as jest.Mock;
const asRows = (rows: unknown[]) => ({ rows });

describe('VRA Reconcile — additional boundary kinds (ivt_outlier, timing_lag grace)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VRA_IVT_P95_BAND_PP;
  });

  describe('ivt_outlier thresholds', () => {
    it('suppresses when current equals p95 + band exactly (==)', async () => {
      process.env.VRA_IVT_P95_BAND_PP = '2'; // 2 percentage points
      // Ensure expected>0 and gap 0 so only IVT rule would apply
      mockQuery
        // expected
        .mockResolvedValueOnce(asRows([{ expected_usd: '100' }]))
        // paid
        .mockResolvedValueOnce(asRows([{ paid_usd: '100' }]))
        // unmatched
        .mockResolvedValueOnce(asRows([{ unmatched_usd: '0' }]))
        // IVT baseline p95
        .mockResolvedValueOnce(asRows([{ p95: '0.0500', cnt: '30' }])) // 5%
        // IVT current equals p95 + band (0.05 + 0.02)
        .mockResolvedValueOnce(asRows([{ rate: '0.0700' }]))
        // FX baseline empty → skip
        .mockResolvedValueOnce(asRows([]))
        // Viewability empty/unused
        .mockResolvedValueOnce(asRows([]));

      const out = await reconcileWindow({ from: '2025-11-10T00:00:00Z', to: '2025-11-11T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(0);
    });

    it('emits when current exceeds p95 + band (>)', async () => {
      process.env.VRA_IVT_P95_BAND_PP = '2';
      mockQuery
        .mockResolvedValueOnce(asRows([{ expected_usd: '120' }]))
        .mockResolvedValueOnce(asRows([{ paid_usd: '120' }]))
        .mockResolvedValueOnce(asRows([{ unmatched_usd: '0' }]))
        .mockResolvedValueOnce(asRows([{ p95: '0.0500', cnt: '30' }]))
        // Slightly above threshold → 0.071 (7.1% > 7%)
        .mockResolvedValueOnce(asRows([{ rate: '0.0710' }]))
        .mockResolvedValueOnce(asRows([]))
        .mockResolvedValueOnce(asRows([]));

      const out = await reconcileWindow({ from: '2025-11-12T00:00:00Z', to: '2025-11-13T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(1);
    });

    it('skips when baseline is unavailable (no rows)', async () => {
      process.env.VRA_IVT_P95_BAND_PP = '2';
      mockQuery
        .mockResolvedValueOnce(asRows([{ expected_usd: '80' }]))
        .mockResolvedValueOnce(asRows([{ paid_usd: '80' }]))
        .mockResolvedValueOnce(asRows([{ unmatched_usd: '0' }]))
        // No baseline rows
        .mockResolvedValueOnce(asRows([]))
        .mockResolvedValueOnce(asRows([]))
        .mockResolvedValueOnce(asRows([]));

      const out = await reconcileWindow({ from: '2025-11-14T00:00:00Z', to: '2025-11-15T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(0);
    });
  });

  describe('timing_lag classification (grace via unmatched only)', () => {
    it('emits timing_lag up to the total gap, with no underpay when gap fully explained by unmatched', async () => {
      // expected=100, paid=80, unmatched=20 -> gap=20, timingLag=20, residual=0 -> only 1 delta (timing_lag)
      mockQuery
        .mockResolvedValueOnce(asRows([{ expected_usd: '100' }]))
        .mockResolvedValueOnce(asRows([{ paid_usd: '80' }]))
        .mockResolvedValueOnce(asRows([{ unmatched_usd: '20' }]))
        // IVT baseline/current below threshold
        .mockResolvedValueOnce(asRows([{ p95: '0.00', cnt: '30' }]))
        .mockResolvedValueOnce(asRows([{ rate: '0.00' }]))
        // FX baseline empty
        .mockResolvedValueOnce(asRows([]))
        // Viewability empty
        .mockResolvedValueOnce(asRows([]));

      const out = await reconcileWindow({ from: '2025-11-16T00:00:00Z', to: '2025-11-17T00:00:00Z', dryRun: true });
      expect(out.deltas).toBe(1);
    });
  });
});
