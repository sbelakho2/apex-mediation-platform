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
  executeQuery: jest.fn(async (query: string) => {
    const q = String(query).toLowerCase();
    if (q.includes('select round(sum(amount)')) {
      return [{ amount: '12.340000' }];
    }
    return [];
  }),
  insertBatch: jest.fn(async () => {}),
}));

import vraRoutes from '../../routes/vra.routes';

describe('VRA Disputes — non-shadow write path', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    process.env.VRA_SHADOW_ONLY = 'false';
    app.use('/api/v1', vraRoutes);
  });

  it('creates a dispute (201) and writes to recon_disputes when shadow is disabled', async () => {
    const { insertBatch } = jest.requireMock('../../utils/clickhouse');
    const res = await request(app)
      .post('/api/v1/recon/disputes')
      .send({ delta_ids: ['ev1','ev2'], network: 'unity', contact: 'ops@example.com' })
      .expect(201);

    // Response shape
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('dispute_id');
    expect(res.body.data).toHaveProperty('amount');
    expect(res.body.data).toHaveProperty('status', 'draft');
    expect(res.body.data).toHaveProperty('evidence_uri');
    // Default storage is in-memory → mem:// URI expected
    expect(String(res.body.data.evidence_uri)).toContain('mem://');

    // Insert called with recon_disputes
    expect(insertBatch).toHaveBeenCalled();
    const args = (insertBatch as jest.Mock).mock.calls[0];
    expect(args[0]).toBe('recon_disputes');
    const row = args[1][0];
    expect(row).toHaveProperty('dispute_id');
    expect(row).toHaveProperty('network', 'unity');
    expect(row).toHaveProperty('status', 'draft');
  });
});
