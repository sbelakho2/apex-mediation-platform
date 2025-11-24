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
      return [{ total: '3' }];
    }
    // Return 3 rows with mixed PII-like patterns in reason_code
    return [
      {
        kind: 'underpay',
        amount: '1.000000',
        currency: 'USD',
        reason_code: 'email: test.user@example.com',
        window_start: '2025-11-01 00:00:00',
        window_end: '2025-11-02 00:00:00',
        evidence_id: 'ev-a',
        confidence: '0.90',
      },
      {
        kind: 'fx_mismatch',
        amount: '0.000000',
        currency: 'USD',
        reason_code: 'token Bearer abc.def.ghi',
        window_start: '2025-11-01 00:00:00',
        window_end: '2025-11-02 00:00:00',
        evidence_id: 'ev-b',
        confidence: '0.60',
      },
      {
        kind: 'timing_lag',
        amount: '0.000000',
        currency: 'USD',
        reason_code: 'digits 4242424242424242 inside',
        window_start: '2025-11-01 00:00:00',
        window_end: '2025-11-02 00:00:00',
        evidence_id: 'ev-c',
        confidence: '0.50',
      },
    ];
  }),
  insertBatch: jest.fn(async () => {}),
}));

import vraRoutes from '../../routes/vra.routes';

describe('VRA Routes — CSV redaction E2E', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    app.use('/api/v1', vraRoutes);
  });

  it('CSV response redacts emails, bearer tokens, and long numerics', async () => {
    const res = await request(app)
      .get('/api/v1/recon/deltas.csv?from=2025-11-01T00:00:00Z&to=2025-11-02T00:00:00Z&page=1&page_size=500')
      .expect(200);

    const csv = res.text || '';
    // Email redacted
    expect(csv).toContain('[REDACTED_EMAIL]');
    expect(csv).not.toContain('test.user@example.com');
    // Bearer redacted
    expect(csv).toContain('Bearer [REDACTED]');
    expect(csv).not.toContain('abc.def.ghi');
    // Long numerics redacted
    expect(csv).toContain('[REDACTED_NUMERIC]');
    expect(csv).not.toContain('4242424242424242');
  });
});
