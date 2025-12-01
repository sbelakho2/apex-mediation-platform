import { reconcileWindow } from '../reconcile';

// Mock Postgres helpers used by Reconcile job
jest.mock('../../../utils/postgres', () => ({
  query: jest.fn(async () => ({ rows: [] })),
  insertMany: jest.fn(async () => {}),
}));

const { query, insertMany } = jest.requireMock('../../../utils/postgres');

describe('VRA Reconcile & Delta Classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no-op when expected sum is zero', async () => {
    // expected_usd = 0
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '0' }] });

    const out = await reconcileWindow({ from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z', dryRun: true });
    expect(out).toEqual({
      inserted: 0,
      deltas: 0,
      amounts: { expectedUsd: 0, paidUsd: 0, unmatchedUsd: 0, underpayUsd: 0, timingLagUsd: 0 },
    });
    expect(insertMany).not.toHaveBeenCalled();
  });

  it('emits timing_lag and underpay deltas with correct amounts (dry-run)', async () => {
    // expected_usd = 100
    // paid_usd = 60
    // unmatched_usd = 20 -> timing_lag = 20, residual underpay = 20 (> tol 2)
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ paid_usd: '60' }] })
      .mockResolvedValueOnce({ rows: [{ unmatched_usd: '20' }] });

    const out = await reconcileWindow({ from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(2);
    expect(out.inserted).toBe(0);
    expect(out.amounts).toMatchObject({ expectedUsd: 100, paidUsd: 60, unmatchedUsd: 20, timingLagUsd: 20, underpayUsd: 20 });
  });

  it('inserts recon_deltas rows when not in dry-run', async () => {
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '50' }] })
      .mockResolvedValueOnce({ rows: [{ paid_usd: '45' }] })
      .mockResolvedValueOnce({ rows: [{ unmatched_usd: '3' }] });

    const out = await reconcileWindow({ from: '2025-11-03T00:00:00Z', to: '2025-11-04T00:00:00Z' });
    expect(out.deltas).toBeGreaterThanOrEqual(1);
    // At least timing_lag should be present (min(3, 5) = 3); residual gap 2 -> underpay may or may not pass tol depending on env (default tol 2%) -> 50*0.02=1 => residual 2 >= tol -> expect two rows
    expect(out.inserted).toBe(out.deltas);
    expect(insertMany).toHaveBeenCalledWith(
      'recon_deltas',
      expect.any(Array),
      expect.any(Array),
      expect.any(Object)
    );
  });

  it('does not emit underpay when gap within tolerance', async () => {
    // expected 100, paid 99.5, unmatched 0 -> gap 0.5 < tol 2 -> no underpay
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ paid_usd: '99.5' }] })
      .mockResolvedValueOnce({ rows: [{ unmatched_usd: '0' }] });

    const out = await reconcileWindow({ from: '2025-11-05T00:00:00Z', to: '2025-11-06T00:00:00Z', dryRun: true });
    // deltas 0 because timing_lag 0 and underpay suppressed by tol
    expect(out.deltas).toBe(0);
  });

  it('emits ivt_outlier when current IVT exceeds 30d p95 + band', async () => {
    // Sequence of executeQuery calls inside reconcileWindow:
    // 1) expected_usd, 2) paid_usd, 3) unmatched_usd, 4) baseline p95, 5) current rate
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ paid_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ unmatched_usd: '0' }] })
      .mockResolvedValueOnce({ rows: [{ p95: '0.02', cnt: '15' }] })
      .mockResolvedValueOnce({ rows: [{ rate: '0.05' }] });

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
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ paid_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ unmatched_usd: '0' }] })
      .mockResolvedValueOnce({ rows: [{ p95: '0.02', cnt: '15' }] })
      .mockResolvedValueOnce({ rows: [{ rate: '0.02' }] })
      .mockResolvedValueOnce({ rows: [{ cur: 'EUR', med_rate: '1.000000' }] })
      .mockResolvedValueOnce({ rows: [{ cur: 'EUR', avg_rate: '1.010000' }] })
      .mockResolvedValueOnce({ rows: [] });

    const out = await reconcileWindow({ from: '2025-11-09T00:00:00Z', to: '2025-11-10T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(1);
    expect(out.inserted).toBe(0);
    expect(out.amounts).toMatchObject({ expectedUsd: 100, paidUsd: 100, unmatchedUsd: 0 });
  });

  it('does not emit fx_mismatch when deviation is within or equal to band', async () => {
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ paid_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ unmatched_usd: '0' }] })
      .mockResolvedValueOnce({ rows: [{ p95: '0.02', cnt: '15' }] })
      .mockResolvedValueOnce({ rows: [{ rate: '0.02' }] })
      .mockResolvedValueOnce({ rows: [{ cur: 'EUR', med_rate: '1.000000' }] })
      .mockResolvedValueOnce({ rows: [{ cur: 'EUR', avg_rate: '1.005000' }] })
      .mockResolvedValueOnce({ rows: [] });

    const out = await reconcileWindow({ from: '2025-11-10T00:00:00Z', to: '2025-11-11T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(0);
  });

  it('emits viewability_gap when |OMSDK - statement| exceeds threshold', async () => {
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ paid_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ unmatched_usd: '0' }] })
      .mockResolvedValueOnce({ rows: [{ p95: '0.00', cnt: '15' }] })
      .mockResolvedValueOnce({ rows: [{ rate: '0.00' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ om: '0.40', stmt: '0.60' }] });

    const out = await reconcileWindow({ from: '2025-11-11T00:00:00Z', to: '2025-11-12T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(1);
    expect(out.inserted).toBe(0);
  });

  it('does not emit viewability_gap when gap equals threshold', async () => {
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ paid_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ unmatched_usd: '0' }] })
      .mockResolvedValueOnce({ rows: [{ p95: '0.00', cnt: '15' }] })
      .mockResolvedValueOnce({ rows: [{ rate: '0.00' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ om: '0.575', stmt: '0.425' }] });

    const out = await reconcileWindow({ from: '2025-11-12T00:00:00Z', to: '2025-11-13T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(0);
  });
});
