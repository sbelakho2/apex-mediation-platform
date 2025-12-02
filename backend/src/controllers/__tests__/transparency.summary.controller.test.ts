import request from 'supertest';
import type { Application, NextFunction, Request, Response } from 'express';

// Mock auth to inject a default user unless overridden per-test
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((_req: Request & { user?: any }, _res: Response, next: NextFunction) => {
    if (!('noauth' in _req.headers)) {
      _req.user = { publisherId: 'pub-1', userId: 'user-1' };
    }
    next();
  }),
  authorize: jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

// Mock Postgres query helper
const queryMock = jest.fn();
jest.mock('../../utils/postgres', () => ({
  query: (q: string, params?: ReadonlyArray<unknown>) => queryMock(q, params),
}));

const asResult = (rows: any[]) => ({ rows });

import { createTestApp } from '../../__tests__/helpers/testApp';

function resetEnv() {
  process.env.TRANSPARENCY_API_ENABLED = 'true';
}

describe('Transparency Controller — summary API', () => {
  let app: Application;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetEnv();
  });

  it('GET /transparency/summary/auctions → 503 when feature disabled', async () => {
    process.env.TRANSPARENCY_API_ENABLED = 'false';
    await request(app)
      .get('/api/v1/transparency/summary/auctions')
      .set('Authorization', 'Bearer test')
      .expect(503);
  });

  it('GET /transparency/summary/auctions → 401 when unauthenticated', async () => {
    await request(app)
      .get('/api/v1/transparency/summary/auctions')
      .set('noauth', '1')
      .expect(401);
  });

  it('GET /transparency/summary/auctions → returns expected shape', async () => {
    // Query 1: total sampled
    queryMock.mockImplementationOnce(async () => asResult([{ total_sampled: 42 }]));
    // Query 2: winners by source
    queryMock.mockImplementationOnce(async () => asResult([
      { source: 'alpha', count: 10 },
      { source: 'beta', count: 5 },
    ]));
    // Query 3: averages
    queryMock.mockImplementationOnce(async () => asResult([{ avg_fee_bp: 150, publisher_share_avg: 0.985 }]));

    const res = await request(app)
      .get('/api/v1/transparency/summary/auctions')
      .set('Authorization', 'Bearer test')
      .expect(200);

    expect(res.body).toMatchObject({
      total_sampled: 42,
      avg_fee_bp: 150,
      publisher_share_avg: 0.985,
    });
    expect(Array.isArray(res.body.winners_by_source)).toBe(true);
    expect(res.body.winners_by_source).toEqual(
      expect.arrayContaining([
        { source: 'alpha', count: 10 },
        { source: 'beta', count: 5 },
      ])
    );
    // Ensure executeQuery was called thrice
    expect(queryMock).toHaveBeenCalledTimes(3);
  });
});
