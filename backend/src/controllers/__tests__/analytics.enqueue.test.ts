import * as analyticsController from '../../controllers/analytics.controller';

// Mock config flag to enable queueing
jest.mock('../../config/index', () => ({
  __esModule: true,
  default: {
    useRedisStreamsForAnalytics: true,
  },
}));

// Mock queueManager to be ready and accept adds
const addMock = jest.fn(async () => {});
jest.mock('../../queues/queueManager', () => ({
  QueueName: { ANALYTICS_INGEST: 'analytics_ingest' },
  queueManager: {
    isReady: () => true,
    getQueue: () => ({ add: addMock }),
  },
}));

// Mock analyticsService to ensure fallback path is not hit when enqueued
jest.mock('../../services/analyticsService', () => ({
  __esModule: true,
  default: {
     recordImpressions: jest.fn(async () => {}),
     recordClicks: jest.fn(async () => {}),
     recordRevenue: jest.fn(async () => {}),
     getBufferStats: jest.fn(async () => ({ buffered: 0 })),
  },
}));

function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.payload = null as any;
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (p: any) => { res.payload = p; return res; };
  return res;
}

describe('Analytics ingestion producers (enqueue mode)', () => {
  beforeEach(() => addMock.mockClear());

  it('returns 202 and enqueues impressions when flag enabled and queue ready', async () => {
    const req: any = { body: [{ id: 1 }], user: { publisherId: 'pub1' } };
    const res = mockRes();
    await analyticsController.recordImpressions(req, res as any, (() => {}) as any);
    expect(res.statusCode).toBe(202);
    expect(res.payload?.success).toBe(true);
    expect(res.payload?.queued).toBe(1);
    expect(addMock).toHaveBeenCalledTimes(1);
  });

  it('validates input and returns 400 on missing events', async () => {
    const req: any = { body: {}, user: { publisherId: 'pub1' } };
    const res = mockRes();
    const next = jest.fn();
    await analyticsController.recordImpressions(req, res as any, next as any);
    // Controller throws AppError → handled by next
    expect(next).toHaveBeenCalled();
  });
});
