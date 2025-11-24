import { reconcileWindow } from '../reconcile';

// Mock ClickHouse helpers
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async () => [{ expected_usd: '100' }]),
  insertBatch: jest.fn(async () => {}),
}));

const { executeQuery, insertBatch } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Reconcile — RO posture (dry-run vs write)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not insert into recon_deltas in dry-run mode', async () => {
    // Sequence of queries inside reconcileWindow:
    // 1) expected_usd, 2) paid_usd, 3) unmatched_usd, then optional rule queries
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }])
      .mockResolvedValueOnce([{ paid_usd: '90' }])
      .mockResolvedValueOnce([{ unmatched_usd: '5' }]);

    const out = await reconcileWindow({ from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z', dryRun: true });
    expect(out.inserted).toBe(0);
    expect(insertBatch).not.toHaveBeenCalled();
  });

  it('attempts to insert into recon_deltas when not in dry-run', async () => {
    (executeQuery as jest.Mock)
      .mockResolvedValueOnce([{ expected_usd: '100' }])
      .mockResolvedValueOnce([{ paid_usd: '90' }])
      .mockResolvedValueOnce([{ unmatched_usd: '5' }]);

    const out = await reconcileWindow({ from: '2025-11-03T00:00:00Z', to: '2025-11-04T00:00:00Z' });
    expect(out.deltas).toBeGreaterThanOrEqual(1);
    expect(insertBatch).toHaveBeenCalledWith('recon_deltas', expect.any(Array));
  });
});
