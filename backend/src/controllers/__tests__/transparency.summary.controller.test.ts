import request from 'supertest';
import type { Application, NextFunction, Request, Response } from 'express';

// Mock auth to inject a default user unless overridden per-test
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req: Request & { user?: any }, _res: Response, next: NextFunction) => {
    if (!('noauth' in req.headers)) {
      req.user = { publisherId: 'pub-1', userId: 'user-1' };
    }
    next();
  }),
}));

// Mock ClickHouse executeQuery
const executeQueryMock = jest.fn();
jest.mock('../../utils/clickhouse', () => ({
  executeQuery: (q: string, params?: Record<string, unknown>) => executeQueryMock(q, params),
}));

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
    executeQueryMock.mockImplementationOnce(async () => [{ total_sampled: 42 }] );
    // Query 2: winners by source
    executeQueryMock.mockImplementationOnce(async () => [
      { source: 'alpha', count: 10 },
      { source: 'beta', count: 5 },
    ]);
    // Query 3: averages
    executeQueryMock.mockImplementationOnce(async () => [{ avg_fee_bp: 150, publisher_share_avg: 0.985 }] );

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
    expect(executeQueryMock).toHaveBeenCalledTimes(3);
  });
});
