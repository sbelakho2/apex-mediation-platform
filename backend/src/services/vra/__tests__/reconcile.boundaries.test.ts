import { reconcileWindow } from '../reconcile';

// Mock Postgres helpers — we will control the sequence of results
jest.mock('../../../utils/postgres', () => ({
  query: jest.fn(async () => ({ rows: [] })),
  insertMany: jest.fn(async () => {}),
}));

const { query } = jest.requireMock('../../../utils/postgres');

describe('VRA Reconcile — boundary conditions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VRA_UNDERPAY_TOL;
  });

  it('suppresses underpay when residual gap equals tolerance exactly', async () => {
    // Set tolerance to 5%
    process.env.VRA_UNDERPAY_TOL = '0.05';
    // expected = 100, paid = 95, unmatched = 0 => gap 5 equals tol 5 => no underpay
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ paid_usd: '95' }] })
      .mockResolvedValueOnce({ rows: [{ unmatched_usd: '0' }] })
      .mockResolvedValueOnce({ rows: [{ p95: '0.00' }] })
      .mockResolvedValueOnce({ rows: [{ rate: '0.00' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const out = await reconcileWindow({ from: '2025-11-15T00:00:00Z', to: '2025-11-16T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(0);
  });

  it('emits underpay when residual gap exceeds tolerance', async () => {
    process.env.VRA_UNDERPAY_TOL = '0.05';
    // expected=100, paid=94.9, unmatched=0 => gap=5.1 > tol 5 => underpay
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ expected_usd: '100' }] })
      .mockResolvedValueOnce({ rows: [{ paid_usd: '94.9' }] })
      .mockResolvedValueOnce({ rows: [{ unmatched_usd: '0' }] })
      .mockResolvedValueOnce({ rows: [{ p95: '0.00' }] })
      .mockResolvedValueOnce({ rows: [{ rate: '0.00' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const out = await reconcileWindow({ from: '2025-11-17T00:00:00Z', to: '2025-11-18T00:00:00Z', dryRun: true });
    expect(out.deltas).toBe(1);
  });
});
