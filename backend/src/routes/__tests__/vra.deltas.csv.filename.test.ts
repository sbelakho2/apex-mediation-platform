import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

// Mock ClickHouse utils used by deltas
jest.mock('../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async (query: string) => {
    const q = String(query).toLowerCase();
    if (q.includes('select count()')) return [{ total: '0' }];
    return [];
  }),
}));

import vraRoutes from '../../routes/vra.routes';

describe('VRA Deltas CSV — filename content-disposition', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    app.use('/api/v1', vraRoutes);
  });

  it('includes from/to dates in suggested filename when provided', async () => {
    const from = '2025-11-01T00:00:00Z';
    const to = '2025-11-02T00:00:00Z';
    const res = await request(app)
      .get(`/api/v1/recon/deltas.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .expect(200);
    const cd = String(res.headers['content-disposition'] || '');
    expect(cd).toContain('recon_deltas_2025-11-01_to_2025-11-02_');
    expect(cd.endsWith('.csv"') || cd.endsWith('.csv')).toBe(true);
  });
});
