import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

// Mock CH client usage in executeQuery/insertBatch
jest.mock('../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async (query: string) => {
    const q = String(query).toLowerCase();
    if (q.includes('select count()')) {
      return [{ total: '1' }];
    }
    return [];
  }),
  insertBatch: jest.fn(async () => {}),
}));

import vraRoutes from '../../routes/vra.routes';

describe('VRA CSV redaction/escaping — Unicode and emoji stability', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    delete process.env.VRA_ENABLED;
    delete process.env.VRA_SHADOW_ONLY;
    app.use('/api/v1', vraRoutes);
  });

  it('preserves Unicode/emoji while removing commas/newlines and escaping quotes in reason_code', async () => {
    process.env.VRA_ENABLED = 'true';
    const { executeQuery } = jest.requireMock('../../utils/clickhouse');

    // First call: count
    (executeQuery as jest.Mock).mockImplementationOnce(async () => [{ total: '1' }]);

    // Second call: list with unicode + emoji + quotes + comma + newline + tab
    const unicodeReason = 'Δelta reason — revenue “mismatch”, line1\nline2\t🙂 "quoted"';
    (executeQuery as jest.Mock).mockImplementationOnce(async () => ([{
      kind: 'underpay',
      amount: '3.141593',
      currency: 'USD',
      reason_code: unicodeReason,
      window_start: '2025-11-01 00:00:00',
      window_end: '2025-11-02 00:00:00',
      evidence_id: 'ev-unicode',
      confidence: '0.88',
    }]));

    const res = await request(app).get('/api/v1/recon/deltas.csv').expect(200);
    const lines = (res.text || '').split('\n');
    expect(lines[0]).toBe('kind,amount,currency,reason_code,window_start,window_end,evidence_id,confidence');
    const row = lines[1] || '';

    // No raw newlines in the row and 8 fields
    expect(row).not.toMatch(/\n/);
    expect(row.split(',')).toHaveLength(8);

    // Quotes around the word should be doubled: "quoted" => ""quoted""
    expect(row).toContain('""quoted""');

    // Commas in reason should have been stripped/replaced with spaces, so there should be exactly 8 CSV columns
    const fields = row.split(',');
    expect(fields).toHaveLength(8);

    const reasonField = fields[3];
    // Should contain the emoji and unicode characters intact
    expect(reasonField).toContain('🙂');
    expect(reasonField).toMatch(/Δelta reason/);
    // Should not contain a literal comma or tab or raw newline
    expect(reasonField).not.toContain(',');
    expect(reasonField).not.toContain('\t');
  });
});
