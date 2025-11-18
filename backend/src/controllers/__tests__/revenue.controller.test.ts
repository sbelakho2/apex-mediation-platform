import request from 'supertest';
import { Application } from 'express';
import { createTestApp } from '../../__tests__/helpers/testApp';

describe('Revenue Controller', () => {
  let app: Application;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    app = createTestApp();
  });

  test('prefers Idempotency-Key header over body/query', async () => {
    const res = await request(app)
      .get('/api/v1/revenue/summary?idempotencyKey=fromQuery')
      .set('Idempotency-Key', 'fromHeader')
      .send({ idempotencyKey: 'fromBody' });

    expect(res.status).toBe(200);
    // Header should be echoed back with the header value
    expect(res.headers['idempotency-key']).toBe('fromHeader');
    // Response meta should include the same
    expect(res.body?.meta?.idempotencyKey).toBe('fromHeader');
  });

  test('timeseries rejects invalid granularity', async () => {
    const res = await request(app)
      .get('/api/v1/revenue/timeseries?granularity=month');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false });
  });

  test('summary rejects invalid date ranges', async () => {
    // summary uses default window via resolveDateRange but accepts query dates too through controller guard
    const res = await request(app)
      .get('/api/v1/revenue/summary?startDate=2025-12-31&endDate=2025-01-01');
    expect(res.status).toBe(400);
    expect(res.body?.error || res.body?.message).toBeTruthy();
  });
});
