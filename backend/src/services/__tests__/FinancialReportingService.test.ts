import { Pool } from 'pg';
import { jest } from '@jest/globals';
import logger from '../../utils/logger';
import { FinancialReportingService } from '../FinancialReportingService';

// Build a mock pool that returns two pages, then empty
const makePagedPool = () => {
  const page1 = [{ email: 'alice@example.com', company_name: 'Alice Co', year: 2025, month: 1, total_revenue_eur: 10, total_vat_eur: 2, transaction_count: 1, avg_transaction_eur: 10 }];
  const page2 = [{ email: 'bob@example.com', company_name: 'Bob Co', year: 2025, month: 2, total_revenue_eur: 20, total_vat_eur: 4, transaction_count: 2, avg_transaction_eur: 10 }];
  const calls: any[] = [];
  const pool = {
    query: jest.fn(async (_sql: string, _args: any[]) => {
      calls.push(_args);
      const offset = _args[2];
      if (offset === 0) return { rows: page1 } as any;
      if (offset === 5000) return { rows: page2 } as any;
      return { rows: [] } as any;
    }),
  } as unknown as Pool;
  return { pool, calls };
};

describe('FinancialReportingService — paging & PII masking', () => {
  it('pages customer revenue export and logs counts only (no raw emails)', async () => {
    const { pool } = makePagedPool();
    const svc = new FinancialReportingService(pool);

    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger as any);
    const buf = await svc.exportCustomerRevenue(2025);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(0);

    const calls = spy.mock.calls.map(args => JSON.stringify(args[1] || {}));
    // Ensure we never log raw emails in info logs
    for (const c of calls) {
      expect(c.includes('alice@example.com')).toBe(false);
      expect(c.includes('bob@example.com')).toBe(false);
    }
    spy.mockRestore();
  });

  it('handles query errors gracefully (surface error, do not crash)', async () => {
    const pool = {
      query: jest.fn(async () => { throw new Error('CH error'); }),
    } as unknown as Pool;
    const svc = new FinancialReportingService(pool);
    await expect(svc.exportCustomerRevenue(2025)).rejects.toThrow('CH error');
  });
});
