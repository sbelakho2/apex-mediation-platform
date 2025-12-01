import request from 'supertest';
import express from 'express';

// Mock auth to inject a user and bypass real auth
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    (req as any).user = { userId: 'u1', publisherId: 'pub-1' };
    next();
  }),
}));

jest.mock('../../utils/postgres');
jest.mock('../../services/vra/vraService');

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
    const { query, insertMany } = jest.requireMock('../../utils/postgres');
    (query as jest.Mock).mockResolvedValueOnce({ rows: [{ amount: '12.340000' }] });

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
    expect(insertMany).toHaveBeenCalled();
    const args = (insertMany as jest.Mock).mock.calls[0];
    expect(args[0]).toBe('recon_disputes');
    const columns = args[1];
    const rows = args[2];
    const payload = Object.fromEntries(columns.map((col: string, idx: number) => [col, rows[0][idx]]));
    expect(payload).toHaveProperty('dispute_id');
    expect(payload).toHaveProperty('network', 'unity');
    expect(payload).toHaveProperty('status', 'draft');
  });
});
