import { reconcileWindow } from '../reconcile';

// Mock ClickHouse helpers used by Reconcile job
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async (_q: string, _p?: Record<string, unknown>) => []),
  insertBatch: jest.fn(async (_table: string, _rows: unknown[]) => {}),
}));

const { executeQuery, insertBatch } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Reconcile & Delta Classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no-op when expected sum is zero', async () => {
    // expected_usd = 0
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '0' }]);

    const out = await reconcileWindow({ from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z', dryRun: true });
    expect(out).toEqual({
      inserted: 0,
      deltas: 0,
      amounts: { expectedUsd: 0, paidUsd: 0, unmatchedUsd: 0, underpayUsd: 0, timingLagUsd: 0 },
    });
    expect(insertBatch).not.toHaveBeenCalled();
  });

  it('emits timing_lag and underpay deltas with correct amounts (dry-run)', async () => {
    // expected_usd = 100
    // paid_usd = 60
    // unmatched_usd = 20 -> timing_lag = 20, residual underpay = 20 (> tol 2)
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }])
      .mockResolvedValueOnce([{ paid_usd: '60' }])
      .mockResolvedValueOnce([{ unmatched_usd: '20' }]);

    const out = await reconcileWindow({ from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(2);
    expect(out.inserted).toBe(0);
    expect(out.amounts).toMatchObject({ expectedUsd: 100, paidUsd: 60, unmatchedUsd: 20, timingLagUsd: 20, underpayUsd: 20 });
  });

  it('inserts recon_deltas rows when not in dry-run', async () => {
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '50' }])
      .mockResolvedValueOnce([{ paid_usd: '45' }])
      .mockResolvedValueOnce([{ unmatched_usd: '3' }]);

    const out = await reconcileWindow({ from: '2025-11-03T00:00:00Z', to: '2025-11-04T00:00:00Z' });
    expect(out.deltas).toBeGreaterThanOrEqual(1);
    // At least timing_lag should be present (min(3, 5) = 3); residual gap 2 -> underpay may or may not pass tol depending on env (default tol 2%) -> 50*0.02=1 => residual 2 >= tol -> expect two rows
    expect(out.inserted).toBe(out.deltas);
    expect(insertBatch).toHaveBeenCalledWith('recon_deltas', expect.any(Array));
  });

  it('does not emit underpay when gap within tolerance', async () => {
    // expected 100, paid 99.5, unmatched 0 -> gap 0.5 < tol 2 -> no underpay
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }])
      .mockResolvedValueOnce([{ paid_usd: '99.5' }])
      .mockResolvedValueOnce([{ unmatched_usd: '0' }]);

    const out = await reconcileWindow({ from: '2025-11-05T00:00:00Z', to: '2025-11-06T00:00:00Z', dryRun: true });
    // deltas 0 because timing_lag 0 and underpay suppressed by tol
    expect(out.deltas).toBe(0);
  });

  it('emits ivt_outlier when current IVT exceeds 30d p95 + band', async () => {
    // Sequence of executeQuery calls inside reconcileWindow:
    // 1) expected_usd, 2) paid_usd, 3) unmatched_usd, 4) baseline p95, 5) current rate
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }]) // expected
      .mockResolvedValueOnce([{ paid_usd: '100' }])     // paid
      .mockResolvedValueOnce([{ unmatched_usd: '0' }])  // unmatched
      .mockResolvedValueOnce([{ p95: '0.02' }])         // baseline p95 (2%)
      .mockResolvedValueOnce([{ rate: '0.05' }]);       // current rate (5%) > 2% + 2% band -> outlier

    const out = await reconcileWindow({ from: '2025-11-07T00:00:00Z', to: '2025-11-08T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(1);
    expect(out.inserted).toBe(0);
    // No monetary amounts change in summary from ivt rule; verify amounts tracked
    expect(out.amounts).toMatchObject({ expectedUsd: 100, paidUsd: 100, unmatchedUsd: 0 });
  });

  it('emits fx_mismatch when current avg rate deviates beyond band vs 30d median', async () => {
    // Call sequence inside reconcileWindow:
    // 1) expected_usd, 2) paid_usd, 3) unmatched_usd, 4) ivt baseline p95, 5) ivt current,
    // 6) fx baseline medians, 7) fx current avg, 8) viewability (optional)
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }]) // expected
      .mockResolvedValueOnce([{ paid_usd: '100' }])     // paid
      .mockResolvedValueOnce([{ unmatched_usd: '0' }])  // unmatched
      .mockResolvedValueOnce([{ p95: '0.02' }])         // ivt baseline
      .mockResolvedValueOnce([{ rate: '0.02' }])        // ivt current (no outlier)
      .mockResolvedValueOnce([{ cur: 'EUR', med_rate: '1.000000' }]) // fx baseline
      .mockResolvedValueOnce([{ cur: 'EUR', avg_rate: '1.010000' }]) // fx current (+1% > 0.5% band)
      .mockResolvedValueOnce([]); // viewability rows (skip)

    const out = await reconcileWindow({ from: '2025-11-09T00:00:00Z', to: '2025-11-10T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(1);
    expect(out.inserted).toBe(0);
    expect(out.amounts).toMatchObject({ expectedUsd: 100, paidUsd: 100, unmatchedUsd: 0 });
  });

  it('does not emit fx_mismatch when deviation is within or equal to band', async () => {
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }])
      .mockResolvedValueOnce([{ paid_usd: '100' }])
      .mockResolvedValueOnce([{ unmatched_usd: '0' }])
      .mockResolvedValueOnce([{ p95: '0.02' }])
      .mockResolvedValueOnce([{ rate: '0.02' }])
      .mockResolvedValueOnce([{ cur: 'EUR', med_rate: '1.000000' }])
      // exactly 0.5% deviation (band default is 0.5%) → should NOT emit
      .mockResolvedValueOnce([{ cur: 'EUR', avg_rate: '1.005000' }])
      .mockResolvedValueOnce([]);

    const out = await reconcileWindow({ from: '2025-11-10T00:00:00Z', to: '2025-11-11T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(0);
  });

  it('emits viewability_gap when |OMSDK - statement| exceeds threshold', async () => {
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }])
      .mockResolvedValueOnce([{ paid_usd: '100' }])
      .mockResolvedValueOnce([{ unmatched_usd: '0' }])
      // IVT section (no outlier)
      .mockResolvedValueOnce([{ p95: '0.00' }])
      .mockResolvedValueOnce([{ rate: '0.00' }])
      // FX section: skip by returning empty baseline map
      .mockResolvedValueOnce([])
      // When baseline is empty, current is not queried; we need to maintain sequence length for our mocks,
      // so we proceed directly to viewability rows.
      // Viewability: om=0.40, stmt=0.60 → gap 0.20 > 0.15 threshold (default)
      .mockResolvedValueOnce([{ om: '0.40', stmt: '0.60' }]);

    const out = await reconcileWindow({ from: '2025-11-11T00:00:00Z', to: '2025-11-12T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(1);
    expect(out.inserted).toBe(0);
  });

  it('does not emit viewability_gap when gap equals threshold', async () => {
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }])
      .mockResolvedValueOnce([{ paid_usd: '100' }])
      .mockResolvedValueOnce([{ unmatched_usd: '0' }])
      .mockResolvedValueOnce([{ p95: '0.00' }])
      .mockResolvedValueOnce([{ rate: '0.00' }])
      .mockResolvedValueOnce([])
      // Exactly 0.15 gap (threshold): om=0.575, stmt=0.425
      .mockResolvedValueOnce([{ om: '0.575', stmt: '0.425' }]);

    const out = await reconcileWindow({ from: '2025-11-12T00:00:00Z', to: '2025-11-13T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(0);
  });
});
