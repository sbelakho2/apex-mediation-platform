import request from 'supertest';
import { Application } from 'express';
import { createTestApp } from '../../__tests__/helpers/testApp';

jest.mock('../../utils/postgres', () => {
  const query = jest.fn();
  return {
    __esModule: true,
    default: { query },
    query,
    getClient: jest.fn(),
  };
});

const postgresMock = jest.requireMock('../../utils/postgres');
const mockPoolQuery = postgresMock.default.query as jest.Mock;

describe('Dashboard Controller', () => {
  let app: Application;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    app = createTestApp();
  });

  beforeEach(() => {
    mockPoolQuery.mockReset();
    mockPoolQuery.mockImplementation(async (sql: string) => {
      if (/GROUP BY ts/i.test(sql)) {
        return {
          rows: [
            {
              ts: new Date('2025-01-01T00:00:00Z'),
              revenue: 0,
              impressions: 0,
              clicks: 0,
            },
          ],
        } as any;
      }
      return {
        rows: [
          {
            total_revenue: 0,
            total_impressions: 0,
            total_clicks: 0,
          },
        ],
      } as any;
    });
  });

  test('overview rejects invalid dates', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/overview?startDate=bad-date&endDate=2025-01-01');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false });
  });

  test('overview returns safe defaults on valid input', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/overview?page=1&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(res.body?.data?.tiles).toBeDefined();
    expect(typeof res.body?.data?.tiles?.ctr).toBe('number');
    expect(typeof res.body?.data?.tiles?.rpm).toBe('number');
  });

  test('kpis rejects invalid granularity', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/kpis?granularity=month');
    expect(res.status).toBe(400);
  });

  test('kpis returns empty array with meta on valid request', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/kpis?granularity=day&days=7');
    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(Array.isArray(res.body?.data)).toBe(true);
  });
});
