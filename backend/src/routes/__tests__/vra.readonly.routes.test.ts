import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

// Mock ClickHouse helpers
jest.mock('../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async () => []),
  insertBatch: jest.fn(async () => {}),
}));

import vraRoutes from '../../routes/vra.routes';

describe('VRA routes — read-only GET endpoints perform no writes', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    app.use('/api/v1', vraRoutes);
  });

  it('GET /recon/overview does not call insertBatch', async () => {
    const { insertBatch } = jest.requireMock('../../utils/clickhouse');
    await request(app).get('/api/v1/recon/overview').expect(200);
    expect(insertBatch).not.toHaveBeenCalled();
  });

  it('GET /recon/deltas does not call insertBatch', async () => {
    const { insertBatch } = jest.requireMock('../../utils/clickhouse');
    await request(app).get('/api/v1/recon/deltas').expect(200);
    expect(insertBatch).not.toHaveBeenCalled();
  });

  it('GET /recon/deltas.csv does not call insertBatch', async () => {
    const { insertBatch } = jest.requireMock('../../utils/clickhouse');
    await request(app).get('/api/v1/recon/deltas.csv').expect(200);
    expect(insertBatch).not.toHaveBeenCalled();
  });

  it('GET /proofs/revenue_digest does not call insertBatch', async () => {
    const { insertBatch } = jest.requireMock('../../utils/clickhouse');
    const { executeQuery } = jest.requireMock('../../utils/clickhouse');
    // Return a digest so endpoint returns 200
    (executeQuery as jest.Mock).mockResolvedValueOnce([{ month: '2025-11', digest: 'deadbeef', sig: 'cafebabe', coverage_pct: '99.0', notes: '' }]);
    await request(app).get('/api/v1/proofs/revenue_digest?month=2025-11').expect(200);
    expect(insertBatch).not.toHaveBeenCalled();
  });
});
