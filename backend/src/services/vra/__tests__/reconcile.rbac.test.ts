import { reconcileWindow } from '../reconcile';

jest.mock('../../../utils/postgres');

const { query, insertMany } = jest.requireMock('../../../utils/postgres');
const mockQuery = query as jest.Mock;
const mockInsertMany = insertMany as jest.Mock;
const asRows = (rows: unknown[]) => ({ rows });

describe('VRA Reconcile — RO posture (dry-run vs write)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not insert into recon_deltas in dry-run mode', async () => {
    mockQuery
      .mockResolvedValueOnce(asRows([{ expected_usd: '100' }]))
      .mockResolvedValueOnce(asRows([{ paid_usd: '90' }]))
      .mockResolvedValueOnce(asRows([{ unmatched_usd: '5' }]))
      // IVT baseline empty (skip rule)
      .mockResolvedValueOnce(asRows([]))
      // FX baseline empty (skip rule)
      .mockResolvedValueOnce(asRows([]))
      // Viewability rows empty
      .mockResolvedValueOnce(asRows([]));

    const out = await reconcileWindow({ from: '2025-11-01T00:00:00Z', to: '2025-11-02T00:00:00Z', dryRun: true });
    expect(out.inserted).toBe(0);
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  it('attempts to insert into recon_deltas when not in dry-run', async () => {
    mockQuery
      .mockResolvedValueOnce(asRows([{ expected_usd: '100' }]))
      .mockResolvedValueOnce(asRows([{ paid_usd: '80' }]))
      .mockResolvedValueOnce(asRows([{ unmatched_usd: '20' }]))
      .mockResolvedValueOnce(asRows([]))
      .mockResolvedValueOnce(asRows([]))
      .mockResolvedValueOnce(asRows([]));

    const out = await reconcileWindow({ from: '2025-11-03T00:00:00Z', to: '2025-11-04T00:00:00Z' });
    expect(out.deltas).toBeGreaterThanOrEqual(1);
    expect(mockInsertMany).toHaveBeenCalledWith(
      'recon_deltas',
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({ onConflictColumns: expect.any(Array), ignoreConflicts: true })
    );
  });
});
