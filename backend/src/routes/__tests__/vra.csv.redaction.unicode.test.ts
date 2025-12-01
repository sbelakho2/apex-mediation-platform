import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

jest.mock('../../services/vra/vraService');

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
    const { vraService } = jest.requireMock('../../services/vra/vraService');

    const unicodeReason = 'Δelta reason — revenue “mismatch”, line1\nline2\t🙂 "quoted"';
    (vraService.getDeltas as jest.Mock).mockResolvedValueOnce({
      items: [
        {
          kind: 'underpay',
          amount: 3.141593,
          currency: 'USD',
          reasonCode: unicodeReason,
          windowStart: '2025-11-01 00:00:00',
          windowEnd: '2025-11-02 00:00:00',
          evidenceId: 'ev-unicode',
          confidence: 0.88,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    });

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
