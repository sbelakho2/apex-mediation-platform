import request from 'supertest';
import express from 'express';

// NOTE: In this test we intentionally DO NOT mock the auth middleware
// so we can assert that VRA routes require authentication.

import vraRoutes from '../../routes/vra.routes';

describe('VRA Routes — authentication required', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    process.env.VRA_ENABLED = 'true';
    // Mount without auth mocks to trigger real authenticate middleware behavior
    app.use('/api/v1', vraRoutes);
  });

  it('returns 401 when unauthenticated for /recon/overview', async () => {
    // Expect 401 Unauthorized due to missing auth context
    await request(app).get('/api/v1/recon/overview').expect(401);
  });

  it('returns 401 when unauthenticated for /recon/deltas (JSON)', async () => {
    await request(app).get('/api/v1/recon/deltas').expect(401);
  });

  it('returns 401 when unauthenticated for /recon/deltas.csv (CSV)', async () => {
    await request(app).get('/api/v1/recon/deltas.csv').expect(401);
  });

  it('returns 401 when unauthenticated for /proofs/revenue_digest', async () => {
    await request(app).get('/api/v1/proofs/revenue_digest?month=2025-11').expect(401);
  });
});
