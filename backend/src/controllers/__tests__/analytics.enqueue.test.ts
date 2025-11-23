import * as analyticsController from '../../controllers/analytics.controller';
import analyticsService from '../../services/analyticsService';

// Mock config flag to enable queueing
jest.mock('../../config/index', () => ({
  __esModule: true,
  default: {
    useRedisStreamsForAnalytics: true,
  },
}));

// Mock analyticsService to observe direct writes
jest.mock('../../services/analyticsService', () => ({
  __esModule: true,
  default: {
     recordImpressions: jest.fn(async () => {}),
     recordClicks: jest.fn(async () => {}),
     recordRevenue: jest.fn(async () => {}),
     getBufferStats: jest.fn(async () => ({ buffered: 0 })),
  },
}));
const mockedAnalyticsService = jest.mocked(analyticsService);

function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.payload = null as any;
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (p: any) => { res.payload = p; return res; };
  return res;
}

describe('Analytics ingestion producers (enqueue mode)', () => {
  const validEvent = {
    event_id: '11111111-1111-1111-1111-111111111111',
    timestamp: new Date().toISOString(),
    publisher_id: '22222222-2222-2222-2222-222222222222',
    app_id: '33333333-3333-3333-3333-333333333333',
    placement_id: '44444444-4444-4444-4444-444444444444',
    adapter_id: '55555555-5555-5555-5555-555555555555',
    adapter_name: 'mock-adapter',
    ad_unit_id: 'unit-1',
    ad_format: 'interstitial' as const,
    country_code: 'US',
    device_type: 'phone' as const,
    os: 'ios' as const,
    os_version: '17.0',
    app_version: '1.0.0',
    sdk_version: '2.0.0',
    session_id: '66666666-6666-6666-6666-666666666666',
    user_id: 'user-1',
    request_id: '77777777-7777-7777-7777-777777777777',
    bid_price_usd: 0.5,
    ecpm_usd: 1.2,
    latency_ms: 120,
    is_test_mode: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 202 and enqueues impressions when flag enabled and queue ready', async () => {
    const req: any = { body: { events: [validEvent] }, user: { publisherId: 'pub1' } };
    const res = mockRes();
    await analyticsController.recordImpressions(req, res as any, (() => {}) as any);
    expect(res.statusCode).toBe(202);
    expect(res.payload?.success).toBe(true);
    expect(res.payload?.count).toBe(1);
    expect(mockedAnalyticsService.recordImpressions).toHaveBeenCalledWith([validEvent]);
  });

  it('validates input and returns 400 on missing events', async () => {
    const req: any = { body: {}, user: { publisherId: 'pub1' } };
    const res = mockRes();
    await analyticsController.recordImpressions(req, res as any, (() => {}) as any);
    expect(res.statusCode).toBe(400);
    expect(res.payload?.success).toBe(false);
  });
});
