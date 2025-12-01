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

describe('VRA Controllers — query validation and non-shadow dispute path', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    delete process.env.VRA_SHADOW_ONLY;
    app.use('/api/v1', vraRoutes);
  });

  it('rejects invalid min_conf (>1)', async () => {
    const res = await request(app)
      .get('/api/v1/recon/deltas?min_conf=1.5')
      .expect(400);
    expect(res.body).toHaveProperty('success', false);
    expect(String(res.body.error || '')).toMatch(/min_conf/i);
  });

  it('rejects invalid kind', async () => {
    const res = await request(app)
      .get('/api/v1/recon/deltas?kind=not_a_kind')
      .expect(400);
    expect(res.body).toHaveProperty('success', false);
    expect(String(res.body.error || '')).toMatch(/Invalid kind/);
  });

  it('rejects invalid page and page_size', async () => {
    await request(app).get('/api/v1/recon/deltas?page=0').expect(400);
    await request(app).get('/api/v1/recon/deltas?page_size=0').expect(400);
    await request(app).get('/api/v1/recon/deltas?page_size=9999').expect(400);
  });

  it('GET /recon/overview rejects invalid from/to timestamps (400)', async () => {
    const res = await request(app)
      .get('/api/v1/recon/overview?from=not-a-date&to=also-bad')
      .expect(400);
    expect(res.body).toHaveProperty('success', false);
    expect(String(res.body.error || '')).toMatch(/Invalid from\/to/i);
  });

  it('GET /recon/deltas rejects inverted window (from > to) with 400', async () => {
    const from = '2025-11-03T00:00:00Z';
    const to = '2025-11-02T00:00:00Z';
    const res = await request(app)
      .get(`/api/v1/recon/deltas?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .expect(400);
    expect(res.body).toHaveProperty('success', false);
    expect(String(res.body.error || '')).toMatch(/from must be <= to/i);
  });

  it('GET /recon/deltas.csv rejects inverted window (from > to) with 400', async () => {
    const from = '2025-11-03T00:00:00Z';
    const to = '2025-11-02T00:00:00Z';
    await request(app)
      .get(`/api/v1/recon/deltas.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .expect(400);
  });

  it('GET /recon/overview rejects inverted window (from > to) with 400', async () => {
    const from = '2025-11-03T00:00:00Z';
    const to = '2025-11-02T00:00:00Z';
    await request(app)
      .get(`/api/v1/recon/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .expect(400);
  });

  it('sets helpful CSV filename with provided window', async () => {
    const from = '2025-11-01T00:00:00Z';
    const to = '2025-11-02T00:00:00Z';
    const res = await request(app)
      .get(`/api/v1/recon/deltas.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .expect(200)
      .expect('Content-Type', /text\/csv/);
    const disp = String(res.header['content-disposition'] || '');
    expect(disp).toMatch(/attachment; filename=/i);
    expect(disp).toContain('_2025-11-01_to_2025-11-02_');
  });

  it('creates a dispute (201) and writes when shadow mode is disabled', async () => {
    process.env.VRA_SHADOW_ONLY = 'false';
    const { query, insertMany } = jest.requireMock('../../utils/postgres');
    (insertMany as jest.Mock).mockClear();
    (query as jest.Mock).mockResolvedValueOnce({ rows: [{ amount: '0' }] });

    const res = await request(app)
      .post('/api/v1/recon/disputes')
      .send({ delta_ids: ['ev1', 'ev2'], network: 'unity', contact: 'ops@example.com' })
      .expect(201);
    expect(res.body).toHaveProperty('success', true);
    // Ensure a write attempt to recon_disputes occurred
    expect(insertMany).toHaveBeenCalled();
    const args = (insertMany as jest.Mock).mock.calls[0] || [];
    expect(args[0]).toBe('recon_disputes');
  });
});
