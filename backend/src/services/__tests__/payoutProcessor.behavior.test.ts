import { paymentProcessor } from '../payoutProcessor';

// Mock the DB client used for atomic transactions
const client = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock('../../utils/postgres', () => ({
  getClient: jest.fn(async () => client),
  query: jest.fn(),
}));

describe('PaymentProcessor behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rate limiting caps at 5 payouts per minute per publisher', async () => {
    // Make DB succeed fast
    (client.query as jest.Mock).mockImplementation(async (sql: string) => {
      if (/SELECT SUM\(/i.test(sql)) {
        return { rows: [{ balance: 0 }] };
      }
      return { rows: [] };
    });

    const baseReq = {
      publisherId: 'pub-rate-1',
      payoutId: 'p1',
      amount: 100,
      currency: 'USD',
      method: 'wire',
    };

    const results = [] as Array<{ success: boolean; error?: string }>;
    for (let i = 0; i < 6; i++) {
      const r = await paymentProcessor.processPayout({ ...baseReq, payoutId: `p-${i}` });
      results.push({ success: r.success, error: r.error });
    }

    const successes = results.filter(r => r.success).length;
    const rateLimited = results.find(r => r.error?.includes('Rate limited'));
    expect(successes).toBe(5);
    expect(rateLimited).toBeTruthy();
  });

  test('wraps ledger + payout status in a single transaction and rolls back on failure', async () => {
    const calls: string[] = [];
    // First insert ok, second insert throws to trigger ROLLBACK
    (client.query as jest.Mock).mockImplementation(async (sql: string) => {
      calls.push(sql);
      if (sql === 'BEGIN') return;
      if (/INSERT INTO payout_ledger(.+)'debit'/.test(sql)) return { rows: [] };
      if (/INSERT INTO payout_ledger(.+)'credit'/.test(sql)) {
        throw new Error('Simulated insert error');
      }
      if (/ROLLBACK/.test(sql)) return;
      if (/COMMIT/.test(sql)) return;
      if (/SELECT SUM\(/i.test(sql)) return { rows: [{ balance: 0 }] };
      return { rows: [] };
    });

    const result = await paymentProcessor.processPayout({
      publisherId: 'pub-atomic-1',
      payoutId: 'atomic-1',
      amount: 50,
      currency: 'USD',
      method: 'wire',
    });

    // Because of failure, processor should try next provider or eventually fail (retryable)
    expect(result.success).toBe(false);
    // Ensure rollback happened
    expect((client.query as jest.Mock).mock.calls.map(c => c[0]).some((sql: string) => sql === 'ROLLBACK')).toBe(true);
  });
});
